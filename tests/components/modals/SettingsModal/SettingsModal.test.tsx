import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type FC } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants';
import type { AppSettings, RoleProfile, ServerStatus } from '@/types';
import { ProviderType } from '@/types';
import { SettingsModal } from '@/components/modals/SettingsModal/SettingsModal';

const createRoleProfile = (overrides: Partial<RoleProfile> = {}): RoleProfile => ({
  id: 'role-profile-1',
  name: 'Custom Role Set',
  roles: [{ id: 'role-1', name: 'Architect', instruction: 'Design the solution.', model: 'gemini-2.5-pro' }],
  criticRoles: [{ id: 'critic-1', name: 'Red Team Reviewer', instruction: 'Stress-test the proposal.', model: 'gemini-2.5-flash' }],
  ...overrides,
});

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  provider: ProviderType.Gemini,
  apiKey: 'personal-key',
  geminiModel: 'gemini-2.5-pro',
  profiles: [
    {
      id: 'general-purpose',
      name: 'General Purpose',
      initialInstruction: 'General initial instruction',
      refinementInstruction: 'General refinement instruction',
      synthesizerInstruction: 'General synthesis instruction',
    },
    {
      id: 'research-profile',
      name: 'Research Focus',
      initialInstruction: 'Research initial instruction',
      refinementInstruction: 'Research refinement instruction',
      synthesizerInstruction: 'Research synthesis instruction',
    },
  ],
  activeProfileId: 'general-purpose',
  roleProfiles: [createRoleProfile()],
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

const createRect = (): DOMRect => ({
  x: 0,
  y: 0,
  top: 24,
  left: 24,
  bottom: 64,
  right: 224,
  width: 200,
  height: 40,
  toJSON: () => ({}),
} as DOMRect);

interface ClosableHarnessProps {
  settings: AppSettings;
  serverStatus: ServerStatus;
  onSaveSpy: (settings: AppSettings) => void;
  onCloseSpy: () => void;
  onResetSpy: () => void;
  onShowErrorSpy: (message: string) => void;
}

const ClosableHarness: FC<ClosableHarnessProps> = ({
  settings,
  serverStatus,
  onSaveSpy,
  onCloseSpy,
  onResetSpy,
  onShowErrorSpy,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <SettingsModal
      isOpen={isOpen}
      onClose={() => {
        onCloseSpy();
        setIsOpen(false);
      }}
      settings={settings}
      onSave={onSaveSpy}
      onReset={onResetSpy}
      serverStatus={serverStatus}
      onShowError={onShowErrorSpy}
    />
  );
};

const renderSettingsModal = ({
  settings = createSettings(),
  serverStatus = createServerStatus(),
  isOpen = true,
}: {
  settings?: AppSettings;
  serverStatus?: ServerStatus;
  isOpen?: boolean;
} = {}) => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onReset = vi.fn();
  const onShowError = vi.fn();

  const rendered = render(
    <SettingsModal
      isOpen={isOpen}
      onClose={onClose}
      settings={settings}
      onSave={onSave}
      onReset={onReset}
      serverStatus={serverStatus}
      onShowError={onShowError}
    />
  );

  return { ...rendered, onClose, onSave, onReset, onShowError, serverStatus };
};

const renderClosableSettingsModal = ({
  settings = createSettings(),
  serverStatus = createServerStatus(),
}: {
  settings?: AppSettings;
  serverStatus?: ServerStatus;
} = {}) => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onReset = vi.fn();
  const onShowError = vi.fn();

  const rendered = render(
    <ClosableHarness
      settings={settings}
      serverStatus={serverStatus}
      onSaveSpy={onSave}
      onCloseSpy={onClose}
      onResetSpy={onReset}
      onShowErrorSpy={onShowError}
    />
  );

  return { ...rendered, onClose, onSave, onReset, onShowError };
};

const openPromptsTab = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
};

