import { ReactNode, useEffect } from 'react';
import { AppSettings } from '@/types';
import { Logger } from '@shared/utils/logger';

interface ConfigProviderProps {
  children: ReactNode;
  settings: AppSettings;
}

/**
 * ConfigProvider manages global configuration state for the application.
 * 
 * This provider is responsible for:
 * - Synchronizing Logger.globalDebugMode with user settings
 * - Other application-wide configuration side-effects
 * 
 * Architecture: Centralizes global side-effects in one place at the root level,
 * rather than scattering them across hooks. This makes dependencies explicit
 * and improves testability.
 */
export function ConfigProvider({ children, settings }: ConfigProviderProps) {
  // Sync global logger debug mode with settings
  useEffect(() => {
    Logger.globalDebugMode = settings.debugMode;
    
    // Cleanup: reset to default when provider unmounts
    return () => {
      Logger.globalDebugMode = false;
    };
  }, [settings.debugMode]);

  return <>{children}</>;
}
