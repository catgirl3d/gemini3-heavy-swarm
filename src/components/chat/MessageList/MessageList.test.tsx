import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState, Message, Work } from '@/types';
import { ProviderType } from '@/types';
import { STEPS } from '@/types/steps';
import { Logger } from '@shared/utils/logger';

const mocks = vi.hoisted(() => ({
  downloadContent: vi.fn(),
  emptyState: vi.fn(),
  markdownRenderer: vi.fn(),
  loadingIndicator: vi.fn(),
  showWork: vi.fn(),
  sources: vi.fn(),
  store: {
    activeSessionMessageId: undefined as string | undefined,
    sessionsByMessageId: {} as Record<string, { work?: Work; agentStates?: AgentState[] }>,
  },
}));

vi.mock('@/components/chat/AgentAvatar', () => ({
  AgentAvatar: ({ type, provider, model }: any) => (
    <div data-testid="agent-avatar">{`${type}:${provider}:${model}`}</div>
  ),
}));

vi.mock('@/components/chat/EmptyState', () => ({
  EmptyState: (props: any) => {
    mocks.emptyState(props);

    return (
      <button
        type="button"
        data-testid="empty-state"
        onClick={() => props.onPromptClick('Suggested prompt')}
      >
        {`${props.modelDisplayName}|${props.provider}|${props.model}`}
      </button>
    );
  },
}));

vi.mock('@/components/ui', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => {
    mocks.markdownRenderer(content);
    return <div data-testid="markdown-renderer">{content}</div>;
  },
  LoadingIndicator: (props: any) => {
    mocks.loadingIndicator(props);
    return (
      <div data-testid="loading-indicator">
        {`loading:${props.messageId ?? 'none'}:${props.onRegenerate ? 'regen' : 'noregen'}:${props.noWrapper ? 'inner' : 'outer'}`}
      </div>
    );
  },
}));

vi.mock('@/components/chat/ShowWork', () => ({
  ShowWork: (props: any) => {
    mocks.showWork(props);
    return (
      <div data-testid="show-work">
        {`show-work:${props.messageId ?? 'none'}:${props.isLive ? 'live' : 'history'}:${props.onRegenerate ? 'regen' : 'noregen'}`}
      </div>
    );
  },
}));

vi.mock('@/components/chat/Sources', () => ({
  Sources: ({ sources }: { sources: { title: string }[] }) => {
    mocks.sources(sources);
    return <div data-testid="sources">{sources.map(source => source.title).join(', ')}</div>;
  },
}));

vi.mock('@/components/chat/ShowWork/utils', () => ({
  downloadContent: mocks.downloadContent,
}));

vi.mock('@/stores/agentStore', () => ({
  useAgentStore: (selector: (state: any) => unknown) => selector(mocks.store),
  selectActiveSessionMessageId: (state: any) => state.activeSessionMessageId,
  selectActiveSession: (state: any) => state.activeSessionMessageId ? state.sessionsByMessageId[state.activeSessionMessageId] : undefined,
}));

import { MessageList } from './MessageList';

type MessageListProps = ComponentProps<typeof MessageList>;

const createAgentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'done',
  label: 'Drafted',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  ...overrides,
});

const createMessageListProps = (overrides: Partial<MessageListProps> = {}): MessageListProps => ({
  messages: [],
  activePhase: null,
  shouldShowLoadingIndicator: false,
  shouldReadLiveWork: false,
  isPausedForAction: false,
  isTimerActive: false,
  inlineErrorMessage: null,
  globalErrorMessage: null,
  loadingStatus: 'Working...',
  progressStatusText: 'Working...',
  modelDisplayName: 'Gemini 2.5 Flash',
  provider: ProviderType.Gemini,
  model: 'gemini-2.5-flash',
  messageListRef: createRef<HTMLDivElement>(),
  onPromptClick: vi.fn(),
  onContinue: vi.fn(),
  onRetry: vi.fn(),
  onRegenerate: vi.fn(),
  ...overrides,
});

