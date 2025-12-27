import { StepId, STEPS } from '@/types/steps';
import { getStepConfig } from '@/utils/stepConstants';
import { AppSettings, Message, Work } from '@/types';
import { ensureModelMessageForSynthesis, updateMessageParts, updateWorkAgentNames } from '@/utils/messageHelpers';
import { getUpdatedAgentName } from '@/utils/agentHelpers';
import { updateStepResult } from '@/utils/workHelpers';
import { Logger } from '@/utils/logger';

/**
 * Returns consistent UI labels for regeneration steps.
 */
export function getStepLabels(stepId: StepId): { regenerating: string; done: string } {
  const config = getStepConfig(stepId);
  return { 
    regenerating: config.labels.working, 
    done: config.labels.done 
  };
}

/**
 * Handles the logic for updating messages during synthesis regeneration chunk processing.
 */
export function processSynthesisChunkUpdate(
  messages: Message[],
  messageIndex: number,
  workContext: Work | undefined,
  text: string,
  settings: AppSettings,
  isFirstChunk: boolean,
  onSynthesisStart?: () => void
): { updatedMessages: Message[]; targetIndex: number } {
  const logger = new Logger('Synthesis', settings.debugMode);
  logger.debug('processSynthesisChunkUpdate:', { textLength: text.length, messageIndex });
  
  const newMessages = [...messages];
  
  // Custom logic for synthesis
  const { message: foundMsg, index: foundIndex, wasCreated } = ensureModelMessageForSynthesis(
    newMessages, messageIndex, workContext, text, settings
  );
  
  if (onSynthesisStart && isFirstChunk) {
    logger.debug('First chunk detected - triggering onSynthesisStart (hiding loading UI)');
    /**
     * Trigger the 'jump' side-effect in the UI (e.g., hiding cards).
     * This is called only on the first chunk to ensure the transition happens exactly once.
     */
    onSynthesisStart();
  }

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
 * Updates a Work object with the new agent name and step result.
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
  return updateStepResult(updatedWork, stepId, agentIndex, text);
}

/**
 * Encapsulates the complex logic for updating messages and work-context during regeneration.
 * Used inside the onUpdate callback of regenerateResponse.
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
  onSynthesisStart?: () => void
): { updatedMessages: Message[]; updatedWork: Work | undefined } {
  let targetIdx = messageIndex;
  let updatedMsgs = [...messages];

  // 1. Handle Message Updates
  if (stepId === STEPS.SYNTHESIS) {
    const { updatedMessages, targetIndex } = processSynthesisChunkUpdate(
      messages, messageIndex, workContext, text, settings, isFirstChunk, onSynthesisStart
    );
    updatedMsgs = updatedMessages;
    targetIdx = targetIndex;
  }

  const msg = updatedMsgs[targetIdx];
  // CRITICAL FIX: Use workContext as fallback if msg.work is missing.
  // This ensures we don't fail to update the message just because the work property used to be undefined.
  const workToUse = msg?.work || workContext;
  
  if (msg && workToUse) {
    const updatedWork = updateWorkForStep(workToUse, stepId, agentIndex, text, settings);
    updatedMsgs[targetIdx] = { ...msg, work: updatedWork };
  }

  // 2. Handle Work context update (for currentWork)
  let updatedWorkContext = workContext;
  if (workContext) {
    updatedWorkContext = updateWorkForStep(workContext, stepId, agentIndex, text, settings);
  }

  return { 
    updatedMessages: updatedMsgs, 
    updatedWork: updatedWorkContext 
  };
}
