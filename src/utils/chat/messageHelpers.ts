import { type Message, type Work } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
import { setWorkName } from '@/utils/swarm/stepConstants';

/**
 * Immutably updates agent or critic names in a Work object based on the step.
 */
export const updateWorkAgentNames = (work: Work, stepId: StepId, agentIndex: number, newName: string): Work => {
  return setWorkName(work, stepId, agentIndex, newName);
};

/**
 * Finds the index of the target message for updates during regeneration.
 * Handles logic for finding the correct model message to update.
 * 
 * @returns Index of target message, or null if not found
 */
export const findTargetMessageIndex = (
  messages: Message[],
  messageIndex: number,
  stepId: StepId
): number | null => {
  const msg = messages[messageIndex];
  if (msg?.role === 'model') {
    return messageIndex;
  }
  
  const nextMsg = messages[messageIndex + 1];
  if (nextMsg?.role === 'model') {
    return messageIndex + 1;
  }
  
  if (stepId === STEPS.SYNTHESIS) {
    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx]?.role === 'model') {
      return lastIdx;
    }
  }
  
  return null;
}
