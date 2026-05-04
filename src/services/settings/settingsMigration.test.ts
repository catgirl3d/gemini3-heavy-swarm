import { describe, it, expect } from 'vitest';
import { migrateSettings } from './settingsMigration';
import { PROMPT_TYPES, type RoleProfile, ProviderType } from '@/types';
import { DEFAULT_ROLE_PROFILES } from '@/constants/roles';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { DEFAULT_PROFILES, MAX_OUTPUT_TOKENS_LIMIT } from '@/constants';

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
    it('loads only default role profiles when legacy roleProfiles are missing but no agentRoles exist', () => {
      const result = migrateSettings({
        ...createMockSettings({
          roleProfiles: undefined as any,
        }),
        agentRoles: undefined,
      } as any);

      expect(result.activeRoleProfileId).toBe('default-roles');
      expect(result.roleProfiles.find((profile) => profile.id === 'custom-roles-migrated')).toBeUndefined();
    });

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

  describe('Legacy profile and default-value migration', () => {
    it('falls back to default prompt instructions when migrated legacy fields are empty or undefined', () => {
      const result = migrateSettings({
        ...createMockSettings({
          profiles: undefined as any,
        }),
        initialInstruction: '',
        refinementInstruction: 'Custom refinement',
        synthesizerInstruction: undefined,
      } as any);

      const customProfile = result.profiles.find((profile) => profile.id === 'custom-migrated');
      expect(customProfile).toMatchObject({
        initialInstruction: DEFAULT_PROFILES[0].initialInstruction,
        refinementInstruction: 'Custom refinement',
        synthesizerInstruction: DEFAULT_PROFILES[0].synthesizerInstruction,
      });
    });

    it('keeps the default prompt profile active when legacy instructions already match defaults', () => {
      const result = migrateSettings({
        ...createMockSettings({
          profiles: undefined as any,
        }),
        initialInstruction: DEFAULT_PROFILES[0].initialInstruction,
        refinementInstruction: DEFAULT_PROFILES[0].refinementInstruction,
        synthesizerInstruction: DEFAULT_PROFILES[0].synthesizerInstruction,
      } as any);

      expect(result.activeProfileId).toBe('default');
      expect(result.profiles).toEqual([DEFAULT_PROFILES[0]]);
      expect(result.profiles.find((profile) => profile.id === 'custom-migrated')).toBeUndefined();
    });

    it('creates migrated prompt and role profiles from legacy settings without mutating the input', () => {
      const legacySettings = {
        ...createMockSettings({
          profiles: undefined as any,
          roleProfiles: undefined as any,
          savedInstructions: undefined as any,
          savedRoles: undefined as any,
          providerModels: undefined as any,
          provider: undefined as any,
          openRouterApiKey: undefined as any,
          openRouterModel: undefined as any,
          initialModel: undefined as any,
          refinementModel: undefined as any,
          synthesisModel: undefined as any,
          useSearchInInitial: undefined as any,
          useSearchInRefinement: undefined as any,
          useSearchInSynthesis: undefined as any,
          pauseAfterRefinement: undefined as any,
          dynamicAgentRoles: undefined as any,
          simulateInitialErrorAttempts: undefined as any,
          simulateRefinementErrorAttempts: undefined as any,
          simulateSynthesisErrorAttempts: undefined as any,
          maxOutputTokens: undefined as any,
          numAgents: 8,
        }),
        initialInstruction: 'Legacy initial',
        refinementInstruction: 'Legacy refinement',
        synthesizerInstruction: 'Legacy synthesis',
        agentRoles: [
          { name: 'Legacy Role', instruction: 'Legacy role instruction' } as any,
        ],
      } as any;
      const original = structuredClone(legacySettings);

      const result = migrateSettings(legacySettings);

      expect(legacySettings).toEqual(original);
      expect(result.activeProfileId).toBe('custom-migrated');
      expect(result.profiles[0]).toEqual(DEFAULT_PROFILES[0]);
      expect(result.profiles.find((profile) => profile.id === 'custom-migrated')).toMatchObject({
        initialInstruction: 'Legacy initial',
        refinementInstruction: 'Legacy refinement',
        synthesizerInstruction: 'Legacy synthesis',
      });
      expect(result.activeRoleProfileId).toBe('custom-roles-migrated');
      expect(result.roleProfiles.find((profile) => profile.id === 'custom-roles-migrated')).toMatchObject({
        roles: [{ name: 'Legacy Role', instruction: 'Legacy role instruction' }],
        criticRoles: [],
      });
      expect(result.savedInstructions).toEqual([]);
      expect(result.savedRoles).toEqual([]);
      expect(result.provider).toBe(ProviderType.Gemini);
      expect(result.openRouterApiKey).toBe('');
      expect(result.openRouterModel).toBe('');
      expect(result.initialModel).toBe('');
      expect(result.refinementModel).toBe('');
      expect(result.synthesisModel).toBe('');
      expect(result.useSearchInInitial).toBe(true);
      expect(result.useSearchInRefinement).toBe(true);
      expect(result.useSearchInSynthesis).toBe(true);
      expect(result.pauseAfterRefinement).toBe(false);
      expect(result.dynamicAgentRoles).toBe(true);
      expect(result.simulateInitialErrorAttempts).toBe(1);
      expect(result.simulateRefinementErrorAttempts).toBe(1);
      expect(result.simulateSynthesisErrorAttempts).toBe(1);
      expect(result.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_LIMIT);
      expect(result.numAgents).toBe(5);
    });

    it('adds missing mad-scientists profile to existing role profiles', () => {
      const settings = createMockSettings({
        roleProfiles: [
          structuredClone(DEFAULT_ROLE_PROFILES.find((profile) => profile.id === 'default-roles')!),
        ],
      });

      const result = migrateSettings(settings);

      expect(result.roleProfiles.some((profile) => profile.id === 'mad-scientists')).toBe(true);
    });

    it('leaves the mad-scientists profile untouched when it is already present', () => {
      const settings = createMockSettings({
        roleProfiles: structuredClone(DEFAULT_ROLE_PROFILES),
      });

      const result = migrateSettings(settings);

      expect(result.roleProfiles.filter((profile) => profile.id === 'mad-scientists')).toHaveLength(1);
    });

    it('backfills criticRoles from the matching default profile when missing', () => {
      const softwareTeam = structuredClone(DEFAULT_ROLE_PROFILES.find((profile) => profile.id === 'software-team')!);
      const settings = createMockSettings({
        roleProfiles: [
          {
            ...softwareTeam,
            criticRoles: undefined as any,
          },
        ],
      });

      const result = migrateSettings(settings);

      expect(result.roleProfiles[0].criticRoles).toEqual(softwareTeam.criticRoles);
      expect(result.roleProfiles[0].criticRoles).not.toBe(softwareTeam.criticRoles);
    });

    it('initializes missing criticRoles to an empty array for custom profiles without defaults', () => {
      const result = migrateSettings(createMockSettings({
        roleProfiles: [{
          id: 'custom-no-default',
          name: 'Custom No Default',
          roles: [{ id: 'role-1', name: 'Role 1', instruction: 'Test' }],
          criticRoles: undefined as any,
        }],
      }));

      expect(result.roleProfiles[0].criticRoles).toEqual([]);
    });

    it('migrates legacy saved instruction types to prompt type identifiers', () => {
      const result = migrateSettings(createMockSettings({
        savedInstructions: [
          { id: 'one', name: 'Initial', type: 'initial', content: 'A' } as any,
          { id: 'two', name: 'Refine', type: 'refinement', content: 'B' } as any,
          { id: 'three', name: 'Synth', type: 'synthesizer', content: 'C' } as any,
        ],
      }));

      expect(result.savedInstructions.map((instruction) => instruction.type)).toEqual([
        PROMPT_TYPES.INITIAL,
        PROMPT_TYPES.REFINEMENT,
        PROMPT_TYPES.SYNTHESIS,
      ]);
    });

    it('preserves existing providerModels and backfills missing role mappings for other profiles', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        refinementModel: 'migration-backfill-refinement',
        synthesisModel: 'migration-backfill-synthesis',
        providerModels: {
          stepModels: {
            [ProviderType.Gemini]: {
              initial: 'existing-initial',
            } as any,
          },
          roleModels: {
            'profile-a': {
              [ProviderType.Gemini]: {
                roles: { 'shared-id': 'preserved-model' },
              },
            },
          },
        },
        roleProfiles: [
          {
            id: 'profile-a',
            name: 'Profile A',
            roles: [{ id: 'shared-id', name: 'Role A', instruction: 'A', model: 'legacy-model-a' }],
            criticRoles: [],
          },
          {
            id: 'profile-b',
            name: 'Profile B',
            roles: [{ id: 'shared-id', name: 'Role B', instruction: 'B', model: 'legacy-model-b' }],
            criticRoles: [{ id: 'critic-b', name: 'Critic B', instruction: 'CB', model: 'legacy-critic-b' }],
          },
        ],
      });

      const result = migrateSettings(settings);

      expect(result.roleProfiles[0].roles[0].id).toBe('shared-id');
      expect(result.roleProfiles[1].roles[0].id).toBe('shared-id');
      expect(result.providerModels?.stepModels?.[ProviderType.Gemini]).toEqual({
        initial: 'existing-initial',
        refinement: 'migration-backfill-refinement',
        synthesis: 'migration-backfill-synthesis',
      });
      expect(result.providerModels?.roleModels?.['profile-a']?.[ProviderType.Gemini]?.roles?.['shared-id']).toBe('preserved-model');
      expect(result.providerModels?.roleModels?.['profile-b']?.[ProviderType.Gemini]?.roles?.['shared-id']).toBe('legacy-model-b');
      expect(result.providerModels?.roleModels?.['profile-b']?.[ProviderType.Gemini]?.criticRoles?.['critic-b']).toBe('legacy-critic-b');
    });

    it('backfills missing current-provider models for OpenRouter without overwriting preserved values', () => {
      const settings = createMockSettings({
        provider: ProviderType.OpenRouter,
        initialModel: 'legacy-openrouter-initial',
        refinementModel: 'legacy-openrouter-refinement',
        synthesisModel: 'legacy-openrouter-synthesis',
        providerModels: {
          stepModels: {
            [ProviderType.Gemini]: {
              initial: 'gemini-initial',
              refinement: 'gemini-refinement',
              synthesis: 'gemini-synthesis',
            },
            [ProviderType.OpenRouter]: {
              initial: 'preserved-openrouter-initial',
            } as any,
          },
          roleModels: {
            'profile-openrouter': {
              [ProviderType.Gemini]: {
                roles: { 'role-1': 'gemini-role-1' },
              },
            },
          },
        },
        roleProfiles: [{
          id: 'profile-openrouter',
          name: 'OpenRouter Profile',
          roles: [{ id: 'role-1', name: 'Role 1', instruction: 'Test', model: 'openrouter-role-1' }],
          criticRoles: [{ id: 'critic-1', name: 'Critic 1', instruction: 'Review', model: 'openrouter-critic-1' }],
        }],
      });

      const result = migrateSettings(settings);

      expect(result.providerModels?.stepModels?.[ProviderType.OpenRouter]).toEqual({
        initial: 'preserved-openrouter-initial',
        refinement: 'legacy-openrouter-refinement',
        synthesis: 'legacy-openrouter-synthesis',
      });
      expect(result.providerModels?.stepModels?.[ProviderType.Gemini]).toEqual({
        initial: 'gemini-initial',
        refinement: 'gemini-refinement',
        synthesis: 'gemini-synthesis',
      });
      expect(result.providerModels?.roleModels?.['profile-openrouter']?.[ProviderType.OpenRouter]).toEqual({
        roles: { 'role-1': 'openrouter-role-1' },
        criticRoles: { 'critic-1': 'openrouter-critic-1' },
      });
      expect(result.providerModels?.roleModels?.['profile-openrouter']?.[ProviderType.Gemini]?.roles?.['role-1']).toBe('gemini-role-1');
    });

    it('leaves already-migrated current-provider models untouched when no backfill is needed', () => {
      const settings = createMockSettings({
        provider: ProviderType.OpenRouter,
        openRouterApiKey: 'openrouter-key',
        openRouterModel: 'openrouter/global-model',
        roleProfiles: structuredClone(DEFAULT_ROLE_PROFILES),
        savedInstructions: [{ id: 'instruction-1', name: 'Saved', type: 'initial_prompt', content: 'Saved content' }],
        providerModels: {
          stepModels: {
            [ProviderType.OpenRouter]: {
              initial: 'openrouter-initial',
              refinement: 'openrouter-refinement',
              synthesis: 'openrouter-synthesis',
            },
          },
          roleModels: {},
        },
      });

      const result = migrateSettings(settings);

      expect(result.providerModels).toEqual(settings.providerModels);
      expect(result.openRouterApiKey).toBe('openrouter-key');
      expect(result.savedInstructions).toEqual(settings.savedInstructions);
      expect(result.roleProfiles).toEqual(settings.roleProfiles);
    });

    it('handles already-migrated profiles that omit roles arrays without creating provider mappings', () => {
      const result = migrateSettings(createMockSettings({
        providerModels: {
          stepModels: {
            [ProviderType.Gemini]: {
              initial: '',
              refinement: '',
              synthesis: '',
            },
          },
          roleModels: {},
        },
        roleProfiles: [{
          id: 'missing-roles-shape',
          name: 'Missing Roles Shape',
          roles: undefined as any,
          criticRoles: undefined as any,
        }],
      }));

      expect(result.roleProfiles[0].roles).toEqual([]);
      expect(result.roleProfiles[0].criticRoles).toEqual([]);
      expect(result.providerModels?.roleModels?.['missing-roles-shape']).toBeUndefined();
    });

    it('allows duplicate role IDs across different profiles during providerModels migration', () => {
      const settings = createMockSettings({
        providerModels: undefined as any,
        roleProfiles: [
          {
            id: 'profile-a',
            name: 'Profile A',
            roles: [{ id: 'shared-id', name: 'Role A', instruction: 'A', model: 'legacy-model-a' }],
            criticRoles: [],
          },
          {
            id: 'profile-b',
            name: 'Profile B',
            roles: [{ id: 'shared-id', name: 'Role B', instruction: 'B', model: 'legacy-model-b' }],
            criticRoles: [],
          },
        ],
      });

      const result = migrateSettings(settings);

      expect(result.roleProfiles[0].roles[0].id).toBe('shared-id');
      expect(result.roleProfiles[1].roles[0].id).toBe('shared-id');
      expect(result.providerModels?.roleModels?.['profile-a']?.[ProviderType.Gemini]?.roles?.['shared-id']).toBe('legacy-model-a');
      expect(result.providerModels?.roleModels?.['profile-b']?.[ProviderType.Gemini]?.roles?.['shared-id']).toBe('legacy-model-b');
    });

    it('cleans empty string role models to undefined', () => {
      const result = migrateSettings(createMockSettings({
        roleProfiles: [{
          id: 'cleanup-models',
          name: 'Cleanup Models',
          roles: [{ id: 'role-1', name: 'Role 1', instruction: 'Test', model: '' } as any],
          criticRoles: [{ id: 'critic-1', name: 'Critic 1', instruction: 'Test', model: '' } as any],
        }],
      }));

      expect(result.roleProfiles[0].roles[0].model).toBeUndefined();
      expect(result.roleProfiles[0].criticRoles?.[0].model).toBeUndefined();
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
