import { useRef, useCallback, useEffect } from 'react';

export type AbortControllerHook = {
  ref: React.MutableRefObject<AbortController | null>;
  create: () => AbortController;
  abort: () => void;
  signal: AbortSignal | undefined;
};

export function useAbortController(): AbortControllerHook {
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
