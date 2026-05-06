import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';
import type { AgentState, AppSettings, Message, Source, StepId, TokenUsage, Work } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { STEPS } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';

const mocks = vi.hoisted(() => ({
  getFriendlyErrorMessage: vi.fn(() => 'Friendly failure'),
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

vi.mock('@/services/swarm/steps/utils/errorUtils', () => ({
  getFriendlyErrorMessage: mocks.getFriendlyErrorMessage,
}));

import { useSwarmRegeneration } from '@/hooks/swarm/useSwarmRegeneration';

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const createUsage = (totalTokens: number): TokenUsage => ({
  promptTokens: Math.floor(totalTokens / 2),
  candidatesTokens: Math.ceil(totalTokens / 2),
  totalTokens,
});

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'model-1-initial-agent-0',
  name: 'Agent 1',
  status: 'done',
  label: 'Done',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'model-1',
  ...overrides,
});

const createBaseWork = (overrides: Partial<Work> = {}): Work => ({
  results: {
    [STEPS.INITIAL]: ['old agent 0', 'old agent 1'],
    [`${STEPS.INITIAL}_thoughts`]: ['old thought 0', 'old thought 1'],
    [`${STEPS.INITIAL}_usage`]: [createUsage(10), createUsage(20)],
    [STEPS.REFINEMENT]: ['old critic 0', 'old critic 1'],
    [`${STEPS.REFINEMENT}_thoughts`]: ['old critic thought 0', 'old critic thought 1'],
    [`${STEPS.REFINEMENT}_usage`]: [createUsage(30), createUsage(40)],
    [STEPS.SYNTHESIS]: { text: 'old final answer' },
  },
  stepMetadata: [
    { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
    { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
    { id: STEPS.SYNTHESIS, status: 'done', label: 'Synthesis Step' },
  ],
  agentStates: [
    createAgent({ id: 'model-1-initial-agent-0', agentIndex: 0 }),
    createAgent({ id: 'model-1-initial-agent-1', agentIndex: 1 }),
  ],
  agentNames: ['Agent 1', 'Agent 2'],
  criticNames: ['Critic 1', 'Critic 2'],
  ...overrides,
});

const createRegeneratedWork = ({
  stepId = STEPS.INITIAL,
  agentIndex = 1,
  text = 'new agent 1',
  thought = 'new thought 1',
  usage = createUsage(99),
}: {
  stepId?: StepId;
  agentIndex?: number;
  text?: string;
  thought?: string;
  usage?: TokenUsage;
} = {}): Work => {
  if (stepId === STEPS.SYNTHESIS) {
    return {
      results: {
        [STEPS.SYNTHESIS]: { text },
        [`${STEPS.SYNTHESIS}_thought`]: thought,
        [`${STEPS.SYNTHESIS}_usage`]: usage,
      },
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'done', label: 'Regenerated Synthesis' }],
    };
  }

  const stepResults: string[] = [];
  const stepThoughts: string[] = [];
  const stepUsage: TokenUsage[] = [];
  stepResults[agentIndex] = text;
  stepThoughts[agentIndex] = thought;
  stepUsage[agentIndex] = usage;

  return {
    results: {
      [stepId]: stepResults,
      [`${stepId}_thoughts`]: stepThoughts,
      [`${stepId}_usage`]: stepUsage,
    },
    stepMetadata: [{ id: stepId, status: 'done', label: `Regenerated ${stepId}` }],
  };
};

const createConversation = (work: Work = createBaseWork()): Message[] => [
  {
    id: 'user-1',
    role: 'user',
    parts: [{ text: 'Original' }, { text: 'prompt' }],
    image: 'image-url',
  },
  {
    id: 'model-1',
    role: 'model',
    parts: [{ text: 'old final answer' }],
    work,
    sources: [{ uri: 'https://old-source.test', title: 'Old Source' }],
  },
];

const createConversationWithoutWork = (): Message[] => [
  { id: 'user-1', role: 'user', parts: [{ text: 'Original prompt' }] },
  { id: 'model-1', role: 'model', parts: [{ text: 'old final answer' }] },
];

const createMessagesState = (initialMessages: Message[]) => {
  let messages = initialMessages;
  const messagesRef = { current: messages };

  const setMessages = vi.fn((next: SetStateAction<Message[]>) => {
    messages = typeof next === 'function'
      ? (next as (previousMessages: Message[]) => Message[])(messages)
      : next;
    messagesRef.current = messages;
  });

  return {
    messagesRef,
    setMessages,
    get messages() {
      return messages;
    },
  };
};

const renderRegeneration = ({
  initialMessages = createConversation(),
  regenerateResponse = vi.fn(async () => ({
    text: 'new agent 1',
    sources: [],
    work: createRegeneratedWork(),
  })),
  orchestratorRef = { current: { regenerateResponse } },
  settings = createMockSettings({ numAgents: 2 }),
  lastInput = {
    text: 'Original prompt',
    image: 'image-url',
    imageFile: new File(['image'], 'image.png', { type: 'image/png' }),
  },
}: {
  initialMessages?: Message[];
  regenerateResponse?: ReturnType<typeof vi.fn>;
  orchestratorRef?: { current: { regenerateResponse: ReturnType<typeof vi.fn> } | null };
  settings?: AppSettings;
  lastInput?: { text: string; image: string | null; imageFile: File | null } | null;
} = {}) => {
  const messagesState = createMessagesState(initialMessages);

  const hook = renderHook(() => useSwarmRegeneration({
    settings,
    messages: messagesState.messages,
    messagesRef: messagesState.messagesRef,
    setMessages: messagesState.setMessages,
    orchestratorRef: orchestratorRef as any,
    lastInput,
  }));

  return {
    ...hook,
    messagesState,
    regenerateResponse,
    settings,
  };
};

const toRegenerateResponseCall = (args: any[]) => {
  const [
    settings,
    userInput,
    image,
    imageFile,
    history,
    messageId,
    agentIndex,
    stepId,
    workContext,
    agentStates,
    onUpdate,
    signal,
    onSynthesisJump,
  ] = args;

  return {
    settings,
    userInput,
    image,
    imageFile,
    history,
    messageId,
    agentIndex,
    stepId,
    workContext,
    agentStates,
    onUpdate: onUpdate as (text: string, isFirstChunk: boolean, thought?: string, usage?: TokenUsage) => void,
    signal,
    onSynthesisJump,
  };
};

const getRegenerateResponseCall = (regenerateResponse: ReturnType<typeof vi.fn>) => toRegenerateResponseCall(regenerateResponse.mock.calls[0]);

describe('useSwarmRegeneration', () => {
  beforeEach(() => {
    resetAgentStore();
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.getFriendlyErrorMessage.mockReturnValue('Friendly failure');
  });

  afterEach(() => {
    resetAgentStore();
    vi.useRealTimers();
  });

  it('aborts an in-flight regeneration for the same agent before starting the replacement', async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const regenerateResponse = vi.fn((...args: any[]) => {
      const { signal } = toRegenerateResponseCall(args);
      if (regenerateResponse.mock.calls.length === 1) {
        firstSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        });
      }

      return Promise.resolve({
        text: 'new agent 1',
        sources: [],
        work: createRegeneratedWork(),
      });
    });
    const { result } = renderRegeneration({ regenerateResponse });
    let firstPromise: Promise<void>;
    let secondPromise: Promise<void>;

    act(() => {
      firstPromise = result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    const firstController = useAgentStore.getState().abortControllers.get('regen-model-1-initial_step-1');
    expect(firstController).toBeDefined();
    const abortSpy = vi.spyOn(firstController!, 'abort');

    act(() => {
      secondPromise = result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(true);
    expect(regenerateResponse).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await act(async () => {
      await Promise.allSettled([firstPromise, secondPromise]);
    });

    expect(regenerateResponse).toHaveBeenCalledTimes(2);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('returns early when the target message cannot be found', async () => {
    const { result, regenerateResponse } = renderRegeneration({
      initialMessages: createConversation(),
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('missing-message', STEPS.INITIAL, 1);
    });

    expect(regenerateResponse).not.toHaveBeenCalled();
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('falls back to the hook messages when messagesRef.current is unavailable', async () => {
    const { result, regenerateResponse, messagesState } = renderRegeneration();
    messagesState.messagesRef.current = null as any;

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(getRegenerateResponseCall(regenerateResponse).history).toEqual([createConversation()[0]]);
  });

  it('recovers work from a live session before falling back to message snapshots', async () => {
    const fallbackWork = createBaseWork({
      results: {
        [STEPS.INITIAL]: ['fallback agent 0', 'fallback agent 1'],
      },
    });
    useAgentStore.getState().startSession('model-1', fallbackWork, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
    });
    const { result, regenerateResponse, messagesState } = renderRegeneration({
      initialMessages: createConversationWithoutWork(),
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    const regenerateCall = getRegenerateResponseCall(regenerateResponse);
    expect(regenerateCall.workContext).toEqual(fallbackWork);
    expect(regenerateCall.workContext).not.toBe(fallbackWork);
    expect(messagesState.messages[1].work?.results?.[STEPS.INITIAL]).toEqual(['fallback agent 0', 'new agent 1']);
  });

  it('does not regenerate when no message snapshot or matching live session exists', async () => {
    const { result, regenerateResponse } = renderRegeneration({
      initialMessages: createConversationWithoutWork(),
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(regenerateResponse).not.toHaveBeenCalled();
    expect(useAgentStore.getState().error).toBe('Cannot regenerate this message. Please try again.');
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('passes imageFile only when the triggering user image matches lastInput.image', async () => {
    const matchingFile = new File(['image'], 'matching.png', { type: 'image/png' });
    const matching = renderRegeneration({
      lastInput: {
        text: 'Original prompt',
        image: 'image-url',
        imageFile: matchingFile,
      },
    });

    await act(async () => {
      await matching.result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(getRegenerateResponseCall(matching.regenerateResponse).imageFile).toBe(matchingFile);

    const mismatchedFile = new File(['image'], 'mismatched.png', { type: 'image/png' });
    const mismatched = renderRegeneration({
      lastInput: {
        text: 'Original prompt',
        image: 'different-image-url',
        imageFile: mismatchedFile,
      },
    });

    await act(async () => {
      await mismatched.result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(getRegenerateResponseCall(mismatched.regenerateResponse).imageFile).toBeNull();
  });

  it('hydrates missing agents from message work before delegating to the orchestrator', async () => {
    const matchingAgent = createAgent({ id: 'saved-agent', messageId: 'model-1', agentIndex: 1 });
    const otherMessageAgent = createAgent({ id: 'other-agent', messageId: 'other-model', agentIndex: 1 });
    const work = createBaseWork({ agentStates: [matchingAgent, otherMessageAgent] });
    const regenerateResponse = vi.fn(async () => {
      return {
        text: 'new agent 1',
        sources: [],
        work: createRegeneratedWork(),
      };
    });
    const { result } = renderRegeneration({ initialMessages: createConversation(work), regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(useAgentStore.getState().sessionsByMessageId['model-1']?.agentStates).toEqual([matchingAgent]);
    expect(getRegenerateResponseCall(regenerateResponse).agentStates).toEqual([matchingAgent]);
  });

  it('skips hydration when no matching agents can be recovered from workContext', async () => {
    const work = createBaseWork({ agentStates: [] });
    const { result, regenerateResponse } = renderRegeneration({ initialMessages: createConversation(work) });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(useAgentStore.getState().sessionsByMessageId['model-1']?.agentStates).toEqual([]);
    expect(getRegenerateResponseCall(regenerateResponse).agentStates).toEqual([]);
  });

  it('does not call the orchestrator when the original user prompt cannot be found', async () => {
    const orphanedMessages: Message[] = [{
      id: 'model-1',
      role: 'model',
      parts: [{ text: 'old final answer' }],
      work: createBaseWork(),
      sources: [{ uri: 'https://old-source.test', title: 'Old Source' }],
    }];
    const regenerateResponse = vi.fn();
    const { result, messagesState } = renderRegeneration({
      initialMessages: orphanedMessages,
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(regenerateResponse).not.toHaveBeenCalled();
    expect(mocks.getFriendlyErrorMessage).toHaveBeenCalledWith(expect.any(Error));
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Error: Friendly failure',
      activeSessionMessageId: 'model-1',
    });
    expect(messagesState.messages[0].work?.agentStates).toEqual([
      expect.objectContaining({ id: 'model-1-initial-agent-0', messageId: 'model-1' }),
      expect.objectContaining({ id: 'model-1-initial-agent-1', messageId: 'model-1' }),
    ]);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('forwards synthesis jump callback during regeneration and completes cleanup afterward', async () => {
    let captured: {
      onSynthesisJump: () => void;
      resolve: (value: { text: string; sources: Source[]; work: Work }) => void;
    } | undefined;
    const regenerateResponse = vi.fn((...args: any[]) => {
      const regenerateCall = toRegenerateResponseCall(args);
      return new Promise<{ text: string; sources: Source[]; work: Work }>(resolve => {
        captured = {
          onSynthesisJump: regenerateCall.onSynthesisJump,
          resolve,
        };
      });
    });
    const { result } = renderRegeneration({ regenerateResponse });
    let regenerationPromise: Promise<void>;

    act(() => {
      regenerationPromise = result.current.regenerateAgentResponse('model-1', STEPS.SYNTHESIS, 0);
    });

    act(() => {
      captured?.onSynthesisJump();
    });
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
    });

    await act(async () => {
      captured?.resolve({
        text: 'new final answer',
        sources: [],
        work: createRegeneratedWork({ stepId: STEPS.SYNTHESIS, agentIndex: 0, text: 'new final answer' }),
      });
      await regenerationPromise;
    });

    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
    });
  });

  it('syncs the final regenerated work, metadata, sources, and agent snapshot back to the target message', async () => {
    const source: Source = { uri: 'https://new-source.test', title: 'New Source' };
    const finalUsage = createUsage(123);
    const snapshotAgents = [
      createAgent({ id: 'snapshot-agent-0', agentIndex: 0, messageId: 'model-1' }),
      createAgent({ id: 'snapshot-agent-1', agentIndex: 1, messageId: 'model-1', name: 'Updated Agent' }),
      createAgent({ id: 'other-message-agent', agentIndex: 1, messageId: 'other-model' }),
    ];
    useAgentStore.getState().replaceSessionAgents('model-1', snapshotAgents);
    const regenerateResponse = vi.fn(async (...args: any[]) => {
      const { onUpdate } = toRegenerateResponseCall(args);
      onUpdate('streamed agent 1', true, 'stream thought 1', createUsage(77));

      return {
        text: 'new agent 1',
        sources: [source],
        work: createRegeneratedWork({
          agentIndex: 1,
          text: 'new agent 1',
          thought: 'new thought 1',
          usage: finalUsage,
        }),
      };
    });
    const { result, messagesState } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    const updatedMessage = messagesState.messages[1];
    const updatedWork = updatedMessage.work!;
    expect(updatedWork.results?.[STEPS.INITIAL]).toEqual(['old agent 0', 'new agent 1']);
    expect(updatedWork.results?.[`${STEPS.INITIAL}_thoughts`]).toEqual(['old thought 0', 'new thought 1']);
    expect(updatedWork.results?.[`${STEPS.INITIAL}_usage`]).toEqual([createUsage(10), finalUsage]);
    expect(updatedWork.stepMetadata?.find(m => m.id === STEPS.INITIAL)).toMatchObject({
      status: 'done',
      label: `Regenerated ${STEPS.INITIAL}`,
    });
    expect(updatedWork.stepMetadata?.find(m => m.id === STEPS.REFINEMENT)).toMatchObject({
      status: 'stale',
      staleFromStepId: STEPS.INITIAL,
    });
    expect(updatedWork.stepMetadata?.find(m => m.id === STEPS.SYNTHESIS)).toMatchObject({
      status: 'stale',
      staleFromStepId: STEPS.INITIAL,
    });
    expect(updatedWork.results?.[STEPS.REFINEMENT]).toEqual(['old critic 0', 'old critic 1']);
    expect(updatedWork.results?.[STEPS.SYNTHESIS]).toEqual({ text: 'old final answer' });
    expect(updatedWork.agentStates).toEqual(snapshotAgents.slice(0, 2));
    expect(updatedMessage.sources).toEqual([source]);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('marks synthesis stale after critic regeneration on a completed message without enabling global continue', async () => {
    const regenerateResponse = vi.fn(async () => ({
      text: 'new critic 1',
      sources: [],
      work: createRegeneratedWork({
        stepId: STEPS.REFINEMENT,
        agentIndex: 1,
        text: 'new critic 1',
        thought: 'new critic thought 1',
        usage: createUsage(55),
      }),
    }));
    const { result, messagesState } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.REFINEMENT, 1);
    });

    expect(messagesState.messages[1].work?.results?.[STEPS.REFINEMENT]).toEqual(['old critic 0', 'new critic 1']);
    expect(messagesState.messages[1].work?.results?.[STEPS.SYNTHESIS]).toEqual({ text: 'old final answer' });
    expect(messagesState.messages[1].work?.stepMetadata?.find(m => m.id === STEPS.SYNTHESIS)).toMatchObject({
      status: 'stale',
      staleFromStepId: STEPS.REFINEMENT,
    });
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
    });
  });

  it('keeps a paused live workflow resumable after upstream regeneration when synthesis was not yet complete', async () => {
    const pausedWork = createBaseWork({
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
        { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
        { id: STEPS.SYNTHESIS, status: 'pending', label: 'Synthesis Step' },
      ],
      results: {
        [STEPS.INITIAL]: ['old agent 0', 'old agent 1'],
        [STEPS.REFINEMENT]: ['old critic 0', 'old critic 1'],
        [STEPS.SYNTHESIS]: {},
      },
    });
    const regenerateResponse = vi.fn(async () => ({
      text: 'new critic 1',
      sources: [],
      work: createRegeneratedWork({
        stepId: STEPS.REFINEMENT,
        agentIndex: 1,
        text: 'new critic 1',
        thought: 'new critic thought 1',
        usage: createUsage(65),
      }),
    }));
    useAgentStore.getState().startSession('model-1', pausedWork, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Paused. Waiting for user confirmation...',
    });
    const { result, messagesState } = renderRegeneration({
      initialMessages: createConversation(pausedWork),
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.REFINEMENT, 1);
    });

    expect(messagesState.messages[1].work?.stepMetadata?.find(m => m.id === STEPS.SYNTHESIS)).toMatchObject({
      status: 'pending',
    });
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: true,
      isPaused: true,
      activeSessionMessageId: 'model-1',
    });
  });

  it('uses the live session work for downstream regeneration even if the message snapshot is reverted', async () => {
    const regenerateResponse = vi.fn(async (...args: any[]) => {
      const { stepId } = toRegenerateResponseCall(args);

      if (stepId === STEPS.REFINEMENT) {
        return {
          text: 'new critic 1',
          sources: [],
          work: createRegeneratedWork({
            stepId: STEPS.REFINEMENT,
            agentIndex: 1,
            text: 'new critic 1',
            thought: 'new critic thought 1',
            usage: createUsage(88),
          }),
        };
      }

      return {
        text: 'new final answer',
        sources: [],
        work: createRegeneratedWork({
          stepId: STEPS.SYNTHESIS,
          agentIndex: 0,
          text: 'new final answer',
          thought: 'new synthesis thought',
          usage: createUsage(144),
        }),
      };
    });
    const { result, messagesState } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.REFINEMENT, 1);
    });

    act(() => {
      messagesState.setMessages(prev => prev.map(message => (
        message.id === 'model-1'
          ? {
              ...message,
              work: createBaseWork(),
            }
          : message
      )));
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.SYNTHESIS, 0);
    });

    const secondCall = toRegenerateResponseCall(regenerateResponse.mock.calls[1]);
    expect(secondCall.workContext.results?.[STEPS.REFINEMENT]).toEqual(['old critic 0', 'new critic 1']);
    expect(messagesState.messages[1].work?.results?.[STEPS.REFINEMENT]).toEqual(['old critic 0', 'new critic 1']);
    expect(messagesState.messages[1].work?.results?.[STEPS.SYNTHESIS]).toEqual({ text: 'new final answer' });
  });

  it('writes final message work from the session snapshot instead of a stale message snapshot', async () => {
    const liveSessionWork = createBaseWork({
      results: {
        [STEPS.INITIAL]: ['live agent 0', 'live agent 1'],
        [`${STEPS.INITIAL}_thoughts`]: ['live thought 0', 'live thought 1'],
        [`${STEPS.INITIAL}_usage`]: [createUsage(101), createUsage(102)],
        [STEPS.REFINEMENT]: ['live critic 0', 'live critic 1'],
        [`${STEPS.REFINEMENT}_thoughts`]: ['live critic thought 0', 'live critic thought 1'],
        [`${STEPS.REFINEMENT}_usage`]: [createUsage(103), createUsage(104)],
        [STEPS.SYNTHESIS]: { text: 'live final answer' },
      },
    });
    const staleMessageWork = createBaseWork();
    useAgentStore.getState().startSession('model-1', liveSessionWork, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Paused. Waiting for user confirmation...',
    });
    const regenerateResponse = vi.fn(async () => ({
      text: 'new critic 1',
      sources: [],
      work: createRegeneratedWork({
        stepId: STEPS.REFINEMENT,
        agentIndex: 1,
        text: 'new critic 1',
        thought: 'new critic thought 1',
        usage: createUsage(155),
      }),
    }));
    const { result, messagesState } = renderRegeneration({
      initialMessages: createConversation(staleMessageWork),
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.REFINEMENT, 1);
    });

    expect(messagesState.messages[1].work?.results?.[STEPS.INITIAL]).toEqual(['live agent 0', 'live agent 1']);
    expect(messagesState.messages[1].work?.results?.[STEPS.REFINEMENT]).toEqual(['live critic 0', 'new critic 1']);
    expect(messagesState.messages[1].work?.results?.[STEPS.SYNTHESIS]).toEqual({ text: 'live final answer' });
    expect(messagesState.messages[1].work?.stepMetadata?.find(m => m.id === STEPS.SYNTHESIS)).toMatchObject({
      status: 'stale',
      staleFromStepId: STEPS.REFINEMENT,
    });
  });

  it('refuses regeneration for historical assistant turns once a later user turn exists', async () => {
    const historicalConversation: Message[] = [
      ...createConversation(),
      { id: 'user-2', role: 'user', parts: [{ text: 'follow up' }] },
    ];
    const regenerateResponse = vi.fn();
    const { result } = renderRegeneration({
      initialMessages: historicalConversation,
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(regenerateResponse).not.toHaveBeenCalled();
  });

  it('adds missing step metadata when the existing message has no metadata for the regenerated step', async () => {
    const workWithoutMetadata = createBaseWork({ stepMetadata: [] });
    const regenerateResponse = vi.fn(async () => ({
      text: 'new agent 1',
      sources: [],
      work: createRegeneratedWork(),
    }));
    const { result, messagesState } = renderRegeneration({
      initialMessages: createConversation(workWithoutMetadata),
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(messagesState.messages[1].work?.stepMetadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: STEPS.INITIAL, status: 'done', label: `Regenerated ${STEPS.INITIAL}` }),
      expect.objectContaining({ id: STEPS.REFINEMENT, status: 'stale', staleFromStepId: STEPS.INITIAL }),
      expect.objectContaining({ id: STEPS.SYNTHESIS, status: 'stale', staleFromStepId: STEPS.INITIAL }),
    ]));
  });

  it('preserves existing sources when regeneration returns no replacement sources', async () => {
    const regenerateResponse = vi.fn(async () => {
      return {
        text: 'new agent 1',
        work: createRegeneratedWork(),
      } as any;
    });
    const { result, messagesState } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(messagesState.messages[1].sources).toEqual([{ uri: 'https://old-source.test', title: 'Old Source' }]);
  });

  it('surfaces a friendly error when the orchestrator is unavailable', async () => {
    const { result, messagesState } = renderRegeneration({
      orchestratorRef: { current: null },
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(mocks.getFriendlyErrorMessage).toHaveBeenCalledWith(expect.any(Error));
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Error: Friendly failure',
      activeSessionMessageId: 'model-1',
    });
    expect(messagesState.messages[1].work?.agentStates).toEqual([
      expect.objectContaining({ id: 'model-1-initial-agent-0', messageId: 'model-1' }),
      expect.objectContaining({ id: 'model-1-initial-agent-1', messageId: 'model-1' }),
    ]);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('cleans up abort state without turning user cancellation into an error', async () => {
    const regenerateResponse = vi.fn(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const { result } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      error: null,
      loadingStatus: '',
      activeSessionMessageId: undefined,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('restores previous live agent states after an aborted regeneration updates them transiently', async () => {
    const originalConversation = createConversation();
    const originalAgents = originalConversation[1].work?.agentStates?.map(agent => ({ ...agent })) ?? [];
    const transientAgents = [
      createAgent({ id: 'model-1-initial-agent-0', agentIndex: 0, status: 'done', label: 'Done' }),
      createAgent({ id: 'model-1-initial-agent-1', agentIndex: 1, status: 'working', label: 'Regenerating...' }),
    ];
    const regenerateResponse = vi.fn(async () => {
      useAgentStore.getState().replaceSessionAgents('model-1', transientAgents);
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const { result } = renderRegeneration({
      initialMessages: originalConversation,
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(useAgentStore.getState().sessionsByMessageId['model-1']?.agentStates).toEqual(originalAgents);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      error: null,
      loadingStatus: '',
      activeSessionMessageId: undefined,
    });
  });

  it('restores the original synthesis snapshot after an aborted synthesis regeneration', async () => {
    const originalConversation = createConversation();
    const regenerateResponse = vi.fn(async (...args: any[]) => {
      const { onUpdate } = toRegenerateResponseCall(args);
      onUpdate('partial regenerated answer', true, 'reasoning', createUsage(77));
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    const { result, messagesState } = renderRegeneration({
      initialMessages: originalConversation,
      regenerateResponse,
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.SYNTHESIS, 0);
    });

    expect(messagesState.messages[1]).toMatchObject(originalConversation[1]);
    expect(useAgentStore.getState().sessionsByMessageId['model-1']?.work.results?.[STEPS.SYNTHESIS]).toEqual({
      text: 'old final answer',
    });
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
    });
  });

  it('cleans up abort state for plain Error("Aborted") cancellations too', async () => {
    const regenerateResponse = vi.fn(async () => {
      throw new Error('Aborted');
    });
    const { result } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      error: null,
      loadingStatus: '',
      activeSessionMessageId: undefined,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('keeps retry UI mounted and snapshots work when regeneration fails with a real error', async () => {
    const savedAgent = createAgent({ id: 'failed-agent', messageId: 'model-1', agentIndex: 1 });
    useAgentStore.getState().replaceSessionAgents('model-1', [savedAgent]);
    const failure = new Error('network failed');
    const regenerateResponse = vi.fn(async () => {
      throw failure;
    });
    const { result, messagesState } = renderRegeneration({ regenerateResponse });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(mocks.getFriendlyErrorMessage).toHaveBeenCalledWith(failure);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Error: Friendly failure',
      activeSessionMessageId: 'model-1',
    });
    expect(messagesState.messages[1].work?.agentStates).toEqual([savedAgent]);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });
});
