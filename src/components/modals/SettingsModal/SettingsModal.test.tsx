import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_OUTPUT_TOKENS_LIMIT } from '@/constants';
import type { AppSettings, RoleProfile, ServerStatus } from '@/types';
import { PROMPT_TYPES, ProviderType } from '@/types';
import { createMockSettings } from '@test/settingsMocks';

const mocks = vi.hoisted(() => ({
  useProviderInfo: vi.fn(),
  getProviderInfo: vi.fn(),
  persistProviderModels: vi.fn(),
  updateStepModel: vi.fn(),
  useProfileManagement: vi.fn(),
  useRoleManagement: vi.fn(),
  usePresetManagement: vi.fn(),
  generalTab: vi.fn(),
  promptsTab: vi.fn(),
  rolesTab: vi.fn(),
  rolePromptModal: vi.fn(),
}));

vi.mock('@/hooks/core/useProviderInfo', () => ({
  useProviderInfo: mocks.useProviderInfo,
  getProviderInfo: mocks.getProviderInfo,
}));

vi.mock('@/utils/settings/providerPersistence', () => ({
  persistProviderModels: mocks.persistProviderModels,
  updateStepModel: mocks.updateStepModel,
}));

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
  GeneralSettingsTab: (props: any) => {
    mocks.generalTab(props);
    return (
      <div data-testid="general-settings-tab">
        <button type="button" onClick={() => props.setLocalSettings((prev: any) => ({ ...prev, temperature: 1.5 }))}>
          Mutate Settings
        </button>
        <button type="button" onClick={() => props.handleChange({ target: { name: 'provider', value: ProviderType.OpenRouter } })}>
          Switch Provider
        </button>
        <button type="button" onClick={() => props.handleChange({ target: { name: 'temperature', value: '1.7', type: 'range' } })}>
          Change Temperature
        </button>
        <button
          type="button"
          onClick={() => {
            props.handleChange({ target: { name: 'pauseAfterInitial', type: 'checkbox', checked: true } });
            props.handleChange({ target: { name: 'numAgents', type: 'number', value: '0' } });
            props.handleChange({ target: { name: 'apiKey', type: 'text', value: 'legacy-key' } });
          }}
        >
          Change Legacy Fields
        </button>
        <button type="button" onClick={() => props.setOpenDropdownId('provider')}>
          Open Provider Dropdown
        </button>
        {props.openDropdownId === 'provider' && <div>Provider dropdown open</div>}
      </div>
    );
  },
}));

