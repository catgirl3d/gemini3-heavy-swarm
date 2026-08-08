import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSettings } from '@test/settingsMocks';
import { useAgentStore } from '@/stores/agentStore';
import { ProviderType, type Work } from '@/types';
import { STEPS } from '@/types/steps';

const mocks = vi.hoisted(() => ({
  appSettingsReturn: {} as ReturnType<typeof createAppSettingsState>,
  messagesReturn: {} as ReturnType<typeof createMessagesState>,
  mainAbort: {} as { ref: { current: AbortController | null }; create: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn>; signal: AbortSignal | undefined },
  orchestrationReturn: {} as {
    sendMessage: ReturnType<typeof vi.fn>;
    stopGeneration: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    continueGeneration: ReturnType<typeof vi.fn>;
    skipStep: ReturnType<typeof vi.fn>;
    lastInput: { text: string; image: string | null; imageFile: File | null } | null;
  },
  regenerationReturn: {} as {
    regenerateAgentResponse: ReturnType<typeof vi.fn>;
  },
  factoryCreate: vi.fn(),
  useAbortController: vi.fn(),
  useSwarmOrchestration: vi.fn(),
  useSwarmRegeneration: vi.fn(),
  orchestratorCtor: vi.fn(),
}));

vi.mock('@/hooks/state/useAppSettings', () => ({
  useAppSettings: () => mocks.appSettingsReturn,
}));

vi.mock('@/hooks/state/useMessages', () => ({
  useMessages: () => mocks.messagesReturn,
}));

vi.mock('@/hooks/network/useAbortController', () => ({
  useAbortController: mocks.useAbortController,
}));

vi.mock('@/hooks/swarm/useSwarmOrchestration', () => ({
  useSwarmOrchestration: mocks.useSwarmOrchestration,
}));

vi.mock('@/hooks/swarm/useSwarmRegeneration', () => ({
  useSwarmRegeneration: mocks.useSwarmRegeneration,
}));

vi.mock('@/services/ai', () => ({
  AiProviderFactory: {
    create: mocks.factoryCreate,
  },
}));

vi.mock('@/services/swarm/SwarmOrchestrator', () => ({
  SwarmOrchestrator: class {
    provider: unknown;

    constructor(provider: unknown) {
      this.provider = provider;
      mocks.orchestratorCtor(provider);
    }
  },
}));

import { useGeminiSwarm } from '@/hooks/core/useGeminiSwarm';

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

function createAppSettingsState() {
  return {
    settings: createMockSettings({
      provider: ProviderType.Gemini,
      apiKey: '',
      openRouterApiKey: '',
      openRouterModel: '',
    }),
    settingsLoaded: true,
    setSettings: vi.fn(),
    resetSettings: vi.fn(),
    loadError: 'load error',
    clearLoadError: vi.fn(),
  };
}

function createMessagesState() {
  const messages = [{ id: 'm1', role: 'user', parts: [{ text: 'hello' }] }] as const;
  return {
    messages: [...messages],
    setMessages: vi.fn(),
    messagesRef: { current: [...messages] },
  };
}

const createAbortHook = () => ({
  ref: { current: null as AbortController | null },
  create: vi.fn(() => {
    const controller = new AbortController();
    return controller;
  }),
  abort: vi.fn(),
  signal: undefined,
});

describe('useGeminiSwarm state projection and provider memoization', () => {
  beforeEach(() => {
    resetAgentStore();
    vi.clearAllMocks();

    mocks.appSettingsReturn = createAppSettingsState();
    mocks.messagesReturn = createMessagesState();
    mocks.mainAbort = createAbortHook();
    mocks.orchestrationReturn = {
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      retry: vi.fn(),
      continueGeneration: vi.fn(),
      skipStep: vi.fn(),
      lastInput: { text: 'hello', image: null, imageFile: null },
    };
    mocks.regenerationReturn = {
      regenerateAgentResponse: vi.fn(),
    };
    mocks.factoryCreate.mockReset().mockImplementation((currentSettings) => ({
      providerKey: [
        currentSettings.provider,
        currentSettings.apiKey,
        currentSettings.openRouterApiKey,
        currentSettings.openRouterModel,
      ].join('|'),
    }));
    mocks.useAbortController.mockReset().mockReturnValue(mocks.mainAbort);
    mocks.useSwarmOrchestration.mockReset().mockReturnValue(mocks.orchestrationReturn);
    mocks.useSwarmRegeneration.mockReset().mockReturnValue(mocks.regenerationReturn);
    mocks.orchestratorCtor.mockReset();
  });

  it('derives public UI state from the real agent store session selector', async () => {
    const currentWork: Work = { results: { [STEPS.SYNTHESIS]: ['done'] } };
    useAgentStore.getState().startSession('message-1', currentWork, {
      phase: 'running',
      loadingStatus: 'Drafting initial responses...',
    });
    useAgentStore.getState().setGlobalError('boom');

    const { result } = renderHook(() => useGeminiSwarm());

    expect(result.current.messages).toEqual(mocks.messagesReturn.messages);
    expect(result.current.settings).toBe(mocks.appSettingsReturn.settings);
    expect(result.current.settingsLoaded).toBe(true);
    expect(result.current.error).toBe('boom');
    expect(result.current.loadError).toBe('load error');
    expect(result.current.activePhase).toBe('running');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.loadingStatus).toBe('Drafting initial responses...');
    expect(result.current.canStop).toBe(true);
    expect(result.current.canAbortRequest).toBe(true);
    expect(result.current.shouldReadLiveWork).toBe(true);
    expect(result.current.inlineErrorMessage).toBeNull();
    expect(result.current.globalErrorMessage).toBe('boom');

    act(() => {
      useAgentStore.getState().setSessionPhase('message-1', 'recoverable-error', {
        loadingStatus: 'Retry required',
        errorMessage: 'Agent failed',
      });
    });

    await waitFor(() => {
      expect(result.current.activePhase).toBe('recoverable-error');
      expect(result.current.isPaused).toBe(true);
      expect(result.current.inlineErrorMessage).toBe('Agent failed');
      expect(result.current.progressStatusText).toBe('Agent failed');
      expect(result.current.canAbortRequest).toBe(false);
    });
  });

  it('recreates the provider and orchestrator only when provider-defining settings change', async () => {
    const { rerender } = renderHook(() => useGeminiSwarm());

    expect(mocks.factoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(1);

    mocks.appSettingsReturn.settings = {
      ...mocks.appSettingsReturn.settings,
      numAgents: 5,
    };
    rerender();

    expect(mocks.factoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(1);

    mocks.appSettingsReturn.settings = {
      ...mocks.appSettingsReturn.settings,
      provider: ProviderType.OpenRouter,
      openRouterApiKey: 'or-key',
      openRouterModel: 'openai/gpt-4o',
    };
    rerender();

    await waitFor(() => {
      expect(mocks.factoryCreate).toHaveBeenCalledTimes(2);
      expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(2);
    });
  });
});
