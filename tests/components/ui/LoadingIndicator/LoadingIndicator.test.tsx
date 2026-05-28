import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, Work } from '@/types';
import { ProviderType } from '@/types';
import { STEPS } from '@/types/steps';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';

const mocks = vi.hoisted(() => ({
  loggerDebug: vi.fn(),
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug(...args: unknown[]) {
      mocks.loggerDebug(...args);
    }

    error() {}
    info() {}
    warn() {}
  },
}));

vi.mock('@/components/chat', () => ({
  AgentAvatar: ({ type, provider, model }: any) => (
    <div data-testid="agent-avatar">{`${type}:${provider}:${model}`}</div>
  ),
}));

vi.mock('@/components/ui/TimerDisplay', () => ({
  TimerDisplay: ({ isActive }: { isActive: boolean }) => (
    <div data-testid="timer-display">{isActive ? 'active' : 'inactive'}</div>
  ),
}));

const createAgentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'waiting',
  label: 'Waiting...',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  ...overrides,
});

const createWork = (overrides: Partial<Work> = {}): Work => ({
  ...overrides,
});

describe('LoadingIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives a step-specific status while rendering the wrapped avatar layout', () => {
    const { container } = render(
      <LoadingIndicator
        status="Working..."
        agentStates={[
          createAgentState({
            status: 'working',
            label: 'Drafting...',
            messageId: 'message-1',
          }),
          createAgentState({
            id: 'synth-1',
            name: 'Synthesizer Agent',
            status: 'done',
            label: 'Synthesized',
            stepId: STEPS.SYNTHESIS,
            messageId: 'message-1',
          }),
        ]}
        provider={ProviderType.Gemini}
        model="gemini-2.5-flash"
      />
    );

    expect(screen.getByTestId('agent-avatar')).toHaveTextContent('model:gemini:gemini-2.5-flash');
    expect(screen.getByText('Drafting initial responses...')).toBeInTheDocument();
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Synthesizer Agent')).toBeInTheDocument();
    expect(screen.getByTestId('timer-display')).toHaveTextContent('active');
    expect(container.querySelector('.agent-icon svg')).toBeInTheDocument();
  });

  it('falls back to the waiting status and resumes via onContinue when paused', () => {
    const onContinue = vi.fn();

    render(
      <LoadingIndicator
        status=""
        phase="awaiting-user"
        agentStates={[createAgentState({ messageId: 'message-1' })]}
        isPausedForAction
        messageId="message-1"
        onContinue={onContinue}
        noWrapper
      />
    );

    expect(screen.queryByTestId('agent-avatar')).not.toBeInTheDocument();
    expect(screen.getByText('Starting Swarm...')).toBeInTheDocument();
    expect(screen.getByTestId('timer-display')).toHaveTextContent('inactive');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows the retry error state for the current message and retries each errored agent', () => {
    const onRegenerate = vi.fn();

    render(
      <LoadingIndicator
        status="Retry needed"
        phase="recoverable-error"
        inlineErrorMessage="upstream failed"
        agentStates={[
          createAgentState({
            id: 'error-1',
            status: 'error',
            label: 'Draft Failed',
            messageId: 'message-1',
            agentIndex: 0,
          }),
          createAgentState({
            id: 'error-2',
            name: 'Agent 2',
            status: 'error',
            label: 'Draft Failed',
            messageId: 'message-1',
            agentIndex: 1,
          }),
          createAgentState({
            id: 'other-message',
            name: 'Other Agent',
            status: 'error',
            label: 'Draft Failed',
            messageId: 'message-2',
            agentIndex: 2,
          }),
        ]}
        isPausedForAction
        messageId="message-1"
        onRegenerate={onRegenerate}
        noWrapper
      />
    );

    expect(screen.getByText('Process Interrupted')).toBeInTheDocument();
    expect(screen.getByText('upstream failed')).toBeInTheDocument();
    expect(screen.queryByText('Other Agent')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRegenerate).toHaveBeenNthCalledWith(1, STEPS.INITIAL, 0);
    expect(onRegenerate).toHaveBeenNthCalledWith(2, STEPS.INITIAL, 1);
  });

  it('shows Skip Step for non-synthesis recoverable errors and calls onSkip', () => {
    const onSkip = vi.fn();

    render(
      <LoadingIndicator
        status="Retry needed"
        phase="recoverable-error"
        inlineErrorMessage="upstream failed"
        agentStates={[
          createAgentState({
            id: 'error-1',
            status: 'error',
            label: 'Draft Failed',
            messageId: 'message-1',
            agentIndex: 0,
          }),
        ]}
        isPausedForAction
        messageId="message-1"
        onSkip={onSkip}
        onRegenerate={vi.fn()}
        work={createWork({
          results: {},
          stepMetadata: [{ id: STEPS.INITIAL, status: 'error', label: 'Initial Step' }],
        })}
        noWrapper
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip Step' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('hides Skip Step for synthesis recoverable errors while keeping Retry available', () => {
    const onRegenerate = vi.fn();

    render(
      <LoadingIndicator
        status="Retry needed"
        phase="recoverable-error"
        inlineErrorMessage="synthesis failed"
        agentStates={[
          createAgentState({
            id: 'synth-error',
            name: 'Synthesizer',
            status: 'error',
            label: 'Synthesis Failed',
            stepId: STEPS.SYNTHESIS,
            messageId: 'message-1',
            agentIndex: 0,
          }),
        ]}
        isPausedForAction
        messageId="message-1"
        onSkip={vi.fn()}
        onRegenerate={onRegenerate}
        work={createWork({
          results: {},
          stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'error', label: 'Synthesis Step' }],
        })}
        noWrapper
      />
    );

    expect(screen.queryByRole('button', { name: 'Skip Step' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRegenerate).toHaveBeenCalledWith(STEPS.SYNTHESIS, 0);
  });

  it('treats stale synthesis metadata as incomplete and keeps Continue available for paused live sessions', () => {
    const onContinue = vi.fn();

    render(
      <LoadingIndicator
        status="Paused"
        phase="awaiting-user"
        agentStates={[createAgentState({ messageId: 'message-1', status: 'done', label: 'Drafted' })]}
        isPausedForAction
        messageId="message-1"
        onContinue={onContinue}
        work={createWork({
          stepMetadata: [{ id: STEPS.SYNTHESIS, status: 'stale', label: 'Synthesis Step', staleFromStepId: STEPS.REFINEMENT }],
          results: {
            [STEPS.SYNTHESIS]: ['Old final answer'],
          },
        })}
        noWrapper
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('logs render debug output only when the visible indicator state changes', () => {
    const baseAgent = createAgentState({
      status: 'working',
      label: 'Drafting...',
      messageId: 'message-1',
    });

    const { rerender } = render(
      <LoadingIndicator
        status="Drafting initial responses..."
        agentStates={[
          baseAgent,
          createAgentState({
            id: 'other-message-agent',
            name: 'Agent 2',
            status: 'waiting',
            label: 'Waiting...',
            messageId: 'message-2',
            agentIndex: 1,
          }),
        ]}
        messageId="message-1"
        noWrapper
      />
    );

    const getRenderLogCalls = () => mocks.loggerDebug.mock.calls.filter(([message]) => message === 'LoadingIndicator RENDER');

    expect(getRenderLogCalls()).toHaveLength(1);

    rerender(
      <LoadingIndicator
        status="Drafting initial responses..."
        agentStates={[
          { ...baseAgent },
          createAgentState({
            id: 'other-message-agent',
            name: 'Agent 2',
            status: 'error',
            label: 'Failed elsewhere',
            messageId: 'message-2',
            agentIndex: 1,
          }),
        ]}
        messageId="message-1"
        noWrapper
      />
    );

    expect(getRenderLogCalls()).toHaveLength(1);

    rerender(
      <LoadingIndicator
        status="Paused"
        phase="awaiting-user"
        agentStates={[
          { ...baseAgent, status: 'done', label: 'Drafted' },
          createAgentState({
            id: 'other-message-agent',
            name: 'Agent 2',
            status: 'error',
            label: 'Failed elsewhere',
            messageId: 'message-2',
            agentIndex: 1,
          }),
        ]}
        isPausedForAction
        messageId="message-1"
        noWrapper
      />
    );

    expect(getRenderLogCalls()).toHaveLength(2);
  });
});
