import { AppSettings } from '../types';
import { StepId } from '../types/steps';

/**
 * Returns a descriptive name for an agent based on the current step and settings.
 * 
 * @param index - The agent index
 * @param stepId - The current step identifier
 * @param settings - The application settings
 * @returns A formatted agent name (e.g., "Agent 1 (Researcher)")
 */
export function getUpdatedAgentName(index: number, stepId: StepId, settings: AppSettings): string {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];

  if (stepId === 'initial_step') {
    const perspectives = activeRoleProfile?.roles || [];
    if (perspectives.length === 0) return `Agent ${index + 1}`;
    const role = perspectives[index % perspectives.length];
    return settings.dynamicAgentRoles ? `Agent ${index + 1} (${role.name})` : `Agent ${index + 1}`;
  } else if (stepId === 'refinement_step') {
    const perspectives = activeRoleProfile?.criticRoles || [];
    if (perspectives.length === 0) return `Critic ${index + 1}`;
    const role = perspectives[index % perspectives.length];
    return settings.dynamicAgentRoles ? `Critic ${index + 1} (${role.name})` : `Critic ${index + 1}`;
  }
  
  return `Agent ${index + 1}`;
}
