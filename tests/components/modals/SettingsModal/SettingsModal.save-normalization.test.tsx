import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_OUTPUT_TOKENS_LIMIT } from '@/constants';
import type { AppSettings, RoleProfile, ServerStatus } from '@/types';
import { PROMPT_TYPES, ProviderType } from '@/types';
import { SettingsModal } from '@/components/modals/SettingsModal/SettingsModal';
import { createMockSettings } from '@test/settingsMocks';

const mocks = vi.hoisted(() => ({
  useProviderInfo: vi.fn(),
  useProfileManagement: vi.fn(),
  useRoleManagement: vi.fn(),
  usePresetManagement: vi.fn(),
}));

vi.mock('@/hooks/core/useProviderInfo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/core/useProviderInfo')>();

  return {
    ...actual,
    useProviderInfo: mocks.useProviderInfo,
  };
});

vi.mock('@/components/modals/SettingsModal/hooks/useProfileManagement', () => ({
  useProfileManagement: mocks.useProfileManagement,
}));

vi.mock('@/components/modals/SettingsModal/hooks/useRoleManagement', () => ({
  useRoleManagement: mocks.useRoleManagement,
}));

vi.mock('@/components/modals/SettingsModal/hooks/usePresetManagement', () => ({
  usePresetManagement: mocks.usePresetManagement,
}));

vi.mock('@/components/modals/SettingsModal/tabs/GeneralSettingsTab', () => ({
  GeneralSettingsTab: () => <div data-testid="general-settings-tab" />,
}));

vi.mock('@/components/modals/SettingsModal/tabs/PromptsTab', () => ({
  PromptsTab: () => <div data-testid="prompts-tab" />,
}));

vi.mock('@/components/modals/SettingsModal/tabs/RolesTab', () => ({
  RolesTab: () => <div data-testid="roles-tab" />,
}));

vi.mock('@/components/modals', () => {
  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (
    isOpen ? <div data-testid="base-modal">{children}</div> : null
  );

  BaseModal.Header = ({ title }: { title: ReactNode }) => <div>{title}</div>;
  BaseModal.Body = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  BaseModal.Footer = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  BaseModal.Divider = () => <hr />;

  return {
    BaseModal,
    ConfirmationModal: () => null,
    RoleAndPromptConfigModal: () => null,
  };
});

const createRoleProfile = (overrides: Partial<RoleProfile> = {}): RoleProfile => ({
  id: 'role-profile-1',
  name: 'Default Role Set',
  roles: [{ id: 'role-1', name: 'Researcher', instruction: 'Research thoroughly.', model: 'role-model' }],
  criticRoles: [{ id: 'critic-1', name: 'Critic', instruction: 'Critique drafts.', model: 'critic-model' }],
  ...overrides,
});

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...createMockSettings({
    provider: ProviderType.Gemini,
    apiKey: '',
    geminiModel: 'gemini-3-pro-preview',
    openRouterApiKey: '',
    openRouterModel: '',
    profiles: [
      {
        id: 'default',
        name: 'Default Profile',
        initialInstruction: 'Initial prompt',
        refinementInstruction: 'Refinement prompt',
        synthesizerInstruction: 'Synthesis prompt',
      },
    ],
    activeProfileId: 'default',
    roleProfiles: [createRoleProfile()],
    activeRoleProfileId: 'role-profile-1',
    savedInstructions: [{
      id: 'saved-inst',
      name: 'Saved Instruction',
      type: PROMPT_TYPES.INITIAL,
      content: 'Saved content',
      model: 'saved-inst-model',
    }],
    savedRoles: [{
      id: 'saved-role',
      name: 'Saved Role',
      instruction: 'Saved instruction',
      model: 'saved-role-model',
    }],
    initialModel: 'initial-model',
    refinementModel: 'refinement-model',
    synthesisModel: 'synthesis-model',
    ...overrides,
  }),
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
  modelDisplayName: 'Test Model',
  canSend: vi.fn(),
  ...overrides,
});

