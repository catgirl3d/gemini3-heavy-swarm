import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { ProviderType, Work } from '@/types';
import { STEPS } from '@/types/steps';

const mocks = vi.hoisted(() => ({
  appSettingsReturn: {} as any,
  messagesReturn: {} as any,
  mainAbort: {} as any,
  regenAbort: {} as any,
  orchestrationReturn: {} as any,
  regenerationReturn: {} as any,
  storeState: {} as any,
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

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector: (state: any) => unknown) => selector(mocks.storeState),
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

describe('useGeminiSwarm', () => {
  beforeEach(() => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      apiKey: '',
      openRouterApiKey: '',
      openRouterModel: '',
    });
    const messages = [{ id: 'm1', role: 'user', parts: [{ text: 'hello' }] }] as any;
    const currentWork: Work = { results: { [STEPS.SYNTHESIS]: { text: 'done' } } };

    mocks.appSettingsReturn = {
      settings,
      settingsLoaded: true,
      setSettings: vi.fn(),
      resetSettings: vi.fn(),
      loadError: 'load error',
      clearLoadError: vi.fn(),
    };
    mocks.messagesReturn = {
      messages,
      setMessages: vi.fn(),
      messagesRef: { current: messages },
    };
    mocks.mainAbort = { ref: { current: null }, create: vi.fn(), abort: vi.fn(), signal: undefined };
    mocks.regenAbort = { ref: { current: null }, create: vi.fn(), abort: vi.fn(), signal: undefined };
    mocks.orchestrationReturn = {
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      retry: vi.fn(),
      continueGeneration: vi.fn(),
      lastInput: { text: 'hello', image: null, imageFile: null },
    };
    mocks.regenerationReturn = {
      regenerateAgentResponse: vi.fn(),
    };
    mocks.storeState = {
      agents: [{ id: 'agent-1', name: 'Agent 1', status: 'working', label: 'Working' }],
      currentWork,
      isLoading: true,
      isPaused: false,
      loadingStatus: 'Loading...',
      error: 'boom',
      currentMessageId: 'message-1',
    };

    mocks.factoryCreate.mockReset().mockImplementation((currentSettings) => ({
      providerKey: [
        currentSettings.provider,
        currentSettings.apiKey,
        currentSettings.openRouterApiKey,
        currentSettings.openRouterModel,
      ].join('|'),
    }));
    mocks.useAbortController.mockReset()
      .mockReturnValueOnce(mocks.mainAbort)
      .mockReturnValueOnce(mocks.regenAbort);
    mocks.useSwarmOrchestration.mockReset().mockReturnValue(mocks.orchestrationReturn);
    mocks.useSwarmRegeneration.mockReset().mockReturnValue(mocks.regenerationReturn);
    mocks.orchestratorCtor.mockReset();
  });

  it('exposes composed state/actions and wires dependencies into child hooks', async () => {
    const { result } = renderHook(() => useGeminiSwarm());

    expect(result.current.messages).toBe(mocks.messagesReturn.messages);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.loadingStatus).toBe('Loading...');
    expect(result.current.agentStates).toBe(mocks.storeState.agents);
    expect(result.current.currentWork).toBe(mocks.storeState.currentWork);
    expect(result.current.settings).toBe(mocks.appSettingsReturn.settings);
    expect(result.current.settingsLoaded).toBe(true);
    expect(result.current.error).toBe('boom');
    expect(result.current.currentMessageId).toBe('message-1');
    expect(result.current.loadError).toBe('load error');
    expect(result.current.setSettings).toBe(mocks.appSettingsReturn.setSettings);
    expect(result.current.resetSettings).toBe(mocks.appSettingsReturn.resetSettings);
    expect(result.current.clearLoadError).toBe(mocks.appSettingsReturn.clearLoadError);
    expect(result.current.sendMessage).toBe(mocks.orchestrationReturn.sendMessage);
    expect(result.current.stopGeneration).toBe(mocks.orchestrationReturn.stopGeneration);
    expect(result.current.retry).toBe(mocks.orchestrationReturn.retry);
    expect(result.current.continueGeneration).toBe(mocks.orchestrationReturn.continueGeneration);

    const orchestrationArgs = mocks.useSwarmOrchestration.mock.calls[0][0];
    result.current.regenerateAgentResponse('msg-7', STEPS.REFINEMENT, 2);
    expect(mocks.regenerationReturn.regenerateAgentResponse).toHaveBeenCalledExactlyOnceWith(
      'msg-7',
      STEPS.REFINEMENT,
      2,
      orchestrationArgs.pauseResolverRef
    );

    expect(orchestrationArgs.settings).toBe(mocks.appSettingsReturn.settings);
    expect(orchestrationArgs.messagesRef).toBe(mocks.messagesReturn.messagesRef);
    expect(orchestrationArgs.setMessages).toBe(mocks.messagesReturn.setMessages);
    expect(orchestrationArgs.mainAbort).toBe(mocks.mainAbort);
    expect(orchestrationArgs.regenAbort).toBe(mocks.regenAbort);
    expect(orchestrationArgs.pauseResolverRef.current).toBeNull();
    expect(orchestrationArgs.orchestratorRef.current).toBeDefined();

    const regenerationArgs = mocks.useSwarmRegeneration.mock.calls[0][0];
    expect(regenerationArgs.settings).toBe(mocks.appSettingsReturn.settings);
    expect(regenerationArgs.messages).toBe(mocks.messagesReturn.messages);
    expect(regenerationArgs.messagesRef).toBe(mocks.messagesReturn.messagesRef);
    expect(regenerationArgs.setMessages).toBe(mocks.messagesReturn.setMessages);
    expect(regenerationArgs.currentWork).toBe(mocks.storeState.currentWork);
    expect(regenerationArgs.currentMessageId).toBe('message-1');
    expect(regenerationArgs.lastInput).toBe(mocks.orchestrationReturn.lastInput);

    await waitFor(() => {
      expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(1);
    });
  });

  it('does not recreate the provider for unrelated settings changes but does for provider dependencies', async () => {
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
      apiKey: 'new-key',
    };
    rerender();

    expect(mocks.factoryCreate).toHaveBeenCalledTimes(2);
    expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(2);
  });

  it('replaces the orchestrator when the provider changes', async () => {
    const { rerender } = renderHook(() => useGeminiSwarm());

    await waitFor(() => {
      expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(1);
    });

    const firstProvider = mocks.orchestratorCtor.mock.calls[0][0];

    mocks.appSettingsReturn.settings = {
      ...mocks.appSettingsReturn.settings,
      provider: ProviderType.OpenRouter,
      openRouterApiKey: 'or-key',
      openRouterModel: 'openai/gpt-4o',
    };
    rerender();

    await waitFor(() => {
      expect(mocks.orchestratorCtor).toHaveBeenCalledTimes(2);
    });

    expect(mocks.orchestratorCtor.mock.calls[1][0]).not.toEqual(firstProvider);
  });
});
