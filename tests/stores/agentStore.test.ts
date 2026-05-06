import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '@/stores/agentStore';
import { STEPS } from '@/types/steps';
import type { AgentState, TokenUsage, Work } from '@/types';

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

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
  status: 'working',
  label: 'Working',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'msg-1',
  ...overrides,
});

const createUsage = (totalTokens: number): TokenUsage => ({
  promptTokens: Math.floor(totalTokens / 2),
  candidatesTokens: Math.ceil(totalTokens / 2),
  totalTokens,
});

describe('agentStore', () => {
  beforeEach(() => {
    resetAgentStore();
  });

  afterEach(() => {
    resetAgentStore();
  });

  it('starts with the expected initial state', () => {
    const state = useAgentStore.getState();

    expect(state.isLoading).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.loadingStatus).toBe('');
    expect(state.error).toBeNull();
    expect(state.activeSessionMessageId).toBeUndefined();
    expect(state.sessionsByMessageId).toEqual({});
    expect(state.abortControllers).toBeInstanceOf(Map);
    expect(state.abortControllers.size).toBe(0);
  });

  it('updates active session runtime fields through session APIs', () => {
    const work: Work = { results: { [STEPS.INITIAL]: ['draft'] } };
    const store = useAgentStore.getState();

    store.startSession('msg-123', work);
    store.updateSessionRuntime('msg-123', {
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Loading drafts',
      error: 'Something failed',
    });

    const state = useAgentStore.getState();
    expect(state.activeSessionMessageId).toBe('msg-123');
    expect(state.sessionsByMessageId['msg-123']?.work).toEqual(work);
    expect(state.isLoading).toBe(true);
    expect(state.isPaused).toBe(true);
    expect(state.loadingStatus).toBe('Loading drafts');
    expect(state.error).toBe('Something failed');
  });

  it('adds and updates agents by step, index, and message id', () => {
    const store = useAgentStore.getState();

    store.updateSessionAgent(STEPS.INITIAL, 0, 'working', 'Working', 'msg-1');
    store.updateSessionAgent(STEPS.INITIAL, 1, 'working', 'Working', 'msg-1', 'Custom Agent');
    store.updateSessionAgent(STEPS.INITIAL, 0, 'done', 'Done', 'msg-1');
    store.updateSessionAgent(STEPS.INITIAL, 0, 'working', 'Working', 'msg-2');

    const msg1Agents = useAgentStore.getState().sessionsByMessageId['msg-1']?.agentStates ?? [];
    const msg2Agents = useAgentStore.getState().sessionsByMessageId['msg-2']?.agentStates ?? [];
    expect(msg1Agents).toHaveLength(2);
    expect(msg2Agents).toHaveLength(1);
    expect(msg1Agents[0]).toMatchObject({
      id: 'msg-1-initial_step-agent-0',
      name: 'Agent 1',
      status: 'done',
      label: 'Done',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      messageId: 'msg-1',
    });
    expect(msg1Agents[1]).toMatchObject({
      id: 'msg-1-initial_step-agent-1',
      name: 'Custom Agent',
      agentIndex: 1,
      messageId: 'msg-1',
    });
    expect(msg2Agents[0]).toMatchObject({
      id: 'msg-2-initial_step-agent-0',
      name: 'Agent 1',
      agentIndex: 0,
      messageId: 'msg-2',
    });
  });

  it('preserves an existing agent name when later updates omit the name', () => {
    const store = useAgentStore.getState();

    store.updateSessionAgent(STEPS.INITIAL, 0, 'working', 'Working', 'msg-1', 'Research Agent');
    store.updateSessionAgent(STEPS.INITIAL, 0, 'done', 'Done', 'msg-1');

    expect(useAgentStore.getState().sessionsByMessageId['msg-1']?.agentStates).toEqual([
      expect.objectContaining({
        id: 'msg-1-initial_step-agent-0',
        name: 'Research Agent',
        status: 'done',
        label: 'Done',
      }),
    ]);
  });

  it('replaces session agents and clear resets app state while leaving abort controllers untouched', () => {
    const hydratedAgents = [
      createAgent({ id: 'a', name: 'Hydrated A' }),
      createAgent({ id: 'b', name: 'Hydrated B', agentIndex: 1 }),
    ];
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    const store = useAgentStore.getState();

    store.replaceSessionAgents('msg-1', hydratedAgents);
    expect(useAgentStore.getState().sessionsByMessageId['msg-1']?.agentStates).toEqual(hydratedAgents);

    store.startSession('msg-1', { results: { [STEPS.INITIAL]: ['draft'] } });
    store.updateSessionRuntime('msg-1', {
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Loading',
      error: 'Failed',
    });
    store.registerAbortController('request-1', controller);

    useAgentStore.getState().clear();

    const state = useAgentStore.getState();
    expect(state.sessionsByMessageId).toEqual({});
    expect(state.isLoading).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.loadingStatus).toBe('');
    expect(state.error).toBeNull();
    expect(state.activeSessionMessageId).toBeUndefined();
    expect(state.abortControllers.get('request-1')).toBe(controller);
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it('registers, replaces, unregisters, and aborts controllers without mutating map references', () => {
    const store = useAgentStore.getState();
    const firstController = new AbortController();
    const replacementController = new AbortController();
    const secondController = new AbortController();
    const firstAbortSpy = vi.spyOn(firstController, 'abort');
    const replacementAbortSpy = vi.spyOn(replacementController, 'abort');
    const secondAbortSpy = vi.spyOn(secondController, 'abort');

    const initialMap = useAgentStore.getState().abortControllers;
    store.registerAbortController('request-1', firstController);
    const registeredMap = useAgentStore.getState().abortControllers;
    expect(registeredMap).not.toBe(initialMap);
    expect(registeredMap.get('request-1')).toBe(firstController);

    store.registerAbortController('request-1', replacementController);
    const replacedMap = useAgentStore.getState().abortControllers;
    expect(firstAbortSpy).toHaveBeenCalledTimes(1);
    expect(replacedMap).not.toBe(registeredMap);
    expect(replacedMap.get('request-1')).toBe(replacementController);

    store.registerAbortController('request-2', secondController);
    const twoControllerMap = useAgentStore.getState().abortControllers;
    store.unregisterAbortController('request-2');
    const unregisteredMap = useAgentStore.getState().abortControllers;
    expect(unregisteredMap).not.toBe(twoControllerMap);
    expect(unregisteredMap.has('request-2')).toBe(false);
    expect(secondAbortSpy).not.toHaveBeenCalled();

    store.unregisterAbortController('missing-request');
    expect(useAgentStore.getState().abortControllers.has('missing-request')).toBe(false);

    store.registerAbortController('request-2', secondController);
    store.abortAll();

    expect(replacementAbortSpy).toHaveBeenCalledTimes(1);
    expect(secondAbortSpy).toHaveBeenCalledTimes(1);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('aborts controllers without changing unrelated store state', () => {
    const store = useAgentStore.getState();
    const work: Work = { results: { [STEPS.INITIAL]: ['draft'] } };

    store.startSession('msg-keep', work);
    store.updateSessionRuntime('msg-keep', {
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Paused for retry',
      error: 'Previous error',
    });
    store.registerAbortController('request-1', new AbortController());

    store.abortAll();

    const state = useAgentStore.getState();
    expect(state.sessionsByMessageId['msg-keep']?.work).toEqual(work);
    expect(state.isLoading).toBe(true);
    expect(state.isPaused).toBe(true);
    expect(state.loadingStatus).toBe('Paused for retry');
    expect(state.error).toBe('Previous error');
    expect(state.activeSessionMessageId).toBe('msg-keep');
    expect(state.abortControllers.size).toBe(0);
  });

  it('does nothing when updating work for a missing session', () => {
    useAgentStore.getState().updateSessionWorkResult('missing-message', STEPS.INITIAL, 0, { text: 'ignored' });

    expect(useAgentStore.getState().sessionsByMessageId).toEqual({});
  });

  it('updates multi-agent work results without mutating the previous work reference', () => {
    const usage = createUsage(42);
    const initialWork: Work = {
      results: {
        [STEPS.INITIAL]: ['old 1', 'old 2'],
        unrelated: { keep: true },
      },
    };
    const store = useAgentStore.getState();

    store.startSession('msg-1', initialWork);
    const previousWork = useAgentStore.getState().sessionsByMessageId['msg-1']?.work;
    store.updateSessionWorkResult('msg-1', STEPS.INITIAL, 1, {
      text: 'new 2',
      thought: 'thinking 2',
      usage,
    });

    const updatedWork = useAgentStore.getState().sessionsByMessageId['msg-1']?.work;
    expect(updatedWork).not.toBe(previousWork);
    expect(updatedWork?.results?.[STEPS.INITIAL]).toEqual(['old 1', 'new 2']);
    expect(updatedWork?.results?.[`${STEPS.INITIAL}_thoughts`]).toEqual(['', 'thinking 2']);
    expect(updatedWork?.results?.[`${STEPS.INITIAL}_usage`]).toEqual([null, usage]);
    expect(updatedWork?.results?.unrelated).toEqual({ keep: true });
    expect(initialWork.results?.[STEPS.INITIAL]).toEqual(['old 1', 'old 2']);
  });

  it('updates synthesis work using slot-0 arrays while preserving sidecars', () => {
    const usage = createUsage(100);
    const sources = [{ uri: 'https://example.com', title: 'Example' }];
    const initialWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['old synthesis'],
        [`${STEPS.SYNTHESIS}_sources`]: sources,
        unrelated: ['keep'],
      },
    };
    const store = useAgentStore.getState();

    store.startSession('msg-1', initialWork);
    const previousWork = useAgentStore.getState().sessionsByMessageId['msg-1']?.work;
    store.updateSessionWorkResult('msg-1', STEPS.SYNTHESIS, 0, {
      text: 'final synthesis',
      thought: 'synthesis thought',
      usage,
    });

    const updatedWork = useAgentStore.getState().sessionsByMessageId['msg-1']?.work;
    expect(updatedWork).not.toBe(previousWork);
    expect(updatedWork?.results?.[STEPS.SYNTHESIS]).toEqual(['final synthesis']);
    expect(updatedWork?.results?.[`${STEPS.SYNTHESIS}_thoughts`]).toEqual(['synthesis thought']);
    expect(updatedWork?.results?.[`${STEPS.SYNTHESIS}_usage`]).toEqual([usage]);
    expect(updatedWork?.results?.[`${STEPS.SYNTHESIS}_sources`]).toEqual(sources);
    expect(updatedWork?.results?.unrelated).toEqual(['keep']);
    expect(initialWork.results?.[STEPS.SYNTHESIS]).toEqual(['old synthesis']);
  });

  it('reuses unchanged session fields during streaming work updates', () => {
    const initialAgentStates = [createAgent()];
    const initialWork: Work = {
      results: {
        [STEPS.INITIAL]: ['old 1'],
      },
      debugInfo: {
        [STEPS.INITIAL]: [{
          systemInstruction: 'system',
          history: [],
          userTurn: { parts: [] },
        }],
      },
      stepMetadata: [{ id: STEPS.INITIAL, status: 'working', label: 'Initial Step' }],
    };
    const store = useAgentStore.getState();

    store.startSession('msg-1', initialWork, { agentStates: initialAgentStates });

    const previousSession = useAgentStore.getState().sessionsByMessageId['msg-1'];
    store.updateSessionWorkResult('msg-1', STEPS.INITIAL, 0, { text: 'new 1' });

    const updatedSession = useAgentStore.getState().sessionsByMessageId['msg-1'];
    expect(updatedSession).toBeDefined();
    expect(updatedSession).not.toBe(previousSession);
    expect(updatedSession?.agentStates).toBe(previousSession?.agentStates);
    expect(updatedSession?.work.debugInfo).toBe(previousSession?.work.debugInfo);
    expect(updatedSession?.work.stepMetadata).not.toBe(previousSession?.work.stepMetadata);
    expect(updatedSession?.work.stepMetadata).toEqual(previousSession?.work.stepMetadata);
  });

  it('skips multi-agent work updates when text, thought, and usage are unchanged', () => {
    const initialWork: Work = {
      results: {
        [STEPS.INITIAL]: ['draft 1'],
        [`${STEPS.INITIAL}_thoughts`]: ['existing thought'],
        [`${STEPS.INITIAL}_usage`]: [createUsage(12)],
      },
    };
    const store = useAgentStore.getState();

    store.startSession('msg-1', initialWork);

    const previousSessions = useAgentStore.getState().sessionsByMessageId;
    const previousSession = previousSessions['msg-1'];
    const previousWork = previousSession?.work;

    store.updateSessionWorkResult('msg-1', STEPS.INITIAL, 0, {
      text: 'draft 1',
      thought: 'existing thought',
      usage: createUsage(12),
    });

    const nextSessions = useAgentStore.getState().sessionsByMessageId;
    const nextSession = nextSessions['msg-1'];

    expect(nextSessions).toBe(previousSessions);
    expect(nextSession).toBe(previousSession);
    expect(nextSession?.work).toBe(previousWork);
  });

  it('skips synthesis work updates when slot-0 text and usage are unchanged', () => {
    const initialWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['final answer'],
        [`${STEPS.SYNTHESIS}_thoughts`]: ['existing synthesis thought'],
        [`${STEPS.SYNTHESIS}_usage`]: [createUsage(24)],
      },
    };
    const store = useAgentStore.getState();

    store.startSession('msg-1', initialWork);

    const previousSessions = useAgentStore.getState().sessionsByMessageId;
    const previousSession = previousSessions['msg-1'];

    store.updateSessionWorkResult('msg-1', STEPS.SYNTHESIS, 0, {
      text: 'final answer',
      thought: 'existing synthesis thought',
      usage: createUsage(24),
    });

    const nextSessions = useAgentStore.getState().sessionsByMessageId;

    expect(nextSessions).toBe(previousSessions);
    expect(nextSessions['msg-1']).toBe(previousSession);
  });

  it('accepts usage null updates to clear multi-agent and synthesis usage', () => {
    const initialWork: Work = {
      results: {
        [STEPS.INITIAL]: ['draft 1'],
        [`${STEPS.INITIAL}_usage`]: [createUsage(12)],
        [STEPS.SYNTHESIS]: ['synthesis'],
        [`${STEPS.SYNTHESIS}_usage`]: [createUsage(24)],
      },
    };
    const store = useAgentStore.getState();

    store.startSession('msg-1', initialWork);
    store.updateSessionWorkResult('msg-1', STEPS.INITIAL, 0, { usage: null as never });
    store.updateSessionWorkResult('msg-1', STEPS.SYNTHESIS, 0, { usage: null as never });

    const results = useAgentStore.getState().sessionsByMessageId['msg-1']?.work.results;
    expect(results?.[`${STEPS.INITIAL}_usage`]).toEqual([null]);
    expect(results?.[`${STEPS.SYNTHESIS}_usage`]).toEqual([null]);
  });
});
