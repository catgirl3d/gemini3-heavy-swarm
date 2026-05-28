import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sources } from '@/components/chat/Sources/Sources';

describe('Sources', () => {
  it('renders explicit titles, hostname fallbacks, and secure outbound link attributes', () => {
    render(
      <Sources
        sources={[
          { title: 'Primary citation', uri: 'https://docs.example.com/path/to/page' },
          { title: '', uri: 'https://fallback.example.org/article' },
        ]}
      />
    );

    expect(screen.getByText('Sources & Citations')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Primary citation')).toBeInTheDocument();
    expect(screen.getByText('fallback.example.org')).toBeInTheDocument();

    const links = screen.getAllByRole('link');

    expect(links[0]).toHaveAttribute('href', 'https://docs.example.com/path/to/page');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(links[1]).toHaveAttribute('href', 'https://fallback.example.org/article');
  });
});
