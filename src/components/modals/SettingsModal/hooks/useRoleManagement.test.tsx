import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoleManagement } from '@/components/modals/SettingsModal/hooks/useRoleManagement';
import { type AppSettings, ProviderType } from '@/types';
import { DEFAULT_ROLE_PROFILES } from '@/constants/roles';
import { useState } from 'react';
import { createMockSettings } from '@test/settingsMocks';
import * as providerPersistence from '@/utils/settings/providerPersistence';
import * as uuidModule from '@/utils/common/uuid';
import * as roleUtils from '@/utils/chat/roleUtils';

describe('useRoleManagement', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setupHook = (
    initialSettings: AppSettings,
    roleType: 'drafter' | 'critic' = 'drafter',
    onShowError?: (message: string) => void
  ) => {
    return renderHook(() => {
      const [settings, setSettings] = useState(initialSettings);
      const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) 
        || settings.roleProfiles?.[0] 
        || { id: 'test', name: 'Test', roles: [], criticRoles: [] };
      
      const hook = useRoleManagement(
        settings,
        setSettings,
        activeRoleProfile,
        roleType,
        onShowError
      );
      
      return { settings, hook };
    });
  };

  describe('handleAddRole', () => {
    it('should add new role with generated ID', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Existing', instruction: 'Test' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleAddRole();
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles).toHaveLength(2);
      expect(profile.roles[1].id).toBeTruthy();
      expect(profile.roles[1].id).not.toBe('role-1');
    });

    it('should generate unique IDs for multiple new roles', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleAddRole();
        result.current.hook.handleAddRole();
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles).toHaveLength(2);
      expect(profile.roles[0].id).not.toBe(profile.roles[1].id);
    });
  });

  describe('handleDeleteRole', () => {
    it('should delete role at specified index', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'R1', instruction: '' },
            { id: 'role-2', name: 'R2', instruction: '' },
            { id: 'role-3', name: 'R3', instruction: '' }
          ],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleDeleteRole(1); // Delete middle
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles).toHaveLength(2);
      expect(profile.roles[0].id).toBe('role-1');
      expect(profile.roles[1].id).toBe('role-3');
    });

    it('should remove deleted role model mappings across providers', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'R1', instruction: '' },
            { id: 'role-2', name: 'R2', instruction: '' }
          ],
          criticRoles: [
            { id: 'critic-1', name: 'C1', instruction: '' }
          ]
        }],
        providerModels: {
          stepModels: {},
          roleModels: {
            'test-profile': {
              [ProviderType.Gemini]: {
                roles: {
                  'role-1': 'gemini-role-1',
                  'role-2': 'gemini-role-2'
                },
                criticRoles: {
                  'critic-1': 'gemini-critic-1'
                }
              },
              [ProviderType.OpenRouter]: {
                roles: {
                  'role-2': 'openrouter-role-2'
                }
              }
            }
          }
        }
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleDeleteRole(1);
      });

      const providerData = result.current.settings.providerModels?.roleModels?.['test-profile'];
      expect(providerData?.[ProviderType.Gemini]?.roles).toEqual({
        'role-1': 'gemini-role-1'
      });
      expect(providerData?.[ProviderType.Gemini]?.criticRoles).toEqual({
        'critic-1': 'gemini-critic-1'
      });
      expect(providerData?.[ProviderType.OpenRouter]?.roles).toBeUndefined();
    });
  });

  describe('handleMoveRole', () => {
    it('should move role up', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'R1', instruction: '' },
            { id: 'role-2', name: 'R2', instruction: '' }
          ],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleMoveRole(1, 'up');
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles[0].id).toBe('role-2');
      expect(profile.roles[1].id).toBe('role-1');
    });

    it('should leave the order unchanged when moving beyond list boundaries', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'R1', instruction: '' },
            { id: 'role-2', name: 'R2', instruction: '' }
          ],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleMoveRole(0, 'up');
        result.current.hook.handleMoveRole(1, 'down');
      });

      expect(result.current.settings.roleProfiles?.[0].roles.map(role => role.id)).toEqual(['role-1', 'role-2']);
    });

    it('should move role down', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'R1', instruction: '' },
            { id: 'role-2', name: 'R2', instruction: '' },
            { id: 'role-3', name: 'R3', instruction: '' }
          ],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleMoveRole(0, 'down');
      });

      expect(result.current.settings.roleProfiles?.[0].roles.map(role => role.id)).toEqual(['role-2', 'role-1', 'role-3']);
    });
  });

  describe('handleRoleChange', () => {
    it('updates non-model fields inline', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Old Name', instruction: 'Old instruction' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRoleChange(0, 'name', 'New Name');
        result.current.hook.handleRoleChange(0, 'instruction', 'New instruction');
      });

      expect(result.current.settings.roleProfiles?.[0].roles[0]).toMatchObject({
        name: 'New Name',
        instruction: 'New instruction'
      });
    });

    it('reports an error when model update targets a missing role', async () => {
      vi.useFakeTimers();
      const onShowError = vi.fn();
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleRoleChange(0, 'model', 'new-model');
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onShowError).toHaveBeenCalledWith(expect.stringContaining('Invalid role data at index 0'));
      expect(result.current.settings.roleProfiles?.[0].roles).toEqual([]);
    });

    it('reports an error when model update targets a role with an invalid id', async () => {
      vi.useFakeTimers();
      const onShowError = vi.fn();
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: '   ', name: 'Broken Role', instruction: '' } as any],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleRoleChange(0, 'model', 'new-model');
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onShowError).toHaveBeenCalledWith(expect.stringContaining('Cannot update role "Broken Role"'));
      expect(result.current.settings.roleProfiles?.[0].roles[0]).toMatchObject({
        id: '   ',
        name: 'Broken Role',
      });
      expect(result.current.settings.roleProfiles?.[0].roles[0]).not.toHaveProperty('model');
    });

    it('reports persistence failures returned by updateRoleModel', async () => {
      vi.useFakeTimers();
      vi.spyOn(providerPersistence, 'updateRoleModel').mockReturnValue({
        settings: createMockSettings(),
        success: false,
        error: 'Failed to persist role model'
      });
      const onShowError = vi.fn();
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Role', instruction: '' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleRoleChange(0, 'model', 'broken-model');
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to persist role model');
      expect(result.current.settings.roleProfiles?.[0].roles[0].model).toBeUndefined();
    });

    it('leaves settings unchanged when the active profile cannot be found during model updates', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'missing-profile',
        roleProfiles: []
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRoleChange(0, 'model', 'ignored-model');
      });

      expect(result.current.settings.roleProfiles).toEqual([]);
      expect(result.current.settings.activeRoleProfileId).toBe('missing-profile');
    });
  });

  describe('handleApplyRole', () => {
    it('applies critic role presets and syncs provider model mappings', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'test-profile',
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: [{ id: 'critic-1', name: 'Old Critic', instruction: 'Old instruction' }]
        }]
      });

      const { result } = setupHook(settings, 'critic');

      act(() => {
        result.current.hook.handleApplyRole(0, {
          name: 'Security Auditor',
          instruction: 'Audit security',
          model: 'gemini-security'
        });
      });

      expect(result.current.settings.roleProfiles?.[0].criticRoles?.[0]).toMatchObject({
        name: 'Security Auditor',
        instruction: 'Audit security',
        model: 'gemini-security'
      });
      expect(result.current.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.criticRoles?.['critic-1'])
        .toBe('gemini-security');
    });

    it('reports an error when applying a preset to a missing role index', async () => {
      vi.useFakeTimers();
      const onShowError = vi.fn();
      const settings = createMockSettings({
        activeRoleProfileId: 'test-profile',
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Existing', instruction: '' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleApplyRole(3, { name: 'Preset', instruction: 'Preset instruction', model: 'model-x' });
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onShowError).toHaveBeenCalledWith('Cannot apply role preset: Invalid role data at index. Please try again or contact support.');
      expect(result.current.settings.roleProfiles?.[0].roles[0]).toMatchObject({ name: 'Existing', instruction: '' });
    });

    it('updates name and instruction without syncing providerModels when the preset has no model', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'test-profile',
        provider: ProviderType.Gemini,
        providerModels: {
          stepModels: {},
          roleModels: {
            'test-profile': {
              [ProviderType.Gemini]: {
                roles: { 'role-1': 'existing-model' }
              }
            }
          }
        },
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Old Role', instruction: 'Old instruction', model: 'existing-model' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter');

      act(() => {
        result.current.hook.handleApplyRole(0, {
          name: 'Preset Role',
          instruction: 'Preset instruction'
        });
      });

      expect(result.current.settings.roleProfiles?.[0].roles[0]).toMatchObject({
        id: 'role-1',
        name: 'Preset Role',
        instruction: 'Preset instruction',
        model: undefined,
      });
      expect(result.current.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles?.['role-1'])
        .toBe('existing-model');
    });

    it('reports invalid role data when applying a preset to a role with an invalid id', async () => {
      vi.useFakeTimers();
      const onShowError = vi.fn();
      const settings = createMockSettings({
        activeRoleProfileId: 'test-profile',
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: '   ', name: 'Broken Role', instruction: 'Broken instruction' } as any],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleApplyRole(0, { name: 'Preset', instruction: 'Preset instruction', model: 'model-x' });
      });
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onShowError).toHaveBeenCalledWith('Cannot apply role preset: Invalid role data. Please try again or contact support.');
      expect(result.current.settings.roleProfiles?.[0].roles[0]).toMatchObject({
        id: '   ',
        name: 'Broken Role',
        instruction: 'Broken instruction'
      });
    });

    it('reports model persistence failures when applying a preset but keeps the renamed role data', async () => {
      vi.useFakeTimers();
      vi.spyOn(providerPersistence, 'updateRoleModel').mockReturnValue({
        settings: createMockSettings(),
        success: false,
        error: 'Failed to apply role preset model'
      });
      const onShowError = vi.fn();
      const settings = createMockSettings({
        activeRoleProfileId: 'test-profile',
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Old Role', instruction: 'Old instruction' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleApplyRole(0, {
          name: 'Preset Role',
          instruction: 'Preset instruction',
          model: 'broken-model'
        });
      });

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to apply role preset model');
      expect(result.current.settings.roleProfiles?.[0].roles[0]).toMatchObject({
        id: 'role-1',
        name: 'Preset Role',
        instruction: 'Preset instruction',
        model: 'broken-model'
      });
    });

    it('leaves settings unchanged when the active profile is missing during preset application', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'missing-profile',
        roleProfiles: []
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleApplyRole(0, { name: 'Ignored', instruction: 'Ignored', model: 'ignored' });
      });

      expect(result.current.settings.roleProfiles).toEqual([]);
    });
  });

  describe('handleRestoreDefaultRoles', () => {
    it('should restore default roles with NEW unique IDs to prevent conflicts across profiles', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'default-roles',
        roleProfiles: [{
          id: 'default-roles',
          name: 'Default Roles',
          roles: [{ id: 'custom', name: 'Custom', instruction: '' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRestoreDefaultRoles();
      });

      const profile = result.current.settings.roleProfiles![0];
      const defaultProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === 'default-roles')!;
      
      // Should have same number of roles as default
      expect(profile.roles).toHaveLength(defaultProfile.roles.length);
      
      // CRITICAL: IDs should be DIFFERENT from DEFAULT_ROLE_PROFILES to prevent collisions
      // If we restore defaults to multiple profiles, they would all share the same IDs otherwise
      expect(profile.roles[0].id).not.toBe(defaultProfile.roles[0].id);
      
      // Names and instructions should match defaults
      expect(profile.roles[0].name).toBe(defaultProfile.roles[0].name);
      expect(profile.roles[0].instruction).toBe(defaultProfile.roles[0].instruction);
      
      // Deep clone check (object reference should be different)
      expect(profile.roles[0]).not.toBe(defaultProfile.roles[0]);
    });

    it('should clear stale providerModels when restoring default roles', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'default-roles',
        roleProfiles: [{
          id: 'default-roles',
          name: 'Default Roles',
          roles: [{ id: 'old-role', name: 'Old Role', instruction: '' }],
          criticRoles: [{ id: 'old-critic', name: 'Old Critic', instruction: '' }]
        }],
        providerModels: {
          stepModels: {},
          roleModels: {
            'default-roles': {
              [ProviderType.Gemini]: {
                roles: { 'old-role': 'gemini-old-role' },
                criticRoles: { 'old-critic': 'gemini-old-critic' }
              },
              [ProviderType.OpenRouter]: {
                roles: { 'old-role': 'openrouter-old-role' },
                criticRoles: { 'old-critic': 'openrouter-old-critic' }
              }
            }
          }
        }
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRestoreDefaultRoles();
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles[0].id).not.toBe('old-role');
      expect(profile.criticRoles![0].id).not.toBe('old-critic');
      expect(result.current.settings.providerModels?.roleModels?.['default-roles']).toEqual({});
    });

    it('should generate unique IDs across multiple profile restorations', () => {
      // Independent restorations should not reuse the static DEFAULT_ROLE_PROFILES IDs.
      const settings = createMockSettings({
        activeRoleProfileId: 'default-roles',
        roleProfiles: [
          {
            id: 'default-roles',
            name: 'Profile 1',
            roles: [{ id: 'old-1', name: 'Old', instruction: '' }],
            criticRoles: []
          }
        ]
      });

      const { result } = setupHook(settings);

      // Restore to first profile
      act(() => {
        result.current.hook.handleRestoreDefaultRoles();
      });

      const profile1Ids = result.current.settings.roleProfiles![0].roles.map(r => r.id);
      const defaultProfile = DEFAULT_ROLE_PROFILES.find(p => p.id === 'default-roles')!;

      // All IDs should be unique (not from DEFAULT_ROLE_PROFILES)
      profile1Ids.forEach(id => {
        expect(defaultProfile.roles.some(r => r.id === id)).toBe(false);
      });

      // Simulate another independent restoration with the same defaults.
      const settings2 = createMockSettings({
        activeRoleProfileId: 'default-roles',
        roleProfiles: [
          {
            id: 'default-roles',
            name: 'Profile 2',
            roles: [{ id: 'old-2', name: 'Old', instruction: '' }],
            criticRoles: []
          }
        ]
      });

      const { result: result2 } = setupHook(settings2);

      act(() => {
        result2.current.hook.handleRestoreDefaultRoles();
      });

      const profile2Ids = result2.current.settings.roleProfiles![0].roles.map(r => r.id);

      // CRITICAL: both restorations should produce different IDs.
      profile1Ids.forEach(id1 => {
        expect(profile2Ids).not.toContain(id1);
      });
    });

    it('falls back to the first default role profile when the active profile id is unknown', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'custom-profile',
        roleProfiles: [{
          id: 'custom-profile',
          name: 'Custom Profile',
          roles: [{ id: 'old-role', name: 'Old', instruction: '' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRestoreDefaultRoles();
      });

      const restoredProfile = result.current.settings.roleProfiles?.[0];
      const fallbackDefaults = DEFAULT_ROLE_PROFILES[0];
      expect(restoredProfile?.roles).toHaveLength(fallbackDefaults.roles.length);
      expect(restoredProfile?.roles[0].name).toBe(fallbackDefaults.roles[0].name);
    });

    it('reports restore failures when role cloning throws', () => {
      vi.spyOn(roleUtils, 'cloneRolesWithNewIds').mockImplementation(() => {
        throw new Error('clone failed');
      });
      const onShowError = vi.fn();
      const settings = createMockSettings({
        activeRoleProfileId: 'default-roles',
        roleProfiles: [{
          id: 'default-roles',
          name: 'Default Roles',
          roles: [{ id: 'old-role', name: 'Old', instruction: '' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleRestoreDefaultRoles();
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to restore default roles due to an internal error. Please try again.');
      expect(result.current.settings.roleProfiles?.[0].roles[0].id).toBe('old-role');
    });
  });

  describe('Rapid Sequential Updates', () => {
    it('should correctly update a newly added role model without stale closure issues', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        // Rapid sequential calls
        result.current.hook.handleAddRole();
        // Here, if it was a stale closure, it would use the old (empty) roles list
        // and fail to find the role at index 0.
        result.current.hook.handleRoleChange(0, 'model', 'new-model');
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles).toHaveLength(1);
      expect(profile.roles[0].model).toBe('new-model');
      
      // Verify providerModels sync
      const roleId = profile.roles[0].id;
      expect(result.current.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles?.[roleId]).toBe('new-model');
    });

    it('shows an error when UUID generation fails while adding a role', () => {
      vi.spyOn(uuidModule, 'generateUUID').mockImplementation(() => {
        throw new Error('uuid failed');
      });
      const onShowError = vi.fn();
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings, 'drafter', onShowError);

      act(() => {
        result.current.hook.handleAddRole();
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to generate unique ID for the new role. Please try again.');
      expect(result.current.settings.roleProfiles?.[0].roles).toEqual([]);
    });

    it('should correctly handle multiple rapid moves', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'R1', instruction: '' },
            { id: 'role-2', name: 'R2', instruction: '' },
            { id: 'role-3', name: 'R3', instruction: '' }
          ],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        // Move role 3 to the top rapidly
        result.current.hook.handleMoveRole(2, 'up'); // [R1, R3, R2]
        result.current.hook.handleMoveRole(1, 'up'); // [R3, R1, R2]
      });

      const profile = result.current.settings.roleProfiles![0];
      expect(profile.roles[0].id).toBe('role-3');
      expect(profile.roles[1].id).toBe('role-1');
      expect(profile.roles[2].id).toBe('role-2');
    });
  });
});
