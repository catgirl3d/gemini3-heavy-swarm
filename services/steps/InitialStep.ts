import { GoogleGenAI, Content, Part } from '@google/genai';
import { StepDescriptor, StepContext } from '../../types/steps';
import { AppSettings, AgentState } from '../../types';
import { prepareGeminiContent } from '../contentUtils';
import { getGenerationConfig } from '../geminiConfig';

const getAgentPerspective = (index: number, settings: AppSettings): { name: string, instruction: string } => {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];
  const perspectives = activeRoleProfile?.roles || [];
  if (perspectives.length === 0) return { name: `Agent ${index + 1}`, instruction: '' };
  return perspectives[index % perspectives.length];
};

export class InitialStep implements StepDescriptor {
  id = 'initial';
  name = 'Initial Responses';
  description = 'Agents draft their initial responses based on the user query.';
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Initial Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { ai, settings, history, userInput, image, imageFile, work, onProgress, signal } = context;

    // Initialize results array
    const results: string[] = Array(settings.numAgents).fill('');
    const thoughts: string[] = Array(settings.numAgents).fill('');
    
    // Initialize legacy field if needed
    if (!work.initialResponses) work.initialResponses = Array(settings.numAgents).fill(null);
    if (!work.initialThoughts) work.initialThoughts = Array(settings.numAgents).fill(null);
    if (!work.initialTokenUsage) work.initialTokenUsage = Array(settings.numAgents).fill(null);

    // Initialize agent states
    let currentAgentStates: AgentState[] = Array.from({ length: settings.numAgents }, (_, i) => {
      const role = settings.dynamicAgentRoles ? getAgentPerspective(i, settings).name : null;
      return {
        id: `agent-${i}`,
        name: role ? `Agent ${i + 1} (${role})` : `Agent ${i + 1}`,
        status: 'working',
        label: 'Drafting initial response...'
      };
    });
    
    onProgress('Initializing agents...', currentAgentStates, work);

    // Prepare base content
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

