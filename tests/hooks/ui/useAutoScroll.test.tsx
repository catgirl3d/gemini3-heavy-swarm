import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useAutoScroll } from '@/hooks/ui/useAutoScroll';

type AutoScrollDeps = Parameters<typeof useAutoScroll>[0];
type AutoScrollResult = ReturnType<typeof useAutoScroll>;

const createDeps = (overrides: Partial<AutoScrollDeps> = {}): AutoScrollDeps => ({
  messagesLength: 0,
  shouldAutoScrollOnSessionChange: false,
  globalErrorMessage: null,
  ...overrides,
});

const setScrollMetrics = (
  element: HTMLDivElement,
  metrics: { scrollHeight?: number; clientHeight?: number; scrollTop?: number }
) => {
  if (metrics.scrollHeight !== undefined) {
    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      value: metrics.scrollHeight,
    });
  }

  if (metrics.clientHeight !== undefined) {
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: metrics.clientHeight,
    });
  }

  if (metrics.scrollTop !== undefined) {
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      value: metrics.scrollTop,
      writable: true,
    });
  }
};

const TestAutoScroll = ({
  deps,
  onRender,
}: {
  deps: AutoScrollDeps;
  onRender: (result: AutoScrollResult) => void;
}) => {
  const autoScroll = useAutoScroll(deps);
  onRender(autoScroll);

  return <div data-testid="message-list" ref={autoScroll.messageListRef} />;
};

const renderAutoScroll = (deps = createDeps()) => {
  let currentResult: AutoScrollResult | undefined;
  const onRender = (result: AutoScrollResult) => {
    currentResult = result;
  };

  const view = render(<TestAutoScroll deps={deps} onRender={onRender} />);

  return {
    element: view.getByTestId('message-list') as HTMLDivElement,
    get result() {
      return currentResult as AutoScrollResult;
    },
    rerenderWith(nextDeps: AutoScrollDeps) {
      view.rerender(<TestAutoScroll deps={nextDeps} onRender={onRender} />);
    },
    unmount: view.unmount,
  };
};

describe('useAutoScroll', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when no message list ref is attached', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAutoScroll(deps),
      { initialProps: { deps: createDeps() } }
    );

    expect(result.current.messageListRef.current).toBeNull();
    expect(result.current.shouldAutoScroll).toBe(true);
    expect(result.current.showScrollButton).toBe(false);

    expect(() => {
      act(() => {
        result.current.scrollToBottom();
      });
      rerender({ deps: createDeps({ messagesLength: 1, shouldAutoScrollOnSessionChange: true, globalErrorMessage: 'boom' }) });
    }).not.toThrow();
  });

  it('attaches and removes the scroll listener', () => {
    const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'removeEventListener');

    const { unmount } = renderAutoScroll();

    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('keeps auto-scroll enabled near the bottom', () => {
    const view = renderAutoScroll();
    setScrollMetrics(view.element, { scrollHeight: 1000, clientHeight: 500, scrollTop: 450 });

    act(() => {
      view.element.dispatchEvent(new Event('scroll'));
    });

    expect(view.result.shouldAutoScroll).toBe(true);
    expect(view.result.showScrollButton).toBe(false);
  });

  it('disables auto-scroll and shows the button away from the bottom', () => {
    const view = renderAutoScroll();
    setScrollMetrics(view.element, { scrollHeight: 1000, clientHeight: 500, scrollTop: 100 });

    act(() => {
      view.element.dispatchEvent(new Event('scroll'));
    });

    expect(view.result.shouldAutoScroll).toBe(false);
    expect(view.result.showScrollButton).toBe(true);
  });

  it('does not show the scroll button when content is not scrollable', () => {
    const view = renderAutoScroll();
    setScrollMetrics(view.element, { scrollHeight: 400, clientHeight: 500, scrollTop: 0 });

    act(() => {
      view.element.dispatchEvent(new Event('scroll'));
    });

    expect(view.result.shouldAutoScroll).toBe(true);
    expect(view.result.showScrollButton).toBe(false);
  });

  it('auto-scrolls on dependency changes while enabled', () => {
    const view = renderAutoScroll(createDeps({ messagesLength: 1 }));
    setScrollMetrics(view.element, { scrollHeight: 1200, clientHeight: 500, scrollTop: 0 });

    act(() => {
      view.rerenderWith(createDeps({ messagesLength: 2 }));
    });

    expect(view.element.scrollTop).toBe(1200);
  });

  it('does not auto-scroll on dependency changes after the user scrolls away', () => {
    const view = renderAutoScroll(createDeps({ messagesLength: 1 }));
    setScrollMetrics(view.element, { scrollHeight: 1000, clientHeight: 500, scrollTop: 100 });

    act(() => {
      view.element.dispatchEvent(new Event('scroll'));
    });

    setScrollMetrics(view.element, { scrollHeight: 1500 });

    act(() => {
      view.rerenderWith(createDeps({ messagesLength: 2, shouldAutoScrollOnSessionChange: true, globalErrorMessage: 'boom' }));
    });

    expect(view.element.scrollTop).toBe(100);
  });

  it('scrolls to new height when observed streaming content mutates', async () => {
    const view = renderAutoScroll();
    setScrollMetrics(view.element, { scrollHeight: 1100, clientHeight: 500, scrollTop: 0 });

    await act(async () => {
      view.element.appendChild(document.createElement('span'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.element.scrollTop).toBe(1100);
    });
  });

  it('does not observe streaming mutations while auto-scroll is disabled', async () => {
    const view = renderAutoScroll();
    setScrollMetrics(view.element, { scrollHeight: 1000, clientHeight: 500, scrollTop: 100 });

    act(() => {
      view.element.dispatchEvent(new Event('scroll'));
    });

    setScrollMetrics(view.element, { scrollHeight: 1500 });

    await act(async () => {
      view.element.appendChild(document.createElement('span'));
      await Promise.resolve();
    });

    expect(view.element.scrollTop).toBe(100);
  });

  it('scrollToBottom performs a smooth scroll to the full height', () => {
    const view = renderAutoScroll();
    const scrollTo = vi.fn();
    view.element.scrollTo = scrollTo;
    setScrollMetrics(view.element, { scrollHeight: 900 });

    act(() => {
      view.result.scrollToBottom();
    });

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 900, behavior: 'smooth' });
  });

  it('scrollToBottom re-enables auto-scroll and hides the button for subsequent streaming updates', async () => {
    const view = renderAutoScroll();
    const scrollTo = vi.fn();
    view.element.scrollTo = scrollTo;
    setScrollMetrics(view.element, { scrollHeight: 1000, clientHeight: 500, scrollTop: 100 });

    act(() => {
      view.element.dispatchEvent(new Event('scroll'));
    });

    expect(view.result.shouldAutoScroll).toBe(false);
    expect(view.result.showScrollButton).toBe(true);

    act(() => {
      view.result.scrollToBottom();
    });

    expect(view.result.shouldAutoScroll).toBe(true);
    expect(view.result.showScrollButton).toBe(false);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000, behavior: 'smooth' });

    setScrollMetrics(view.element, { scrollHeight: 1300 });

    await act(async () => {
      view.element.appendChild(document.createElement('span'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.element.scrollTop).toBe(1300);
    });
  });
});
