import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, Work } from '@/types';
import { STEPS } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';
import { StatusAwareWorkCard } from '@/components/chat/ShowWork/components/StatusAwareWorkCard';

const mocks = vi.hoisted(() => ({
  useResolvedAgentState: vi.fn(),
  workCard: vi.fn((props: any) => (
    <div data-testid="work-card" data-status={props.status} data-label={props.statusLabel} data-title={props.title}>
      <span data-testid="work-card-icon">{typeof props.icon === 'string' ? props.icon : props.icon?.props?.children ?? ''}</span>
      <span data-testid="work-card-download">{props.downloadFilename}</span>
      <span data-testid="work-card-regenerate">{String(!!props.allowRegenerate)}</span>
      <span data-testid="work-card-content">{props.content ?? '<null>'}</span>
    </div>
  )),
  loggerWarn: vi.fn(),
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug() {}
    error() {}
    warn(...args: unknown[]) {
      mocks.loggerWarn(...args);
    }
  },
}));

vi.mock('@/hooks/swarm/useResolvedSwarmState', () => ({
  useResolvedAgentState: mocks.useResolvedAgentState,
}));

vi.mock('@/components/chat/ShowWork/components/WorkCard', () => ({
  WorkCard: (props: any) => mocks.workCard(props),
}));

const createWork = (overrides: Partial<Work> = {}): Work => ({
  agentStates: [],
  ...overrides,
});

const createAgentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Live Agent',
  status: 'working',
  label: 'Drafting...',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'message-1',
  ...overrides,
});

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

