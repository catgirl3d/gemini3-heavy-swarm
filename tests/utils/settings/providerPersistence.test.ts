import { describe, expect, it } from 'vitest';
import { ProviderType } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { persistProviderModels, updateRoleModel, updateStepModel } from '@/utils/settings/providerPersistence';

const createStepAndRoleSettings = () => createMockSettings({
  provider: ProviderType.Gemini,
  initialModel: 'gemini-initial',
  refinementModel: 'gemini-refinement',
  synthesisModel: 'gemini-synthesis',
  activeRoleProfileId: '1',
  roleProfiles: [
    {
      id: '1',
      name: 'Default',
      roles: [
        { id: 'drafter-1', name: 'Drafter 1', instruction: 'instr', model: 'gemini-model-1' },
        { id: 'drafter-2', name: 'Drafter 2', instruction: 'instr' },
      ],
      criticRoles: [
        { id: 'critic-1', name: 'Critic 1', instruction: 'instr', model: 'gemini-critic-1' },
      ],
    },
  ],
});

describe('updateRoleModel', () => {
  it('should update role model using role ID', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test' },
          { id: 'role-2', name: 'Role 2', instruction: 'Test' },
        ],
        criticRoles: [],
      }],
    });

    const result = updateRoleModel(settings, 'test-profile', 'drafter', 'role-2', 'gpt-4');

    expect(result.success).toBe(true);
    expect(result.settings.roleProfiles?.[0]?.roles?.[1]?.model).toBe('gpt-4');
    expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
      'role-2': 'gpt-4',
    });
  });

  it('should clear role model when set to undefined', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      providerModels: {
        stepModels: {},
        roleModels: {
          'test-profile': {
            [ProviderType.Gemini]: {
              roles: { 'role-1': 'gpt-4' },
            },
          },
        },
      },
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
        ],
        criticRoles: [],
      }],
    });

    const result = updateRoleModel(settings, 'test-profile', 'drafter', 'role-1', undefined);

    expect(result.success).toBe(true);
    expect(result.settings.roleProfiles?.[0]?.roles?.[0]?.model).toBeUndefined();
    expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toBeUndefined();
  });

  it('should handle critic roles correctly', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [],
        criticRoles: [
          { id: 'critic-1', name: 'Critic 1', instruction: 'Test' },
        ],
      }],
    });

    const result = updateRoleModel(settings, 'test-profile', 'critic', 'critic-1', 'claude-3');

    expect(result.success).toBe(true);
    expect(result.settings.roleProfiles?.[0]?.criticRoles?.[0]?.model).toBe('claude-3');
    expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.criticRoles).toEqual({
      'critic-1': 'claude-3',
    });
  });

  it('should not affect other roles when updating one role', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      providerModels: {
        stepModels: {},
        roleModels: {
          'test-profile': {
            [ProviderType.Gemini]: {
              roles: { 'role-1': 'gpt-4' },
            },
          },
        },
      },
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
          { id: 'role-2', name: 'Role 2', instruction: 'Test' },
        ],
        criticRoles: [],
      }],
    });

    const result = updateRoleModel(settings, 'test-profile', 'drafter', 'role-2', 'claude-3');

    expect(result.success).toBe(true);
    expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
      'role-1': 'gpt-4',
      'role-2': 'claude-3',
    });
  });

  it('should fail without mutating settings when role ID does not exist', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      providerModels: {
        stepModels: {},
        roleModels: {
          'test-profile': {
            [ProviderType.Gemini]: {
              roles: { 'role-1': 'gpt-4' },
            },
          },
        },
      },
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
        ],
        criticRoles: [],
      }],
    });

    const result = updateRoleModel(settings, 'test-profile', 'drafter', 'missing-role', 'claude-3');

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing-role');
    expect(result.settings).toBe(settings);
    expect(settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
      'role-1': 'gpt-4',
    });
  });

  it('should fail without mutating settings when profile ID does not exist', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test' },
        ],
        criticRoles: [],
      }],
    });

    const result = updateRoleModel(settings, 'missing-profile', 'drafter', 'role-1', 'gpt-4');

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing-profile');
    expect(result.settings).toBe(settings);
    expect(settings.providerModels).toBeUndefined();
    expect(settings.roleProfiles?.[0]?.roles?.[0]?.model).toBeUndefined();
  });

  it('should handle multiple role IDs sequentially', () => {
    const settings = createStepAndRoleSettings();

    const first = updateRoleModel(settings, '1', 'drafter', 'drafter-1', 'model-0');
    expect(first.success).toBe(true);

    const second = updateRoleModel(first.settings, '1', 'drafter', 'drafter-2', 'model-1');
    expect(second.success).toBe(true);

    expect(second.settings.roleProfiles?.[0]?.roles?.[0]?.model).toBe('model-0');
    expect(second.settings.roleProfiles?.[0]?.roles?.[1]?.model).toBe('model-1');
    expect(second.settings.providerModels?.roleModels?.['1']?.[ProviderType.Gemini]?.roles).toEqual({
      'drafter-1': 'model-0',
      'drafter-2': 'model-1',
    });
  });
});

