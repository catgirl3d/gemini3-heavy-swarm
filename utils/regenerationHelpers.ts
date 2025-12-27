import { StepId } from '@/types/steps';
import { AppSettings, Message, Work } from '@/types';
import { ensureModelMessageForSynthesis, updateMessageParts, updateWorkAgentNames } from '@/utils/messageHelpers';
import { getUpdatedAgentName } from '@/utils/agentHelpers';
import { updateStepResult } from '@/utils/workHelpers';

/**
 * Returns consistent UI labels for regeneration steps.
 */
export function getStepLabels(stepId: StepId): { regenerating: string; done: string } {
  switch (stepId) {
    case 'initial_step':
      return { regenerating: 'Regenerating Draft...', done: 'Draft Regenerated' };
    case 'refinement_step':
      return { regenerating: 'Regenerating Critique...', done: 'Critique Regenerated' };
    case 'synthesis_step':
      return { regenerating: 'Regenerating Synthesis...', done: 'Synthesis Regenerated' };
    default:
      return { regenerating: 'Regenerating...', done: 'Regenerated' };
  }
}

/**
 * Handles the logic for updating messages during synthesis regeneration chunk processing.
 */
export function processSynthesisChunkUpdate(
  messages: Message[],
  messageIndex: number,
  workContext: Work | undefined,
  text: string,
  onSynthesisStart?: () => void
): { updatedMessages: Message[]; targetIndex: number } {
  const newMessages = [...messages];
  
  // Custom logic for synthesis
  const { message: foundMsg, index: foundIndex, wasCreated } = ensureModelMessageForSynthesis(
    newMessages, messageIndex, workContext, text
  );
  
  if (onSynthesisStart && wasCreated) {
    onSynthesisStart();
  }

  let msg = foundMsg;
  let targetIndex = foundIndex;
  
  if (wasCreated) {
    newMessages.push(msg);
  }
  
  if (msg && msg.role === 'model') {
    newMessages[targetIndex] = updateMessageParts(msg, text);
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
  onSynthesisStart?: () => void
): { updatedMessages: Message[]; updatedWork: Work | undefined } {
  let targetIdx = messageIndex;
  let updatedMsgs = [...messages];

  // 1. Handle Message Updates
  if (stepId === 'synthesis_step') {
    const { updatedMessages, targetIndex } = processSynthesisChunkUpdate(
      messages, messageIndex, workContext, text, onSynthesisStart
    );
    updatedMsgs = updatedMessages;
    targetIdx = targetIndex;
  }

  const msg = updatedMsgs[targetIdx];
  if (msg && msg.work) {
    const updatedWork = updateWorkForStep(msg.work, stepId, agentIndex, text, settings);
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
