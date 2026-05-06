import { useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { type AppSettings, type Message, type Work } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
import { Logger } from '@shared/utils/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import {
  cloneWork,
  getStepMeta,
  getStepResults,
  getStepThoughts,
  getStepUsage,
  getSynthesisErrorState,
  getSynthesisSources,
  setStepMetaStatus,
  updateAgentWork,
} from '@/utils/swarm/workHelpers';
import { getFriendlyErrorMessage } from '@/services/swarm/steps/utils/errorUtils';
import { type SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { useAgentStore } from '@/stores/agentStore';
import { isLatestRegenerableMessage } from '@/utils/swarm/sessionHelpers';
import { commitSessionSnapshotToMessage, resolveOperationalSessionWork } from '@/utils/swarm/sessionSnapshots';

const regenLogger = new Logger('Regeneration');

const mergeRegeneratedStepWork = (
  baseWork: Work,
  updatedStepWork: Work,
  stepId: StepId,
  agentIndex: number
): Work => {
  let mergedWork = cloneWork(baseWork);
  const nextText = getStepResults(updatedStepWork, stepId)[agentIndex];
  const nextThought = getStepThoughts(updatedStepWork, stepId)[agentIndex];
  const stepUsages = getStepUsage(updatedStepWork, stepId);
  const hasUsageEntry = agentIndex < stepUsages.length;
  const nextUsage = stepUsages[agentIndex];

  mergedWork = updateAgentWork(mergedWork, stepId, agentIndex, {
    ...(typeof nextText === 'string' ? { text: nextText } : {}),
    ...(typeof nextThought === 'string' ? { thought: nextThought } : {}),
    ...(hasUsageEntry ? { usage: nextUsage ?? null } : {}),
  });

  if (stepId === STEPS.SYNTHESIS) {
    if (!mergedWork.results) {
      mergedWork.results = {};
    }

    const sourceKey = `${STEPS.SYNTHESIS}_sources`;
    if (Object.prototype.hasOwnProperty.call(updatedStepWork.results ?? {}, sourceKey)) {
      const synthesisSources = getSynthesisSources(updatedStepWork);
      if (synthesisSources) {
        mergedWork.results[sourceKey] = synthesisSources;
      } else {
        delete mergedWork.results[sourceKey];
      }
    } else {
      delete mergedWork.results[sourceKey];
    }

    const errorKey = `${STEPS.SYNTHESIS}_error`;
    if (Object.prototype.hasOwnProperty.call(updatedStepWork.results ?? {}, errorKey)) {
      mergedWork.results[errorKey] = getSynthesisErrorState(updatedStepWork);
    } else {
      delete mergedWork.results[errorKey];
    }
  }

  const latestMeta = updatedStepWork.stepMetadata?.find(meta => meta.id === stepId);
  if (latestMeta) {
    mergedWork = setStepMetaStatus(mergedWork, stepId, latestMeta.status, {
      label: latestMeta.label,
      staleFromStepId: latestMeta.staleFromStepId,
    });
  }

  if (updatedStepWork.agentNames) {
    mergedWork.agentNames = [...updatedStepWork.agentNames];
  }

  if (updatedStepWork.criticNames) {
    mergedWork.criticNames = [...updatedStepWork.criticNames];
  }

  if (updatedStepWork.debugInfo?.[stepId]) {
    mergedWork.debugInfo = {
      ...mergedWork.debugInfo,
      [stepId]: updatedStepWork.debugInfo[stepId],
    };
  }

  return mergedWork;
};

interface RegenerationDependencies {
  settings: AppSettings;
  messages: Message[];
  messagesRef: RefObject<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  orchestratorRef: RefObject<SwarmOrchestrator>;
  lastInput: { text: string, image: string | null, imageFile: File | null } | null;
}

export function useSwarmRegeneration({
  settings,
  messages,
  messagesRef,
  setMessages,
  orchestratorRef,
  lastInput
}: RegenerationDependencies) {

  const activeRegenerationsRef = useRef<Set<string>>(new Set());

  // Cleanup on unmount - abort all registered controllers
  useEffect(() => {
    const activeRegenerations = activeRegenerationsRef.current;

    return () => {
      // Controllers are in the centralized store, so abortAll will handle them
      activeRegenerations.clear();
    };
  }, []);


  const regenerateAgentResponse = async (
    messageId: string,
    stepId: StepId,
    agentIndex: number,
  ) => {
    regenLogger.info('regenerateAgentResponse START', { messageId, stepId, agentIndex });
    
    // FIX: Use messagesRef to avoid stale closure over messages array
    const currentMessages = messagesRef.current || messages;

    if (!isLatestRegenerableMessage(currentMessages, messageId)) {
      regenLogger.info('Skipping regeneration for non-latest assistant message', { messageId, stepId, agentIndex });
      return;
    }
    
    // PROTECTION: Prevent parallel regenerations of the same agent
    const regenerationKey = `${messageId}-${stepId}-${agentIndex}`;
    if (activeRegenerationsRef.current.has(regenerationKey)) {
      regenLogger.warn('Regeneration already in progress - aborting previous', { regenerationKey });
      
      // Abort the existing controller
      const existingIndex = currentMessages.findIndex(m => m.id === messageId);
      if (existingIndex !== -1) {
        const existingControllerKey = `regen-${messageId}-${stepId}-${agentIndex}`;
        const existing = useAgentStore.getState().abortControllers.get(existingControllerKey);
        existing?.abort();
        useAgentStore.getState().unregisterAbortController(existingControllerKey);
      }
      
      // Small delay to allow cleanup of previous stream
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Mark as active
    activeRegenerationsRef.current.add(regenerationKey);
    
    const messageIndex = currentMessages.findIndex(m => m.id === messageId);
    
    if (messageIndex === -1) {
      regenLogger.warn('Message not found for regeneration', { messageId, messagesLength: currentMessages.length });
      activeRegenerationsRef.current.delete(regenerationKey);
      return;
    }

    const targetMessage = currentMessages[messageIndex];
    const store = useAgentStore.getState();
    const previousActiveSessionId = store.activeSessionMessageId;
    const stepConfig = getStepConfig(stepId);

    const resolvedSession = resolveOperationalSessionWork(targetMessage, 'regeneration');
    const sessionBeforeRun = useAgentStore.getState().sessionsByMessageId[messageId];
    const workContext = resolvedSession?.work ? cloneWork(resolvedSession.work) : undefined;
    const wasCompletedMessage = getStepMeta(workContext, STEPS.SYNTHESIS)?.status === 'done';
    const seededAgentStates = (resolvedSession?.agentStates ?? [])
      .filter(agent => agent.messageId === messageId);
    const previousAgentStates = seededAgentStates.map(agent => ({ ...agent }));
    const originalWorkSnapshot = sessionBeforeRun?.work
      ? cloneWork(sessionBeforeRun.work)
      : resolvedSession?.work
        ? cloneWork(resolvedSession.work)
        : undefined;
    const previousSessionRuntime = resolvedSession?.source === 'existing-session' && sessionBeforeRun
      ? {
          status: sessionBeforeRun.status,
          isLoading: sessionBeforeRun.isLoading,
          isPaused: sessionBeforeRun.isPaused,
          loadingStatus: sessionBeforeRun.loadingStatus,
          error: sessionBeforeRun.error,
        }
      : {
          status: wasCompletedMessage ? 'done' as const : 'paused' as const,
          isLoading: !wasCompletedMessage,
          isPaused: !wasCompletedMessage,
          loadingStatus: wasCompletedMessage ? '' : 'Paused. Waiting for user confirmation...',
          error: null,
        };
    
    if (!workContext) {
      const errorMsg = `Cannot regenerate: No work context for message ${messageId}. ` +
        `Source: session=${!!sessionBeforeRun}`;
      
      regenLogger.error(errorMsg);
      useAgentStore.getState().setGlobalError('Cannot regenerate this message. Please try again.');
      activeRegenerationsRef.current.delete(regenerationKey);
      return;
    }

    store.startSession(messageId, workContext, {
      agentStates: seededAgentStates,
      status: 'running',
      isLoading: true,
      isPaused: false,
      loadingStatus: stepConfig.progressMsg || '',
      error: null,
    });

    // Create AbortController for this regeneration and register it centrally
    const controller = new AbortController();
    const controllerKey = `regen-${messageId}-${stepId}-${agentIndex}`;
    useAgentStore.getState().registerAbortController(controllerKey, controller);

    try {
      // Steps now manage their own status lifecycle (working → done/error)
      // No need to set 'working' here - Steps handle initialization themselves
      
      // FIX: Use currentMessages from messagesRef, not stale closure
      const history = currentMessages.slice(0, messageIndex);
      
      // Find the user message that triggered this model response
      const triggeringUserMessage = [...history].reverse().find(m => m.role === 'user');
      if (!triggeringUserMessage) {
        throw new Error('Could not find the original user prompt for regeneration');
      }

      const userInput = triggeringUserMessage.parts.map(p => p.text).join(' ');
      const image = triggeringUserMessage.image || null;
      
      // Use imageFile from lastInput only if it matches the current image
      const imageFile = (lastInput?.image === image) ? lastInput.imageFile : null;

      if (!orchestratorRef.current) {
        throw new Error('SwarmOrchestrator not initialized');
      }

      const { work: regeneratedWork } = await orchestratorRef.current.regenerateResponse(
        settings,
        userInput,
        image,
        imageFile,
        history,
        messageId,
        agentIndex,
        stepId,
        workContext,
        useAgentStore.getState().sessionsByMessageId[messageId]?.agentStates ?? [],
        () => undefined,
        controller.signal,
        () => {
          // Pass synthesis jump callback - invoked by SynthesisStep when it starts streaming
          useAgentStore.getState().updateSessionRuntime(messageId, {
            isLoading: false,
            isPaused: false,
          });
        }
      );

      // Handle final result
      const mergedWork = mergeRegeneratedStepWork(workContext, regeneratedWork, stepId, agentIndex);
      store.replaceSessionWork(messageId, mergedWork);
      if (stepId !== STEPS.SYNTHESIS) {
        store.markDownstreamStale(messageId, stepId);
      }
      
      regenLogger.info('Regeneration SUCCESS', { stepId, agentIndex });
      
      // Cleanup tracking
      activeRegenerationsRef.current.delete(regenerationKey);
      useAgentStore.getState().unregisterAbortController(controllerKey);
      
      // If we are in multi-agent steps, pause to allow user to continue or review
      // Synthesis step completion usually handles its own cleanup in StepRunner/Orchestrator
      let shouldClearActiveSession = false;
      if (stepId !== STEPS.SYNTHESIS) {
          if (wasCompletedMessage) {
              store.setSessionStatus(messageId, 'done');
              shouldClearActiveSession = true;
          } else {
              store.updateSessionRuntime(messageId, {
                status: 'paused',
                isLoading: true,
                isPaused: true,
                loadingStatus: 'Paused. Waiting for user confirmation...',
                error: null,
              });
          }
      } else {
          // If synthesis completed successfully, we can finish the global loading state
          store.setSessionStatus(messageId, 'done');
          shouldClearActiveSession = true;
      }

      if (shouldClearActiveSession) {
        flushSync(() => {
          setMessages(prev => commitSessionSnapshotToMessage(prev, messageId, { reason: 'regeneration-success' }));
        });
        store.setActiveSession(undefined);
      } else {
        setMessages(prev => commitSessionSnapshotToMessage(prev, messageId, { reason: 'regeneration-success' }));
      }
       
    } catch (error) {
      // ABORT GUARD: If the error is due to user cancellation, don't treat it as a failure
      if (
        (error instanceof Error && error.message === 'Aborted') ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        regenLogger.info('Regeneration aborted by user - cleanup', { stepId, agentIndex });

        store.replaceSessionWork(messageId, originalWorkSnapshot ?? workContext);
        store.replaceSessionAgents(messageId, previousAgentStates);
        store.updateSessionRuntime(messageId, previousSessionRuntime);
        store.setActiveSession(previousActiveSessionId);
        
        activeRegenerationsRef.current.delete(regenerationKey);
        store.unregisterAbortController(controllerKey);
        return;
      }

      regenLogger.error(`Regeneration failed for step ${stepId}, agent ${agentIndex}:`, error);
      const errorMessage = getFriendlyErrorMessage(error);
      
      store.replaceSessionWork(messageId, workContext);

      // Update store state to show error in LoadingIndicator.
      // NOTE: We set both isLoading: true AND isPaused: true.
      // CRITICAL: isLoading must remain true so that MessageList keeps the LoadingIndicator mounted.
      // In our state machine, this specific combination signals to the UI
      // (LoadingIndicator) that the process has errored and needs a Retry button.
      store.updateSessionRuntime(messageId, {
        status: 'error',
        isLoading: true,
        isPaused: true,
        loadingStatus: `Error: ${errorMessage}`,
        error: errorMessage,
      });

      setMessages(prev => commitSessionSnapshotToMessage(prev, messageId, { reason: 'regeneration-error' }));
      
      // Cleanup tracking on error (but keep error updates in messages)
      // Steps already updated work.results with error info
      activeRegenerationsRef.current.delete(regenerationKey);
      useAgentStore.getState().unregisterAbortController(controllerKey);
      // Keep the active session selected so the retry UI remains visible.
    }
  };

  return { regenerateAgentResponse };
}
