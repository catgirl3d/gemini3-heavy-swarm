import { useState, RefObject, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { STEPS } from '@/types/steps';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { generateUUID } from '@/utils/common/uuid';
import { updateMessageParts, findTargetMessageIndex } from '@/utils/chat/messageHelpers';
import { updateTargetMessage } from '@/utils/chat/messageUpdaters';
import { handleSendMessageError } from '@/utils/swarm/errorHandling';
import { handleSynthesisJump } from '@/utils/swarm/stepConstants';
import { AbortControllerHook } from '@/hooks/network/useAbortController';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';

const logger = new Logger('Orchestration');

export interface OrchestrationDependencies {
  settings: AppSettings;
  messagesRef: RefObject<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  mainAbort: AbortControllerHook;
  regenAbort: AbortControllerHook;
  pauseResolverRef: MutableRefObject<(() => void) | null>;
  orchestratorRef: RefObject<SwarmOrchestrator>;
}


export function useSwarmOrchestration({
  settings,
  messagesRef,
  setMessages,
  mainAbort,
  regenAbort,
  pauseResolverRef,
  orchestratorRef
}: OrchestrationDependencies) {
  const [lastInput, setLastInput] = useState<{ text: string, image: string | null, imageFile: File | null } | null>(null);

  const continueGeneration = async () => {
    logger.debug('continueGeneration called', { hasPauseResolver: !!pauseResolverRef.current });
    
    // 1. Standard Pause Handling
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
      useAgentStore.getState().setIsPaused(false);
      return;
    }

    // 2. Resume Logic (when execution context is lost, e.g. after regeneration)
    const currentMessages = messagesRef.current || [];
    const lastModelMessage = [...currentMessages].reverse().find(m => m.role === 'model');
    
    if (!lastModelMessage || !lastModelMessage.work) {
      logger.warn('Cannot resume: No model message or work found');
      return;
    }

    const work = lastModelMessage.work;
    const isComplete = work.stepMetadata?.find(m => m.id === STEPS.SYNTHESIS)?.status === 'done';
    
    if (isComplete) {
      logger.info('Cannot resume: Swarm already complete');
      return;
    }

    // Find the triggering user message for context
    const msgIndex = currentMessages.findIndex(m => m.id === lastModelMessage.id);
    const triggeringUserMessage = [...currentMessages.slice(0, msgIndex)].reverse().find(m => m.role === 'user');
    
    if (!triggeringUserMessage) {
      logger.warn('Cannot resume: Triggering user message not found');
      return;
    }

    const userInput = triggeringUserMessage.parts.map(p => p.text).join(' ');
    const image = triggeringUserMessage.image || null;
    
    // Use imageFile from lastInput if it matches the current image
    const imageFile = (lastInput?.image === image) ? lastInput.imageFile : null;

    logger.info('Resuming swarm execution', {
      messageId: lastModelMessage.id,
      completedSteps: work.stepMetadata?.filter(m => m.status === 'done').map(m => m.id)
    });

    // Re-run the swarm with existing work
    await sendMessage(userInput, image, imageFile, false, lastModelMessage.id, work);
  };

  const stopGeneration = () => {
    logger.debug('stopGeneration called');
    
    // (!) Read currentMessageId BEFORE calling abortAll() to prevent race condition
    // where the ID could be cleared by abort handlers before we use it
    const currentMsgId = useAgentStore.getState().currentMessageId;
    
    // Centralized abort - stops ALL active processes (main + regenerations)
    useAgentStore.getState().abortAll();
    
    // Mark the current message as stopped in the history so UI can hide regenerate buttons
    if (currentMsgId) {
      // 1. Update the store's currentWork so the catch block in sendMessage picks it up
      const store = useAgentStore.getState();
      if (store.currentWork) {
        store.setCurrentWork({ ...store.currentWork, isStopped: true });
      }

      // 2. Update the message in history
      setMessages(prev => prev.map(m => 
        m.id === currentMsgId 
          ? { ...m, work: m.work ? { ...m.work, isStopped: true } : { isStopped: true } } 
          : m
      ));
    }

    // Clean up UI state
    useAgentStore.getState().setIsLoading(false);
    useAgentStore.getState().setIsPaused(false);
    useAgentStore.getState().setCurrentMessageId(undefined);
    useAgentStore.getState().setLoadingStatus('Stopped');
  };

  const sendMessage = async (
    userInput: string,
    image: string | null,
    imageFile: File | null,
    isRetry: boolean = false,
    resumeMessageId?: string,
    existingWork?: Work
  ) => {
    if (!userInput.trim() && !image) return;
    
    // Use existing ID for resume, or generate new one
    const modelMessageId = resumeMessageId || generateUUID();
    useAgentStore.getState().setCurrentMessageId(modelMessageId);

    useAgentStore.getState().setError(null);
    if (!isRetry && !resumeMessageId) {
      setLastInput({ text: userInput, image, imageFile });
    }

    logger.info(resumeMessageId ? 'resumeMessage START' : 'sendMessage START', {
      userInput: userInput.substring(0, 50),
      isRetry,
      hasImage: !!image,
      modelMessageId
    });

    // Build history synchronously to avoid race condition with React's async state updates
    let historyForSwarm = (messagesRef.current || []);
    
    if (resumeMessageId) {
      // For resume, history is everything before the model message
      const msgIndex = historyForSwarm.findIndex(m => m.id === resumeMessageId);
      if (msgIndex !== -1) {
        historyForSwarm = historyForSwarm.slice(0, msgIndex);
      }
    } else if (!isRetry) {
      const userMessage: Message = { id: generateUUID(), role: 'user', parts: [{ text: userInput }], image: image || undefined };
      historyForSwarm = [...historyForSwarm, userMessage];
      
      // Pre-emptively add the model message so agent states can be bound to it immediately.
      // This also fixes regeneration history lookup which expects a model message in the list.
      const modelMessage: Message = { id: modelMessageId, role: 'model', parts: [{ text: '' }] };
      setMessages([...historyForSwarm, modelMessage]);
    } else {
      // For retries, we use the existing history but ensure a fresh model message for the new attempt.
      // If the last message is a model message (likely the failed one), we replace it.
      const lastMsg = historyForSwarm[historyForSwarm.length - 1];
      if (lastMsg?.role === 'model') {
        historyForSwarm = historyForSwarm.slice(0, -1);
      }
      const modelMessage: Message = { id: modelMessageId, role: 'model', parts: [{ text: '' }] };
      setMessages([...historyForSwarm, modelMessage]);
    }

    logger.debug('Setting initial loading state', { isLoading: true, isPaused: false });
    useAgentStore.getState().setIsLoading(true);
    useAgentStore.getState().setIsPaused(false);
    
    // INITIALIZATION: Use the store directly
    if (existingWork && existingWork.agentStates) {
      // For resume, restore existing agent states to the store
      // CUpdate messageId for reused agents to match the new retry message
      // This ensures components like ShowWork can find the agents when filtering by the new messageId.
      const rehydratedAgents = existingWork.agentStates.map(a => ({
        ...a,
        messageId: modelMessageId
      }));
      useAgentStore.getState().hydrate(rehydratedAgents);
    } else {
      const initialStates: AgentState[] = Array.from({ length: settings.numAgents }, (_, i) => ({
        id: `${STEPS.INITIAL}-agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'waiting' as const,
        label: 'Waiting...',
        stepId: STEPS.INITIAL,
        agentIndex: i,
        messageId: modelMessageId
      }));
      useAgentStore.getState().hydrate(initialStates);
    }

    useAgentStore.getState().setCurrentWork(existingWork || {
      results: {
        [STEPS.INITIAL]: new Array(settings.numAgents).fill(''),
        [STEPS.REFINEMENT]: new Array(settings.numAgents).fill(''),
        [STEPS.SYNTHESIS]: {}
      }
    });

    const controller = mainAbort.create();
    const signal = controller.signal;
    
    // Register in centralized abort registry
    const controllerKey = `main-${modelMessageId}`;
    useAgentStore.getState().registerAbortController(controllerKey, controller);

    const lastUserMessageIndex = historyForSwarm.length - 1;

    if (!orchestratorRef.current) {
      throw new Error('SwarmOrchestrator not initialized');
    }

    try {
      const { text: finalMessageText, sources, work } = await orchestratorRef.current.runSwarm(
        settings,
        userInput,
        image,
        imageFile,
        historyForSwarm,
        modelMessageId,
        (text, isFirstChunk, _thought, _usage) => {
          // _thought and _usage are ignored here as they are handled by individual steps
          // Message update callback - just update the message text
          setMessages(prev => {
            const newMessages = [...prev];
            const targetIndex = newMessages.findIndex(m => m.id === modelMessageId);
            
            if (targetIndex !== -1) {
              newMessages[targetIndex] = updateMessageParts(newMessages[targetIndex], text);
            } else {
              newMessages.push({ id: modelMessageId, role: 'model', parts: [{ text }] });
            }
            return newMessages;
          });
        },
        signal,
        pauseResolverRef,
        () => {
             useAgentStore.getState().setIsPaused(true);
             useAgentStore.getState().setLoadingStatus('Paused. Waiting for user confirmation...');
        },
        useAgentStore.getState().setLoadingStatus, // onStatusUpdate: restore high-level status updates (e.g. "Initializing agents...")
        () => {
          // onSynthesisJump: Called when synthesis step starts streaming
          handleSynthesisJump(useAgentStore.getState().setIsLoading, useAgentStore.getState().setIsPaused);
        },
        existingWork
      );

      logger.info('Swarm work COMPLETE', { 
        workKeys: work?.results ? Object.keys(work.results) : [],
        sourcesCount: sources?.length 
      });

      setMessages(prev => {
        const currentAgents = useAgentStore.getState().agents;
        const agentsForThisMessage = currentAgents.filter(a => a.messageId === modelMessageId);
        const updated = updateTargetMessage(prev, prev.length - 1, STEPS.SYNTHESIS, {
          sources: sources,
          work: { ...work, agentStates: agentsForThisMessage }
        });
        
        return updated ?? prev;
      });

      logger.debug('Clearing loading state after success');
      useAgentStore.getState().setCurrentWork(undefined);
      useAgentStore.getState().setIsLoading(false);
      useAgentStore.getState().setIsPaused(false);
      useAgentStore.getState().setCurrentMessageId(undefined);
    } catch (error) {
      logger.error('sendMessage CATCH - handling error', { error });

      // SYNC: Update agent states in store to error before showing the failure UI
      const currentAgents = useAgentStore.getState().agents;
      const errorStates = currentAgents.map(a => {
        if (a.messageId === modelMessageId && (a.status === 'working' || a.status === 'waiting')) {
           return { ...a, status: 'error' as const, label: 'Failed' };
        }
        return a;
      });
      useAgentStore.getState().hydrate(errorStates);

      // CRITICAL: Save agent states to message.work even on error
      // This ensures regeneration can find and update existing agents instead of creating duplicates
      const workAtTimeOfError = useAgentStore.getState().currentWork;
      
      setMessages(prev => {
        const currentWork = workAtTimeOfError;
        const agentsForThisMessage = errorStates.filter(a => a.messageId === modelMessageId);
        
        logger.debug('Saving error state agents to message.work', {
          messageId: modelMessageId,
          agentsCount: agentsForThisMessage.length,
          agents: agentsForThisMessage.map(a => ({ id: a.id, stepId: a.stepId, agentIndex: a.agentIndex, status: a.status }))
        });
        
        const updated = updateTargetMessage(prev, prev.length - 1, STEPS.SYNTHESIS, {
          work: currentWork ? { ...currentWork, agentStates: agentsForThisMessage } : { agentStates: agentsForThisMessage }
        });
        
        return updated ?? prev;
      });

      const wasAborted = handleSendMessageError(
        error,
        useAgentStore.getState().currentWork,
        useAgentStore.getState().setLoadingStatus,
        useAgentStore.getState().setIsPaused,
        useAgentStore.getState().setIsLoading,
        (w) => useAgentStore.getState().setCurrentWork(w),
        useAgentStore.getState().setError,
        settings
      );
      
      if (wasAborted) {
        logger.debug('Error was user abort, returning early');
        return;
      }
    } finally {
      logger.debug('sendMessage FINALLY - cleanup');
      const controllerKey = `main-${modelMessageId}`;
      useAgentStore.getState().unregisterAbortController(controllerKey);
      mainAbort.ref.current = null;
    }
  };

  const retry = () => {
    if (lastInput) {
      // Retrieve failed work to prevent infinite simulation loops
      // The step execution logic checks exiting work to decide if it's a retry
      const messages = messagesRef.current || [];
      const lastMsg = messages[messages.length - 1];
      const failedWork = lastMsg?.role === 'model' ? lastMsg.work : undefined;

      sendMessage(lastInput.text, lastInput.image, lastInput.imageFile, true, undefined, failedWork);
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
