import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

vi.mock('@/components/modals', () => {
  const BaseModal = ({ children, isOpen }: any) => (isOpen ? <div data-testid="base-modal">{children}</div> : null);

  BaseModal.Header = ({ title, onClose, children }: any) => (
    <div>
      <h1>{title}</h1>
      {children}
      <button type="button" onClick={onClose}>
        Close modal
      </button>
    </div>
  );

  BaseModal.Body = ({ children }: any) => <div>{children}</div>;

  return { BaseModal };
});

import { DebugModal } from './DebugModal';

const debugInfo = {
  systemInstruction: 'System line 1\nSystem line 2',
  history: [
    {
      role: 'user',
      parts: [
        { text: 'Past user message' },
        { inlineData: { mimeType: 'image/png', data: 'abc123' } },
      ],
    },
  ],
  userTurn: {
    role: 'model',
    parts: [{ text: 'Current answer' }],
  },
};

describe('DebugModal', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('renders the formatted markdown view by default', () => {
    render(
      <DebugModal
        title="Agent Debug"
        debugInfo={debugInfo as any}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('base-modal')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('### System Instruction');
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('### Chat History');
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('### Current Turn');
  });

  it('switches to the readable JSON formatter with multiline strings and binary placeholders', () => {
    render(
      <DebugModal
        title="Agent Debug"
        debugInfo={debugInfo as any}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Readable JSON' }));

    const readable = screen.getByText((content, element) =>
      element?.tagName.toLowerCase() === 'pre' && content.includes('inlineData: [Binary Data]')
    );

    expect(readable).toBeInTheDocument();
    expect(readable.textContent).toContain('systemInstruction: |');
    expect(readable.textContent).toContain('System line 1');
    expect(readable.textContent).toContain('history:');
  });

  it('shows raw JSON and copies it to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <DebugModal
        title="Agent Debug"
        debugInfo={debugInfo as any}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw JSON' }));

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText((content, element) =>
      element?.tagName.toLowerCase() === 'pre' && content.includes('"systemInstruction": "System line 1\\nSystem line 2"')
    )).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Copy Raw JSON'));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(debugInfo, null, 2));
  });

  it('shows and copies undefined when raw debug info is missing', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <DebugModal
        title="Missing Debug"
        debugInfo={undefined}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw JSON' }));

    expect(screen.getByText((content, element) =>
      element?.tagName.toLowerCase() === 'pre' && content === 'undefined'
    )).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Copy Raw JSON'));

    expect(writeText).toHaveBeenCalledWith('undefined');
  });

  it('formats primitives, empty structures, and long strings in readable mode, then switches back to formatted', () => {
    const structuredDebugInfo = {
      nullable: null,
      attempts: 3,
      emptyList: [],
      emptyObject: {},
      longText: 'x'.repeat(2001),
    };

    render(
      <DebugModal
        title="Structured Debug"
        debugInfo={structuredDebugInfo as any}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Readable JSON' }));

    const readable = screen.getByText((content, element) =>
      element?.tagName.toLowerCase() === 'pre' && content.includes('attempts: 3')
    );

    expect(readable.textContent).toContain('emptyList: []');
    expect(readable.textContent).toContain('emptyObject: {}');
    expect(readable.textContent).toContain('nullable: null');
    expect(readable.textContent).toContain('[Long string: 2001 chars]');

    fireEvent.click(screen.getByRole('button', { name: 'Formatted' }));

    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
  });
});
