import { GoogleGenAI, Content, Part } from '@google/genai';
import { StepDescriptor, StepContext } from '../../types/steps';
import { AppSettings, AgentState } from '../../types';
import { prepareGeminiContent } from '../contentUtils';
import { getGenerationConfig } from '../geminiConfig';

const getAgentPerspective = (index: number, settings: AppSettings): { name: string, instruction: string } => {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];
  // Use criticRoles for refinement step if available, otherwise fallback to standard roles or generic
  const perspectives = activeRoleProfile?.criticRoles || [];
  if (perspectives.length === 0) return { name: `Critic ${index + 1}`, instruction: '' };
  return perspectives[index % perspectives.length];
};

export class RefinementStep implements StepDescriptor {
  id = 'refined';
  name = 'Refinement';
  description = 'Agents critique and refine their responses based on other agents\' inputs.';
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Refined Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { ai, settings, history, userInput, image, imageFile, work, onProgress, signal } = context;

    // Ensure we have initial responses
    const initialResponses = work.results?.['initial'] || work.initialResponses;
    if (!initialResponses || initialResponses.length === 0) {
      throw new Error('Cannot run refinement step without initial responses');
    }

    // Initialize results array
    const results: string[] = Array(settings.numAgents).fill('');
    
    // Initialize legacy field if needed
    if (!work.refinedResponses) work.refinedResponses = Array(settings.numAgents).fill(null);

    // Initialize agent states
    let currentAgentStates: AgentState[] = Array.from({ length: settings.numAgents }, (_, i) => {
      const role = settings.dynamicAgentRoles ? getAgentPerspective(i, settings).name : null;
      return {
        id: `agent-${i}`,
        name: role ? `Agent ${i + 1} (${role})` : `Critic ${i + 1}`,
        status: 'working',
        label: 'Critiquing & Refining...'
      };
    });
    
    onProgress('Refining answers...', currentAgentStates, work);

    // Prepare base content
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    // Execute agents
    const agentPromises = initialResponses.map(async (initialAnswer: string, index: number) => {
      if (settings.devMode) {
        // DEV MODE SIMULATION
        const dummyText = `[DEV MODE] Refined response from Agent ${index + 1}. Critiquing the initial draft.`;
        const words = dummyText.split(' ');
        let currentText = '';
        
        for (const word of words) {
          if (signal.aborted) throw new Error('Aborted');
          await new Promise(resolve => setTimeout(resolve, 100));
          currentText += word + ' ';
          
          // Update both new and legacy storage
          results[index] = currentText;
          work.refinedResponses[index] = currentText;
          
          // Update generic results map
          if (!work.results) work.results = {};
          work.results['refined'] = [...results];

          onProgress('Refining answers (DEV MODE)...', currentAgentStates, { ...work });
        }
        
        currentAgentStates = currentAgentStates.map((a, idx) => idx === index ? { ...a, status: 'done', label: 'Refined' } : a);
        onProgress('Refining answers (DEV MODE)...', currentAgentStates, { ...work });
        return currentText;

      } else {
        // PROD MODE
        if (!ai) throw new Error("API Key not found");

        const peerDrafts = initialResponses
          .map((text: string, i: number) => ({ text, id: i + 1 }))
          .filter((_: any, i: number) => i !== index)
          .filter((a: any) => !a.text.trim().startsWith('[System:')) // Filter out failed agents
          .map((a: any) => `    <draft id="agent_${a.id}">\n${a.text}\n    </draft>`)
          .join('\n\n');

        const refinementContext = `
# INPUT DATA
<context_data>
<original_query>
${userInput || "(See attached image/content)"}
</original_query>

<my_draft>
${initialAnswer}
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
        
        const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
        
        const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
        
        // Add role-specific instruction if dynamic roles are enabled
        let roleInstruction = '';
        if (settings.dynamicAgentRoles) {
            const role = getAgentPerspective(index, settings);
            if (role.instruction) {
                roleInstruction = `\n\n<role_assignment>\n${role.instruction}\n</role_assignment>`;
            }
        }

        const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.refinementInstruction}</mission>${roleInstruction}\n</system_instruction>`;

        // Capture debug info
        if (!work.debugInfo) work.debugInfo = {};
        if (!work.debugInfo['refined']) work.debugInfo['refined'] = [];
        work.debugInfo['refined'][index] = {
            systemInstruction,
            history: mainChatHistory,
            userTurn: refinementTurn
        };

        const stream = await ai.models.generateContentStream({
          model: settings.model,
          contents: [...mainChatHistory, refinementTurn],
          config: {
            ...getGenerationConfig(settings.model, settings.temperature, settings.unsafeTemperature),
            systemInstruction,
            tools: [{googleSearch: {}}],
          },
        });

        let fullText = '';
        for await (const chunk of stream) {
          if (signal.aborted) throw new Error('Aborted');
          const text = chunk.text || '';
          fullText += text;
          
          // Update both new and legacy storage
          results[index] = fullText;
          work.refinedResponses[index] = fullText;
          
          // Update generic results map
          if (!work.results) work.results = {};
          work.results['refined'] = [...results];

          onProgress('Refining answers...', currentAgentStates, { ...work });
        }

        currentAgentStates = currentAgentStates.map((a, idx) => idx === index ? { ...a, status: 'done', label: 'Refined' } : a);
        onProgress('Refining answers...', currentAgentStates, { ...work });
        return fullText;
      }
    });

