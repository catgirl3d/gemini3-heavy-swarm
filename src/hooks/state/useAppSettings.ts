import { useState, useEffect } from 'react';
import { AppSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/constants';
import { migrateSettings } from '@/services/settings/settingsMigration';
import { Logger } from '@/utils/logger';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('gemini3-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        const migrated = migrateSettings(parsed);
        setSettings(migrated);
      } catch (error) {
        new Logger('AppSettings').error('Failed to parse saved settings:', error);
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

  return { settings, setSettings, settingsLoaded };
}
