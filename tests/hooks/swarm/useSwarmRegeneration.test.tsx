import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject, SetStateAction } from 'react';
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
  currentWork,
  currentMessageId,
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
  currentWork?: Work;
  currentMessageId?: string;
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
    currentWork,
    currentMessageId,
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
    pauseResolverRef,
    onPause,
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
    pauseResolverRef,
    onPause,
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

  it('recovers work from currentWork only when it belongs to the requested message', async () => {
    const fallbackWork = createBaseWork({
      results: {
        [STEPS.INITIAL]: ['fallback agent 0', 'fallback agent 1'],
      },
    });
    const { result, regenerateResponse, messagesState } = renderRegeneration({
      initialMessages: createConversationWithoutWork(),
      currentWork: fallbackWork,
      currentMessageId: 'model-1',
    });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    const regenerateCall = getRegenerateResponseCall(regenerateResponse);
    expect(regenerateCall.workContext).toEqual(fallbackWork);
    expect(regenerateCall.workContext).not.toBe(fallbackWork);
    expect(messagesState.messages[1].work?.results?.[STEPS.INITIAL]).toEqual(['fallback agent 0', 'new agent 1']);
  });

  it('does not regenerate when no message work or matching current work exists', async () => {
    const { result, regenerateResponse } = renderRegeneration({
      initialMessages: createConversationWithoutWork(),
      currentWork: createBaseWork(),
      currentMessageId: 'different-message',
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

    expect(useAgentStore.getState().agents).toEqual([matchingAgent]);
    expect(getRegenerateResponseCall(regenerateResponse).agentStates).toEqual([matchingAgent]);
  });

  it('skips hydration when no matching agents can be recovered from workContext', async () => {
    const work = createBaseWork({ agentStates: [] });
    const { result, regenerateResponse } = renderRegeneration({ initialMessages: createConversation(work) });

    await act(async () => {
      await result.current.regenerateAgentResponse('model-1', STEPS.INITIAL, 1);
    });

    expect(useAgentStore.getState().agents).toEqual([]);
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
      currentMessageId: 'model-1',
    });
    expect(messagesState.messages[0].work?.agentStates).toEqual([
      expect.objectContaining({ id: 'model-1-initial-agent-0', messageId: 'model-1' }),
      expect.objectContaining({ id: 'model-1-initial-agent-1', messageId: 'model-1' }),
    ]);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('passes pause callbacks to regeneration and applies their UI state changes', async () => {
    const pauseResolverRef: MutableRefObject<(() => void) | null> = { current: null };
    let captured: {
      pauseResolverRef: MutableRefObject<(() => void) | null>;
      onPause: () => void;
      onSynthesisJump: () => void;
      resolve: (value: { text: string; sources: Source[]; work: Work }) => void;
    } | undefined;
    const regenerateResponse = vi.fn((...args: any[]) => {
      const regenerateCall = toRegenerateResponseCall(args);
      return new Promise<{ text: string; sources: Source[]; work: Work }>(resolve => {
        captured = {
          pauseResolverRef: regenerateCall.pauseResolverRef,
          onPause: regenerateCall.onPause,
          onSynthesisJump: regenerateCall.onSynthesisJump,
          resolve,
        };
      });
    });
    const { result } = renderRegeneration({ regenerateResponse });
    let regenerationPromise: Promise<void>;

    act(() => {
      regenerationPromise = result.current.regenerateAgentResponse('model-1', STEPS.SYNTHESIS, 0, pauseResolverRef);
    });

    expect(captured?.pauseResolverRef).toBe(pauseResolverRef);

    act(() => {
      captured?.onPause();
    });
    expect(useAgentStore.getState()).toMatchObject({
      isPaused: true,
      loadingStatus: 'Paused. Waiting for user confirmation...',
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
      currentMessageId: undefined,
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
    useAgentStore.getState().hydrate(snapshotAgents);
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
    expect(updatedWork.agentStates).toEqual(snapshotAgents.slice(0, 2));
    expect(updatedMessage.sources).toEqual([source]);
    expect(useAgentStore.getState().isPaused).toBe(true);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
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

    expect(messagesState.messages[1].work?.stepMetadata).toEqual([
      expect.objectContaining({ id: STEPS.INITIAL, status: 'done', label: `Regenerated ${STEPS.INITIAL}` }),
    ]);
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
      currentMessageId: 'model-1',
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
      currentMessageId: undefined,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
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
      currentMessageId: undefined,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });

  it('keeps retry UI mounted and snapshots work when regeneration fails with a real error', async () => {
    const savedAgent = createAgent({ id: 'failed-agent', messageId: 'model-1', agentIndex: 1 });
    useAgentStore.getState().hydrate([savedAgent]);
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
      currentMessageId: 'model-1',
    });
    expect(messagesState.messages[1].work?.agentStates).toEqual([savedAgent]);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
  });
});