describe('MessageList', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.activeSessionMessageId = undefined;
    mocks.store.sessionsByMessageId = {};
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the empty state when idle and forwards prompt clicks', () => {
    const onPromptClick = vi.fn();

    render(
      <MessageList
        {...createMessageListProps({
          onPromptClick,
        })}
      />
    );

    expect(screen.getByTestId('empty-state')).toHaveTextContent('Gemini 2.5 Flash|gemini|gemini-2.5-flash');

    fireEvent.click(screen.getByTestId('empty-state'));

    expect(onPromptClick).toHaveBeenCalledWith('Suggested prompt');
  });

  it('renders model output actions, image and sources, and resets action feedback after the timeout', async () => {
    vi.useFakeTimers();

    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ text: 'User prompt' }],
        image: 'data:image/png;base64,abc',
      },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
        work: {
          results: {
            [STEPS.SYNTHESIS]: ['Final answer'],
            [`${STEPS.SYNTHESIS}_sources`]: [{ title: 'Source One', uri: 'https://example.com/source' }],
          },
        },
      },
    ];

    render(
      <MessageList
        {...createMessageListProps({
          messages,
        })}
      />
    );

    expect(screen.getByText('User prompt')).toBeInTheDocument();
    expect(screen.getByAltText('User upload')).toHaveAttribute('src', 'data:image/png;base64,abc');
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Final answer');
    expect(screen.getByTestId('sources')).toHaveTextContent('Source One');

    fireEvent.click(screen.getByTitle('Copy Response'));
    fireEvent.click(screen.getByTitle('Export Response'));

    expect(clipboardWriteText).toHaveBeenCalledWith('Final answer');
    expect(mocks.downloadContent).toHaveBeenCalledWith('Synthesis_Report.md', 'Final answer');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTitle('Copied!')).toBeInTheDocument();
    expect(screen.getByTitle('Exported!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTitle('Copy Response')).toBeInTheDocument();
    expect(screen.getByTitle('Export Response')).toBeInTheDocument();
  });

  it('does not show copied feedback when response copy fails', async () => {
    const error = new Error('clipboard blocked');
    clipboardWriteText.mockRejectedValue(error);
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    render(
      <MessageList
        {...createMessageListProps({
          messages: [
            {
              id: 'model-1',
              role: 'model',
              parts: [{ text: '' }],
              work: {
                results: {
                  [STEPS.SYNTHESIS]: ['Final answer'],
                },
              },
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByTitle('Copy Response'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loggerError).toHaveBeenCalledWith('Failed to copy response:', error);
    expect(screen.getByTitle('Copy Response')).toBeInTheDocument();
    expect(screen.queryByTitle('Copied!')).not.toBeInTheDocument();
  });

  it('logs both async and sync export handler failures without showing success feedback', async () => {
    const asyncError = new Error('async export failed');
    const syncError = new Error('sync export failed');
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mocks.downloadContent.mockReturnValueOnce(Promise.reject(asyncError));

    const { rerender } = render(
      <MessageList
        {...createMessageListProps({
          messages: [
            {
              id: 'model-1',
              role: 'model',
              parts: [{ text: '' }],
              work: {
                results: {
                  [STEPS.SYNTHESIS]: ['Final answer'],
                },
              },
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByTitle('Export Response'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loggerError).toHaveBeenCalledWith('Action button handler failed:', asyncError);
    expect(screen.queryByTitle('Exported!')).not.toBeInTheDocument();

    mocks.downloadContent.mockImplementationOnce(() => {
      throw syncError;
    });

    rerender(
      <MessageList
        {...createMessageListProps({
          messages: [
            {
              id: 'model-1',
              role: 'model',
              parts: [{ text: '' }],
              work: {
                results: {
                  [STEPS.SYNTHESIS]: ['Final answer'],
                },
              },
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByTitle('Export Response'));

    expect(loggerError).toHaveBeenCalledWith('Action button handler failed:', syncError);
    expect(screen.queryByTitle('Exported!')).not.toBeInTheDocument();
  });

  it('skips empty inactive model rows but still shows the active loading row without work', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ text: 'Question' }],
      },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
      },
    ];

    const { rerender } = render(
      <MessageList
        {...createMessageListProps({
          messages,
        })}
      />
    );

    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('show-work')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('agent-avatar')).toHaveLength(1);

    mocks.store.activeSessionMessageId = 'model-1';
    mocks.store.sessionsByMessageId = {
      'model-1': {
        work: undefined,
        agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
      },
    };

    rerender(
      <MessageList
        {...createMessageListProps({
          messages,
          activePhase: 'running',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isTimerActive: true,
        })}
      />
    );

    expect(screen.getByTestId('loading-indicator')).toHaveTextContent('loading:model-1:regen:inner');
    expect(screen.queryByTestId('show-work')).not.toBeInTheDocument();
  });

  it('hides the last model message on global error unless it already has completed drafts', () => {
    const messagesWithoutDrafts: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ text: 'Start' }],
      },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
      },
    ];

    const { rerender } = render(
      <MessageList
        {...createMessageListProps({
          messages: messagesWithoutDrafts,
          globalErrorMessage: 'Synthesis failed',
        })}
      />
    );

    expect(screen.queryByTestId('show-work')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('agent-avatar')).toHaveLength(1);

    const messagesWithFailureWork: Message[] = [
      messagesWithoutDrafts[0],
      {
        ...messagesWithoutDrafts[1],
        work: {
          agentStates: [createAgentState({ status: 'error', label: 'Failed' })],
        },
      },
    ];

    rerender(
      <MessageList
        {...createMessageListProps({
          messages: messagesWithFailureWork,
          globalErrorMessage: 'Synthesis failed',
        })}
      />
    );

    expect(screen.queryByTestId('show-work')).not.toBeInTheDocument();

    const messagesWithDrafts: Message[] = [
      messagesWithoutDrafts[0],
      {
        ...messagesWithoutDrafts[1],
        work: {
          results: {
            [STEPS.INITIAL]: ['Draft already generated'],
          },
          agentStates: [createAgentState()],
        },
      },
    ];

    rerender(
      <MessageList
        {...createMessageListProps({
          messages: messagesWithDrafts,
          globalErrorMessage: 'Synthesis failed',
        })}
      />
    );

    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:history:regen');
  });

  it('keeps the active model work card visible on error when live session work already has drafts', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ text: 'Start' }],
      },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
      },
    ];
    mocks.store.activeSessionMessageId = 'model-1';
    mocks.store.sessionsByMessageId = {
      'model-1': {
        work: {
          results: {
            [STEPS.INITIAL]: ['Live draft already generated'],
          },
          agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
        },
        agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
      },
    };

    render(
      <MessageList
        {...createMessageListProps({
          messages,
          activePhase: 'running',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isTimerActive: true,
          globalErrorMessage: 'Synthesis failed',
        })}
      />
    );

    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:live:regen');
  });

  it('forwards regenerate callbacks from the active row loading indicator', () => {
    const onRegenerate = vi.fn();
    const messages: Message[] = [
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
      },
    ];

    mocks.store.activeSessionMessageId = 'model-1';
    mocks.store.sessionsByMessageId = {
      'model-1': {
        work: {
          agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
        },
        agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
      },
    };

    render(
      <MessageList
        {...createMessageListProps({
          messages,
          activePhase: 'running',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isTimerActive: true,
          onRegenerate,
        })}
      />
    );

    const rowLoadingProps = mocks.loadingIndicator.mock.calls.at(-1)?.[0];
    rowLoadingProps.onRegenerate(STEPS.SYNTHESIS, 1);

    expect(onRegenerate).toHaveBeenCalledWith('model-1', STEPS.SYNTHESIS, 1);
  });

  it('uses the active live work alone when deciding whether regeneration is stopped', () => {
    const messages: Message[] = [
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
        work: {
          isStopped: true,
          agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
        },
      },
    ];
    mocks.store.activeSessionMessageId = 'model-1';
    mocks.store.sessionsByMessageId = {
      'model-1': {
        work: { agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })] },
        agentStates: [createAgentState({ messageId: 'model-1', status: 'working', label: 'Drafting...' })],
      },
    };

    render(
      <MessageList
        {...createMessageListProps({
          messages,
          activePhase: 'running',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isTimerActive: true,
        })}
      />
    );

    expect(screen.getByTestId('loading-indicator')).toHaveTextContent('loading:model-1:regen:inner');
    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:live:regen');
  });

  it('passes live session work to active rows and snapshot work to historical rows', () => {
    const historicalWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['Historical answer'],
      },
    };
    const staleActiveWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['Stale snapshot answer'],
      },
    };
    const liveActiveWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['Live session answer'],
      },
      agentStates: [createAgentState({ messageId: 'model-2', status: 'working', label: 'Drafting...' })],
    };
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ text: 'Question 1' }],
      },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
        work: historicalWork,
      },
      {
        id: 'user-2',
        role: 'user',
        parts: [{ text: 'Question 2' }],
      },
      {
        id: 'model-2',
        role: 'model',
        parts: [{ text: '' }],
        work: staleActiveWork,
      },
    ];

    mocks.store.activeSessionMessageId = 'model-2';
    mocks.store.sessionsByMessageId = {
      'model-2': {
        work: liveActiveWork,
        agentStates: [createAgentState({ messageId: 'model-2', status: 'working', label: 'Drafting...' })],
      },
    };

    render(
      <MessageList
        {...createMessageListProps({
          messages,
          activePhase: 'running',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isTimerActive: true,
        })}
      />
    );

    const showWorkPropsByMessageId = Object.fromEntries(
      mocks.showWork.mock.calls.map(([props]) => [props.messageId, props])
    );

    expect(showWorkPropsByMessageId['model-1'].work).toBe(historicalWork);
    expect(showWorkPropsByMessageId['model-2'].work).toBe(liveActiveWork);
    expect(mocks.loadingIndicator.mock.calls[0]?.[0].work).toBe(liveActiveWork);
  });

  it('keeps the current session row on live work during streaming-final phase', () => {
    const staleSnapshotWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: [''],
      },
    };
    const liveSessionWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['Live streaming answer'],
      },
      agentStates: [createAgentState({ messageId: 'model-1', stepId: STEPS.SYNTHESIS, status: 'working', label: 'Synthesizing...' })],
    };
    const messages: Message[] = [
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: '' }],
        work: staleSnapshotWork,
      },
    ];

    mocks.store.activeSessionMessageId = 'model-1';
    mocks.store.sessionsByMessageId = {
      'model-1': {
        work: liveSessionWork,
        agentStates: [createAgentState({ messageId: 'model-1', stepId: STEPS.SYNTHESIS, status: 'working', label: 'Synthesizing...' })],
      },
    };

    render(
      <MessageList
        {...createMessageListProps({
          messages,
          activePhase: 'streaming-final',
          shouldShowLoadingIndicator: false,
          shouldReadLiveWork: true,
          isTimerActive: true,
        })}
      />
    );

    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Live streaming answer');
    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:live:regen');
    expect(mocks.showWork.mock.calls.at(-1)?.[0].work).toBe(liveSessionWork);
  });

  it('forwards regenerate callbacks from row work and from the bottom loading block', () => {
    const onRegenerate = vi.fn();
    const rowMessages: Message[] = [
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: 'Answer 1' }],
        work: {
          results: {
            [STEPS.INITIAL]: ['Draft 1'],
          },
        },
      },
    ];

    const { rerender } = render(
      <MessageList
        {...createMessageListProps({
          messages: rowMessages,
          onRegenerate,
        })}
      />
    );

    const rowShowWorkProps = mocks.showWork.mock.calls.at(-1)?.[0];
    rowShowWorkProps.onRegenerate(STEPS.INITIAL, 2);

    expect(onRegenerate).toHaveBeenCalledWith('model-1', STEPS.INITIAL, 2);

    mocks.store.activeSessionMessageId = 'message-2';
    mocks.store.sessionsByMessageId = {
      'message-2': {
        work: {
          agentStates: [createAgentState({ messageId: 'message-2', status: 'working', label: 'Drafting...' })],
        },
        agentStates: [createAgentState({ messageId: 'message-2', status: 'working', label: 'Drafting...' })],
      },
    };

    rerender(
      <MessageList
        {...createMessageListProps({
          messages: [
            {
              id: 'user-1',
              role: 'user',
              parts: [{ text: 'Question' }],
            },
          ],
          activePhase: 'recoverable-error',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isPausedForAction: true,
          globalErrorMessage: 'Network failed',
          onRegenerate,
        })}
      />
    );

    const bottomLoadingProps = mocks.loadingIndicator.mock.calls.at(-1)?.[0];
    bottomLoadingProps.onRegenerate(STEPS.REFINEMENT, 1);

    const bottomShowWorkProps = mocks.showWork.mock.calls.at(-1)?.[0];
    bottomShowWorkProps.onRegenerate(STEPS.SYNTHESIS, 0);

    expect(onRegenerate).toHaveBeenCalledWith('message-2', STEPS.REFINEMENT, 1);
    expect(onRegenerate).toHaveBeenCalledWith('message-2', STEPS.SYNTHESIS, 0);

    rerender(
      <MessageList
        {...createMessageListProps({
          messages: [
            {
              id: 'user-1',
              role: 'user',
              parts: [{ text: 'Question' }],
            },
          ],
          activePhase: 'running',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isPausedForAction: false,
          onRegenerate,
        })}
      />
    );

    expect(mocks.showWork.mock.calls.at(-1)?.[0].onRegenerate).toBeUndefined();
  });

  it('hides regeneration actions for older assistant turns once a later user prompt exists', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ text: 'Question 1' }],
      },
      {
        id: 'model-1',
        role: 'model',
        parts: [{ text: 'Answer 1' }],
        work: {
          results: {
            [STEPS.INITIAL]: ['Draft 1'],
          },
        },
      },
      {
        id: 'user-2',
        role: 'user',
        parts: [{ text: 'Question 2' }],
      },
    ];

    render(
      <MessageList
        {...createMessageListProps({
          messages,
        })}
      />
    );

    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:history:noregen');
  });

  it('renders the bottom loading block for a new message and keeps retry available for global errors', () => {
    const onRetry = vi.fn();
    const currentWork: Work = {
      agentStates: [createAgentState({ messageId: 'message-2', status: 'working', label: 'Drafting...' })],
    };
    mocks.store.activeSessionMessageId = 'message-2';
    mocks.store.sessionsByMessageId = {
      'message-2': {
        work: currentWork,
        agentStates: [createAgentState({ messageId: 'message-2', status: 'working', label: 'Drafting...' })],
      },
    };

    render(
      <MessageList
        {...createMessageListProps({
          messages: [
            {
              id: 'user-1',
              role: 'user',
              parts: [{ text: 'Question' }],
            },
          ],
          activePhase: 'recoverable-error',
          shouldShowLoadingIndicator: true,
          shouldReadLiveWork: true,
          isPausedForAction: true,
          inlineErrorMessage: 'Network failed',
          globalErrorMessage: 'Network failed',
          onRetry,
        })}
      />
    );

    expect(screen.getByText('Network failed')).toBeInTheDocument();
    expect(screen.getByTestId('loading-indicator')).toHaveTextContent('loading:message-2:regen:inner');
    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:message-2:live:regen');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
