import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type FC } from 'react';
import type { AppSettings, RoleProfile, ServerStatus } from '@/types';
import { PROMPT_TYPES, ProviderType } from '@/types';
import { SettingsModal } from '@/components/modals/SettingsModal/SettingsModal';
import { createMockSettings } from '@test/settingsMocks';

const createRoleProfile = (overrides: Partial<RoleProfile> = {}): RoleProfile => ({
  id: 'role-profile-1',
  name: 'Default Role Set',
  roles: [{ id: 'role-1', name: 'Researcher', instruction: 'Research thoroughly.' }],
  criticRoles: [{ id: 'critic-1', name: 'Critic', instruction: 'Critique thoroughly.' }],
  ...overrides,
});

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.Gemini,
  apiKey: 'personal-key',
  geminiModel: 'gemini-2.5-pro',
  openRouterApiKey: '',
  openRouterModel: '',
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

interface ControlledHarnessProps {
  settings: AppSettings;
  serverStatus: ServerStatus;
  onSaveSpy: (settings: AppSettings) => void;
  onCloseSpy: () => void;
  onResetSpy: () => void;
  onShowErrorSpy?: (message: string) => void;
}

const ControlledHarness: FC<ControlledHarnessProps> = ({
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
  onShowError,
}: {
  settings?: AppSettings;
  serverStatus?: ServerStatus;
  onShowError?: (message: string) => void;
} = {}) => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onReset = vi.fn();
  const onShowErrorSpy = onShowError ?? vi.fn();

  render(
    <ControlledHarness
      settings={settings}
      serverStatus={serverStatus}
      onSaveSpy={onSave}
      onCloseSpy={onClose}
      onResetSpy={onReset}
      onShowErrorSpy={onShowErrorSpy}
    />
  );

  return { onClose, onSave, onReset, onShowError: onShowErrorSpy };
};

const openPromptsTab = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
};

const openRolesTab = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
};

const openInitialInstructionEditor = async () => {
  openPromptsTab();
  const initialInstructionCard = screen.getByText('Initial Agent Instruction').closest('.modal-item-card');

  expect(initialInstructionCard).not.toBeNull();

  fireEvent.click(within(initialInstructionCard as HTMLElement).getByTitle('Configure Instruction'));
  expect(await screen.findByText('Configure Initial Instruction')).toBeInTheDocument();
};

const openFirstRoleEditor = async () => {
  openRolesTab();
  fireEvent.click(screen.getByTitle('Configure Role'));
  expect(await screen.findByText('Configure Role #1')).toBeInTheDocument();
};

const switchToCritics = () => {
  openRolesTab();
  fireEvent.click(screen.getByRole('button', { name: 'Critics' }));
};

const selectModel = async (triggerName: RegExp | string, optionName: string) => {
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  const option = await screen.findByText(optionName);
  fireEvent.click(option.closest('button') as HTMLButtonElement);
};

const getSavedSettings = (onSave: ReturnType<typeof vi.fn>): AppSettings => {
  return onSave.mock.calls[0][0] as AppSettings;
};

