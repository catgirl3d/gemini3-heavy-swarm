import { type AgentState, type Message, type SwarmSessionStatus, type Work } from '@/types';
import { useAgentStore } from '@/stores/agentStore';
import { cloneWork } from '@/utils/swarm/workHelpers';

export type OperationalSessionResolutionSource = 'existing-session' | 'hydrated-snapshot';

export interface OperationalSessionResolution {
  work: Work;
  agentStates: AgentState[];
  sessionMessageId: string;
  source: OperationalSessionResolutionSource;
}

type SessionRuntimeOptions = {
  status?: SwarmSessionStatus;
  isLoading?: boolean;
  isPaused?: boolean;
  loadingStatus?: string;
  error?: string | null;
  activate?: boolean;
  targetMessageId?: string;
};

type SnapshotCommitOptions = {
  fallbackWork?: Work;
};

const scopeAgentStatesToMessage = (agentStates: AgentState[] | undefined, messageId: string): AgentState[] => {
  return (agentStates ?? []).map(agent => ({
    ...agent,
    messageId,
  }));
};

const createOperationalResolution = (
  work: Work,
  sessionMessageId: string,
  source: OperationalSessionResolutionSource,
): OperationalSessionResolution => {
  return {
    work,
    agentStates: work.agentStates ?? [],
    sessionMessageId,
    source,
  };
};

export const getSessionSnapshot = (messageId: string): Work | undefined => {
  return useAgentStore.getState().snapshotSessionWork(messageId);
};

const getOperationalSessionSnapshot = (
  messageId: string,
  source: OperationalSessionResolutionSource,
): OperationalSessionResolution | undefined => {
  const work = getSessionSnapshot(messageId);
  return work ? createOperationalResolution(work, messageId, source) : undefined;
};

export const hydrateSessionFromMessageSnapshot = (
  message: Message,
  runtimeOptions?: SessionRuntimeOptions,
): OperationalSessionResolution | undefined => {
  if (message.role !== 'model' || !message.work) {
    return undefined;
  }

  const targetMessageId = runtimeOptions?.targetMessageId ?? message.id;
  const seedWork = cloneWork(message.work);
  const agentStates = scopeAgentStatesToMessage(seedWork.agentStates, targetMessageId);
  seedWork.agentStates = agentStates;

  useAgentStore.getState().startSession(targetMessageId, seedWork, {
    agentStates,
    status: runtimeOptions?.status,
    isLoading: runtimeOptions?.isLoading,
    isPaused: runtimeOptions?.isPaused,
    loadingStatus: runtimeOptions?.loadingStatus,
    error: runtimeOptions?.error,
    activate: runtimeOptions?.activate ?? false,
  });

  return getOperationalSessionSnapshot(targetMessageId, 'hydrated-snapshot');
};

export const resolveOperationalSessionWork = (
  message: Message,
  runtimeOptions?: SessionRuntimeOptions,
): OperationalSessionResolution | undefined => {
  if (message.role !== 'model') {
    return undefined;
  }

  const targetMessageId = runtimeOptions?.targetMessageId ?? message.id;
  const sessionSnapshot = getOperationalSessionSnapshot(targetMessageId, 'existing-session');
  if (sessionSnapshot) {
    return sessionSnapshot;
  }

  return hydrateSessionFromMessageSnapshot(message, {
    ...runtimeOptions,
    targetMessageId,
  });
};

export const commitSessionSnapshotToMessage = (
  messages: Message[],
  messageId: string,
  options?: SnapshotCommitOptions,
): Message[] => {
  const committedWork = getSessionSnapshot(messageId) ?? options?.fallbackWork;
  if (!committedWork) {
    return messages;
  }

  const messageIndex = messages.findIndex(message => message.id === messageId && message.role === 'model');
  if (messageIndex === -1) {
    return messages;
  }

  const nextMessages = [...messages];
  nextMessages[messageIndex] = {
    ...nextMessages[messageIndex],
    work: cloneWork(committedWork),
  };

  return nextMessages;
};
