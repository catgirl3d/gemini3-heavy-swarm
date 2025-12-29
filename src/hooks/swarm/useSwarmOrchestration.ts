import { useState } from 'react';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { STEPS } from '@/types/steps';
import { generateUUID } from '@/utils/common/uuid';
import { updateMessageParts, findTargetMessageIndex } from '@/utils/chat/messageHelpers';
import { updateTargetMessage } from '@/utils/chat/messageUpdaters';
import { handleSendMessageError } from '@/utils/swarm/errorHandling';
import { handleSynthesisJump } from '@/utils/swarm/synthesisHelpers';
import { GeminiService } from '@/services/swarm/GeminiService';
import { useAbortController } from '@/hooks/network/useAbortController';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('Orchestration', true);

interface OrchestrationDependencies {
  settings: AppSettings;
  messagesRef: React.RefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (b: boolean) => void;
  setIsPaused: (b: boolean) => void;
  setLoadingStatus: (s: string) => void;
  setAgentStates: (a: AgentState[]) => void;
  setCurrentWork: (w: Work | undefined) => void;
  setError: (e: string | null) => void;
  mainAbort: ReturnType<typeof useAbortController>;
  pauseResolverRef: React.MutableRefObject<(() => void) | null>;
  geminiServiceRef: React.RefObject<GeminiService>;
}

export function useSwarmOrchestration({
  settings,
  messagesRef,
  setMessages,
  setIsLoading,
  setIsPaused,
  setLoadingStatus,
  setAgentStates,
  setCurrentWork,
  setError,
  mainAbort,
  pauseResolverRef,
  geminiServiceRef
}: OrchestrationDependencies) {
  const [lastInput, setLastInput] = useState<{ text: string, image: string | null, imageFile: File | null } | null>(null);

  const continueGeneration = () => {
    logger.debug('continueGeneration called', { hasPauseResolver: !!pauseResolverRef.current });
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
      setIsPaused(false);
    }
  };

  const stopGeneration = () => {
    logger.debug('stopGeneration called');
    mainAbort.abort();
    setIsLoading(false);
    setIsPaused(false);
    setLoadingStatus('Stopped');
  };

  const sendMessage = async (userInput: string, image: string | null, imageFile: File | null, isRetry: boolean = false) => {
    if (!userInput.trim() && !image) return;

    setError(null);
    if (!isRetry) {
      setLastInput({ text: userInput, image, imageFile });
    }

    logger.info('sendMessage START', { userInput: userInput.substring(0, 50), isRetry, hasImage: !!image });

    // Build history synchronously to avoid race condition with React's async state updates
    let historyForSwarm = messagesRef.current;
    if (!isRetry) {
      const userMessage: Message = { id: generateUUID(), role: 'user', parts: [{ text: userInput }], image: image || undefined };
      historyForSwarm = [...messagesRef.current, userMessage];
      setMessages(historyForSwarm);
    }

    logger.debug('Setting initial loading state', { isLoading: true, isPaused: false });
    setIsLoading(true);
    setIsPaused(false);
    setAgentStates([]);
    setCurrentWork({ results: {} });

    let latestAgents: AgentState[] = [];
    let latestWork: Work | undefined;

    const controller = mainAbort.create();
    const signal = controller.signal;

    const lastUserMessageIndex = historyForSwarm.length - 1;

    if (!geminiServiceRef.current) {
      throw new Error('GeminiService not initialized');
    }

    try {
      const result = await geminiServiceRef.current.runSwarm(
        settings,
        userInput,
        image,
        imageFile,
        historyForSwarm,
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
            handleSynthesisJump(setIsLoading, setIsPaused);
          }
          setMessages(prev => {
            const newMessages = [...prev];
            const targetIndex = findTargetMessageIndex(newMessages, lastUserMessageIndex, STEPS.SYNTHESIS);
            
            if (targetIndex !== null && newMessages[targetIndex]?.role === 'model') {
              newMessages[targetIndex] = updateMessageParts(newMessages[targetIndex], text);
            } else {
              newMessages.push({ id: generateUUID(), role: 'model', parts: [{ text }] });
            }
            return newMessages;
          });
        },
        signal,
        pauseResolverRef
      );

      logger.info('sendMessage SUCCESS - setting final state', { sourcesCount: result.sources?.length });
      setMessages(prev => {
        const updated = updateTargetMessage(prev, prev.length - 1, STEPS.SYNTHESIS, {
          sources: result.sources,
          work: { ...result.work, agentStates: latestAgents }
        });
        
        return updated ?? prev;
      });

      logger.debug('Clearing loading state after success');
      setCurrentWork(undefined);
      setIsLoading(false);

    } catch (error) {
      logger.error('sendMessage CATCH - handling error', { error });
      const wasAborted = handleSendMessageError(
        error,
        latestWork,
        setLoadingStatus,
        setIsPaused,
        setIsLoading,
        setCurrentWork,
        setError,
        settings
      );
      
      if (wasAborted) {
        logger.debug('Error was user abort, returning early');
        return; // User-initiated abort, no further error handling needed
      }
    } finally {
      logger.debug('sendMessage FINALLY - cleanup');
      mainAbort.ref.current = null;
    }
  };

  const retry = () => {
    if (lastInput) {
      sendMessage(lastInput.text, lastInput.image, lastInput.imageFile, true);
    }
  };

  return { 
    sendMessage, 
    stopGeneration, 
    retry, 
    continueGeneration,
    lastInput 
  };
}
