import { Content } from '@google/genai';
import { StepContext, StepId } from '@/types/steps';
import { AgentState, Source } from '@/types';
import { prepareGeminiContent } from '@/services/contentUtils';
import { BaseStep } from '@/services/steps/BaseStep';
import { getStepResults } from '@/utils/workHelpers';
import { getStepConfig } from '@/utils/stepConfig';
import { Logger } from '@/utils/logger';

export class SynthesisStep extends BaseStep {
  id: StepId = 'synthesis_step';
  name = getStepConfig('synthesis_step').name;
  description = getStepConfig('synthesis_step').description;
  ui = {
    visibleInModal: false, // Synthesis result is the main message text, not shown in "Show Work"
    regenerateLabel: 'Regenerate Final Answer',
    allowPause: false
  };

  async execute(context: StepContext): Promise<{ text: string; sources?: Source[] }> {
    const { ai, settings, history, userInput, image, imageFile, work, onProgress, onMessageUpdate, signal } = context;

    // Ensure we have refined drafts
    const refinedDrafts = getStepResults(work, 'refinement_step');
    
    if (refinedDrafts.length === 0) {
      throw new Error('Cannot run synthesis step without refined drafts');
    }

    // Initialize agent states - these agents already completed refinement
    // We use common state utils to prepare the initial state for the UI
    const numAgents = settings.numAgents;
    const refinedAgents = this.createAgentStates(numAgents, settings, {
      stepId: 'refinement_step',
      status: 'done',
      statusLabel: getStepConfig('refinement_step').labels.done
    });

    // Check if this is a regeneration after error
    const existingSynthesisResult = work.results?.['synthesis_step'];
    const hadError = typeof existingSynthesisResult === 'object' && existingSynthesisResult?.error === true;
    
    const config = getStepConfig(this.id);
    const synthesizerState: AgentState = {
      id: 'synthesizer_agent',
      name: 'Synthesizer Agent',
      status: hadError ? 'error' : 'working', // Keep error status until first chunk arrives
      label: hadError ? 'Retrying synthesis...' : config.labels.working,
      stepId: 'synthesis_step'
    };
    
    let currentAgentStates: AgentState[] = [...refinedAgents, synthesizerState];
    
    // Initialize generic storage
    this.ensureResults(work);
    
    const logger = new Logger(this.id, settings.debugMode);
    
    logger.debug('Starting synthesis', { numRefinedDrafts: refinedDrafts.length, isRegeneration: hadError });
    onProgress(config.progressMsg, currentAgentStates, work);

    try {
      const { systemInstruction, synthesizerTurn, mainChatHistory } = this.prepareSynthesis(context, refinedDrafts);

      // Simulation mode for testing error UI (controlled via settings)
      if (settings.simulateSynthesisError && settings.simulateSynthesisError !== 'none') {
        const synthesisResult = work.results?.['synthesis_step'] as any;
        const isFirstAttempt = !synthesisResult || (!synthesisResult.text && !synthesisResult.error);
        if (isFirstAttempt) {
          logger.debug(`SIMULATION: Throwing simulated ${settings.simulateSynthesisError} error for testing`);
          throw new Error(`${settings.simulateSynthesisError} Simulated error`);
        }
      }

      logger.debug('Starting model stream');

      let isFirstTextChunk = true;
      const { text: finalResponseText, groundingChunks } = await this.runModelStream(
        {
          ai, settings, model: settings.model,
          contents: [...mainChatHistory, synthesizerTurn],
          systemInstruction,
          tools: [{googleSearch: {}}],
          signal,
        },
        {
          onChunk: (text, thought, usage) => {
            if (text.length > 0 && isFirstTextChunk) {
              if (hadError) {
                currentAgentStates = this.updateAgentStatus(currentAgentStates, numAgents, 'working');
              }
            }

            this.handleStreamChunk(context, -1, text, thought, usage, {
              isFirstChunk: isFirstTextChunk,
              streamToMessage: true,
              agentStates: currentAgentStates,
              statusMsg: config.progressMsg
            });
            
            if (text.length > 0) isFirstTextChunk = false;
          }
        }
      );

      const sources = this.extractSources(groundingChunks);

      logger.debug('Synthesis complete', { 
        textLength: finalResponseText.length, 
        sourcesCount: sources?.length || 0 
      });

      // Update generic results map
      work.results['synthesis_step'] = { text: finalResponseText, sources };

      // Mark synthesizer as completed
      currentAgentStates = this.updateAgentStatus(currentAgentStates, numAgents, 'done');
      onProgress(config.progressMsg, currentAgentStates, work);

      return { text: finalResponseText, sources };
    } catch (error) {
      logger.debug('SYNTHESIS FAILED', { 
        error: error instanceof Error ? error.message : String(error),
        thoughtLength: work.results?.['synthesis_step_thought']?.length || 0
      });
      logger.debug('SYNTHESIS ERROR (will be logged at top level)', { error });
      
      // Determine appropriate error label using BaseStep utility
      const errorLabel = this.getErrorLabel(error, config.labels.error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Save error info to results for UI display
      work.results['synthesis_step'] = { 
        text: this.formatExecuteError(error),
        error: true,
        errorMessage 
      };
      
      currentAgentStates = this.updateAgentStatus(currentAgentStates, numAgents, 'error', errorLabel);
      onProgress(config.progressMsg, currentAgentStates, { ...work });
      throw error;
    }
  }

  async regenerate(context: StepContext): Promise<{ text: string; sources?: Source[] }> {
    return this.execute(context);
  }

  private prepareSynthesis(context: StepContext, refinedDrafts: string[]) {
    const { settings, history, userInput, image, imageFile, work } = context;
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.synthesizerInstruction}</mission>\n</system_instruction>`;

    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    const agentDrafts = refinedDrafts
      .map((answer: string, i: number) => `    <draft id="agent_${i + 1}">\n${answer}\n    </draft>`)
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
    this.ensureDebugInfo(work, 'synthesis_step', false);
    work.debugInfo['synthesis_step'] = {
        systemInstruction,
        history: mainChatHistory,
        userTurn: synthesizerTurn
    };

    return { systemInstruction, synthesizerTurn, mainChatHistory };
  }
}
