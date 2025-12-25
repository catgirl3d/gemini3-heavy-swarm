import { AppSettings, AgentState, StepId } from '../../../types';
import { getAgentRole } from './roleUtils';

interface AgentStateConfig {
  stepId: StepId;  // Technical step identifier
  status: AgentState['status'];
  statusLabel: string;  // UI display text
}

/**
 * Creates agent states array for a given step.
 */
export const createAgentStates = (
  numAgents: number,
  settings: AppSettings,
  config: AgentStateConfig
): AgentState[] => {
  const roleType = config.stepId === 'refinement_step' ? 'criticRoles' : 'roles';
  const namePrefix = config.stepId === 'refinement_step' ? 'Critic' : 'Agent';

  return Array.from({ length: numAgents }, (_, i) => {
    const role = settings.dynamicAgentRoles ? getAgentRole(i, settings, roleType).name : null;
    return {
      id: `agent-${i}`,
      name: role ? `${namePrefix} ${i + 1} (${role})` : `${namePrefix} ${i + 1}`,
      status: config.status,
      label: config.statusLabel,
      stepId: config.stepId
    };
  });
};

/**
 * Updates a specific agent's state in the array.
 */
export const updateAgentState = (
  states: AgentState[],
  index: number,
  updates: Partial<AgentState>
): AgentState[] => {
  return states.map((a, idx) => idx === index ? { ...a, ...updates } : a);
};

/**
 * Updates agent state by id (for synthesizer).
 */
export const updateAgentStateById = (
  states: AgentState[],
  id: string,
  updates: Partial<AgentState>
): AgentState[] => {
  return states.map(a => a.id === id ? { ...a, ...updates } : a);
};
