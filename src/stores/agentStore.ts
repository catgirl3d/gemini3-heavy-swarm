import { create } from 'zustand';
import {
  type AgentState,
  type SwarmSession,
  type SwarmSessionStatus,
  type TokenUsage,
  type Work,
  type WorkResultUpdates,
} from '@/types';
import { type StepId } from '@/types/steps';
import {
  cloneWork,
  getStepResults,
  getStepThoughts,
  getStepUsage,
  markDownstreamStale as markWorkDownstreamStale,
  snapshotWorkWithAgents,
  updateAgentWork,
} from '@/utils/swarm/workHelpers';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('AgentStore');

type SessionMap = Record<string, SwarmSession>;

type SessionSeedOptions = {
  agentStates?: AgentState[];
  status?: SwarmSessionStatus;
  isLoading?: boolean;
  isPaused?: boolean;
  loadingStatus?: string;
  error?: string | null;
  activate?: boolean;
};

type SessionRuntimeUpdate = Partial<Pick<SwarmSession, 'status' | 'isLoading' | 'isPaused' | 'loadingStatus' | 'error'>>;
const hasOwnUpdate = <T extends object, K extends keyof T>(value: T, key: K): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

// Keep this field list in sync with src/types/app-types.ts:TokenUsage.
// Streaming no-op detection relies on value equality here rather than object identity.
const isTokenUsageEqual = (left: TokenUsage | null | undefined, right: TokenUsage | null | undefined): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return left.promptTokens === right.promptTokens
    && left.candidatesTokens === right.candidatesTokens
    && left.totalTokens === right.totalTokens
    && left.thoughtsTokenCount === right.thoughtsTokenCount
    && left.cachedContentTokenCount === right.cachedContentTokenCount
    && left.toolUsePromptTokenCount === right.toolUsePromptTokenCount
    && left.isEstimated === right.isEstimated;
};

const hasWorkResultChanges = (
  work: Work,
  stepId: StepId,
  agentIndex: number,
  updates: WorkResultUpdates,
): boolean => {
  if (hasOwnUpdate(updates, 'text')) {
    const currentText = getStepResults(work, stepId)[agentIndex];
    if (currentText !== updates.text) {
      return true;
    }
  }

  if (hasOwnUpdate(updates, 'thought')) {
    const currentThought = getStepThoughts(work, stepId)[agentIndex];
    if (currentThought !== updates.thought) {
      return true;
    }
  }

  if (hasOwnUpdate(updates, 'usage')) {
    const currentUsage = getStepUsage(work, stepId)[agentIndex];
    if (!isTokenUsageEqual(currentUsage, updates.usage)) {
      return true;
    }
  }

  return false;
};

const cloneAgentStates = (agentStates: AgentState[]): AgentState[] => {
  return agentStates.map(agent => ({ ...agent }));
};

const cloneSession = (session: SwarmSession): SwarmSession => {
  return {
    ...session,
    work: cloneWork(session.work),
    agentStates: cloneAgentStates(session.agentStates),
  };
};

const getDefaultSessionUiState = (status: SwarmSessionStatus): Pick<SwarmSession, 'isLoading' | 'isPaused'> => {
  return {
    isLoading: status === 'running' || status === 'paused' || status === 'error',
    isPaused: status === 'paused' || status === 'error',
  };
};

const createSession = (
  messageId: string,
  seedWork: Work,
  options?: SessionSeedOptions
): SwarmSession => {
  const status = options?.status ?? 'running';
  const defaultUiState = getDefaultSessionUiState(status);

  return {
    messageId,
    work: cloneWork(seedWork),
    agentStates: cloneAgentStates(options?.agentStates ?? seedWork.agentStates ?? []),
    status,
    isLoading: options?.isLoading ?? defaultUiState.isLoading,
    isPaused: options?.isPaused ?? defaultUiState.isPaused,
    loadingStatus: options?.loadingStatus ?? '',
    error: options?.error ?? null,
    updatedAt: Date.now(),
  };
};

