import { AgentState } from '@/types';
import { StepId } from '@/types/steps';

/**
 * Determines if there are errored agents for a given message
 */
export function getErroredAgents(
  agentStates: AgentState[],
  messageId?: string
): AgentState[] {
  return agentStates.filter(
    a => a.status === 'error' && (!messageId || a.messageId === messageId)
  );
}

/**
 * Determines if any agents are currently working for a given message
 */
export function isAnyAgentWorking(
  agentStates: AgentState[],
  messageId?: string
): boolean {
  return agentStates.some(
    a => a.status === 'working' && (!messageId || a.messageId === messageId)
  );
}

/**
 * Determines if the current state represents an error condition.
 * Error state = has errored agents AND no agents are currently working.
 */
export function isErrorState(
  agentStates: AgentState[],
  messageId?: string
): boolean {
  const isWorking = isAnyAgentWorking(agentStates, messageId);
  const erroredAgents = getErroredAgents(agentStates, messageId);
  return !isWorking && erroredAgents.length > 0;
}

/**
 * Returns appropriate button text based on error state
 */
export function getContinueButtonText(isError: boolean): string {
  return isError ? 'Retry' : 'Continue';
}

/**
 * Handles continue/retry button click with proper error handling logic
 */
export function handleContinueClick(
  agentStates: AgentState[],
  messageId: string | undefined,
  onContinue?: () => void,
  onRegenerate?: (stepId: StepId, agentIndex: number) => void
): void {
  const erroredAgents = getErroredAgents(agentStates, messageId);
  
  // If we have specific agents in error, retry them individually using the proven regeneration logic
  // This is more reliable than full workflow resume ('onContinue') for step-specific failures
  if (erroredAgents.length > 0 && onRegenerate) {
    erroredAgents.forEach(agent => {
      onRegenerate(agent.stepId, agent.agentIndex);
    });
  } else if (onContinue) {
    // For generic pauses or states without specific agent errors, use Resume logic
    onContinue();
  }
}
