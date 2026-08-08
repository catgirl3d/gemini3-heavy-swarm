import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_OUTPUT_TOKENS_LIMIT, MIN_OUTPUT_TOKENS_FOR_THINKING } from '@/constants';
import type { AppSettings, ServerStatus } from '@/types';
import { ProviderType } from '@/types';
import { createMockSettings } from '@test/settingsMocks';

type StepperControlProps = { value: number; min: number; max: number; onValueChange: (value: number) => void };
type TemperatureBannerProps = { isActive: boolean; onToggle: () => void };
type SelectorProps = {
  value?: string | ProviderType;
  provider?: ProviderType;
  disabled?: boolean;
  isOpen?: boolean;
  isDemoMode?: boolean;
  onChange: (value: string | ProviderType) => void;
  onOpenChange?: (open: boolean) => void;
};

const mocks = vi.hoisted(() => ({
  isThinkingModel: vi.fn(),
  getCachedModels: vi.fn(),
  providerSelector: vi.fn(),
  modelSelector: vi.fn(),
  customSelect: vi.fn(),
}));

vi.mock('@/utils/common/modelUtils', () => ({
  isThinkingModel: mocks.isThinkingModel,
}));

vi.mock('@/services/openrouter/modelsCache', () => ({
  getCachedModels: mocks.getCachedModels,
}));

vi.mock('@/components/modals/SettingsModal/components/StepperControl', () => ({
  StepperControl: ({ value, min, max, onValueChange }: StepperControlProps) => (
    <div data-testid="stepper-control" data-value={String(value)} data-min={String(min)} data-max={String(max)}>
      <button type="button" onClick={() => onValueChange(0)}>Set Zero</button>
      <button type="button" onClick={() => onValueChange(5)}>Set Five</button>
      <button type="button" onClick={() => onValueChange(min)}>Set Min</button>
      <button type="button" onClick={() => onValueChange(max)}>Set Max</button>
    </div>
  ),
}));

vi.mock('@/components/modals/SettingsModal/components/TemperatureBanner', () => ({
  TemperatureBanner: ({ isActive, onToggle }: TemperatureBannerProps) => (
    <button type="button" data-testid="temperature-banner" onClick={onToggle}>
      {isActive ? 'Disable unsafe temperature' : 'Enable unsafe temperature'}
    </button>
  ),
}));

vi.mock('@/components/ui', () => ({
  ProviderSelector: (props: SelectorProps) => {
    mocks.providerSelector(props);
    return (
      <div data-testid="provider-selector" data-open={String(!!props.isOpen)}>
        <span>{props.value}</span>
        <button type="button" onClick={() => props.onChange(ProviderType.OpenRouter)}>Choose OpenRouter</button>
        <button type="button" onClick={() => props.onOpenChange?.(!props.isOpen)}>Toggle Provider</button>
      </div>
    );
  },
  ModelSelector: (props: SelectorProps) => {
    mocks.modelSelector(props);
    return (
      <div
        data-testid={`model-selector-${props.provider}`}
        data-disabled={String(!!props.disabled)}
        data-value={props.value}
        data-demo={String(!!props.isDemoMode)}
        data-open={String(!!props.isOpen)}
      >
        <button type="button" onClick={() => props.onOpenChange?.(!props.isOpen)}>Toggle Model</button>
        <button
          type="button"
          onClick={() => props.onChange(props.provider === ProviderType.Gemini ? 'gemini-2.5-pro' : 'openrouter/free-model:free')}
        >
          Choose Model
        </button>
      </div>
    );
  },
  CustomSelect: (props: SelectorProps) => {
    mocks.customSelect(props);
    return (
      <div data-testid="custom-select" data-value={props.value} data-open={String(!!props.isOpen)}>
        <button type="button" onClick={() => props.onChange('429')}>Select 429</button>
        <button type="button" onClick={() => props.onChange('none')}>Select None</button>
        <button type="button" onClick={() => props.onOpenChange?.(!props.isOpen)}>Toggle Select</button>
      </div>
    );
  },
}));

