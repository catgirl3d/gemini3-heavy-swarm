import { AppSettings, AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { getAgentRole } from '@/utils/chat/roleUtils';

/**
 * Returns a descriptive name for an agent based on the current step and settings.
 * 
 * @param index - The agent index
 * @param stepId - The current step identifier
 * @param settings - The application settings
 * @returns A formatted agent name (e.g., "Agent 1 (Researcher)")
 */
export function getUpdatedAgentName(index: number, stepId: StepId, settings: AppSettings): string {
  const config = getStepConfig(stepId);
  
  // Synthesis step has no indexed agents
  if (stepId === STEPS.SYNTHESIS) {
    return config.namePrefix;
  }
  
  if (settings.dynamicAgentRoles) {
    const role = getAgentRole(index, settings, config.roleKey);
    return `${config.namePrefix} ${index + 1} (${role.name})`;
  }
  
  return `${config.namePrefix} ${index + 1}`;
}

/**
 * Recovers agent states for a message from the legacy message or reconstruction.
 * First tries to load saved agentStates, then tries to reconstruct from work.results.
 */
export function getMissingAgentsForMessage(
  messageId: string,
  workContext: Work,
  stepId: StepId
): AgentState[] {
  // Only use saved states. Legacy reconstruction from text results is removed.
  if (workContext.agentStates?.length) {
    // Filter by messageId to ensure we don't leak states from other messages
    return workContext.agentStates.filter(a => a.messageId === messageId);
  }
  
  return [];
}
