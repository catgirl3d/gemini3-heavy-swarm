import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';
import type { AbortControllerHook } from '@/hooks/network/useAbortController';
import type { AgentState, Message, Source, TokenUsage, Work } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { STEPS } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';

const mocks = vi.hoisted(() => ({
  generateUUID: vi.fn(),
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

vi.mock('@/utils/common/uuid', () => ({
  generateUUID: mocks.generateUUID,
}));

vi.mock('@/services/swarm/steps/utils/errorUtils', () => ({
  getFriendlyErrorMessage: mocks.getFriendlyErrorMessage,
}));

import { useSwarmOrchestration } from '@/hooks/swarm/useSwarmOrchestration';

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const createMessagesState = (initialMessages: Message[] = []) => {
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

const spyOnActiveSessionClear = (assertSnapshotCommitted: () => void) => {
  const store = useAgentStore.getState();
  const originalSetActiveSession = store.setActiveSession;

  return vi.spyOn(store, 'setActiveSession').mockImplementation((messageId) => {
    if (messageId === undefined) {
      assertSnapshotCommitted();
    }

    return originalSetActiveSession(messageId);
  });
};

const createAbortHook = (): AbortControllerHook => {
  const hook: AbortControllerHook = {
    ref: { current: null },
    create: vi.fn(() => {
      const controller = new AbortController();
      hook.ref.current = controller;
      return controller;
    }),
    abort: vi.fn(() => {
      hook.ref.current?.abort();
      hook.ref.current = null;
    }),
    signal: undefined,
  };

  return hook;
};

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'waiting',
  label: 'Waiting...',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'model-1',
  ...overrides,
});

const createWork = (overrides: Partial<Work> = {}): Work => ({
  results: {
    [STEPS.INITIAL]: ['draft 1', 'draft 2'],
    [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
    [STEPS.SYNTHESIS]: ['final answer'],
  },
  stepMetadata: [
    { id: STEPS.INITIAL, status: 'done' },
    { id: STEPS.REFINEMENT, status: 'done' },
    { id: STEPS.SYNTHESIS, status: 'done' },
  ],
  ...overrides,
});

const renderOrchestration = ({
  initialMessages = [],
  runSwarm = vi.fn(),
  mainAbort = createAbortHook(),
  orchestratorRef = { current: { runSwarm } },
  settings = createMockSettings({ numAgents: 2 }),
}: {
  initialMessages?: Message[];
  runSwarm?: ReturnType<typeof vi.fn>;
  mainAbort?: AbortControllerHook;
  orchestratorRef?: { current: { runSwarm: ReturnType<typeof vi.fn> } | null };
  settings?: ReturnType<typeof createMockSettings>;
} = {}) => {
  const messagesState = createMessagesState(initialMessages);

  const hook = renderHook(() => useSwarmOrchestration({
    settings,
    messagesRef: messagesState.messagesRef,
    setMessages: messagesState.setMessages,
    mainAbort,
    orchestratorRef: orchestratorRef as any,
  }));

  return {
    ...hook,
    settings,
    messagesState,
    mainAbort,
    runSwarm,
  };
};

const toRunSwarmCall = (args: any[]) => {
  const [
    settings,
    userInput,
    image,
    imageFile,
    history,
    messageId,
    onMessageUpdate,
    signal,
    onPause,
    onStatusUpdate,
    onSynthesisJump,
    existingWork,
  ] = args;

  return {
    settings,
    userInput,
    image,
    imageFile,
    history,
    messageId,
    onMessageUpdate: onMessageUpdate as (text: string, isFirstChunk: boolean, thought?: string, usage?: TokenUsage | null) => void,
    signal,
    onPause,
    onStatusUpdate,
    onSynthesisJump,
    existingWork,
  };
};

const getRunSwarmCall = (runSwarm: ReturnType<typeof vi.fn>) => toRunSwarmCall(runSwarm.mock.calls[0]);

describe('useSwarmOrchestration', () => {
  beforeEach(() => {
    resetAgentStore();
    vi.clearAllMocks();
    mocks.getFriendlyErrorMessage.mockReturnValue('Friendly failure');
  });

  afterEach(() => {
    resetAgentStore();
  });

  it('ignores empty text when no image is provided', async () => {
    const { result, runSwarm, messagesState, mainAbort } = renderOrchestration();

    await act(async () => {
      await result.current.sendMessage('   ', null, null);
    });

    expect(mocks.generateUUID).not.toHaveBeenCalled();
    expect(mainAbort.create).not.toHaveBeenCalled();
    expect(runSwarm).not.toHaveBeenCalled();
    expect(messagesState.setMessages).not.toHaveBeenCalled();
    expect(useAgentStore.getState().activeSessionMessageId).toBeUndefined();
  });

  it('throws before mutating state when the orchestrator is missing', async () => {
    const mainAbort = createAbortHook();
    const { result, runSwarm, messagesState } = renderOrchestration({
      mainAbort,
      orchestratorRef: { current: null },
    });

    await act(async () => {
      await expect(result.current.sendMessage('hello', null, null)).rejects.toThrow('SwarmOrchestrator not initialized');
    });

    expect(mocks.generateUUID).not.toHaveBeenCalled();
    expect(mainAbort.create).not.toHaveBeenCalled();
    expect(runSwarm).not.toHaveBeenCalled();
    expect(messagesState.setMessages).not.toHaveBeenCalled();
    expect(useAgentStore.getState()).toMatchObject({
      activeSessionMessageId: undefined,
      isLoading: false,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
    expect(mainAbort.ref.current).toBeNull();
  });

  it('sends a new prompt, keeps the model message as a placeholder, and saves final work on success', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-1').mockReturnValueOnce('user-1');
    const imageFile = new File(['image'], 'image.png', { type: 'image/png' });
    const sources: Source[] = [{ uri: 'https://source.test', title: 'Source' }];
    const baseFinalWork = createWork();
    const finalWork = createWork({
      results: {
        ...baseFinalWork.results,
        [`${STEPS.SYNTHESIS}_sources`]: sources,
      },
    });
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { messageId, onMessageUpdate } = toRunSwarmCall(args);

      expect(useAgentStore.getState().abortControllers.has(`main-${messageId}`)).toBe(true);
      useAgentStore.getState().updateSessionAgent(STEPS.INITIAL, 0, 'done', 'Done', messageId);
      onMessageUpdate('streamed answer', true);

      return { text: 'final answer', sources, work: finalWork };
    });

    const { result, messagesState, mainAbort, settings } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', 'data:image/png;base64,abc', imageFile);
    });

    expect(messagesState.messages).toHaveLength(2);
    expect(messagesState.messages[0]).toEqual({
      id: 'user-1',
      role: 'user',
      parts: [{ text: 'hello' }],
      image: 'data:image/png;base64,abc',
    });
    expect(messagesState.messages[1]).toMatchObject({
      id: 'model-1',
      role: 'model',
      parts: [{ text: '' }],
    });
    expect(messagesState.messages[1]).not.toHaveProperty('sources');
    expect(messagesState.messages[1].work).toMatchObject({
      results: finalWork.results,
      agentStates: [
        expect.objectContaining({ messageId: 'model-1', status: 'done' }),
        expect.objectContaining({ messageId: 'model-1', status: 'waiting' }),
      ],
    });

    expect(runSwarm).toHaveBeenCalledTimes(1);
    const runSwarmCall = getRunSwarmCall(runSwarm);
    expect(runSwarmCall.settings).toBe(settings);
    expect(runSwarmCall.userInput).toBe('hello');
    expect(runSwarmCall.image).toBe('data:image/png;base64,abc');
    expect(runSwarmCall.imageFile).toBe(imageFile);
    expect(runSwarmCall.history).toEqual([messagesState.messages[0]]);
    expect(runSwarmCall.messageId).toBe('model-1');
    expect(runSwarmCall.signal).toBe((mainAbort.create as any).mock.results[0].value.signal);
    expect(runSwarmCall.existingWork).toBeUndefined();

    expect(result.current.lastInput).toEqual({
      text: 'hello',
      image: 'data:image/png;base64,abc',
      imageFile,
    });
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
    expect(mainAbort.ref.current).toBeNull();
  });

  it('commits the final message snapshot before clearing the active session on success', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-1').mockReturnValueOnce('user-1');
    const finalWork = createWork({
      results: {
        [STEPS.INITIAL]: ['final draft 1', 'final draft 2'],
        [STEPS.REFINEMENT]: ['final refined 1', 'final refined 2'],
        [STEPS.SYNTHESIS]: ['snapshot handoff answer'],
      },
    });
    const finalAgents = [
      createAgent({ id: 'final-agent-1', messageId: 'model-1', status: 'done', label: 'Done' }),
      createAgent({ id: 'final-agent-2', messageId: 'model-1', agentIndex: 1, name: 'Agent 2', status: 'done', label: 'Done' }),
    ];
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { messageId } = toRunSwarmCall(args);
      useAgentStore.getState().replaceSessionAgents(messageId, finalAgents);

      return { text: 'snapshot handoff answer', sources: [], work: finalWork };
    });
    const { result, messagesState } = renderOrchestration({ runSwarm });
    const setActiveSessionSpy = spyOnActiveSessionClear(() => {
      expect(messagesState.messages[1]).toMatchObject({
        id: 'model-1',
        work: {
          results: finalWork.results,
          agentStates: finalAgents,
        },
      });
    });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    expect(setActiveSessionSpy).toHaveBeenCalledWith(undefined);
  });

  it('persists a paused partial run and continues through an explicit session snapshot', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-1').mockReturnValueOnce('user-1');
    const pausedAgents = [
      createAgent({ id: 'model-1-initial-0', agentIndex: 0, status: 'done', label: 'Drafted' }),
      createAgent({ id: 'model-1-initial-1', agentIndex: 1, status: 'done', label: 'Drafted', name: 'Agent 2' }),
    ];
    const pausedWork = createWork({
      results: {
        [STEPS.INITIAL]: ['partial draft'],
        [STEPS.REFINEMENT]: [],
        [STEPS.SYNTHESIS]: [''],
      },
      agentStates: pausedAgents,
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done' },
        { id: STEPS.SYNTHESIS, status: 'pending' },
      ],
    });
    const finalWork = createWork();
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { messageId } = toRunSwarmCall(args);

      if (runSwarm.mock.calls.length === 1) {
        useAgentStore.getState().replaceSessionAgents(messageId, pausedAgents);
        return { text: '', sources: [], work: pausedWork, paused: true };
      }

      expect(useAgentStore.getState().sessionsByMessageId[messageId]?.agentStates).toEqual(pausedAgents);
      return { text: 'final answer', sources: [], work: finalWork, paused: false };
    });
    const { result, messagesState } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    expect(useAgentStore.getState()).toMatchObject({
      isLoading: true,
      isPaused: true,
      activeSessionMessageId: 'model-1',
    });
    expect(useAgentStore.getState().sessionsByMessageId['model-1']?.work).toEqual(pausedWork);
    expect(messagesState.messages[1]).toMatchObject({
      id: 'model-1',
      work: expect.objectContaining({ results: pausedWork.results }),
    });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(runSwarm).toHaveBeenCalledTimes(2);
    const resumeCall = toRunSwarmCall(runSwarm.mock.calls[1]);
    expect(resumeCall.messageId).toBe('model-1');
    expect(resumeCall.existingWork).toMatchObject(pausedWork);
    expect(resumeCall.existingWork?.agentStates).toEqual(pausedAgents);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
    });
  });

  it('does nothing when retry() is called before any successful input is captured', () => {
    const { result, runSwarm, messagesState } = renderOrchestration();

    act(() => {
      result.current.retry();
    });

    expect(runSwarm).not.toHaveBeenCalled();
    expect(messagesState.setMessages).not.toHaveBeenCalled();
  });

  it('does not resume when there is no model message with work', async () => {
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'answer without work' }] },
    ];
    const { result, runSwarm } = renderOrchestration({ initialMessages });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(runSwarm).not.toHaveBeenCalled();
  });

  it('does not resume when synthesis is already complete or when no triggering user exists', async () => {
    const completedMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'complete' }] },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: 'done' }],
        work: createWork({
          stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'done' }],
        }),
      },
    ];
    const completed = renderOrchestration({ initialMessages: completedMessages });

    await act(async () => {
      await completed.result.current.continueGeneration();
    });

    expect(completed.runSwarm).not.toHaveBeenCalled();
    expect(useAgentStore.getState().sessionsByMessageId['model-1']).toBeUndefined();

    const orphanedModelMessages: Message[] = [{
      id: 'orphan-model',
      role: 'model',
      parts: [{ text: 'partial' }],
      work: createWork({
        stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
      }),
    }];
    const missingUser = renderOrchestration({ initialMessages: orphanedModelMessages });

    await act(async () => {
      await missingUser.result.current.continueGeneration();
    });

    expect(missingUser.runSwarm).not.toHaveBeenCalled();
    expect(useAgentStore.getState().sessionsByMessageId['orphan-model']).toBeUndefined();
  });

  it('retries with the last input, replaces the trailing model message, and reuses the resolved session snapshot', async () => {
    mocks.generateUUID
      .mockReturnValueOnce('model-1')
      .mockReturnValueOnce('user-1')
      .mockReturnValueOnce('model-2');
    const firstWork = createWork({
      results: {
        [STEPS.INITIAL]: ['failed draft 1', 'failed draft 2'],
        [STEPS.REFINEMENT]: ['failed refined 1', 'failed refined 2'],
        [STEPS.SYNTHESIS]: ['failed answer'],
      },
      agentStates: [
        createAgent({ id: 'failed-agent-1', messageId: 'model-1', status: 'error', label: 'Failed' }),
        createAgent({ id: 'failed-agent-2', messageId: 'model-1', agentIndex: 1, status: 'error', label: 'Failed', name: 'Agent 2' }),
      ],
    });
    const secondWork = createWork({
      results: {
        [STEPS.INITIAL]: ['retry draft 1', 'retry draft 2'],
        [STEPS.REFINEMENT]: ['retry refined 1', 'retry refined 2'],
        [STEPS.SYNTHESIS]: ['retried answer'],
      },
    });
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { messageId, onMessageUpdate } = toRunSwarmCall(args);
      onMessageUpdate(`stream-${runSwarm.mock.calls.length}`, true);

      if (runSwarm.mock.calls.length === 1) {
        useAgentStore.getState().replaceSessionAgents(messageId, firstWork.agentStates ?? []);
      }

      return {
        text: `final-${runSwarm.mock.calls.length}`,
        sources: [],
        work: runSwarm.mock.calls.length === 1 ? firstWork : secondWork,
      };
    });
    const { result, messagesState } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    useAgentStore.getState().clearSession('model-1');

    expect(messagesState.messages).toHaveLength(2);
    expect(messagesState.messages[1]).toMatchObject({ id: 'model-1', role: 'model' });

    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runSwarm).toHaveBeenCalledTimes(2);
    const retryCall = toRunSwarmCall(runSwarm.mock.calls[1]);
    expect(retryCall.userInput).toBe('hello');
    expect(retryCall.image).toBeNull();
    expect(retryCall.imageFile).toBeNull();
    expect(retryCall.history).toEqual([messagesState.messages[0]]);
    expect(retryCall.messageId).toBe('model-2');
    expect(retryCall.existingWork).toMatchObject({
      results: firstWork.results,
      agentStates: [
        expect.objectContaining({ id: 'failed-agent-1', messageId: 'model-2' }),
        expect.objectContaining({ id: 'failed-agent-2', messageId: 'model-2' }),
      ],
    });
    expect(useAgentStore.getState().sessionsByMessageId['model-1']).toBeUndefined();
    expect(useAgentStore.getState().sessionsByMessageId['model-2']).toBeDefined();
    expect(messagesState.messages).toHaveLength(2);
    expect(messagesState.messages[0]).toMatchObject({ id: 'user-1', role: 'user', parts: [{ text: 'hello' }] });
    expect(messagesState.messages[1]).toMatchObject({ id: 'model-2', role: 'model' });
  });

  it('resumes an incomplete model message using history before that message', async () => {
    const existingWork = createWork({
      results: {
        [STEPS.INITIAL]: ['partial draft'],
        [STEPS.REFINEMENT]: [],
        [STEPS.SYNTHESIS]: [''],
      },
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done' },
        { id: STEPS.SYNTHESIS, status: 'pending' },
      ],
      agentStates: [createAgent({ id: 'old-agent', messageId: 'old-model', status: 'done' })],
    });
    const initialMessages: Message[] = [
      { id: 'older-user', role: 'user', parts: [{ text: 'older question' }] },
      { id: 'older-model', role: 'model', parts: [{ text: '' }], work: createWork({ results: { [STEPS.SYNTHESIS]: ['older answer'] } }) },
      { id: 'resume-user', role: 'user', parts: [{ text: 'resume' }, { text: 'please' }], image: 'image-url' },
      { id: 'resume-model', role: 'model', parts: [{ text: '' }], work: existingWork },
    ];
    const resumedWork = createWork();
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { onMessageUpdate } = toRunSwarmCall(args);
      onMessageUpdate('resumed stream', false);
      return { text: 'resumed final', sources: [], work: resumedWork };
    });
    const { result, messagesState } = renderOrchestration({ initialMessages, runSwarm });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(runSwarm).toHaveBeenCalledTimes(1);
    const runSwarmCall = getRunSwarmCall(runSwarm);
    expect(runSwarmCall.userInput).toBe('resume please');
    expect(runSwarmCall.image).toBe('image-url');
    expect(runSwarmCall.imageFile).toBeNull();
    expect(runSwarmCall.history).toEqual(initialMessages.slice(0, 3));
    expect(runSwarmCall.messageId).toBe('resume-model');
    expect(runSwarmCall.existingWork).toMatchObject({
      results: existingWork.results,
      stepMetadata: existingWork.stepMetadata,
      agentStates: [expect.objectContaining({ id: 'old-agent', messageId: 'resume-model' })],
    });
    expect(messagesState.messages[3]).toMatchObject({
      id: 'resume-model',
      parts: [{ text: '' }],
      work: expect.objectContaining({
        results: resumedWork.results,
        agentStates: [expect.objectContaining({ id: 'old-agent', messageId: 'resume-model' })],
      }),
    });
  });

  it('preserves live session agent states when resumed work returns a stale agentStates snapshot', async () => {
    const staleAgents = [
      createAgent({ id: 'resume-agent-1', messageId: 'resume-model', status: 'done', label: 'Drafted' }),
      createAgent({ id: 'resume-agent-2', messageId: 'resume-model', agentIndex: 1, status: 'waiting', label: 'Waiting...', name: 'Agent 2' }),
    ];
    const existingWork = createWork({
      results: {
        [STEPS.INITIAL]: ['partial draft'],
        [STEPS.REFINEMENT]: [],
        [STEPS.SYNTHESIS]: [''],
      },
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done' },
        { id: STEPS.SYNTHESIS, status: 'pending' },
      ],
      agentStates: staleAgents,
    });
    const liveAgents = [
      createAgent({ id: 'resume-agent-1', messageId: 'resume-model', status: 'done', label: 'Done' }),
      createAgent({ id: 'resume-agent-2', messageId: 'resume-model', agentIndex: 1, status: 'done', label: 'Done', name: 'Agent 2' }),
    ];
    const initialMessages: Message[] = [
      { id: 'resume-user', role: 'user', parts: [{ text: 'resume' }] },
      { id: 'resume-model', role: 'model', parts: [{ text: 'partial answer' }], work: existingWork },
    ];
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { messageId, onMessageUpdate } = toRunSwarmCall(args);
      onMessageUpdate('resumed stream', false);
      useAgentStore.getState().replaceSessionAgents(messageId, liveAgents);

      return {
        text: 'resumed final',
        sources: [],
        work: createWork({
          stepMetadata: [
            { id: STEPS.INITIAL, status: 'done' },
            { id: STEPS.SYNTHESIS, status: 'done' },
          ],
          agentStates: staleAgents,
        }),
      };
    });
    const { result, messagesState } = renderOrchestration({ initialMessages, runSwarm });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(useAgentStore.getState().sessionsByMessageId['resume-model']?.agentStates).toEqual(liveAgents);
    expect(messagesState.messages[1].work?.agentStates).toEqual(liveAgents);
  });

  it('keeps resumed synthesis text in work instead of message parts', async () => {
    const existingWork = createWork({
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
      results: {
        [STEPS.INITIAL]: ['draft'],
        [STEPS.REFINEMENT]: ['refined'],
        [STEPS.SYNTHESIS]: ['partial answer'],
      },
    });
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'continue' }] },
      { id: 'model-1', role: 'model', parts: [{ text: '' }], work: existingWork },
    ];
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { onMessageUpdate } = toRunSwarmCall(args);
      onMessageUpdate('', false, 'thinking');
      return { text: 'final answer', sources: [], work: createWork() };
    });
    const { result, messagesState } = renderOrchestration({ initialMessages, runSwarm });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(messagesState.messages[1].parts[0].text).toBe('');
    expect(messagesState.messages[1].work?.results?.[STEPS.SYNTHESIS]).toEqual(['final answer']);
  });

  it('reuses lastInput.imageFile during resume only when the image matches the triggering user message', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-1').mockReturnValueOnce('user-1');
    const imageFile = new File(['image'], 'resume.png', { type: 'image/png' });
    const incompleteWork = createWork({
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
      results: {
        [STEPS.INITIAL]: ['partial draft'],
        [STEPS.REFINEMENT]: [],
        [STEPS.SYNTHESIS]: [''],
      },
    });
    const runSwarm = vi.fn(async () => {
      if (runSwarm.mock.calls.length === 1) {
        return { text: 'partial', sources: [], work: incompleteWork };
      }

      return { text: 'resumed', sources: [], work: createWork() };
    });
    const { result } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', 'image-url', imageFile);
    });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(runSwarm).toHaveBeenCalledTimes(2);
    expect(toRunSwarmCall(runSwarm.mock.calls[1]).imageFile).toBe(imageFile);
  });

  it('does nothing when continueGeneration falls back to an empty message list', async () => {
    const { result, runSwarm, messagesState } = renderOrchestration({
      initialMessages: [{ id: 'user-1', role: 'user', parts: [{ text: 'hello' }] }],
    });
    messagesState.messagesRef.current = null as any;

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(runSwarm).not.toHaveBeenCalled();
  });

  it('clears lastInput.imageFile during resume when the triggering user image no longer matches', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-1').mockReturnValueOnce('user-1');
    const imageFile = new File(['image'], 'resume-mismatch.png', { type: 'image/png' });
    const incompleteWork = createWork({
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
      results: {
        [STEPS.INITIAL]: ['partial draft'],
        [STEPS.REFINEMENT]: [],
        [STEPS.SYNTHESIS]: [''],
      },
    });
    const runSwarm = vi.fn(async () => {
      return runSwarm.mock.calls.length === 1
        ? { text: 'partial', sources: [], work: incompleteWork }
        : { text: 'resumed', sources: [], work: createWork() };
    });
    const { result, messagesState } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', 'stored-image', imageFile);
    });

    act(() => {
      messagesState.setMessages((prev) => prev.map((message) => (
        message.id === 'user-1'
          ? { ...message, image: 'different-image' }
          : message
      )));
    });

    await act(async () => {
      await result.current.continueGeneration();
    });

    expect(runSwarm).toHaveBeenCalledTimes(2);
    expect(toRunSwarmCall(runSwarm.mock.calls[1]).imageFile).toBeNull();
  });

  it('stops the current generation through the centralized abort registry and marks message work as stopped', () => {
    const currentWork = createWork();
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'partial' }], work: currentWork },
    ];
    const { result, messagesState } = renderOrchestration({ initialMessages });
    const store = useAgentStore.getState();

    store.startSession('model-1', currentWork, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
    });
    store.registerAbortController('main-model-1', controller);

    act(() => {
      result.current.stopGeneration();
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
      loadingStatus: '',
    });
    expect(useAgentStore.getState().sessionsByMessageId['model-1']?.work).toEqual(expect.objectContaining({ isStopped: true }));
    expect(messagesState.messages[1].work).toEqual(expect.objectContaining({
      isStopped: true,
      results: currentWork.results,
      stepMetadata: currentWork.stepMetadata,
    }));
  });

  it('commits a stopped session snapshot even when the session has no completed work', () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'partial' }] },
    ];
    const { result, messagesState } = renderOrchestration({ initialMessages });
    const store = useAgentStore.getState();

    store.startSession('model-1', { results: {} }, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
    });
    store.registerAbortController('main-model-1', controller);

    act(() => {
      result.current.stopGeneration();
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(messagesState.messages[1].work).toEqual({ results: {}, isStopped: true, agentStates: [] });
    expect(useAgentStore.getState().activeSessionMessageId).toBeUndefined();
  });

  it('commits the stopped snapshot before clearing the active session', () => {
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'partial' }] },
    ];
    const { result, messagesState } = renderOrchestration({ initialMessages });
    const setActiveSessionSpy = spyOnActiveSessionClear(() => {
      expect(messagesState.messages[1].work).toEqual({ results: {}, isStopped: true, agentStates: [] });
    });

    useAgentStore.getState().startSession('model-1', { results: {} }, {
      status: 'paused',
      isLoading: true,
      isPaused: true,
    });

    act(() => {
      result.current.stopGeneration();
    });

    expect(setActiveSessionSpy).toHaveBeenCalledWith(undefined);
  });

  it('adds a placeholder model message when resuming a message id that is not in history', async () => {
    const existingWork = createWork({
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
      agentStates: [],
    });
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
    ];
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { onMessageUpdate } = toRunSwarmCall(args);
      onMessageUpdate('streamed after missing resume id', true);
      return { text: 'final', sources: [], work: createWork() };
    });
    const { result, messagesState } = renderOrchestration({ initialMessages, runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello again', null, null, {
        resumeMessageId: 'missing-resume-id',
        existingWork,
      });
    });

    const resumeCall = getRunSwarmCall(runSwarm);
    expect(resumeCall.history).toEqual(initialMessages);
    expect(messagesState.messages).toEqual([
      initialMessages[0],
      expect.objectContaining({
        id: 'missing-resume-id',
        role: 'model',
        parts: [{ text: '' }],
        work: expect.objectContaining({ results: createWork().results }),
      }),
    ]);
  });

  it('keeps the last non-model message in retry history and omits failedWork when retrying after a user tail message', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-1').mockReturnValueOnce('user-1').mockReturnValueOnce('model-2');
    const runSwarm = vi.fn(async () => ({ text: 'final', sources: [], work: createWork() }));
    const { result, messagesState } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    act(() => {
      messagesState.setMessages(prev => [...prev, { id: 'user-tail', role: 'user', parts: [{ text: 'follow up' }] }]);
      result.current.retry();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const retryCall = toRunSwarmCall(runSwarm.mock.calls[1]);
    expect(retryCall.history).toEqual(messagesState.messages.slice(0, -1));
    expect(retryCall.existingWork).toBeUndefined();
    expect(messagesState.messages[messagesState.messages.length - 1]).toMatchObject({ id: 'model-2', role: 'model' });
  });

  it('handles aborted swarm runs as user cancellation and returns early from catch cleanup', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-aborted').mockReturnValueOnce('user-aborted');
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { onPause, onSynthesisJump } = toRunSwarmCall(args);
      onPause();
      onSynthesisJump();
      throw new Error('Aborted');
    });
    const { result, mainAbort } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      loadingStatus: '',
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
    expect(mainAbort.ref.current).toBeNull();
  });

  it('stops without mutating message history when there is no current message id', () => {
    const currentWork = createWork();
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'partial' }], work: currentWork },
    ];
    const { result, messagesState } = renderOrchestration({ initialMessages });
    const store = useAgentStore.getState();

    store.registerAbortController('main-model-1', controller);

    act(() => {
      result.current.stopGeneration();
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(messagesState.messages[1].work).toBe(currentWork);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
      loadingStatus: '',
    });
  });

  it('persists error agent states and delegates partial failures to the send-message error handler', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-error').mockReturnValueOnce('user-error');
    const partialWork = createWork({
      results: {
        [STEPS.INITIAL]: ['partial draft', ''],
        [STEPS.REFINEMENT]: [],
        [STEPS.SYNTHESIS]: [''],
      },
    });
    const failure = new Error('network failed');
    const runSwarm = vi.fn(async () => {
      useAgentStore.getState().replaceSessionWork('model-error', partialWork);
      throw failure;
    });
    const { result, messagesState, mainAbort } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    expect(mocks.getFriendlyErrorMessage).toHaveBeenCalledWith(failure);
    expect(messagesState.messages[1]).toMatchObject({
      id: 'model-error',
      role: 'model',
      work: expect.objectContaining({
        results: partialWork.results,
        agentStates: [
          expect.objectContaining({ messageId: 'model-error', status: 'error', label: 'Failed' }),
          expect.objectContaining({ messageId: 'model-error', status: 'error', label: 'Failed' }),
        ],
      }),
    });
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: true,
      isPaused: true,
      loadingStatus: 'Error: Friendly failure',
      error: 'Friendly failure',
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
    expect(mainAbort.ref.current).toBeNull();
  });

  it('clears stale work-owned synthesis sources when resumed synthesis fails', async () => {
    const staleSources: Source[] = [{ uri: 'https://stale-source.test', title: 'Stale Source' }];
    const existingWork = createWork({
      results: {
        [STEPS.INITIAL]: ['draft 1', 'draft 2'],
        [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
        [STEPS.SYNTHESIS]: ['old final answer'],
        [`${STEPS.SYNTHESIS}_sources`]: staleSources,
      },
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
    });
    const initialMessages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'hello' }] },
      { id: 'model-1', role: 'model', parts: [{ text: '' }], work: existingWork },
    ];
    const failure = new Error('network failed');
    const failedWork = createWork({
      results: {
        [STEPS.INITIAL]: ['draft 1', 'draft 2'],
        [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
        [STEPS.SYNTHESIS]: ['partial answer'],
        [`${STEPS.SYNTHESIS}_error`]: { flag: true, message: 'Friendly failure' },
      },
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'error' }],
    });
    const runSwarm = vi.fn(async () => {
      useAgentStore.getState().replaceSessionWork('model-1', failedWork);
      throw failure;
    });
    const { result, messagesState } = renderOrchestration({ initialMessages, runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null, {
        resumeMessageId: 'model-1',
        existingWork,
      });
    });

    expect(messagesState.messages[1]).not.toHaveProperty('sources');
    expect(messagesState.messages[1].work?.results?.[`${STEPS.SYNTHESIS}_sources`]).toBeUndefined();
    expect(messagesState.messages[1].work?.results?.[`${STEPS.SYNTHESIS}_error`]).toEqual({
      flag: true,
      message: 'Friendly failure',
    });
  });

  it('surfaces a total failure while preserving a real failure snapshot for retry/debug flows', async () => {
    mocks.generateUUID.mockReturnValueOnce('model-total-failure').mockReturnValueOnce('user-total-failure');
    const failure = new Error('network failed');
    const errorAgents = [
      createAgent({ id: 'failed-agent-1', messageId: 'model-total-failure', status: 'error', label: 'Failed' }),
      createAgent({ id: 'failed-agent-2', messageId: 'model-total-failure', agentIndex: 1, status: 'error', label: 'Failed', name: 'Agent 2' }),
    ];
    const failedWork: Work = {
      results: {
        [STEPS.INITIAL]: ['', ''],
        [`${STEPS.INITIAL}_error_counts`]: [1, 1],
      },
    };
    const runSwarm = vi.fn(async () => {
      useAgentStore.getState().replaceSessionWork('model-total-failure', failedWork);
      useAgentStore.getState().replaceSessionAgents('model-total-failure', errorAgents);
      throw failure;
    });
    const { result, messagesState, mainAbort } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    expect(mocks.getFriendlyErrorMessage).toHaveBeenCalledWith(failure);
    expect(useAgentStore.getState()).toMatchObject({
      isLoading: false,
      isPaused: false,
      activeSessionMessageId: undefined,
      error: 'Friendly failure',
    });
    expect(messagesState.messages[1]).toMatchObject({
      id: 'model-total-failure',
      role: 'model',
    });
    expect(messagesState.messages[1].work).toMatchObject({
      results: failedWork.results,
      agentStates: errorAgents,
    });
    expect(useAgentStore.getState().abortControllers.size).toBe(0);
    expect(mainAbort.ref.current).toBeNull();
  });

  it('retries a total failure from the committed failure snapshot so persistent error counts do not reset', async () => {
    mocks.generateUUID
      .mockReturnValueOnce('model-total-failure')
      .mockReturnValueOnce('user-total-failure')
      .mockReturnValueOnce('model-total-retry');
    const failure = new Error('network failed');
    const failedAgents = [
      createAgent({ id: 'failed-agent-1', messageId: 'model-total-failure', status: 'error', label: 'Failed' }),
      createAgent({ id: 'failed-agent-2', messageId: 'model-total-failure', agentIndex: 1, status: 'error', label: 'Failed', name: 'Agent 2' }),
    ];
    const failedWork: Work = {
      results: {
        [STEPS.INITIAL]: ['', ''],
        [`${STEPS.INITIAL}_error_counts`]: [1, 1],
      },
      agentStates: failedAgents,
    };
    const recoveredWork = createWork({
      results: {
        [STEPS.INITIAL]: ['retry draft 1', 'retry draft 2'],
        [STEPS.REFINEMENT]: ['retry refined 1', 'retry refined 2'],
        [STEPS.SYNTHESIS]: ['retried answer'],
      },
    });
    const runSwarm = vi.fn(async (...args: any[]) => {
      const { messageId } = toRunSwarmCall(args);

      if (runSwarm.mock.calls.length === 1) {
        useAgentStore.getState().replaceSessionWork(messageId, failedWork);
        useAgentStore.getState().replaceSessionAgents(messageId, failedAgents);
        throw failure;
      }

      return {
        text: 'retried answer',
        sources: [],
        work: recoveredWork,
      };
    });
    const { result } = renderOrchestration({ runSwarm });

    await act(async () => {
      await result.current.sendMessage('hello', null, null);
    });

    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const retryCall = toRunSwarmCall(runSwarm.mock.calls[1]);
    expect(retryCall.messageId).toBe('model-total-retry');
    expect(retryCall.existingWork).toMatchObject({
      results: failedWork.results,
      agentStates: [
        expect.objectContaining({ id: 'failed-agent-1', messageId: 'model-total-retry' }),
        expect.objectContaining({ id: 'failed-agent-2', messageId: 'model-total-retry' }),
      ],
    });
  });
});
