import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { usePresetManagement } from '@/components/modals/SettingsModal/hooks/usePresetManagement';
import { AppSettings, PROMPT_TYPES, ProviderType } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';

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
  });
});
