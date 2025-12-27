import { AppSettings } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { getStepConfig } from '@/utils/stepConstants';
import { getAgentRole } from '@/utils/roleUtils';

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
