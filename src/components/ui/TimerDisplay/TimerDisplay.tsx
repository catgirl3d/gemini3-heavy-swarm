import React, { type FC } from 'react';
import { useSwarmTimer } from '@/hooks/swarm/useSwarmTimer';

export const TimerDisplay: FC<{ isActive: boolean }> = ({ isActive }) => {
  const { timer } = useSwarmTimer(isActive);
  return <span className="timer-display">{(timer / 1000).toFixed(1)}s</span>;
};
