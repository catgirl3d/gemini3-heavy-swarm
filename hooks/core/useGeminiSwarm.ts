import { useState, useRef, useEffect } from 'react';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { Logger } from '@/utils/logger';

import { GeminiService } from '@/services/gemini';
import { updateStepResult, withEnsuredResults, updateStepWithError } from '@/utils/workHelpers';
import { generateUUID } from '@/utils/uuid';
import { getStepConfig } from '@/utils/stepConfig';
import { 
  updateMessageParts 
} from '@/utils/messageHelpers';
import { 
  getStepLabels,
  calculateUpdatedStateForRegeneration
} from '@/utils/regenerationHelpers';

import { useAppSettings } from '@/hooks/state/useAppSettings';
import { useSwarmStatus } from '@/hooks/swarm/useSwarmStatus';
import { useSwarmWork } from '@/hooks/swarm/useSwarmWork';
import { useSwarmTimer } from '@/hooks/swarm/useSwarmTimer';
import { useMessages } from '@/hooks/state/useMessages';
import { useAbortController } from '@/hooks/network/useAbortController';
import { useAgentStateSync } from '@/hooks/swarm/useAgentStateSync';
import { useAutoScroll } from '@/hooks/ui/useAutoScroll';
import { useModalGlobalHandlers } from '@/hooks/ui/useModalGlobalHandlers';
import { useServerStatus } from '@/hooks/network/useServerStatus';
import { getFriendlyErrorMessage, getErrorLabel } from '@/services/steps/utils/errorUtils';

