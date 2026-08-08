import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProfileManagement } from '@/components/modals/SettingsModal/hooks/useProfileManagement';
import { type AppSettings, ProviderType } from '@/types';
import { useState } from 'react';
import type React from 'react';
import { createMockSettings } from '@test/settingsMocks';

describe('useProfileManagement', () => {
  const setupHook = (
    initialSettings: AppSettings,
    options: { onShowError?: (message: string) => void } = {}
  ) => {
    return renderHook(() => {
      const [settings, setSettings] = useState(initialSettings);
      const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
      const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0] || { id: 'test', name: 'Test', roles: [], criticRoles: [] };
      
      const hook = useProfileManagement(
        settings,
        setSettings,
        activeProfile,
        activeRoleProfile,
        () => {},
        () => {},
        options.onShowError
      );
      
      return { settings, hook };
    });
  };

  const setupHookWithFailingSetter = (initialSettings: AppSettings, onShowError: (message: string) => void) => {
    return renderHook(() => {
      const activeProfile = initialSettings.profiles.find(p => p.id === initialSettings.activeProfileId) || initialSettings.profiles[0];
      const activeRoleProfile = initialSettings.roleProfiles?.find(p => p.id === initialSettings.activeRoleProfileId) || initialSettings.roleProfiles?.[0] || { id: 'test', name: 'Test', roles: [], criticRoles: [] };

      return useProfileManagement(
        initialSettings,
        (() => { throw new Error('setter failed'); }) as React.Dispatch<React.SetStateAction<AppSettings>>,
        activeProfile,
        activeRoleProfile,
        () => {},
        () => {},
        onShowError
      );
    });
  };

  describe('change handlers', () => {
    it('switches active prompt and role profiles from select events', () => {
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        activeRoleProfileId: 'role-1',
        profiles: [
          { id: 'profile-1', name: 'Profile 1', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' },
          { id: 'profile-2', name: 'Profile 2', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' },
        ],
        roleProfiles: [
          { id: 'role-1', name: 'Role 1', roles: [], criticRoles: [] },
          { id: 'role-2', name: 'Role 2', roles: [], criticRoles: [] },
        ],
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleProfileChange({ target: { value: 'profile-2' } } as React.ChangeEvent<HTMLSelectElement>);
        result.current.hook.handleRoleProfileChange({ target: { value: 'role-2' } } as React.ChangeEvent<HTMLSelectElement>);
      });

      expect(result.current.settings.activeProfileId).toBe('profile-2');
      expect(result.current.settings.activeRoleProfileId).toBe('role-2');
    });
  });

  describe('handleCreateProfile', () => {
    it('should clone current profile when clone is true', () => {
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        profiles: [{
          id: 'profile-1',
          name: 'Profile 1',
          initialInstruction: 'Init',
          refinementInstruction: 'Refine',
          synthesizerInstruction: 'Synth'
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleCreateProfile(true);
      });

      const newSettings = result.current.settings;
      expect(newSettings.profiles).toHaveLength(2);
      
      const newProfile = newSettings.profiles[1];
      expect(newProfile.name).toBe('Profile 1 (Copy)');
      expect(newProfile.initialInstruction).toBe('Init');
    });

    it('should create fresh profile when clone is false', () => {
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        profiles: [{
          id: 'profile-1',
          name: 'Profile 1',
          initialInstruction: 'Init',
          refinementInstruction: 'Refine',
          synthesizerInstruction: 'Synth'
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleCreateProfile(false);
      });

      const newSettings = result.current.settings;
      const newProfile = newSettings.profiles[1];
      
      expect(newProfile.name).toBe('New Custom Profile');
      // Should have default instructions from DEFAULT_PROFILES[0]
      expect(newProfile.initialInstruction).not.toBe('Init');
    });
  });

  describe('handleCreateRoleProfile', () => {
    it('should create new role profile with unique IDs for cloned roles', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'original',
        roleProfiles: [{
          id: 'original',
          name: 'Original Profile',
          roles: [
            { id: 'original-role-1', name: 'Engineer', instruction: 'Code', model: 'gpt-4' },
            { id: 'original-role-2', name: 'Designer', instruction: 'Design', model: 'claude-3' }
          ],
          criticRoles: [
            { id: 'original-critic-1', name: 'Reviewer', instruction: 'Review', model: 'gemini-pro' }
          ]
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleCreateRoleProfile();
      });

      const newSettings = result.current.settings;
      expect(newSettings.roleProfiles).toHaveLength(2);
      
      const newProfile = newSettings.roleProfiles![1];
      expect(newProfile.name).toBe('Original Profile (Copy)');
      expect(newProfile.roles).toHaveLength(2);
      expect(newProfile.criticRoles).toHaveLength(1);

      // Check that IDs are different from original
      expect(newProfile.roles[0].id).not.toBe('original-role-1');
      expect(newProfile.roles[1].id).not.toBe('original-role-2');
      expect(newProfile.criticRoles![0].id).not.toBe('original-critic-1');

      // Check that models WERE copied (default behavior is clone=true)
      expect(newProfile.roles[0].model).toBe('gpt-4');
      expect(newProfile.roles[1].model).toBe('claude-3');
      expect(newProfile.criticRoles![0].model).toBe('gemini-pro');
    });

    it('should clone provider-specific role models using the new role IDs', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        activeRoleProfileId: 'original',
        roleProfiles: [{
          id: 'original',
          name: 'Original Profile',
          roles: [
            { id: 'original-role-1', name: 'Engineer', instruction: 'Code', model: 'gemini-engineer' },
            { id: 'original-role-2', name: 'Designer', instruction: 'Design', model: 'gemini-designer' }
          ],
          criticRoles: [
            { id: 'original-critic-1', name: 'Reviewer', instruction: 'Review', model: 'gemini-reviewer' }
          ]
        }],
        providerModels: {
          stepModels: {},
          roleModels: {
            original: {
              [ProviderType.Gemini]: {
                roles: {
                  'original-role-1': 'gemini-engineer',
                  'original-role-2': 'gemini-designer'
                },
                criticRoles: {
                  'original-critic-1': 'gemini-reviewer'
                }
              },
              [ProviderType.OpenRouter]: {
                roles: {
                  'original-role-1': 'openrouter-engineer'
                },
                criticRoles: {
                  'original-critic-1': 'openrouter-reviewer'
                }
              }
            }
          }
        }
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleCreateRoleProfile(true);
      });

      const newSettings = result.current.settings;
      const newProfile = newSettings.roleProfiles![1];
      const clonedModels = newSettings.providerModels?.roleModels?.[newProfile.id];

      expect(clonedModels?.[ProviderType.Gemini]?.roles).toEqual({
        [newProfile.roles[0].id]: 'gemini-engineer',
        [newProfile.roles[1].id]: 'gemini-designer'
      });
      expect(clonedModels?.[ProviderType.Gemini]?.criticRoles).toEqual({
        [newProfile.criticRoles![0].id]: 'gemini-reviewer'
      });
      expect(clonedModels?.[ProviderType.OpenRouter]?.roles).toEqual({
        [newProfile.roles[0].id]: 'openrouter-engineer'
      });
      expect(clonedModels?.[ProviderType.OpenRouter]?.criticRoles).toEqual({
        [newProfile.criticRoles![0].id]: 'openrouter-reviewer'
      });
      expect(clonedModels?.[ProviderType.Gemini]?.roles?.['original-role-1']).toBeUndefined();
      expect(newSettings.providerModels?.roleModels?.original).toBeDefined();
    });

    it('should create fresh role profile when clone is false', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'original',
        roleProfiles: [{
          id: 'original',
          name: 'Original Profile',
          roles: [
            { id: 'original-role-1', name: 'Engineer', instruction: 'Code', model: 'gpt-4' }
          ],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleCreateRoleProfile(false);
      });

      const newSettings = result.current.settings;
      const newProfile = newSettings.roleProfiles![1];
      
      expect(newProfile.name).toBe('New Role Set');
      // Should have default roles from DEFAULT_ROLE_PROFILES[0]
      expect(newProfile.roles.length).toBeGreaterThan(0);
      expect(newProfile.roles[0].model).toBeUndefined();
    });

    it('should set new profile as active', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'original',
        roleProfiles: [{
          id: 'original',
          name: 'Original',
          roles: [{ id: 'role-1', name: 'Test', instruction: '' }],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleCreateRoleProfile();
      });

      const newSettings = result.current.settings;
      const newProfileId = newSettings.roleProfiles![1].id;
      
      expect(newSettings.activeRoleProfileId).toBe(newProfileId);
    });
  });

  describe('handleDeleteRoleProfile', () => {
    it('should not delete the last profile', () => {
      const settings = createMockSettings({
        roleProfiles: [{
          id: 'only-profile',
          name: 'Only Profile',
          roles: [],
          criticRoles: []
        }]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleDeleteRoleProfile();
      });

      expect(result.current.settings.roleProfiles).toHaveLength(1);
    });

    it('should delete profile and set active to first remaining', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'profile-2',
        roleProfiles: [
          { id: 'profile-1', name: 'Profile 1', roles: [], criticRoles: [] },
          { id: 'profile-2', name: 'Profile 2', roles: [], criticRoles: [] }
        ]
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleDeleteRoleProfile();
      });

      const newSettings = result.current.settings;
      expect(newSettings.roleProfiles).toHaveLength(1);
      expect(newSettings.roleProfiles![0].id).toBe('profile-1');
      expect(newSettings.activeRoleProfileId).toBe('profile-1');
    });

    it('should remove providerModels for the deleted role profile', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'profile-2',
        roleProfiles: [
          { id: 'profile-1', name: 'Profile 1', roles: [{ id: 'role-1', name: 'R1', instruction: '' }], criticRoles: [] },
          { id: 'profile-2', name: 'Profile 2', roles: [{ id: 'role-2', name: 'R2', instruction: '' }], criticRoles: [] }
        ],
        providerModels: {
          stepModels: {},
          roleModels: {
            'profile-1': {
              [ProviderType.Gemini]: {
                roles: { 'role-1': 'gemini-profile-1' }
              }
            },
            'profile-2': {
              [ProviderType.Gemini]: {
                roles: { 'role-2': 'gemini-profile-2' }
              },
              [ProviderType.OpenRouter]: {
                roles: { 'role-2': 'openrouter-profile-2' }
              }
            }
          }
        }
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleDeleteRoleProfile();
      });

      const roleModels = result.current.settings.providerModels?.roleModels;
      expect(roleModels?.['profile-2']).toBeUndefined();
      expect(roleModels?.['profile-1']?.[ProviderType.Gemini]?.roles).toEqual({
        'role-1': 'gemini-profile-1'
      });
    });
  });

  describe('handleDeleteProfile', () => {
    it('does not delete the last remaining prompt profile and reports the error', () => {
      const onShowError = vi.fn();
      const settings = createMockSettings({
        profiles: [{ id: 'only-profile', name: 'Only', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' }],
        activeProfileId: 'only-profile',
      });

      const { result } = setupHook(settings, { onShowError });

      act(() => {
        result.current.hook.handleDeleteProfile();
      });

      expect(result.current.settings.profiles).toHaveLength(1);
      expect(onShowError).toHaveBeenCalledWith('Cannot delete the last remaining prompt profile.');
    });

    it('deletes the active prompt profile and activates the first remaining one', () => {
      const settings = createMockSettings({
        activeProfileId: 'profile-2',
        profiles: [
          { id: 'profile-1', name: 'Profile 1', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' },
          { id: 'profile-2', name: 'Profile 2', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' },
        ],
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleDeleteProfile();
      });

      expect(result.current.settings.profiles).toHaveLength(1);
      expect(result.current.settings.profiles[0].id).toBe('profile-1');
      expect(result.current.settings.activeProfileId).toBe('profile-1');
    });
  });

  describe('rename handlers', () => {
    it('trims and saves prompt and role profile names', () => {
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        activeRoleProfileId: 'role-1',
        profiles: [{ id: 'profile-1', name: 'Old Prompt', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' }],
        roleProfiles: [{ id: 'role-1', name: 'Old Role', roles: [], criticRoles: [] }],
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRenameProfile('  New Prompt Name  ');
        result.current.hook.handleRenameRoleProfile('  New Role Name  ');
      });

      expect(result.current.settings.profiles[0].name).toBe('New Prompt Name');
      expect(result.current.settings.roleProfiles?.[0].name).toBe('New Role Name');
    });

    it('rejects blank prompt and role profile names', () => {
      const onShowError = vi.fn();
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        activeRoleProfileId: 'role-1',
        profiles: [{ id: 'profile-1', name: 'Old Prompt', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' }],
        roleProfiles: [{ id: 'role-1', name: 'Old Role', roles: [], criticRoles: [] }],
      });

      const { result } = setupHook(settings, { onShowError });

      act(() => {
        result.current.hook.handleRenameProfile('   ');
        result.current.hook.handleRenameRoleProfile('');
      });

      expect(result.current.settings.profiles[0].name).toBe('Old Prompt');
      expect(result.current.settings.roleProfiles?.[0].name).toBe('Old Role');
      expect(onShowError).toHaveBeenCalledWith('Profile name cannot be empty.');
      expect(onShowError).toHaveBeenCalledWith('Role profile name cannot be empty.');
    });
  });

  describe('error callback paths', () => {
    it('reports creation failures through onShowError', () => {
      const onShowError = vi.fn();
      const settings = createMockSettings();
      const { result } = setupHookWithFailingSetter(settings, onShowError);

      act(() => {
        result.current.handleCreateProfile(true);
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to create prompt profile. Please try again.');
    });

    it('reports role-profile creation failures through onShowError', () => {
      const onShowError = vi.fn();
      const settings = createMockSettings();
      const { result } = setupHookWithFailingSetter(settings, onShowError);

      act(() => {
        result.current.handleCreateRoleProfile(true);
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to create role profile due to an internal error. Please try again.');
    });

    it('reports rename failures through onShowError when the setter throws', () => {
      const onShowError = vi.fn();
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        activeRoleProfileId: 'role-1',
        profiles: [{ id: 'profile-1', name: 'Prompt', initialInstruction: '', refinementInstruction: '', synthesizerInstruction: '' }],
        roleProfiles: [{ id: 'role-1', name: 'Role', roles: [], criticRoles: [] }],
      });
      const { result } = setupHookWithFailingSetter(settings, onShowError);

      act(() => {
        result.current.handleRenameProfile('New Prompt');
        result.current.handleRenameRoleProfile('New Role');
      });

      expect(onShowError).toHaveBeenCalledWith('Failed to rename prompt profile. Please try again.');
      expect(onShowError).toHaveBeenCalledWith('Failed to rename role profile. Please try again.');
    });
  });

  describe('targeted rename behavior', () => {
    it('renames only the active role profile and leaves the others unchanged', () => {
      const settings = createMockSettings({
        activeRoleProfileId: 'role-2',
        roleProfiles: [
          { id: 'role-1', name: 'Keep Me', roles: [], criticRoles: [] },
          { id: 'role-2', name: 'Rename Me', roles: [], criticRoles: [] },
        ],
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleRenameRoleProfile('Updated Active Role');
      });

      expect(result.current.settings.roleProfiles?.map(profile => profile.name)).toEqual([
        'Keep Me',
        'Updated Active Role',
      ]);
    });
  });
});
