import { Message, Work, AppSettings } from '@/types';
import { StepId } from '@/types/steps';
import { generateUUID } from '@/utils/uuid';
import { setWorkName } from '@/utils/stepConfig';
import { Logger } from '@/utils/logger';

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
export function createRegeneratedModelMessage(workContext: Work | undefined, text: string): Message {
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
  const msg = messages[messageIndex];
  
  const logger = new Logger('Synthesis', settings?.debugMode);

  // Check if target is already a model message
  if (msg && msg.role === 'model') {
    return { message: msg, index: messageIndex, wasCreated: false };
  }
  
  logger.debug('Target msg is not model:', { msgRole: msg?.role, messageIndex });
  
  // Check if there's a model message at the next index
  const nextMsg = messages[messageIndex + 1];
  if (nextMsg && nextMsg.role === 'model') {
    logger.debug('Found existing model message at index', messageIndex + 1);
    return { message: nextMsg, index: messageIndex + 1, wasCreated: false };
  }
  
  // Create new model message
  logger.debug('Creating NEW model message');
  const newMsg = createRegeneratedModelMessage(workContext, text);
  return { message: newMsg, index: messages.length, wasCreated: true };
}
