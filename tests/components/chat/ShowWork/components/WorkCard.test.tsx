import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadContent: vi.fn(),
}));

vi.mock('@/components/ui', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown-renderer">{content}</div>,
}));

vi.mock('@/components/chat/ShowWork/components/ActionMenu', () => ({
  ActionMenu: ({ actions }: any) => (
    <div data-testid="action-menu">
      {actions.map((action: any) => (
        <button
          key={action.label}
          type="button"
          data-danger={String(!!action.danger)}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/chat/ShowWork/components/TokenUsage', () => ({
  TokenUsage: ({ usage }: any) => <div data-testid="token-usage">{usage.totalTokens}</div>,
}));

vi.mock('@/components/chat/ShowWork/utils', () => ({
  downloadContent: mocks.downloadContent,
}));

import { WorkCard } from '@/components/chat/ShowWork/components/WorkCard';

describe('WorkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies error states and routes cardId actions through onCardAction', () => {
    const onCardAction = vi.fn();

    render(
      <WorkCard
        title="Agent 1"
        statusLabel="429 Too Many Requests"
        status="error"
        content={null}
        thought="Reasoning trace"
        debugInfo={{ requestId: 'req-1' }}
        cardId="card-1"
        onCardAction={onCardAction}
        allowRegenerate
        downloadFilename="Agent-1.md"
      />
    );

    expect(screen.getByText('Rate Limit')).toBeInTheDocument();
    expect(screen.getByText('Too many requests (429). Please wait a moment and try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Thought Process' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debug Info' }));

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    expect(retryButton).toHaveAttribute('data-danger', 'true');
    fireEvent.click(retryButton);

    expect(onCardAction).toHaveBeenNthCalledWith(1, 'card-1', 'showThought');
    expect(onCardAction).toHaveBeenNthCalledWith(2, 'card-1', 'showDebug');
    expect(onCardAction).toHaveBeenNthCalledWith(3, 'card-1', 'regenerate');
  });

  it('supports direct callbacks, empty-done warnings, expand, download, and token usage', () => {
    const onExpand = vi.fn();
    const onShowThought = vi.fn();
    const onShowDebug = vi.fn();
    const onRegenerate = vi.fn();
    const { rerender } = render(
      <WorkCard
        title="Agent 2"
        statusLabel="Complete"
        status="done"
        content=""
        thought="Captured thought"
        onShowThought={onShowThought}
        onRegenerate={onRegenerate}
        allowRegenerate
        downloadFilename="Agent-2.md"
      />
    );

    expect(screen.getByText('No Text Response')).toBeInTheDocument();
    expect(screen.getByText(/Thought process was captured/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Thought Process' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(onShowThought).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(
      <WorkCard
        title="Agent 2"
        statusLabel="Complete"
        status="done"
        content="Final draft"
        thought="Captured thought"
        debugInfo={{ trace: true }}
        tokenUsage={{ promptTokens: 2, candidatesTokens: 3, totalTokens: 5 }}
        onExpand={onExpand}
        onShowThought={onShowThought}
        onShowDebug={onShowDebug}
        onRegenerate={onRegenerate}
        allowRegenerate
        downloadFilename="Agent-2.md"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand Response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debug Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Response' }));

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onShowDebug).toHaveBeenCalledTimes(1);
    expect(mocks.downloadContent).toHaveBeenCalledWith('Agent-2.md', 'Final draft');
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Final draft');
    expect(screen.getByTestId('token-usage')).toHaveTextContent('5');
  });

  it('throttles working content updates but renders the first chunk immediately', () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content={null}
        downloadFilename="stream.md"
      />
    );

    expect(screen.getByText('Waiting for agent output...')).toBeInTheDocument();

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content=""
        downloadFilename="stream.md"
      />
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content="First chunk"
        downloadFilename="stream.md"
      />
    );

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('First chunk');

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content="Second chunk"
        downloadFilename="stream.md"
      />
    );

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('First chunk');

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content="Third chunk"
        downloadFilename="stream.md"
      />
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Third chunk');

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Done"
        status="done"
        content="Final answer"
        downloadFilename="stream.md"
      />
    );

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Final answer');
  });

  it('uses the generic failed-label fallback and routes expand through cardId actions', () => {
    const onCardAction = vi.fn();

    render(
      <WorkCard
        title="Agent 3"
        statusLabel="Draft Failed"
        status="error"
        content="Partial response"
        cardId="card-3"
        onCardAction={onCardAction}
        allowRegenerate
        downloadFilename="Agent-3.md"
      />
    );

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('An error occurred during generation.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Response' }));

    expect(onCardAction).toHaveBeenCalledWith('card-3', 'expand');
  });

  it('renders stale results as visible content and keeps regenerate available', () => {
    const onCardAction = vi.fn();

    render(
      <WorkCard
        title="Critic 1"
        statusLabel="Stale"
        status="stale"
        content="Old refined answer"
        cardId="stale-card"
        onCardAction={onCardAction}
        allowRegenerate
        downloadFilename="Critic-1.md"
      />
    );

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Old refined answer');

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(onCardAction).toHaveBeenCalledWith('stale-card', 'regenerate');
  });

  it('renders skipped agents explicitly and omits the thought suffix when none exists', () => {
    const { rerender } = render(
      <WorkCard
        title="Agent 4"
        statusLabel="Skipped by orchestrator"
        status="done"
        content=""
        downloadFilename="Agent-4.md"
      />
    );

    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('This agent was skipped during execution. No response was generated.')).toBeInTheDocument();

    rerender(
      <WorkCard
        title="Agent 4"
        statusLabel="Complete"
        status="done"
        content=""
        downloadFilename="Agent-4.md"
      />
    );

    expect(screen.getByText('No Text Response')).toBeInTheDocument();
    expect(screen.getByText(/The model completed successfully but did not return any text content\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Thought process was captured/i)).not.toBeInTheDocument();
  });

  it('safely no-ops action handlers and renders waiting content without a custom icon', () => {
    const { rerender } = render(
      <WorkCard
        title="Waiting Agent"
        statusLabel="Waiting"
        status="waiting"
        icon={<span data-testid="custom-icon">custom</span>}
        content="Visible content"
        thought="Trace"
        debugInfo={{ trace: true }}
        downloadFilename="waiting.md"
      />
    );

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Thought Process' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debug Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Response' }));

    expect(mocks.downloadContent).toHaveBeenCalledWith('waiting.md', 'Visible content');

    rerender(
      <WorkCard
        title="Waiting Agent"
        statusLabel="Waiting"
        status="waiting"
        content="Visible content"
        downloadFilename="waiting.md"
      />
    );

    expect(screen.queryByTestId('custom-icon')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting Agent')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Visible content');
  });

  it('does not let a delayed streaming chunk overwrite completed content', () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content={null}
        downloadFilename="stream.md"
      />
    );

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content="First chunk"
        downloadFilename="stream.md"
      />
    );

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Drafting"
        status="working"
        content="Second chunk"
        downloadFilename="stream.md"
      />
    );

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('First chunk');

    rerender(
      <WorkCard
        title="Streaming Agent"
        statusLabel="Complete"
        status="done"
        content="Final answer"
        downloadFilename="stream.md"
      />
    );

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Final answer');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Final answer');
  });
});
