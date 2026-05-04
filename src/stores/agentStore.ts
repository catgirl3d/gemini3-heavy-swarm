import { create } from 'zustand';
import { type AgentState, type Work } from '@/types';
import { type StepId } from '@/types/steps';
import { updateAgentWork } from '@/utils/swarm/workHelpers';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('AgentStore');

interface AgentStore {
  // Agent state
  agents: AgentState[];
  currentWork: Work | undefined;
  
  /**
   * Swarm state machine flags:
   * 
   * 1. { isLoading: false, isPaused: false } -> Idle / Process Finished
   * 2. { isLoading: true,  isPaused: false } -> Active processing
   * 3. { isLoading: true,  isPaused: true  } -> Interrupted / Error (waiting for Retry)
   * 4. { isLoading: false, isPaused: true  } -> Transition state (usually treated as Idle)
   */
  isLoading: boolean;
  isPaused: boolean;
  loadingStatus: string;
  error: string | null;
  currentMessageId: string | undefined;
  
  // Abort controller registry for centralized stop functionality
  abortControllers: Map<string, AbortController>;
  registerAbortController: (key: string, controller: AbortController) => void;
  unregisterAbortController: (key: string) => void;
  abortAll: () => void;
  
  // Agent actions
  updateAgent: (stepId: StepId, agentIndex: number, status: AgentState['status'], label: string, messageId: string, name?: string) => void;
  hydrate: (agents: AgentState[]) => void;
  clear: () => void;
  
  // Work actions
  setCurrentWork: (work: Work | undefined) => void;
  updateWorkResult: (stepId: StepId, agentIndex: number, updates: { text?: string; thought?: string; usage?: any }) => void;
  
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
  abortControllers: new Map(),
  
  // Abort controller management
  registerAbortController: (key, controller) => {
    set(state => {
      const newMap = new Map(state.abortControllers);
      // If there's already a controller with this key, abort it first
      const existing = newMap.get(key);
      if (existing) existing.abort();
      newMap.set(key, controller);
      return { abortControllers: newMap };
    });
  },
  
  unregisterAbortController: (key) => {
    set(state => {
      const newMap = new Map(state.abortControllers);
      newMap.delete(key);
      return { abortControllers: newMap };
    });
  },
  
  abortAll: () => {
    const state = get();
    logger.debug('abortAll called', { count: state.abortControllers.size });
    state.abortControllers.forEach((controller, key) => {
      logger.debug(`Aborting controller: ${key}`);
      controller.abort();
    });
    set({ abortControllers: new Map() });
  },
  
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
  
  updateWorkResult: (stepId, agentIndex, updates) => {
    set(state => {
      if (!state.currentWork) return state;
      
      const newWork = updateAgentWork(state.currentWork, stepId, agentIndex, updates);
      return { currentWork: newWork };
    });
  },
  
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