export const useGeminiSwarm = () => {
  // 1. Compose Hooks
  const { settings, settingsLoaded, setSettings } = useAppSettings();
  const swarmStatus = useSwarmStatus();
  const { 
    isLoading, setIsLoading, 
    isPaused, setIsPaused, 
    loadingStatus, setLoadingStatus, 
    error, setError 
  } = swarmStatus;

  const { agentStates, setAgentStates, currentWork, setCurrentWork } = useSwarmWork();
  const { messages, setMessages, messagesRef } = useMessages();
  
  const mainAbort = useAbortController();
  const regenAbort = useAbortController();
  const { updateAgentStatus } = useAgentStateSync(setAgentStates, setMessages, setCurrentWork);

  // 2. Local State & Refs specific to orchestration
  const [lastInput, setLastInput] = useState<{ text: string, image: string | null, imageFile: File | null } | null>(null);
  const pauseResolverRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);
  const geminiServiceRef = useRef<GeminiService>(new GeminiService());


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

    let currentMessages = messagesRef.current;
    if (!isRetry) {
      const userMessage: Message = { id: generateUUID(), role: 'user', parts: [{ text: userInput }], image: image || undefined };
      setMessages(prev => {
        currentMessages = [...prev, userMessage];
        return currentMessages;
      });
    }

    setIsLoading(true);
    setIsPaused(false);
    setAgentStates([]);
    setCurrentWork({ results: {} });

    let latestAgents: AgentState[] = [];
    let latestWork: Work | undefined;

    const controller = mainAbort.create();
    const signal = controller.signal;

    try {
      const result = await geminiServiceRef.current.runSwarm(
        settings,
        userInput,
        image,
        imageFile,
        currentMessages,
        (status, agents, work, isPaused) => {
          latestAgents = agents;
          latestWork = { ...work, agentStates: agents };
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork(latestWork);
          if (isPaused !== undefined) {
            setIsPaused(isPaused);
          }
        },
        (text, isFirstChunk) => {
          if (isFirstChunk) {
            /** 
             * SYNTHESIS JUMP BEHAVIOR
             * As soon as the first chunk of synthesis text arrives, we transition the UI:
             * 1. Hide the LoadingIndicator and agent status cards (setIsLoading(false))
             * 2. Clear any pause state (setIsPaused(false))
             * This shifts the focus immediately to the streaming model message for a 
             * more responsive and less cluttered final answer experience.
             */
            setIsLoading(false);
            setIsPaused(false);
          }
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMsgIndex = newMessages.length - 1;
            const lastMsg = newMessages[lastMsgIndex];
            
            if (lastMsg.role === 'model') {
              newMessages[lastMsgIndex] = updateMessageParts(lastMsg, text);
            } else {
              newMessages.push({ id: generateUUID(), role: 'model', parts: [{ text }] });
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
      const logger = new Logger('Swarm', settings.debugMode);
      if (error instanceof Error && error.message === 'Aborted') {
        logger.info('Generation aborted by user');
        setIsLoading(false);
        setLoadingStatus('Stopped by user');
        return;
      }

      logger.error('Error in agentic workflow:', error);

      const errorMessage = getFriendlyErrorMessage(error);

      const initialResults = latestWork?.results?.[STEPS.INITIAL];
      const refinementResults = latestWork?.results?.[STEPS.REFINEMENT];
      const hasPartialResults = latestWork && (
        (Array.isArray(initialResults) && initialResults.some(r => r && !r.includes('[System:'))) ||
        (Array.isArray(refinementResults) && refinementResults.some(r => r && !r.includes('[System:')))
      );

      if (hasPartialResults) {
        setLoadingStatus(`Error: ${errorMessage}`);
        setIsPaused(true); 
      } else {
        setIsLoading(false);
        setCurrentWork(undefined);
        setError(errorMessage);
      }
    } finally {
      mainAbort.ref.current = null;
    }
  };

  const stopGeneration = () => {
    mainAbort.abort();
    setIsLoading(false);
    setIsPaused(false);
    setLoadingStatus('Stopped');
  };

  const retry = () => {
    if (lastInput) {
      sendMessage(lastInput.text, lastInput.image, lastInput.imageFile, true);
    }
  };

  const regenerateAgentResponse = async (messageIndex: number, stepId: StepId, agentIndex: number) => {
    const logger = new Logger('Synthesis', settings.debugMode);
    logger.debug('regenerateAgentResponse start:', { messageIndex, stepId, agentIndex });
    if (!lastInput) return;

    const targetMessage = messages[messageIndex];
    let workContext = targetMessage?.work || currentWork;
    if (!workContext) return;

    const syncStatus = (status: AgentState['status'], label: string) => 
      updateAgentStatus(messageIndex, stepId, agentIndex, status, label, settings);

    const controller = regenAbort.create();


    // Capture initial state to restore later if needed
    const initialLoading = isLoading;
    const initialPaused = isPaused;

    // Start loading state (but NOT for synthesis - it will hide on first chunk)
    if (stepId !== STEPS.SYNTHESIS) {
      setIsLoading(true);
    }
    // For synthesis: keeps cards visible until first chunk arrives (handled by onSynthesisStart)
    
    // Unpause to allow work to proceed
    if (stepId !== STEPS.SYNTHESIS) {
      setIsPaused(false);
    }

    // Capture latest agent states from progress updates to use in finalization
    let latestAgentStates: AgentState[] = agentStates || [];

    try {      
      const labels = getStepLabels(stepId);
      // Only set working status immediately for non-synthesis steps
      if (stepId !== STEPS.SYNTHESIS) {
        syncStatus('working', labels.regenerating);
      }
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
          const { updatedMessages, updatedWork } = calculateUpdatedStateForRegeneration(
            messagesRef.current,
            messageIndex,
            stepId,
            agentIndex,
            workContext,
            text,
            settings,
            isFirstChunk,
            () => {
               // Synthesis jump behavior
              syncStatus('working', getStepConfig(STEPS.SYNTHESIS).labels.working);
              setIsLoading(false);
              setIsPaused(false);
            }
          );

          setMessages(updatedMessages);
          if (updatedWork) {
            setCurrentWork(updatedWork);
          }
        },
        (status, agents, work) => {
          latestAgentStates = agents; // Capture latest agents
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork({ ...work, agentStates: agents });
        },
        controller.signal
      );

      // Handle final result
      if (typeof result === 'object' && result !== null && 'sources' in result) {
         setMessages(prev => {
          const newMessages = [...prev];
          let targetIndex = messageIndex;
          let msg = newMessages[targetIndex];
          
          if (!msg || msg.role !== 'model') {
            const nextMsg = newMessages[messageIndex + 1];
            if (nextMsg && nextMsg.role === 'model') {
              msg = nextMsg;
              targetIndex = messageIndex + 1;
            } else if (stepId === STEPS.SYNTHESIS) {
              targetIndex = newMessages.length - 1;
              msg = newMessages[targetIndex];
            }
          }
          
          if (msg && msg.role === 'model') {
            const workToUpdate = msg.work || workContext || currentWork;
            const updatedWork = workToUpdate ? (() => {
              const ensuredWork = withEnsuredResults(workToUpdate);
              return {
                ...ensuredWork,
                results: { ...ensuredWork.results, [stepId]: result }
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

        setCurrentWork(prev => {
          if (!prev || !prev.results) return prev;
          return {
            ...prev,
            results: { ...prev.results, [stepId]: result }
          };
        });
      }

      syncStatus('done', labels.done);

      if (stepId === STEPS.SYNTHESIS) {
        const logger = new Logger('Synthesis', settings.debugMode);
        logger.debug('Synthesis regeneration logic complete');
        
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsgIndex = newMessages.length - 1;
          const lastMsg = newMessages[lastMsgIndex];
          
          if (lastMsg && lastMsg.role === 'model') {
            const workToUse = lastMsg.work || currentWork;
            if (workToUse) {
              const updatedAgentStates = (latestAgentStates || workToUse.agentStates || agentStates || []).map(agent => {
                if (agent.id === 'synthesizer_agent') {
                  return { ...agent, status: 'done' as const, label: labels.done, stepId: STEPS.SYNTHESIS as StepId };
                }
                return agent;
              });
              newMessages[lastMsgIndex] = { ...lastMsg, work: { ...workToUse, agentStates: updatedAgentStates } };
            }
          }
          return newMessages;
        });
        setCurrentWork(undefined);
      }
    } catch (error) {
       const logger = new Logger('Regeneration', settings.debugMode);
      logger.error("Regeneration failed:", error);
      const errorLabel = getErrorLabel(error, 'Regeneration Failed');
      syncStatus('error', errorLabel);
      
      const errorMessage = getFriendlyErrorMessage(error);
      
      setMessages(prev => {
        const newMessages = [...prev];
        let targetIndex = messageIndex;
        
        let msg = newMessages[targetIndex];
        if (stepId === STEPS.SYNTHESIS && (!msg || msg.role !== 'model')) {
          const nextMsg = newMessages[targetIndex + 1];
          if (nextMsg && nextMsg.role === 'model') {
            msg = nextMsg;
            targetIndex = targetIndex + 1;
          } else {
            // Fallback to last message if it's a model message
            const lastIdx = newMessages.length - 1;
            if (lastIdx >= 0 && newMessages[lastIdx].role === 'model') {
              targetIndex = lastIdx;
              msg = newMessages[targetIndex];
            }
          }
        }
        
        if (msg && msg.role === 'model') {
          const workToUpdate = msg.work || workContext || currentWork;
          const updatedWork = workToUpdate ? updateStepWithError(workToUpdate, stepId, agentIndex, errorMessage) : undefined;
          const config = getStepConfig(stepId);
          const errorText = `[System: ${config.errorPrefix}. ${errorMessage}]`;
          
          newMessages[targetIndex] = {
            ...msg,
            parts: [{ text: errorText }],
            work: updatedWork
          };
        }
        
        return newMessages;
      });
      
      setCurrentWork(prev => 
        prev ? updateStepWithError(prev, stepId, agentIndex, errorMessage) : prev
      );
    } finally {
      // RESTORE STATE LOGIC (only for non-synthesis steps)
      // Synthesis manages its own state via onSynthesisStart callback
      if (stepId !== STEPS.SYNTHESIS) {
        setIsLoading(initialLoading);
        setIsPaused(initialPaused);
      }
    }
  };

  return {
    messages,
    isLoading,
    isPaused,
    loadingStatus,
    agentStates,
    currentWork,
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
