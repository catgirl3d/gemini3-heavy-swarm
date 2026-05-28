import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Work, AgentState, Message, ServerStatus, AppSettings } from '@/types';
import { ProviderType } from '@/types';
import { createMockSettings } from '@test/settingsMocks';

const mocks = vi.hoisted(() => ({
  useGeminiSwarm: vi.fn(),
  useServerStatus: vi.fn(),
  useAutoScroll: vi.fn(),
  useDynamicFavicon: vi.fn(),
  useProviderInfo: vi.fn(),
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

vi.mock('@/hooks/core/useProviderInfo', () => ({
  useProviderInfo: mocks.useProviderInfo,
}));

vi.mock('@/providers', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="config-provider">{children}</div>,
}));

vi.mock('@/components/layout', () => ({
  StatusBanner: ({ shouldShowLoadingBanner }: any) => <div data-testid="status-banner">{String(shouldShowLoadingBanner)}</div>,
  Header: ({ onInfoClick, onSettingsClick, modelDisplayName }: any) => (
    <div data-testid="header">
      <span>{modelDisplayName}</span>
      <button type="button" onClick={onInfoClick}>Open Info</button>
      <button type="button" onClick={onSettingsClick}>Open Settings</button>
    </div>
  ),
  Toast: ({ message, type, onClose }: any) => (
    <div data-testid="toast" data-type={type}>
      <span>{message}</span>
      <button type="button" onClick={onClose}>Dismiss Toast</button>
    </div>
  ),
}));

vi.mock('@/components/chat', () => ({
  MessageList: ({ onPromptClick, onRegenerate, modelDisplayName }: any) => (
    <div data-testid="message-list">
      <span>{modelDisplayName}</span>
      <button type="button" onClick={() => onPromptClick('Suggested prompt')}>Use Suggested Prompt</button>
      <button type="button" onClick={() => onRegenerate('message-1', 'initial_step', 2)}>Regenerate Agent</button>
    </div>
  ),
  InputArea: ({
    userInput,
    image,
    onUserInputChange,
    onImageChange,
    onRemoveImage,
    onSubmit,
    onStop,
    fileInputRef,
    inputRef,
  }: any) => (
    <form onSubmit={onSubmit}>
      <input ref={inputRef} aria-label="User Input" value={userInput} onChange={(event) => onUserInputChange(event.target.value)} />
      <input ref={fileInputRef} aria-label="Image Input" type="file" onChange={onImageChange} />
      <button type="button" onClick={onRemoveImage}>Remove Image</button>
      <button type="button" onClick={onStop}>Stop</button>
      <button type="submit">Send</button>
      {image && <span>Image Attached</span>}
    </form>
  ),
}));

vi.mock('@/components/ui', () => ({
  ScrollToBottomButton: ({ visible, onClick }: any) => visible ? <button type="button" onClick={onClick}>Scroll to Bottom</button> : null,
}));

vi.mock('@/components/modals/SettingsModal', () => ({
  SettingsModal: ({ isOpen, onReset, onShowError, onClose }: any) => (
    isOpen ? (
      <div data-testid="settings-modal">
        <button type="button" onClick={onReset}>Reset Through Modal</button>
        <button type="button" onClick={() => onShowError('Settings validation failed')}>Emit Modal Error</button>
        <button type="button" onClick={onClose}>Close Settings</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/modals/InfoModal', () => ({
  InfoModal: ({ isOpen, onClose }: any) => (
    isOpen ? (
      <div data-testid="info-modal">
        <span>How it Works</span>
        <button type="button" onClick={onClose}>Close Info</button>
      </div>
    ) : null
  ),
}));

import { App } from '@/App';

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.Gemini,
  geminiModel: 'gemini-3-pro-preview',
  debugMode: false,
  ...overrides,
});

const createServerStatus = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  hasServerKey: true,
  hasOpenRouterKey: true,
  proxyMode: 'private',
  isLoaded: true,
  ...overrides,
});

const createProviderInfo = (overrides: Record<string, unknown> = {}) => ({
  isGemini: true,
  isOpenRouter: false,
  currentModelId: 'gemini-3-pro-preview',
  isUsingProxy: false,
  isUnlocked: true,
  isDemoMode: false,
  modelDisplayName: 'Gemini 3 Pro',
  canSend: vi.fn(() => true),
  ...overrides,
});

