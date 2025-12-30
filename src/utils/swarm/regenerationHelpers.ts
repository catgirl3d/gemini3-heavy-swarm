import { StepId, STEPS } from '@/types/steps';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { AppSettings, Message, Work } from '@/types';
import { ensureModelMessageForSynthesis, updateMessageParts, updateWorkAgentNames } from '@/utils/chat/messageHelpers';
import { getUpdatedAgentName } from '@/utils/swarm/agentHelpers';
import { updateAgentWork } from '@/utils/swarm/workHelpers';
import { useAgentStore } from '@/stores/agentStore';
import { Logger } from '@shared/utils/logger';

/**
 * Handles the logic for updating messages during synthesis regeneration chunk processing.
 */
export function processSynthesisChunkUpdate(
  messages: Message[],
  messageIndex: number,
  workContext: Work | undefined,
  text: string,
  settings: AppSettings,
  isFirstChunk: boolean
): { updatedMessages: Message[]; targetIndex: number } {
  const logger = new Logger('Synthesis', settings.debugMode);
  logger.debug('processSynthesisChunkUpdate:', { textLength: text.length, messageIndex });
  
  const newMessages = [...messages];
  
  // Custom logic for synthesis
  const { message: foundMsg, index: foundIndex, wasCreated } = ensureModelMessageForSynthesis(
    newMessages, messageIndex, workContext, text, settings
  );
  


  let msg = foundMsg;
  let targetIndex = foundIndex;
  
  if (wasCreated) {
    newMessages.push(msg);
  }
  
  if (msg && msg.role === 'model') {
    logger.debug('Updating model message text:', { hasMsg: !!msg, msgRole: msg?.role, textLength: text.length });
    newMessages[targetIndex] = updateMessageParts(msg, text);
    logger.debug('Text updated successfully');
  } else {
    logger.error('ERROR: Could not update text - msg is not a model message!');
  }

  return { updatedMessages: newMessages, targetIndex };
}

/**
 * Updates a Work object with new text AND syncs usage/thought from the store.
 * During regeneration, usage and thought are updated in currentWork store but not
 * in the message's work object. This function merges them to keep UI in sync.
 */
export function updateWorkForStep(
  work: Work,
  stepId: StepId,
  agentIndex: number,
  text: string,
  settings: AppSettings
): Work {
  const newName = getUpdatedAgentName(agentIndex, stepId, settings);
  let updatedWork = updateWorkAgentNames(work, stepId, agentIndex, newName);
  
  // Sync usage and thought from currentWork store if available
  const currentWork = useAgentStore.getState().currentWork;
  let thought: string | undefined;
  let usage: any | undefined;
  
  if (currentWork?.results) {
    // Extract thought
    if (stepId === STEPS.SYNTHESIS) {
      thought = currentWork.results[`${stepId}_thought`] as string;
    } else {
      const thoughts = currentWork.results[`${stepId}_thoughts`] as string[] | undefined;
      thought = thoughts?.[agentIndex];
    }
    
    // Extract usage
    const usageKey = `${stepId}_usage`;
    if (stepId === STEPS.SYNTHESIS) {
      usage = currentWork.results[usageKey];
    } else {
      const usages = currentWork.results[usageKey] as any[] | undefined;
      usage = usages?.[agentIndex];
    }
  }
  
  // Use atomic update that handles text, thought, and usage
  return updateAgentWork(updatedWork, stepId, agentIndex, {
    text,
    thought,
    usage
  });
}

/**
 * Encapsulates the logic for updating messages during regeneration.
 * Used inside the onUpdate callback of regenerateResponse.
 * 
 * NOTE: Agent states are managed globally in Zustand store, not in Work object during regeneration.
 */
export function calculateUpdatedStateForRegeneration(
  messages: Message[],
  messageIndex: number,
  stepId: StepId,
  agentIndex: number,
  workContext: Work | undefined,
  text: string,
  settings: AppSettings,
  isFirstChunk: boolean
): Message[] {
  let targetIdx = messageIndex;
  let updatedMsgs = [...messages];
  const logger = new Logger('RegenUpdate', settings.debugMode);

  if (isFirstChunk) {
    logger.debug('calculateUpdatedState: START', { stepId, agentIndex, messageIndex, hasWorkContext: !!workContext });
  }

  // 1. Handle Message Updates
  if (stepId === STEPS.SYNTHESIS) {
    const { updatedMessages, targetIndex } = processSynthesisChunkUpdate(
      messages, messageIndex, workContext, text, settings, isFirstChunk
    );
    updatedMsgs = updatedMessages;
    targetIdx = targetIndex;
  }

  const msg = updatedMsgs[targetIdx];
  // Use workContext as fallback if msg.work is missing
  const workToUse = msg?.work || workContext;
  
  if (msg && workToUse) {
    // Update the work object in the message with new results
    const updatedWork = updateWorkForStep(workToUse, stepId, agentIndex, text, settings);
    updatedMsgs[targetIdx] = { ...msg, work: updatedWork };
  } else if (isFirstChunk) {
    logger.warn('calculateUpdatedState: Missing message or work', { 
        hasMsg: !!msg, 
        hasWorkToUse: !!workToUse, 
        targetIdx 
    });
  }

  return updatedMsgs;
}