    // Execute agents
    const agentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
      if (settings.devMode) {
        // DEV MODE SIMULATION
        const dummyText = `[DEV MODE] Initial draft from Agent ${i + 1}. This is a simulated response designed to take exactly 10 seconds. We are testing the timer functionality to ensure that the UI handles long-running processes correctly. This text is being streamed word by word to mimic the behavior of a real LLM generation. 1... 2... 3... 4... 5...`;
        const words = dummyText.split(' ');
        let currentText = '';
        
        // Calculate delay to match exactly 10 seconds (10000ms)
        const totalDuration = 10000;
        const delayPerWord = totalDuration / words.length;

        for (const word of words) {
          if (signal.aborted) throw new Error('Aborted');
          await new Promise(resolve => setTimeout(resolve, delayPerWord));
          currentText += word + ' ';
          
          // Update both new and legacy storage
          results[i] = currentText;
          work.initialResponses[i] = currentText;
          
          // Update generic results map
          if (!work.results) work.results = {};
          work.results['initial'] = [...results];

          onProgress('Initializing agents (DEV MODE)...', currentAgentStates, { ...work });
        }
        
        currentAgentStates = currentAgentStates.map((a, idx) => idx === i ? { ...a, status: 'done', label: 'Drafted' } : a);
        onProgress('Initializing agents (DEV MODE)...', currentAgentStates, { ...work });
        return currentText;

      } else {
        // PROD MODE
        if (!ai) throw new Error("API Key not found");

        const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
        let systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.initialInstruction}</mission>`;
        let userTurn = currentUserTurn;

        if (settings.dynamicAgentRoles) {
          const perspective = getAgentPerspective(i, settings);
          systemInstruction += `\n<role>${perspective.name}</role>\n<role_instruction>${perspective.instruction}</role_instruction>`;
          const roleReminder = `\n\n<system_note>\nRemember your assigned role: ${perspective.name}\n</system_note>`;
          userTurn = {
            role: 'user',
            parts: [...currentUserTurn.parts, { text: roleReminder }]
          };
        }
        systemInstruction += `\n</system_instruction>`;

        // Capture debug info
        if (!work.debugInfo) work.debugInfo = {};
        if (!work.debugInfo['initial']) work.debugInfo['initial'] = [];
        work.debugInfo['initial'][i] = {
            systemInstruction,
            history: mainChatHistory,
            userTurn
        };

        const stream = await ai.models.generateContentStream({
          model: settings.model,
          contents: [...mainChatHistory, userTurn],
          config: {
            ...getGenerationConfig(settings.model, settings.temperature, settings.unsafeTemperature),
            systemInstruction: systemInstruction,
            tools: [{googleSearch: {}}],
          },
        });

        let fullText = '';
        let fullThought = '';
        for await (const chunk of stream) {
          if (signal.aborted) throw new Error('Aborted');
          
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              const p = part as any;
              // If it's a thought, capture it and DO NOT add to fullText
              if (p.thought) {
                if (part.text) {
                  fullThought += part.text;
                }
              } else if (part.text) {
                // Only add to fullText if it's NOT a thought
                fullText += part.text;
              }
            }
          }
          
          // Update both new and legacy storage
          results[i] = fullText;
          thoughts[i] = fullThought;
          work.initialResponses[i] = fullText;
          if (work.initialThoughts) work.initialThoughts[i] = fullThought;

          if (chunk.usageMetadata && work.initialTokenUsage) {
            work.initialTokenUsage[i] = {
              promptTokens: chunk.usageMetadata.promptTokenCount || 0,
              candidatesTokens: chunk.usageMetadata.candidatesTokenCount || 0,
              totalTokens: chunk.usageMetadata.totalTokenCount || 0
            };
          }
          
          // Update generic results map
          if (!work.results) work.results = {};
          work.results['initial'] = [...results];

          onProgress('Initializing agents...', currentAgentStates, { ...work });
        }

        currentAgentStates = currentAgentStates.map((a, idx) => idx === i ? { ...a, status: 'done', label: 'Drafted' } : a);
        onProgress('Initializing agents...', currentAgentStates, { ...work });
        return fullText;
      }
    });

    const outcomes = await Promise.allSettled(agentPromises);

    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'rejected') {
        console.error(`Agent ${i + 1} failed:`, outcome.reason);
        const errorMessage = `\n\n[System: Agent failed to complete. ${outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error'}]`;
        
        results[i] += errorMessage;
        if (work.initialResponses) work.initialResponses[i] = results[i];
        
        currentAgentStates = currentAgentStates.map((a, idx) => idx === i ? { ...a, status: 'error', label: 'Draft Failed' } : a);
      }
    });

    if (!work.results) work.results = {};
    work.results['initial'] = [...results];
    onProgress('Agents completed', currentAgentStates, { ...work });

    return results;
  }

  async regenerate(context: StepContext, agentIndex: number): Promise<string> {
    const { ai, settings, history, userInput, image, imageFile, signal } = context;
    if (!ai) throw new Error("API Key not found");

    // Prepare content (similar to execute but for single agent)
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    let systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.initialInstruction}</mission>`;
    let userTurn: Content = { role: 'user', parts: baseApiParts };

    if (settings.dynamicAgentRoles) {
      const perspective = getAgentPerspective(agentIndex, settings);
      systemInstruction += `\n<role>${perspective.name}</role>\n<role_instruction>${perspective.instruction}</role_instruction>`;
      const roleReminder = `\n\n<system_note>\nRemember your assigned role: ${perspective.name}\n</system_note>`;
      userTurn = {
        role: 'user',
        parts: [...baseApiParts, { text: roleReminder }]
      };
    }
    systemInstruction += `\n</system_instruction>`;

    // Capture debug info for regeneration
    if (context.work.debugInfo && context.work.debugInfo['initial']) {
        context.work.debugInfo['initial'][agentIndex] = {
            systemInstruction,
            history: mainChatHistory,
            userTurn
        };
    }

    const stream = await ai.models.generateContentStream({
      model: settings.model,
      contents: [...mainChatHistory, userTurn],
      config: {
        ...getGenerationConfig(settings.model, settings.temperature, settings.unsafeTemperature),
        systemInstruction: systemInstruction,
        tools: [{googleSearch: {}}],
      },
    });

    let fullText = '';
    let fullThought = '';
    
    for await (const chunk of stream) {
      if (signal.aborted) throw new Error('Aborted');
      
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          const p = part as any;
          // If it's a thought, capture it and DO NOT add to fullText
          if (p.thought) {
            if (part.text) {
              fullThought += part.text;
            }
          } else if (part.text) {
            // Only add to fullText if it's NOT a thought
            fullText += part.text;
          }
        }
      }

      if (context.work.initialThoughts) {
        context.work.initialThoughts[agentIndex] = fullThought;
      }

      if (chunk.usageMetadata && context.work.initialTokenUsage) {
        context.work.initialTokenUsage[agentIndex] = {
          promptTokens: chunk.usageMetadata.promptTokenCount || 0,
          candidatesTokens: chunk.usageMetadata.candidatesTokenCount || 0,
          totalTokens: chunk.usageMetadata.totalTokenCount || 0
        };
      }

      context.onMessageUpdate(fullText, false);
    }
    return fullText;
  }
}