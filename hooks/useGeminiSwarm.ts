import { useState, useRef, useEffect } from 'react';
import { AppSettings, Message, AgentState, Work, RoleProfile, SavedInstruction, AgentRole } from '../types';
import { StepId } from '../types/steps';
import { DEFAULT_SETTINGS, DEFAULT_PROFILES, DEFAULT_ROLE_PROFILES } from '../constants';

import { GeminiService } from '../services/gemini';

/**
 * Represents settings from older versions of the application for migration purposes.
 */
interface LegacyAppSettings extends Partial<AppSettings> {
  initialInstruction?: string;
  refinementInstruction?: string;
  synthesizerInstruction?: string;
  agentRoles?: AgentRole[];
}

/**
 * Returns a Work object with guaranteed initialized results.
 * Pure function - does not mutate the input.
 * 
 * @param work - The source Work object
 * @returns Work object with initialized results (may be the same object if results already exist)
 */
function withEnsuredResults(work: Work): Work & { results: NonNullable<Work['results']> } {
  if (work.results) return work as Work & { results: NonNullable<Work['results']> };
  return { ...work, results: {} };
}

/**
 * Returns a new Work object with updated step result.
 * Pure function - does not mutate the input.
 * 
 * @param work - The source Work object (not modified)
 * @param stepId - The step identifier
 * @param agentIndex - Agent index (ignored for synthesis_step)
 * @param text - The text content to store
 * @returns New Work object with updated results
 */
function updateStepResult(
  work: Work,
  stepId: StepId,
  agentIndex: number,
  text: string
): Work {
  const currentResults = work.results ?? {};
  
  let updatedStepData: unknown;
  
  if (stepId === 'synthesis_step') {
    const existing = currentResults[stepId];
    // Explicit array check prevents incorrect spreading if existing is an array (legacy bug)
    const base = existing && typeof existing === 'object' && !Array.isArray(existing) 
      ? (existing as Record<string, unknown>) 
      : {};
    updatedStepData = { ...base, text };
  } else {
    const currentArray = (currentResults[stepId] as string[] | undefined) ?? [];
    const newArray = [...currentArray];
    newArray[agentIndex] = text;
    updatedStepData = newArray;
  }

  return {
    ...work,
    results: {
      ...currentResults,
      [stepId]: updatedStepData
    }
  };
}

