import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProfileManagement } from '@/components/modals/SettingsModal/hooks/useProfileManagement';
import { AppSettings } from '@/types';
import { useState } from 'react';
import { createMockSettings } from '@/test/utils/settingsMocks';

describe('useProfileManagement', () => {
  const setupHook = (initialSettings: AppSettings) => {
    return renderHook(() => {
      const [settings, setSettings] = useState(initialSettings);
      const activeProfile = settings.profiles[0];
      const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0] || { id: 'test', name: 'Test', roles: [], criticRoles: [] };
      
      const hook = useProfileManagement(
        settings,
        setSettings,
        activeProfile,
        activeRoleProfile,
        () => {},
        () => {}
      );
      
      return { settings, hook };
    });
  };

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
  });
});
