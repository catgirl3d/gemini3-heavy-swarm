import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TokenUsage as TokenUsageType } from '@/types';
import { TokenUsage } from './TokenUsage';

const createUsage = (overrides: Partial<TokenUsageType> = {}): TokenUsageType => ({
  promptTokens: 100,
  candidatesTokens: 50,
  totalTokens: 150,
  ...overrides,
});

describe('TokenUsage', () => {
  it('renders nothing without usage data', () => {
    const { container } = render(<TokenUsage usage={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders estimated usage with optional breakdown fields and closes on outside click', () => {
    render(
      <div>
        <button type="button">Outside</button>
        <TokenUsage
          usage={createUsage({
            promptTokens: 12,
            candidatesTokens: 8,
            totalTokens: 30,
            thoughtsTokenCount: 5,
            cachedContentTokenCount: 3,
            toolUsePromptTokenCount: 2,
            isEstimated: true,
          })}
        />
      </div>
    );

    expect(screen.getByText('~30 tokens (P:~12 | O:~8 | T:~5 | C:~3 | TU:~2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Token usage details' }));

    expect(screen.getByText(/Token Usage Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText('(Estimated)')).toBeInTheDocument();
    expect(screen.getByText(/Counts are estimated in real-time/i)).toBeInTheDocument();
    expect(screen.getByText('T (Thoughts)')).toBeInTheDocument();
    expect(screen.getByText('C (Cached)')).toBeInTheDocument();
    expect(screen.getByText('TU (Tool Use)')).toBeInTheDocument();
    expect(screen.getByText('TOTAL')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByText(/Token Usage Breakdown/i)).not.toBeInTheDocument();
  });

  it('omits optional zero-value groups for final usage', () => {
    render(
      <TokenUsage
        usage={createUsage({
          promptTokens: 7,
          candidatesTokens: 9,
          totalTokens: 16,
          thoughtsTokenCount: 0,
          cachedContentTokenCount: 0,
          toolUsePromptTokenCount: 0,
        })}
      />
    );

    expect(screen.getByText('16 tokens (P:7 | O:9)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Token usage details' }));

    expect(screen.queryByText('T (Thoughts)')).not.toBeInTheDocument();
    expect(screen.queryByText('C (Cached)')).not.toBeInTheDocument();
    expect(screen.queryByText('TU (Tool Use)')).not.toBeInTheDocument();
  });

  it('keeps the popup open for inside clicks and shows positive final optional counts without estimate prefixes', () => {
    render(
      <TokenUsage
        usage={createUsage({
          promptTokens: 11,
          candidatesTokens: 13,
          totalTokens: 31,
          thoughtsTokenCount: 4,
          cachedContentTokenCount: 2,
          toolUsePromptTokenCount: 1,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Token usage details' }));
    fireEvent.mouseDown(screen.getByText('T (Thoughts)'));

    expect(screen.getByText(/Token Usage Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText('31 tokens (P:11 | O:13 | T:4 | C:2 | TU:1)')).toBeInTheDocument();
    expect(screen.getByText('T (Thoughts)')).toBeInTheDocument();
    expect(screen.getByText('TU (Tool Use)')).toBeInTheDocument();
    expect(screen.queryByText('~4')).not.toBeInTheDocument();
    expect(screen.queryByText('~1')).not.toBeInTheDocument();
  });
});
