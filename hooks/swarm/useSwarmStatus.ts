import { useState } from 'react';

export function useSwarmStatus() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

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