const getActiveSessionUiPatch = (
  activeSessionMessageId: string | undefined,
  sessionsByMessageId: SessionMap,
  globalError: string | null,
): Pick<AgentStore, 'isLoading' | 'isPaused' | 'loadingStatus' | 'error'> => {
  if (!activeSessionMessageId) {
    return {
      isLoading: false,
      isPaused: false,
      loadingStatus: '',
      error: globalError,
    };
  }

  const activeSession = sessionsByMessageId[activeSessionMessageId];
  if (!activeSession) {
    return {
      isLoading: false,
      isPaused: false,
      loadingStatus: '',
      error: globalError,
    };
  }

  return {
    isLoading: activeSession.isLoading,
    isPaused: activeSession.isPaused,
    loadingStatus: activeSession.loadingStatus,
    error: activeSession.error,
  };
};

const emptyWork: Work = { results: {} };

interface AgentStore {
  isLoading: boolean;
  isPaused: boolean;
  loadingStatus: string;
  error: string | null;
  globalError: string | null;
  sessionsByMessageId: SessionMap;
  activeSessionMessageId: string | undefined;

  abortControllers: Map<string, AbortController>;
  registerAbortController: (key: string, controller: AbortController) => void;
  unregisterAbortController: (key: string) => void;
  abortAll: () => void;

  updateSessionAgent: (stepId: StepId, agentIndex: number, status: AgentState['status'], label: string, messageId: string, name?: string) => void;
  replaceSessionAgents: (messageId: string, agentStates: AgentState[]) => void;
  clear: () => void;

  updateSessionWorkResult: (messageId: string, stepId: StepId, agentIndex: number, updates: { text?: string; thought?: string; usage?: TokenUsage | null }) => void;

  setActiveSession: (id: string | undefined) => void;
  updateSessionRuntime: (messageId: string, updates: SessionRuntimeUpdate) => void;
  setGlobalError: (error: string | null) => void;

  startSession: (messageId: string, seedWork: Work, options?: SessionSeedOptions) => void;
  replaceSessionWork: (messageId: string, work: Work) => void;
  setSessionStatus: (messageId: string, status: SwarmSessionStatus) => void;
  snapshotSessionWork: (messageId: string) => Work | undefined;
  markDownstreamStale: (messageId: string, changedStepId: StepId) => void;
  clearSession: (messageId: string) => void;
}

export const selectActiveSessionMessageId = (state: AgentStore): string | undefined => {
  return state.activeSessionMessageId;
};

export const selectActiveSession = (state: AgentStore): SwarmSession | undefined => {
  const activeMessageId = state.activeSessionMessageId;
  return activeMessageId ? state.sessionsByMessageId[activeMessageId] : undefined;
};

export const createSessionWorkSelector = (messageId: string | undefined) => {
  return (state: AgentStore): Work | undefined => {
    return messageId ? state.sessionsByMessageId[messageId]?.work : undefined;
  };
};

export const createSessionAgentsSelector = (messageId: string | undefined) => {
  return (state: AgentStore): AgentState[] | undefined => {
    return messageId ? state.sessionsByMessageId[messageId]?.agentStates : undefined;
  };
};

const buildUpdatedSessionAgentState = (
  state: AgentStore,
  messageId: string,
  stepId: StepId,
  agentIndex: number,
  status: AgentState['status'],
  label: string,
  name?: string,
): { nextSessions: SessionMap } => {
  const currentSession = state.sessionsByMessageId[messageId] ?? createSession(messageId, emptyWork, {
    status: messageId === state.activeSessionMessageId ? 'running' : 'done',
  });
  const existingIndex = currentSession.agentStates.findIndex(
    agent => agent.stepId === stepId && agent.agentIndex === agentIndex && agent.messageId === messageId
  );

  const nextAgent: AgentState = {
    id: `${messageId}-${stepId}-agent-${agentIndex}`,
    stepId,
    agentIndex,
    status,
    label,
    messageId,
    name: name || (existingIndex >= 0 ? currentSession.agentStates[existingIndex].name : `Agent ${agentIndex + 1}`),
  };

  const nextSessionAgents = cloneAgentStates(currentSession.agentStates);
  if (existingIndex >= 0) {
    nextSessionAgents[existingIndex] = { ...nextSessionAgents[existingIndex], ...nextAgent };
  } else {
    nextSessionAgents.push(nextAgent);
  }

  return {
    nextSessions: {
      ...state.sessionsByMessageId,
      [messageId]: {
        ...cloneSession(currentSession),
        agentStates: nextSessionAgents,
        updatedAt: Date.now(),
      },
    },
  };
};

