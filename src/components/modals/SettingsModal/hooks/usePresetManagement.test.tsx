import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { usePresetManagement } from '@/components/modals/SettingsModal/hooks/usePresetManagement';
import { type AppSettings, PROMPT_TYPES, ProviderType } from '@/types';
import { createMockSettings } from '@test/settingsMocks';

describe('usePresetManagement', () => {
  const setupHook = (initialSettings: AppSettings) => {
    return renderHook(() => {
      const [settings, setSettings] = useState(initialSettings);
      const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
      const hook = usePresetManagement(settings, setSettings, activeProfile);

      return { settings, hook };
    });
  };

  describe('handleApplyInstructionPreset', () => {
    it('should sync preset model changes with providerModels for the current provider', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        activeProfileId: 'profile-1',
        profiles: [{
          id: 'profile-1',
          name: 'Profile 1',
          initialInstruction: 'Old instruction',
          refinementInstruction: '',
          synthesizerInstruction: ''
        }],
        initialModel: 'old-gemini-model',
        providerModels: {
          stepModels: {
            [ProviderType.Gemini]: {
              initial: 'old-gemini-model'
            },
            [ProviderType.OpenRouter]: {
              initial: 'openrouter-model'
            }
          },
          roleModels: {}
        }
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleApplyInstructionPreset(
          PROMPT_TYPES.INITIAL,
          'Preset instruction',
          'new-gemini-model'
        );
      });

      const newSettings = result.current.settings;
      expect(newSettings.profiles[0].initialInstruction).toBe('Preset instruction');
      expect(newSettings.initialModel).toBe('new-gemini-model');
      expect(newSettings.providerModels?.stepModels?.[ProviderType.Gemini]?.initial).toBe('new-gemini-model');
      expect(newSettings.providerModels?.stepModels?.[ProviderType.OpenRouter]?.initial).toBe('openrouter-model');
    });

    it('should update only the instruction when no model is provided', () => {
      const settings = createMockSettings({
        activeProfileId: 'profile-1',
        profiles: [{
          id: 'profile-1',
          name: 'Profile 1',
          initialInstruction: 'Old instruction',
          refinementInstruction: '',
          synthesizerInstruction: ''
        }],
        initialModel: 'existing-model',
      });

      const { result } = setupHook(settings);

      act(() => {
        result.current.hook.handleApplyInstructionPreset(PROMPT_TYPES.INITIAL, 'Only text changed');
      });

      expect(result.current.settings.profiles[0].initialInstruction).toBe('Only text changed');
      expect(result.current.settings.initialModel).toBe('existing-model');
    });
  });

  describe('getRolePresets', () => {
    it('returns built-in default role presets for known profiles and the requested role type', () => {
      const { result } = setupHook(createMockSettings());

      const drafterPresets = result.current.hook.getRolePresets('software-team', 'drafter');
      const criticPresets = result.current.hook.getRolePresets('software-team', 'critic');

      expect(drafterPresets.some(preset => preset.name === 'Product Manager' && preset.isCustom === false)).toBe(true);
      expect(criticPresets.some(preset => preset.name === 'Security Auditor' && preset.isCustom === false)).toBe(true);
    });

    it('prepends the default No Role preset when it is not already present', () => {
      const { result } = setupHook(createMockSettings({
        savedRoles: [{ id: 'saved-1', name: 'Saved Role', instruction: 'Saved instruction', model: 'saved-model' }],
      }));

      const presets = result.current.hook.getRolePresets('missing-profile', 'drafter');

      expect(presets[0]).toMatchObject({
        name: 'No Role',
        instruction: '',
        model: '',
        isCustom: false,
      });
      expect(presets[1]).toMatchObject({
        id: 'saved-1',
        name: 'Saved Role',
        isCustom: true,
      });
    });

    it('does not duplicate No Role when it already exists in saved presets', () => {
      const { result } = setupHook(createMockSettings({
        savedRoles: [{ id: 'saved-no-role', name: 'No Role', instruction: '', model: '' }],
      }));

      const presets = result.current.hook.getRolePresets('missing-profile', 'critic');

      expect(presets.filter(preset => preset.name === 'No Role')).toHaveLength(1);
      expect(presets[0]).toMatchObject({ id: 'saved-no-role', isCustom: true });
    });
  });

  describe('getInstructionPresets', () => {
    it('filters by prompt type and excludes the active profile from profile-based presets', () => {
      const { result } = setupHook(createMockSettings({
        activeProfileId: 'profile-1',
        profiles: [
          {
            id: 'profile-1',
            name: 'Active Profile',
            initialInstruction: 'Active initial',
            refinementInstruction: 'Active refine',
            synthesizerInstruction: 'Active synth',
          },
          {
            id: 'profile-2',
            name: 'Other Profile',
            initialInstruction: 'Other initial',
            refinementInstruction: 'Other refine',
            synthesizerInstruction: 'Other synth',
          },
        ],
        savedInstructions: [
          { id: 'saved-initial', name: 'Saved Initial', type: PROMPT_TYPES.INITIAL, content: 'Saved initial', model: 'saved-model' },
          { id: 'saved-refine', name: 'Saved Refine', type: PROMPT_TYPES.REFINEMENT, content: 'Saved refine', model: 'refine-model' },
        ] as any,
      }));

      const presets = result.current.hook.getInstructionPresets(PROMPT_TYPES.INITIAL);

      expect(presets).toEqual([
        expect.objectContaining({ id: 'saved-initial', name: 'Saved Initial', isCustom: true }),
        expect.objectContaining({ id: 'profile-2', name: 'Other Profile', instruction: 'Other initial', isCustom: false }),
      ]);
    });
  });

  describe('save and delete preset handlers', () => {
    it('ignores instruction preset saves when the type or preset name is missing', () => {
      const { result } = setupHook(createMockSettings());

      act(() => {
        result.current.hook.handleSaveInstructionPreset(null, 'Ignored');
        result.current.hook.handleSaveInstructionPreset(PROMPT_TYPES.INITIAL, '   ');
      });

      expect(result.current.settings.savedInstructions).toEqual([]);
    });

    it('saves and deletes instruction presets', () => {
      vi.spyOn(Date, 'now').mockReturnValue(12345);
      const { result } = setupHook(createMockSettings({
        activeProfileId: 'profile-1',
        profiles: [{
          id: 'profile-1',
          name: 'Profile 1',
          initialInstruction: 'Initial preset content',
          refinementInstruction: '',
          synthesizerInstruction: ''
        }],
      }));

      act(() => {
        result.current.hook.handleSaveInstructionPreset(PROMPT_TYPES.INITIAL, '  Saved Initial  ');
      });

      expect(result.current.settings.savedInstructions).toEqual([
        expect.objectContaining({
          id: 'saved-12345',
          name: 'Saved Initial',
          type: PROMPT_TYPES.INITIAL,
          content: 'Initial preset content',
        }),
      ]);

      act(() => {
        result.current.hook.handleDeleteInstructionPreset('saved-12345');
      });

      expect(result.current.settings.savedInstructions).toEqual([]);
    });

    it('ignores role preset saves when the role selection is invalid', () => {
      const settings = createMockSettings();
      const activeRoleProfile = {
        id: 'role-profile-1',
        name: 'Role Profile',
        roles: [{ id: 'role-1', name: 'Engineer', instruction: 'Build it', model: 'model-1' }],
        criticRoles: [],
      };
      const { result } = renderHook(() => {
        const [localSettings, setLocalSettings] = useState(settings);
        const activeProfile = localSettings.profiles.find(p => p.id === localSettings.activeProfileId) || localSettings.profiles[0];
        return {
          settings: localSettings,
          hook: usePresetManagement(localSettings, setLocalSettings, activeProfile),
        };
      });

      act(() => {
        result.current.hook.handleSaveRolePreset(null, 'drafter', activeRoleProfile as any, 'Ignored');
        result.current.hook.handleSaveRolePreset(4, 'drafter', activeRoleProfile as any, 'Ignored');
        result.current.hook.handleSaveRolePreset(0, 'drafter', activeRoleProfile as any, '   ');
      });

      expect(result.current.settings.savedRoles).toEqual([]);
    });

    it('saves and deletes role presets for the selected role', () => {
      vi.spyOn(Date, 'now').mockReturnValue(999);
      const settings = createMockSettings();
      const activeRoleProfile = {
        id: 'role-profile-1',
        name: 'Role Profile',
        roles: [{ id: 'role-1', name: 'Engineer', instruction: 'Build it', model: 'model-1' }],
        criticRoles: [{ id: 'critic-1', name: 'Reviewer', instruction: 'Review it', model: 'model-2' }],
      };
      const { result } = renderHook(() => {
        const [localSettings, setLocalSettings] = useState(settings);
        const activeProfile = localSettings.profiles.find(p => p.id === localSettings.activeProfileId) || localSettings.profiles[0];
        return {
          settings: localSettings,
          hook: usePresetManagement(localSettings, setLocalSettings, activeProfile),
        };
      });

      act(() => {
        result.current.hook.handleSaveRolePreset(0, 'critic', activeRoleProfile as any, '  Saved Critic  ');
      });

      expect(result.current.settings.savedRoles).toEqual([
        expect.objectContaining({
          id: 'saved-role-999',
          name: 'Saved Critic',
          instruction: 'Review it',
          model: 'model-2',
        }),
      ]);

      act(() => {
        result.current.hook.handleDeleteRolePreset('saved-role-999');
      });

      expect(result.current.settings.savedRoles).toEqual([]);
    });
  });
});
