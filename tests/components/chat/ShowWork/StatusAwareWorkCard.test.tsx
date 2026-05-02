import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StatusAwareWorkCard } from '@/components/chat/ShowWork/components/StatusAwareWorkCard';
import { useAgentStore } from '@/stores/agentStore';
import { STEPS } from '@/types/steps';
import type { AgentState, Work } from '@/types';

const { warnMock, useResolvedAgentStateMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  useResolvedAgentStateMock: vi.fn(),
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = warnMock;
    error = vi.fn();
  },
}));

vi.mock('@/hooks/swarm/useResolvedSwarmState', () => ({
  useResolvedAgentState: useResolvedAgentStateMock,
}));

vi.mock('@/components/chat/ShowWork/components/WorkCard', () => ({
  WorkCard: () => <div data-testid="work-card" />,
}));

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'refine-agent-1',
  name: 'Critic 1',
  status: 'done',
  label: 'Done',
  stepId: STEPS.REFINEMENT,
  agentIndex: 0,
  messageId: 'message-1',
  ...overrides,
});

const createWork = (overrides: Partial<Work> = {}): Work => ({
  results: {
    [STEPS.REFINEMENT]: [''],
  },
  ...overrides,
});

describe('StatusAwareWorkCard', () => {
  beforeEach(() => {
    resetAgentStore();
    warnMock.mockReset();
    useResolvedAgentStateMock.mockReset();
  });

  afterEach(() => {
    resetAgentStore();
  });

  it('logs lengths from prop, snapshot, and live work when a done card renders empty', async () => {
    useResolvedAgentStateMock.mockReturnValue(createAgent());

    useAgentStore.getState().setCurrentWork({
      results: {
        [STEPS.REFINEMENT]: ['live refined response'],
      },
    });

    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork()}
        step={STEPS.REFINEMENT}
        index={0}
        messageId="message-1"
        title="Critic 1"
        content=""
        thought="reasoning"
        downloadFilename="refined.md"
        onCardAction={() => undefined}
      />
    );

    await waitFor(() => {
      expect(warnMock).toHaveBeenCalledWith('Done card rendered empty', expect.objectContaining({
        messageId: 'message-1',
        step: STEPS.REFINEMENT,
        index: 0,
        status: 'done',
        propLen: 0,
        snapshotLen: 0,
        liveLen: 'live refined response'.length,
        hasThought: true,
      }));
    });
  });

  it('does not log when the card has visible content', async () => {
    useResolvedAgentStateMock.mockReturnValue(createAgent());

    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork({ results: { [STEPS.REFINEMENT]: ['visible response'] } })}
        step={STEPS.REFINEMENT}
        index={0}
        messageId="message-1"
        title="Critic 1"
        content="visible response"
        downloadFilename="refined.md"
        onCardAction={() => undefined}
      />
    );

    await waitFor(() => {
      expect(warnMock).not.toHaveBeenCalled();
    });
  });
});
