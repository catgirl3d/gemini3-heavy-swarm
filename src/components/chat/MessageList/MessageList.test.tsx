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
  isLoading: false,
  isPaused: false,
  error: null,
  loadingStatus: 'Working...',
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
        parts: [{ text: 'Final answer' }],
        sources: [{ title: 'Source One', uri: 'https://example.com/source' }],
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
              parts: [{ text: 'Final answer' }],
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

  it('hides the last empty model message on global error unless it already has completed drafts', () => {
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
        work: {
          agentStates: [createAgentState()],
        },
      },
    ];

    const { rerender } = render(
      <MessageList
        {...createMessageListProps({
          messages: messagesWithoutDrafts,
          error: 'Synthesis failed',
        })}
      />
    );

    expect(screen.queryByTestId('show-work')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('agent-avatar')).toHaveLength(1);

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
          error: 'Synthesis failed',
        })}
      />
    );

    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:history:regen');
  });

  it('renders inline live progress for the active model message and disables regeneration for stopped work', () => {
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
          isLoading: true,
        })}
      />
    );

    expect(screen.getByTestId('loading-indicator')).toHaveTextContent('loading:model-1:regen:inner');
    expect(screen.getByTestId('show-work')).toHaveTextContent('show-work:model-1:live:noregen');
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
          isLoading: true,
          isPaused: true,
          error: 'Network failed',
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
