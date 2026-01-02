import { Content } from '@google/genai';
import { StepContext, StepId, STEPS } from '@/types/steps';
import { AgentState, Work } from '@/types';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { getAgentRole } from '@/utils/chat/roleUtils';
import { BaseStep } from './BaseStep';
import { getStepResults } from '@/utils/swarm/workHelpers';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { formatSystemInstruction, getRoleReminder, formatDrafts, buildRefinementContext, formatRole } from '@/utils/swarm/promptHelpers';

export class RefinementStep extends BaseStep {
  id: StepId = STEPS.REFINEMENT;
  name = getStepConfig(STEPS.REFINEMENT).name;
  description = getStepConfig(STEPS.REFINEMENT).description;
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Refined Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { work, settings } = context;
    const initialDrafts = getStepResults(work, STEPS.INITIAL);
    
    if (initialDrafts.length === 0) {
      throw new Error('Cannot run refinement step without initial drafts');
    }

    return this.executeMultiAgent(context, {
      prepareAgent: (i) => this.prepareRefinement(context, i, initialDrafts as string[]),
      tools: settings.useSearchInRefinement ? [{ googleSearch: {} }] : undefined,
      simulateError: settings.simulateRefinementError,
      simulateErrorAttempts: settings.simulateRefinementErrorAttempts
    });
  }

  async regenerate(context: StepContext, agentIndex: number, agentStates: AgentState[]): Promise<{ text: string; work: Work }> {
    const { work } = context;

    const initialDrafts = getStepResults(work, STEPS.INITIAL);
    
    if (initialDrafts.length === 0) {
      throw new Error('Cannot regenerate refinement without initial drafts');
    }

    const { settings } = context;
    const { systemInstruction, userTurn, mainChatHistory } = this.prepareRefinement(context, agentIndex, initialDrafts as string[]);
    return this.runAgentRegeneration(
      context,
      agentIndex,
      { systemInstruction, userTurn, mainChatHistory },
      agentStates,
      'criticRoles', // Identify as critic roles
      settings.useSearchInRefinement ? [{ googleSearch: {} }] : [], // Use empty array to override BaseStep default
      undefined, // onFirstTextChunk
      settings.simulateRefinementError,
      settings.simulateRefinementErrorAttempts
    );
  }

  private prepareRefinement(context: StepContext, index: number, initialDrafts: string[]) {
    const { settings, history, userInput, image, imageFile } = context;
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    
    // Format peer drafts using helper
    const peerDrafts = formatDrafts(initialDrafts, index);

    // Get my draft (fallback to empty if error/waiting)
    const myDraft = initialDrafts[index] ?? '';

    // Build refinement context using helper
    const refinementContext = buildRefinementContext({
      userInput,
      myDraft,
      peerDrafts,
      useSearch: settings.useSearchInRefinement
    });
    
    const userTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
    
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    
    // Always apply dynamic agent roles
    const role = getAgentRole(index, settings, 'criticRoles');
    const roleInstruction = formatRole(role);

    const systemInstruction = formatSystemInstruction(
        activeProfile.refinementInstruction,
        roleInstruction
    );

    // Add role reminder to user turn (similar to InitialStep)
    const roleReminder = getRoleReminder(role.name);
    const userTurnWithReminder: Content = {
      role: 'user',
      parts: [...userTurn.parts, { text: roleReminder }]
    };

    return { systemInstruction, userTurn: userTurnWithReminder, mainChatHistory };
  }
}
