import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSwarmTimer: vi.fn(),
}));

vi.mock('@/hooks/swarm/useSwarmTimer', () => ({
  useSwarmTimer: mocks.useSwarmTimer,
}));

import { TimerDisplay } from '@/components/ui/TimerDisplay/TimerDisplay';

describe('TimerDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats the timer in seconds and passes the active flag through to the hook', () => {
    mocks.useSwarmTimer.mockReturnValue({ timer: 1234 });

    render(<TimerDisplay isActive />);

    expect(mocks.useSwarmTimer).toHaveBeenCalledWith(true);
    expect(screen.getByText('1.2s')).toHaveClass('timer-display');
  });

  it('renders zero-based inactive timers with one decimal place', () => {
    mocks.useSwarmTimer.mockReturnValue({ timer: 0 });

    render(<TimerDisplay isActive={false} />);

    expect(mocks.useSwarmTimer).toHaveBeenCalledWith(false);
    expect(screen.getByText('0.0s')).toBeInTheDocument();
  });
});
