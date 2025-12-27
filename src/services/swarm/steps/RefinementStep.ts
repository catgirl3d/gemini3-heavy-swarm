import { Content } from '@google/genai';
import { StepContext, StepId, STEPS } from '@/types/steps';
import { AgentState } from '@/types';
import { prepareGeminiContent } from '../contentUtils';
import { getAgentRole } from '@/utils/chat/roleUtils';
import { BaseStep } from './BaseStep';
import { getStepResults } from '@/utils/swarm/workHelpers';
import { getStepConfig, hasStepContentError } from '@/utils/swarm/stepConstants';

export class RefinementStep extends BaseStep {
  id: StepId = STEPS.REFINEMENT;
  name = getStepConfig(STEPS.REFINEMENT).name;
  description = getStepConfig(STEPS.REFINEMENT).description;
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Refined Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { work } = context;
    const initialDrafts = getStepResults(work, STEPS.INITIAL);
    
    if (initialDrafts.length === 0) {
      throw new Error('Cannot run refinement step without initial drafts');
    }

    return this.executeMultiAgent(context, {
      prepareAgent: (i) => this.prepareRefinement(context, i, initialDrafts as string[]),
      tools: [{ googleSearch: {} }]
    });
  }

  async regenerate(context: StepContext, agentIndex: number): Promise<string> {
    const { work } = context;

    const initialDrafts = getStepResults(work, STEPS.INITIAL);
    
    if (initialDrafts.length === 0) {
      throw new Error('Cannot regenerate refinement without initial drafts');
    }

    const { systemInstruction, userTurn, mainChatHistory } = this.prepareRefinement(context, agentIndex, initialDrafts as string[]);
    return this.runAgentRegeneration(context, agentIndex, { systemInstruction, userTurn, mainChatHistory });
  }

  private prepareRefinement(context: StepContext, index: number, initialDrafts: string[]) {
    const { settings, history, userInput, image, imageFile } = context;
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    
    // Improved filtering using stepConfig utility
    const peerDrafts = initialDrafts
      .map((text: string, i: number) => ({ text, id: i + 1 }))
      .filter((_, i) => i !== index)
      .filter((a) => !hasStepContentError(a.text, STEPS.INITIAL))
      .map((a) => `    <draft id="agent_${a.id}">\n${a.text}\n    </draft>`)
      .join('\n\n');

    const refinementContext = `
# INPUT DATA
<context_data>
<original_query>
${userInput || "(See attached image/content)"}
</original_query>

<my_draft>
${initialDrafts[index]}
</my_draft>

<peer_drafts>
${peerDrafts}
</peer_drafts>
</context_data>

# YOUR TASK
<instruction>
1. As defined in <mission> critically re-evaluate <my_draft> considering insights from <peer_drafts>.
2. Provide a new, improved response to <original_query>.
3. [CRITICAL] You MUST ALWAYS use the googleSearch tool to verify facts and find additional information if needed!
</instruction>`;
    
    const userTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
    
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    
    let roleInstruction = '';
    if (settings.dynamicAgentRoles) {
        const role = getAgentRole(index, settings, 'criticRoles');
        if (role.instruction) {
            roleInstruction = `\n\n<role_assignment>\n${role.instruction}\n</role_assignment>`;
        }
    }

    const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.refinementInstruction}</mission>${roleInstruction}\n</system_instruction>`;

    return { systemInstruction, userTurn, mainChatHistory };
  }
}