describe('persistProviderModels', () => {
  it('should save and restore models using role IDs when switching providers', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' },
          { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' },
        ],
        criticRoles: [
          { id: 'critic-1', name: 'Critic 1', instruction: 'Test', model: 'gemini-pro' },
        ],
      }],
    });

    const result = persistProviderModels(settings, ProviderType.OpenRouter);

    expect(result.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]).toEqual({
      roles: {
        'role-1': 'gemini-pro',
        'role-2': 'gemini-flash',
      },
      criticRoles: {
        'critic-1': 'gemini-pro',
      },
    });
    expect(result.roleProfiles?.[0]?.roles?.[0]?.model).toBeUndefined();
    expect(result.roleProfiles?.[0]?.roles?.[1]?.model).toBeUndefined();
    expect(result.roleProfiles?.[0]?.criticRoles?.[0]?.model).toBeUndefined();
  });

  it('should save step models and clear them when switching to another provider', () => {
    const result = persistProviderModels(createStepAndRoleSettings(), ProviderType.OpenRouter);

    expect(result.provider).toBe(ProviderType.OpenRouter);
    expect(result.initialModel).toBeUndefined();
    expect(result.refinementModel).toBeUndefined();
    expect(result.synthesisModel).toBeUndefined();
    expect(result.providerModels?.stepModels?.[ProviderType.Gemini]).toEqual({
      initial: 'gemini-initial',
      refinement: 'gemini-refinement',
      synthesis: 'gemini-synthesis',
    });
    expect(result.providerModels?.roleModels?.['1']?.[ProviderType.Gemini]).toEqual({
      roles: { 'drafter-1': 'gemini-model-1' },
      criticRoles: { 'critic-1': 'gemini-critic-1' },
    });
  });

  it('should restore previously saved models when switching back', () => {
    const settings = createMockSettings({
      provider: ProviderType.OpenRouter,
      providerModels: {
        stepModels: {},
        roleModels: {
          'test-profile': {
            [ProviderType.Gemini]: {
              roles: {
                'role-1': 'gemini-pro',
                'role-2': 'gemini-flash',
              },
            },
          },
        },
      },
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
          { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'claude-3' },
        ],
        criticRoles: [],
      }],
    });

    const result = persistProviderModels(settings, ProviderType.Gemini);

    expect(result.providerModels?.roleModels?.['test-profile']?.[ProviderType.OpenRouter]).toEqual({
      roles: {
        'role-1': 'gpt-4',
        'role-2': 'claude-3',
      },
    });
    expect(result.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-pro');
    expect(result.roleProfiles?.[0]?.roles?.[1]?.model).toBe('gemini-flash');
  });

  it('should restore step models when switching back and preserve the other provider history', () => {
    let state = persistProviderModels(createStepAndRoleSettings(), ProviderType.OpenRouter);

    state = {
      ...state,
      initialModel: 'or-initial',
      refinementModel: 'or-refinement',
      synthesisModel: 'or-synthesis',
      roleProfiles: [{
        ...state.roleProfiles![0],
        roles: [
          { ...state.roleProfiles![0].roles[0], model: 'or-model-1' },
          { ...state.roleProfiles![0].roles[1] },
        ],
        criticRoles: [{ ...state.roleProfiles![0].criticRoles![0] }],
      }],
    };

    state = persistProviderModels(state, ProviderType.Gemini);

    expect(state.provider).toBe(ProviderType.Gemini);
    expect(state.initialModel).toBe('gemini-initial');
    expect(state.refinementModel).toBe('gemini-refinement');
    expect(state.synthesisModel).toBe('gemini-synthesis');
    expect(state.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-model-1');
    expect(state.roleProfiles?.[0]?.criticRoles?.[0]?.model).toBe('gemini-critic-1');
    expect(state.providerModels?.stepModels?.[ProviderType.OpenRouter]).toEqual({
      initial: 'or-initial',
      refinement: 'or-refinement',
      synthesis: 'or-synthesis',
    });
    expect(state.providerModels?.roleModels?.['1']?.[ProviderType.OpenRouter]).toEqual({
      roles: { 'drafter-1': 'or-model-1' },
      criticRoles: undefined,
    });
  });

  it('should handle multiple switches correctly for step models', () => {
    let state = createStepAndRoleSettings();

    state = persistProviderModels(state, ProviderType.OpenRouter);
    state = { ...state, initialModel: 'or-initial' };

    state = persistProviderModels(state, ProviderType.Gemini);
    expect(state.initialModel).toBe('gemini-initial');

    state = persistProviderModels(state, ProviderType.OpenRouter);
    expect(state.initialModel).toBe('or-initial');
  });

  it('should handle role reordering correctly with ID-based mapping', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' },
          { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' },
        ],
        criticRoles: [],
      }],
    });

    const reordered = {
      ...settings,
      roleProfiles: [{
        ...settings.roleProfiles![0],
        roles: [
          { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' },
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' },
        ],
      }],
    };

    const switchedToOpenRouter = persistProviderModels(reordered, ProviderType.OpenRouter);
    const switchedBack = persistProviderModels(switchedToOpenRouter, ProviderType.Gemini);

    expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.id).toBe('role-2');
    expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-flash');
    expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.id).toBe('role-1');
    expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.model).toBe('gemini-pro');
  });

  it('should handle role deletion gracefully', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' },
          { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' },
          { id: 'role-3', name: 'Role 3', instruction: 'Test', model: 'claude-3' },
        ],
        criticRoles: [],
      }],
    });

    const switched = persistProviderModels(settings, ProviderType.OpenRouter);

    expect(switched.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
      'role-1': 'gemini-pro',
      'role-2': 'gemini-flash',
      'role-3': 'claude-3',
    });

    const afterDeletion = {
      ...switched,
      roleProfiles: [{
        ...switched.roleProfiles![0],
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test' },
          { id: 'role-3', name: 'Role 3', instruction: 'Test' },
        ],
      }],
    };

    const switchedBack = persistProviderModels(afterDeletion, ProviderType.Gemini);

    expect(switchedBack.roleProfiles?.[0]?.roles).toHaveLength(2);
    expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.id).toBe('role-1');
    expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-pro');
    expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.id).toBe('role-3');
    expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.model).toBe('claude-3');
  });

  it('should handle multiple reorderings with model preservation', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-A', name: 'Role A', instruction: 'Test', model: 'model-A' },
          { id: 'role-B', name: 'Role B', instruction: 'Test', model: 'model-B' },
          { id: 'role-C', name: 'Role C', instruction: 'Test', model: 'model-C' },
        ],
        criticRoles: [],
      }],
    });

    const switched = persistProviderModels(settings, ProviderType.OpenRouter);
    const reordered = {
      ...switched,
      roleProfiles: [{
        ...switched.roleProfiles![0],
        roles: [
          { id: 'role-C', name: 'Role C', instruction: 'Test' },
          { id: 'role-A', name: 'Role A', instruction: 'Test' },
          { id: 'role-B', name: 'Role B', instruction: 'Test' },
        ],
      }],
    };

    const restored = persistProviderModels(reordered, ProviderType.Gemini);

    expect(restored.roleProfiles?.[0]?.roles?.[0]?.id).toBe('role-C');
    expect(restored.roleProfiles?.[0]?.roles?.[0]?.model).toBe('model-C');
    expect(restored.roleProfiles?.[0]?.roles?.[1]?.id).toBe('role-A');
    expect(restored.roleProfiles?.[0]?.roles?.[1]?.model).toBe('model-A');
    expect(restored.roleProfiles?.[0]?.roles?.[2]?.id).toBe('role-B');
    expect(restored.roleProfiles?.[0]?.roles?.[2]?.model).toBe('model-B');
  });

  it('should handle adding new role after provider switch', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'model-1' },
        ],
        criticRoles: [],
      }],
    });

    const switched = persistProviderModels(settings, ProviderType.OpenRouter);
    const withNewRole = {
      ...switched,
      roleProfiles: [{
        ...switched.roleProfiles![0],
        roles: [
          { id: 'role-1', name: 'Role 1', instruction: 'Test' },
          { id: 'role-NEW', name: 'New Role', instruction: 'Test' },
        ],
      }],
    };

    const restored = persistProviderModels(withNewRole, ProviderType.Gemini);

    expect(restored.roleProfiles?.[0]?.roles?.[0]?.model).toBe('model-1');
    expect(restored.roleProfiles?.[0]?.roles?.[1]?.model).toBeUndefined();
  });

  it('should handle empty role list edge case', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [{
        id: 'test-profile',
        name: 'Test',
        roles: [],
        criticRoles: [],
      }],
    });

    const result = persistProviderModels(settings, ProviderType.OpenRouter);

    expect(result.roleProfiles?.[0]?.roles).toEqual([]);
    const profileModels = result.providerModels?.roleModels?.['test-profile'];
    expect(profileModels?.gemini?.roles).toBeUndefined();
    expect(profileModels?.gemini?.criticRoles).toBeUndefined();
  });

  it('should handle multiple profiles independently', () => {
    const settings = createMockSettings({
      provider: ProviderType.Gemini,
      roleProfiles: [
        {
          id: 'profile-1',
          name: 'Profile 1',
          roles: [
            { id: 'profile-1-role-1', name: 'Role 1', instruction: 'Test', model: 'model-1' },
          ],
          criticRoles: [],
        },
        {
          id: 'profile-2',
          name: 'Profile 2',
          roles: [
            { id: 'profile-2-role-1', name: 'Role 1', instruction: 'Test', model: 'model-2' },
          ],
          criticRoles: [],
        },
      ],
    });

    const switched = persistProviderModels(settings, ProviderType.OpenRouter);
    const switchedBack = persistProviderModels(switched, ProviderType.Gemini);

    expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.model).toBe('model-1');
    expect(switchedBack.roleProfiles?.[1]?.roles?.[0]?.model).toBe('model-2');
  });
});

