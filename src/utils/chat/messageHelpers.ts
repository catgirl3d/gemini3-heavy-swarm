import { Message, Work, AppSettings } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { generateUUID } from '@/utils/common/uuid';
import { setWorkName } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';

/**
 * Immutably updates the text of the first part of a message.
 */
export function updateMessageParts(message: Message, text: string): Message {
  const updatedParts = message.parts && message.parts.length > 0
    ? [{ ...message.parts[0], text }, ...message.parts.slice(1)]
    : [{ text }];
  
  return { ...message, parts: updatedParts };
}

/**
 * Immutably updates agent or critic names in a Work object based on the step.
 */
export function updateWorkAgentNames(work: Work, stepId: StepId, agentIndex: number, newName: string): Work {
  return setWorkName(work, stepId, agentIndex, newName);
}

/**
 * Creates a new model message for synthesis regeneration.
 */
function createRegeneratedModelMessage(workContext: Work | undefined, text: string): Message {
  return {
    id: generateUUID(),
    role: 'model',
    parts: [{ text }],
    work: workContext
  };
}

/**
 * Finds or creates the target model message for synthesis regeneration.
 * Handles the complex logic of:
 * - Checking if target message is already a model message
 * - Looking for an existing model message at the next index
 * - Creating a new model message if needed
 * 
 * @returns Object with message, index, and wasCreated flag
 */
export function ensureModelMessageForSynthesis(
  messages: Message[],
  messageIndex: number,
  workContext: Work | undefined,
  text: string,
  settings?: AppSettings
): { message: Message; index: number; wasCreated: boolean } {
  const logger = new Logger('Synthesis', settings?.debugMode);
  
  const targetIndex = findTargetMessageIndex(messages, messageIndex, STEPS.SYNTHESIS);
  
  if (targetIndex !== null) {
    logger.debug('Found existing model message at index', targetIndex);
    return { message: messages[targetIndex], index: targetIndex, wasCreated: false };
  }
  
  // Create new model message
  logger.debug('Creating NEW model message');
  const newMsg = createRegeneratedModelMessage(workContext, text);
  return { message: newMsg, index: messages.length, wasCreated: true };
}

/**
 * Finds the index of the target message for updates during regeneration.
 * Handles logic for finding the correct model message to update.
 * 
 * @returns Index of target message, or null if not found
 */
export function findTargetMessageIndex(
  messages: Message[],
  messageIndex: number,
  stepId: StepId
): number | null {
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
