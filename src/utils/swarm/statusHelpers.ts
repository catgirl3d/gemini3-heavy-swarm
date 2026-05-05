import { type StepId } from '@/types/steps';
import { type AgentState } from '@/types';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { useAgentStore } from '@/stores/agentStore';

/**
 * Centralized agent status update function.
 * Single source of truth for all status changes across the application.
 * 
 * This replaces scattered updateAgent calls in:
 * - useSwarmRegeneration (syncStatus)
 * - BaseStep.handleStreamChunk
 * - SynthesisStep.execute
 * 
 * @param stepId - The step identifier
 * @param agentIndex - The agent index within the step
 * @param status - The new status (working, done, error, waiting, etc.)
 * @param messageId - The message ID this agent belongs to
 * @param customLabel - Optional custom label, otherwise uses stepConfig.labels[status]
 * @param agentName - Optional agent name for initialization
 */
export function updateAgentStatus(
  stepId: StepId,
  agentIndex: number,
  status: AgentState['status'],
  messageId: string,
  customLabel?: string,
  agentName?: string
): void {
  const config = getStepConfig(stepId);
  const label = customLabel ?? config.labels[status];
  
  useAgentStore.getState().updateSessionAgent(
    stepId,
    agentIndex,
    status,
    label,
    messageId,
    agentName,
  );
}

/**
 * Conditional update - only updates if status or label has changed.
 * Prevents redundant store updates and unnecessary re-renders.
 * 
 * Use this in hot paths like streaming chunks where status might not change
 * on every chunk (e.g., status remains 'working' but label might update).
 * 
 * @param stepId - The step identifier
 * @param agentIndex - The agent index within the step
 * @param status - The new status
 * @param messageId - The message ID this agent belongs to
 * @param customLabel - Optional custom label
 */
export function updateAgentStatusIfChanged(
  stepId: StepId,
  agentIndex: number,
  status: AgentState['status'],
  messageId: string,
  customLabel?: string
): void {
  const store = useAgentStore.getState();
  const existing = store.sessionsByMessageId[messageId]?.agentStates.find(
    a => a.stepId === stepId && a.agentIndex === agentIndex && a.messageId === messageId
  );
  
  const config = getStepConfig(stepId);
  const label = customLabel ?? config.labels[status];
  
  // Only update if status or label changed
  if (!existing || existing.status !== status || existing.label !== label) {
    updateAgentStatus(stepId, agentIndex, status, messageId, customLabel);
  }
}
