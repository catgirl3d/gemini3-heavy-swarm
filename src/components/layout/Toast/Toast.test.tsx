import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('shows after mount, uses the latest onClose callback, and auto-hides after the duration', () => {
    vi.useFakeTimers();
    const firstOnClose = vi.fn();
    const latestOnClose = vi.fn();
    const { container, rerender } = render(
      <Toast
        message="Queued toast"
        type="info"
        duration={100}
        onClose={firstOnClose}
      />
    );

    const overlay = container.querySelector('.toast-overlay');
    const toast = container.querySelector('.toast-message');

    expect(overlay).not.toHaveClass('active');
    expect(toast).not.toHaveClass('active');

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(overlay).toHaveClass('active');
    expect(toast).toHaveClass('active');
    expect(container.querySelector('.toast-progress')).toHaveStyle({ animationDuration: '100ms' });

    rerender(
      <Toast
        message="Queued toast"
        type="info"
        duration={100}
        onClose={latestOnClose}
      />
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(container.querySelector('.toast-message')).not.toHaveClass('active');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(firstOnClose).not.toHaveBeenCalled();
    expect(latestOnClose).toHaveBeenCalledTimes(1);
  });

  it('supports manual close from the toast body and the close button without double-calling onClose', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Toast
        message="Body close"
        type="warning"
        duration={4000}
        onClose={onClose}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });

    fireEvent.click(container.querySelector('.toast-message') as Element);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Toast
        message="Button close"
        type="success"
        duration={4000}
        onClose={onClose}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });

    fireEvent.click(screen.getByRole('button'));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it.each(['info', 'warning', 'error', 'success'] as const)('renders the %s variant', (type) => {
    const { container } = render(
      <Toast
        message={`${type} toast`}
        type={type}
        duration={4000}
        onClose={vi.fn()}
      />
    );

    expect(container.querySelector(`.toast-message.${type}`)).toBeInTheDocument();
    expect(container.querySelector('.toast-icon svg')).toBeInTheDocument();
  });
});
