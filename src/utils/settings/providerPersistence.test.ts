import { describe, it, expect } from 'vitest';
import { updateRoleModel, persistProviderModels } from '@/utils/settings/providerPersistence';
import { ProviderType } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';

describe('providerPersistence with Role IDs', () => {
  describe('updateRoleModel', () => {
    it('should update role model using role ID', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test' },
            { id: 'role-2', name: 'Role 2', instruction: 'Test' }
          ],
          criticRoles: []
        }]
      });

      const result = updateRoleModel(settings, 'test-profile', 'drafter', 'role-2', 'gpt-4');

      // Check success
      expect(result.success).toBe(true);
      
      // Check role profile was updated
      const updatedRole = result.settings.roleProfiles?.[0]?.roles?.[1];
      expect(updatedRole?.model).toBe('gpt-4');

      // Check providerModels was synced
      expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
        'role-2': 'gpt-4'
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
                roles: { 'role-1': 'gpt-4' }
              }
            }
          }
        },
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' }
          ],
          criticRoles: []
        }]
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
            { id: 'critic-1', name: 'Critic 1', instruction: 'Test' }
          ]
        }]
      });

      const result = updateRoleModel(settings, 'test-profile', 'critic', 'critic-1', 'claude-3');

      expect(result.success).toBe(true);
      expect(result.settings.roleProfiles?.[0]?.criticRoles?.[0]?.model).toBe('claude-3');
      expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.criticRoles).toEqual({
        'critic-1': 'claude-3'
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
                roles: { 'role-1': 'gpt-4' }
              }
            }
          }
        },
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
            { id: 'role-2', name: 'Role 2', instruction: 'Test' }
          ],
          criticRoles: []
        }]
      });

      const result = updateRoleModel(settings, 'test-profile', 'drafter', 'role-2', 'claude-3');

      expect(result.success).toBe(true);
      expect(result.settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
        'role-1': 'gpt-4',
        'role-2': 'claude-3'
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
                roles: { 'role-1': 'gpt-4' }
              }
            }
          }
        },
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' }
          ],
          criticRoles: []
        }]
      });

      const result = updateRoleModel(settings, 'test-profile', 'drafter', 'missing-role', 'claude-3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing-role');
      expect(result.settings).toBe(settings);
      expect(settings.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
        'role-1': 'gpt-4'
      });
    });

    it('should fail without mutating settings when profile ID does not exist', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test' }
          ],
          criticRoles: []
        }]
      });

      const result = updateRoleModel(settings, 'missing-profile', 'drafter', 'role-1', 'gpt-4');

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing-profile');
      expect(result.settings).toBe(settings);
      expect(settings.providerModels).toBeUndefined();
      expect(settings.roleProfiles?.[0]?.roles?.[0]?.model).toBeUndefined();
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
            { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' }
          ],
          criticRoles: [
            { id: 'critic-1', name: 'Critic 1', instruction: 'Test', model: 'gemini-pro' }
          ]
        }]
      });

      const result = persistProviderModels(settings, ProviderType.OpenRouter);

      // Check that Gemini models were saved
      expect(result.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]).toEqual({
        roles: {
          'role-1': 'gemini-pro',
          'role-2': 'gemini-flash'
        },
        criticRoles: {
          'critic-1': 'gemini-pro'
        }
      });

      // Check that current models were cleared for OpenRouter
      expect(result.roleProfiles?.[0]?.roles?.[0]?.model).toBeUndefined();
      expect(result.roleProfiles?.[0]?.roles?.[1]?.model).toBeUndefined();
      expect(result.roleProfiles?.[0]?.criticRoles?.[0]?.model).toBeUndefined();
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
                  'role-2': 'gemini-flash'
                }
              }
            }
          }
        },
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
            { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'claude-3' }
          ],
          criticRoles: []
        }]
      });

      const result = persistProviderModels(settings, ProviderType.Gemini);

      // OpenRouter models should be saved
      expect(result.providerModels?.roleModels?.['test-profile']?.[ProviderType.OpenRouter]).toEqual({
        roles: {
          'role-1': 'gpt-4',
          'role-2': 'claude-3'
        }
      });

      // Gemini models should be restored
      expect(result.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-pro');
      expect(result.roleProfiles?.[0]?.roles?.[1]?.model).toBe('gemini-flash');
    });

    it('should handle role reordering correctly with ID-based mapping', () => {
      // Set up settings with role-1 = gemini-pro, role-2 = gemini-flash.
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' },
            { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' }
          ],
          criticRoles: []
        }]
      });

      // Reorder the roles while still on Gemini.
      const reordered = {
        ...settings,
        roleProfiles: [{
          ...settings.roleProfiles![0],
          // Roles are now in REVERSE order, but IDs stay the same
          roles: [
            { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' },
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' }
          ]
        }]
      };

      // Switch to OpenRouter to save the reordered Gemini models.
      const switchedToOR = persistProviderModels(reordered, ProviderType.OpenRouter);
      // Switch back to Gemini and restore by role ID.
      const switchedBack = persistProviderModels(switchedToOR, ProviderType.Gemini);

      // Models should be restored to correct roles by ID, not by index
      // Even though roles are reordered, each should get its own model back
      expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.id).toBe('role-2');
      expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-flash');
      expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.id).toBe('role-1');
      expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.model).toBe('gemini-pro');
    });

    it('should handle role deletion gracefully', () => {
      // Start with 3 roles all having models for Gemini
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gemini-pro' },
            { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'gemini-flash' },
            { id: 'role-3', name: 'Role 3', instruction: 'Test', model: 'claude-3' }
          ],
          criticRoles: []
        }]
      });

      // Switch to OpenRouter (saves Gemini models)
      const switched = persistProviderModels(settings, ProviderType.OpenRouter);
      
      // Verify all Gemini models were saved
      expect(switched.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles).toEqual({
        'role-1': 'gemini-pro',
        'role-2': 'gemini-flash',
        'role-3': 'claude-3'
      });
      
      // Now delete role-2 while on OpenRouter
      const afterDeletion = {
        ...switched,
        roleProfiles: [{
          ...switched.roleProfiles![0],
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test' },
            { id: 'role-3', name: 'Role 3', instruction: 'Test' }
          ]
        }]
      };

      // Switch back to Gemini
      const switchedBack = persistProviderModels(afterDeletion, ProviderType.Gemini);

      // Only existing roles (role-1 and role-3) should have models restored
      expect(switchedBack.roleProfiles?.[0]?.roles?.length).toBe(2);
      expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.id).toBe('role-1');
      expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.model).toBe('gemini-pro');
      expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.id).toBe('role-3');
      expect(switchedBack.roleProfiles?.[0]?.roles?.[1]?.model).toBe('claude-3');
    });

    it('should handle multiple reorderings with model preservation', () => {
      // Start with ordered roles with models
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-A', name: 'Role A', instruction: 'Test', model: 'model-A' },
            { id: 'role-B', name: 'Role B', instruction: 'Test', model: 'model-B' },
            { id: 'role-C', name: 'Role C', instruction: 'Test', model: 'model-C' }
          ],
          criticRoles: []
        }]
      });

      // Save models by switching provider
      const switched = persistProviderModels(settings, ProviderType.OpenRouter);
      
      // Reorder roles while on OpenRouter
      const reordered = {
        ...switched,
        roleProfiles: [{
          ...switched.roleProfiles![0],
          roles: [
            { id: 'role-C', name: 'Role C', instruction: 'Test' },
            { id: 'role-A', name: 'Role A', instruction: 'Test' },
            { id: 'role-B', name: 'Role B', instruction: 'Test' }
          ]
        }]
      };

      // Switch back to Gemini
      const restored = persistProviderModels(reordered, ProviderType.Gemini);

      // Each role should get its original model back, regardless of new position
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
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'model-1' }
          ],
          criticRoles: []
        }]
      });

      // Switch provider
      const switched = persistProviderModels(settings, ProviderType.OpenRouter);
      
      // Add new role while on OpenRouter
      const withNewRole = {
        ...switched,
        roleProfiles: [{
          ...switched.roleProfiles![0],
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test' },
            { id: 'role-NEW', name: 'New Role', instruction: 'Test' }
          ]
        }]
      };

      // Switch back to Gemini
      const restored = persistProviderModels(withNewRole, ProviderType.Gemini);

      // Old role should get model back
      expect(restored.roleProfiles?.[0]?.roles?.[0]?.model).toBe('model-1');
      // New role should have no model (never had one for Gemini)
      expect(restored.roleProfiles?.[0]?.roles?.[1]?.model).toBeUndefined();
    });

    it('should handle empty role list edge case', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [],
          criticRoles: []
        }]
      });

      const result = persistProviderModels(settings, ProviderType.OpenRouter);

      expect(result.roleProfiles?.[0]?.roles).toEqual([]);
      // Empty roles create an empty profile structure, not undefined
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
              { id: 'profile-1-role-1', name: 'Role 1', instruction: 'Test', model: 'model-1' }
            ],
            criticRoles: []
          },
          {
            id: 'profile-2',
            name: 'Profile 2',
            roles: [
              { id: 'profile-2-role-1', name: 'Role 1', instruction: 'Test', model: 'model-2' }
            ],
            criticRoles: []
          }
        ]
      });

      const switched = persistProviderModels(settings, ProviderType.OpenRouter);
      const switchedBack = persistProviderModels(switched, ProviderType.Gemini);

      // Each profile should restore its own models
      expect(switchedBack.roleProfiles?.[0]?.roles?.[0]?.model).toBe('model-1');
      expect(switchedBack.roleProfiles?.[1]?.roles?.[0]?.model).toBe('model-2');
    });
  });
});