describe('SettingsModal integration', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(createRect());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves an initial step model through the real prompt editor and syncs providerModels', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        initialModel: undefined,
        providerModels: undefined,
      }),
    });

    await openInitialInstructionEditor();

    await selectModel(/^Use Global Model$/, 'Gemini 2.5 Flash');
    expect(screen.getByRole('button', { name: /Gemini 2.5 Flash/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.initialModel).toBe('gemini-2.5-flash');
    expect(savedSettings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBe('gemini-2.5-flash');
  });

  it('clears an initial step model through Use Global Model and syncs providerModels', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        initialModel: 'gemini-2.5-pro',
        providerModels: {
          stepModels: {
            [ProviderType.Gemini]: {
              initial: 'gemini-2.5-pro',
            },
          },
          roleModels: {},
        },
      }),
    });

    await openInitialInstructionEditor();

    await selectModel(/Gemini 2.5 Pro/i, 'Use Global Model');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.initialModel).toBeUndefined();
    expect(savedSettings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBeUndefined();
  });

  it('surfaces updateStepModel failures from the real prompt editor without mutating the local draft', async () => {
    const preservedRoleModels = {
      'role-profile-1': {
        [ProviderType.Gemini]: {
          roles: {
            'role-1': 'gemini-2.5-pro',
          },
        },
      },
    };
    const brokenProviderModels = { roleModels: preservedRoleModels } as NonNullable<AppSettings['providerModels']>;

    Object.defineProperty(brokenProviderModels, 'stepModels', {
      enumerable: true,
      get: () => {
        throw new Error('Broken step storage');
      },
    });

    const { onShowError, onSave } = renderSettingsModal({
      settings: createSettings({
        initialModel: undefined,
        providerModels: brokenProviderModels,
      }),
    });

    await openInitialInstructionEditor();
    await selectModel(/^Use Global Model$/, 'Gemini 2.5 Flash');

    expect(onShowError).toHaveBeenCalledWith('Failed to update step model "initialModel": Broken step storage');
    expect(screen.getByRole('button', { name: /^Use Global Model$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.initialModel).toBeUndefined();
    expect(savedSettings.profiles[0].initialInstruction).toBe('General initial instruction');
    expect(savedSettings.providerModels).toBe(brokenProviderModels);
    expect(savedSettings.providerModels?.roleModels).toEqual(preservedRoleModels);
  });

  it('applies a saved instruction preset with its model through the real editor', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        savedInstructions: [{
          id: 'saved-initial-preset',
          name: 'Initial Preset',
          type: PROMPT_TYPES.INITIAL,
          content: 'Preset instruction',
          model: 'gemini-2.5-flash',
        }],
      }),
    });

    await openInitialInstructionEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Select a Preset...' }));
    const presetOption = await screen.findByText('Initial Preset');
    fireEvent.click(presetOption.closest('button') as HTMLButtonElement);

    expect(screen.getByDisplayValue('Preset instruction')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gemini 2.5 Flash/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.profiles[0].initialInstruction).toBe('Preset instruction');
    expect(savedSettings.initialModel).toBe('gemini-2.5-flash');
    expect(savedSettings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBe('gemini-2.5-flash');
  });

  it('updates a role through the real editor and syncs the provider-specific role model mapping', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        roleProfiles: [createRoleProfile({
          roles: [{ id: 'role-1', name: 'Researcher', instruction: 'Research thoroughly.', model: undefined }],
        })],
      }),
    });

    await openFirstRoleEditor();

    fireEvent.change(screen.getByDisplayValue('Researcher'), { target: { value: 'Architect' } });
    fireEvent.change(screen.getByPlaceholderText('Instructions for this specific role...'), { target: { value: 'Design the solution.' } });
    await selectModel(/^Use Global Model$/, 'Gemini 2.5 Flash');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.roleProfiles[0].roles[0]).toMatchObject({
      id: 'role-1',
      name: 'Architect',
      instruction: 'Design the solution.',
      model: 'gemini-2.5-flash',
    });
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]?.roles?.['role-1']).toBe('gemini-2.5-flash');
  });

  it('updates a critic role through the critic branch and syncs critic role model mappings', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        roleProfiles: [createRoleProfile({
          criticRoles: [{ id: 'critic-1', name: 'Critic', instruction: 'Critique thoroughly.', model: undefined }],
        })],
      }),
    });

    switchToCritics();
    fireEvent.click(screen.getByTitle('Configure Role'));
    expect(await screen.findByText('Configure Role #1')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Critic'), { target: { value: 'Red Team Reviewer' } });
    fireEvent.change(screen.getByPlaceholderText('Instructions for this specific role...'), { target: { value: 'Stress-test weak arguments.' } });
    await selectModel(/^Use Global Model$/, 'Gemini 2.5 Flash');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.roleProfiles[0].criticRoles?.[0]).toMatchObject({
      id: 'critic-1',
      name: 'Red Team Reviewer',
      instruction: 'Stress-test weak arguments.',
      model: 'gemini-2.5-flash',
    });
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]?.criticRoles?.['critic-1']).toBe('gemini-2.5-flash');
  });

  it('confirms role deletion through the real modal flow and cleans orphaned role mappings', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        roleProfiles: [createRoleProfile({
          roles: [
            { id: 'role-1', name: 'Researcher', instruction: 'Research thoroughly.', model: 'gemini-2.5-pro' },
            { id: 'role-2', name: 'Editor', instruction: 'Refine the wording.', model: 'gemini-2.5-flash' },
          ],
        })],
        providerModels: {
          stepModels: {},
          roleModels: {
            'role-profile-1': {
              [ProviderType.Gemini]: {
                roles: {
                  'role-1': 'gemini-2.5-pro',
                  'role-2': 'gemini-2.5-flash',
                },
              },
            },
          },
        },
      }),
    });

    openRolesTab();
    fireEvent.click(screen.getAllByTitle('Delete Role')[0]);

    expect(await screen.findByText('Delete Role')).toBeInTheDocument();
    expect(screen.getAllByText(/Researcher/)[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Delete Role')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('Delete Role')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.roleProfiles[0].roles).toHaveLength(1);
    expect(savedSettings.roleProfiles[0].roles[0].id).toBe('role-2');
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]?.roles?.['role-1']).toBeUndefined();
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]?.roles?.['role-2']).toBe('gemini-2.5-flash');
  });

  it('deletes a critic role through the critic branch and cleans critic role mappings', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        roleProfiles: [createRoleProfile({
          criticRoles: [
            { id: 'critic-1', name: 'Critic', instruction: 'Critique thoroughly.', model: 'gemini-2.5-pro' },
            { id: 'critic-2', name: 'Fallback Critic', instruction: 'Catch omissions.', model: 'gemini-2.5-flash' },
          ],
        })],
        providerModels: {
          stepModels: {},
          roleModels: {
            'role-profile-1': {
              [ProviderType.Gemini]: {
                criticRoles: {
                  'critic-1': 'gemini-2.5-pro',
                  'critic-2': 'gemini-2.5-flash',
                },
              },
            },
          },
        },
      }),
    });

    switchToCritics();
    fireEvent.click(screen.getAllByTitle('Delete Role')[0]);

    expect(await screen.findByText('Delete Role')).toBeInTheDocument();
    expect(screen.getAllByText(/Critic/)[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = getSavedSettings(onSave);
    expect(savedSettings.roleProfiles[0].criticRoles).toHaveLength(1);
    expect(savedSettings.roleProfiles[0].criticRoles?.[0].id).toBe('critic-2');
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]?.criticRoles?.['critic-1']).toBeUndefined();
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]?.criticRoles?.['critic-2']).toBe('gemini-2.5-flash');
  });

  it('closes the nested prompt editor on Escape while keeping the parent modal open', async () => {
    renderSettingsModal();

    await openInitialInstructionEditor();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Configure Initial Instruction')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument();
  });
});
