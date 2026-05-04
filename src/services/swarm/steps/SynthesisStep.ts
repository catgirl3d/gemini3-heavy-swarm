import { Content } from '@google/genai';
import { StepContext, StepId, STEPS } from '@/types/steps';
import { AgentState, Source, Work } from '@/types';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { BaseStep } from './BaseStep';
import { getStepResults } from '@/utils/swarm/workHelpers';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';
import { updateAgentStatus } from '@/utils/swarm/statusHelpers';
import { formatSystemInstruction, formatDrafts, buildSynthesisContext } from '@/utils/swarm/promptHelpers';
import { createFirstTextJumpTracker } from '@/utils/swarm/jumpHelper';

export class SynthesisStep extends BaseStep {
  id: StepId = STEPS.SYNTHESIS;
  name = getStepConfig(STEPS.SYNTHESIS).name;
  description = getStepConfig(STEPS.SYNTHESIS).description;
  ui = {
    visibleInModal: false, // Synthesis result is the main message text, not shown in "Show Work"
    regenerateLabel: 'Regenerate Final Answer',
    allowPause: false
  };

  async execute(context: StepContext): Promise<{ text: string; sources?: Source[] }> {
    const { ai, settings, history, userInput, image, imageFile, work, onMessageUpdate, signal, messageId } = context;

    // Initialize logger early so it's available for all logging
    const logger = new Logger(this.id, settings.debugMode);

    // Ensure we have refined drafts
    const refinedDrafts = getStepResults(work, STEPS.REFINEMENT);
    
    if (refinedDrafts.length === 0) {
      throw new Error('Cannot run synthesis step without refined drafts');
    }
    
    // LOG: What we got from work.results
    if (settings.debugMode) {
      logger.debug('=== SYNTHESIS EXECUTE - REFINED DRAFTS FROM WORK ===');
      logger.debug('work.results[STEPS.REFINEMENT]:', work.results?.[STEPS.REFINEMENT]);
      logger.debug('refinedDrafts (processed):', refinedDrafts.map((text, i) => ({
        index: i,
        isNull: text === null,
        isEmpty: !text || text.length === 0,
        length: text?.length || 0,
        preview: text ? text.substring(0, 100) : 'null/empty'
      })));
    }

    // Initialize agent states - show the drafters (Initial step agents) who created the content
    // We use common state utils to prepare the initial state for the UI
    const refinedAgents = this.createAgentStates(settings.numAgents, settings, {
      stepId: STEPS.INITIAL,
      status: 'done',
      statusLabel: getStepConfig(STEPS.INITIAL).labels.done,
      messageId
    });

    // Check if this is a regeneration after error
    const existingSynthesisResult = work.results?.[STEPS.SYNTHESIS];
    const hadError = typeof existingSynthesisResult === 'object' && existingSynthesisResult?.error === true;
    
    const config = getStepConfig(this.id);
    
    // Persistent error count check for synthesis
    const errorCountKey = this.getErrorCountKey(undefined);
    const errorCountData = work.results?.[errorCountKey];
    const errorCount = Array.isArray(errorCountData) ? (errorCountData[0] || 0) : (errorCountData as number || 0);
    const isSimulatingError = settings.simulateSynthesisError !== 'none' && errorCount < settings.simulateSynthesisErrorAttempts;
    const isRetrying = hadError || isSimulatingError;

    const synthesizerState: AgentState = {
      id: `${messageId}-synthesizer_agent`,
      name: 'Synthesizer Agent',
      // Keep error status if regenerating or simulating error, otherwise start as working
      // so progress bar moves immediately. Auto-collapse is now handled by content check in ShowWork.
      status: isRetrying ? 'error' : 'working',
      label: isRetrying ? 'Retrying synthesis...' : config.labels.working,
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
      messageId
    };
    
    let currentAgentStates: AgentState[] = [...refinedAgents, synthesizerState];
    
    // Initialize generic storage
    this.ensureResults(work);
    
    logger.debug('Starting synthesis', { numRefinedDrafts: refinedDrafts.length, isRegeneration: hadError });
    
    // Initialize ALL agents in the store
    refinedAgents.forEach((s, i) => {
      updateAgentStatus(STEPS.INITIAL, i, 'done', messageId, getStepConfig(STEPS.INITIAL).labels.done, s.name);
    });
    updateAgentStatus(STEPS.SYNTHESIS, 0, synthesizerState.status, messageId, synthesizerState.label, synthesizerState.name);

    try {
      const { systemInstruction, synthesizerTurn, mainChatHistory } = this.prepareSynthesis(context, refinedDrafts);

      logger.debug('Starting model stream');
      
      // LOG: What we're actually sending to the model
      const contentsForModel = [...mainChatHistory, synthesizerTurn];
      if (settings.debugMode) {
        logger.debug('=== CONTENTS SENT TO MODEL ===');
        logger.debug('Total messages:', contentsForModel.length);
        logger.debug('Last message (synthesizerTurn):', {
          role: synthesizerTurn.role,
          partsCount: synthesizerTurn.parts.length,
          parts: synthesizerTurn.parts.map(part => ({
            hasText: !!part.text,
            textLength: part.text?.length || 0,
            textSnippet: part.text ? part.text.substring(0, 300) : 'no text'
          }))
        });
      }

      // Create jump tracker to manage first-text-chunk behavior
      const jumpTracker = createFirstTextJumpTracker(context.onSynthesisJump);
      
      const { text: finalResponseText, groundingChunks } = await this.runModelStream(
        {
          ai, settings, model: this.getStepModel(context),
          contents: [...mainChatHistory, synthesizerTurn],
          systemInstruction,
          tools: settings.useSearchInSynthesis ? [{ googleSearch: {} }] : undefined,
          signal,
          agentIndex: 0, // Synthesis always uses agent index 0
          simulateError: settings.simulateSynthesisError,
          simulateErrorAttempts: settings.simulateSynthesisErrorAttempts,
          work: context.work
        },
        {
          onChunk: (text, thought, usage) => {
            // Check if this is the first text chunk
            const shouldTriggerJump = jumpTracker.processChunk(text);
            
            if (shouldTriggerJump) {
              // Transition to working status on first text chunk (initiates Synthesis Jump)
              currentAgentStates = this.updateAgentStateById(currentAgentStates, `${messageId}-synthesizer_agent`, {
                status: 'working',
                label: config.labels.working,
                stepId: STEPS.SYNTHESIS,
                messageId
              });
              
              updateAgentStatus(STEPS.SYNTHESIS, 0, 'working', messageId, config.labels.working);
            }

            // CRITICAL: Update store with synthesis text BEFORE triggering jump
            // ShowWork's useEffect needs both 'working' status AND synthesisText to collapse cards
            this.handleStreamChunk(context, -1, text, thought, usage, {
              isFirstChunk: false, // We handle first chunk logic via jumpTracker
              streamToMessage: true,
              agentStates: currentAgentStates,
              statusMsg: config.progressMsg
            });
            
            // Trigger jump AFTER store is updated so synthesisText is available
            if (shouldTriggerJump) {
              /**
               * SYNTHESIS JUMP BEHAVIOR
               * When first TEXT chunk arrives, we trigger onSynthesisJump to hide loading indicators.
               * Card collapse is handled by ShowWork observing both 'working' status AND
               * the presence of actual content (synthesisText).
               * 
               * Note: We intentionally wait for first TEXT (not thought/usage) because:
               * 1. Reasoning models may send thought chunks before any text
               * 2. We want the jump to happen when user-visible content starts appearing
               */
              jumpTracker.executeJump();
            }
          },
          onRetry: (attempt) => {
            // Reset jump tracker so it can fire again on the next successful attempt
            jumpTracker.reset();
            
            // Use centralized retry handler from BaseStep (handles status and LoadingIndicator)
            currentAgentStates = this.handleRetryProgress(context, 0, attempt, currentAgentStates);
          }
        }
      );

      const sources = this.extractSources(groundingChunks);

      logger.debug('Synthesis complete', { 
        textLength: finalResponseText.length, 
        sourcesCount: sources?.length || 0 
      });

      // Update generic results map (already an object due to handleStreamChunk, but ensuring it here)
      work.results[STEPS.SYNTHESIS] = { text: finalResponseText, sources };

      // Mark synthesizer as completed
      currentAgentStates = this.updateAgentStateById(currentAgentStates, `${messageId}-synthesizer_agent`, {
        status: 'done',
        label: config.labels.done,
        stepId: STEPS.SYNTHESIS,
        messageId
      });
      
      updateAgentStatus(STEPS.SYNTHESIS, 0, 'done', messageId, config.labels.done);

      return { text: finalResponseText, sources };
    } catch (error) {
      logger.debug('SYNTHESIS FAILED', { 
        error: error instanceof Error ? error.message : String(error),
        thoughtLength: (work.results?.[`${STEPS.SYNTHESIS}_thought`] as string)?.length || 0
      });
      logger.debug('SYNTHESIS ERROR (will be logged at top level)', { error });
      
      // Determine appropriate error label using BaseStep utility
      const errorLabel = this.getErrorLabel(error, config.labels.error);
      const errorMessage = this.getFriendlyErrorMessage(error);
      
      // Save error info for UI display in ShowWork card, but don't pollute the main text
      // Preservation: if we had some partial text before error, keep it.
      const currentText = (work.results[STEPS.SYNTHESIS] as any)?.text || '';
      
      work.results[STEPS.SYNTHESIS] = { 
        text: currentText, // Don't add [System: Synthesis failed...] here
        error: true,
        errorMessage 
      };
      
      currentAgentStates = this.updateAgentStateById(currentAgentStates, `${messageId}-synthesizer_agent`, {
        status: 'error',
        label: errorLabel,
        stepId: STEPS.SYNTHESIS,
        messageId
      });
      
      updateAgentStatus(STEPS.SYNTHESIS, 0, 'error', messageId, errorLabel);
      
      // SYNC: Ensure work results (including error flag) are updated in the global store
      useAgentStore.getState().setCurrentWork({ ...work });
      
      throw error;
    }
  }