const createSwarmState = (overrides: Partial<Record<string, unknown>> = {}) => ({
  messages: [] as Message[],
  activePhase: null,
  isInputLocked: false,
  canStartNewPrompt: true,
  canStop: false,
  shouldShowLoadingIndicator: false,
  shouldReadLiveWork: false,
  shouldAutoScrollOnSessionChange: false,
  isPausedForAction: false,
  isTimerActive: false,
  progressStatusText: 'Idle',
  inlineErrorMessage: null,
  globalErrorMessage: null,
  loadingStatus: 'Idle',
  agentStates: [] as AgentState[],
  currentWork: undefined as Work | undefined,
  settings: createSettings(),
  settingsLoaded: true,
  error: null,
  setSettings: vi.fn(),
  resetSettings: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  stopGeneration: vi.fn(),
  retry: vi.fn(),
  continueGeneration: vi.fn(),
  regenerateAgentResponse: vi.fn(),
  currentMessageId: 'message-1',
  loadError: null,
  clearLoadError: vi.fn(),
  ...overrides,
});

describe('App', () => {
  let swarmState: ReturnType<typeof createSwarmState>;
  let providerInfo: ReturnType<typeof createProviderInfo>;

  beforeEach(() => {
    swarmState = createSwarmState();
    providerInfo = createProviderInfo();

    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useServerStatus.mockReturnValue({
      serverStatus: createServerStatus(),
      shouldShowLoadingBanner: false,
      isBannerDismissed: false,
      dismissBanner: vi.fn(),
    });
    mocks.useProviderInfo.mockImplementation(() => providerInfo);
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

  it('renders the app shell, opens lazy modals, forwards prompt clicks, and wires scroll/regenerate/stop handlers', async () => {
    const scrollToBottom = vi.fn();
    mocks.useAutoScroll.mockReturnValue({
      messageListRef: { current: null },
      showScrollButton: true,
      scrollToBottom,
      setShouldAutoScroll: vi.fn(),
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Use Suggested Prompt' }));
    expect(screen.getByLabelText('User Input')).toHaveValue('Suggested prompt');

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate Agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scroll to Bottom' }));

    expect(swarmState.regenerateAgentResponse).toHaveBeenCalledWith('message-1', 'initial_step', 2);
    expect(swarmState.stopGeneration).toHaveBeenCalledTimes(1);
    expect(scrollToBottom).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(await screen.findByTestId('settings-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Info' }));
    expect(await screen.findByText('How it Works')).toBeInTheDocument();
    expect(mocks.useDynamicFavicon).toHaveBeenCalledWith(ProviderType.Gemini, 'gemini-3-pro-preview', 'Gemini 3 Pro');
  });

  it('shows an API-key toast when submission is blocked by a locked provider', async () => {
    providerInfo = createProviderInfo({
      isUnlocked: false,
      canSend: vi.fn(() => false),
    });
    mocks.useProviderInfo.mockImplementation(() => providerInfo);

    render(<App />);

    fireEvent.change(screen.getByLabelText('User Input'), { target: { value: 'Blocked request' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form') as HTMLFormElement);

    expect(await screen.findByText('Please provide an API key in settings or ensure server has one configured.')).toBeInTheDocument();
    expect(swarmState.sendMessage).not.toHaveBeenCalled();
  });

  it('shows the provider-specific model-selection toast when submission is blocked by a missing model', async () => {
    swarmState.settings = createSettings({ provider: ProviderType.OpenRouter });
    providerInfo = createProviderInfo({
      isGemini: false,
      isOpenRouter: true,
      currentModelId: '',
      isUnlocked: true,
      canSend: vi.fn(() => false),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useProviderInfo.mockImplementation(() => providerInfo);

    render(<App />);

    fireEvent.change(screen.getByLabelText('User Input'), { target: { value: 'Need model' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form') as HTMLFormElement);

    expect(await screen.findByText('Please select an OpenRouter model in settings before sending a message.')).toBeInTheDocument();
  });

  it('shows the Gemini model-selection toast when submission is blocked by a missing Gemini model', async () => {
    providerInfo = createProviderInfo({
      isGemini: true,
      isOpenRouter: false,
      currentModelId: '',
      isUnlocked: true,
      canSend: vi.fn(() => false),
    });
    mocks.useProviderInfo.mockImplementation(() => providerInfo);

    render(<App />);

    fireEvent.change(screen.getByLabelText('User Input'), { target: { value: 'Need Gemini model' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form') as HTMLFormElement);

    expect(await screen.findByText('Please select a model in settings before sending a message.')).toBeInTheDocument();
  });

  it('rejects oversized images and supports valid image attach/remove plus submission clearing', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Image Input'), { target: { files: [] } });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();

    const largeFile = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Image Input'), { target: { files: [largeFile] } });

    expect(await screen.findByText('File size exceeds 4MB limit.')).toBeInTheDocument();
    expect(screen.queryByText('Image Attached')).not.toBeInTheDocument();

    const smallFile = new File(['tiny'], 'small.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Image Input'), { target: { files: [smallFile] } });

    expect(await screen.findByText('Image Attached')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Image' }));

    expect(screen.queryByText('Image Attached')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Image Input'), { target: { files: [smallFile] } });
    fireEvent.change(screen.getByLabelText('User Input'), { target: { value: 'Hello with image' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(swarmState.sendMessage).toHaveBeenCalledWith('Hello with image', 'data:image/png;base64,mocked', smallFile);
    });

    expect(screen.getByLabelText('User Input')).toHaveValue('');
    expect(screen.queryByText('Image Attached')).not.toBeInTheDocument();
  });

  it('does not show a toast when canSend blocks an empty submission despite valid provider access', async () => {
    providerInfo = createProviderInfo({
      isUnlocked: true,
      currentModelId: 'gemini-3-pro-preview',
      canSend: vi.fn(() => false),
    });
    mocks.useProviderInfo.mockImplementation(() => providerInfo);

    render(<App />);

    fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(swarmState.sendMessage).not.toHaveBeenCalled();
    });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('shows load errors as toast and clears the load error after rendering', async () => {
    swarmState.loadError = 'Recovered from corrupt settings';
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);

    render(<App />);

    expect(await screen.findByText('Recovered from corrupt settings')).toBeInTheDocument();
    expect(swarmState.clearLoadError).toHaveBeenCalledTimes(1);
  });

  it('enforces the demo Gemini fallback model when settings and server status are loaded', () => {
    swarmState.settings = createSettings({ geminiModel: 'gemini-3-pro-preview', debugMode: true });
    providerInfo = createProviderInfo({
      isGemini: true,
      isDemoMode: true,
      currentModelId: 'gemini-3-pro-preview',
      canSend: vi.fn(() => true),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useProviderInfo.mockImplementation(() => providerInfo);
    mocks.useServerStatus.mockReturnValue({
      serverStatus: createServerStatus({ isLoaded: true, proxyMode: 'server' }),
      shouldShowLoadingBanner: false,
      isBannerDismissed: false,
      dismissBanner: vi.fn(),
    });

    render(<App />);

    expect(swarmState.setSettings).toHaveBeenCalledTimes(1);
    const updater = swarmState.setSettings.mock.calls[0][0];
    expect(updater(swarmState.settings)).toMatchObject({ geminiModel: 'gemini-2.5-flash-lite' });
  });

  it('skips demo model enforcement until server status and settings are loaded', () => {
    swarmState.settings = createSettings({ geminiModel: 'gemini-3-pro-preview', debugMode: true });
    swarmState.settingsLoaded = false;
    providerInfo = createProviderInfo({
      isGemini: true,
      isDemoMode: true,
      currentModelId: 'gemini-3-pro-preview',
      canSend: vi.fn(() => true),
    });
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useProviderInfo.mockImplementation(() => providerInfo);
    mocks.useServerStatus.mockReturnValue({
      serverStatus: createServerStatus({ isLoaded: false, proxyMode: 'server' }),
      shouldShowLoadingBanner: false,
      isBannerDismissed: false,
      dismissBanner: vi.fn(),
    });

    render(<App />);

    expect(swarmState.setSettings).not.toHaveBeenCalled();
  });

  it('surfaces settings modal reset and validation callbacks through toasts', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    const modal = await screen.findByTestId('settings-modal');
    expect(modal).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Emit Modal Error' }));
    expect(await screen.findByText('Settings validation failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Through Modal' }));
    expect(swarmState.resetSettings).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Settings reset successfully')).toBeInTheDocument();
  });

  it('closes settings and info modals through their onClose handlers', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    const settingsModal = await screen.findByTestId('settings-modal');
    expect(settingsModal).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Settings' }));

    await waitFor(() => {
      expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Info' }));
    expect(await screen.findByText('How it Works')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Got it|Close Info/ }));

    await waitFor(() => {
      expect(screen.queryByText('How it Works')).not.toBeInTheDocument();
    });
  });

  it('renders no scroll button when auto-scroll says it is hidden and allows toast dismissal', async () => {
    swarmState.loadError = 'Dismiss me';
    mocks.useGeminiSwarm.mockImplementation(() => swarmState);
    mocks.useAutoScroll.mockReturnValue({
      messageListRef: { current: null },
      showScrollButton: false,
      scrollToBottom: vi.fn(),
      setShouldAutoScroll: vi.fn(),
    });

    render(<App />);

    expect(screen.queryByRole('button', { name: 'Scroll to Bottom' })).not.toBeInTheDocument();
    expect(await screen.findByText('Dismiss me')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Toast' }));

    await waitFor(() => {
      expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
    });
  });
});
