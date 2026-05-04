import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, Work } from '@/types';
import { STEPS } from '@/types/steps';

const mocks = vi.hoisted(() => ({
  resolvedSwarmState: vi.fn(),
  autoCollapse: vi.fn(),
  statusAwareWorkCard: vi.fn((props: any) => (
    <div data-testid={`card-${props.cardId}`} data-content={props.content ?? '<null>'}>
      <span>{props.title}</span>
      <button type="button" onClick={() => props.onCardAction(props.cardId, 'expand')}>
        expand-{props.cardId}
      </button>
      <button type="button" onClick={() => props.onCardAction(props.cardId, 'showThought')}>
        thought-{props.cardId}
      </button>
      <button type="button" onClick={() => props.onCardAction(props.cardId, 'showDebug')}>
        debug-{props.cardId}
      </button>
      <button type="button" onClick={() => props.onCardAction(props.cardId, 'regenerate')}>
        regenerate-{props.cardId}
      </button>
      <button type="button" onClick={() => props.onCardAction(`missing-${props.cardId}`, 'expand')}>
        missing-{props.cardId}
      </button>
    </div>
  )),
  store: {
    agents: [] as AgentState[],
    currentWork: undefined as Work | undefined,
    currentMessageId: undefined as string | undefined,
  },
}));

vi.mock('@/components/chat/ShowWork/components/StatusAwareWorkCard', () => ({
  StatusAwareWorkCard: (props: any) => mocks.statusAwareWorkCard(props),
}));

vi.mock('@/components/chat/ShowWork/components/WorkModal', () => ({
  WorkModal: ({ title, content, onClose }: any) => (
    <div data-testid="work-modal">
      <div>{title}</div>
      <div>{content}</div>
      <button type="button" onClick={onClose}>
        Close work modal
      </button>
    </div>
  ),
}));

vi.mock('@/components/chat/ShowWork/components/DebugModal', () => ({
  DebugModal: ({ title, onClose }: any) => (
    <div data-testid="debug-modal">
      <div>{title}</div>
      <button type="button" onClick={onClose}>
        Close debug modal
      </button>
    </div>
  ),
}));

vi.mock('@/hooks/swarm/useResolvedSwarmState', () => ({
  useResolvedSwarmState: (...args: any[]) => mocks.resolvedSwarmState(...args),
}));

vi.mock('@/hooks/ui/useAutoCollapse', () => ({
  useAutoCollapse: (...args: any[]) => mocks.autoCollapse(...args),
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector: any) => selector(mocks.store),
}));

import { ShowWork } from './ShowWork';

type ShowWorkProps = ComponentProps<typeof ShowWork>;

const createAgentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'done',
  label: 'Drafted',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'message-1',
  ...overrides,
});

const createDebugInfo = (label: string) => ({
  systemInstruction: `${label} instruction`,
  history: [{ role: 'user', parts: [{ text: `${label} history` }] }],
  userTurn: { role: 'user', parts: [{ text: `${label} turn` }] },
});

const createWork = (overrides: Partial<Work> = {}): Work => ({
  agentNames: ['Research Agent'],
  criticNames: ['Lead Critic'],
  results: {
    [STEPS.INITIAL]: ['Initial draft'],
    [STEPS.REFINEMENT]: ['Refined draft'],
    [STEPS.SYNTHESIS]: { text: 'Historical synthesis' },
    initial_step_thoughts: ['Initial thought'],
    refinement_step_thoughts: ['Refinement thought'],
    synthesis_step_thought: 'Synthesis thought',
    initial_step_usage: [{ promptTokens: 1, candidatesTokens: 2, totalTokens: 3 }],
    refinement_step_usage: [{ promptTokens: 4, candidatesTokens: 5, totalTokens: 9 }],
    synthesis_step_usage: { promptTokens: 6, candidatesTokens: 7, totalTokens: 13 },
  },
  debugInfo: {
    [STEPS.INITIAL]: [createDebugInfo('initial')],
    [STEPS.REFINEMENT]: [createDebugInfo('refinement')],
    [STEPS.SYNTHESIS]: createDebugInfo('synthesis'),
  },
  agentStates: [],
  ...overrides,
});

const createProps = (overrides: Partial<ShowWorkProps> = {}): ShowWorkProps => ({
  work: createWork(),
  isLive: false,
  messageId: 'message-1',
  isPaused: false,
  onContinue: vi.fn(),
  onRegenerate: vi.fn(),
  ...overrides,
});