const openPromptProfileDropdown = async () => {
  openPromptsTab();
  fireEvent.click(getPromptProfileButton('General Purpose'));
  expect(await screen.findByRole('button', { name: 'Research Focus' })).toBeInTheDocument();
};

const getPromptProfileButton = (name: string) => screen.getByRole('button', { name });
describe('SettingsModal shell and lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(createRect());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes immediately without showing the unsaved changes dialog when nothing changed', () => {
    const { onClose } = renderClosableSettingsModal();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
  });

  it('closes the prompt profile dropdown on overlay click while keeping the modal open', async () => {
    const { onClose } = renderClosableSettingsModal();

    await openPromptProfileDropdown();

    fireEvent.click(document.querySelector('.modal-overlay') as Element);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Research Focus' })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the prompt profile dropdown on Escape before closing the modal on the next Escape', async () => {
    const { onClose } = renderClosableSettingsModal();

    await openPromptProfileDropdown();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Research Focus' })).not.toBeInTheDocument();
    });

    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Swarm Configuration')).not.toBeInTheDocument();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resyncs the local draft from new settings props while the modal stays open', () => {
    const initialSettings = createSettings({
      pauseAfterInitial: false,
      pauseAfterRefinement: false,
    });
    const updatedSettings = createSettings({
      pauseAfterInitial: false,
      pauseAfterRefinement: true,
    });
    const { rerender, onClose, onSave, onReset, onShowError, serverStatus } = renderSettingsModal({
      settings: initialSettings,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' }));
    expect(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' })).toBeChecked();

    rerender(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={updatedSettings}
        onSave={onSave}
        onReset={onReset}
        serverStatus={serverStatus}
        onShowError={onShowError}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pause after Critics (Refinement)' })).toBeChecked();
  });

  it('reopens from parent props after discarding unsaved local changes', async () => {
    const settings = createSettings({ pauseAfterInitial: false });
    const { rerender, onClose, onSave, onReset, onShowError, serverStatus } = renderSettingsModal({ settings });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' }));
    expect(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Unsaved Changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <SettingsModal
        isOpen={false}
        onClose={onClose}
        settings={settings}
        onSave={onSave}
        onReset={onReset}
        serverStatus={serverStatus}
        onShowError={onShowError}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Swarm Configuration')).not.toBeInTheDocument();
    });

    rerender(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={settings}
        onSave={onSave}
        onReset={onReset}
        serverStatus={serverStatus}
        onShowError={onShowError}
      />
    );

    expect(await screen.findByText('Swarm Configuration')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' })).not.toBeChecked();
    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
  });

  it('shows unsaved changes, lets the user stay, and discards without saving when requested', async () => {
    const { onClose, onSave } = renderClosableSettingsModal();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByText('Unsaved Changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => {
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(screen.queryByText('Swarm Configuration')).not.toBeInTheDocument();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves and closes from the unsaved changes dialog using the updated local draft', async () => {
    const { onClose, onSave } = renderClosableSettingsModal();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save & Close' }));

    await waitFor(() => {
      expect(screen.queryByText('Swarm Configuration')).not.toBeInTheDocument();
    });

    const savedSettings = onSave.mock.calls[0][0] as AppSettings;
    expect(savedSettings.pauseAfterInitial).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open when Save & Close is blocked by validation', async () => {
    const { onClose, onSave, onShowError } = renderClosableSettingsModal({
      settings: createSettings({
        provider: ProviderType.Gemini,
        apiKey: '',
      }),
      serverStatus: createServerStatus({
        hasServerKey: false,
      }),
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause after Initial Drafts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save & Close' }));

    expect(onShowError).toHaveBeenCalledWith(expect.stringContaining('Gemini requires an API key'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument();
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
  });

  it('requires explicit confirmation before resetting settings and only resets after confirm', async () => {
    const { onClose, onReset } = renderSettingsModal();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(await screen.findByText('Reset Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Reset Settings')).not.toBeInTheDocument();
    });

    expect(onReset).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Everything' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

});
