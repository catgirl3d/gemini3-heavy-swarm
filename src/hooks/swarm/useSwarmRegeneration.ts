import { useRef, useEffect, RefObject, Dispatch, SetStateAction } from 'react';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { Logger } from '@shared/utils/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { getMissingAgentsForMessage } from '@/utils/swarm/agentHelpers';
import { updateTargetMessage } from '@/utils/chat/messageUpdaters';
import { handleSynthesisJump } from '@/utils/swarm/stepConstants';
import {
  calculateUpdatedStateForRegeneration 
} from '@/utils/swarm/regenerationHelpers';
import { withEnsuredResults, updateStepWithError, cloneWork } from '@/utils/swarm/workHelpers';
import { getFriendlyErrorMessage, getErrorLabel } from '@/services/swarm/steps/utils/errorUtils';
import { GeminiService } from '@/services/swarm/GeminiService';
import { useAgentStore } from '@/stores/agentStore';

const regenLogger = new Logger('Regeneration', true);

interface RegenerationDependencies {
  settings: AppSettings;
  messages: Message[];
  messagesRef: RefObject<Message[]>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  currentWork: Work | undefined;
  geminiServiceRef: RefObject<GeminiService>;
  lastInput: { text: string, image: string | null, imageFile: File | null } | null;
  pauseResolverRef: import('react').MutableRefObject<(() => void) | null>;
}

