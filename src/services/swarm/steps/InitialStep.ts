import { Content } from '@google/genai';
import { StepContext, StepId, STEPS } from '@/types/steps';
import { AgentState, Work } from '@/types';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { getAgentRole } from '@/utils/chat/roleUtils';
import { BaseStep } from './BaseStep';
import { getStepConfig } from '@/utils/swarm/stepConstants';

export class InitialStep extends BaseStep {
  id: StepId = STEPS.INITIAL;
  name = getStepConfig(STEPS.INITIAL).name;
  description = getStepConfig(STEPS.INITIAL).description;
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Initial Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { work, settings } = context;
    return this.executeMultiAgent(context, {
      prepareAgent: (i) => this.prepareInstruction(context, i),
      tools: settings.useSearchInInitial ? [{ googleSearch: {} }] : undefined,
      simulateError: settings.simulateInitialError,
      simulateErrorAttempts: settings.simulateInitialErrorAttempts
    });
  }

  async regenerate(context: StepContext, agentIndex: number, agentStates: AgentState[]): Promise<{ text: string; work: Work }> {
    const { settings } = context;
    const { systemInstruction, userTurn, mainChatHistory } = this.prepareInstruction(context, agentIndex);
    return this.runAgentRegeneration(
      context,
      agentIndex,
      { systemInstruction, userTurn, mainChatHistory },
      agentStates,
      settings.useSearchInInitial ? [{ googleSearch: {} }] : [], // Use empty array to override BaseStep default
      undefined, // onFirstTextChunk
      settings.simulateInitialError,
      settings.simulateInitialErrorAttempts
    );
  }

  private prepareInstruction(context: StepContext, index: number) {
    const { settings, history, userInput, image, imageFile } = context;
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    let systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.initialInstruction}</mission>`;
    let userTurn = currentUserTurn;

    // Always apply dynamic agent roles
    const perspective = getAgentRole(index, settings, 'roles');
    systemInstruction += `\n<role>${perspective.name}</role>\n<role_instruction>${perspective.instruction}</role_instruction>`;
    const roleReminder = `\n\n<system_note>\nRemember your assigned role: ${perspective.name}\n</system_note>`;
    userTurn = {
      role: 'user',
      parts: [...currentUserTurn.parts, { text: roleReminder }]
    };

    if (settings.useSearchInInitial) {
      systemInstruction += `\n\n<search_instruction>\n[CRITICAL] You MUST ALWAYS use the googleSearch tool to verify facts and find additional information if needed!\n</search_instruction>`;
    }

    systemInstruction += `\n</system_instruction>`;

    return { systemInstruction, userTurn, mainChatHistory };
  }
}
