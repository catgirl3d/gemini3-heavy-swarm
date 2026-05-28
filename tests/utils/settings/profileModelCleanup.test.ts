import { describe, expect, it, vi } from 'vitest';
import { AppSettings, ProviderType } from '@/types';
import { createMockSettings } from '@test/settingsMocks';
import {
  cleanupProfileModels,
  cleanupRoleModels,
  clearAllRoleModelsInProfile,
  cloneProfileModels,
} from '@/utils/settings/profileModelCleanup';

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

const createSettingsWithProviderModels = (): AppSettings => createMockSettings({
  providerModels: {
    stepModels: {
      [ProviderType.Gemini]: {
        initial: 'gemini-initial',
      },
    },
    roleModels: {
      source: {
        [ProviderType.Gemini]: {
          roles: {
            roleA: 'gemini-role-a',
            roleB: 'gemini-role-b',
          },
          criticRoles: {
            criticA: 'gemini-critic-a',
            shared: 'gemini-shared-critic',
          },
        },
        [ProviderType.OpenRouter]: {
          roles: {
            roleA: 'openrouter-role-a',
          },
          criticRoles: {
            criticA: 'openrouter-critic-a',
          },
        },
      },
      other: {
        [ProviderType.Gemini]: {
          roles: {
            otherRole: 'gemini-other-role',
          },
        },
      },
    },
  },
});

