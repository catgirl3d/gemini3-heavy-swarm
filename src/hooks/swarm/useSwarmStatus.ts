import { useState, useCallback } from 'react';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('SwarmStatus', true);

export function useSwarmStatus() {
  const [isLoading, _setIsLoading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const setIsLoading = useCallback((value: boolean) => {
    logger.debug(`setIsLoading: ${value}`, { stack: new Error().stack });
    _setIsLoading(value);
  }, []);

  return {
    isLoading,
    setIsLoading,
    isPaused,
    setIsPaused,
    loadingStatus,
    setLoadingStatus,
    error,
    setError
  };
}
