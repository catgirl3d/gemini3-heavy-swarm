import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, Work } from '@/types';
import { STEPS } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';
import { ShowWork } from '@/components/chat/ShowWork/ShowWork';

vi.mock('@/components/chat/ShowWork/components/StatusAwareWorkCard', () => ({
  StatusAwareWorkCard: () => <div data-testid="status-aware-work-card" />,
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

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

describe('ShowWork store integration', () => {
  beforeEach(() => {
    act(() => {
      resetAgentStore();
    });
  });

  afterEach(() => {
    act(() => {
      resetAgentStore();
    });
  });

  it('shows Skip Step through the real store session wiring for recoverable non-synthesis errors', () => {
    const onSkipMock = vi.fn();
    const mockAgents = [
      createAgent({ status: 'error', label: 'Failed' }),
    ];
    const mockWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.INITIAL, status: 'error' }],
    };

    act(() => {
      useAgentStore.getState().startSession('msg-1', mockWork, {
        phase: 'recoverable-error',
      });
      useAgentStore.getState().replaceSessionAgents('msg-1', mockAgents);
    });

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

    const skipButton = screen.getByRole('button', { name: /Skip Step/i });
    fireEvent.click(skipButton);

    expect(onSkipMock).toHaveBeenCalledTimes(1);
  });

  it('hides Skip Step through the real store session wiring when synthesis is the errored step', () => {
    const onSkipMock = vi.fn();
    const mockAgents = [
      createAgent({ stepId: STEPS.SYNTHESIS, status: 'error', label: 'Synthesis Error' }),
    ];
    const mockWork: Work = {
      results: {},
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'error' }],
    };

    act(() => {
      useAgentStore.getState().startSession('msg-1', mockWork, {
        phase: 'recoverable-error',
      });
      useAgentStore.getState().replaceSessionAgents('msg-1', mockAgents);
    });

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

    expect(screen.queryByRole('button', { name: /Skip Step/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});
