import { type Content } from '@google/genai';
import { type StepContext, type StepId, STEPS } from '@/types/steps';
import { type AgentState, type Work } from '@/types';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { getAgentRole } from '@/utils/chat/roleUtils';
import { BaseStep } from './BaseStep';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { formatSystemInstruction, getSearchInstruction, getRoleReminder, formatRole } from '@/utils/swarm/promptHelpers';

export class InitialStep extends BaseStep {
  id: StepId = STEPS.INITIAL;
  name = getStepConfig(STEPS.INITIAL).name;
  description = getStepConfig(STEPS.INITIAL).description;
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Initial Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { settings } = context;
    return this.executeMultiAgent(context, {
      prepareAgent: (i) => this.prepareInstruction(context, i),
      tools: settings.useSearchInInitial ? [{ googleSearch: {} }] : undefined,
      simulateError: settings.simulateInitialError,
      simulateErrorAttempts: settings.simulateInitialErrorAttempts
    });
  }

  async regenerate(context: StepContext, agentIndex: number, agentStates: AgentState[]): Promise<{ work: Work }> {
    const { settings } = context;
    const { systemInstruction, userTurn, mainChatHistory } = this.prepareInstruction(context, agentIndex);
    const result = await this.runAgentRegeneration(
      context,
      agentIndex,
      { systemInstruction, userTurn, mainChatHistory },
      agentStates,
      'roles', // Identify as drafter roles
      settings.useSearchInInitial ? [{ googleSearch: {} }] : [], // Use empty array to override BaseStep default
      undefined, // onFirstTextChunk
      settings.simulateInitialError,
      settings.simulateInitialErrorAttempts
    );

    return { work: result.work };
  }

  private prepareInstruction(context: StepContext, index: number) {
    const { settings, history, userInput, image, imageFile } = context;
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    
    // Always apply dynamic agent roles
    const perspective = getAgentRole(index, settings, 'roles');
    const roleContent = formatRole(perspective);
    
    const searchInstruction = getSearchInstruction(settings.useSearchInInitial);

    const systemInstruction = formatSystemInstruction(
      activeProfile.initialInstruction,
      roleContent + searchInstruction
    );

    const roleReminder = getRoleReminder(perspective.name);
    const userTurn: Content = {
      role: 'user',
      parts: [...currentUserTurn.parts, { text: roleReminder }]
    };

    return { systemInstruction, userTurn, mainChatHistory };
  }
}
