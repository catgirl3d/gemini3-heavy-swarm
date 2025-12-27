import { useState } from 'react';
import { AgentState, Work } from '../types';

export function useSwarmWork() {
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [currentWork, setCurrentWork] = useState<Work | undefined>(undefined);

  return {
    agentStates,
    setAgentStates,
    currentWork,
    setCurrentWork
  };
}
