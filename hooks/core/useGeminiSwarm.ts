import { useState, useRef, useEffect } from 'react';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { StepId } from '@/types/steps';

import { GeminiService } from '@/services/gemini';
import { updateStepResult, withEnsuredResults } from '@/utils/workHelpers';
import { generateUUID } from '@/utils/uuid';
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
        (text, isFinal) => {
          if (isFinal) {
            setIsLoading(false);
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
      if (error instanceof Error && error.message === 'Aborted') {
        console.log('Generation aborted by user');
        setIsLoading(false);
        setLoadingStatus('Stopped by user');
        return;
      }

      console.error('Error in agentic workflow:', error);

      const errorMessage = getFriendlyErrorMessage(error);

      const initialResults = latestWork?.results?.['initial_step'];
      const refinementResults = latestWork?.results?.['refinement_step'];
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
    if (!lastInput) return;

    const targetMessage = messages[messageIndex];
    let workContext = targetMessage?.work || currentWork;
    if (!workContext) return;

    const syncStatus = (status: AgentState['status'], label: string) => 
      updateAgentStatus(messageIndex, stepId, agentIndex, status, label, settings);

    const controller = regenAbort.create();

    // Start loading state
    setIsLoading(true);
    setIsPaused(false);

    try {
      const labels = getStepLabels(stepId);
      syncStatus('working', labels.regenerating);
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
            () => {
              // Note: synthesize-specific side effects can go here if needed
            }
          );

          setMessages(updatedMessages);
          if (updatedWork) {
            setCurrentWork(updatedWork);
          }
        },
        (status, agents, work) => {
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork({ ...work, agentStates: agents });
        },
        controller.signal
      );

      // Handle final result (sources and work updates)
      if (typeof result === 'object' && result !== null && 'sources' in result) {
        setMessages(prev => {
          const newMessages = [...prev];
          let targetIndex = messageIndex;
          let msg = newMessages[targetIndex];
          
          // Improved lookup for model message
          if (!msg || msg.role !== 'model') {
            const nextMsg = newMessages[messageIndex + 1];
            if (nextMsg && nextMsg.role === 'model') {
              msg = nextMsg;
              targetIndex = messageIndex + 1;
            } else if (stepId === 'synthesis_step') {
              // Fallback for synthesis messages pushed to the end
              targetIndex = newMessages.length - 1;
              msg = newMessages[targetIndex];
            }
          }
          
          if (msg && msg.role === 'model') {
            const updatedWork = msg.work ? (() => {
              const ensuredWork = withEnsuredResults(msg.work!);
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

      if (stepId === 'synthesis_step') {
        finalizeSynthesisState(labels.done);
      }

    } catch (error) {
      console.error("Regeneration failed:", error);
      syncStatus('error', getErrorLabel(error, 'Regeneration Failed'));
    } finally {
      regenAbort.ref.current = null;
      setIsLoading(false);
    }
  };

  /**
   * Finalizes the state after a successful synthesis regeneration.
   */
  const finalizeSynthesisState = (doneLabel: string) => {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsgIndex = newMessages.length - 1;
      const lastMsg = newMessages[lastMsgIndex];
      
      if (lastMsg && lastMsg.role === 'model') {
        const workToUse = lastMsg.work || currentWork;
        if (workToUse) {
          const updatedAgentStates = (workToUse.agentStates || agentStates || []).map(agent => {
            if (agent.id === 'synthesizer_agent') {
              return { ...agent, status: 'done' as const, label: doneLabel, stepId: 'synthesis_step' as StepId };
            }
            return agent;
          });
          newMessages[lastMsgIndex] = { ...lastMsg, work: { ...workToUse, agentStates: updatedAgentStates } };
        }
      }
      return newMessages;
    });
    setCurrentWork(undefined);
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
