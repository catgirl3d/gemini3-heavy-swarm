import { AppSettings, AgentState, StepId } from '@/types';
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
export const updateAgentState = (
  states: AgentState[],
  index: number,
  updates: Partial<AgentState>
): AgentState[] => {
  // If stepId or messageId is provided in updates, use them for more precise matching
  const stepId = updates.stepId;
  const messageId = updates.messageId;
  
  return states.map((a, idx) => {
    let isMatch = false;
    
    if (stepId !== undefined && messageId !== undefined) {
      isMatch = a.stepId === stepId && a.agentIndex === index && a.messageId === messageId;
    } else if (stepId !== undefined) {
      isMatch = a.stepId === stepId && a.agentIndex === index;
    } else {
      isMatch = idx === index;
    }
    
    return isMatch ? { ...a, ...updates } : a;
  });
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