import { GeneralSettingsTab } from '@/components/modals/SettingsModal/tabs/GeneralSettingsTab';

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...createMockSettings({
    provider: ProviderType.Gemini,
    geminiModel: 'gemini-3-pro-preview',
    apiKey: '',
    openRouterApiKey: '',
    openRouterModel: '',
    unsafeTemperature: false,
    maxOutputTokens: 512,
    simulateInitialErrorAttempts: 2,
    ...overrides,
  }),
});

const createServerStatus = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  hasServerKey: true,
  hasOpenRouterKey: true,
  proxyMode: 'server',
  isLoaded: true,
  ...overrides,
});

const GeneralSettingsHarness = ({
  initialSettings,
  isModelUnlocked = true,
  serverStatus = createServerStatus(),
}: {
  initialSettings: AppSettings;
  isModelUnlocked?: boolean;
  serverStatus?: ServerStatus;
}) => {
  const [localSettings, setLocalSettings] = useState(initialSettings);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = e.target instanceof HTMLInputElement ? e.target.checked : false;

    setLocalSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox'
        ? checked
        : (name === 'numAgents' || name === 'maxOutputTokens' || name.endsWith('Attempts'))
          ? parseInt(value, 10) || 1
          : name === 'temperature'
            ? parseFloat(value)
            : value,
    }));
  };

  return (
    <>
      <GeneralSettingsTab
        localSettings={localSettings}
        handleChange={handleChange}
        setLocalSettings={setLocalSettings}
        isModelUnlocked={isModelUnlocked}
        openDropdownId={openDropdownId}
        setOpenDropdownId={setOpenDropdownId}
        serverStatus={serverStatus}
      />
      <pre data-testid="settings-state">{JSON.stringify(localSettings)}</pre>
    </>
  );
};

