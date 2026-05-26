import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';
import { STEPS } from '@/types/steps';
import type { AgentState, Work } from '@/types';

// Mock AgentAvatar and TimerDisplay to isolate LoadingIndicator testing
vi.mock('@/components/chat', () => ({
  AgentAvatar: () => <div data-testid="agent-avatar" />
}));

vi.mock('@/components/ui/TimerDisplay', () => ({
  TimerDisplay: () => <div data-testid="timer-display" />
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  }
}));

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'waiting',
  label: 'Waiting...',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'msg-1',
  ...overrides,
});

describe('LoadingIndicator UIs', () => {
  it('shows Skip Step for non-synthesis recoverable errors and calls onSkip', () => {
    const onSkipMock = vi.fn();
    const mockAgents = [
      createAgent({ status: 'error', label: 'Failed to generate' })
    ];
    const mockWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.INITIAL, status: 'error' }]
    };

    render(
      <LoadingIndicator
        status="Process paused due to agent error"
        phase="recoverable-error"
        agentStates={mockAgents}
        isPausedForAction={true}
        onSkip={onSkipMock}
        onContinue={() => {}}
        work={mockWork}
      />
    );

    // Skip button should be rendered
    const skipBtn = screen.getByRole('button', { name: /Skip Step/i });
    expect(skipBtn).toBeDefined();

    // Clicking Skip Step calls the callback
    fireEvent.click(skipBtn);
    expect(onSkipMock).toHaveBeenCalledTimes(1);
  });

  it('hides Skip Step when the current errored agent is synthesis step', () => {
    const onSkipMock = vi.fn();
    const mockAgents = [
      createAgent({ stepId: STEPS.SYNTHESIS, status: 'error', label: 'Synthesis Failed' })
    ];
    const mockWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'error' }]
    };

    render(
      <LoadingIndicator
        status="Process paused due to synthesis error"
        phase="recoverable-error"
        agentStates={mockAgents}
        isPausedForAction={true}
        onSkip={onSkipMock}
        onContinue={() => {}}
        work={mockWork}
      />
    );

    // Skip button should NOT be rendered
    const skipBtn = screen.queryByRole('button', { name: /Skip Step/i });
    expect(skipBtn).toBeNull();

    // Verify Retry button is still visible
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    expect(retryBtn).toBeDefined();
  });
});
