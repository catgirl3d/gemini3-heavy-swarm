import { Content } from '@google/genai';
import { StepContext, StepId, STEPS } from '@/types/steps';
import { AgentState, Source } from '@/types';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { BaseStep } from './BaseStep';
import { getStepResults } from '@/utils/swarm/workHelpers';
import { hasStepContentError, getStepConfig } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';
import { updateAgentStatus } from '@/utils/swarm/statusHelpers';

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

    // Ensure we have refined drafts
    const refinedDrafts = getStepResults(work, STEPS.REFINEMENT);
    
    if (refinedDrafts.length === 0) {
      throw new Error('Cannot run synthesis step without refined drafts');
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
    const synthesizerState: AgentState = {
      id: `${messageId}-synthesizer_agent`,
      name: 'Synthesizer Agent',
      // Keep error status if regenerating, otherwise start as waiting
      // until first chunk arrives to prevent premature card collapse.
      status: hadError ? 'error' : 'waiting',
      label: hadError ? 'Retrying synthesis...' : config.labels.waiting,
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
      messageId
    };
    
    let currentAgentStates: AgentState[] = [...refinedAgents, synthesizerState];
    
    // Initialize generic storage
    this.ensureResults(work);
    
    const logger = new Logger(this.id, settings.debugMode);
    
    logger.debug('Starting synthesis', { numRefinedDrafts: refinedDrafts.length, isRegeneration: hadError });
    
    // Initialize ALL agents in the store
    refinedAgents.forEach((s, i) => {
      updateAgentStatus(STEPS.INITIAL, i, 'done', messageId, getStepConfig(STEPS.INITIAL).labels.done, s.name);
    });
    updateAgentStatus(STEPS.SYNTHESIS, 0, synthesizerState.status, messageId, synthesizerState.label, synthesizerState.name);

    try {
      const { systemInstruction, synthesizerTurn, mainChatHistory } = this.prepareSynthesis(context, refinedDrafts);

      logger.debug('Starting model stream');

      let isFirstTextChunk = true;
      const { text: finalResponseText, groundingChunks } = await this.runModelStream(
        {
          ai, settings, model: settings.model,
          contents: [...mainChatHistory, synthesizerTurn],
          systemInstruction,
          tools: [{googleSearch: {}}],
          signal,
          // Only simulate errors on first execution, not on regeneration
          simulateError: hadError ? undefined : settings.simulateSynthesisError
        },
        {
          onChunk: (text, thought, usage) => {
            if (text.length > 0 && isFirstTextChunk) {
              // Transition to working status on first text chunk (initiates Synthesis Jump)
              currentAgentStates = this.updateAgentStateById(currentAgentStates, `${messageId}-synthesizer_agent`, {
                status: 'working',
                label: config.labels.working,
                stepId: STEPS.SYNTHESIS,
                messageId
              });
              
              updateAgentStatus(STEPS.SYNTHESIS, 0, 'working', messageId, config.labels.working);
            }

            this.handleStreamChunk(context, -1, text, thought, usage, {
              isFirstChunk: isFirstTextChunk,
              streamToMessage: true,
              agentStates: currentAgentStates,
              statusMsg: config.progressMsg
            });
            
            if (text.length > 0) isFirstTextChunk = false;
          },
          onRetry: (attempt) => {
            // Reset jump trigger flag so it can fire again on the next successful attempt
            isFirstTextChunk = true;
            
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
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
      
      throw error;
    }
  }

  async regenerate(context: StepContext, _agentIndex: number, _agentStates: AgentState[]): Promise<{ text: string; sources?: Source[] }> {
    return this.execute(context);
  }

  private prepareSynthesis(context: StepContext, refinedDrafts: string[]) {
    const { settings, history, userInput, image, imageFile, work } = context;
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.synthesizerInstruction}</mission>\n</system_instruction>`;

    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    const initialDrafts = getStepResults(work, STEPS.INITIAL);

    const agentDrafts = refinedDrafts
      .map((refinedText: string, i: number) => {
        // Standard fallback: if refinement failed, use the initial draft for the SAME agent
        const text = hasStepContentError(refinedText, STEPS.REFINEMENT)
          ? (initialDrafts[i] || '')
          : refinedText;
        
        return { text, id: i + 1 };
      })
      // Filter out any remaining system errors or empty strings
      .filter((a) => a.text && !hasStepContentError(a.text, STEPS.INITIAL))
      .map((a) => `    <draft id="agent_${a.id}">\n${a.text}\n    </draft>`)
      .join('\n\n');

    const synthesizerContext = `
# INPUT DATA
<context_data>
<original_query>
${userInput || "(See attached image/content)"}
</original_query>

<agent_drafts>
${agentDrafts}
</agent_drafts>
</context_data>

# YOUR TASK
<instruction>
As defined in <mission> synthesize the best single, final answer from <agent_drafts> to address <original_query>.
1. Resolve any contradictions.
2. [CRITICAL] Combine the best insights.
3. Structure the response clearly.
4. [CRITICAL] You MUST ALWAYS use the googleSearch tool to verify facts and find additional information if needed!
</instruction>`;

    const synthesizerTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${synthesizerContext}`}] };

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
