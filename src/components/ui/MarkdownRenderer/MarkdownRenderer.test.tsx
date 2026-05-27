import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockCodeBlockProps {
  children?: ReactNode;
  className?: string;
}

const mocks = vi.hoisted(() => ({
  codeBlock: vi.fn<(props: MockCodeBlockProps) => void>(),
}));

vi.mock('@/components/ui/CodeBlock', () => ({
  CodeBlock: (props: MockCodeBlockProps) => {
    mocks.codeBlock(props);

    return (
      <div data-testid="code-block" data-class-name={props.className ?? ''}>
        {String(props.children)}
      </div>
    );
  },
}));

import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plain markdown inside the content wrapper', () => {
    const { container } = render(<MarkdownRenderer content={'## Heading\n\n**Bold** text'} />);

    expect(container.querySelector('.markdown-content')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeInTheDocument();
    expect(container.querySelector('.markdown-content strong')).toHaveTextContent('Bold');
  });

  it('wraps GFM tables in the scroll container', () => {
    const content = [
      '| Col A | Col B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');

    const { container } = render(<MarkdownRenderer content={content} />);

    expect(container.querySelector('.table-wrapper')).toBeInTheDocument();
    expect(container.querySelector('.table-wrapper table')).toBeInTheDocument();
    expect(screen.getByText('Col A')).toBeInTheDocument();
  });

  it('renders inline code inline and delegates fenced blocks to CodeBlock', () => {
    const content = [
      'Use `snippet` inline.',
      '',
      '```typescript',
      'const value = 1;',
      '```',
    ].join('\n');

    render(<MarkdownRenderer content={content} />);

    const codeBlocks = screen.getAllByTestId('code-block');

    expect(screen.getByText('snippet', { selector: 'code' })).toBeInTheDocument();
    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0]).toHaveAttribute('data-class-name', 'language-typescript');
    expect(codeBlocks[0]).toHaveTextContent('const value = 1;');
    expect(mocks.codeBlock).toHaveBeenCalledTimes(1);
  });
});
