import { useState, useRef, useEffect } from 'react';
import { AppSettings, Message, AgentState, Work } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { GeminiService } from '../services/gemini';

export const useGeminiSwarm = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [currentWork, setCurrentWork] = useState<Work | undefined>(undefined);
  const [timer, setTimer] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<{text: string, image: string | null, imageFile: File | null} | null>(null);
  
  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseResolverRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);
  const geminiServiceRef = useRef<GeminiService>(new GeminiService());

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
    if (isLoading && !isPaused) {
      startTimeRef.current = Date.now() - timer; // Resume timer
      interval = setInterval(() => {
        setTimer(Date.now() - startTimeRef.current);
      }, 100);
    } else if (!isLoading && !isPaused) {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isLoading, isPaused]);

  const continueGeneration = () => {
    if (pauseResolverRef.current) {
        pauseResolverRef.current();
        pauseResolverRef.current = null;
        setIsPaused(false);
    }
  };

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
    setIsPaused(false);
    setAgentStates([]);
    setCurrentWork({
        initialResponses: Array(settings.numAgents).fill(null),
        refinedResponses: Array(settings.numAgents).fill(null)
    });

    // Create new AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      const result = await geminiServiceRef.current.runSwarm(
        settings,
        userInput,
        image,
        imageFile,
        currentMessages,
        (status, agents, work, isPaused) => {
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork(work);
          if (isPaused !== undefined) {
            setIsPaused(isPaused);
          }
        },
        (text, isFinal) => {
           if (isFinal) {
             setIsLoading(false);
           }
           setMessages(prev => {
             const newMessages = [...prev];
             // If the last message is from the model, update it. Otherwise add a new one.
             const lastMsg = newMessages[newMessages.length - 1];
             if (lastMsg.role === 'model') {
               lastMsg.parts[0].text = text;
             } else {
               newMessages.push({ role: 'model', parts: [{ text }] });
             }
             return newMessages;
           });
        },
        signal,
        pauseResolverRef
      );

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        lastMessage.sources = result.sources;
        lastMessage.work = result.work;
        return newMessages;
      });

      setCurrentWork(undefined);
      setIsLoading(false);

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
      setIsPaused(false);
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
    isPaused,
    loadingStatus,
    agentStates,
    currentWork,
    timer,
    settings,
    error,
    setSettings,
    sendMessage,
    stopGeneration,
    retry,
    continueGeneration
  };
};