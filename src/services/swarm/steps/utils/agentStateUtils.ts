import { type AppSettings, type AgentState, type StepId } from '@/types';
import { getUpdatedAgentName } from '@/utils/swarm/agentHelpers';

interface AgentStateConfig {
  stepId: StepId;  // Technical step identifier
  status: AgentState['status'];
  statusLabel: string;  // UI display text
  messageId?: string;   // Optional message ID for scoping
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
      id: config.messageId
        ? `${config.messageId}-${config.stepId}-agent-${i}`
        : `${config.stepId}-agent-${i}`,
      name: getUpdatedAgentName(i, config.stepId, settings),
      status: config.status,
      label: config.statusLabel,
      stepId: config.stepId,
      agentIndex: i,
      messageId: config.messageId
    };
  });
};

/**
 * Updates a specific agent's state in the array.
 */
const matchesAgentState = (
  state: AgentState,
  stateIndex: number,
  targetIndex: number,
  updates: Partial<AgentState>
): boolean => {
  if (updates.stepId !== undefined && updates.messageId !== undefined) {
    return state.stepId === updates.stepId
      && state.agentIndex === targetIndex
      && state.messageId === updates.messageId;
  }

  if (updates.stepId !== undefined) {
    return state.stepId === updates.stepId && state.agentIndex === targetIndex;
  }

  return stateIndex === targetIndex;
};

export const updateAgentState = (
  states: AgentState[],
  index: number,
  updates: Partial<AgentState>
): AgentState[] => {
  return states.map((state, stateIndex) => (
    matchesAgentState(state, stateIndex, index, updates)
      ? { ...state, ...updates }
      : state
  ));
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
