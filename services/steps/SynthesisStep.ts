import { Content } from '@google/genai';
import { StepContext, StepId } from '@/types/steps';
import { AgentState, Source } from '@/types';
import { prepareGeminiContent } from '@/services/contentUtils';
import { BaseStep } from '@/services/steps/BaseStep';
import { getStepResults } from '@/utils/workHelpers';

export class SynthesisStep extends BaseStep {
  id: StepId = 'synthesis_step';
  name = 'Synthesis Step';
  description = 'Synthesizes all refined responses into a final answer.';
  ui = {
    visibleInModal: false, // Synthesis result is the main message text, not shown in "Show Work"
    regenerateLabel: 'Regenerate Final Answer'
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
      statusLabel: 'Refined'
    });

    const synthesizerState: AgentState = {
      id: 'synthesizer_agent',
      name: 'Synthesizer Agent',
      status: 'working',
      label: 'Synthesizing...',
      stepId: 'synthesis_step'
    };
    
    let currentAgentStates: AgentState[] = [...refinedAgents, synthesizerState];
    
    // Initialize generic storage
    this.ensureResults(work);
    
    onProgress('Synthesizing final response...', currentAgentStates, work);

    try {
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

      let isFirstChunk = true;
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
            work.results['synthesis_step_thought'] = thought;

            if (usage) {
              work.results['synthesis_step_usage'] = usage;
            }

            // Only update message display when there is actual text content (not just thinking)
            if (text.length > 0) {
                onMessageUpdate(text, isFirstChunk);
                isFirstChunk = false;
            }
          }
        }
      );

      const sources = this.extractSources(groundingChunks);

      // Update generic results map
      work.results['synthesis_step'] = { text: finalResponseText, sources };

      // Mark synthesizer as completed
      currentAgentStates = this.updateAgentStateById(currentAgentStates, 'synthesizer_agent', { status: 'done', label: 'Synthesized' });
      onProgress('Synthesis completed', currentAgentStates, work);

      return { text: finalResponseText, sources };
    } catch (error) {
      console.error('Synthesis failed:', error);
      
      // Determine appropriate error label using BaseStep utility
      const errorLabel = this.getErrorLabel(error, 'Synthesis Failed');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Save error info to results for UI display
      work.results['synthesis_step'] = { 
        text: `[System: Synthesis failed. ${errorMessage}]`,
        error: true,
        errorMessage 
      };
      
      currentAgentStates = this.updateAgentStateById(currentAgentStates, 'synthesizer_agent', { status: 'error', label: errorLabel, stepId: 'synthesis_step' });
      onProgress('Synthesis failed', currentAgentStates, { ...work });
      throw error;
    }
  }

  async regenerate(context: StepContext): Promise<{ text: string; sources?: Source[] }> {
    // execute already handles token usage update
    return this.execute(context);
  }
}