describe('profileModelCleanup', () => {
  describe('cleanupRoleModels', () => {
    it('returns the same settings object when there is nothing to clean', () => {
      const noProviderModels = createMockSettings();
      const noRoleModels = createMockSettings({ providerModels: { stepModels: {} } });
      const missingProfile = createSettingsWithProviderModels();
      const missingRole = createSettingsWithProviderModels();

      expect(cleanupRoleModels(noProviderModels, 'source', 'roleA')).toBe(noProviderModels);
      expect(cleanupRoleModels(noRoleModels, 'source', 'roleA')).toBe(noRoleModels);
      expect(cleanupRoleModels(missingProfile, 'missing', 'roleA')).toBe(missingProfile);
      expect(cleanupRoleModels(missingRole, 'source', 'missing')).toBe(missingRole);
    });

    it('removes drafter role mappings across providers while preserving unrelated data', () => {
      const settings = createSettingsWithProviderModels();
      const originalRoleModels = settings.providerModels?.roleModels;

      const result = cleanupRoleModels(settings, 'source', 'roleA');

      expect(result).not.toBe(settings);
      expect(result.providerModels).not.toBe(settings.providerModels);
      expect(result.providerModels?.stepModels).toBe(settings.providerModels?.stepModels);
      expect(result.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.roles).toEqual({
        roleB: 'gemini-role-b',
      });
      expect(result.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.criticRoles).toEqual({
        criticA: 'gemini-critic-a',
        shared: 'gemini-shared-critic',
      });
      expect(result.providerModels?.roleModels?.source?.[ProviderType.OpenRouter]?.roles).toBeUndefined();
      expect(result.providerModels?.roleModels?.other).toBe(originalRoleModels?.other);
      expect(settings.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.roles?.roleA).toBe('gemini-role-a');
    });

    it('removes critic role mappings and clears empty critic maps', () => {
      const settings = createSettingsWithProviderModels();

      const result = cleanupRoleModels(settings, 'source', 'criticA');

      expect(result.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.criticRoles).toEqual({
        shared: 'gemini-shared-critic',
      });
      expect(result.providerModels?.roleModels?.source?.[ProviderType.OpenRouter]?.criticRoles).toBeUndefined();
      expect(result.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.roles).toEqual({
        roleA: 'gemini-role-a',
        roleB: 'gemini-role-b',
      });
      expect(settings.providerModels?.roleModels?.source?.[ProviderType.OpenRouter]?.criticRoles?.criticA).toBe('openrouter-critic-a');
    });

    it('removes the same role ID from drafter and critic mappings in one pass', () => {
      const settings = createMockSettings({
        providerModels: {
          roleModels: {
            source: {
              [ProviderType.Gemini]: {
                roles: { sharedId: 'drafter-model' },
                criticRoles: { sharedId: 'critic-model' },
              },
            },
          },
        },
      });

      const result = cleanupRoleModels(settings, 'source', 'sharedId');

      expect(result.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.roles).toBeUndefined();
      expect(result.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.criticRoles).toBeUndefined();
    });
  });

  describe('cleanupProfileModels', () => {
    it('returns the same settings object when the profile has no model entry', () => {
      const settings = createSettingsWithProviderModels();

      expect(cleanupProfileModels(settings, 'missing')).toBe(settings);
    });

    it('deletes only the target profile model entry', () => {
      const settings = createSettingsWithProviderModels();

      const result = cleanupProfileModels(settings, 'source');

      expect(result).not.toBe(settings);
      expect(result.providerModels?.roleModels?.source).toBeUndefined();
      expect(result.providerModels?.roleModels?.other).toEqual(settings.providerModels?.roleModels?.other);
      expect(result.providerModels?.stepModels).toBe(settings.providerModels?.stepModels);
      expect(settings.providerModels?.roleModels?.source).toBeDefined();
    });
  });

  describe('clearAllRoleModelsInProfile', () => {
    it('returns the same settings object when the profile has no model entry', () => {
      const settings = createSettingsWithProviderModels();

      expect(clearAllRoleModelsInProfile(settings, 'missing')).toBe(settings);
    });

    it('keeps the profile entry and replaces its provider mappings with an empty object', () => {
      const settings = createSettingsWithProviderModels();

      const result = clearAllRoleModelsInProfile(settings, 'source');

      expect(result.providerModels?.roleModels?.source).toEqual({});
      expect(result.providerModels?.roleModels?.other).toEqual(settings.providerModels?.roleModels?.other);
      expect(result.providerModels?.stepModels).toBe(settings.providerModels?.stepModels);
      expect(settings.providerModels?.roleModels?.source?.[ProviderType.Gemini]?.roles?.roleA).toBe('gemini-role-a');
    });
  });

  describe('cloneProfileModels', () => {
    it('returns the same settings object when the source profile has no model entry', () => {
      const settings = createSettingsWithProviderModels();

      expect(cloneProfileModels(settings, 'missing', 'target', { roleA: 'newRoleA' })).toBe(settings);
    });

    it('clones provider-specific model mappings through the role ID map', () => {
      const settings = createSettingsWithProviderModels();

      const result = cloneProfileModels(settings, 'source', 'target', {
        roleA: 'newRoleA',
        criticA: 'newCriticA',
      });

      expect(result.providerModels?.roleModels?.target?.[ProviderType.Gemini]).toEqual({
        roles: {
          newRoleA: 'gemini-role-a',
        },
        criticRoles: {
          newCriticA: 'gemini-critic-a',
        },
      });
      expect(result.providerModels?.roleModels?.target?.[ProviderType.OpenRouter]).toEqual({
        roles: {
          newRoleA: 'openrouter-role-a',
        },
        criticRoles: {
          newCriticA: 'openrouter-critic-a',
        },
      });
      expect(result.providerModels?.roleModels?.source).toBe(settings.providerModels?.roleModels?.source);
      expect(result.providerModels?.roleModels?.other).toBe(settings.providerModels?.roleModels?.other);
      expect(settings.providerModels?.roleModels?.target).toBeUndefined();
    });

    it('keeps empty buckets for source buckets whose role IDs are unmapped', () => {
      const settings = createSettingsWithProviderModels();

      const result = cloneProfileModels(settings, 'source', 'target', {});

      expect(result.providerModels?.roleModels?.target?.[ProviderType.Gemini]).toEqual({
        roles: {},
        criticRoles: {},
      });
      expect(result.providerModels?.roleModels?.target?.[ProviderType.OpenRouter]).toEqual({
        roles: {},
        criticRoles: {},
      });
    });

    it('keeps an empty provider object when the source provider has no role buckets', () => {
      const settings = createMockSettings({
        providerModels: {
          roleModels: {
            source: {
              [ProviderType.Gemini]: {},
            },
          },
        },
      });

      const result = cloneProfileModels(settings, 'source', 'target', { roleA: 'newRoleA' });

      expect(result.providerModels?.roleModels?.target).toEqual({
        [ProviderType.Gemini]: {},
      });
    });

    it('overwrites an existing target profile model entry', () => {
      const settings = createMockSettings({
        providerModels: {
          roleModels: {
            source: {
              [ProviderType.Gemini]: {
                roles: { roleA: 'source-model' },
              },
            },
            target: {
              [ProviderType.Gemini]: {
                roles: { oldTargetRole: 'old-target-model' },
              },
            },
          },
        },
      });

      const result = cloneProfileModels(settings, 'source', 'target', { roleA: 'newRoleA' });

      expect(result.providerModels?.roleModels?.target).toEqual({
        [ProviderType.Gemini]: {
          roles: { newRoleA: 'source-model' },
        },
      });
    });
  });
});