export const useGeminiSwarm = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [currentWork, setCurrentWork] = useState<Work | undefined>(undefined);
  const [timer, setTimer] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<{ text: string, image: string | null, imageFile: File | null } | null>(null);

  const startTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const regenerateAbortControllerRef = useRef<AbortController | null>(null);
  const pauseResolverRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);
  const geminiServiceRef = useRef<GeminiService>(new GeminiService());
  const messagesRef = useRef<Message[]>(messages);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('gemini3-settings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings) as LegacyAppSettings;
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
        } else {
          // Ensure new default profiles are available even if settings exist
          const madScientistProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === 'mad-scientists');
          if (madScientistProfile && !parsedSettings.roleProfiles.some((p: RoleProfile) => p.id === 'mad-scientists')) {
            parsedSettings.roleProfiles.push(madScientistProfile);
          }
        }

        // Migration: Ensure criticRoles exist in roleProfiles
        if (parsedSettings.roleProfiles) {
          parsedSettings.roleProfiles = parsedSettings.roleProfiles.map((profile: RoleProfile) => {
            if (!profile.criticRoles) {
              // Find matching default profile to copy critic roles from
              const defaultProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === profile.id);
              return {
                ...profile,
                criticRoles: defaultProfile?.criticRoles || []
              };
            }
            return profile;
          });
        }

        // Migration: Ensure savedInstructions exist
        if (!parsedSettings.savedInstructions) {
          parsedSettings.savedInstructions = [];
        }

        // Migration: Ensure savedRoles exist
        if (!parsedSettings.savedRoles) {
          parsedSettings.savedRoles = [];
        }

        // Migration: Ensure pauseAfterRefinement exists
        if (parsedSettings.pauseAfterRefinement === undefined) {
          parsedSettings.pauseAfterRefinement = false;
        }

        // Migration: Ensure dynamicAgentRoles exists (default to true)
        if (parsedSettings.dynamicAgentRoles === undefined) {
          parsedSettings.dynamicAgentRoles = true;
        }

        // Migration: Update identifiers to use _step and _prompt suffixes
        if (parsedSettings.savedInstructions) {
          parsedSettings.savedInstructions = parsedSettings.savedInstructions.map((inst: SavedInstruction | { type: string }) => {
            if (inst.type === 'initial') (inst as any).type = 'initial_prompt';
            if (inst.type === 'refinement') (inst as any).type = 'refinement_prompt';
            if (inst.type === 'synthesizer') (inst as any).type = 'synthesis_prompt';
            return inst as SavedInstruction;
          });
        }

        if (parsedSettings.numAgents > 5) {
          parsedSettings.numAgents = 5;
        }

        setSettings(parsedSettings as AppSettings);
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
    setSettingsLoaded(true);
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (settingsLoaded) {
      localStorage.setItem('gemini3-settings', JSON.stringify(settings));
    }
  }, [settings, settingsLoaded]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading && !isPaused) {
      startTimeRef.current = Date.now() - timer; // Resume timer
      interval = setInterval(() => {
        setTimer(Date.now() - startTimeRef.current);
      }, 1000);
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

    // Use functional update to avoid stale closure issues
    // messagesRef is updated synchronously so we can pass correct value to runSwarm
    let currentMessages = messagesRef.current;
    if (!isRetry) {
      const userMessage: Message = { id: crypto.randomUUID(), role: 'user', parts: [{ text: userInput }], image: image || undefined };
      setMessages(prev => {
        currentMessages = [...prev, userMessage];
        messagesRef.current = currentMessages;
        return currentMessages;
      });
    }

    setIsLoading(true);
    setIsPaused(false);
    setAgentStates([]);
    setCurrentWork({
      results: {}
    });

    // This will always hold the latest snapshot of agent states
    let latestAgents: AgentState[] = [];
    // This will always hold the latest snapshot of work (including results/debugInfo/etc.)
    let latestWork: Work | undefined;

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
          // keep an up-to-date copy for attaching to the final message or error state
          latestAgents = agents;
          latestWork = { ...work, agentStates: agents };
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork(latestWork);
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
            const lastMsgIndex = newMessages.length - 1;
            const lastMsg = newMessages[lastMsgIndex];
            
            if (lastMsg.role === 'model') {
              // ✅ Immutable update: create new message object with new parts array
              newMessages[lastMsgIndex] = {
                ...lastMsg,
                parts: [{ ...lastMsg.parts[0], text }, ...lastMsg.parts.slice(1)]
              };
            } else {
              newMessages.push({ id: crypto.randomUUID(), role: 'model', parts: [{ text }] });
            }
            return newMessages;
          });
        },
        signal,
        pauseResolverRef
      );

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsgIndex = newMessages.length - 1;
        const lastMessage = newMessages[lastMsgIndex];
        
        // ✅ Immutable update: create new message object
        newMessages[lastMsgIndex] = {
          ...lastMessage,
          sources: result.sources,
          work: { ...result.work, agentStates: latestAgents }
        };
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

      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof Error) {
        const errorStr = error.message + (error.stack || '');
        if (errorStr.includes('429')) {
          errorMessage = 'Too many requests (429). Please wait a moment and try again.';
        } else if (errorStr.includes('503')) {
          errorMessage = 'Service temporarily unavailable (503). Please try again later.';
        } else if (errorStr.includes('SAFETY')) {
          errorMessage = 'Response blocked due to safety settings.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }

      // Check if we have partial results to display
      const initialResults = latestWork?.results?.['initial_step'];
      const refinementResults = latestWork?.results?.['refinement_step'];
      const hasPartialResults = latestWork && (
        (Array.isArray(initialResults) && initialResults.some(r => r && !r.includes('[System:'))) ||
        (Array.isArray(refinementResults) && refinementResults.some(r => r && !r.includes('[System:')))
      );

      if (hasPartialResults) {
        // Keep isLoading true so LoadingIndicator stays visible (preserves ShowWork details open state)
        // Update status to show error but allow user to see partial work and retry
        setLoadingStatus(`Error: ${errorMessage}`);
        setIsPaused(true); // Pause so continue button is available
        
        // Keep currentWork so ShowWork stays visible in LoadingIndicator
        // Don't create a message or clear work - LoadingIndicator shows everything needed
      } else {
        // No partial results - show error banner and stop loading
        setIsLoading(false);
        setCurrentWork(undefined);
        setError(errorMessage);
      }
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

  const regenerateAgentResponse = async (messageIndex: number, stepId: StepId, agentIndex: number) => {
    if (!lastInput) return;

    // Find the message to update or use currentWork if it's the active generation
    const targetMessage = messages[messageIndex];
    let workContext = targetMessage?.work;

    if (!workContext && currentWork) {
      workContext = currentWork;
    }

    if (!workContext) return;

    // Helper to get updated agent name based on current settings
    const getUpdatedAgentName = (index: number, stepId: StepId) => {
      const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];

      if (stepId === 'initial_step') {
        const perspectives = activeRoleProfile?.roles || [];
        if (perspectives.length === 0) return `Agent ${index + 1}`;
        const role = perspectives[index % perspectives.length];
        return settings.dynamicAgentRoles ? `Agent ${index + 1} (${role.name})` : `Agent ${index + 1}`;
      } else if (stepId === 'refinement_step') {
        const perspectives = activeRoleProfile?.criticRoles || [];
        if (perspectives.length === 0) return `Critic ${index + 1}`;
        const role = perspectives[index % perspectives.length];
        return settings.dynamicAgentRoles ? `Critic ${index + 1} (${role.name})` : `Critic ${index + 1}`;
      }
      return `Agent ${index + 1}`;
    };

    // Helper to keep agent status in sync across: live state, current work, and stored message work
    const updateAgentStatus = (status: AgentState['status'], label: string) => {
      const updateStates = (states: AgentState[] | undefined): AgentState[] | undefined => {
        if (!states) return states;
        const copy = [...states];

        if (stepId === 'synthesis_step') {
          const synthIndex = copy.findIndex(a => a.id === 'synthesizer_agent');
          if (synthIndex >= 0) {
            copy[synthIndex] = { ...copy[synthIndex], status, label, stepId };
          }
        } else {
          if (copy[agentIndex]) {
            // Update name if settings changed
            const newName = getUpdatedAgentName(agentIndex, stepId);
            copy[agentIndex] = { ...copy[agentIndex], status, label, name: newName, stepId };
          }
        }

        return copy;
      };

      // Update top-level agentStates used by the loader
      setAgentStates(prev => {
        const updated = updateStates(prev);
        return updated ?? prev;
      });

      // Update the stored work attached to the specific message (for history view)
      setMessages(prev => {
        const newMessages = [...prev];
        const msg = newMessages[messageIndex];
        if (msg && msg.work && msg.work.agentStates) {
          const updated = updateStates(msg.work.agentStates);
          if (updated) {
            // ✅ Immutable update: create new message with updated work
            newMessages[messageIndex] = {
              ...msg,
              work: { ...msg.work, agentStates: updated }
            };
          }
        }
        return newMessages;
      });

      // Update the live currentWork used in the "Show Agent Work (Live)" section
      setCurrentWork(prev => {
        if (!prev || !prev.agentStates) return prev;
        const updated = updateStates(prev.agentStates);
        return updated ? { ...prev, agentStates: updated } : prev;
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
      const regenLabel = stepId === 'initial_step' ? 'Regenerating Draft...' :
        stepId === 'refinement_step' ? 'Regenerating Critique...' :
          stepId === 'synthesis_step' ? 'Regenerating Synthesis...' : 'Regenerating...';
      
      // Reset pause state when starting regeneration (hides Continue button)
      if (stepId === 'synthesis_step') {
        setIsPaused(false);
      }
      
      updateAgentStatus('working', regenLabel);

      // We need the history up to this point
      const history = messages.slice(0, messageIndex);

      const result = await geminiServiceRef.current.regenerateResponse(
        settings,
        lastInput.text,
        lastInput.image,
        lastInput.imageFile,
        history,
        agentIndex,
        stepId,
        workContext,
        (text, isFirstChunk) => {
          // Update Messages (both visible text and attached work, if present)
          setMessages(prev => {
            const newMessages = [...prev];
            let msg = newMessages[messageIndex];
            let targetIndex = messageIndex;

            // For synthesis: update the final answer in the message card itself
            // If the target message is not a model message (e.g., error happened before any text was streamed),
            // we need to find or create a model message to display the regenerated answer.
              if (stepId === 'synthesis_step') {
              if (settings.debugMode) {
                console.log('[DEBUG:Synthesis] onUpdate called:', { textLength: text.length, isFirstChunk, messageIndex });
                if (isFirstChunk) {
                  console.log('[DEBUG:Synthesis] First chunk - hiding loading UI');
                }
              }
              
              if (isFirstChunk) {
                  // JUMP BEHAVIOR: immediately hide cards and indicator when first chunk of text arrives
                  setIsLoading(false);
                  setIsPaused(false);
              }

              if (!msg || msg.role !== 'model') {
                if (settings.debugMode) {
                  console.log('[DEBUG:Synthesis] Target msg is not model:', { msgRole: msg?.role, messageIndex });
                }
                // Check if there's already a model message after the user message
                const nextMsg = newMessages[messageIndex + 1];
                if (nextMsg && nextMsg.role === 'model') {
                  // Use the existing model message
                  if (settings.debugMode) {
                    console.log('[DEBUG:Synthesis] Found existing model message at index', messageIndex + 1);
                  }
                  msg = nextMsg;
                  targetIndex = messageIndex + 1;
                } else {
                  // Create a new model message with the work from currentWork or workContext
                  if (settings.debugMode) {
                    console.log('[DEBUG:Synthesis] Creating NEW model message');
                  }
                  const newModelMessage: Message = {
                    id: crypto.randomUUID(),
                    role: 'model',
                    parts: [{ text }],
                    work: workContext
                  };
                  newMessages.push(newModelMessage);
                  msg = newModelMessage;
                  targetIndex = newMessages.length - 1;
                  if (settings.debugMode) {
                    console.log('[DEBUG:Synthesis] New message created, array length:', newMessages.length);
                  }
                }
              }
              
              // Now update the model message text
              if (settings.debugMode) {
                console.log('[DEBUG:Synthesis] Updating model message text:', { hasMsg: !!msg, msgRole: msg?.role, textLength: text.length });
              }
              if (msg && msg.role === 'model') {
                // ✅ Immutable update: create new message with updated parts
                const updatedParts = msg.parts && msg.parts.length > 0
                  ? [{ ...msg.parts[0], text }, ...msg.parts.slice(1)]
                  : [{ text }];
                
                newMessages[targetIndex] = {
                  ...msg,
                  parts: updatedParts
                };
                msg = newMessages[targetIndex]; // Update reference for work update below
                
                if (settings.debugMode) {
                  console.log('[DEBUG:Synthesis] Text updated successfully');
                }
              } else {
                // error should probably be logged regardless of debugMode as it's a critical failure, 
                // but following the user's request to tie logs to the checkbox:
                if (settings.debugMode) {
                  console.error('[DEBUG:Synthesis] ERROR: Could not update text - msg is not a model message!');
                }
              }
            }

            // Update work data on the message (for non-synthesis stepIds this is the main logic,
            // for synthesis we already handled the text above but still need to update work.results)
            if (msg && msg.work) {
                let updatedWork = { ...msg.work };

                // Update agent names in work object (use correct array per step)
                if (stepId === 'initial_step' && updatedWork.agentNames) {
                  const newName = getUpdatedAgentName(agentIndex, stepId);
                  const newAgentNames = [...updatedWork.agentNames];
                  newAgentNames[agentIndex] = newName;
                  updatedWork = { ...updatedWork, agentNames: newAgentNames };
                } else if (stepId === 'refinement_step' && updatedWork.criticNames) {
                  const newName = getUpdatedAgentName(agentIndex, stepId);
                  const newCriticNames = [...updatedWork.criticNames];
                  newCriticNames[agentIndex] = newName;
                  updatedWork = { ...updatedWork, criticNames: newCriticNames };
                }

                // Update generic results using helper
                updatedWork = updateStepResult(updatedWork, stepId, agentIndex, text);

                // ✅ Immutable update: create new message with updated work
                newMessages[targetIndex] = {
                  ...newMessages[targetIndex],
                  work: updatedWork
                };
            }

            return newMessages;
          });

          // Update Current Work (for live view)
          setCurrentWork(prev => {
            if (!prev) return prev;
            let updatedWork = { ...prev };

            // Update agent names in work object (use correct array per step)
            if (stepId === 'initial_step' && updatedWork.agentNames) {
              const newName = getUpdatedAgentName(agentIndex, stepId);
              const newAgentNames = [...updatedWork.agentNames];
              newAgentNames[agentIndex] = newName;
              updatedWork = { ...updatedWork, agentNames: newAgentNames };
            } else if (stepId === 'refinement_step' && updatedWork.criticNames) {
              const newName = getUpdatedAgentName(agentIndex, stepId);
              const newCriticNames = [...updatedWork.criticNames];
              newCriticNames[agentIndex] = newName;
              updatedWork = { ...updatedWork, criticNames: newCriticNames };
            }

            // Update generic results using helper
            return updateStepResult(updatedWork, stepId, agentIndex, text);
          });
        },
        // onProgress callback - update UI state during regeneration (especially for synthesis)
        (status, agents, work) => {
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork({ ...work, agentStates: agents });
        },
        abortController.signal
      );

      // Handle full result for synthesis (including sources)
      if (typeof result === 'object' && result !== null && 'sources' in result) {
        setMessages(prev => {
          const newMessages = [...prev];
          let msg = newMessages[messageIndex];
          let targetIndex = messageIndex;
          
          // If we found/created a model message during streaming, it might be at messageIndex or messageIndex + 1
          if (!msg || msg.role !== 'model') {
            const nextMsg = newMessages[messageIndex + 1];
            if (nextMsg && nextMsg.role === 'model') {
              msg = nextMsg;
              targetIndex = messageIndex + 1;
            }
          }
          
          if (msg && msg.role === 'model') {
            // ✅ Immutable update: create new message with updated sources and work
            const updatedWork = msg.work ? (() => {
              const ensuredWork = withEnsuredResults(msg.work!);
              return {
                ...ensuredWork,
                results: {
                  ...ensuredWork.results,
                  [stepId]: result
                }
              };
            })() : undefined;
            
            newMessages[targetIndex] = {
              ...msg,
              sources: result.sources,
              work: updatedWork
            };
          }
          return newMessages;
        });

        // Also update currentWork
        setCurrentWork(prev => {
          if (!prev || !prev.results) return prev;
          return {
            ...prev,
            results: {
              ...prev.results,
              [stepId]: result
            }
          };
        });
      }

    } catch (error) {
      console.error("Regeneration failed:", error);
      
      // Determine error message for the status label
      let errorLabel = 'Regeneration Failed';
      if (error instanceof Error) {
        const errorStr = error.message + (error.stack || '');
        if (errorStr.includes('429') || errorStr.toLowerCase().includes('rate limit') || errorStr.toLowerCase().includes('too many requests')) {
          errorLabel = 'Rate Limited - Try Later';
        } else if (errorStr.includes('503')) {
          errorLabel = 'Service Unavailable';
        }
      }
      
      // Show error status on the agent card
      updateAgentStatus('error', errorLabel);
      regenerateAbortControllerRef.current = null;
      return; // Exit early, don't run finally's "done" status
    }
    
    regenerateAbortControllerRef.current = null;
    // Mark agent as done once regeneration finishes successfully
    const doneLabel = stepId === 'initial_step' ? 'Draft Regenerated' :
      stepId === 'refinement_step' ? 'Critique Regenerated' :
        stepId === 'synthesis_step' ? 'Synthesis Regenerated' : 'Regenerated';
    updateAgentStatus('done', doneLabel);

    // If synthesis regeneration completed successfully, finish the loading state
    // so LoadingIndicator hides and only the model message with final answer shows
    if (stepId === 'synthesis_step') {
      // Transfer work to the model message if not already done
      // We must explicitly update the synthesizer state here because React state updates are async
      // and agentStates closure would still have the old (error) value
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsgIndex = newMessages.length - 1;
        const lastMsg = newMessages[lastMsgIndex];
        
        if (lastMsg && lastMsg.role === 'model') {
          // Get the work from either the message or currentWork
          const workToUse = lastMsg.work || currentWork;
          if (workToUse) {
            // Create updated agentStates with synthesizer marked as done
            const updatedAgentStates = (workToUse.agentStates || agentStates || []).map(agent => {
              if (agent.id === 'synthesizer_agent') {
                return { ...agent, status: 'done' as const, label: doneLabel, stepId: 'synthesis_step' as StepId };
              }
              return agent;
            });
            
            // ✅ Immutable update: create new message with updated work
            newMessages[lastMsgIndex] = {
              ...lastMsg,
              work: { ...workToUse, agentStates: updatedAgentStates }
            };
          }
        }
        return newMessages;
      });
      setCurrentWork(undefined);
      setIsLoading(false);
      setIsPaused(false);
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
    settingsLoaded,
    error,
    setSettings,
    sendMessage,
    stopGeneration,
    retry,
    continueGeneration,
    regenerateAgentResponse
  };
};
