import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@shared/utils/logger';
import { CodeBlock } from '@/components/ui/CodeBlock/CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses the language, trims the copied text, and resets the copied state', async () => {
    vi.useFakeTimers();

    render(
      <CodeBlock className="language-typescript">
        {`const value = 1;\n`}
      </CodeBlock>
    );

    expect(screen.getByText('typescript')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const value = 1;');

    expect(screen.getByText('Copied!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('falls back to text and logs copy failures', async () => {
    const error = new Error('clipboard blocked');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(error) },
      configurable: true,
    });
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    render(
      <CodeBlock>
        {undefined}
      </CodeBlock>
    );

    expect(screen.getByText('text')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loggerError).toHaveBeenCalledWith('Failed to copy text: ', error);

    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('logs when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    render(
      <CodeBlock>
        {'const value = 1;'}
      </CodeBlock>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loggerError).toHaveBeenCalledWith('Failed to copy text: ', expect.any(Error));
    expect((loggerError.mock.calls[0]?.[1] as Error).message).toBe('Clipboard API is not available');
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });
});
