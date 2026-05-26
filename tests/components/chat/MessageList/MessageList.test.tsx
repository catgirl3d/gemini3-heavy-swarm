import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageList } from '@/components/chat/MessageList/MessageList';
import { STEPS } from '@/types/steps';
import { ProviderType, type AgentState, type Message, type Work } from '@/types';

const mocks = vi.hoisted(() => ({
  store: {
    activeSessionMessageId: undefined as string | undefined,
    sessionsByMessageId: {} as Record<string, { work?: Work; agentStates?: AgentState[] }>,
  },
}));

// Mock child components to verify props and prevent heavy rendering
vi.mock('@/components/ui', () => ({
  LoadingIndicator: (props: any) => (
    <div data-testid="mock-loading-indicator">
      <button type="button" data-testid="loading-skip-btn" onClick={props.onSkip}>Skip</button>
    </div>
  ),
  MarkdownRenderer: () => <div data-testid="mock-markdown" />,
}));

vi.mock('@/components/chat/ShowWork', () => ({
  ShowWork: (props: any) => (
    <div data-testid="mock-show-work">
      <button data-testid="show-work-skip-btn" onClick={props.onSkip}>Skip</button>
    </div>
  )
}));

vi.mock('@/components/chat/AgentAvatar', () => ({
  AgentAvatar: () => <div data-testid="mock-avatar" />
}));

vi.mock('@/components/chat/EmptyState', () => ({
  EmptyState: () => <div data-testid="mock-empty" />
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  }
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector: (state: any) => unknown) => selector(mocks.store),
  selectActiveSessionMessageId: (state: any) => state.activeSessionMessageId,
  selectActiveSession: (state: any) => state.activeSessionMessageId ? state.sessionsByMessageId[state.activeSessionMessageId] : undefined,
}));

describe('MessageList UI Drill', () => {
  it('correctly propagates the onSkip callback to LoadingIndicator and ShowWork components', () => {
    const onSkipMock = vi.fn();
    const activeAgent: AgentState = {
      id: 'agent-1',
      name: 'Agent 1',
      status: 'error',
      label: 'Draft Failed',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      messageId: 'msg-model-active',
    };
    const mockMessages: Message[] = [
      {
        id: 'msg-model-active',
        role: 'model',
        parts: [{ text: '' }],
        work: {
          results: { [STEPS.INITIAL]: ['draft'] },
          stepMetadata: [{ id: STEPS.INITIAL, status: 'error' }],
        },
      }
    ];

    const mockWork: Work = {
      results: { [STEPS.INITIAL]: ['draft'] },
      stepMetadata: [{ id: STEPS.INITIAL, status: 'error' }]
    };

    mocks.store.activeSessionMessageId = 'msg-model-active';
    mocks.store.sessionsByMessageId = {
      'msg-model-active': {
        work: mockWork,
        agentStates: [activeAgent],
      },
    };

    render(
      <MessageList
        messages={mockMessages}
        activePhase="recoverable-error"
        shouldShowLoadingIndicator={true}
        shouldReadLiveWork={true}
        isPausedForAction={true}
        isTimerActive={false}
        inlineErrorMessage={null}
        globalErrorMessage={null}
        loadingStatus="paused"
        progressStatusText="errored"
        modelDisplayName="Gemini Swarm"
        provider={ProviderType.Gemini}
        model="gemini-2.5-flash"
        messageListRef={{ current: null }}
        onPromptClick={() => {}}
        onContinue={() => {}}
        onSkip={onSkipMock}
        onRetry={() => {}}
        onRegenerate={() => {}}
      />
    );

    const loadingSkipBtn = screen.getByTestId('loading-skip-btn');
    fireEvent.click(loadingSkipBtn);
    expect(onSkipMock).toHaveBeenCalledTimes(1);

    onSkipMock.mockClear();
    const showWorkSkipBtn = screen.getByTestId('show-work-skip-btn');
    fireEvent.click(showWorkSkipBtn);
    expect(onSkipMock).toHaveBeenCalledTimes(1);
  });
});
