import { GoogleGenAI, Content, Part } from '@google/genai';
import { StepDescriptor, StepContext } from '../../types/steps';
import { AppSettings, AgentState } from '../../types';

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
    
    // Initialize legacy field if needed
    if (!work.initialResponses) work.initialResponses = Array(settings.numAgents).fill(null);

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
    const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

    // Execute agents
    const agentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
      if (settings.devMode) {
        // DEV MODE SIMULATION
        const dummyText = `[DEV MODE] Initial draft from Agent ${i + 1}. This is a simulated response.`;
        const words = dummyText.split(' ');
        let currentText = '';
        
        for (const word of words) {
          if (signal.aborted) throw new Error('Aborted');
          await new Promise(resolve => setTimeout(resolve, 100));
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
        let systemInstruction = activeProfile.initialInstruction;
        let userTurn = currentUserTurn;

        if (settings.dynamicAgentRoles) {
          const perspective = getAgentPerspective(i, settings);
          systemInstruction += "\n\n" + perspective.instruction;
          const roleReminder = `\n\n[SYSTEM NOTE: Remember your assigned role: ${perspective.name}]`;
          userTurn = {
            role: 'user',
            parts: [...currentUserTurn.parts, { text: roleReminder }]
          };
        }

        const stream = await ai.models.generateContentStream({
          model: settings.model,
          contents: [...mainChatHistory, userTurn],
          config: {
            systemInstruction: systemInstruction,
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
          results[i] = fullText;
          work.initialResponses[i] = fullText;
          
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

    const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
    let systemInstruction = activeProfile.initialInstruction;
    let userTurn: Content = { role: 'user', parts: baseApiParts };

    if (settings.dynamicAgentRoles) {
      const perspective = getAgentPerspective(agentIndex, settings);
      systemInstruction += "\n\n" + perspective.instruction;
      const roleReminder = `\n\n[SYSTEM NOTE: Remember your assigned role: ${perspective.name}]`;
      userTurn = {
        role: 'user',
        parts: [...baseApiParts, { text: roleReminder }]
      };
    }

    const stream = await ai.models.generateContentStream({
      model: settings.model,
      contents: [...mainChatHistory, userTurn],
      config: {
        systemInstruction: systemInstruction,
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