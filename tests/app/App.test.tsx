import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, AppSettings, Message, ServerStatus, Work } from '@/types';
import { ProviderType } from '@/types';
import { STEPS } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';
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

vi.mock('@/components/modals/SettingsModal', () => ({
  SettingsModal: ({ isOpen, onReset, onShowError, onClose }: {
    isOpen: boolean;
    onReset: () => void;
    onShowError: (message: string) => void;
    onClose: () => void;
  }) => (
    isOpen ? (
      <div data-testid="settings-modal-boundary">
        <button type="button" onClick={onReset}>Reset Through Modal</button>
        <button type="button" onClick={() => onShowError('Settings validation failed')}>Emit Modal Error</button>
        <button type="button" onClick={onClose}>Close Settings</button>
      </div>
    ) : null
  ),
}));

import { App } from '@/App';

type SwarmState = ReturnType<typeof import('@/hooks/core/useGeminiSwarm').useGeminiSwarm>;
type ServerStatusState = ReturnType<typeof import('@/hooks/network/useServerStatus').useServerStatus>;

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.Gemini,
  geminiModel: 'gemini-3-pro-preview',
  debugMode: false,
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
    criticRoles: [{ id: 'critic-1', name: 'Critic', instruction: 'Critique drafts.' }],
  }],
  activeRoleProfileId: 'role-profile-1',
  ...overrides,
});

const createServerStatus = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  hasServerKey: true,
  hasOpenRouterKey: true,
  proxyMode: 'private',
  isLoaded: true,
  ...overrides,
});

const createServerStatusState = (overrides: Partial<ServerStatusState> = {}): ServerStatusState => ({
  serverStatus: createServerStatus(),
  shouldShowLoadingBanner: false,
  isBannerDismissed: false,
  dismissBanner: vi.fn(),
  isMissingKey: false,
  isProxyDemo: false,
  isProxyPrivate: true,
  ...overrides,
});

const createAgentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'done',
  label: 'Completed',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'message-1',
  ...overrides,
});

const createSessionUi = (overrides: Partial<SwarmState['sessionUi']> = {}): SwarmState['sessionUi'] => ({
  activePhase: null,
  hasActiveSession: false,
  isInputLocked: false,
  canStartNewPrompt: true,
  canStop: false,
  canAbortRequest: false,
  shouldShowLoadingIndicator: false,
  shouldReadLiveWork: false,
  shouldAutoScrollOnSessionChange: false,
  isPausedForAction: false,
  isTimerActive: false,
  progressStatusText: 'Idle',
  loadingStatus: 'Idle',
  inlineErrorMessage: null,
  globalErrorMessage: null,
  ...overrides,
});

