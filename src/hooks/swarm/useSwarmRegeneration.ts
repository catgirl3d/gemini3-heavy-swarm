import { useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type AppSettings, type Message, type Work } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
import { Logger } from '@shared/utils/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { updateTargetMessage } from '@/utils/chat/messageUpdaters';

import { calculateUpdatedStateForRegeneration } from '@/utils/swarm/regenerationHelpers';
import {
  cloneWork,
  getStepMeta,
  getStepResults,
  getStepThoughts,
  getStepUsage,
  getSynthesisResult,
  getSynthesisThought,
  getSynthesisUsage,
  markDownstreamStale as markWorkDownstreamStale,
  setStepMetaStatus,
  updateAgentWork,
} from '@/utils/swarm/workHelpers';
import { getFriendlyErrorMessage } from '@/services/swarm/steps/utils/errorUtils';
import { type SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { useAgentStore } from '@/stores/agentStore';
import { isLatestRegenerableMessage } from '@/utils/swarm/sessionHelpers';

const regenLogger = new Logger('Regeneration');

const cloneMessageSnapshot = (message: Message): Message => {
  return {
    ...message,
    parts: message.parts.map(part => ({ ...part })),
    sources: message.sources ? [...message.sources] : undefined,
    work: message.work ? cloneWork(message.work) : undefined,
  };
};

const mergeRegeneratedStepWork = (
  baseWork: Work,
  updatedStepWork: Work,
  stepId: StepId,
  agentIndex: number
): Work => {
  let mergedWork = cloneWork(baseWork);

  if (stepId === STEPS.SYNTHESIS) {
    const synthesisResult = getSynthesisResult(updatedStepWork);
    if (!mergedWork.results) {
      mergedWork.results = {};
    }

    if (synthesisResult !== null) {
      mergedWork.results[STEPS.SYNTHESIS] = synthesisResult;
    }

    const synthesisThought = getSynthesisThought(updatedStepWork);
    if (synthesisThought !== null) {
      mergedWork.results[`${STEPS.SYNTHESIS}_thought`] = synthesisThought;
    }

    const synthesisUsage = getSynthesisUsage(updatedStepWork);
    if (synthesisUsage !== null) {
      mergedWork.results[`${STEPS.SYNTHESIS}_usage`] = synthesisUsage;
    }
  } else {
    const nextText = getStepResults(updatedStepWork, stepId)[agentIndex];
    const nextThought = getStepThoughts(updatedStepWork, stepId)[agentIndex];
    const nextUsage = getStepUsage(updatedStepWork, stepId)[agentIndex];

    mergedWork = updateAgentWork(mergedWork, stepId, agentIndex, {
      ...(typeof nextText === 'string' ? { text: nextText } : {}),
      ...(typeof nextThought === 'string' ? { thought: nextThought } : {}),
      ...(nextUsage ? { usage: nextUsage } : {}),
    });
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
    const liveSession = store.sessionsByMessageId[messageId];
    const stepConfig = getStepConfig(stepId);
    const hasLiveSessionWork = !!liveSession?.work.results && Object.keys(liveSession.work.results).length > 0;
    
    // Regeneration preserves global flags to prevent UI remounting and state loss.
    const baseWork = (hasLiveSessionWork ? liveSession?.work : undefined)
      || targetMessage?.work;
    const workContext = baseWork ? cloneWork(baseWork) : undefined;
    const wasCompletedMessage = getStepMeta(baseWork, STEPS.SYNTHESIS)?.status === 'done';
    const previousActiveSessionId = store.activeSessionMessageId;
    const previousSessionRuntime = liveSession
      ? {
          status: liveSession.status,
          isLoading: liveSession.isLoading,
          isPaused: liveSession.isPaused,
          loadingStatus: liveSession.loadingStatus,
          error: liveSession.error,
        }
      : {
          status: wasCompletedMessage ? 'done' as const : 'paused' as const,
          isLoading: !wasCompletedMessage,
          isPaused: !wasCompletedMessage,
          loadingStatus: wasCompletedMessage ? '' : 'Paused. Waiting for user confirmation...',
          error: null,
        };
    const originalMessageSnapshot = cloneMessageSnapshot(targetMessage);
    
    if (!workContext) {
      const errorMsg = `Cannot regenerate: No work context for message ${messageId}. ` +
        `Source: message.work=${!!targetMessage?.work}, liveSession=${!!liveSession}`;
      
      regenLogger.error(errorMsg);
      useAgentStore.getState().setGlobalError('Cannot regenerate this message. Please try again.');
      activeRegenerationsRef.current.delete(regenerationKey);
      return;
    }

    store.startSession(messageId, workContext, {
      agentStates: (liveSession?.agentStates ?? workContext.agentStates ?? []).filter(agent => agent.messageId === messageId),
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

      const result = await orchestratorRef.current.regenerateResponse(
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
        (text, isFirstChunk, thought, usage) => {
          setMessages(prev => {
            return calculateUpdatedStateForRegeneration(
              prev,
              messageIndex,
              stepId,
              agentIndex,
              workContext,
              text,
              settings,
              isFirstChunk,
              messageId,
              thought,
              usage
            );
          });
        },
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
      const mergedWork = mergeRegeneratedStepWork(workContext, result.work, stepId, agentIndex);
      store.replaceSessionWork(messageId, mergedWork);
      if (stepId !== STEPS.SYNTHESIS) {
        store.markDownstreamStale(messageId, stepId);
      }

      const sessionSnapshot = store.snapshotSessionWork(messageId);

      setMessages(prev => {
          const idx = prev.findIndex(m => m.id === messageId);
          if (idx === -1) return prev;

          const existingMessage = prev[idx];
          const mergedMessageWork = mergeRegeneratedStepWork(existingMessage.work ?? workContext, result.work, stepId, agentIndex);
          const finalMessageWork = stepId === STEPS.SYNTHESIS
            ? mergedMessageWork
            : markWorkDownstreamStale(mergedMessageWork, stepId);
          const updatedMessage: Message = {
              ...existingMessage,
              work: sessionSnapshot
                ? { ...finalMessageWork, agentStates: sessionSnapshot.agentStates }
                : finalMessageWork,
              sources: result.sources || existingMessage.sources
          };
          
          const newMessages = [...prev];
          newMessages[idx] = updatedMessage;
          return newMessages;
      });
      
      regenLogger.info('Regeneration SUCCESS', { stepId, agentIndex });
      
      // Cleanup tracking
      activeRegenerationsRef.current.delete(regenerationKey);
      useAgentStore.getState().unregisterAbortController(controllerKey);
      
      // If we are in multi-agent steps, pause to allow user to continue or review
      // Synthesis step completion usually handles its own cleanup in StepRunner/Orchestrator
      if (stepId !== STEPS.SYNTHESIS) {
          if (wasCompletedMessage) {
              store.setSessionStatus(messageId, 'done');
              store.setActiveSession(undefined);
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
          store.setActiveSession(undefined);
      }
      
    } catch (error) {
      // ABORT GUARD: If the error is due to user cancellation, don't treat it as a failure
      if (
        (error instanceof Error && error.message === 'Aborted') ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        regenLogger.info('Regeneration aborted by user - cleanup', { stepId, agentIndex });

        store.replaceSessionWork(messageId, workContext);
        store.updateSessionRuntime(messageId, previousSessionRuntime);

        if (stepId === STEPS.SYNTHESIS) {
          setMessages(prev => prev.map(message => (
            message.id === messageId ? cloneMessageSnapshot(originalMessageSnapshot) : message
          )));
        }

        store.setActiveSession(previousActiveSessionId);
        
        activeRegenerationsRef.current.delete(regenerationKey);
        store.unregisterAbortController(controllerKey);
        return;
      }

      regenLogger.error(`Regeneration failed for step ${stepId}, agent ${agentIndex}:`, error);
      const errorMessage = getFriendlyErrorMessage(error);
      
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

      // Steps already updated work.results and status - just save work snapshot and update message
      setMessages(prev => {
        // CRITICAL: Use workContext as the base because it contains the incremented error counts
        // from the failed attempt. prev[messageIndex]?.work might be stale.
        const workToUpdate = workContext || prev[messageIndex]?.work;
        
        // Steps already updated work.results with error - just add agentStates snapshot
        const updatedWork = workToUpdate ? {
          ...workToUpdate,
          agentStates: useAgentStore.getState().sessionsByMessageId[messageId]?.agentStates ?? []
        } : undefined;
        
        // We no longer update message parts with [System: ...] error text to avoid polluting the main UI.
        // The error is already saved in work.results[stepId] and will be shown in the "Show Work" card.
        const updates: Partial<Message> = { work: updatedWork };

        const updated = updateTargetMessage(prev, messageIndex, stepId, updates, { workContext });
        
        return updated ?? prev;
      });
      
      // Cleanup tracking on error (but keep error updates in messages)
      // Steps already updated work.results with error info
      activeRegenerationsRef.current.delete(regenerationKey);
      useAgentStore.getState().unregisterAbortController(controllerKey);
      // Keep the active session selected so the retry UI remains visible.
    }
  };

  return { regenerateAgentResponse };
}
