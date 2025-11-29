import { GoogleGenAI, Content, Part, GroundingChunk } from '@google/genai';
import { AppSettings, Work, AgentState, Message } from '../types';
import type { MutableRefObject } from 'react';

const debug = (settings: AppSettings, ...args: any[]) => {
  if (settings.debugMode) {
    // Centralized debug hook for swarm internals
    console.debug('[GeminiSwarm]', ...args);
  }
};

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    if (process.env.API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }

  async runSwarm(
    settings: AppSettings,
    userInput: string,
    image: string | null,
    imageFile: File | null,
    history: Message[],
    onProgress: (status: string, agents: AgentState[], work: Work, isPaused?: boolean) => void,
    onMessageUpdate: (text: string, isFinal: boolean) => void,
    signal: AbortSignal,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>
  ): Promise<{ text: string; sources?: any[]; work: Work }> {
    
    const liveWork: Work = {
      initialResponses: Array(settings.numAgents).fill(null),
      refinedResponses: Array(settings.numAgents).fill(null)
    };

    debug(settings, 'runSwarm start', {
      model: settings.model,
      numAgents: settings.numAgents,
      devMode: settings.devMode,
      pauseAfterInitial: settings.pauseAfterInitial
    });

    // --- DEVELOPMENT MODE SIMULATION ---
    if (settings.devMode) {
      debug(settings, 'mode = DEV');
      // STEP 1: Initial Responses
      debug(settings, 'DEV: step=initial');
      onProgress('Initializing agents (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'working',
        label: 'Drafting initial response...'
      })), liveWork);

      const initialAgentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
        liveWork.initialResponses[i] = '';
        onProgress('Initializing agents (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, idx) => ({
            id: `agent-${idx}`,
            name: `Agent ${idx + 1}`,
            status: idx === i ? 'working' : 'working', // Simplified status update
            label: 'Drafting initial response...'
        })), liveWork);

        const dummyText = `[DEV MODE] Initial draft from Agent ${i + 1}. This is a simulated response to demonstrate the UI flow without consuming API credits.`;
        const words = dummyText.split(' ');
        let currentText = '';
        
        for (const word of words) {
          if (signal.aborted) throw new Error('Aborted');
          await new Promise(resolve => setTimeout(resolve, 100));
          currentText += word + ' ';
          liveWork.initialResponses[i] = currentText;
          // We need to trigger a re-render in the UI, so we call onProgress with updated work
           onProgress('Initializing agents (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, idx) => ({
            id: `agent-${idx}`,
            name: `Agent ${idx + 1}`,
            status: 'working',
            label: 'Drafting initial response...'
          })), { ...liveWork });
        }
        return currentText;
      });

      const initialAnswers = await Promise.all(initialAgentPromises);
      
      // Update states to done
      onProgress('Initializing agents (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'done',
        label: 'Drafted'
      })), liveWork);


      if (settings.pauseAfterInitial) {
        debug(settings, 'DEV: pauseAfterInitial BEFORE wait');
        onProgress('Paused. Waiting for user confirmation...', Array.from({ length: settings.numAgents }, (_, i) => ({
            id: `agent-${i}`,
            name: `Agent ${i + 1}`,
            status: 'done',
            label: 'Drafted'
          })), liveWork, true);
            
        await new Promise<void>(resolve => {
            pauseResolverRef.current = resolve;
        });
        debug(settings, 'DEV: pauseAfterInitial RESUMED');
      }

      // STEP 2: Refined Responses
      debug(settings, 'DEV: step=refinement');
      onProgress('Refining answers (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'working',
        label: 'Critiquing & Refining...'
      })), liveWork);

      const refinementAgentPromises = initialAnswers.map(async (initialAnswer, index) => {
        liveWork.refinedResponses[index] = '';
        
        const dummyText = `[DEV MODE] Refined response from Agent ${index + 1}. Critiquing the initial draft and improving it based on other agents' input.`;
        const words = dummyText.split(' ');
        let currentText = '';

        for (const word of words) {
           if (signal.aborted) throw new Error('Aborted');
           await new Promise(resolve => setTimeout(resolve, 100));
           currentText += word + ' ';
           liveWork.refinedResponses[index] = currentText;
           onProgress('Refining answers (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, i) => ({
            id: `agent-${i}`,
            name: `Agent ${i + 1}`,
            status: 'working',
            label: 'Critiquing & Refining...'
          })), { ...liveWork });
        }
        return currentText;
      });

      await Promise.all(refinementAgentPromises);
      
       // Update states to done
       onProgress('Refining answers (DEV MODE)...', Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'done',
        label: 'Refined'
      })), liveWork);

      // STEP 3: Final Synthesis
      debug(settings, 'DEV: step=synthesizer');
      const agentStates: AgentState[] = Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'done',
        label: 'Refined'
      }));
      agentStates.push({ id: 'synthesizer', name: 'Synthesizer', status: 'working', label: 'Synthesizing...' });
      
      onProgress('Synthesizing final response (DEV MODE)...', agentStates, liveWork);

      const dummyFinalText = `[DEV MODE] Final Synthesized Answer.\n\nThis is the final output generated by the synthesizer agent in development mode. It combines insights from all ${settings.numAgents} agents into a cohesive response.\n\n1. **Key Insight 1**: Simulation allows for rapid UI testing.\n2. **Key Insight 2**: No API costs are incurred.\n\nConclusion: The system is functioning as expected in development mode.`;
      const words = dummyFinalText.split(' ');
      let finalResponseText = '';
      let isFirstChunk = true;
      
      for (const word of words) {
          if (signal.aborted) throw new Error('Aborted');
          await new Promise(resolve => setTimeout(resolve, 50));
          finalResponseText += word + ' ';
          if (isFirstChunk) {
            onMessageUpdate(finalResponseText, true);
            isFirstChunk = false;
          } else {
            onMessageUpdate(finalResponseText, false);
          }
      }
      
      return { text: finalResponseText, work: liveWork };

    } else {
      // --- PRODUCTION MODE ---
      debug(settings, 'mode = PROD');
      if (!this.ai) throw new Error("API Key not found");

      const mainChatHistory: Content[] = history.map(msg => ({
        role: msg.role,
        parts: msg.parts,
      }));

      const baseApiParts: Part[] = [];
      if (image && imageFile) {
        baseApiParts.push({
          inlineData: {
            mimeType: imageFile.type,
            data: image.split(',')[1],
          },
        });
      }
      if (userInput.trim()) {
        baseApiParts.push({ text: userInput });
      }

      const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

      // STEP 1: Initial Responses
      debug(settings, 'PROD: step=initial');
      let currentAgentStates = Array.from({ length: settings.numAgents }, (_, i) => ({
          id: `agent-${i}`,
          name: `Agent ${i + 1}`,
          status: 'working' as const,
          label: 'Drafting initial response...'
      }));
      onProgress('Initializing agents...', currentAgentStates, liveWork);

      const initialAgentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
        liveWork.initialResponses[i] = '';
        
        debug(settings, 'INITIAL systemInstruction', settings.initialInstruction.slice(0, 200));
        const stream = await this.ai!.models.generateContentStream({
          model: settings.model,
          contents: [...mainChatHistory, currentUserTurn],
          config: {
            systemInstruction: settings.initialInstruction,
            temperature: 0.7,
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
            liveWork.initialResponses[i] = fullText;
            onProgress('Initializing agents...', currentAgentStates, { ...liveWork });
        }
        
        // Update individual agent status locally for the next progress update
        currentAgentStates = currentAgentStates.map((a, idx) => idx === i ? { ...a, status: 'done', label: 'Drafted' } : a);
        onProgress('Initializing agents...', currentAgentStates, { ...liveWork });
        
        return fullText;
      });
      
      const initialAnswers = await Promise.all(initialAgentPromises);

      if (settings.pauseAfterInitial) {
          debug(settings, 'PROD: pauseAfterInitial BEFORE wait');
          onProgress('Paused. Waiting for user confirmation...', currentAgentStates, liveWork, true);
          await new Promise<void>(resolve => {
              pauseResolverRef.current = resolve;
          });
          debug(settings, 'PROD: pauseAfterInitial RESUMED');
      }

      // STEP 2: Refined Responses
      debug(settings, 'PROD: step=refinement');
      currentAgentStates = currentAgentStates.map(a => ({ ...a, status: 'working', label: 'Critiquing & Refining...' }));
      onProgress('Refining answers...', currentAgentStates, liveWork);

      const refinementAgentPromises = initialAnswers.map(async (initialAnswer, index) => {
        const otherAnswers = initialAnswers.filter((_, i) => i !== index);
        const otherAnswersText = otherAnswers.map((answer, i) => `${i + 1}. "${answer}"`).join('\n');
        const refinementContext = `My initial response was: "${initialAnswer}". The other agents responded with:\n${otherAnswersText}\n\nBased on this context, critically re-evaluate and provide a new, improved response to the original query.`;
        
        const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
        
        liveWork.refinedResponses[index] = '';

        debug(settings, 'REFINEMENT systemInstruction', settings.refinementInstruction.slice(0, 200));
        const stream = await this.ai!.models.generateContentStream({
          model: settings.model,
          contents: [...mainChatHistory, refinementTurn],
          config: {
            systemInstruction: settings.refinementInstruction,
            temperature: 0.7,
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
            liveWork.refinedResponses[index] = fullText;
            onProgress('Refining answers...', currentAgentStates, { ...liveWork });
        }

        currentAgentStates = currentAgentStates.map((a, idx) => idx === index ? { ...a, status: 'done', label: 'Refined' } : a);
        onProgress('Refining answers...', currentAgentStates, { ...liveWork });

        return fullText;
      });
      
      const refinedAnswers = await Promise.all(refinementAgentPromises);

      // STEP 3: Final Synthesis
      debug(settings, 'PROD: step=synthesizer');
      currentAgentStates.push({ id: 'synthesizer', name: 'Synthesizer', status: 'working', label: 'Synthesizing...' });
      onProgress('Synthesizing massive final response...', currentAgentStates, liveWork);
      
      const synthesizerContext = `Here are the ${settings.numAgents} refined responses to the user's query. Your task is to synthesize them into the best single, final answer. \n\n${refinedAnswers.map((answer, i) => `Refined Response ${i + 1}:\n"${answer}"`).join('\n\n')}`;
      const synthesizerTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${synthesizerContext}`}] };
      
      debug(settings, 'SYNTHESIZER systemInstruction', settings.synthesizerInstruction.slice(0, 200));
      const stream = await this.ai!.models.generateContentStream({
        model: settings.model,
        contents: [...mainChatHistory, synthesizerTurn],
        config: {
          systemInstruction: settings.synthesizerInstruction,
          temperature: 0.7,
          tools: [{googleSearch: {}}],
          thinkingConfig: { thinkingBudget: settings.model.includes('flash') ? 24576 : 32768 },
          maxOutputTokens: 65536,
        },
      });

      let finalResponseText = '';
      const allGroundingChunks: GroundingChunk[] = [];
      let isFirstChunk = true;
 
      for await (const chunk of stream) {
        if (signal.aborted) throw new Error('Aborted');
        finalResponseText += chunk.text;
        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
            allGroundingChunks.push(...groundingChunks);
        }
        if (isFirstChunk) {
          onMessageUpdate(finalResponseText, true);
          isFirstChunk = false;
        } else {
          onMessageUpdate(finalResponseText, false);
        }
      }

      const sources = allGroundingChunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title: string; } => !!web && !!web.uri)
        .filter((web, index, self) => index === self.findIndex(w => w.uri === web.uri));

      return { text: finalResponseText, sources, work: liveWork };
    }
  }
}