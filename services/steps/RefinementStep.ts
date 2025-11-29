import { GoogleGenAI, Content, Part } from '@google/genai';
import { StepDescriptor, StepContext } from '../../types/steps';
import { AppSettings, AgentState } from '../../types';

const getAgentPerspective = (index: number, settings: AppSettings): { name: string, instruction: string } => {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];
  const perspectives = activeRoleProfile?.roles || [];
  if (perspectives.length === 0) return { name: `Agent ${index + 1}`, instruction: '' };
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
        name: role ? `Agent ${i + 1} (${role})` : `Agent ${i + 1}`,
        status: 'working',
        label: 'Critiquing & Refining...'
      };
    });
    
    onProgress('Refining answers...', currentAgentStates, work);

    // Prepare base content
    const mainChatHistory: Content[] = history.map(msg => ({
      role: msg.role,
      parts: msg.parts,
    }));

    const baseApiParts: Part[] = [];
    if (image) {
      let mimeType = 'image/jpeg';
      if (imageFile) {
        mimeType = imageFile.type;
      } else {
        const match = image.match(/^data:([^;]+);base64,/);
        if (match) mimeType = match[1];
      }
      baseApiParts.push({
        inlineData: {
          mimeType: mimeType,
          data: image.split(',')[1],
        },
      });
    }
    if (userInput.trim()) {
      baseApiParts.push({ text: userInput });
    }

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

        const otherAnswers = initialResponses.filter((_: string, i: number) => i !== index);
        const otherAnswersText = otherAnswers.map((answer: string, i: number) => `${i + 1}. "${answer}"`).join('\n');
        const refinementContext = `My initial response was: "${initialAnswer}". The other agents responded with:\n${otherAnswersText}\n\nBased on this context, critically re-evaluate and provide a new, improved response to the original query.`;
        
        const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
        
        const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];

        const stream = await ai.models.generateContentStream({
          model: settings.model,
          contents: [...mainChatHistory, refinementTurn],
          config: {
            systemInstruction: activeProfile.refinementInstruction,
            temperature: settings.temperature ?? 0.7,
            tools: [{googleSearch: {}}],
            thinkingConfig: { thinkingBudget: settings.model.includes('flash') ? 24576 : 32768 },
            maxOutputTokens: 65536,
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

    await Promise.all(agentPromises);
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
    const mainChatHistory: Content[] = history.map(msg => ({
      role: msg.role,
      parts: msg.parts,
    }));

    const baseApiParts: Part[] = [];
    if (image) {
      let mimeType = 'image/jpeg';
      if (imageFile) {
        mimeType = imageFile.type;
      } else {
        const match = image.match(/^data:([^;]+);base64,/);
        if (match) mimeType = match[1];
      }
      baseApiParts.push({
        inlineData: {
          mimeType: mimeType,
          data: image.split(',')[1],
        },
      });
    }
    if (userInput.trim()) {
      baseApiParts.push({ text: userInput });
    }

    const initialAnswer = initialResponses[agentIndex];
    const otherAnswers = initialResponses.filter((_: string, i: number) => i !== agentIndex);
    const otherAnswersText = otherAnswers.map((answer: string, i: number) => `${i + 1}. "${answer}"`).join('\n');
    const refinementContext = `My initial response was: "${initialAnswer}". The other agents responded with:\n${otherAnswersText}\n\nBased on this context, critically re-evaluate and provide a new, improved response to the original query.`;
    
    const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
    
    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];

    const stream = await ai.models.generateContentStream({
      model: settings.model,
      contents: [...mainChatHistory, refinementTurn],
      config: {
        systemInstruction: activeProfile.refinementInstruction,
        temperature: settings.temperature ?? 0.7,
        tools: [{googleSearch: {}}],
        thinkingConfig: { thinkingBudget: settings.model.includes('flash') ? 24576 : 32768 },
        maxOutputTokens: 65536,
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