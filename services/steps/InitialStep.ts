import { Content } from '@google/genai';
import { StepContext, StepId } from '../../types/steps';
import { AgentState } from '../../types';
import { prepareGeminiContent } from '../contentUtils';
import { getGenerationConfig } from '../geminiConfig';
import { getAgentRole } from './utils/roleUtils';
import { BaseStep } from './BaseStep';

export class InitialStep extends BaseStep {
  id: StepId = 'initial_step';
  name = 'Initial Step';
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

    // Initialize agent states using BaseStep utility
    let currentAgentStates: AgentState[] = this.createAgentStates(
      settings.numAgents, 
      settings,
      {
        stepId: 'initial_step',
        status: 'working',
        statusLabel: 'Drafting initial response...'
      }
    );
    
    onProgress('Initializing agents...', currentAgentStates, work);

    // Prepare base content
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);
    const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

    // Execute agents
    const agentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
      if (settings.devMode) {
        // DEV MODE SIMULATION using BaseStep utility
        const dummyText = this.getDevModeText('initial_step', i);
        
        const currentText = await this.simulateDevMode(
          dummyText,
          signal,
          (chunk) => {
             // Update both new and legacy storage
             results[i] = chunk;
             work.initialResponses[i] = chunk;
             
             // Update generic results map
             if (!work.results) work.results = {};
             work.results['initial_step'] = [...results];
 
             onProgress('Initializing agents (DEV MODE)...', currentAgentStates, { ...work });
          },
          10000 // 10 seconds duration
        );
        
        currentAgentStates = this.updateAgentState(currentAgentStates, i, { status: 'done', label: 'Drafted', stepId: 'initial_step' });
        onProgress('Initializing agents (DEV MODE)...', currentAgentStates, { ...work });
        return currentText;

      } else {
        // PROD MODE
        if (!ai) throw new Error("API Key not found");

        const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
        let systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.initialInstruction}</mission>`;
        let userTurn = currentUserTurn;

        if (settings.dynamicAgentRoles) {
          const perspective = getAgentRole(i, settings, 'roles');
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
        if (!work.debugInfo['initial_step']) work.debugInfo['initial_step'] = [];
        work.debugInfo['initial_step'][i] = {
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
          
          const { text, thought } = this.extractStreamContent(chunk.candidates?.[0]?.content?.parts);
          fullText += text;
          fullThought += thought;
          
          // Update both new and legacy storage
          results[i] = fullText;
          thoughts[i] = fullThought;
          work.initialResponses[i] = fullText;
          if (work.initialThoughts) work.initialThoughts[i] = fullThought;

          const usage = this.extractTokenUsage(chunk.usageMetadata);
          if (usage && work.initialTokenUsage) {
            work.initialTokenUsage[i] = usage;
          }
          
          // Update generic results map
          if (!work.results) work.results = {};
          work.results['initial_step'] = [...results];

          onProgress('Initializing agents...', currentAgentStates, { ...work });
        }

        currentAgentStates = this.updateAgentState(currentAgentStates, i, { status: 'done', label: 'Drafted', stepId: 'initial_step' });
        onProgress('Initializing agents...', currentAgentStates, { ...work });
        return fullText;
      }
    });

    const outcomes = await Promise.allSettled(agentPromises);

    const failures: unknown[] = [];
    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'rejected') {
        failures.push(outcome.reason);
        console.error(`Agent ${i + 1} failed:`, outcome.reason);
        const errorMessage = `\n\n[System: Agent failed to complete. ${outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error'}]`;
        
        results[i] += errorMessage;
        if (work.initialResponses) work.initialResponses[i] = results[i];
        
        // Determine appropriate error label using BaseStep utility
        const errorLabel = this.getErrorLabel(outcome.reason, 'Draft Failed');
        currentAgentStates = this.updateAgentState(currentAgentStates, i, { status: 'error', label: errorLabel, stepId: 'initial_step' });
      }
    });

    // If ALL agents failed due to a RATE LIMIT, halt the entire swarm immediately.
    // Rate limiting is a global issue — no agent can proceed.
    // Other errors (e.g., transient network issues) might be recoverable.
    if (this.checkGlobalRateLimitFailure(failures, settings.numAgents)) {
        // Update work and notify UI BEFORE throwing so the error states are visible
        if (!work.results) work.results = {};
        work.results['initial_step'] = [...results];
        onProgress('Rate limit reached', currentAgentStates, { ...work });
        throw failures[0];
    }

    if (!work.results) work.results = {};
    work.results['initial_step'] = [...results];
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
      const perspective = getAgentRole(agentIndex, settings, 'roles');
      systemInstruction += `\n<role>${perspective.name}</role>\n<role_instruction>${perspective.instruction}</role_instruction>`;
      const roleReminder = `\n\n<system_note>\nRemember your assigned role: ${perspective.name}\n</system_note>`;
      userTurn = {
        role: 'user',
        parts: [...baseApiParts, { text: roleReminder }]
      };
    }
    systemInstruction += `\n</system_instruction>`;

    // Capture debug info for regeneration
    if (context.work.debugInfo && context.work.debugInfo['initial_step']) {
        context.work.debugInfo['initial_step'][agentIndex] = {
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
      
      const { text, thought } = this.extractStreamContent(chunk.candidates?.[0]?.content?.parts);
      fullText += text;
      fullThought += thought;

      if (context.work.initialThoughts) {
        context.work.initialThoughts[agentIndex] = fullThought;
      }

      const usage = this.extractTokenUsage(chunk.usageMetadata);
      if (usage && context.work.initialTokenUsage) {
        context.work.initialTokenUsage[agentIndex] = usage;
      }

      // Only update message display when there is actual text content (not just thinking)
      if (fullText.length > 0) {
        context.onMessageUpdate(fullText, false);
      }
    }
    return fullText;
  }
}