vi.mock('@/components/modals/SettingsModal/tabs/PromptsTab', () => ({
  PromptsTab: (props: any) => {
    mocks.promptsTab(props);
    return (
      <div data-testid="prompts-tab">
        <div>Active profile: {props.activeProfile.id}</div>
        <button type="button" onClick={() => props.setEditingInstruction(PROMPT_TYPES.INITIAL)}>
          Open Instruction Editor
        </button>
        <button type="button" onClick={() => props.setEditingInstruction(PROMPT_TYPES.REFINEMENT)}>
          Open Refinement Instruction Editor
        </button>
        <button type="button" onClick={() => props.setEditingInstruction(PROMPT_TYPES.SYNTHESIS)}>
          Open Synthesis Instruction Editor
        </button>
        <button type="button" onClick={props.handleCreateProfile}>
          Open Create Profile Confirm
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/modals/SettingsModal/tabs/RolesTab', () => ({
  RolesTab: (props: any) => {
    mocks.rolesTab(props);
    return (
      <div data-testid="roles-tab">
        <button type="button" onClick={() => props.setEditingRoleIndex(0)}>
          Open Role Editor
        </button>
        <button type="button" onClick={() => props.handleDeleteRole(0)}>
          Open Delete Role Confirm
        </button>
        <button type="button" onClick={props.handleCreateRoleProfile}>
          Open Create Role Profile Confirm
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/modals', () => {
  const BaseModal = ({ isOpen, onClose, onEscape, onCloseDropdowns, children }: any) => (
    isOpen ? (
      <div data-testid="base-modal">
        <button type="button" onClick={onClose}>Base close</button>
        <button type="button" onClick={onEscape}>Base escape</button>
        <button type="button" onClick={onCloseDropdowns}>Base outside close dropdowns</button>
        {children}
      </div>
    ) : null
  );

  BaseModal.Header = ({ title, onClose, children }: any) => (
    <div>
      <h1>{title}</h1>
      {children}
      <button type="button" onClick={onClose}>Header close</button>
    </div>
  );
  BaseModal.Body = ({ children }: any) => <div>{children}</div>;
  BaseModal.Footer = ({ children }: any) => <div>{children}</div>;
  BaseModal.Divider = () => <hr />;

  const ConfirmationModal = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    discardLabel,
    onConfirm,
    onCancel,
    onDiscard,
  }: any) => (
    isOpen ? (
      <div data-testid="confirmation-modal">
        <div>{title}</div>
        <div>{typeof message === 'string' ? message : message}</div>
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" onClick={onCancel}>{cancelLabel}</button>
        {discardLabel && <button type="button" onClick={onDiscard}>{discardLabel}</button>}
      </div>
    ) : null
  );

  const RoleAndPromptConfigModal = (props: any) => {
    mocks.rolePromptModal(props);
    return props.isOpen ? (
      <div data-testid="role-prompt-config-modal">
        <div>{props.title}</div>
        <div>{props.fields.map((field: any) => field.label).join(', ')}</div>
        {props.fields.map((field: any) => (
          <input
            key={field.label}
            aria-label={field.label}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
          />
        ))}
        <button type="button" onClick={() => props.onModelChange?.('updated-model')}>Change Editor Model</button>
        <button type="button" onClick={() => props.onModelChange?.('')}>Clear Editor Model</button>
        <button type="button" onClick={() => props.onApplyPreset?.({ id: 'preset-1', name: 'Preset', instruction: 'Preset instruction', isCustom: true, model: 'preset-model' })}>Apply Editor Preset</button>
        <button type="button" onClick={() => props.onDeletePreset?.('preset-1')}>Delete Editor Preset</button>
        <button type="button" onClick={() => props.onSavePreset?.('Saved Preset')}>Save Editor Preset</button>
        <button type="button" onClick={props.onClose}>Close Editor</button>
      </div>
    ) : null;
  };

  return {
    BaseModal,
    ConfirmationModal,
    RoleAndPromptConfigModal,
  };
});

import { SettingsModal } from './SettingsModal';

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
    savedInstructions: [{ id: 'saved-inst', name: 'Saved Instruction', type: PROMPT_TYPES.INITIAL, content: 'Saved content', model: 'saved-inst-model' }],
    savedRoles: [{ id: 'saved-role', name: 'Saved Role', instruction: 'Saved instruction', model: 'saved-role-model' }],
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

describe('SettingsModal', () => {
  const profileMgr = {
    handleRenameProfile: vi.fn(),
    handleProfileChange: vi.fn(),
    handleCreateProfile: vi.fn(),
    handleDeleteProfile: vi.fn(),
    handleRenameRoleProfile: vi.fn(),
    handleRoleProfileChange: vi.fn(),
    handleCreateRoleProfile: vi.fn(),
    handleDeleteRoleProfile: vi.fn(),
  };
  const roleMgr = {
    handleAddRole: vi.fn(),
    handleDeleteRole: vi.fn(),
    handleMoveRole: vi.fn(),
    handleRestoreDefaultRoles: vi.fn(),
    handleRoleChange: vi.fn(),
    handleApplyRole: vi.fn(),
  };
  const presetMgr = {
    getRolePresets: vi.fn(() => [{ id: 'role-preset', name: 'Role preset', instruction: 'Preset', isCustom: true }]),
    handleDeleteRolePreset: vi.fn(),
    handleSaveRolePreset: vi.fn(),
    getInstructionPresets: vi.fn(() => [{ id: 'inst-preset', name: 'Instruction preset', instruction: 'Preset', isCustom: true }]),
    handleApplyInstructionPreset: vi.fn(),
    handleDeleteInstructionPreset: vi.fn(),
    handleSaveInstructionPreset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProviderInfo.mockReturnValue(createProviderInfo());
    mocks.getProviderInfo.mockReturnValue(createProviderInfo());
    mocks.persistProviderModels.mockImplementation((settings: AppSettings, provider: ProviderType) => ({ ...settings, provider }));
    mocks.updateStepModel.mockImplementation((settings: AppSettings, key: string, model: string | undefined) => ({
      success: true,
      settings: { ...settings, [key]: model },
    }));
    mocks.useProfileManagement.mockReturnValue(profileMgr);
    mocks.useRoleManagement.mockReturnValue(roleMgr);
    mocks.usePresetManagement.mockReturnValue(presetMgr);
  });

  it('closes immediately when there are no unsaved changes', () => {
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Base close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirmation-modal')).not.toBeInTheDocument();
  });

  it('routes provider changes through persistProviderModels', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch Provider' }));

    expect(mocks.persistProviderModels).toHaveBeenCalledWith(expect.objectContaining({ provider: ProviderType.Gemini }), ProviderType.OpenRouter);
  });

  it('routes normal field changes through the generic handleChange path', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({ temperature: 0.7 })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change Temperature' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1.7 }));
  });

  it('supports checkbox, numeric, and plain-text legacy changes and falls back to the first profile when the active id is missing', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({
          activeProfileId: 'missing-profile',
          profiles: [
            { id: 'first-profile', name: 'First Profile', initialInstruction: 'First initial', refinementInstruction: 'First refinement', synthesizerInstruction: 'First synthesis' },
            { id: 'second-profile', name: 'Second Profile', initialInstruction: 'Second initial', refinementInstruction: 'Second refinement', synthesizerInstruction: 'Second synthesis' },
          ],
        })}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change Legacy Fields' }));

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));

    expect(screen.getByText('Active profile: first-profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      pauseAfterInitial: true,
      numAgents: 1,
      apiKey: 'legacy-key',
    }));
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

  it('prompts for unsaved changes and supports discard without saving', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={createSettings()}
        onSave={onSave}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mutate Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base close' }));

    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('allows staying in the modal when unsaved changes confirmation is cancelled', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mutate Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Base close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
    expect(screen.getByTestId('base-modal')).toBeInTheDocument();
  });

  it('closes active dropdowns first on escape and only closes the modal on the next escape', () => {
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Provider Dropdown' }));
    expect(screen.getByText('Provider dropdown open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Base escape' }));

    expect(screen.queryByText('Provider dropdown open')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Base escape' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks saving Gemini settings when no usable API key exists', () => {
    const onShowError = vi.fn();
    const onSave = vi.fn();
    mocks.getProviderInfo.mockReturnValue(createProviderInfo({ isUnlocked: false, isDemoMode: false }));

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
    mocks.getProviderInfo.mockReturnValue(createProviderInfo({ isUnlocked: false, isDemoMode: false, isGemini: false, isOpenRouter: true }));

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

  it('normalizes Gemini demo saves, clamps numeric values, and closes after saving', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    mocks.getProviderInfo.mockReturnValue(createProviderInfo({ isUnlocked: true, isDemoMode: true }));

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

  it('preserves free OpenRouter demo models and resets step-specific overrides before saving', () => {
    const onSave = vi.fn();
    mocks.getProviderInfo.mockReturnValue(createProviderInfo({
      isGemini: false,
      isOpenRouter: true,
      isUnlocked: true,
      isDemoMode: true,
    }));

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
    mocks.getProviderInfo.mockReturnValue(createProviderInfo({
      isGemini: false,
      isOpenRouter: true,
      isUnlocked: true,
      isDemoMode: true,
    }));

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
    mocks.getProviderInfo.mockReturnValue(createProviderInfo({
      isGemini: false,
      isOpenRouter: true,
      isUnlocked: true,
      isDemoMode: true,
    }));

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

  it('wires role and instruction editors, including updateStepModel failure handling', () => {
    const onShowError = vi.fn();
    mocks.updateStepModel.mockReturnValue({ success: false, error: 'Failed to update step model.' });

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
        onShowError={onShowError}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Instruction Editor' }));

    expect(screen.getByTestId('role-prompt-config-modal')).toHaveTextContent('Configure Initial Instruction');

    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'Updated instruction body' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change Editor Model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Editor Preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Editor Preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Editor Preset' }));

    expect(mocks.updateStepModel).toHaveBeenCalled();
    expect(onShowError).toHaveBeenCalledWith('Failed to update step model.');
    expect(presetMgr.handleApplyInstructionPreset).toHaveBeenCalledWith(PROMPT_TYPES.INITIAL, 'Preset instruction', 'preset-model');
    expect(presetMgr.handleDeleteInstructionPreset).toHaveBeenCalledWith('preset-1');
    expect(presetMgr.handleSaveInstructionPreset).toHaveBeenCalledWith(PROMPT_TYPES.INITIAL, 'Saved Preset');
    fireEvent.click(screen.getByRole('button', { name: 'Close Editor' }));

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Role Editor' }));
    expect(screen.getAllByTestId('role-prompt-config-modal').at(-1)).toHaveTextContent('Configure Role #1');

    fireEvent.change(screen.getByLabelText('Role Name'), { target: { value: 'Updated role name' } });
    fireEvent.change(screen.getByLabelText('Role Instruction'), { target: { value: 'Updated role instruction' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Apply Editor Preset' }).at(-1) as HTMLButtonElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Editor Preset' }).at(-1) as HTMLButtonElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Editor Preset' }).at(-1) as HTMLButtonElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Change Editor Model' }).at(-1) as HTMLButtonElement);

    expect(roleMgr.handleApplyRole).toHaveBeenCalledWith(0, expect.objectContaining({ name: 'Preset', instruction: 'Preset instruction', model: 'preset-model' }));
    expect(presetMgr.handleDeleteRolePreset).toHaveBeenCalledWith('preset-1');
    expect(presetMgr.handleSaveRolePreset).toHaveBeenCalledWith(0, 'drafter', expect.objectContaining({ id: 'role-profile-1' }), 'Saved Preset');
    expect(roleMgr.handleRoleChange).toHaveBeenCalledWith(0, 'name', 'Updated role name');
    expect(roleMgr.handleRoleChange).toHaveBeenCalledWith(0, 'instruction', 'Updated role instruction');
    expect(presetMgr.handleApplyInstructionPreset).toHaveBeenCalledWith(PROMPT_TYPES.INITIAL, 'Updated instruction body');
    expect(roleMgr.handleRoleChange).toHaveBeenCalledWith(0, 'model', 'updated-model');
  });

  it('updates instruction models on success and keeps the editor open for follow-up actions', () => {
    const updatedSettings = createSettings({ initialModel: 'updated-model' });
    mocks.updateStepModel.mockReturnValue({ success: true, settings: updatedSettings });

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Instruction Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Editor Model' }));

    expect(mocks.updateStepModel).toHaveBeenCalled();
    expect(screen.getByTestId('role-prompt-config-modal')).toBeInTheDocument();
  });

  it('closes the role editor when the modal onClose callback fires', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Role Editor' }));

    expect(screen.getByTestId('role-prompt-config-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Editor' }));

    expect(screen.queryByTestId('role-prompt-config-modal')).not.toBeInTheDocument();
  });

  it('opens refinement and synthesis editors and uses the fallback error when step model updates fail without details', () => {
    const onShowError = vi.fn();
    mocks.updateStepModel
      .mockReturnValueOnce({ success: true, settings: createSettings({ refinementModel: undefined, synthesisModel: undefined }) })
      .mockReturnValueOnce({ success: false });

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings({ refinementModel: 'ref-model', synthesisModel: undefined })}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
        onShowError={onShowError}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Refinement Instruction Editor' }));

    expect(screen.getByTestId('role-prompt-config-modal')).toHaveTextContent('Configure Refinement Instruction');
    expect(screen.getByLabelText('Instruction')).toHaveValue('Refinement prompt');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Editor Model' }));

    expect(mocks.updateStepModel).toHaveBeenCalledWith(expect.anything(), 'refinementModel', undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Open Synthesis Instruction Editor' }));

    expect(screen.getByTestId('role-prompt-config-modal')).toHaveTextContent('Configure Synthesis Instruction');
    expect(screen.getByLabelText('Instruction')).toHaveValue('Synthesis prompt');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Editor Model' }));

    expect(mocks.updateStepModel).toHaveBeenCalledWith(expect.anything(), 'synthesisModel', undefined);
    expect(onShowError).toHaveBeenCalledWith('Failed to update step model. Please try again.');
  });

  it('supports reset and create-profile confirmations', () => {
    const onReset = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen
        onClose={onClose}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={onReset}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(screen.getByText('Reset Settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Reset Settings')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset Everything' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Create Profile Confirm' }));
    expect(screen.getByText('Create New Profile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Create New Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Create Profile Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Current' }));

    expect(profileMgr.handleCreateProfile).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Open Create Profile Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Completely New' }));

    expect(profileMgr.handleCreateProfile).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Create Role Profile Confirm' }));
    expect(screen.getByText('Create New Role Set')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Create New Role Set')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Create Role Profile Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Current' }));

    expect(profileMgr.handleCreateRoleProfile).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Open Create Role Profile Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Completely New' }));

    expect(profileMgr.handleCreateRoleProfile).toHaveBeenCalledWith(false);
  });

  it('confirms role deletion before delegating to the role manager', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={createSettings()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        serverStatus={createServerStatus()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Delete Role Confirm' }));

    expect(screen.getByText('Delete Role')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-modal')).toHaveTextContent('Researcher');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete Role')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Delete Role Confirm' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(roleMgr.handleDeleteRole).toHaveBeenCalledWith(0);
  });
});
