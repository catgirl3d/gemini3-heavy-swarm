import { type StepId, STEPS } from '@/types/steps';
import { type AppSettings, type Message, type Work, type TokenUsage } from '@/types';
import { ensureModelMessageForSynthesis, updateMessageParts, updateWorkAgentNames } from '@/utils/chat/messageHelpers';
import { getUpdatedAgentName } from '@/utils/swarm/agentHelpers';
import { updateAgentWork } from '@/utils/swarm/workHelpers';
import { Logger } from '@shared/utils/logger';

/**
 * Handles the logic for updating messages during synthesis regeneration chunk processing.
 */
export function processSynthesisChunkUpdate(
  messages: Message[],
  messageIndex: number,
  workContext: Work | undefined,
  text: string,
  settings: AppSettings
): { updatedMessages: Message[]; targetIndex: number } {
  const logger = new Logger('Synthesis', settings.debugMode);
  
  const newMessages = [...messages];
  
  // Custom logic for synthesis
  const { message: foundMsg, index: foundIndex, wasCreated } = ensureModelMessageForSynthesis(
    newMessages, messageIndex, workContext, text, settings
  );
  


  const msg = foundMsg;
  const targetIndex = foundIndex;
  
  if (wasCreated) {
    newMessages.push(msg);
  }
  
  if (msg && msg.role === 'model') {
    if (text !== '') {
      newMessages[targetIndex] = updateMessageParts(msg, text);
    }
  } else {
    logger.error('ERROR: Could not update text - msg is not a model message!');
  }

  return { updatedMessages: newMessages, targetIndex };
}

/**
 * Updates a Work object with new text AND syncs usage/thought from the store.
 * During regeneration, usage and thought are updated in currentWork store but not
 * in the message's work object. This function merges them to keep UI in sync.
 * 
 * SAFETY: Only syncs thought/usage from store if currentMessageId matches the provided messageId,
 * preventing data leakage between parallel regenerations of different messages.
 */
export function updateWorkForStep(
  work: Work,
  stepId: StepId,
  agentIndex: number,
  text: string,
  settings: AppSettings,
  messageId: string,
  thought?: string,
  usage?: TokenUsage | null
): Work {
  const newName = getUpdatedAgentName(agentIndex, stepId, settings);
  const updatedWork = updateWorkAgentNames(work, stepId, agentIndex, newName);
  
  // Use atomic update that handles text, thought, and usage
  return updateAgentWork(updatedWork, stepId, agentIndex, {
    text,
    thought,
    usage: usage || undefined
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
  isFirstChunk: boolean,
  messageId: string,
  thought?: string,
  usage?: TokenUsage | null
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
      messages, messageIndex, workContext, text, settings
    );
    updatedMsgs = updatedMessages;
    targetIdx = targetIndex;
  }

  const msg = updatedMsgs[targetIdx];
  // Use workContext as fallback if msg.work is missing
  const workToUse = msg?.work || workContext;
  
  if (msg && workToUse) {
    // Update the work object in the message with new results
    const updatedWork = updateWorkForStep(workToUse, stepId, agentIndex, text, settings, messageId, thought, usage);
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