describe('updateStepModel', () => {
  it('should update initialModel and sync with providerModels', () => {
    const result = updateStepModel(createStepAndRoleSettings(), 'initialModel', 'new-gemini-initial');

    expect(result.success).toBe(true);
    expect(result.settings.initialModel).toBe('new-gemini-initial');
    expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBe('new-gemini-initial');
  });

  it('should update refinementModel and sync with providerModels', () => {
    const result = updateStepModel(createStepAndRoleSettings(), 'refinementModel', 'new-gemini-refinement');

    expect(result.success).toBe(true);
    expect(result.settings.refinementModel).toBe('new-gemini-refinement');
    expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.refinement).toBe('new-gemini-refinement');
  });

  it('should update synthesisModel and sync with providerModels', () => {
    const result = updateStepModel(createStepAndRoleSettings(), 'synthesisModel', 'new-gemini-synthesis');

    expect(result.success).toBe(true);
    expect(result.settings.synthesisModel).toBe('new-gemini-synthesis');
    expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.synthesis).toBe('new-gemini-synthesis');
  });

  it('should handle clearing step models to undefined', () => {
    const result = updateStepModel(createStepAndRoleSettings(), 'initialModel', undefined);

    expect(result.success).toBe(true);
    expect(result.settings.initialModel).toBeUndefined();
    expect(result.settings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBeUndefined();
  });
});
