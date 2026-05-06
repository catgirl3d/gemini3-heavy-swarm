import { useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { type AppSettings, type Message, type AgentState, type Work } from '@/types';
import { STEPS } from '@/types/steps';
import { type SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { generateUUID } from '@/utils/common/uuid';
import { handleSendMessageError, hasPartialWorkResults } from '@/utils/swarm/errorHandling';
import { handleSynthesisJump } from '@/utils/swarm/stepConstants';
import { getStepMeta } from '@/utils/swarm/workHelpers';
import { type AbortControllerHook } from '@/hooks/network/useAbortController';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';
import { commitSessionSnapshotToMessage, resolveOperationalSessionWork } from '@/utils/swarm/sessionSnapshots';

const logger = new Logger('Orchestration');

export interface OrchestrationDependencies {
  settings: AppSettings;
  messagesRef: RefObject<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  mainAbort: AbortControllerHook;
  orchestratorRef: RefObject<SwarmOrchestrator>;
}

type SendMessageOptions = {
  isRetry?: boolean;
  resumeMessageId?: string;
  existingWork?: Work;
  forcedMessageId?: string;
};


export function useSwarmOrchestration({
  settings,
  messagesRef,
  setMessages,
  mainAbort,
  orchestratorRef
}: OrchestrationDependencies) {
  const [lastInput, setLastInput] = useState<{ text: string, image: string | null, imageFile: File | null } | null>(null);

  const continueGeneration = async () => {
    logger.debug('continueGeneration called');

    // Resume from the latest persisted session snapshot so agent states stay aligned
    // with already-completed cards when we restart from a paused step boundary.
    const currentMessages = messagesRef.current || [];
    const lastModelMessage = [...currentMessages].reverse().find(m => m.role === 'model');
    const resolvedSession = lastModelMessage
      ? resolveOperationalSessionWork(lastModelMessage, 'resume', {
          status: 'paused',
          isLoading: true,
          isPaused: true,
          loadingStatus: 'Paused. Waiting for user confirmation...',
          error: null,
        })
      : undefined;
    
    if (!lastModelMessage || !resolvedSession) {
      logger.warn('Cannot resume: No model message or work found');
      return;
    }

    const isComplete = getStepMeta(resolvedSession.work, STEPS.SYNTHESIS)?.status === 'done';
    
    if (isComplete) {
      logger.info('Cannot resume: Swarm already complete');
      if (resolvedSession.source === 'hydrated-snapshot') {
        useAgentStore.getState().clearSession(resolvedSession.sessionMessageId);
      }
      return;
    }

    // Find the triggering user message for context
    const msgIndex = currentMessages.findIndex(m => m.id === lastModelMessage.id);
    const triggeringUserMessage = [...currentMessages.slice(0, msgIndex)].reverse().find(m => m.role === 'user');
    
    if (!triggeringUserMessage) {
      logger.warn('Cannot resume: Triggering user message not found');
      if (resolvedSession.source === 'hydrated-snapshot') {
        useAgentStore.getState().clearSession(resolvedSession.sessionMessageId);
      }
      return;
    }

    const userInput = triggeringUserMessage.parts.map(p => p.text).join(' ');
    const image = triggeringUserMessage.image || null;
    
    // Use imageFile from lastInput if it matches the current image
    const imageFile = (lastInput?.image === image) ? lastInput.imageFile : null;

    logger.info('Resuming swarm execution', {
      messageId: lastModelMessage.id,
      completedSteps: resolvedSession.work.stepMetadata?.filter(m => m.status === 'done').map(m => m.id)
    });

    // Re-run the swarm with existing work
    await sendMessage(userInput, image, imageFile, {
      resumeMessageId: lastModelMessage.id,
      existingWork: resolvedSession.work,
    });
  };

  const stopGeneration = () => {
    logger.debug('stopGeneration called');
    
    // (!) Read active session id BEFORE calling abortAll() to prevent race condition
    // where the ID could be cleared by abort handlers before we use it
    const store = useAgentStore.getState();
    const currentMsgId = store.activeSessionMessageId;
    const sessionWorkBeforeStop = currentMsgId ? store.sessionsByMessageId[currentMsgId]?.work : undefined;
    
    // Centralized abort - stops ALL active processes (main + regenerations)
    store.abortAll();
    
    // Mark the current message as stopped in the history so UI can hide regenerate buttons
    if (currentMsgId) {
      const stoppedWork: Work = { ...(sessionWorkBeforeStop ?? {}), isStopped: true };
      store.replaceSessionWork(currentMsgId, stoppedWork);
      store.updateSessionRuntime(currentMsgId, {
        status: 'stopped',
        isLoading: false,
        isPaused: false,
        loadingStatus: 'Stopped',
        error: null,
      });
      flushSync(() => {
        setMessages(prev => commitSessionSnapshotToMessage(prev, currentMsgId, { reason: 'stopped' }));
      });
    }

    store.setActiveSession(undefined);
  };

  const sendMessage = async (
    userInput: string,
    image: string | null,
    imageFile: File | null,
    options: SendMessageOptions = {},
  ) => {
    if (!userInput.trim() && !image) return;
    const orchestrator = orchestratorRef.current;
    if (!orchestrator) {
      throw new Error('SwarmOrchestrator not initialized');
    }

    const isRetry = options.isRetry ?? false;
    const resumeMessageId = options.resumeMessageId;
    const existingWork = options.existingWork;
    
    // Use existing ID for resume, or generate new one
    const modelMessageId = resumeMessageId || options.forcedMessageId || generateUUID();
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
      } else {
        const modelMessage: Message = { id: modelMessageId, role: 'model', parts: [{ text: '' }] };
        setMessages([...historyForSwarm, modelMessage]);
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

    const seedWork = existingWork || {
      results: {
        [STEPS.INITIAL]: new Array(settings.numAgents).fill(''),
        [STEPS.REFINEMENT]: new Array(settings.numAgents).fill(''),
        [STEPS.SYNTHESIS]: ['']
      }
    };

    const initialAgents: AgentState[] = existingWork?.agentStates
      ? existingWork.agentStates.map(a => ({
          ...a,
          messageId: modelMessageId
        }))
      : Array.from({ length: settings.numAgents }, (_, i) => ({
          id: `${STEPS.INITIAL}-agent-${i}`,
          name: `Agent ${i + 1}`,
          status: 'waiting' as const,
        label: 'Waiting...',
          stepId: STEPS.INITIAL,
          agentIndex: i,
          messageId: modelMessageId
        }));

    useAgentStore.getState().startSession(modelMessageId, seedWork, {
      agentStates: initialAgents,
      status: 'running',
      isLoading: true,
      isPaused: false,
      loadingStatus: '',
      error: null,
    });

    const controller = mainAbort.create();
    const signal = controller.signal;
    
    // Register in centralized abort registry
    const controllerKey = `main-${modelMessageId}`;
    useAgentStore.getState().registerAbortController(controllerKey, controller);

    try {
      const { work, paused } = await orchestrator.runSwarm(
        settings,
        userInput,
        image,
        imageFile,
        historyForSwarm,
        modelMessageId,
        () => undefined,
        signal,
        () => {
             useAgentStore.getState().updateSessionRuntime(modelMessageId, {
               status: 'paused',
               isLoading: true,
               isPaused: true,
               loadingStatus: 'Paused. Waiting for user confirmation...',
               error: null,
             });
        },
        (status) => useAgentStore.getState().updateSessionRuntime(modelMessageId, { loadingStatus: status }),
        () => {
          // onSynthesisJump: Called when synthesis step starts streaming
          handleSynthesisJump(() => {
            useAgentStore.getState().updateSessionRuntime(modelMessageId, {
              isLoading: false,
              isPaused: false,
            });
          });
        },
        existingWork
      );

      logger.info('Swarm work COMPLETE', { 
        workKeys: work?.results ? Object.keys(work.results) : [],
        paused,
      });

      // Live agent status truth stays in session.agentStates during execution.
      // Do not write work.agentStates back here: on resume/retry it may still contain
      // an older snapshot and would overwrite the live session state right before we snapshot it.
      useAgentStore.getState().replaceSessionWork(modelMessageId, work);

      if (paused) {
        useAgentStore.getState().setSessionStatus(modelMessageId, 'paused');

        setMessages(prev => commitSessionSnapshotToMessage(prev, modelMessageId, { reason: 'paused' }));

        return;
      }

      useAgentStore.getState().setSessionStatus(modelMessageId, 'done');

      flushSync(() => {
        setMessages(prev => commitSessionSnapshotToMessage(prev, modelMessageId, { reason: 'done' }));
      });

      logger.debug('Clearing loading state after success');
      useAgentStore.getState().setActiveSession(undefined);
    } catch (error) {
      logger.error('sendMessage CATCH - handling error', { error });

      // SYNC: Update agent states in store to error before showing the failure UI
      const currentAgents = useAgentStore.getState().sessionsByMessageId[modelMessageId]?.agentStates ?? [];
      const errorStates = currentAgents.map(a => {
        if (a.messageId === modelMessageId && (a.status === 'working' || a.status === 'waiting')) {
           return { ...a, status: 'error' as const, label: 'Failed' };
        }
        return a;
      });
      useAgentStore.getState().replaceSessionAgents(modelMessageId, errorStates);

      // Preserve real failure state (agent errors, retry counters, empty-step metadata)
      // so global retry/debug flows can resume from the failed attempt instead of resetting.
      const failureSnapshot = useAgentStore.getState().snapshotSessionWork(modelMessageId);
      const latestLiveWork = useAgentStore.getState().sessionsByMessageId[modelMessageId]?.work;
      const hasPartialWork = hasPartialWorkResults(latestLiveWork);
      const wasAborted = handleSendMessageError(
        error,
        latestLiveWork,
        {
          onAborted: () => {
            useAgentStore.getState().updateSessionRuntime(modelMessageId, {
              status: 'stopped',
              isLoading: false,
              isPaused: false,
              loadingStatus: 'Stopped by user',
              error: null,
            });
            useAgentStore.getState().setActiveSession(undefined);
          },
          onPartialFailure: (errorMessage) => {
            useAgentStore.getState().updateSessionRuntime(modelMessageId, {
              status: 'error',
              isLoading: true,
              isPaused: true,
              loadingStatus: `Error: ${errorMessage}`,
              error: errorMessage,
            });
          },
          onTotalFailure: (errorMessage) => {
            useAgentStore.getState().clearSession(modelMessageId);
            useAgentStore.getState().setActiveSession(undefined);
            useAgentStore.getState().setGlobalError(errorMessage);
          },
        },
        settings
      );
      
      if (wasAborted) {
        logger.debug('Error was user abort, returning early');
        return;
      }

      if (hasPartialWork) {
        setMessages(prev => commitSessionSnapshotToMessage(prev, modelMessageId, { reason: 'partial-error' }));
      } else {
        setMessages(prev => commitSessionSnapshotToMessage(prev, modelMessageId, {
          reason: 'partial-error',
          fallbackWork: failureSnapshot,
        }));
        useAgentStore.getState().setActiveSession(undefined);
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
      const retryMessageId = generateUUID();
      const failedSession = lastMsg?.role === 'model'
        ? resolveOperationalSessionWork(lastMsg, 'retry', { targetMessageId: retryMessageId })
        : undefined;

      sendMessage(lastInput.text, lastInput.image, lastInput.imageFile, {
        isRetry: true,
        existingWork: failedSession?.work,
        forcedMessageId: retryMessageId,
      }).catch((error: unknown) => {
        logger.error('Unhandled retry failure:', error);
      });
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
