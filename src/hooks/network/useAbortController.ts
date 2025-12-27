import { useRef, useCallback, useEffect } from 'react';

export function useAbortController() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const create = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { 
    ref: abortControllerRef, 
    create, 
    abort,
    signal: abortControllerRef.current?.signal 
  };
}