describe('StatusAwareWorkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAgentStore();
    mocks.useResolvedAgentState.mockReturnValue(undefined);
  });

  afterEach(() => {
    resetAgentStore();
  });

  it('prefers the live resolved agent state over historical fallback props', () => {
    mocks.useResolvedAgentState.mockReturnValue(createAgentState());

    render(
      <StatusAwareWorkCard
        cardId="initial-0"
        work={createWork()}
        step={STEPS.INITIAL}
        index={0}
        messageId="message-1"
        title="Fallback Title"
        content="Draft text"
        tokenUsage={{ promptTokens: 1, candidatesTokens: 2, totalTokens: 3 }}
        thought="Thought"
        debugInfo={{ trace: true }}
        downloadFilename="Agent-1.md"
        onCardAction={vi.fn()}
        allowRegenerate
      />
    );

    expect(screen.getByTestId('work-card')).toHaveAttribute('data-status', 'working');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-label', 'Drafting...');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-title', 'Live Agent');
    expect(screen.getByTestId('work-card-download')).toHaveTextContent('Agent-1.md');
    expect(screen.getByTestId('work-card-regenerate')).toHaveTextContent('true');
  });

  it('falls back to done when content exists without a live agent', () => {
    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork()}
        step={STEPS.REFINEMENT}
        index={0}
        title="Critic 1"
        content="Refined answer"
        downloadFilename="Critic-1.md"
        onCardAction={vi.fn()}
      />
    );

    expect(screen.getByTestId('work-card')).toHaveAttribute('data-status', 'done');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-label', 'Refined');
    expect(screen.getByTestId('work-card-content')).toHaveTextContent('Refined answer');
  });

  it('falls back to waiting with the numbered icon when no content is available', () => {
    render(
      <StatusAwareWorkCard
        cardId="initial-1"
        work={createWork()}
        step={STEPS.INITIAL}
        index={1}
        title="Agent 2"
        content={null}
        downloadFilename="Agent-2.md"
        onCardAction={vi.fn()}
      />
    );

    expect(screen.getByTestId('work-card')).toHaveAttribute('data-status', 'waiting');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-label', 'Waiting...');
    expect(screen.getByTestId('work-card-icon')).toHaveTextContent('2');
    expect(screen.getByTestId('work-card-content')).toHaveTextContent('<null>');
  });

  it('shows stale when the agent snapshot itself is stale', () => {
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'stale',
      label: 'Stale',
      stepId: STEPS.REFINEMENT,
    }));

    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork({
          stepMetadata: [{ id: STEPS.REFINEMENT, status: 'stale', label: 'Refinement Step', staleFromStepId: STEPS.INITIAL }],
        })}
        step={STEPS.REFINEMENT}
        index={0}
        messageId="message-1"
        title="Critic 1"
        content="Old refined answer"
        downloadFilename="Critic-1.md"
        onCardAction={vi.fn()}
        allowRegenerate
      />
    );

    expect(screen.getByTestId('work-card')).toHaveAttribute('data-status', 'stale');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-label', 'Stale');
    expect(screen.getByTestId('work-card-content')).toHaveTextContent('Old refined answer');
  });

  it('prefers a live working agent state over stale step metadata during regeneration', () => {
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'working',
      label: 'Refining and critiquing answers...',
      stepId: STEPS.REFINEMENT,
    }));

    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork({
          stepMetadata: [{ id: STEPS.REFINEMENT, status: 'stale', label: 'Refinement Step', staleFromStepId: STEPS.INITIAL }],
        })}
        step={STEPS.REFINEMENT}
        index={0}
        messageId="message-1"
        preferLiveSession
        title="Critic 1"
        content="Old refined answer"
        downloadFilename="Critic-1.md"
        onCardAction={vi.fn()}
        allowRegenerate
      />
    );

    expect(screen.getByTestId('work-card')).toHaveAttribute('data-status', 'working');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-label', 'Refining and critiquing answers...');
    expect(screen.getByTestId('work-card-content')).toHaveTextContent('Old refined answer');
  });

  it('shows done for the regenerated stale card when the live agent state is done', () => {
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'done',
      label: 'Refined',
      stepId: STEPS.REFINEMENT,
    }));

    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork({
          results: { [STEPS.REFINEMENT]: ['Updated refined answer'] },
          stepMetadata: [{ id: STEPS.REFINEMENT, status: 'stale', label: 'Refinement Step', staleFromStepId: STEPS.INITIAL }],
        })}
        step={STEPS.REFINEMENT}
        index={0}
        messageId="message-1"
        preferLiveSession
        title="Critic 1"
        content="Updated refined answer"
        downloadFilename="Critic-1.md"
        onCardAction={vi.fn()}
        allowRegenerate
      />
    );

    expect(screen.getByTestId('work-card')).toHaveAttribute('data-status', 'done');
    expect(screen.getByTestId('work-card')).toHaveAttribute('data-label', 'Refined');
    expect(screen.getByTestId('work-card-content')).toHaveTextContent('Updated refined answer');
  });

  it('diagnoses empty done multi-agent cards using the content length from work results', async () => {
    const snapshotText = 'Initial snapshot text';
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'done',
      label: 'Done',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
    }));

    render(
      <StatusAwareWorkCard
        cardId="initial-0"
        work={createWork({ results: { [STEPS.INITIAL]: [snapshotText] } })}
        step={STEPS.INITIAL}
        index={0}
        title="Agent 1"
        content=""
        downloadFilename="Agent-1.md"
        onCardAction={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        'Done card rendered empty',
        expect.objectContaining({
          step: STEPS.INITIAL,
          snapshotLen: snapshotText.length,
        })
      );
    });
  });

  it('diagnoses empty done synthesis cards using synthesis lane text length from work results', async () => {
    const snapshotText = 'Object synthesis text';
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'done',
      label: 'Synthesized',
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
    }));

    render(
      <StatusAwareWorkCard
        cardId="synthesis"
        work={createWork({ results: { [STEPS.SYNTHESIS]: [snapshotText] } })}
        step={STEPS.SYNTHESIS}
        index={0}
        title="Synthesizer"
        content=""
        downloadFilename="Synthesis_Report.md"
        onCardAction={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        'Done card rendered empty',
        expect.objectContaining({
          step: STEPS.SYNTHESIS,
          snapshotLen: snapshotText.length,
        })
      );
    });
  });

  it('diagnoses empty done synthesis cards using snapshot synthesis text length from work results', async () => {
    const snapshotText = 'Historical synthesis text';
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'done',
      label: 'Synthesized',
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
    }));

    render(
      <StatusAwareWorkCard
        cardId="synthesis"
        work={createWork({ results: { [STEPS.SYNTHESIS]: [snapshotText] } })}
        step={STEPS.SYNTHESIS}
        index={0}
        title="Synthesizer"
        content=""
        downloadFilename="Synthesis_Report.md"
        onCardAction={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        'Done card rendered empty',
        expect.objectContaining({
          step: STEPS.SYNTHESIS,
          snapshotLen: snapshotText.length,
        })
      );
    });
  });

  it('logs lengths from prop, snapshot, and live work when a done card renders empty', async () => {
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      id: 'refine-agent-1',
      name: 'Critic 1',
      status: 'done',
      label: 'Done',
      stepId: STEPS.REFINEMENT,
      agentIndex: 0,
    }));

    useAgentStore.getState().startSession('message-1', {
      results: {
        [STEPS.REFINEMENT]: ['live refined response'],
      },
    });

    render(
      <StatusAwareWorkCard
        cardId="refined-0"
        work={createWork({
          results: {
            [STEPS.REFINEMENT]: [''],
          },
        })}
        step={STEPS.REFINEMENT}
        index={0}
        messageId="message-1"
        preferLiveSession
        title="Critic 1"
        content=""
        thought="reasoning"
        downloadFilename="refined.md"
        onCardAction={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        'Done card rendered empty',
        expect.objectContaining({
          messageId: 'message-1',
          step: STEPS.REFINEMENT,
          index: 0,
          status: 'done',
          propLen: 0,
          snapshotLen: 0,
          liveLen: 'live refined response'.length,
          hasThought: true,
        })
      );
    });
  });

  it('does not log a warning for skipped done cards with empty content', async () => {
    mocks.useResolvedAgentState.mockReturnValue(createAgentState({
      status: 'done',
      label: 'Skipped',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
    }));

    render(
      <StatusAwareWorkCard
        cardId="initial-0"
        work={createWork({ results: { [STEPS.INITIAL]: [''] } })}
        step={STEPS.INITIAL}
        index={0}
        title="Agent 1"
        content=""
        downloadFilename="Agent-1.md"
        onCardAction={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mocks.loggerWarn).not.toHaveBeenCalled();
    });
  });
});
