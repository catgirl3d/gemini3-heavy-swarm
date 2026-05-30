import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, ServerStatus } from '@/types';
import { ProviderType } from '@/types';
import { createMockSettings } from '@test/settingsMocks';

const mocks = vi.hoisted(() => ({
  useGeminiSwarm: vi.fn(),
  useServerStatus: vi.fn(),
  useAutoScroll: vi.fn(),
  useDynamicFavicon: vi.fn(),
}));

vi.mock('@/hooks/core/useGeminiSwarm', () => ({
  useGeminiSwarm: mocks.useGeminiSwarm,
}));

vi.mock('@/hooks/network/useServerStatus', () => ({
  useServerStatus: mocks.useServerStatus,
}));

vi.mock('@/hooks/ui/useAutoScroll', () => ({
  useAutoScroll: mocks.useAutoScroll,
}));

vi.mock('@/hooks/ui/useDynamicFavicon', () => ({
  useDynamicFavicon: mocks.useDynamicFavicon,
}));

import { App } from '@/App';

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.Gemini,
  apiKey: 'personal-key',
  geminiModel: 'gemini-2.5-flash',
  profiles: [{
    id: 'default',
    name: 'Default',
    initialInstruction: 'Initial prompt',
    refinementInstruction: 'Refinement prompt',
    synthesizerInstruction: 'Synthesis prompt',
  }],
  activeProfileId: 'default',
  roleProfiles: [{
    id: 'role-profile-1',
    name: 'Default Role Set',
    roles: [{ id: 'role-1', name: 'Researcher', instruction: 'Research thoroughly.' }],
    criticRoles: [{ id: 'critic-1', name: 'Critic', instruction: 'Critique thoroughly.' }],
  }],
  activeRoleProfileId: 'role-profile-1',
  savedInstructions: [],
  savedRoles: [],
  ...overrides,
});

const createServerStatus = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  hasServerKey: true,
  hasOpenRouterKey: true,
  proxyMode: 'private',
  isLoaded: true,
  ...overrides,
});

describe('App lazy modal wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useGeminiSwarm.mockReturnValue({
      messages: [],
      loadingStatus: '',
      activePhase: null,
      isInputLocked: false,
      canStartNewPrompt: true,
      canStop: false,
      shouldShowLoadingIndicator: false,
      shouldReadLiveWork: false,
      shouldAutoScrollOnSessionChange: false,
      isPausedForAction: false,
      isTimerActive: false,
      progressStatusText: '',
      inlineErrorMessage: null,
      globalErrorMessage: null,
      settings: createSettings(),
      settingsLoaded: true,
      setSettings: vi.fn(),
      resetSettings: vi.fn(),
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      retry: vi.fn(),
      continueGeneration: vi.fn(),
      skipStep: vi.fn(),
      regenerateAgentResponse: vi.fn(),
      error: null,
      loadError: null,
      clearLoadError: vi.fn(),
    });

    mocks.useServerStatus.mockReturnValue({
      serverStatus: createServerStatus(),
      shouldShowLoadingBanner: false,
      isBannerDismissed: false,
      dismissBanner: vi.fn(),
      isMissingKey: false,
      isProxyDemo: false,
      isProxyPrivate: true,
    });

    mocks.useAutoScroll.mockReturnValue({
      messageListRef: { current: null },
      showScrollButton: false,
      scrollToBottom: vi.fn(),
      setShouldAutoScroll: vi.fn(),
    });
    mocks.useDynamicFavicon.mockImplementation(() => undefined);
  });

  it('loads the real lazy InfoModal and SettingsModal modules when their header actions are clicked', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'How it Works' }));
    expect(await screen.findByText('How it Works')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swarm Settings' }));

    expect(await screen.findByText('Swarm Configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to Defaults' })).toBeInTheDocument();
  });
});
