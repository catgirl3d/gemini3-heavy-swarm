import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_PROFILES, DEFAULT_SETTINGS } from '@/constants';
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

const renderSettingsModal = ({
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

  render(
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

  return { onClose, onSave, onReset, onShowError };
};

const getPromptProfileButton = (name: string) => screen.getByRole('button', { name });
const getRoleProfileButton = (name: string) => screen.getByRole('button', { name });

describe('SettingsModal management flows', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(createRect());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a copied prompt profile through the confirmation flow and saves it as the active profile', async () => {
    const { onSave } = renderSettingsModal({
      settings: createSettings({ activeProfileId: 'research-profile' }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(await screen.findByText('Create New Profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Current' }));

    await waitFor(() => {
      expect(screen.queryByText('Create New Profile')).not.toBeInTheDocument();
    });

    expect(getPromptProfileButton('Research Focus (Copy)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = onSave.mock.calls[0][0] as AppSettings;
    const activeProfile = savedSettings.profiles.find((profile) => profile.id === savedSettings.activeProfileId);

    expect(activeProfile).toMatchObject({
      name: 'Research Focus (Copy)',
      initialInstruction: 'Research initial instruction',
      refinementInstruction: 'Research refinement instruction',
      synthesizerInstruction: 'Research synthesis instruction',
    });
  });

  it('clones the current role profile with remapped role ids and copied provider model mappings', async () => {
    const currentProfile = createRoleProfile({
      roles: [
        { id: 'role-1', name: 'Architect', instruction: 'Design the solution.', model: 'gemini-2.5-pro' },
        { id: 'role-2', name: 'Researcher', instruction: 'Research the details.', model: 'gemini-2.5-flash' },
      ],
      criticRoles: [
        { id: 'critic-1', name: 'Red Team Reviewer', instruction: 'Stress-test the proposal.', model: 'gemini-2.5-flash' },
      ],
    });
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        roleProfiles: [currentProfile],
        activeRoleProfileId: currentProfile.id,
        providerModels: {
          stepModels: {},
          roleModels: {
            [currentProfile.id]: {
              [ProviderType.Gemini]: {
                roles: {
                  'role-1': 'gemini-2.5-pro',
                  'role-2': 'gemini-2.5-flash',
                },
                criticRoles: {
                  'critic-1': 'gemini-2.5-flash',
                },
              },
            },
          },
        },
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(await screen.findByText('Create New Role Set')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Current' }));

    await waitFor(() => {
      expect(screen.queryByText('Create New Role Set')).not.toBeInTheDocument();
    });

    expect(getRoleProfileButton('Custom Role Set (Copy)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = onSave.mock.calls[0][0] as AppSettings;
    const clonedProfile = savedSettings.roleProfiles.find((profile) => profile.id === savedSettings.activeRoleProfileId);
    const clonedRoleIds = clonedProfile?.roles.map((role) => role.id) ?? [];
    const clonedCriticIds = clonedProfile?.criticRoles?.map((role) => role.id) ?? [];

    expect(clonedProfile?.name).toBe('Custom Role Set (Copy)');
    expect(clonedRoleIds).toHaveLength(2);
    expect(clonedRoleIds).not.toEqual(['role-1', 'role-2']);
    expect(clonedCriticIds).toHaveLength(1);
    expect(clonedCriticIds).not.toEqual(['critic-1']);
    expect(savedSettings.providerModels?.roleModels?.[clonedProfile!.id]?.[ProviderType.Gemini]).toEqual({
      roles: {
        [clonedRoleIds[0]]: 'gemini-2.5-pro',
        [clonedRoleIds[1]]: 'gemini-2.5-flash',
      },
      criticRoles: {
        [clonedCriticIds[0]]: 'gemini-2.5-flash',
      },
    });
    expect(savedSettings.providerModels?.roleModels?.[currentProfile.id]?.[ProviderType.Gemini]).toEqual({
      roles: {
        'role-1': 'gemini-2.5-pro',
        'role-2': 'gemini-2.5-flash',
      },
      criticRoles: {
        'critic-1': 'gemini-2.5-flash',
      },
    });
  });

  it('creates a fresh role set through the confirmation flow without carrying over current role models', async () => {
    const currentProfile = createRoleProfile();
    const { onSave } = renderSettingsModal({
      settings: createSettings({
        roleProfiles: [currentProfile],
        activeRoleProfileId: currentProfile.id,
        providerModels: {
          stepModels: {},
          roleModels: {
            [currentProfile.id]: {
              [ProviderType.Gemini]: {
                roles: { 'role-1': 'gemini-2.5-pro' },
                criticRoles: { 'critic-1': 'gemini-2.5-flash' },
              },
            },
          },
        },
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(await screen.findByText('Create New Role Set')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Completely New' }));

    await waitFor(() => {
      expect(screen.queryByText('Create New Role Set')).not.toBeInTheDocument();
    });

    expect(getRoleProfileButton('New Role Set')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = onSave.mock.calls[0][0] as AppSettings;
    const activeRoleProfile = savedSettings.roleProfiles.find((profile) => profile.id === savedSettings.activeRoleProfileId);

    expect(activeRoleProfile?.name).toBe('New Role Set');
    expect(activeRoleProfile?.roles.map((role) => ({ name: role.name, instruction: role.instruction, model: role.model }))).toEqual(
      DEFAULT_ROLE_PROFILES[0].roles.map((role) => ({ name: role.name, instruction: role.instruction, model: undefined }))
    );
    expect(activeRoleProfile?.criticRoles.map((role) => ({ name: role.name, instruction: role.instruction, model: role.model }))).toEqual(
      DEFAULT_ROLE_PROFILES[0].criticRoles.map((role) => ({ name: role.name, instruction: role.instruction, model: undefined }))
    );
    expect(savedSettings.providerModels?.roleModels?.[activeRoleProfile!.id]).toBeUndefined();
  });

  it('closes an open prompt profile dropdown when switching tabs', async () => {
    renderSettingsModal();

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
    fireEvent.click(getPromptProfileButton('General Purpose'));
    expect(await screen.findByRole('button', { name: 'Research Focus' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Research Focus' })).not.toBeInTheDocument();
    });
  });
});
