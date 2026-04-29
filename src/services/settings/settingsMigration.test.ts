import { describe, it, expect } from 'vitest';
import { migrateSettings } from './settingsMigration';
import { RoleProfile, ProviderType } from '@/types';
import { DEFAULT_ROLE_PROFILES } from '@/constants/roles';
import { createMockSettings } from '@/test/utils/settingsMocks';

describe('settingsMigration', () => {
  describe('Migration 16: providerModels and Role IDs', () => {
    it('should preserve settings when providerModels exists and all roles have IDs', () => {
      const settings = createMockSettings({
        providerModels: { stepModels: {}, roleModels: {} },
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test' }
          ],
          criticRoles: []
        }]
      });

      const result = migrateSettings(settings);

      // We check if it's basically the same (migrateSettings might add default fields)
      expect(result.providerModels).toBeDefined();
      expect(result.roleProfiles![0].roles[0].id).toBe('role-1');
    });

    it('should migrate step models to providerModels when missing', () => {
      const settings = createMockSettings({
        initialModel: 'gemini-pro',
        refinementModel: 'gemini-flash',
        synthesisModel: 'gemini-pro',
        provider: ProviderType.Gemini,
        roleProfiles: []
      });

      const result = migrateSettings(settings);

      expect(result.providerModels).toBeDefined();
      expect(result.providerModels?.stepModels?.[ProviderType.Gemini]).toEqual({
        initial: 'gemini-pro',
        refinement: 'gemini-flash',
        synthesis: 'gemini-pro'
      });
    });

    it('should migrate role models using role IDs', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
            { id: 'role-2', name: 'Role 2', instruction: 'Test', model: 'claude-3' }
          ],
          criticRoles: [
            { id: 'critic-1', name: 'Critic 1', instruction: 'Test', model: 'gemini-pro' }
          ]
        }]
      });

      const result = migrateSettings(settings);

      expect(result.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]).toEqual({
        roles: {
          'role-1': 'gpt-4',
          'role-2': 'claude-3'
        },
        criticRoles: {
          'critic-1': 'gemini-pro'
        }
      });
    });

    it('should assign IDs to roles missing them during migration', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'gpt-4' },
            { name: 'Role 2', instruction: 'Test', model: 'claude-3' } as any // Missing ID
          ],
          criticRoles: []
        }]
      });

      const result = migrateSettings(settings);

      const profile = result.roleProfiles![0];
      const role2Id = profile.roles[1].id;
      expect(role2Id).toBeDefined();

      const roles = result.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles;
      expect(roles).toEqual({
        'role-1': 'gpt-4',
        [role2Id]: 'claude-3'
      });
    });

    it('should regenerate IDs for duplicate roles within a profile', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [
            { id: 'dup-id', name: 'Role 1', instruction: 'Test', model: 'model-1' },
            { id: 'dup-id', name: 'Role 2', instruction: 'Test', model: 'model-2' }
          ],
          criticRoles: []
        }]
      });

      const result = migrateSettings(settings);
      const profile = result.roleProfiles![0];
      const role1 = profile.roles[0];
      const role2 = profile.roles[1];

      expect(role1.id).not.toBe(role2.id);
      
      const storedModels = result.providerModels?.roleModels?.['test-profile']?.[ProviderType.Gemini]?.roles;
      expect(storedModels?.[role1.id]).toBe('model-1');
      expect(storedModels?.[role2.id]).toBe('model-2');
    });
  });

  describe('Global Constant Integrity', () => {
    it('should not mutate DEFAULT_ROLE_PROFILES when adding custom profiles', () => {
      const defaultProfilesBeforeMigration = structuredClone(DEFAULT_ROLE_PROFILES);
      const settings = createMockSettings({
        roleProfiles: undefined, // Force default loaded
        agentRoles: [{ name: 'Legacy Role', instruction: 'Legacy' }] // Trigger custom profile creation
      } as any);

      migrateSettings(settings);

      expect(DEFAULT_ROLE_PROFILES).toEqual(defaultProfilesBeforeMigration);
      
      const customProfileInDefault = DEFAULT_ROLE_PROFILES.find((p: RoleProfile) => p.id === 'custom-roles-migrated');
      expect(customProfileInDefault).toBeUndefined();
    });
  });

  describe('Migration 5.1: Saved Roles IDs', () => {
    it('should ensure savedRoles have IDs', () => {
      const settings = createMockSettings({
        savedRoles: [
            { name: 'Role 1', instruction: 'Inst 1', model: 'gpt-4' } as any, // Missing ID
            { id: 'existing-id', name: 'Role 2', instruction: 'Inst 2' }
        ]
      });

      const result = migrateSettings(settings);

      expect(result.savedRoles).toHaveLength(2);
      expect(result.savedRoles[0].id).toBeDefined();
      expect(result.savedRoles[0].id).not.toBe('');
      expect(result.savedRoles[1].id).toBe('existing-id');
    });

    it('should replace whitespace-only savedRole IDs', () => {
      const settings = createMockSettings({
        savedRoles: [
          { id: '   ', name: 'Whitespace Role', instruction: 'Inst' } as any
        ]
      });

      const result = migrateSettings(settings);

      expect(result.savedRoles[0].id).toBeDefined();
      expect(result.savedRoles[0].id.trim()).not.toBe('');
      expect(result.savedRoles[0].id).not.toBe('   ');
    });
  });

  describe('Migration 4.1: Saved Instructions IDs', () => {
    it('should ensure savedInstructions have IDs', () => {
      const settings = createMockSettings({
        savedInstructions: [
          { name: 'Inst 1', type: 'initial_prompt', content: 'Test' } as any, // Missing ID
          { id: 'existing-inst-id', name: 'Inst 2', type: 'refinement_prompt', content: 'Test 2' }
        ]
      });

      const result = migrateSettings(settings);

      expect(result.savedInstructions).toHaveLength(2);
      expect(result.savedInstructions[0].id).toBeDefined();
      expect(result.savedInstructions[0].id).not.toBe('');
      expect(result.savedInstructions[1].id).toBe('existing-inst-id');
    });

    it('should replace whitespace-only savedInstruction IDs', () => {
      const settings = createMockSettings({
        savedInstructions: [
          { id: '   ', name: 'Whitespace Inst', type: 'initial_prompt', content: 'Test' } as any
        ]
      });

      const result = migrateSettings(settings);

      expect(result.savedInstructions[0].id).toBeDefined();
      expect(result.savedInstructions[0].id.trim()).not.toBe('');
      expect(result.savedInstructions[0].id).not.toBe('   ');
    });
  });

  describe('Migration 2: Custom Role Profile Initialization', () => {
    it('should initialize criticRoles for custom-roles-migrated profile', () => {
      const settings = createMockSettings({
        roleProfiles: undefined,
        agentRoles: [
          { id: 'legacy-role-1', name: 'Legacy Role', instruction: 'Test' }
        ]
      } as any);

      const result = migrateSettings(settings);

      const customProfile = result.roleProfiles.find((p: RoleProfile) => p.id === 'custom-roles-migrated');
      expect(customProfile).toBeDefined();
      expect(customProfile?.criticRoles).toEqual([]);
    });
  });

  describe('Edge Cases: Critical Validation', () => {
    it('should assign IDs to criticRoles missing them', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'dev-profile',
          name: 'Dev',
          roles: [],
          criticRoles: [
            { name: 'Critic without ID', instruction: 'Critique' } as any
          ]
        }]
      });

      const result = migrateSettings(settings);
      const profile = result.roleProfiles![0];
      
      expect(profile.criticRoles).toHaveLength(1);
      expect(profile.criticRoles[0].id).toBeDefined();
      expect(profile.criticRoles[0].id).not.toBe('');
    });

    it('should handle roles with missing names and IDs gracefully', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'malformed-profile',
          name: 'Malformed',
          roles: [
            { instruction: 'Just instruction' } as any
          ],
          criticRoles: []
        }]
      });

      const result = migrateSettings(settings);
      const role = result.roleProfiles![0].roles[0];
      
      expect(role.id).toBeDefined();
      expect(role.instruction).toBe('Just instruction');
      // Should not throw and should generate an ID
    });
    
    it('should assign IDs to multiple roles with missing IDs ensuring uniqueness', () => {
        const settings = createMockSettings({
          roleProfiles: [{
            id: 'multi-missing',
            name: 'Multi Missing',
            roles: [
              { name: 'R1', instruction: 'I1' } as any,
              { name: 'R2', instruction: 'I2' } as any
            ],
            criticRoles: []
          }]
        });
  
        const result = migrateSettings(settings);
        const roles = result.roleProfiles![0].roles;
        
        expect(roles[0].id).toBeDefined();
        expect(roles[1].id).toBeDefined();
        expect(roles[0].id).not.toEqual(roles[1].id);
      });

    it('should regenerate IDs even if they are whitespace-only strings', () => {
      const settings = createMockSettings({
        providerModels: { stepModels: {}, roleModels: {} },
        roleProfiles: [{
          id: 'whitespace-id',
          name: 'Whitespace',
          roles: [
            { id: '   ', name: 'R1', instruction: 'I1' } as any
          ],
          criticRoles: []
        }]
      });

      const result = migrateSettings(settings);
      const role = result.roleProfiles![0].roles[0];
      
      expect(role.id).toBeDefined();
      expect(role.id.trim()).not.toBe('');
      expect(role.id).not.toBe('   ');
    });
  });
});
