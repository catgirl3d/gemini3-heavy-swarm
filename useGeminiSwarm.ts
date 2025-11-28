import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Content, Part, GroundingChunk } from '@google/genai';

export interface AppSettings {
  numAgents: number;
  model: string;
  initialInstruction: string;
  refinementInstruction: string;
  synthesizerInstruction: string;
}

export interface Source {
  uri: string;
  title: string;
}

export interface Work {
  initialResponses: (string | null)[];
  refinedResponses: (string | null)[];
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  image?: string;
  sources?: Source[];
  work?: Work;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'waiting' | 'working' | 'done';
  label: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  numAgents: 4,
  model: 'gemini-3-pro-preview',
  initialInstruction: `You are one of several cooperative expert agents.

Your job:
- Precisely understand the user's request and their *likely* intent.
- Produce a high-quality, practical, and creative answer for any domain 
`,

  refinementInstruction: `Your goal is to CRITICALLY IMPROVE the provided draft answer, for any domain.

You are given:
- The user's original request.
- One draft that "you" wrote.
- Several alternative drafts from other agents.

Your job:
1. Re-check alignment with the user's intent:
   - Is the task type correctly understood?
   - Is the level (beginner vs expert) appropriate?
   - Are all parts of the request covered?
2. Identify every weakness:
   - missing key points or steps,
   - shaky or biased reasoning,
   - factual uncertainty or hallucinations,
   - poor structure or unnecessary verbosity,
   - generic, bland, or unclear phrasing.
3. Steal and integrate the best ideas, examples, and structures from other drafts.
4. Add your own improvements:
   - sharper reasoning,
   - clearer assumptions,
   - realistic edge cases and constraints,
   - better examples or analogies if they help.

Output:
- A new, *stand-alone* answer that is strictly better than the original draft,
  more accurate, more useful, and easier to apply.
- Keep it as short as possible while still being complete.
- Do NOT describe your changes, just output the improved answer.
`,

  synthesizerInstruction: `You are the final synthesizer AI.

Input:
- The full conversation with the user.
- Several refined answers from other agents.

SECTION 1: SWARM LEARNINGS (BRIEF)
In 3–7 bullet points, summarize the most important insights, strategies, 
trade-offs, or edge cases that emerged across the agents.
Focus on differences in reasoning that are genuinely useful for the user.

SECTION 2: FINAL ANSWER
Produce a single integrated answer that:
- Fully addresses the user's request and *real* intent.
- Resolves contradictions between agents with clear justification.
- Keeps only the best ideas, discarding repetition and fluff.
- Uses a clean structure (headings, numbered steps, bullet lists where helpful).
- Is immediately actionable: include checklists, step-by-step plans, templates, 
  tables, or code only when they clearly help the user.

Prohibitions:
- No meta-commentary about tokens, models, or other agents.
- No "as an AI" disclaimers.
- No apologies or filler.`
};

