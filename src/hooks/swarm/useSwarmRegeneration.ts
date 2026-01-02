import { useRef, useEffect, RefObject, Dispatch, SetStateAction } from 'react';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { Logger } from '@shared/utils/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { getMissingAgentsForMessage } from '@/utils/swarm/agentHelpers';
import { updateTargetMessage } from '@/utils/chat/messageUpdaters';

import { calculateUpdatedStateForRegeneration } from '@/utils/swarm/regenerationHelpers';
import { withEnsuredResults, cloneWork, updateAgentWork } from '@/utils/swarm/workHelpers';
import { getFriendlyErrorMessage } from '@/services/swarm/steps/utils/errorUtils';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { useAgentStore } from '@/stores/agentStore';

const regenLogger = new Logger('Regeneration', true);

interface RegenerationDependencies {
  settings: AppSettings;
  messages: Message[];
  messagesRef: RefObject<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  currentWork: Work | undefined;
  currentMessageId: string | undefined;
  orchestratorRef: RefObject<SwarmOrchestrator>;
  lastInput: { text: string, image: string | null, imageFile: File | null } | null;
}

export function useSwarmRegeneration({
  settings,
  messages,
  messagesRef,
  setMessages,
  currentWork,
  currentMessageId,
  orchestratorRef,
  lastInput
}: RegenerationDependencies) {

  const activeRegenerationsRef = useRef<Set<string>>(new Set());

  // Cleanup on unmount - abort all registered controllers
  useEffect(() => {
    return () => {
      // Controllers are in the centralized store, so abortAll will handle them
      activeRegenerationsRef.current.clear();
    };
  }, []);


  const regenerateAgentResponse = async (
    messageId: string,
    stepId: StepId,
    agentIndex: number,
    pauseResolverRef?: import('react').MutableRefObject<(() => void) | null>
  ) => {
    regenLogger.info('regenerateAgentResponse START', { messageId, stepId, agentIndex });
    
    // FIX: Use messagesRef to avoid stale closure over messages array
    const currentMessages = messagesRef.current || messages;
    
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
    
    // Regeneration preserves global flags to prevent UI remounting and state loss.
    // Use message's work if available. Fallback to currentWork ONLY if it belongs to the same message.
    const baseWork = targetMessage?.work || (currentMessageId === messageId ? currentWork : undefined);
    const workContext = baseWork ? cloneWork(baseWork) : undefined;
    
    if (!workContext) {
      const errorMsg = `Cannot regenerate: No work context for message ${messageId}. ` +
        `Source: message.work=${!!targetMessage?.work}, currentWork=${!!currentWork}, ` +
        `currentMessageId match=${currentMessageId === messageId}`;
      
      regenLogger.error(errorMsg);
      useAgentStore.getState().setError('Cannot regenerate this message. Please try again.');
      activeRegenerationsRef.current.delete(regenerationKey);
      return;
    }

    // MINIMAL HYDRATION: Ensure agents exist for this message
    // 1. Check if agents are already in store (active session)
    const currentAgents = useAgentStore.getState().agents;
    const hasAgentsForMessage = currentAgents.some(a => a.messageId === messageId);
    
    if (!hasAgentsForMessage) {
      // 2. If not, try to recover them (Legacy/Reload support)
      const missingAgents = getMissingAgentsForMessage(messageId, workContext, stepId);
      
      if (missingAgents.length > 0) {
        regenLogger.debug('Restoring missing agents', { count: missingAgents.length, source: 'helper' });
        useAgentStore.getState().hydrate([...currentAgents, ...missingAgents]);
      }
    }

    // Create AbortController for this regeneration and register it centrally
    const controller = new AbortController();
    const controllerKey = `regen-${messageId}-${stepId}-${agentIndex}`;
    useAgentStore.getState().registerAbortController(controllerKey, controller);

    const stepConfig = getStepConfig(stepId);
    const store = useAgentStore.getState();
    
    // Reset global error and update status to reflect the new attempt.
    // This ensures any previous error banner hides and the indicator shows new progress.
    store.setError(null);
    store.setIsLoading(true);
    store.setLoadingStatus(stepConfig.progressMsg || '');

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
        useAgentStore.getState().agents, // Use store for current truth
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
        pauseResolverRef,
        () => {
          useAgentStore.getState().setIsPaused(true);
          useAgentStore.getState().setLoadingStatus('Paused. Waiting for user confirmation...');
        },
        () => {
          // Pass synthesis jump callback - invoked by SynthesisStep when it starts streaming
          useAgentStore.getState().setIsLoading(false);
          useAgentStore.getState().setIsPaused(false);
        }
      );

      // Handle final result
      // "result" contains the authoritative updated Work object for THIS agent from the step.
      // We use it to surgically update the latest message state without overwriting other agents' work.
      setMessages(prev => {
          const idx = prev.findIndex(m => m.id === messageId);
          if (idx === -1) return prev;

          const existingMessage = prev[idx];
          const existingWork = existingMessage.work || workContext;
          
          // 1. Extract this agent's specific data from the regeneration result
          const text = stepId === STEPS.SYNTHESIS 
             ? (result.work.results?.[stepId] as any)?.text 
             : (result.work.results?.[stepId] as string[])?.[agentIndex];
             
          const thought = stepId === STEPS.SYNTHESIS
             ? result.work.results?.[`${stepId}_thought`] as string
             : (result.work.results?.[`${stepId}_thoughts`] as string[])?.[agentIndex];

          const usage = stepId === STEPS.SYNTHESIS
             ? result.work.results?.[`${stepId}_usage`]
             : (result.work.results?.[`${stepId}_usage`] as any[])?.[agentIndex];

          // 2. Perform atomic update into the LATEST messages work state
          let updatedWork = updateAgentWork(existingWork, stepId, agentIndex, {
              text,
              thought,
              usage
          });
          
          // 3. Sync step metadata (status: done/error) from the result
          if (result.work.stepMetadata) {
              const latestMeta = result.work.stepMetadata.find(m => m.id === stepId);
              if (latestMeta) {
                if (!updatedWork.stepMetadata) updatedWork.stepMetadata = [];
                const mIdx = updatedWork.stepMetadata.findIndex(m => m.id === stepId);
                if (mIdx >= 0) updatedWork.stepMetadata[mIdx] = { ...updatedWork.stepMetadata[mIdx], ...latestMeta };
                else updatedWork.stepMetadata.push(latestMeta);
              }
          }

          // 4. Snapshot current agent states for history tracking
          const currentAgents = useAgentStore.getState().agents.filter(a => a.messageId === messageId);
          updatedWork.agentStates = currentAgents;
          
          const updatedMessage: Message = {
              ...existingMessage,
              work: updatedWork,
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
      
    } catch (error) {
      // ABORT GUARD: If the error is due to user cancellation, don't treat it as a failure
      if (
        (error instanceof Error && error.message === 'Aborted') ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        regenLogger.info('Regeneration aborted by user - cleanup', { stepId, agentIndex });
        
        // Simple cleanup: just clear loading state
        useAgentStore.getState().setIsLoading(false);
        
        activeRegenerationsRef.current.delete(regenerationKey);
        useAgentStore.getState().unregisterAbortController(controllerKey);
        return;
      }

      regenLogger.error(`Regeneration failed for step ${stepId}, agent ${agentIndex}:`, error);
      const errorMessage = getFriendlyErrorMessage(error);
      
      // Update store state to show error in LoadingIndicator.
      // NOTE: We set both isLoading: true AND isPaused: true.
      // CRITICAL: isLoading must remain true so that MessageList keeps the LoadingIndicator mounted.
      // In our state machine, this specific combination signals to the UI
      // (LoadingIndicator) that the process has errored and needs a Retry button.
      const store = useAgentStore.getState();
      store.setIsLoading(true);
      store.setIsPaused(true);
      store.setLoadingStatus(`Error: ${errorMessage}`);

      // Steps already updated work.results and status - just save work snapshot and update message
      setMessages(prev => {
        // CRITICAL: Use workContext as the base because it contains the incremented error counts
        // from the failed attempt. prev[messageIndex]?.work might be stale.
        const workToUpdate = workContext || prev[messageIndex]?.work;
        
        // Steps already updated work.results with error - just add agentStates snapshot
        const updatedWork = workToUpdate ? {
          ...workToUpdate,
          agentStates: useAgentStore.getState().agents.filter(a => a.messageId === messageId)
        } : undefined;
        
        // We no longer update message parts with [System: ...] error text to avoid polluting the main UI.
        // The error is already saved in work.results[stepId] and will be shown in the "Show Work" card.
        const updates: any = { work: updatedWork };

        const updated = updateTargetMessage(prev, messageIndex, stepId, updates, { workContext });
        
        return updated ?? prev;
      });
      
      // Cleanup tracking on error (but keep error updates in messages)
      // Steps already updated work.results with error info
      activeRegenerationsRef.current.delete(regenerationKey);
      useAgentStore.getState().unregisterAbortController(controllerKey);
      // DON'T clear currentMessageId here - leave it set so error state remains visible
      // It will be cleared when next regeneration/orchestration starts
    }
  };

  return { regenerateAgentResponse };
}
