import { Content } from '@google/genai';
import { StepContext, StepId } from '../../types/steps';
import { AgentState } from '../../types';
import { prepareGeminiContent } from '../contentUtils';
import { getGenerationConfig } from '../geminiConfig';
import { getAgentRole } from './utils/roleUtils';
import { BaseStep } from './BaseStep';

export class RefinementStep extends BaseStep {
  id: StepId = 'refinement_step';
  name = 'Refinement Step';
  description = 'Agents critique and refine their responses based on other agents\' inputs.';
  ui = {
    visibleInModal: true,
    regenerateLabel: 'Regenerate Refined Response'
  };

  async execute(context: StepContext): Promise<string[]> {
    const { ai, settings, history, userInput, image, imageFile, work, onProgress, signal } = context;

    // Ensure we have initial responses
    const initialResponses = (work.results?.['initial_step'] || work.initialResponses) as string[];
    if (!initialResponses || initialResponses.length === 0) {
      throw new Error('Cannot run refinement step without initial responses');
    }

    // Initialize results array
    const results: string[] = Array(settings.numAgents).fill('');
    const thoughts: string[] = Array(settings.numAgents).fill('');
    
    // Initialize legacy field if needed
    if (!work.refinedResponses) work.refinedResponses = Array(settings.numAgents).fill(null);
    if (!work.refinedThoughts) work.refinedThoughts = Array(settings.numAgents).fill(null);
    if (!work.refinedTokenUsage) work.refinedTokenUsage = Array(settings.numAgents).fill(null);

    // Initialize agent states using BaseStep utility
    let currentAgentStates: AgentState[] = this.createAgentStates(settings.numAgents, settings, {
      stepId: 'refinement_step',
      status: 'working',
      statusLabel: 'Critiquing & Refining...'
    });
    
    onProgress('Refining answers...', currentAgentStates, work);

    // Prepare base content
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    // Execute agents
    const agentPromises = initialResponses.map(async (initialAnswer: string, index: number) => {
      if (settings.devMode) {
        // DEV MODE SIMULATION using BaseStep utility
        const dummyText = this.getDevModeText('refinement_step', index);
        
        const currentText = await this.simulateDevMode(
            dummyText,
            signal,
            (chunk) => {
                 // Update both new and legacy storage
                 results[index] = chunk;
                 work.refinedResponses[index] = chunk;
                 
                 // Update generic results map
                 if (!work.results) work.results = {};
                 work.results['refinement_step'] = [...results];
       
                 onProgress('Refining answers (DEV MODE)...', currentAgentStates, { ...work });
            },
           100 // Fast simulation for refinement
        );
        
        currentAgentStates = this.updateAgentState(currentAgentStates, index, { status: 'done', label: 'Refined', stepId: 'refinement_step' });
        onProgress('Refining answers (DEV MODE)...', currentAgentStates, { ...work });
        return currentText;

      } else {
        // PROD MODE
        if (!ai) throw new Error("API Key not found");

        const peerDrafts = initialResponses
          .map((text: string, i: number) => ({ text, id: i + 1 }))
          .filter((_, i) => i !== index)
          .filter((a) => !a.text.trim().startsWith('[System:')) // Filter out failed agents
          .map((a) => `    <draft id="agent_${a.id}">\n${a.text}\n    </draft>`)
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
            const role = getAgentRole(index, settings, 'criticRoles');
            if (role.instruction) {
                roleInstruction = `\n\n<role_assignment>\n${role.instruction}\n</role_assignment>`;
            }
        }

        const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.refinementInstruction}</mission>${roleInstruction}\n</system_instruction>`;

        // Capture debug info
        if (!work.debugInfo) work.debugInfo = {};
        if (!work.debugInfo['refinement_step']) work.debugInfo['refinement_step'] = [];
        work.debugInfo['refinement_step'][index] = {
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
        let fullThought = '';
        for await (const chunk of stream) {
          if (signal.aborted) throw new Error('Aborted');
          
          const { text, thought } = this.extractStreamContent(chunk.candidates?.[0]?.content?.parts);
          fullText += text;
          fullThought += thought;
          
          // Update both new and legacy storage
          results[index] = fullText;
          thoughts[index] = fullThought;
          work.refinedResponses[index] = fullText;
          if (work.refinedThoughts) work.refinedThoughts[index] = fullThought;

          const usage = this.extractTokenUsage(chunk.usageMetadata);
          if (usage && work.refinedTokenUsage) {
            work.refinedTokenUsage[index] = usage;
          }
          
          // Update generic results map
          if (!work.results) work.results = {};
          work.results['refinement_step'] = [...results];

          onProgress('Refining answers...', currentAgentStates, { ...work });
        }

        currentAgentStates = this.updateAgentState(currentAgentStates, index, { status: 'done', label: 'Refined', stepId: 'refinement_step' });
        onProgress('Refining answers...', currentAgentStates, { ...work });
        return fullText;
      }
    });

    const outcomes = await Promise.allSettled(agentPromises);

    const failures: unknown[] = [];
    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'rejected') {
        failures.push(outcome.reason);
        console.error(`Critic ${i + 1} failed refinement:`, outcome.reason);
        const errorMessage = `\n\n[System: Critic failed to refine. ${outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error'}]`;
        
        results[i] += errorMessage;
        if (work.refinedResponses) work.refinedResponses[i] = results[i];
        
        // Determine appropriate error label using BaseStep utility
        const errorLabel = this.getErrorLabel(outcome.reason, 'Refinement Failed');
        currentAgentStates = this.updateAgentState(currentAgentStates, i, { status: 'error', label: errorLabel, stepId: 'refinement_step' });
      }
    });

    // Check global rate limit using BaseStep utility
    if (this.checkGlobalRateLimitFailure(failures, settings.numAgents)) {
        if (!work.results) work.results = {};
        work.results['refinement_step'] = [...results];
        onProgress('Rate limit reached', currentAgentStates, { ...work });
        throw failures[0];
    }

    if (!work.results) work.results = {};
    work.results['refinement_step'] = [...results];
    onProgress('Refinement completed', currentAgentStates, { ...work });

    return results;
  }

