import { Content } from '@google/genai';
import { StepContext, StepId, STEPS } from '@/types/steps';
import { AgentState } from '@/types';
import { prepareGeminiContent } from '@/services/contentUtils';
import { getAgentRole } from '@/services/steps/utils/roleUtils';
import { BaseStep } from '@/services/steps/BaseStep';
import { getStepConfig } from '@/utils/stepConfig';

export class InitialStep extends BaseStep {
  id: StepId = STEPS.INITIAL;
  name = getStepConfig(STEPS.INITIAL).name;
  description = getStepConfig(STEPS.INITIAL).description;
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Initial Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    return this.executeMultiAgent(context, {
      prepareAgent: (i) => this.prepareInstruction(context, i),
      tools: [{ googleSearch: {} }]
    });
  }

  async regenerate(context: StepContext, agentIndex: number): Promise<string> {
    const { ai, settings, signal } = context;
    if (!ai) throw new Error("API Key not found");

    // Prepare content (similar to execute but for single agent)
    const { systemInstruction, userTurn, mainChatHistory } = this.prepareInstruction(context, agentIndex);

    // Capture debug info for regeneration
    if (context.work.debugInfo && context.work.debugInfo[STEPS.INITIAL]) {
        (context.work.debugInfo[STEPS.INITIAL] as any)[agentIndex] = {
            systemInstruction,
            history: mainChatHistory,
            userTurn
        };
    }

    const { text: fullText } = await this.runModelStream(
      {
        ai, settings, model: settings.model,
        contents: [...mainChatHistory, userTurn],
        systemInstruction,
        tools: [{googleSearch: {}}],
        signal,
        agentIndex
      },
      {
        onChunk: (text, thought, usage) => {
          this.handleStreamChunk(context, agentIndex, text, thought, usage, {
            isFirstChunk: false // handled by model stream anyway
          });
        }
      }
    );
    return fullText;
  }

  private prepareInstruction(context: StepContext, index: number) {
    const { settings, history, userInput, image, imageFile } = context;
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    let systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.initialInstruction}</mission>`;
    let userTurn = currentUserTurn;

    if (settings.dynamicAgentRoles) {
      const perspective = getAgentRole(index, settings, 'roles');
      systemInstruction += `\n<role>${perspective.name}</role>\n<role_instruction>${perspective.instruction}</role_instruction>`;
      const roleReminder = `\n\n<system_note>\nRemember your assigned role: ${perspective.name}\n</system_note>`;
      userTurn = {
        role: 'user',
        parts: [...currentUserTurn.parts, { text: roleReminder }]
      };
    }
    systemInstruction += `\n</system_instruction>`;

    return { systemInstruction, userTurn, mainChatHistory };
  }
}
