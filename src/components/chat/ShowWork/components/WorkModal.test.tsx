import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown-renderer">{content}</div>,
}));

import { WorkModal } from './WorkModal';

describe('WorkModal', () => {
  it('renders the expanded work content inside a modal and forwards the header close action', () => {
    const onClose = vi.fn();

    render(
      <WorkModal
        title="Expanded Draft"
        content="## Detailed output"
        onClose={onClose}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Expanded Draft' })).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('## Detailed output');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
