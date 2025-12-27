import { AppSettings, AgentState, StepId } from '@/types';
import { getUpdatedAgentName } from '@/utils/agentHelpers';

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
  return Array.from({ length: numAgents }, (_, i) => {
    return {
      id: `agent-${i}`,
      name: getUpdatedAgentName(i, config.stepId, settings),
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