describe('ShowWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.agents = [];
    mocks.store.currentWork = undefined;
    mocks.store.currentMessageId = undefined;
    mocks.resolvedSwarmState.mockReturnValue({
      synthesizerState: createAgentState({
        id: 'synth-1',
        name: 'Synthesizer',
        stepId: STEPS.SYNTHESIS,
        status: 'done',
        label: 'Synthesized',
      }),
      refinementStarted: true,
      isEarlyStageWorking: false,
    });
  });

  it('renders live work sections, routes card actions, and sums total tokens', () => {
    const onRegenerate = vi.fn();

    render(
      <ShowWork
        {...createProps({
          isLive: true,
          onRegenerate,
        })}
      />
    );

    expect(screen.getByText('Show Agent Work (Live)')).toBeInTheDocument();
    expect(screen.getByText('Initial Drafts')).toBeInTheDocument();
    expect(screen.getByText('Critiques & Refinements')).toBeInTheDocument();
    expect(screen.getByText('Final Synthesis')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('tokens')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'expand-initial-0' }));
    expect(screen.getByTestId('work-modal')).toHaveTextContent('Research Agent - Initial Draft');
    expect(screen.getByTestId('work-modal')).toHaveTextContent('Initial draft');

    fireEvent.click(screen.getByRole('button', { name: 'Close work modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'thought-synthesis' }));
    expect(screen.getByTestId('work-modal')).toHaveTextContent('Synthesizer - Thought Process');
    expect(screen.getByTestId('work-modal')).toHaveTextContent('Synthesis thought');

    fireEvent.click(screen.getByRole('button', { name: 'Close work modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'debug-refined-0' }));
    expect(screen.getByTestId('debug-modal')).toHaveTextContent('Lead Critic - Refinement Debug Info');

    fireEvent.click(screen.getByRole('button', { name: 'Close debug modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'regenerate-refined-0' }));
    expect(onRegenerate).toHaveBeenCalledWith(STEPS.REFINEMENT, 0);
  });

  it('uses live store work for the current message and hides refinement when unavailable', () => {
    mocks.resolvedSwarmState.mockReturnValue({
      synthesizerState: undefined,
      refinementStarted: false,
      isEarlyStageWorking: false,
    });
    mocks.store.currentMessageId = 'message-1';
    mocks.store.currentWork = createWork({
      results: {
        [STEPS.SYNTHESIS]: { text: 'Live synthesis' },
        synthesis_step_thought: 'Live synthesis thought',
        synthesis_step_usage: { promptTokens: 2, candidatesTokens: 7, totalTokens: 9 },
      },
    });

    render(
      <ShowWork
        {...createProps({
          work: createWork({
            results: {
              [STEPS.INITIAL]: ['Initial draft'],
              [STEPS.SYNTHESIS]: { text: 'Historical synthesis' },
              initial_step_usage: [{ promptTokens: 5, candidatesTokens: 5, totalTokens: 10 }],
              synthesis_step_usage: { promptTokens: 1, candidatesTokens: 0, totalTokens: 1 },
            },
            debugInfo: {
              [STEPS.INITIAL]: [createDebugInfo('initial')],
              [STEPS.SYNTHESIS]: createDebugInfo('historical'),
            },
          }),
        })}
      />
    );

    expect(screen.getByText('View Full Agent Swarm Process')).toBeInTheDocument();
    expect(screen.queryByText('Critiques & Refinements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-initial-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-synthesis')).toHaveAttribute('data-content', 'Live synthesis');
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(mocks.autoCollapse).toHaveBeenCalledWith(expect.objectContaining({
      isCurrentMessage: true,
      synthesisText: 'Live synthesis',
    }));
  });

  it('uses live currentWork for initial and refinement cards while the message snapshot is stale', () => {
    const liveWork = createWork({
      results: {
        [STEPS.INITIAL]: ['Live initial draft'],
        [STEPS.REFINEMENT]: ['Live refinement 1', 'Live refinement 2'],
        [STEPS.SYNTHESIS]: {},
        initial_step_thoughts: ['Live initial thought'],
        refinement_step_thoughts: ['Live refinement thought 1', 'Live refinement thought 2'],
        initial_step_usage: [{ promptTokens: 1, candidatesTokens: 1, totalTokens: 2 }],
        refinement_step_usage: [
          { promptTokens: 2, candidatesTokens: 3, totalTokens: 5 },
          { promptTokens: 4, candidatesTokens: 5, totalTokens: 9 },
        ],
      },
    });

    mocks.store.currentMessageId = 'message-1';
    mocks.store.currentWork = liveWork;

    render(
      <ShowWork
        {...createProps({
          work: createWork({
            results: {
              [STEPS.INITIAL]: [''],
              [STEPS.REFINEMENT]: ['', ''],
              [STEPS.SYNTHESIS]: {},
            },
          }),
          isLive: true,
        })}
      />
    );

    const cardProps = Object.fromEntries(
      mocks.statusAwareWorkCard.mock.calls.map(([props]) => [props.cardId, props])
    );

    expect(cardProps['initial-0'].work).toBe(liveWork);
    expect(cardProps['initial-0']).toMatchObject({
      content: 'Live initial draft',
      thought: 'Live initial thought',
      tokenUsage: { promptTokens: 1, candidatesTokens: 1, totalTokens: 2 },
    });
    expect(cardProps['refined-0'].work).toBe(liveWork);
    expect(cardProps['refined-0']).toMatchObject({
      content: 'Live refinement 1',
      thought: 'Live refinement thought 1',
      tokenUsage: { promptTokens: 2, candidatesTokens: 3, totalTokens: 5 },
    });
    expect(cardProps['refined-1'].work).toBe(liveWork);
    expect(cardProps['refined-1']).toMatchObject({
      content: 'Live refinement 2',
      thought: 'Live refinement thought 2',
      tokenUsage: { promptTokens: 4, candidatesTokens: 5, totalTokens: 9 },
    });
  });

  it('passes stable card props from the correct work source', () => {
    const work = createWork();
    const onRegenerate = vi.fn();

    render(
      <ShowWork
        {...createProps({
          work,
          onRegenerate,
        })}
      />
    );

    const cardProps = Object.fromEntries(
      mocks.statusAwareWorkCard.mock.calls.map(([props]) => [props.cardId, props])
    );

    expect(cardProps['initial-0'].work).toBe(work);
    expect(cardProps['initial-0']).toMatchObject({
      cardId: 'initial-0',
      step: STEPS.INITIAL,
      index: 0,
      title: 'Research Agent',
      content: 'Initial draft',
      tokenUsage: { promptTokens: 1, candidatesTokens: 2, totalTokens: 3 },
      thought: 'Initial thought',
      downloadFilename: 'Research-Agent-Initial_Draft.md',
      allowRegenerate: true,
    });
    expect(cardProps['initial-0'].debugInfo).toBe(work.debugInfo?.[STEPS.INITIAL]?.[0]);

    expect(cardProps['refined-0'].work).toBe(work);
    expect(cardProps['refined-0']).toMatchObject({
      cardId: 'refined-0',
      step: STEPS.REFINEMENT,
      index: 0,
      className: 'refinement-step',
      title: 'Lead Critic',
      content: 'Refined draft',
      tokenUsage: { promptTokens: 4, candidatesTokens: 5, totalTokens: 9 },
      thought: 'Refinement thought',
      downloadFilename: 'Lead-Critic-Refined_Response.md',
      allowRegenerate: true,
    });
    expect(cardProps['refined-0'].debugInfo).toBe(work.debugInfo?.[STEPS.REFINEMENT]?.[0]);

    expect(cardProps.synthesis.work).toBe(work);
    expect(cardProps.synthesis).toMatchObject({
      cardId: 'synthesis',
      step: STEPS.SYNTHESIS,
      index: 0,
      className: STEPS.SYNTHESIS,
      title: 'Synthesizer',
      content: 'Historical synthesis',
      tokenUsage: { promptTokens: 6, candidatesTokens: 7, totalTokens: 13 },
      thought: 'Synthesis thought',
      downloadFilename: 'Synthesis_Report.md',
      allowRegenerate: true,
    });
    expect(cardProps.synthesis.debugInfo).toBe(work.debugInfo?.[STEPS.SYNTHESIS]);
  });

  it('shows Continue only for paused live incomplete work and hides it while agents are working or synthesis is done', () => {
    const onContinue = vi.fn();
    const work = createWork({
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
    });

    const { rerender } = render(
      <ShowWork
        {...createProps({
          work,
          isLive: true,
          isPaused: true,
          onContinue,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);

    mocks.store.agents = [
      createAgentState({ status: 'working', label: 'Drafting...', messageId: 'message-1' }),
    ];

    rerender(
      <ShowWork
        {...createProps({
          work,
          isLive: true,
          isPaused: true,
          onContinue,
        })}
      />
    );

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    mocks.store.agents = [];

    rerender(
      <ShowWork
        {...createProps({
          work: createWork({
            stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'done' }],
          }),
          isLive: true,
          isPaused: true,
          onContinue,
        })}
      />
    );

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('hides Continue when live work for the current message already finished synthesis', () => {
    mocks.store.currentMessageId = 'message-1';
    mocks.store.currentWork = createWork({
      stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'done' }],
    });

    render(
      <ShowWork
        {...createProps({
          work: createWork({
            stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'pending' }],
          }),
          isLive: true,
          isPaused: true,
        })}
      />
    );

    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('shows Retry for scoped errored agents and retries each failed agent', () => {
    const onRegenerate = vi.fn();
    mocks.store.agents = [
      createAgentState({ status: 'error', label: 'Draft Failed', messageId: 'message-1', agentIndex: 0 }),
      createAgentState({
        id: 'critic-1',
        name: 'Critic 1',
        status: 'error',
        label: 'Refinement Failed',
        stepId: STEPS.REFINEMENT,
        messageId: 'message-1',
        agentIndex: 1,
      }),
      createAgentState({ id: 'other-message', status: 'error', messageId: 'other-message', agentIndex: 2 }),
    ];

    render(
      <ShowWork
        {...createProps({
          isLive: true,
          isPaused: true,
          onContinue: undefined,
          onRegenerate,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRegenerate).toHaveBeenNthCalledWith(1, STEPS.INITIAL, 0);
    expect(onRegenerate).toHaveBeenNthCalledWith(2, STEPS.REFINEMENT, 1);
    expect(onRegenerate).toHaveBeenCalledTimes(2);
  });

  it('uses historical data branches, fallback names, ignored actions, and collapse handling', () => {
    mocks.resolvedSwarmState.mockReturnValue({
      synthesizerState: undefined,
      refinementStarted: false,
      isEarlyStageWorking: false,
    });

    render(
        <ShowWork
          {...createProps({
            work: createWork({
              agentNames: undefined,
              criticNames: undefined,
              results: {
                [STEPS.INITIAL]: ['Initial draft', null],
                [STEPS.REFINEMENT]: ['Historical refinement'],
                [STEPS.SYNTHESIS]: 'Legacy synthesis',
                initial_step_thoughts: ['Initial thought'],
                refinement_step_thoughts: ['Refinement thought'],
              } as unknown as Work['results'],
              debugInfo: {
                [STEPS.INITIAL]: [createDebugInfo('initial')],
                [STEPS.REFINEMENT]: [createDebugInfo('refinement')],
              },
            }),
          onRegenerate: undefined,
        })}
      />
    );

    expect(screen.getByText('Critiques & Refinements')).toBeInTheDocument();
    expect(screen.getByTestId('card-synthesis')).toHaveAttribute('data-content', 'Legacy synthesis');

    fireEvent.click(screen.getByRole('button', { name: 'thought-initial-0' }));
    expect(screen.getByTestId('work-modal')).toHaveTextContent('Agent 1 - Initial Thought Process');
    fireEvent.click(screen.getByRole('button', { name: 'Close work modal' }));

    fireEvent.click(screen.getByRole('button', { name: 'thought-refined-0' }));
    expect(screen.getByTestId('work-modal')).toHaveTextContent('Critic 1 - Refinement Thought Process');
    fireEvent.click(screen.getByRole('button', { name: 'Close work modal' }));

    fireEvent.click(screen.getByRole('button', { name: 'debug-initial-0' }));
    expect(screen.getByTestId('debug-modal')).toHaveTextContent('Agent 1 - Initial Debug Info');
    fireEvent.click(screen.getByRole('button', { name: 'Close debug modal' }));

    fireEvent.click(screen.getByRole('button', { name: 'expand-initial-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'thought-initial-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'regenerate-synthesis' }));
    fireEvent.click(screen.getByRole('button', { name: 'missing-initial-0' }));

    expect(screen.queryByTestId('work-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('debug-modal')).not.toBeInTheDocument();

    const details = document.querySelector('.show-work-container') as HTMLDetailsElement;
    details.open = true;

    fireEvent.click(screen.getByRole('button', { name: /collapse agent work/i }));

    expect(details.open).toBe(false);
  });

  it('hides refinement, synthesis, token footer, and continue actions when the work has nothing resumable', () => {
    mocks.resolvedSwarmState.mockReturnValue({
      synthesizerState: undefined,
      refinementStarted: false,
      isEarlyStageWorking: false,
    });

    render(
      <ShowWork
        {...createProps({
          work: createWork({
            results: {
              [STEPS.INITIAL]: ['Only draft'],
            },
            debugInfo: {
              [STEPS.INITIAL]: [createDebugInfo('initial')],
            },
          }),
          isLive: true,
          isPaused: true,
          onContinue: undefined,
          onRegenerate: undefined,
        })}
      />
    );

    expect(screen.queryByText('Critiques & Refinements')).not.toBeInTheDocument();
    expect(screen.queryByText('Final Synthesis')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText('tokens')).not.toBeInTheDocument();
  });
});
