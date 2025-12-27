import { useState, useRef, useEffect } from 'react';
import { AppSettings, Message, AgentState, Work } from '../types';
import { StepId } from '../types/steps';

import { GeminiService } from '../services/gemini';
import { updateStepResult, withEnsuredResults } from '../utils/workHelpers';
import { getUpdatedAgentName } from '../utils/agentHelpers';
import { generateUUID } from '../utils/uuid';
import { 
  updateMessageParts, 
  updateWorkAgentNames, 
  ensureModelMessageForSynthesis 
} from '../utils/messageHelpers';

import { useAppSettings } from './useAppSettings';
import { useSwarmStatus } from './useSwarmStatus';
import { useSwarmWork } from './useSwarmWork';
import { useSwarmTimer } from './useSwarmTimer';
import { useMessages } from './useMessages';
import { useAbortController } from './useAbortController';
import { useAgentStateSync } from './useAgentStateSync';

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

  const { timer, setTimer } = useSwarmTimer(isLoading && !isPaused);
  const { agentStates, setAgentStates, currentWork, setCurrentWork } = useSwarmWork();
  const { messages, setMessages, messagesRef } = useMessages();
  
  const mainAbort = useAbortController();
  const regenAbort = useAbortController();
  const { updateAgentStatus } = useAgentStateSync(setAgentStates, setMessages, setCurrentWork);

  // 2. Local State & Refs specific to orchestration
  const [lastInput, setLastInput] = useState<{ text: string, image: string | null, imageFile: File | null } | null>(null);
  const pauseResolverRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);
  const geminiServiceRef = useRef<GeminiService>(new GeminiService());

  // 3. Effect for timer reset logic
  useEffect(() => {
    if (!isLoading && !isPaused) {
      setTimer(0);
    }
  }, [isLoading, isPaused, setTimer]);

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

    try {
      const regenLabel = stepId === 'initial_step' ? 'Regenerating Draft...' :
        stepId === 'refinement_step' ? 'Regenerating Critique...' :
          stepId === 'synthesis_step' ? 'Regenerating Synthesis...' : 'Regenerating...';
      
      if (stepId === 'synthesis_step') {
        setIsPaused(false);
      }
      
      syncStatus('working', regenLabel);
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
          setMessages(prev => {
            const newMessages = [...prev];
            let msg = newMessages[messageIndex];
            let targetIndex = messageIndex;

            if (stepId === 'synthesis_step') {
              if (isFirstChunk) {
                  setIsLoading(false);
                  setIsPaused(false);
              }

              const { message: foundMsg, index: foundIndex, wasCreated } = ensureModelMessageForSynthesis(
                newMessages, messageIndex, workContext, text
              );
              
              msg = foundMsg;
              targetIndex = foundIndex;
              
              if (wasCreated) {
                newMessages.push(msg);
              }
              
              if (msg && msg.role === 'model') {
                newMessages[targetIndex] = updateMessageParts(msg, text);
                msg = newMessages[targetIndex]; 
              }
            }

            if (msg && msg.work) {
                const newName = getUpdatedAgentName(agentIndex, stepId, settings);
                let updatedWork = updateWorkAgentNames(msg.work, stepId, agentIndex, newName);
                updatedWork = updateStepResult(updatedWork, stepId, agentIndex, text);
                newMessages[targetIndex] = { ...newMessages[targetIndex], work: updatedWork };
            }

            return newMessages;
          });

          setCurrentWork(prev => {
            if (!prev) return prev;
            const newName = getUpdatedAgentName(agentIndex, stepId, settings);
            let updatedWork = updateWorkAgentNames(prev, stepId, agentIndex, newName);
            return updateStepResult(updatedWork, stepId, agentIndex, text);
          });
        },
        (status, agents, work) => {
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork({ ...work, agentStates: agents });
        },
        controller.signal
      );

      if (typeof result === 'object' && result !== null && 'sources' in result) {
        setMessages(prev => {
          const newMessages = [...prev];
          let msg = newMessages[messageIndex];
          let targetIndex = messageIndex;
          
          if (!msg || msg.role !== 'model') {
            const nextMsg = newMessages[messageIndex + 1];
            if (nextMsg && nextMsg.role === 'model') {
              msg = nextMsg;
              targetIndex = messageIndex + 1;
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

    } catch (error) {
      console.error("Regeneration failed:", error);
      let errorLabel = 'Regeneration Failed';
      if (error instanceof Error) {
        const errorStr = error.message.toLowerCase();
        if (errorStr.includes('429') || errorStr.includes('rate limit')) {
          errorLabel = 'Rate Limited - Try Later';
        } else if (errorStr.includes('503')) {
          errorLabel = 'Service Unavailable';
        }
      }
      syncStatus('error', errorLabel);
      return; 
    }
    
    regenAbort.ref.current = null;
    const doneLabel = stepId === 'initial_step' ? 'Draft Regenerated' :
      stepId === 'refinement_step' ? 'Critique Regenerated' :
        stepId === 'synthesis_step' ? 'Synthesis Regenerated' : 'Regenerated';
    syncStatus('done', doneLabel);

    if (stepId === 'synthesis_step') {
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
