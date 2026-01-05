import { Message, Work } from '@/types';
import { StepId } from '@/types/steps';
import { findTargetMessageIndex } from './messageHelpers';

/**
 * Unified utility for updating target messages with results, errors, or finalization data.
 * Handles all the boilerplate: finding target, checking role, merging work, etc.
 */
export function updateTargetMessage<T extends Partial<Message>>(
  messages: Message[],
  messageIndex: number,
  stepId: StepId,
  updates: T,
  options?: {
    workContext?: Work;
  }
): Message[] | null {
  const newMessages = [...messages];
  const targetIndex = findTargetMessageIndex(newMessages, messageIndex, stepId);
  
  if (targetIndex === null) {
    return null; // Target not found, caller can decide to return prev or handle differently
  }
  
  const msg = newMessages[targetIndex];
  
  if (!msg || msg.role !== 'model') {
    return null; // Not a model message, cannot update
  }
  
  // Merge work if provided in updates
  let updatedWork = updates.work;
  if (!updatedWork && options?.workContext) {
    updatedWork = msg.work || options.workContext;
  }
  
  // CRITICAL: Preserve isStopped flag if it was already set on the message's work
  if (msg.work?.isStopped && updatedWork) {
    updatedWork = { ...updatedWork, isStopped: true };
  }
  
  // Apply updates
  newMessages[targetIndex] = {
    ...msg,
    ...updates,
    work: updatedWork
  };
  
  return newMessages;
}