export const useGeminiSwarm = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [currentWork, setCurrentWork] = useState<Work | undefined>(undefined);
  const [timer, setTimer] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<{text: string, image: string | null, imageFile: File | null} | null>(null);
  
  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('gemini3-settings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        setSettings(parsedSettings);
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('gemini3-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      startTimeRef.current = Date.now();
      interval = setInterval(() => {
        setTimer(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const sendMessage = async (userInput: string, image: string | null, imageFile: File | null, isRetry: boolean = false) => {
    if (!userInput.trim() && !image) return;

    setError(null);
    if (!isRetry) {
      setLastInput({ text: userInput, image, imageFile });
    }

    let currentMessages = messages;
    if (!isRetry) {
      const userMessage: Message = { role: 'user', parts: [{ text: userInput }], image: image || undefined };
      currentMessages = [...messages, userMessage];
      setMessages(currentMessages);
    }

    setIsLoading(true);
    setAgentStates([]);
    
    // Initialize work tracking (local for persistence, state for UI)
    const liveWork: Work = {
        initialResponses: Array(settings.numAgents).fill(null),
        refinedResponses: Array(settings.numAgents).fill(null)
    };
    setCurrentWork(liveWork);

    // Create new AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const mainChatHistory: Content[] = currentMessages.slice(0, -1).map(msg => ({
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
      setLoadingStatus('Initializing agents...');
      setAgentStates(Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'working',
        label: 'Drafting initial response...'
      })));

      const initialAgentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
        // Indicate thinking immediately
        liveWork.initialResponses[i] = '';
        setCurrentWork({ initialResponses: [...liveWork.initialResponses], refinedResponses: [...liveWork.refinedResponses] });

        const stream = await ai.models.generateContentStream({
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
            setCurrentWork({ initialResponses: [...liveWork.initialResponses], refinedResponses: [...liveWork.refinedResponses] });
        }

        setAgentStates(prev => prev.map((a, idx) => idx === i ? { ...a, status: 'done', label: 'Drafted' } : a));
        return fullText;
      });
      
      const initialAnswers = await Promise.all(initialAgentPromises);

      // STEP 2: Refined Responses
      setLoadingStatus('Refining answers...');
      setAgentStates(prev => prev.map(a => ({ ...a, status: 'working', label: 'Critiquing & Refining...' })));

      const refinementAgentPromises = initialAnswers.map(async (initialAnswer, index) => {
        const otherAnswers = initialAnswers.filter((_, i) => i !== index);
        const otherAnswersText = otherAnswers.map((answer, i) => `${i + 1}. "${answer}"`).join('\n');
        const refinementContext = `My initial response was: "${initialAnswer}". The other agents responded with:\n${otherAnswersText}\n\nBased on this context, critically re-evaluate and provide a new, improved response to the original query.`;
        
        const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
        
        // Indicate thinking immediately
        liveWork.refinedResponses[index] = '';
        setCurrentWork({ initialResponses: [...liveWork.initialResponses], refinedResponses: [...liveWork.refinedResponses] });

        const stream = await ai.models.generateContentStream({
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
            setCurrentWork({ initialResponses: [...liveWork.initialResponses], refinedResponses: [...liveWork.refinedResponses] });
        }

        setAgentStates(prev => prev.map((a, idx) => idx === index ? { ...a, status: 'done', label: 'Refined' } : a));
        return fullText;
      });
      
      const refinedAnswers = await Promise.all(refinementAgentPromises);

      // STEP 3: Final Synthesis (Streaming)
      setLoadingStatus('Synthesizing massive final response...');
      setAgentStates(prev => [
        ...prev,
        { id: 'synthesizer', name: 'Synthesizer', status: 'working', label: 'Synthesizing...' }
      ]);
      
      const synthesizerContext = `Here are the ${settings.numAgents} refined responses to the user's query. Your task is to synthesize them into the best single, final answer. REMEMBER: 2000+ LINES OF CODE IF APPLICABLE. DO NOT SHORTCUT.\n\n${refinedAnswers.map((answer, i) => `Refined Response ${i + 1}:\n"${answer}"`).join('\n\n')}`;
      const synthesizerTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${synthesizerContext}`}] };
      
      const stream = await ai.models.generateContentStream({
        model: settings.model,
        contents: [...mainChatHistory, synthesizerTurn],
        config: {
          systemInstruction: settings.synthesizerInstruction,
          temperature: 0.7,
          tools: [{googleSearch: {}}],
          thinkingConfig: { thinkingBudget: settings.model.includes('flash') ? 24576 : 32768 },
          maxOutputTokens: 65536, // Ensure max tokens for massive response
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
            isFirstChunk = false;
            setIsLoading(false);
            // Attach liveWork here immediately so it is visible during streaming
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: finalResponseText }] }]);
        } else {
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].parts[0].text = finalResponseText;
                return newMessages;
            });
        }
      }

      const sources = allGroundingChunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title: string; } => !!web && !!web.uri)
        .filter((web, index, self) => index === self.findIndex(w => w.uri === web.uri));

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        lastMessage.sources = sources.length > 0 ? sources : undefined;
        // Ensure work is definitely synced at the end
        lastMessage.work = { ...liveWork };
        return newMessages;
      });

      // Clear temporary live state
      setCurrentWork(undefined);

    } catch (error) {
      if (error instanceof Error && error.message === 'Aborted') {
        console.log('Generation aborted by user');
        setIsLoading(false);
        setLoadingStatus('Stopped by user');
        return;
      }

      console.error('Error in agentic workflow:', error);
      setIsLoading(false);
      setCurrentWork(undefined);
      
      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof Error) {
        if (error.message.includes('429')) {
          errorMessage = 'Too many requests (429). Please wait a moment and try again.';
        } else if (error.message.includes('503')) {
          errorMessage = 'Service temporarily unavailable (503). Please try again later.';
        } else if (error.message.includes('SAFETY')) {
          errorMessage = 'Response blocked due to safety settings.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      setError(errorMessage);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setLoadingStatus('Stopped');
    }
  };

  const retry = () => {
    if (lastInput) {
      sendMessage(lastInput.text, lastInput.image, lastInput.imageFile, true);
    }
  };

  return {
    messages,
    isLoading,
    loadingStatus,
    agentStates,
    currentWork,
    timer,
    settings,
    error,
    setSettings,
    sendMessage,
    stopGeneration,
    retry
  };
};