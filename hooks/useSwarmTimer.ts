import { useState, useRef, useEffect } from 'react';

export function useSwarmTimer(isActive: boolean) {
  const [timer, setTimer] = useState<number>(0);
  const startTimeRef = useRef<number>(0);
  
  // Use a ref to track the current timer value to avoid stale closures in effects
  const timerRef = useRef(timer);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive) {
      // Resume timer using the absolute latest timer value from the ref
      startTimeRef.current = Date.now() - timerRef.current;
      interval = setInterval(() => {
        setTimer(Date.now() - startTimeRef.current);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  return { timer, setTimer, startTimeRef };
}