    const outcomes = await Promise.allSettled(agentPromises);

    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'rejected') {
        console.error(`Agent ${i + 1} failed refinement:`, outcome.reason);
        const errorMessage = `\n\n[System: Agent failed to refine. ${outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error'}]`;
        
        results[i] += errorMessage;
        if (work.refinedResponses) work.refinedResponses[i] = results[i];
        
        currentAgentStates = currentAgentStates.map((a, idx) => idx === i ? { ...a, status: 'error', label: 'Refinement Failed' } : a);
      }
    });

    if (!work.results) work.results = {};
    work.results['refined'] = [...results];
    onProgress('Refinement completed', currentAgentStates, { ...work });

    return results;
  }

  async regenerate(context: StepContext, agentIndex: number): Promise<string> {
    const { ai, settings, history, userInput, image, imageFile, work, signal } = context;
    if (!ai) throw new Error("API Key not found");

    // Ensure we have initial responses
    const initialResponses = work.results?.['initial'] || work.initialResponses;
    if (!initialResponses || initialResponses.length === 0) {
      throw new Error('Cannot regenerate refinement without initial responses');
    }

    // Prepare content
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    const initialAnswer = initialResponses[agentIndex];
    const peerDrafts = initialResponses
      .map((text: string, i: number) => ({ text, id: i + 1 }))
      .filter((_: any, i: number) => i !== agentIndex)
      .filter((a: any) => !a.text.trim().startsWith('[System:')) // Filter out failed agents
      .map((a: any) => `    <draft id="agent_${a.id}">\n${a.text}\n    </draft>`)
      .join('\n\n');

    const refinementContext = `
# INPUT DATA
<context_data>
<original_query>
${userInput || "(See attached image/content)"}
</original_query>

<my_draft>
${initialAnswer}
</my_draft>

<peer_drafts>
${peerDrafts}
</peer_drafts>
</context_data>

# YOUR TASK
<instruction>
Critically re-evaluate <my_draft> considering insights from <peer_drafts>.
Provide a new, improved response to <original_query>.
ALWAYS use the googleSearch tool to verify facts and find additional information if needed.
</instruction>`;
    
    const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
    
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    
    // Add role-specific instruction if dynamic roles are enabled
    let roleInstruction = '';
    if (settings.dynamicAgentRoles) {
        const role = getAgentPerspective(agentIndex, settings);
        if (role.instruction) {
            roleInstruction = `\n\n<role_assignment>\n${role.instruction}\n</role_assignment>`;
        }
    }

    const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.refinementInstruction}</mission>${roleInstruction}\n</system_instruction>`;

    // Capture debug info for regeneration
    if (context.work.debugInfo && context.work.debugInfo['refined']) {
        context.work.debugInfo['refined'][agentIndex] = {
            systemInstruction: activeProfile.refinementInstruction,
            history: mainChatHistory,
            userTurn: refinementTurn
        };
    }

    const stream = await ai.models.generateContentStream({
      model: settings.model,
      contents: [...mainChatHistory, refinementTurn],
      config: {
        ...getGenerationConfig(settings.model, settings.temperature, settings.unsafeTemperature),
        systemInstruction,
        tools: [{googleSearch: {}}],
      },
    });

    let fullText = '';
    for await (const chunk of stream) {
      if (signal.aborted) throw new Error('Aborted');
      const text = chunk.text || '';
      fullText += text;
      context.onMessageUpdate(fullText, false);
    }
    return fullText;
  }
}