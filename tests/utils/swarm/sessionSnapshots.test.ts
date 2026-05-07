import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from '@/stores/agentStore';
import { type AgentState, type Message, type Work } from '@/types';
import { STEPS } from '@/types/steps';
import { commitSessionSnapshotToMessage, resolveOperationalSession } from '@/utils/swarm/sessionSnapshots';

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'done',
  label: 'Done',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'model-1',
  ...overrides,
});

const createWork = (overrides: Partial<Work> = {}): Work => ({
  results: {
    [STEPS.INITIAL]: ['draft 1'],
    [STEPS.SYNTHESIS]: ['answer'],
  },
  stepMetadata: [
    { id: STEPS.INITIAL, status: 'done' },
    { id: STEPS.SYNTHESIS, status: 'pending' },
  ],
  ...overrides,
});

describe('sessionSnapshots', () => {
  beforeEach(() => {
    resetAgentStore();
  });

  it('returns an existing-session bundle when live session state already exists', () => {
    const liveAgents = [createAgent({ messageId: 'model-1', status: 'working', label: 'Working' })];
    const liveWork = createWork({ agentStates: liveAgents });
    const message: Message = {
      id: 'model-1',
      role: 'model',
      parts: [{ text: '' }],
      work: createWork(),
    };

    useAgentStore.getState().startSession('model-1', liveWork, {
      agentStates: liveAgents,
      status: 'running',
      isLoading: true,
      isPaused: false,
    });

    const resolved = resolveOperationalSession(message);

    expect(resolved).toMatchObject({
      source: 'existing-session',
      sessionMessageId: 'model-1',
      work: expect.objectContaining({ results: liveWork.results }),
      agentStates: [expect.objectContaining({ messageId: 'model-1', status: 'working' })],
    });
  });

  it('hydrates a snapshot directly into the target retry session id', () => {
    const snapshotAgents = [createAgent({ id: 'old-agent', messageId: 'old-model' })];
    const message: Message = {
      id: 'old-model',
      role: 'model',
      parts: [{ text: '' }],
      work: createWork({ agentStates: snapshotAgents }),
    };

    const resolved = resolveOperationalSession(message, {
      targetMessageId: 'retry-model',
    });

    expect(resolved).toMatchObject({
      source: 'hydrated-snapshot',
      sessionMessageId: 'retry-model',
      work: expect.objectContaining({ results: message.work?.results }),
      agentStates: [expect.objectContaining({ id: 'old-agent', messageId: 'retry-model' })],
    });
    expect(useAgentStore.getState().sessionsByMessageId['old-model']).toBeUndefined();
    expect(useAgentStore.getState().sessionsByMessageId['retry-model']).toBeDefined();
    expect(useAgentStore.getState().activeSessionMessageId).toBeUndefined();
  });

  it('hydrates without disturbing the current active session or global error by default', () => {
    const activeWork = createWork({ results: { [STEPS.SYNTHESIS]: ['active answer'] } });
    const snapshotMessage: Message = {
      id: 'old-model',
      role: 'model',
      parts: [{ text: '' }],
      work: createWork({ agentStates: [createAgent({ id: 'old-agent', messageId: 'old-model' })] }),
    };

    useAgentStore.getState().startSession('active-model', activeWork, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Paused. Waiting for user confirmation...',
    });
    useAgentStore.getState().setGlobalError('existing global error');

    const resolved = resolveOperationalSession(snapshotMessage, {
      targetMessageId: 'retry-model',
    });

    expect(resolved).toMatchObject({
      source: 'hydrated-snapshot',
      sessionMessageId: 'retry-model',
    });
    expect(useAgentStore.getState()).toMatchObject({
      activeSessionMessageId: 'active-model',
      globalError: 'existing global error',
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Paused. Waiting for user confirmation...',
    });
  });

  it('hydrates with an explicit status when the caller provides one', () => {
    const message: Message = {
      id: 'model-1',
      role: 'model',
      parts: [{ text: '' }],
      work: createWork({ agentStates: [createAgent()] }),
    };

    const resolved = resolveOperationalSession(message, {
      status: 'paused',
      targetMessageId: 'paused-model',
    });

    expect(resolved).toMatchObject({
      source: 'hydrated-snapshot',
      sessionMessageId: 'paused-model',
    });
    expect(useAgentStore.getState().sessionsByMessageId['paused-model']).toMatchObject({
      status: 'paused',
      isLoading: true,
      isPaused: true,
    });
  });

  it('commits the current session snapshot into the matching model message', () => {
    const liveWork = createWork({ results: { [STEPS.SYNTHESIS]: ['live answer'] } });
    const messages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'prompt' }] },
      { id: 'model-1', role: 'model', parts: [{ text: '' }] },
    ];

    useAgentStore.getState().startSession('model-1', liveWork);

    const committedMessages = commitSessionSnapshotToMessage(messages, 'model-1');

    expect(committedMessages).not.toBe(messages);
    expect(committedMessages[1]).toMatchObject({
      id: 'model-1',
      work: expect.objectContaining({ results: liveWork.results }),
    });
    expect(committedMessages[1]?.work).not.toBe(liveWork);
  });

  it('uses fallbackWork when no session snapshot exists', () => {
    const fallbackWork = createWork({ results: { [STEPS.SYNTHESIS]: ['fallback answer'] } });
    const messages: Message[] = [
      { id: 'model-1', role: 'model', parts: [{ text: '' }] },
    ];

    const committedMessages = commitSessionSnapshotToMessage(messages, 'model-1', { fallbackWork });

    expect(committedMessages).not.toBe(messages);
    expect(committedMessages[0]).toMatchObject({
      id: 'model-1',
      work: expect.objectContaining({ results: fallbackWork.results }),
    });
    expect(committedMessages[0]?.work).not.toBe(fallbackWork);
  });

  it('returns the original messages array when no matching model message exists or no work is available', () => {
    const messagesWithoutMatchingModel: Message[] = [
      { id: 'model-1', role: 'model', parts: [{ text: '' }] },
      { id: 'user-1', role: 'user', parts: [{ text: 'prompt' }] },
    ];
    const messagesWithoutWork: Message[] = [
      { id: 'model-1', role: 'model', parts: [{ text: '' }] },
    ];

    expect(
      commitSessionSnapshotToMessage(messagesWithoutMatchingModel, 'missing-model', { fallbackWork: createWork() }),
    ).toBe(messagesWithoutMatchingModel);
    expect(commitSessionSnapshotToMessage(messagesWithoutWork, 'model-1')).toBe(messagesWithoutWork);
  });
});
