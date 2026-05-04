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

    expect(state.agents).toEqual([]);
    expect(state.currentWork).toBeUndefined();
    expect(state.isLoading).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.loadingStatus).toBe('');
    expect(state.error).toBeNull();
    expect(state.currentMessageId).toBeUndefined();
    expect(state.abortControllers).toBeInstanceOf(Map);
    expect(state.abortControllers.size).toBe(0);
  });

  it('updates simple state fields through setters', () => {
    const work: Work = { results: { [STEPS.INITIAL]: ['draft'] } };
    const store = useAgentStore.getState();

    store.setCurrentWork(work);
    store.setIsLoading(true);
    store.setIsPaused(true);
    store.setLoadingStatus('Loading drafts');
    store.setError('Something failed');
    store.setCurrentMessageId('msg-123');

    const state = useAgentStore.getState();
    expect(state.currentWork).toBe(work);
    expect(state.isLoading).toBe(true);
    expect(state.isPaused).toBe(true);
    expect(state.loadingStatus).toBe('Loading drafts');
    expect(state.error).toBe('Something failed');
    expect(state.currentMessageId).toBe('msg-123');
  });

  it('adds and updates agents by step, index, and message id', () => {
    const store = useAgentStore.getState();

    store.updateAgent(STEPS.INITIAL, 0, 'working', 'Working', 'msg-1');
    store.updateAgent(STEPS.INITIAL, 1, 'working', 'Working', 'msg-1', 'Custom Agent');
    store.updateAgent(STEPS.INITIAL, 0, 'done', 'Done', 'msg-1');
    store.updateAgent(STEPS.INITIAL, 0, 'working', 'Working', 'msg-2');

    const agents = useAgentStore.getState().agents;
    expect(agents).toHaveLength(3);
    expect(agents[0]).toMatchObject({
      id: 'msg-1-initial_step-agent-0',
      name: 'Agent 1',
      status: 'done',
      label: 'Done',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      messageId: 'msg-1',
    });
    expect(agents[1]).toMatchObject({
      id: 'msg-1-initial_step-agent-1',
      name: 'Custom Agent',
      agentIndex: 1,
      messageId: 'msg-1',
    });
    expect(agents[2]).toMatchObject({
      id: 'msg-2-initial_step-agent-0',
      name: 'Agent 1',
      agentIndex: 0,
      messageId: 'msg-2',
    });
  });

  it('preserves an existing agent name when later updates omit the name', () => {
    const store = useAgentStore.getState();

    store.updateAgent(STEPS.INITIAL, 0, 'working', 'Working', 'msg-1', 'Research Agent');
    store.updateAgent(STEPS.INITIAL, 0, 'done', 'Done', 'msg-1');

    expect(useAgentStore.getState().agents).toEqual([
      expect.objectContaining({
        id: 'msg-1-initial_step-agent-0',
        name: 'Research Agent',
        status: 'done',
        label: 'Done',
      }),
    ]);
  });

  it('hydrates agents and clear resets app state while leaving abort controllers untouched', () => {
    const hydratedAgents = [
      createAgent({ id: 'a', name: 'Hydrated A' }),
      createAgent({ id: 'b', name: 'Hydrated B', agentIndex: 1 }),
    ];
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    const store = useAgentStore.getState();

    store.hydrate(hydratedAgents);
    expect(useAgentStore.getState().agents).toBe(hydratedAgents);

    store.setCurrentWork({ results: { [STEPS.INITIAL]: ['draft'] } });
    store.setIsLoading(true);
    store.setIsPaused(true);
    store.setLoadingStatus('Loading');
    store.setError('Failed');
    store.setCurrentMessageId('msg-1');
    store.registerAbortController('request-1', controller);

    useAgentStore.getState().clear();

    const state = useAgentStore.getState();
    expect(state.agents).toEqual([]);
    expect(state.currentWork).toBeUndefined();
    expect(state.isLoading).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.loadingStatus).toBe('');
    expect(state.error).toBeNull();
    expect(state.currentMessageId).toBeUndefined();
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

    store.setCurrentWork(work);
    store.setIsLoading(true);
    store.setIsPaused(true);
    store.setLoadingStatus('Paused for retry');
    store.setError('Previous error');
    store.setCurrentMessageId('msg-keep');
    store.registerAbortController('request-1', new AbortController());

    store.abortAll();

    const state = useAgentStore.getState();
    expect(state.currentWork).toBe(work);
    expect(state.isLoading).toBe(true);
    expect(state.isPaused).toBe(true);
    expect(state.loadingStatus).toBe('Paused for retry');
    expect(state.error).toBe('Previous error');
    expect(state.currentMessageId).toBe('msg-keep');
    expect(state.abortControllers.size).toBe(0);
  });

  it('does nothing when updating work without currentWork', () => {
    useAgentStore.getState().updateWorkResult(STEPS.INITIAL, 0, { text: 'ignored' });

    expect(useAgentStore.getState().currentWork).toBeUndefined();
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

    store.setCurrentWork(initialWork);
    const previousWork = useAgentStore.getState().currentWork;
    store.updateWorkResult(STEPS.INITIAL, 1, {
      text: 'new 2',
      thought: 'thinking 2',
      usage,
    });

    const updatedWork = useAgentStore.getState().currentWork;
    expect(updatedWork).not.toBe(previousWork);
    expect(updatedWork?.results?.[STEPS.INITIAL]).toEqual(['old 1', 'new 2']);
    expect(updatedWork?.results?.[`${STEPS.INITIAL}_thoughts`]).toEqual(['', 'thinking 2']);
    expect(updatedWork?.results?.[`${STEPS.INITIAL}_usage`]).toEqual([null, usage]);
    expect(updatedWork?.results?.unrelated).toEqual({ keep: true });
    expect(initialWork.results?.[STEPS.INITIAL]).toEqual(['old 1', 'old 2']);
  });

  it('updates synthesis work using object, scalar thought, and scalar usage shapes', () => {
    const usage = createUsage(100);
    const sources = [{ uri: 'https://example.com', title: 'Example' }];
    const initialWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: { text: 'old synthesis', sources },
        unrelated: ['keep'],
      },
    };
    const store = useAgentStore.getState();

    store.setCurrentWork(initialWork);
    const previousWork = useAgentStore.getState().currentWork;
    store.updateWorkResult(STEPS.SYNTHESIS, -1, {
      text: 'final synthesis',
      thought: 'synthesis thought',
      usage,
    });

    const updatedWork = useAgentStore.getState().currentWork;
    expect(updatedWork).not.toBe(previousWork);
    expect(updatedWork?.results?.[STEPS.SYNTHESIS]).toEqual({
      text: 'final synthesis',
      sources,
    });
    expect(updatedWork?.results?.[`${STEPS.SYNTHESIS}_thought`]).toBe('synthesis thought');
    expect(updatedWork?.results?.[`${STEPS.SYNTHESIS}_usage`]).toBe(usage);
    expect(updatedWork?.results?.unrelated).toEqual(['keep']);
    expect(initialWork.results?.[STEPS.SYNTHESIS]).toEqual({ text: 'old synthesis', sources });
  });

  it('replaces legacy synthesis string data with object text shape', () => {
    const initialWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: 'legacy synthesis' as never,
      },
    };
    const store = useAgentStore.getState();

    store.setCurrentWork(initialWork);
    store.updateWorkResult(STEPS.SYNTHESIS, -1, { text: 'normalized synthesis' });

    expect(useAgentStore.getState().currentWork?.results?.[STEPS.SYNTHESIS]).toEqual({
      text: 'normalized synthesis',
    });
  });

  it('accepts usage null updates to clear multi-agent and synthesis usage', () => {
    const initialWork: Work = {
      results: {
        [STEPS.INITIAL]: ['draft 1'],
        [`${STEPS.INITIAL}_usage`]: [createUsage(12)],
        [STEPS.SYNTHESIS]: { text: 'synthesis' },
        [`${STEPS.SYNTHESIS}_usage`]: createUsage(24),
      },
    };
    const store = useAgentStore.getState();

    store.setCurrentWork(initialWork);
    store.updateWorkResult(STEPS.INITIAL, 0, { usage: null as never });
    store.updateWorkResult(STEPS.SYNTHESIS, -1, { usage: null as never });

    const results = useAgentStore.getState().currentWork?.results;
    expect(results?.[`${STEPS.INITIAL}_usage`]).toEqual([null]);
    expect(results?.[`${STEPS.SYNTHESIS}_usage`]).toBeNull();
  });
});
