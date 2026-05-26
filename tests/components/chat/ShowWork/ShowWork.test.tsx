import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShowWork } from '@/components/chat/ShowWork/ShowWork';
import { STEPS } from '@/types/steps';
import type { AgentState, Work } from '@/types';
import { useAgentStore } from '@/stores/agentStore';

vi.mock('@/components/chat/ShowWork/components/StatusAwareWorkCard', () => ({
  StatusAwareWorkCard: () => <div data-testid="status-aware-work-card" />
}));

vi.mock('@/hooks/swarm/useResolvedSwarmState', () => ({
  useResolvedSwarmState: () => ({
    synthesizerState: undefined,
    refinementStarted: false,
    isEarlyStageWorking: false,
  }),
}));

vi.mock('@/hooks/ui/useAutoCollapse', () => ({
  useAutoCollapse: () => undefined,
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

describe('ShowWork UI', () => {
  beforeEach(() => {
    useAgentStore.getState().abortAll();
    useAgentStore.setState({
      ...useAgentStore.getInitialState(),
      abortControllers: new Map(),
    }, true);
  });

  it('shows Skip Step when phase is recoverable-error on initial/refinement step and calls onSkip', () => {
    const onSkipMock = vi.fn();
    const mockAgents = [
      createAgent({ status: 'error', label: 'Failed' })
    ];
    const mockWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.INITIAL, status: 'error' }]
    };

    // Put session in recoverable-error phase
    useAgentStore.getState().startSession('msg-1', mockWork, {
      phase: 'recoverable-error'
    });
    useAgentStore.getState().replaceSessionAgents('msg-1', mockAgents);

    render(
      <ShowWork
        work={mockWork}
        isLive={true}
        messageId="msg-1"
        phase="recoverable-error"
        isPausedForAction={true}
        onContinue={() => {}}
        onSkip={onSkipMock}
      />
    );

    // Skip button should be rendered
    const skipBtn = screen.getByRole('button', { name: /Skip Step/i });
    expect(skipBtn).toBeDefined();

    // Clicking Skip Step calls the callback
    fireEvent.click(skipBtn);
    expect(onSkipMock).toHaveBeenCalledTimes(1);
  });

  it('hides Skip Step when synthesis step is in error status', () => {
    const onSkipMock = vi.fn();
    const mockAgents = [
      createAgent({ stepId: STEPS.SYNTHESIS, status: 'error', label: 'Synthesis Error' })
    ];
    const mockWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'error' }]
    };

    useAgentStore.getState().startSession('msg-1', mockWork, {
      phase: 'recoverable-error'
    });
    useAgentStore.getState().replaceSessionAgents('msg-1', mockAgents);

    render(
      <ShowWork
        work={mockWork}
        isLive={true}
        messageId="msg-1"
        phase="recoverable-error"
        isPausedForAction={true}
        onContinue={() => {}}
        onSkip={onSkipMock}
      />
    );

    // Skip button should NOT be rendered
    const skipBtn = screen.queryByRole('button', { name: /Skip Step/i });
    expect(skipBtn).toBeNull();

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    expect(retryBtn).toBeDefined();
  });
});