export function useSwarmRegeneration({
  settings,
  messages,
  messagesRef,
  setMessages,
  currentWork,
  geminiServiceRef,
  lastInput,
  pauseResolverRef
}: RegenerationDependencies) {

  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllersRef.current.forEach(c => c.abort());
      controllersRef.current.clear();
    };
  }, []);

  const regenerateAgentResponse = async (messageId: string, stepId: StepId, agentIndex: number) => {
    regenLogger.info('regenerateAgentResponse START', { messageId, stepId, agentIndex });
    // Find the message by ID
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      regenLogger.warn('Message not found for regeneration', { messageId, messagesLength: messages.length });
      return;
    }

    const targetMessage = messages[messageIndex];
    
    // Regeneration preserves global flags to prevent UI remounting and state loss.

    const baseWork = targetMessage?.work || currentWork;
    const workContext = baseWork ? cloneWork(baseWork) : undefined;
    
    if (!workContext) {
      regenLogger.warn('No workContext, aborting regeneration');
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

    const syncStatus = (status: AgentState['status'], label: string) => {
      useAgentStore.getState().updateAgent(stepId, agentIndex, status, label, messageId);
    };

    const controllerKey = `${messageIndex}-${stepId}-${agentIndex}`;
    if (controllersRef.current.has(controllerKey)) {
      controllersRef.current.get(controllerKey)?.abort();
    }
    const controller = new AbortController();
    controllersRef.current.set(controllerKey, controller);

    try {      
      const config = getStepConfig(stepId);
      // For SYNTHESIS, don't set working immediately - SynthesisStep manages this
      // to prevent premature card collapse. It will set waiting first, then working on first chunk.
      if (stepId !== STEPS.SYNTHESIS) {
        syncStatus('working', config.labels.working);
      }
      
      const history = messages.slice(0, messageIndex);
      
      // Find the user message that triggered this model response
      const triggeringUserMessage = [...history].reverse().find(m => m.role === 'user');
      if (!triggeringUserMessage) {
        throw new Error('Could not find the original user prompt for regeneration');
      }

      const userInput = triggeringUserMessage.parts.map(p => p.text).join(' ');
      const image = triggeringUserMessage.image || null;
      
      // Use imageFile from lastInput only if it matches the current prompt (to avoid using wrong file for old messages)
      let imageFile: File | null = null;
      if (lastInput && lastInput.text === userInput && lastInput.image === image) {
        imageFile = lastInput.imageFile;
      }

      if (!geminiServiceRef.current) {
        throw new Error('GeminiService not initialized');
      }

      const result = await geminiServiceRef.current.regenerateResponse(
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
        (text, isFirstChunk) => {
          const baseMessages = messagesRef.current || [];
          
          const { updatedMessages } = calculateUpdatedStateForRegeneration(
            baseMessages,
            messageIndex,
            stepId,
            agentIndex,
            workContext,
            text,
            settings,
            isFirstChunk,
            () => {
              /**
               * SYNTHESIS JUMP BEHAVIOR
               * When first chunk arrives, hide loading indicators.
               * Card collapse is handled automatically by ShowWork observing the agent status
               * change that happened inside SynthesisStep.ts.
               */
              if (stepId === STEPS.SYNTHESIS) {
                handleSynthesisJump(useAgentStore.getState().setIsLoading, useAgentStore.getState().setIsPaused);
              }
            }
          );

          setMessages(updatedMessages);
        },
        controller.signal,
        pauseResolverRef,
        () => {
          useAgentStore.getState().setIsPaused(true);
          useAgentStore.getState().setLoadingStatus('Paused. Waiting for user confirmation...');
        }
      );

      // Handle final result
      if (typeof result === 'object' && result !== null && 'sources' in result) {
         setMessages(prev => {
           const workToUpdate = prev[messageIndex]?.work || workContext || currentWork;
           const updatedWork = workToUpdate ? (() => {
             const ensuredWork = withEnsuredResults(workToUpdate);
             return {
               ...ensuredWork,
               results: { ...ensuredWork.results, [stepId]: result },
               // FINAL SNAPSHOT: Save latest global agentStates for HISTORY
               agentStates: useAgentStore.getState().agents.filter(a => a.messageId === messageId)
             };
           })() : undefined;
           
           const updated = updateTargetMessage(prev, messageIndex, stepId, {
             sources: (result as any).sources,
             work: updatedWork
           }, { workContext, currentWork });
           
           return updated ?? prev;
         });
      }

      syncStatus('done', config.labels.done);
      regenLogger.info('Regeneration SUCCESS', { stepId, agentIndex });
      controllersRef.current.delete(controllerKey);
      
    } catch (error) {
      // ABORT GUARD: If the error is due to user cancellation, don't treat it as a failure
      if (
        (error instanceof Error && error.message === 'Aborted') ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        regenLogger.info('Regeneration aborted by user', { stepId, agentIndex });
        controllersRef.current.delete(controllerKey);
        return;
      }

      regenLogger.error(`Regeneration failed for step ${stepId}, agent ${agentIndex}:`, error);
      const errorLabel = getErrorLabel(error, 'Regeneration Failed');
      const errorMessage = getFriendlyErrorMessage(error);
      
      // Update global state via syncStatus
      regenLogger.debug('Updating agent to error status', { stepId, agentIndex, messageId, errorLabel });
      syncStatus('error', errorLabel);
      
      // Verify the update happened
      const updatedAgent = useAgentStore.getState().agents.find(
        a => a.stepId === stepId && a.agentIndex === agentIndex && a.messageId === messageId
      );
      regenLogger.debug('Agent after error update:', updatedAgent);
      
      // Update message with error
      setMessages(prev => {
        const workToUpdate = prev[messageIndex]?.work || workContext || currentWork;
        let updatedWork = workToUpdate ? updateStepWithError(workToUpdate, stepId, agentIndex, errorMessage) : undefined;
        
        // FINAL SNAPSHOT: Save actual error state to work for history
        if (updatedWork) {
          updatedWork = { ...updatedWork, agentStates: useAgentStore.getState().agents.filter(a => a.messageId === messageId) };
        }
        
        const config = getStepConfig(stepId);
        const errorText = `[System: ${config.errorPrefix}. ${errorMessage}]`;
        
        // CRITICAL: Only update message parts (the main chat text) if we are regenerating the synthesis step.
        // For initial/refinement steps, we only update the work object so the agent card shows the error.
        const updates: any = { work: updatedWork };
        if (stepId === STEPS.SYNTHESIS) {
          updates.parts = [{ text: errorText }];
        }

        const updated = updateTargetMessage(prev, messageIndex, stepId, updates, { workContext, currentWork });
        
        return updated ?? prev;
      });
      
      controllersRef.current.delete(controllerKey);
      // DON'T clear currentMessageId here - leave it set so error state remains visible
      // It will be cleared when next regeneration/orchestration starts
    }
  };

  return { regenerateAgentResponse };
}