const createSwarmState = (overrides: Partial<SwarmState> = {}): SwarmState => ({
  messages: [],
  isLoading: false,
  isPaused: false,
  loadingStatus: 'Idle',
  sessionUi: createSessionUi(),
  activePhase: null,
  isInputLocked: false,
  canStartNewPrompt: true,
  canStop: false,
  canAbortRequest: false,
  shouldShowLoadingIndicator: false,
  shouldReadLiveWork: false,
  shouldAutoScrollOnSessionChange: false,
  isPausedForAction: false,
  isTimerActive: false,
  progressStatusText: 'Idle',
  inlineErrorMessage: null,
  globalErrorMessage: null,
  settings: createSettings(),
  settingsLoaded: true,
  error: null,
  loadError: null,
  setSettings: vi.fn(),
  resetSettings: vi.fn(),
  clearLoadError: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  stopGeneration: vi.fn(),
  retry: vi.fn(),
  continueGeneration: vi.fn(),
  skipStep: vi.fn().mockResolvedValue(undefined),
  regenerateAgentResponse: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const renderApp = () => render(<App />);

describe('App', () => {
  let swarmState: SwarmState;

  beforeEach(() => {
    act(() => {
      resetAgentStore();
    });

    vi.clearAllMocks();

    swarmState = createSwarmState();

    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useServerStatus.mockReturnValue(createServerStatusState());
    mocks.useDynamicFavicon.mockImplementation(() => undefined);
    mocks.useAutoScroll.mockReturnValue({
      messageListRef: { current: null },
      showScrollButton: true,
      scrollToBottom: vi.fn(),
      setShouldAutoScroll: vi.fn(),
    });

    class MockFileReader {
      public result: string | null = null;
      public onloadend: null | (() => void) = null;

      readAsDataURL() {
        this.result = 'data:image/png;base64,mocked';
        this.onloadend?.();
      }
    }

    Object.defineProperty(window, 'FileReader', {
      value: MockFileReader,
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => {
      resetAgentStore();
    });

    vi.restoreAllMocks();
  });

  it('renders the real shell, opens the real info modal, opens the mocked settings boundary, reloads home, and wires scroll', async () => {
    const scrollToBottom = vi.fn();
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);

    mocks.useAutoScroll.mockReturnValue({
      messageListRef: { current: null },
      showScrollButton: true,
      scrollToBottom,
      setShouldAutoScroll: vi.fn(),
    });

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'How it Works' }));
    expect(await screen.findByText('How it Works')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Settings' }));
    expect(await screen.findByTestId('settings-modal-boundary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scroll to bottom' }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
    expect(mocks.useDynamicFavicon).toHaveBeenCalledWith(ProviderType.Gemini, 'gemini-3-pro-preview', 'Gemini 3 Pro Swarm');
  });

  it('fills and focuses the real input from the EmptyState example prompt', () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Draft a technical proposal for a multi-agent orchestration layer.' }));

    const input = screen.getByRole('textbox', { name: 'User input' });
    expect(input).toHaveValue('Draft a technical proposal for a multi-agent orchestration layer.');
    expect(input).toHaveFocus();
  });

  it('submits text through the real InputArea and clears the textbox', async () => {
    renderApp();

    const input = screen.getByRole('textbox', { name: 'User input' });
    fireEvent.change(input, { target: { value: 'Hello swarm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(swarmState.sendMessage).toHaveBeenCalledWith('Hello swarm', null, null);
    });

    expect(input).toHaveValue('');
  });

  it('rejects oversized images and supports real image attach, remove, and submit flows', async () => {
    const { container } = renderApp();
    const fileInput = container.querySelector('input[type="file"]');

    expect(fileInput).not.toBeNull();

    const largeFile = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [largeFile] } });

    expect(await screen.findByText('File size exceeds 4MB limit.')).toBeInTheDocument();
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();

    const smallFile = new File(['tiny'], 'small.png', { type: 'image/png' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [smallFile] } });

    expect(await screen.findByAltText('Preview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();

    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [smallFile] } });
    fireEvent.change(screen.getByRole('textbox', { name: 'User input' }), { target: { value: 'Hello with image' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(swarmState.sendMessage).toHaveBeenCalledWith('Hello with image', 'data:image/png;base64,mocked', smallFile);
    });

    expect(screen.getByRole('textbox', { name: 'User input' })).toHaveValue('');
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
  });

  it('keeps the latest async image read when file selections resolve out of order', async () => {
    const pendingReads: Array<() => void> = [];

    class DeferredFileReader {
      public result: string | null = null;
      public onloadend: null | (() => void) = null;

      readAsDataURL(file: File) {
        pendingReads.push(() => {
          this.result = `data:${file.name}`;
          this.onloadend?.();
        });
      }
    }

    Object.defineProperty(window, 'FileReader', {
      value: DeferredFileReader,
      configurable: true,
    });

    const { container } = renderApp();
    const fileInput = container.querySelector('input[type="file"]');

    expect(fileInput).not.toBeNull();

    const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' });

    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [firstFile] } });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [secondFile] } });

    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
    expect(pendingReads).toHaveLength(2);

    act(() => {
      pendingReads[1]();
    });
    expect(await screen.findByAltText('Preview')).toHaveAttribute('src', 'data:second.png');

    act(() => {
      pendingReads[0]();
    });
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'data:second.png');

    fireEvent.change(screen.getByRole('textbox', { name: 'User input' }), { target: { value: 'Use latest image' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(swarmState.sendMessage).toHaveBeenCalledWith('Use latest image', 'data:second.png', secondFile);
    });
  });

  it('shows only Stop generation when stopping is available', () => {
    swarmState = createSwarmState({
      canStartNewPrompt: false,
      canStop: true,
      isInputLocked: true,
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);

    renderApp();

    expect(screen.getByRole('button', { name: 'Stop generation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop generation' }));
    expect(swarmState.stopGeneration).toHaveBeenCalledTimes(1);
  });

  it('wires skipStep through the real MessageList and ShowWork live error UI', async () => {
    const erroredAgent = createAgentState({
      id: 'agent-1',
      name: 'Agent 1',
      status: 'error',
      label: 'Draft Failed',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      messageId: 'model-1',
    });
    const liveWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.INITIAL, status: 'error' }],
      agentStates: [erroredAgent],
    };
    const messages: Message[] = [{
      id: 'model-1',
      role: 'model',
      parts: [{ text: '' }],
      work: liveWork,
    }];

    act(() => {
      useAgentStore.getState().startSession('model-1', liveWork, {
        phase: 'recoverable-error',
      });
      useAgentStore.getState().replaceSessionAgents('model-1', [erroredAgent]);
    });

    swarmState = createSwarmState({
      messages,
      activePhase: 'recoverable-error',
      isInputLocked: true,
      canStartNewPrompt: false,
      shouldShowLoadingIndicator: true,
      shouldReadLiveWork: true,
      isPausedForAction: true,
      inlineErrorMessage: 'Draft Failed',
      loadingStatus: 'Retry required',
      progressStatusText: 'Retry required',
      skipStep: vi.fn().mockResolvedValue(undefined),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);

    renderApp();

    fireEvent.click(screen.getByText('Show Agent Work (Live)'));

    const skipButtons = screen.getAllByRole('button', { name: 'Skip Step' });
    expect(skipButtons).toHaveLength(2);

    fireEvent.click(skipButtons[1]);

    await waitFor(() => {
      expect(swarmState.skipStep).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an API-key toast and blocks submit when no Gemini key path is available', async () => {
    swarmState = createSwarmState({
      settings: createSettings({
        apiKey: '',
      }),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useServerStatus.mockReturnValue(createServerStatusState({
      serverStatus: createServerStatus({ hasServerKey: false }),
    }));

    renderApp();

    fireEvent.change(screen.getByRole('textbox', { name: 'User input' }), { target: { value: 'Blocked request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Please provide an API key in settings or ensure server has one configured.')).toBeInTheDocument();
    expect(swarmState.sendMessage).not.toHaveBeenCalled();
  });

  it('shows the OpenRouter model toast when the provider is unlocked but no OpenRouter model is selected', async () => {
    swarmState = createSwarmState({
      settings: createSettings({
        provider: ProviderType.OpenRouter,
        openRouterApiKey: '',
        openRouterModel: '',
      }),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);

    renderApp();

    fireEvent.change(screen.getByRole('textbox', { name: 'User input' }), { target: { value: 'Need model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Please select an OpenRouter model in settings before sending a message.')).toBeInTheDocument();
    expect(swarmState.sendMessage).not.toHaveBeenCalled();
  });

  it('shows the generic model toast when Gemini is unlocked but no model is selected', async () => {
    swarmState = createSwarmState({
      settings: createSettings({
        geminiModel: '',
      }),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);

    renderApp();

    fireEvent.change(screen.getByRole('textbox', { name: 'User input' }), { target: { value: 'Need Gemini model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Please select a model in settings before sending a message.')).toBeInTheDocument();
    expect(swarmState.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps empty submits silent when provider access and model selection are valid', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(swarmState.sendMessage).not.toHaveBeenCalled();
    });

    expect(screen.queryByText('Please provide an API key in settings or ensure server has one configured.')).not.toBeInTheDocument();
    expect(screen.queryByText('Please select a model in settings before sending a message.')).not.toBeInTheDocument();
  });

  it('shows load errors as a toast and clears the load error after render', async () => {
    swarmState = createSwarmState({
      loadError: 'Recovered from corrupt settings',
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);

    renderApp();

    expect(await screen.findByText('Recovered from corrupt settings')).toBeInTheDocument();
    expect(swarmState.clearLoadError).toHaveBeenCalledTimes(1);
  });

  it('enforces the Gemini demo fallback model once settings and server status are loaded', () => {
    swarmState = createSwarmState({
      settings: createSettings({ geminiModel: 'gemini-3-pro-preview', debugMode: true, apiKey: '' }),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useServerStatus.mockReturnValue(createServerStatusState({
      serverStatus: createServerStatus({ isLoaded: true, proxyMode: 'server', hasServerKey: true }),
    }));

    renderApp();

    const setSettingsMock = vi.mocked(swarmState.setSettings);

    expect(setSettingsMock).toHaveBeenCalledTimes(1);
    const updater = setSettingsMock.mock.calls[0][0] as (settings: AppSettings) => AppSettings;
    expect(updater(swarmState.settings)).toMatchObject({ geminiModel: 'gemini-2.5-flash-lite' });
  });

  it('does not enforce the demo fallback before settings and server status are loaded', () => {
    swarmState = createSwarmState({
      settings: createSettings({ geminiModel: 'gemini-3-pro-preview', debugMode: true, apiKey: '' }),
      settingsLoaded: false,
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useServerStatus.mockReturnValue(createServerStatusState({
      serverStatus: createServerStatus({ isLoaded: false, proxyMode: 'server', hasServerKey: true }),
    }));

    renderApp();

    expect(swarmState.setSettings).not.toHaveBeenCalled();
  });

  it('surfaces settings boundary reset and validation callbacks through toasts', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Settings' }));
    expect(await screen.findByTestId('settings-modal-boundary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Emit Modal Error' }));
    expect(await screen.findByText('Settings validation failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Through Modal' }));
    expect(swarmState.resetSettings).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Settings reset successfully')).toBeInTheDocument();
  });

  it('closes the settings boundary and the real info modal through their close handlers', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Swarm Settings' }));
    expect(await screen.findByTestId('settings-modal-boundary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Settings' }));
    await waitFor(() => {
      expect(screen.queryByTestId('settings-modal-boundary')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'How it Works' }));
    expect(await screen.findByText('How it Works')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => {
      expect(screen.queryByText('How it Works')).not.toBeInTheDocument();
    });
  });

  it('hides the scroll button when auto-scroll says it is hidden', async () => {
    swarmState = createSwarmState({
      loadError: 'Dismiss me',
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useAutoScroll.mockReturnValue({
      messageListRef: { current: null },
      showScrollButton: false,
      scrollToBottom: vi.fn(),
      setShouldAutoScroll: vi.fn(),
    });

    renderApp();

    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).not.toBeInTheDocument();
    expect(await screen.findByText('Dismiss me')).toBeInTheDocument();
  });
});
