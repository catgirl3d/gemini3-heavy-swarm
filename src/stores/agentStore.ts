import { create } from 'zustand';
import { AgentState, Work } from '@/types';
import { StepId } from '@/types/steps';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('AgentStore', true);

interface AgentStore {
  // Agent state
  agents: AgentState[];
  currentWork: Work | undefined;
  
  // Swarm status state
  isLoading: boolean;
  isPaused: boolean;
  loadingStatus: string;
  error: string | null;
  currentMessageId: string | undefined;
  
  // Agent actions
  updateAgent: (stepId: StepId, agentIndex: number, status: AgentState['status'], label: string, messageId: string, name?: string) => void;
  hydrate: (agents: AgentState[]) => void;
  clear: () => void;
  
  // Work actions
  setCurrentWork: (work: Work | undefined) => void;
  
  // Status actions
  setIsLoading: (value: boolean) => void;
  setIsPaused: (value: boolean) => void;
  setLoadingStatus: (status: string) => void;
  setError: (error: string | null) => void;
  setCurrentMessageId: (id: string | undefined) => void;
  
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial state
  agents: [],
  currentWork: undefined,
  isLoading: false,
  isPaused: false,
  loadingStatus: '',
  error: null,
  currentMessageId: undefined,
  
  // Agent actions
  updateAgent: (stepId, agentIndex, status, label, messageId, name) => {
    set(state => {
      // Check if agent exists to preserve order
      const existingIndex = state.agents.findIndex(
        a => a.stepId === stepId && a.agentIndex === agentIndex && a.messageId === messageId
      );

      const newItem = {
        id: `${messageId}-${stepId}-agent-${agentIndex}`,
        stepId,
        agentIndex,
        status,
        label,
        messageId,
        name: name || (existingIndex >= 0 ? state.agents[existingIndex].name : `Agent ${agentIndex + 1}`)
      };



      if (existingIndex >= 0) {
        // Update in place (stable sort)
        const newAgents = [...state.agents];
        newAgents[existingIndex] = { ...newAgents[existingIndex], ...newItem };
        return { agents: newAgents };
      }

      // Append if new
      return { agents: [...state.agents, newItem] };
    });
  },
  
  hydrate: (agents) => set({ agents }),
  
  clear: () => set({ 
    agents: [], 
    currentWork: undefined,
    isLoading: false,
    isPaused: false,
    loadingStatus: '',
    error: null,
    currentMessageId: undefined
  }),
  
  // Work actions
  setCurrentWork: (work) => set({ currentWork: work }),
  
  // Status actions
  setIsLoading: (value) => {
    const currentAgents = get().agents;
    const agentSummary = currentAgents.map(a => ({
      id: a.id,
      status: a.status,
      label: a.label,
      stepId: a.stepId
    }));
    
    logger.debug(`setIsLoading: ${value}`, { 
      agentStates: agentSummary,
      // stack: new Error().stack 
    });
    
    set({ isLoading: value });
  },
  
  setIsPaused: (value) => set({ isPaused: value }),
  setLoadingStatus: (status) => set({ loadingStatus: status }),
  setError: (error) => set({ error }),
  setCurrentMessageId: (id) => set({ currentMessageId: id }),
  
  // Selectors
}));