describe('SettingsModal save normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProviderInfo.mockReturnValue(createProviderInfo());
    mocks.useProfileManagement.mockReturnValue({
      handleRenameProfile: vi.fn(),
      handleProfileChange: vi.fn(),
      handleCreateProfile: vi.fn(),
      handleDeleteProfile: vi.fn(),
      handleRenameRoleProfile: vi.fn(),
      handleRoleProfileChange: vi.fn(),
      handleCreateRoleProfile: vi.fn(),
      handleDeleteRoleProfile: vi.fn(),
    });
    mocks.useRoleManagement.mockReturnValue({
      handleAddRole: vi.fn(),
      handleDeleteRole: vi.fn(),
      handleMoveRole: vi.fn(),
      handleRestoreDefaultRoles: vi.fn(),
      handleRoleChange: vi.fn(),
      handleApplyRole: vi.fn(),
    });
    mocks.usePresetManagement.mockReturnValue({
      getRolePresets: vi.fn(() => []),
      handleDeleteRolePreset: vi.fn(),
      handleSaveRolePreset: vi.fn(),
      getInstructionPresets: vi.fn(() => []),
      handleApplyInstructionPreset: vi.fn(),
      handleDeleteInstructionPreset: vi.fn(),
      handleSaveInstructionPreset: vi.fn(),
    });
  });

  it('blocks saving Gemini settings when no usable API key exists', () => {
    const onShowError = vi.fn();
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({ provider: ProviderType.Gemini, apiKey: '' })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ hasServerKey: false })}
        onShowError={onShowError}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onShowError).toHaveBeenCalledWith(expect.stringContaining('Gemini requires an API key'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks saving OpenRouter settings when no usable API key exists', () => {
    const onShowError = vi.fn();
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({ provider: ProviderType.OpenRouter, openRouterApiKey: '', openRouterModel: '' })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ hasOpenRouterKey: false })}
        onShowError={onShowError}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onShowError).toHaveBeenCalledWith(expect.stringContaining('OpenRouter requires an API key'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('normalizes a missing provider to Gemini before saving legacy settings', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          provider: undefined,
          apiKey: 'legacy-key',
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ provider: ProviderType.Gemini }));
  });

  it('normalizes Gemini demo saves, clears step and saved models, clamps numeric values, and closes after saving', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={createSettings({
          provider: ProviderType.Gemini,
          geminiModel: 'gemini-3-pro-preview',
          maxOutputTokens: MAX_OUTPUT_TOKENS_LIMIT + 1000,
          simulateInitialErrorAttempts: 0,
          simulateRefinementErrorAttempts: 0,
          simulateSynthesisErrorAttempts: 0,
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      geminiModel: 'gemini-2.5-flash-lite',
      initialModel: undefined,
      refinementModel: undefined,
      synthesisModel: undefined,
      maxOutputTokens: MAX_OUTPUT_TOKENS_LIMIT,
      simulateInitialErrorAttempts: 1,
      simulateRefinementErrorAttempts: 1,
      simulateSynthesisErrorAttempts: 1,
      savedInstructions: [expect.objectContaining({ model: undefined })],
      savedRoles: [expect.objectContaining({ model: undefined })],
    }));
    expect(onSave.mock.calls[0][0].roleProfiles[0].roles[0].model).toBeUndefined();
    expect(onSave.mock.calls[0][0].roleProfiles[0].criticRoles[0].model).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears only the active provider persistence mappings during Gemini demo normalization', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          provider: ProviderType.Gemini,
          geminiModel: 'gemini-3-pro-preview',
          providerModels: {
            stepModels: {
              [ProviderType.Gemini]: {
                initial: 'gemini-initial',
                refinement: 'gemini-refinement',
                synthesis: 'gemini-synthesis',
              },
              [ProviderType.OpenRouter]: {
                initial: 'openrouter-initial',
              },
            },
            roleModels: {
              'role-profile-1': {
                [ProviderType.Gemini]: {
                  roles: { 'role-1': 'gemini-role-model' },
                  criticRoles: { 'critic-1': 'gemini-critic-model' },
                },
                [ProviderType.OpenRouter]: {
                  roles: { 'role-1': 'openrouter-role-model' },
                },
              },
            },
          },
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const savedSettings = onSave.mock.calls[0][0] as AppSettings;
    expect(savedSettings.providerModels?.stepModels?.[ProviderType.Gemini]).toBeUndefined();
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.Gemini]).toBeUndefined();
    expect(savedSettings.providerModels?.stepModels?.[ProviderType.OpenRouter]).toEqual({ initial: 'openrouter-initial' });
    expect(savedSettings.providerModels?.roleModels?.['role-profile-1']?.[ProviderType.OpenRouter]).toEqual({
      roles: { 'role-1': 'openrouter-role-model' },
    });
  });

  it('preserves free OpenRouter demo models and resets step-specific overrides before saving', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterModel: 'openrouter/free-model:free',
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      openRouterModel: 'openrouter/free-model:free',
      initialModel: undefined,
      refinementModel: undefined,
      synthesisModel: undefined,
    }));
  });

  it('clamps max output tokens to at least one before saving', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          provider: ProviderType.Gemini,
          apiKey: 'personal-key',
          maxOutputTokens: 0,
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ proxyMode: 'private' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 1 }));
  });

  it('clears paid OpenRouter models in demo mode before saving', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterModel: 'anthropic/claude-opus',
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ openRouterModel: '' }));
  });

  it('leaves missing OpenRouter demo models untouched while still resetting step-specific overrides', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          provider: ProviderType.OpenRouter,
          openRouterModel: undefined,
          initialModel: 'initial-model',
          refinementModel: 'refinement-model',
          synthesisModel: 'synthesis-model',
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus({ proxyMode: 'server' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      openRouterModel: undefined,
      initialModel: undefined,
      refinementModel: undefined,
      synthesisModel: undefined,
    }));
  });
});