  async regenerate(context: StepContext, agentIndex: number): Promise<string> {
    const { ai, settings, history, userInput, image, imageFile, work, signal } = context;
    if (!ai) throw new Error("API Key not found");

    // Ensure we have initial responses
    const initialResponses = (work.results?.['initial_step'] || work.initialResponses) as string[];
    if (!initialResponses || initialResponses.length === 0) {
      throw new Error('Cannot regenerate refinement without initial responses');
    }

    // Prepare content
    const { history: mainChatHistory, baseApiParts } = prepareGeminiContent(history, userInput, image, imageFile);

    const initialAnswer = initialResponses[agentIndex];
    const peerDrafts = initialResponses
      .map((text: string, i: number) => ({ text, id: i + 1 }))
      .filter((_, i) => i !== agentIndex)
      .filter((a) => !a.text.trim().startsWith('[System:')) // Filter out failed agents
      .map((a) => `    <draft id="agent_${a.id}">\n${a.text}\n    </draft>`)
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
        const role = getAgentRole(agentIndex, settings, 'criticRoles');
        if (role.instruction) {
            roleInstruction = `\n\n<role_assignment>\n${role.instruction}\n</role_assignment>`;
        }
    }

    const systemInstruction = `<system_instruction>\n# SYSTEM INSTRUCTION\n<mission>${activeProfile.refinementInstruction}</mission>${roleInstruction}\n</system_instruction>`;

    // Capture debug info for regeneration
    if (context.work.debugInfo && context.work.debugInfo['refinement_step']) {
        context.work.debugInfo['refinement_step'][agentIndex] = {
            systemInstruction,
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
    let fullThought = '';
    for await (const chunk of stream) {
      if (signal.aborted) throw new Error('Aborted');
      
      const { text, thought } = this.extractStreamContent(chunk.candidates?.[0]?.content?.parts);
      fullText += text;
      fullThought += thought;

      if (context.work.refinedThoughts) {
        context.work.refinedThoughts[agentIndex] = fullThought;
      }

      const usage = this.extractTokenUsage(chunk.usageMetadata);
      if (usage && context.work.refinedTokenUsage) {
        context.work.refinedTokenUsage[agentIndex] = usage;
      }

      // Only update message display when there is actual text content (not just thinking)
      if (fullText.length > 0) {
        context.onMessageUpdate(fullText, false);
      }
    }
    return fullText;
  }
}
