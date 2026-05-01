import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentState } from '@/types';
import { ProviderType } from '@/types';
import { STEPS } from '@/types/steps';

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

import { LoadingIndicator } from './LoadingIndicator';

const createAgentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'waiting',
  label: 'Waiting...',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  ...overrides,
});

describe('LoadingIndicator', () => {
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
        agentStates={[createAgentState({ messageId: 'message-1' })]}
        isPaused
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
        status="Error: upstream failed"
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
        isPaused
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
});
