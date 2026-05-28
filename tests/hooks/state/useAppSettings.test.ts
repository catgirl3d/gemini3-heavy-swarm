import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants';
import { useAppSettings } from '@/hooks/state/useAppSettings';
import * as migration from '@/services/settings/settingsMigration';

describe('useAppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('Settings Loading', () => {
    it('should load default settings when localStorage is empty', () => {
      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
      expect(result.current.settingsLoaded).toBe(true);
    });

    it('should load and migrate valid settings from localStorage', () => {
      const validSettings = {
        ...DEFAULT_SETTINGS,
        numAgents: 4,
        roleProfiles: [{
          id: 'test-profile',
          name: 'Test',
          roles: [{ id: 'role-1', name: 'Role 1', instruction: 'Test' }],
          criticRoles: []
        }]
      };

      localStorage.setItem('gemini3-settings', JSON.stringify(validSettings));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      expect(result.current.settings.numAgents).toBe(4);
      expect(result.current.settings.roleProfiles?.some(profile => profile.id === 'test-profile')).toBe(true);
    });
  });

  describe('Runtime Validation', () => {
    it('should fallback to defaults when migration returns data without IDs', () => {
      const brokenMigratedData = {
        ...DEFAULT_SETTINGS,
        roleProfiles: [{
          id: 'broken-profile',
          name: 'Broken',
          roles: [{ name: 'Still No ID', instruction: 'Test' }],
          criticRoles: []
        }]
      };

      vi.spyOn(migration, 'migrateSettings').mockReturnValue(brokenMigratedData as any);
      localStorage.setItem('gemini3-settings', JSON.stringify({ old: 'data' }));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should fallback to defaults when savedRoles is missing ID after migration', () => {
      const brokenMigratedData = {
        ...DEFAULT_SETTINGS,
        savedRoles: [{ name: 'No ID Preset', instruction: 'Test' }]
      };

      vi.spyOn(migration, 'migrateSettings').mockReturnValue(brokenMigratedData as any);
      localStorage.setItem('gemini3-settings', JSON.stringify({ old: 'data' }));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should fallback to defaults when savedInstructions is missing ID after migration', () => {
      const brokenMigratedData = {
        ...DEFAULT_SETTINGS,
        savedInstructions: [{ name: 'No ID Instruction', content: 'Test' }]
      };

      vi.spyOn(migration, 'migrateSettings').mockReturnValue(brokenMigratedData as any);
      localStorage.setItem('gemini3-settings', JSON.stringify({ old: 'data' }));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should fallback to defaults if migration leaves whitespace-only IDs', () => {
      const brokenMigratedData = {
        ...DEFAULT_SETTINGS,
        roleProfiles: [{
          id: 'broken-profile',
          name: 'Broken',
          roles: [{ id: '   ', name: 'Still No ID', instruction: 'Test' }],
          criticRoles: []
        }]
      };

      vi.spyOn(migration, 'migrateSettings').mockReturnValue(brokenMigratedData as any);
      localStorage.setItem('gemini3-settings', JSON.stringify({ old: 'data' }));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('Migration Integration (Actual behavior)', () => {
    it('should pass validation because migration fixes missing IDs', () => {
      const legacySettings = {
        ...DEFAULT_SETTINGS,
        roleProfiles: [{
          id: 'legacy-profile',
          name: 'Legacy',
          roles: [{ name: 'Legacy Role', instruction: 'Test' }],
          criticRoles: []
        }]
      };

      localStorage.setItem('gemini3-settings', JSON.stringify(legacySettings));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      const profile = result.current.settings.roleProfiles?.find(candidate => candidate.id === 'legacy-profile');
      expect(profile?.roles[0].id).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should fallback to defaults when localStorage contains invalid JSON', () => {
      localStorage.setItem('gemini3-settings', 'INVALID JSON {{{');

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('Settings Persistence', () => {
    it('should save settings to localStorage when changed', () => {
      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);

      act(() => {
        result.current.setSettings({ ...result.current.settings, numAgents: 5 });
      });

      const saved = localStorage.getItem('gemini3-settings');
      expect(saved).toBeDefined();
      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.numAgents).toBe(5);
      }
    });
  });

  describe('resetSettings', () => {
    it('should reset settings to defaults and persist defaults to localStorage', () => {
      localStorage.setItem('gemini3-settings', JSON.stringify({ ...DEFAULT_SETTINGS, numAgents: 10 }));
      const removeItemSpy = vi.spyOn(localStorage, 'removeItem');

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.settingsLoaded).toBe(true);

      act(() => {
        result.current.resetSettings();
      });

      expect(removeItemSpy).toHaveBeenCalledWith('gemini3-settings');
      expect(result.current.settings.numAgents).toBe(DEFAULT_SETTINGS.numAgents);

      const saved = localStorage.getItem('gemini3-settings');
      expect(saved).not.toBeNull();
      if (saved) {
        const parsed = JSON.parse(saved);
        expect(parsed.numAgents).toBe(DEFAULT_SETTINGS.numAgents);
      }
    });
  });

  describe('Backup and Error Reporting', () => {
    it('should save backup to gemini3-settings-backup when validation fails', () => {
      const brokenData = {
        ...DEFAULT_SETTINGS,
        roleProfiles: [{
          id: 'broken',
          name: 'Broken',
          roles: [{ name: 'No ID' }],
          criticRoles: []
        }]
      };

      vi.spyOn(migration, 'migrateSettings').mockReturnValue(brokenData as any);

      const originalSettings = JSON.stringify({ old: 'corrupted data' });
      localStorage.setItem('gemini3-settings', originalSettings);

      renderHook(() => useAppSettings());

      expect(localStorage.getItem('gemini3-settings-backup')).toBe(originalSettings);
    });

    it('should expose loadError when fallback occurs due to validation failure', () => {
      const brokenData = {
        ...DEFAULT_SETTINGS,
        savedRoles: [{ name: 'No ID' }]
      };

      vi.spyOn(migration, 'migrateSettings').mockReturnValue(brokenData as any);
      localStorage.setItem('gemini3-settings', JSON.stringify({ some: 'data' }));

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.loadError).toContain('corrupted');
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should expose loadError when parse fails', () => {
      localStorage.setItem('gemini3-settings', 'INVALID JSON');

      const { result } = renderHook(() => useAppSettings());

      expect(result.current.loadError).toContain('Failed to load');
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should clear loadError when clearLoadError is called', () => {
      localStorage.setItem('gemini3-settings', 'INVALID JSON');

      const { result } = renderHook(() => useAppSettings());
      expect(result.current.loadError).not.toBeNull();

      act(() => {
        result.current.clearLoadError();
      });

      expect(result.current.loadError).toBeNull();
    });
  });
});