describe('GeneralSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedModels.mockReturnValue([{ id: 'openrouter/free-model:free' }]);
    mocks.isThinkingModel.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces the thinking-model token floor, shows Gemini demo messaging, and toggles unsafe temperature', () => {
    mocks.isThinkingModel.mockReturnValue(true);

    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          geminiModel: 'gemini-3-pro-preview',
          maxOutputTokens: 1000,
          unsafeTemperature: false,
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    expect(screen.getByText(/Demo Mode: Using server-side key/i)).toBeInTheDocument();
    expect(screen.getByText('Search Tools')).toBeInTheDocument();
    expect(screen.getByText('Debug')).toBeInTheDocument();
    expect(screen.getByTestId('settings-state')).toHaveTextContent(`"maxOutputTokens":${MIN_OUTPUT_TOKENS_FOR_THINKING}`);
    expect(screen.getByTestId('model-selector-gemini')).toHaveAttribute('data-disabled', 'true');

    const temperatureSlider = screen.getAllByRole('slider')[0];
    expect(temperatureSlider).toBeDisabled();

    fireEvent.click(screen.getByTestId('temperature-banner'));

    expect(screen.getByTestId('settings-state')).toHaveTextContent('"unsafeTemperature":true');
    expect(screen.getAllByRole('slider')[0]).not.toBeDisabled();
    expect(mocks.getCachedModels).not.toHaveBeenCalled();
  });

  it('renders the OpenRouter locked state and applies only valid custom token prompts', () => {
    const promptSpy = vi.fn()
      .mockReturnValueOnce(String(MAX_OUTPUT_TOKENS_LIMIT))
      .mockReturnValueOnce(String(MAX_OUTPUT_TOKENS_LIMIT + 1));
    Object.defineProperty(window, 'prompt', {
      value: promptSpy,
      configurable: true,
    });

    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.OpenRouter,
          geminiModel: 'gemini-2.5-flash-lite',
          openRouterModel: '',
          maxOutputTokens: 1024,
        })}
        isModelUnlocked={false}
        serverStatus={createServerStatus({ hasOpenRouterKey: false, proxyMode: 'server' })}
      />
    );

    expect(screen.getByText(/OpenRouter is not available/i)).toBeInTheDocument();
    expect(screen.queryByText('Search Tools')).not.toBeInTheDocument();
    expect(screen.getByTestId('model-selector-openrouter')).toHaveAttribute('data-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Custom/i }));
    expect(screen.getByTestId('settings-state')).toHaveTextContent(`"maxOutputTokens":${MAX_OUTPUT_TOKENS_LIMIT}`);

    fireEvent.click(screen.getByRole('button', { name: /Custom/i }));
    expect(screen.getByTestId('settings-state')).toHaveTextContent(`"maxOutputTokens":${MAX_OUTPUT_TOKENS_LIMIT}`);
    expect(promptSpy).toHaveBeenCalledTimes(2);
    expect(mocks.getCachedModels).toHaveBeenCalledTimes(1);
  });

  it('resets simulated initial failures when attempts are stepped down to zero', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          simulateInitialError: '429',
          simulateInitialErrorAttempts: 2,
        })}
      />
    );

    expect(screen.getByText('Initial Error Simulation')).toBeInTheDocument();
    expect(screen.getByText(/Will fail 2 time\(s\), then succeed on attempt 3/i)).toBeInTheDocument();

    const initialAttemptsStepper = screen.getAllByTestId('stepper-control')[1];

    fireEvent.click(within(initialAttemptsStepper).getByRole('button', { name: 'Set Zero' }));

    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateInitialError":"none"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateInitialErrorAttempts":1');
  });

  it('shows the Gemini personal-key and private-server availability states', () => {
    const { unmount } = render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          apiKey: 'personal-key',
          geminiModel: 'gemini-2.5-pro',
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    expect(screen.getByText(/Personal API key in use. All models unlocked./i)).toBeInTheDocument();
    expect(screen.queryByText(/Private Server Mode/i)).not.toBeInTheDocument();

    unmount();

    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          apiKey: '',
          geminiModel: 'gemini-2.5-pro',
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    expect(screen.getByText(/Private Server Mode. All models are unlocked via the server's API key./i)).toBeInTheDocument();
  });

  it('shows the OpenRouter personal-key and demo availability states', () => {
    const { unmount } = render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterApiKey: 'openrouter-key',
          openRouterModel: 'anthropic/claude-sonnet',
          geminiModel: 'gemini-2.5-flash-lite',
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    expect(screen.getByText(/Personal OpenRouter key in use. All models unlocked./i)).toBeInTheDocument();

    unmount();

    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterApiKey: '',
          openRouterModel: '',
          geminiModel: 'gemini-2.5-flash-lite',
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    expect(screen.getByText(/Demo Mode: Using server-side key. Only free models are available./i)).toBeInTheDocument();
  });

  it('routes provider changes through persistProviderModels and tracks the provider dropdown state', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          geminiModel: 'gemini-2.5-flash-lite',
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Provider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose OpenRouter' }));

    expect(screen.getByTestId('provider-selector')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"provider":"openrouter"');
  });

  it('uses Gemini fallback values for missing legacy fields and closes provider/model selectors cleanly', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          geminiModel: undefined,
          apiKey: undefined,
          temperature: undefined,
          unsafeTemperature: true,
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    expect(screen.getByTestId('model-selector-gemini')).toHaveAttribute('data-value', 'gemini-3-flash-preview');
    expect(screen.getByText('Temperature (0.7)')).toBeInTheDocument();
    expect(screen.getAllByRole('slider')[0]).toHaveValue('0.7');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Provider' }));
    expect(screen.getByTestId('provider-selector')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Provider' }));
    expect(screen.getByTestId('provider-selector')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Model' }));
    expect(screen.getByTestId('model-selector-gemini')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Model' }));
    expect(screen.getByTestId('model-selector-gemini')).toHaveAttribute('data-open', 'false');
  });

  it('uses OpenRouter fallback values when cached models and saved model ids are missing', () => {
    mocks.getCachedModels.mockReturnValue(undefined);

    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterApiKey: undefined,
          openRouterModel: undefined,
          geminiModel: undefined,
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    expect(screen.getByTestId('model-selector-openrouter')).toHaveAttribute('data-value', '');
    expect(screen.getByTestId('model-selector-openrouter')).toHaveAttribute('data-demo', 'true');
    expect(mocks.getCachedModels).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Model' }));
    expect(screen.getByTestId('model-selector-openrouter')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Model' }));
    expect(screen.getByTestId('model-selector-openrouter')).toHaveAttribute('data-open', 'false');
  });

  it('defaults missing provider state to locked Gemini and keeps search toggles unchecked for legacy settings', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: undefined,
          geminiModel: undefined,
          apiKey: undefined,
          useSearchInRefinement: undefined,
          useSearchInSynthesis: undefined,
        })}
        isModelUnlocked={false}
        serverStatus={createServerStatus({ hasServerKey: false, proxyMode: 'server' })}
      />
    );

    expect(screen.getByTestId('provider-selector')).toHaveTextContent('gemini');
    expect(screen.getByTestId('model-selector-gemini')).toHaveAttribute('data-value', 'gemini-2.5-flash-lite');
    expect(screen.getByText('No API key available. Service is unavailable.')).toBeInTheDocument();
    expect(screen.getByLabelText('Use Google Search in Critics (Refinement)')).not.toBeChecked();
    expect(screen.getByLabelText('Use Google Search in Final Synthesis')).not.toBeChecked();
  });

  it('keeps custom token values unchanged when the prompt is cancelled and covers initial/refinement debug branches', () => {
    Object.defineProperty(window, 'prompt', {
      value: vi.fn().mockReturnValue(''),
      configurable: true,
    });

    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          simulateInitialError: '429',
          simulateInitialErrorAttempts: 2,
          simulateRefinementError: '500',
          simulateRefinementErrorAttempts: 2,
          maxOutputTokens: 2048,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Custom/i }));
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"maxOutputTokens":2048');

    const initialAttemptsStepper = screen.getAllByTestId('stepper-control')[1];
    fireEvent.click(within(initialAttemptsStepper).getByRole('button', { name: 'Set Five' }));

    const refinementSelect = screen.getAllByTestId('custom-select')[1];
    fireEvent.click(within(refinementSelect).getByRole('button', { name: 'Toggle Select' }));
    fireEvent.click(within(refinementSelect).getByRole('button', { name: 'Select 429' }));

    const refinementAttemptsStepper = screen.getAllByTestId('stepper-control')[2];
    fireEvent.click(within(refinementAttemptsStepper).getByRole('button', { name: 'Set Zero' }));

    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateInitialErrorAttempts":5');
    expect(refinementSelect).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateRefinementError":"none"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateRefinementErrorAttempts":1');
  });

  it('uses none fallbacks for missing debug selectors and closes each dropdown back to null', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          simulateInitialError: undefined,
          simulateRefinementError: undefined,
          simulateSynthesisError: undefined,
        })}
      />
    );

    for (const select of screen.getAllByTestId('custom-select')) {
      expect(select).toHaveAttribute('data-value', 'none');

      const toggle = within(select).getByRole('button', { name: 'Toggle Select' });
      fireEvent.click(toggle);
      fireEvent.click(toggle);
    }

    for (const select of screen.getAllByTestId('custom-select')) {
      expect(select).toHaveAttribute('data-open', 'false');
    }
  });

  it('uses one-attempt fallbacks when debug attempt counts are missing', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          simulateInitialError: '429',
          simulateInitialErrorAttempts: undefined,
          simulateRefinementError: '500',
          simulateRefinementErrorAttempts: undefined,
          simulateSynthesisError: 'timeout',
          simulateSynthesisErrorAttempts: undefined,
        })}
      />
    );

    const attemptSteppers = screen.getAllByTestId('stepper-control').slice(1);

    for (const stepper of attemptSteppers) {
      expect(stepper).toHaveAttribute('data-value', '1');
    }

    expect(screen.getAllByText('Will fail 1 time(s), then succeed on attempt 2.')).toHaveLength(3);
  });

  it('updates workflow, search, system, and refinement or synthesis debug branches', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          simulateInitialError: 'none',
          simulateRefinementError: '500',
          simulateRefinementErrorAttempts: 2,
          simulateSynthesisError: 'timeout',
          simulateSynthesisErrorAttempts: 3,
          pauseAfterInitial: false,
          useSearchInInitial: false,
          devMode: false,
          debugMode: false,
        })}
      />
    );

    fireEvent.click(within(screen.getAllByTestId('stepper-control')[0]).getByRole('button', { name: 'Set Five' }));
    fireEvent.click(screen.getByLabelText('Pause after Initial Drafts'));
    fireEvent.click(screen.getByLabelText('Use Google Search in Initial Drafts'));
    fireEvent.click(screen.getByLabelText('Development Mode (Simulation)'));
    fireEvent.click(screen.getByLabelText('Debug Logging (Console)'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Select 429' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle Select' })[0]);
    fireEvent.click(within(screen.getAllByTestId('stepper-control')[2]).getByRole('button', { name: 'Set Five' }));
    fireEvent.click(within(screen.getAllByTestId('stepper-control')[3]).getByRole('button', { name: 'Set Zero' }));

    expect(screen.getByTestId('settings-state')).toHaveTextContent('"numAgents":5');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"pauseAfterInitial":true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"useSearchInInitial":true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"devMode":true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"debugMode":true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateInitialError":"429"');
    expect(screen.getAllByTestId('custom-select')[0]).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateRefinementErrorAttempts":5');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateSynthesisError":"none"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateSynthesisErrorAttempts":1');
  });

  it('handles direct Gemini input, model, slider, and token-chip changes', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.Gemini,
          apiKey: '',
          geminiModel: 'gemini-2.5-flash-lite',
          unsafeTemperature: true,
          maxOutputTokens: 2048,
          temperature: 0.7,
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Enter your Gemini API Key'), { target: { value: 'personal-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }));
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: '64k (Max)' }));

    expect(screen.getByTestId('settings-state')).toHaveTextContent('"apiKey":"personal-key"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"geminiModel":"gemini-2.5-pro"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"temperature":0.5');
    expect(screen.getByTestId('settings-state')).toHaveTextContent(`"maxOutputTokens":${MAX_OUTPUT_TOKENS_LIMIT}`);
    expect(screen.getByTestId('model-selector-gemini')).toHaveAttribute('data-open', 'true');
  });

  it('handles direct OpenRouter input and synthesis simulation updates', () => {
    render(
      <GeneralSettingsHarness
        initialSettings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterApiKey: '',
          openRouterModel: '',
          simulateSynthesisError: 'timeout',
          simulateSynthesisErrorAttempts: 2,
          geminiModel: 'gemini-2.5-flash-lite',
        })}
        isModelUnlocked
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Enter your OpenRouter API Key'), { target: { value: 'openrouter-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle Select' })[2]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select 429' })[2]);
    fireEvent.click(within(screen.getAllByTestId('stepper-control')[1]).getByRole('button', { name: 'Set Five' }));

    expect(screen.getByTestId('settings-state')).toHaveTextContent('"openRouterApiKey":"openrouter-key"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"openRouterModel":"openrouter/free-model:free"');
    expect(screen.getAllByTestId('custom-select')[2]).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateSynthesisError":"429"');
    expect(screen.getByTestId('settings-state')).toHaveTextContent('"simulateSynthesisErrorAttempts":5');
  });
});
