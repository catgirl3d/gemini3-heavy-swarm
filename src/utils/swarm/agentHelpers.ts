import { type AppSettings, type AgentState, type Work } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
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
export const getUpdatedAgentName = (index: number, stepId: StepId, settings: AppSettings): string => {
  const config = getStepConfig(stepId);
  
  // Synthesis step has no indexed agents
  if (stepId === STEPS.SYNTHESIS) {
    return config.namePrefix;
  }
  
  // Always apply dynamic agent roles
  const role = getAgentRole(index, settings, config.roleKey);
  return `${config.namePrefix} ${index + 1} (${role.name})`;
};

/**
 * Returns saved agent states for a message when they are present on the work item.
 * Legacy reconstruction from work.results is intentionally disabled.
 */
export const getMissingAgentsForMessage = (
  messageId: string,
  workContext: Work
): AgentState[] => {
  // Only use saved states. Legacy reconstruction from text results is removed.
  if (workContext.agentStates?.length) {
    // Filter by messageId to ensure we don't leak states from other messages
    return workContext.agentStates.filter(a => a.messageId === messageId);
  }
  
  return [];
}