  async regenerate(context: StepContext, _agentIndex: number, agentStates: AgentState[]): Promise<{ text: string; sources?: Source[]; work: Work }> {
    const refinedDrafts = getStepResults(context.work, STEPS.REFINEMENT);
    const { systemInstruction, synthesizerTurn, mainChatHistory } = this.prepareSynthesis(context, refinedDrafts);
    const { settings } = context;
    return this.runSynthesisRegeneration(
      context,
      { systemInstruction, userTurn: synthesizerTurn, mainChatHistory },
      agentStates,
      settings.useSearchInSynthesis ? [{ googleSearch: {} }] : [], // Use empty array to override BaseStep default
      settings.simulateSynthesisError,
      settings.simulateSynthesisErrorAttempts
    );
  }

  private prepareSynthesis(context: StepContext, refinedDrafts: string[]) {
    const { settings, history, userInput, image, imageFile, work } = context;
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    const systemInstruction = formatSystemInstruction(activeProfile.synthesizerInstruction);

    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    const initialDrafts = getStepResults(work, STEPS.INITIAL);

    const logger = new Logger(this.id, settings.debugMode);
    
    // LOG: Input data
    if (settings.debugMode) {
      logger.debug('=== PREPARE SYNTHESIS - INPUT DATA ===');
      logger.debug('refinedDrafts:', refinedDrafts.map((text, i) => ({
        index: i,
        isEmpty: !text || text.length === 0,
        length: text?.length || 0,
        preview: text ? text.substring(0, 100) : 'null/empty'
      })));
      logger.debug('initialDrafts:', initialDrafts.map((text, i) => ({
        index: i,
        isEmpty: !text || text.length === 0,
        length: text?.length || 0,
        preview: text ? text.substring(0, 100) : 'null/empty'
      })));
    }

    // Prepare drafts for synthesis (fallback to initial if refined is empty)
    const draftsForSynthesis = refinedDrafts.map((refinedText: string, i: number) => {
      const useFallback = !refinedText || refinedText.length === 0;
      const result = useFallback ? (initialDrafts[i] || '') : refinedText;
      
      // LOG: Fallback decisions
      if (settings.debugMode) {
        if (useFallback) {
          logger.debug(`Agent ${i}: Using FALLBACK (refined is empty), source: ${initialDrafts[i] ? 'INITIAL' : 'EMPTY'}`, {
            preview: result ? result.substring(0, 100) : 'empty'
          });
        } else {
          logger.debug(`Agent ${i}: Using REFINED draft`, {
            length: refinedText.length,
            preview: refinedText.substring(0, 100)
          });
        }
      }
      
      return result;
    });

    // LOG: Final drafts
    if (settings.debugMode) {
      logger.debug('draftsForSynthesis:', draftsForSynthesis.map((text, i) => ({
        index: i,
        length: text?.length || 0,
        preview: text ? text.substring(0, 100) : 'empty'
      })));
    }

    // Format agent drafts using helper
    const agentDrafts = formatDrafts(draftsForSynthesis);
    
    // LOG: Formatted drafts (what actually goes to the model)
    if (settings.debugMode) {
      logger.debug('=== FORMATTED AGENT DRAFTS (PAYLOAD) ===');
      logger.debug(agentDrafts);
    }

    // Build synthesis context using helper
    const synthesizerContext = buildSynthesisContext({
      userInput,
      agentDrafts,
      useSearch: settings.useSearchInSynthesis
    });

    const synthesizerTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${synthesizerContext}`}] };

    // LOG: What we're saving to debug info
    if (settings.debugMode) {
      logger.debug('=== SAVING TO DEBUG INFO ===');
      logger.debug('synthesizerTurn.parts:', synthesizerTurn.parts.map(part => ({
        hasText: !!part.text,
        textLength: part.text?.length || 0,
        textPreview: part.text ? part.text.substring(0, 200) : 'no text'
      })));
    }

    // Capture debug info
    this.ensureDebugInfo(work, STEPS.SYNTHESIS, false);
    work.debugInfo[STEPS.SYNTHESIS] = {
        systemInstruction,
        history: mainChatHistory,
        userTurn: synthesizerTurn
    };

    return { systemInstruction, synthesizerTurn, mainChatHistory };
  }
}
