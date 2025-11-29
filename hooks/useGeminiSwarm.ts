import { useState, useRef, useEffect } from 'react';
import { AppSettings, Message, AgentState, Work } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_PROFILES, DEFAULT_ROLE_PROFILES } from '../constants';
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
  const regenerateAbortControllerRef = useRef<AbortController | null>(null);
  const pauseResolverRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);
  const geminiServiceRef = useRef<GeminiService>(new GeminiService());

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('gemini3-settings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        // Migration: Ensure profiles exist
        if (!parsedSettings.profiles) {
          parsedSettings.profiles = DEFAULT_PROFILES;
          parsedSettings.activeProfileId = 'default';
          // Migrate old instructions to a custom profile if they differ from default
          if (
            parsedSettings.initialInstruction !== DEFAULT_PROFILES[0].initialInstruction ||
            parsedSettings.refinementInstruction !== DEFAULT_PROFILES[0].refinementInstruction ||
            parsedSettings.synthesizerInstruction !== DEFAULT_PROFILES[0].synthesizerInstruction
          ) {
             const customProfile = {
                id: 'custom-migrated',
                name: 'Custom (Migrated)',
                initialInstruction: parsedSettings.initialInstruction || DEFAULT_PROFILES[0].initialInstruction,
                refinementInstruction: parsedSettings.refinementInstruction || DEFAULT_PROFILES[0].refinementInstruction,
                synthesizerInstruction: parsedSettings.synthesizerInstruction || DEFAULT_PROFILES[0].synthesizerInstruction
             };
             parsedSettings.profiles.push(customProfile);
             parsedSettings.activeProfileId = 'custom-migrated';
          }
        }
        // Migration: Ensure roleProfiles exist
        if (!parsedSettings.roleProfiles) {
            parsedSettings.roleProfiles = DEFAULT_ROLE_PROFILES;
            parsedSettings.activeRoleProfileId = 'default-roles';
            
            // Migrate old agentRoles to a custom profile if they exist
            if (parsedSettings.agentRoles && parsedSettings.agentRoles.length > 0) {
                 const customRoleProfile = {
                    id: 'custom-roles-migrated',
                    name: 'Custom Roles (Migrated)',
                    roles: parsedSettings.agentRoles
                 };
                 parsedSettings.roleProfiles.push(customRoleProfile);
                 parsedSettings.activeRoleProfileId = 'custom-roles-migrated';
            }
            // Clean up old property
            delete parsedSettings.agentRoles;
        }
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

    // This will always hold the latest snapshot of agent states
    let latestAgents: AgentState[] = [];

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
          // keep an up-to-date copy for attaching to the final message
          latestAgents = agents;
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork({ ...work, agentStates: agents });
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
        // Attach the final, real agent states snapshot to the message work
        lastMessage.work = { ...result.work, agentStates: latestAgents };
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

  const regenerateAgentResponse = async (messageIndex: number, phase: 'initial' | 'refined', agentIndex: number) => {
    if (!lastInput) return;
    
    // Find the message to update or use currentWork if it's the active generation
    const targetMessage = messages[messageIndex];
    let workContext = targetMessage?.work;
    
    if (!workContext && currentWork) {
        workContext = currentWork;
    }

    if (!workContext) return;

    // Helper to keep agent status in sync across: live state, current work, and stored message work
    const updateAgentStatus = (status: AgentState['status'], label: string) => {
        // Update top-level agentStates used by the loader
        setAgentStates(prev => {
            const newStates = [...prev];
            if (newStates[agentIndex]) {
                newStates[agentIndex] = { ...newStates[agentIndex], status, label };
            }
            return newStates;
        });

        // Update the stored work attached to the specific message (for history view)
        setMessages(prev => {
            const newMessages = [...prev];
            const msg = newMessages[messageIndex];
            if (msg && msg.work && msg.work.agentStates) {
                const agentStatesCopy = [...msg.work.agentStates];
                if (agentStatesCopy[agentIndex]) {
                    agentStatesCopy[agentIndex] = { ...agentStatesCopy[agentIndex], status, label };
                    msg.work = { ...msg.work, agentStates: agentStatesCopy };
                }
            }
            return newMessages;
        });

        // Update the live currentWork used in the "Show Agent Work (Live)" section
        setCurrentWork(prev => {
            if (!prev || !prev.agentStates) return prev;
            const agentStatesCopy = [...prev.agentStates];
            if (agentStatesCopy[agentIndex]) {
                agentStatesCopy[agentIndex] = { ...agentStatesCopy[agentIndex], status, label };
                return { ...prev, agentStates: agentStatesCopy };
            }
            return prev;
        });
    };

    // Create new AbortController for this specific operation
    if (regenerateAbortControllerRef.current) {
        regenerateAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    regenerateAbortControllerRef.current = abortController;

    try {
        // Set status to working while regeneration is in progress
        updateAgentStatus('working', 'Regenerating...');

        // We need the history up to this point
        const history = messages.slice(0, messageIndex);

        await geminiServiceRef.current.regenerateResponse(
            settings,
            lastInput.text,
            lastInput.image,
            lastInput.imageFile,
            history,
            agentIndex,
            phase,
            workContext,
            (text) => {
                // Update Messages if work is attached
                setMessages(prev => {
                    const newMessages = [...prev];
                    const msg = newMessages[messageIndex];
                    if (msg && msg.work) {
                        const newWork = { ...msg.work };
                        if (phase === 'initial') {
                            newWork.initialResponses = [...newWork.initialResponses];
                            newWork.initialResponses[agentIndex] = text;
                        } else {
                            newWork.refinedResponses = [...newWork.refinedResponses];
                            newWork.refinedResponses[agentIndex] = text;
                        }
                        msg.work = newWork;
                    }
                    return newMessages;
                });

                // Update Current Work (for live view)
                setCurrentWork(prev => {
                    if (!prev) return prev;
                    const newWork = { ...prev };
                    if (phase === 'initial') {
                        newWork.initialResponses = [...newWork.initialResponses];
                        newWork.initialResponses[agentIndex] = text;
                    } else {
                        newWork.refinedResponses = [...newWork.refinedResponses];
                        newWork.refinedResponses[agentIndex] = text;
                    }
                    return newWork;
                });
            },
            abortController.signal
        );

    } catch (error) {
        console.error("Regeneration failed:", error);
    } finally {
        regenerateAbortControllerRef.current = null;
        // Mark agent as done once regeneration finishes
        updateAgentStatus('done', 'Regenerated');
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
    continueGeneration,
    regenerateAgentResponse
  };
};