const buildUpdatedSessionWorkState = (
  state: AgentStore,
  messageId: string,
  stepId: StepId,
  agentIndex: number,
  updates: WorkResultUpdates,
): { nextSessions: SessionMap } | null => {
  const targetSession = state.sessionsByMessageId[messageId];
  if (!targetSession) {
    return null;
  }

  if (!hasWorkResultChanges(targetSession.work, stepId, agentIndex, updates)) {
    return null;
  }

  const nextWork = updateAgentWork(targetSession.work, stepId, agentIndex, updates);
  return {
    nextSessions: {
      ...state.sessionsByMessageId,
      [messageId]: {
        ...targetSession,
        work: nextWork,
        updatedAt: Date.now(),
      },
    },
  };
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  isLoading: false,
  isPaused: false,
  loadingStatus: '',
  error: null,
  globalError: null,
  sessionsByMessageId: {},
  activeSessionMessageId: undefined,
  abortControllers: new Map(),

  registerAbortController: (key, controller) => {
    set(state => {
      const newMap = new Map(state.abortControllers);
      const existing = newMap.get(key);
      if (existing) {
        existing.abort();
      }

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

  updateSessionAgent: (stepId, agentIndex, status, label, messageId, name) => {
    set(state => {
      const { nextSessions } = buildUpdatedSessionAgentState(
        state,
        messageId,
        stepId,
        agentIndex,
        status,
        label,
        name,
      );

      return {
        sessionsByMessageId: nextSessions,
      };
    });
  },

  replaceSessionAgents: (messageId, agentStates) => {
    set(state => {
      const existingSession = state.sessionsByMessageId[messageId] ?? createSession(messageId, emptyWork, {
        status: messageId === state.activeSessionMessageId ? 'running' : 'done',
      });
      const scopedAgents = cloneAgentStates(agentStates.filter(agent => agent.messageId === messageId));
      const nextSessions = {
        ...state.sessionsByMessageId,
        [messageId]: {
          ...cloneSession(existingSession),
          agentStates: scopedAgents,
          updatedAt: Date.now(),
        },
      };

      return {
        sessionsByMessageId: nextSessions,
      };
    });
  },

  clear: () => set({
    isLoading: false,
    isPaused: false,
    loadingStatus: '',
    error: null,
    globalError: null,
    sessionsByMessageId: {},
    activeSessionMessageId: undefined,
  }),

  updateSessionWorkResult: (messageId, stepId, agentIndex, updates) => {
    set(state => {
      const updatedSessionState = buildUpdatedSessionWorkState(state, messageId, stepId, agentIndex, updates);
      if (!updatedSessionState) {
        return state;
      }

      return {
        sessionsByMessageId: updatedSessionState.nextSessions,
      };
    });
  },

  setActiveSession: (id) => {
    set(state => {
      return {
        activeSessionMessageId: id,
        ...getActiveSessionUiPatch(id, state.sessionsByMessageId, state.globalError),
      };
    });
  },

  updateSessionRuntime: (messageId, updates) => {
    const currentSession = get().sessionsByMessageId[messageId];
    const agentSummary = (currentSession?.agentStates ?? []).map(agent => ({
      id: agent.id,
      status: agent.status,
      label: agent.label,
      stepId: agent.stepId,
    }));

    logger.debug('updateSessionRuntime', { messageId, updates, agentStates: agentSummary });

    set(state => {
      const existingSession = state.sessionsByMessageId[messageId] ?? createSession(messageId, emptyWork, {
        status: messageId === state.activeSessionMessageId ? 'running' : 'done',
      });

      const nextSession: SwarmSession = {
        ...cloneSession(existingSession),
        ...(Object.prototype.hasOwnProperty.call(updates, 'status') ? { status: updates.status ?? existingSession.status } : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'isLoading') ? { isLoading: updates.isLoading ?? existingSession.isLoading } : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'isPaused') ? { isPaused: updates.isPaused ?? existingSession.isPaused } : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'loadingStatus') ? { loadingStatus: updates.loadingStatus ?? '' } : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'error') ? { error: updates.error ?? null } : {}),
        updatedAt: Date.now(),
      };

      const nextSessions = {
        ...state.sessionsByMessageId,
        [messageId]: nextSession,
      };

      return messageId === state.activeSessionMessageId
        ? {
            sessionsByMessageId: nextSessions,
            ...getActiveSessionUiPatch(messageId, nextSessions, state.globalError),
          }
        : {
            sessionsByMessageId: nextSessions,
          };
    });
  },

  setGlobalError: (error) => {
    set(state => {
      if (state.activeSessionMessageId) {
        return { globalError: error };
      }

      return {
        globalError: error,
        error,
      };
    });
  },

  startSession: (messageId, seedWork, options) => {
    set(state => {
      const nextSession = createSession(messageId, seedWork, options);
      const nextSessions = {
        ...state.sessionsByMessageId,
        [messageId]: nextSession,
      };

      if (options?.activate === false) {
        return {
          sessionsByMessageId: nextSessions,
        };
      }

      return {
        sessionsByMessageId: nextSessions,
        activeSessionMessageId: messageId,
        globalError: null,
        ...getActiveSessionUiPatch(messageId, nextSessions, null),
      };
    });
  },

  replaceSessionWork: (messageId, work) => {
    set(state => {
      const existingSession = state.sessionsByMessageId[messageId] ?? createSession(messageId, work, {
        status: messageId === state.activeSessionMessageId ? 'running' : 'done',
      });
      const nextSession: SwarmSession = {
        ...existingSession,
        work: cloneWork(work),
        agentStates: cloneAgentStates(existingSession.agentStates),
        updatedAt: Date.now(),
      };
      const nextSessions = {
        ...state.sessionsByMessageId,
        [messageId]: nextSession,
      };

      return {
        sessionsByMessageId: nextSessions,
      };
    });
  },

  setSessionStatus: (messageId, status) => {
    set(state => {
      const existingSession = state.sessionsByMessageId[messageId] ?? createSession(messageId, emptyWork, { status });
      const nextSession: SwarmSession = {
        ...cloneSession(existingSession),
        ...getDefaultSessionUiState(status),
        status,
        updatedAt: Date.now(),
      };
      const nextSessions = {
        ...state.sessionsByMessageId,
        [messageId]: nextSession,
      };

      return messageId === state.activeSessionMessageId
        ? {
            sessionsByMessageId: nextSessions,
            ...getActiveSessionUiPatch(messageId, nextSessions, state.globalError),
          }
        : {
            sessionsByMessageId: nextSessions,
        };
    });
  },

  snapshotSessionWork: (messageId) => {
    const session = get().sessionsByMessageId[messageId];
    return session ? snapshotWorkWithAgents(session.work, session.agentStates) : undefined;
  },

  markDownstreamStale: (messageId, changedStepId) => {
    set(state => {
      const existingSession = state.sessionsByMessageId[messageId];
      if (!existingSession) {
        return state;
      }

      const nextWork = markWorkDownstreamStale(existingSession.work, changedStepId);
      const nextSession: SwarmSession = {
        ...cloneSession(existingSession),
        work: nextWork,
        updatedAt: Date.now(),
      };
      const nextSessions = {
        ...state.sessionsByMessageId,
        [messageId]: nextSession,
      };

      return {
        sessionsByMessageId: nextSessions,
      };
    });
  },

  clearSession: (messageId) => {
    set(state => {
      if (!(messageId in state.sessionsByMessageId)) {
        return state;
      }

      const nextSessions = { ...state.sessionsByMessageId };
      delete nextSessions[messageId];

      const clearedState = messageId === state.activeSessionMessageId
        ? {
            activeSessionMessageId: undefined,
            ...getActiveSessionUiPatch(undefined, nextSessions, state.globalError),
          }
        : {};

      return {
        sessionsByMessageId: nextSessions,
        ...clearedState,
      };
    });
  },
}));
