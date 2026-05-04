import { useState, useEffect } from 'react';
import { type AppSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/constants';
import { migrateSettings } from '@/services/settings/settingsMigration';
import { Logger } from '@shared/utils/logger';
import { hasValidRoleId, hasValidId } from '@/utils/validation/roleGuards';

const logger = new Logger('AppSettings');

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('gemini3-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        const migrated = migrateSettings(parsed);
        
        // Runtime validation: Ensure all roles have IDs after migration
        const allRolesValid = 
          migrated.roleProfiles?.every(profile => 
            (profile.roles?.every(hasValidRoleId) ?? true) && 
            (profile.criticRoles?.every(hasValidRoleId) ?? true)
          ) &&
          (migrated.savedRoles?.every(hasValidRoleId) ?? true) &&
          (migrated.savedInstructions?.every(hasValidId) ?? true);

        if (allRolesValid) {
          setSettings(migrated);
        } else {
          // Save backup for potential recovery
          localStorage.setItem('gemini3-settings-backup', savedSettings);
          logger.error('Critical: Migrated settings contain roles without IDs. Falling back to defaults.');
          setLoadError('Settings were corrupted and have been reset. A backup was saved.');
          // We don't have direct access to onShowError here as it's typically provided by a context or hook above.
          // Falling back to DEFAULT_SETTINGS is the safest action.
          setSettings(DEFAULT_SETTINGS);
        }
      } catch (error) {
        logger.error('Failed to parse saved settings:', error);
        // Save backup even for parse errors so user data is not lost
        localStorage.setItem('gemini3-settings-backup', savedSettings);
        setLoadError('Failed to load settings. Using defaults.');
        setSettings(DEFAULT_SETTINGS);
      }
    }
    setSettingsLoaded(true);
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (settingsLoaded) {
      localStorage.setItem('gemini3-settings', JSON.stringify(settings));
    }
  }, [settings, settingsLoaded]);

  const resetSettings = () => {
    new Logger('AppSettings').info('Settings reset to defaults');
    localStorage.removeItem('gemini3-settings');
    setSettings(DEFAULT_SETTINGS);
  };

  return { 
    settings, 
    setSettings, 
    settingsLoaded, 
    resetSettings, 
    loadError, 
    clearLoadError: () => setLoadError(null) 
  };
}
