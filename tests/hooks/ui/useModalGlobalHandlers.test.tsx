import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useModalGlobalHandlers } from '@/hooks/ui/useModalGlobalHandlers';

type ModalHandlerProps = Parameters<typeof useModalGlobalHandlers>[0];

const createProps = (overrides: Partial<ModalHandlerProps> = {}): ModalHandlerProps => ({
  isOpen: true,
  onEscape: vi.fn(),
  clickOutsideSelectors: ['.dropdown'],
  onCloseDropdowns: vi.fn(),
  ...overrides,
});

const renderModalHandlers = (overrides: Partial<ModalHandlerProps> = {}) => (
  renderHook((props: ModalHandlerProps) => useModalGlobalHandlers(props), {
    initialProps: createProps(overrides),
  })
);

const dispatchEscape = () => {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

  window.dispatchEvent(event);

  return { event, stopPropagationSpy };
};

const click = (target: EventTarget) => {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('useModalGlobalHandlers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  it('does nothing when the modal is closed', () => {
    const onEscape = vi.fn();
    const onCloseDropdowns = vi.fn();
    renderModalHandlers({ isOpen: false, onEscape, onCloseDropdowns });

    dispatchEscape();
    click(window);

    expect(document.body.style.overflow).toBe('');
    expect(onEscape).not.toHaveBeenCalled();
    expect(onCloseDropdowns).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores the original overflow on unmount', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = renderModalHandlers();

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores body overflow when closed via rerender while staying mounted', () => {
    document.body.style.overflow = 'auto';

    const { rerender } = renderHook((props: ModalHandlerProps) => useModalGlobalHandlers(props), {
      initialProps: createProps({ isOpen: true }),
    });

    expect(document.body.style.overflow).toBe('hidden');

    rerender(createProps({ isOpen: false }));

    expect(document.body.style.overflow).toBe('auto');
  });

  it('keeps body scroll locked until all nested modals are closed', () => {
    document.body.style.overflow = 'scroll';
    const first = renderModalHandlers();
    const second = renderModalHandlers();

    expect(document.body.style.overflow).toBe('hidden');

    second.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    first.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('calls only the top-most Escape handler and prevents the event', () => {
    const firstEscape = vi.fn();
    const secondEscape = vi.fn();
    renderModalHandlers({ onEscape: firstEscape });
    renderModalHandlers({ onEscape: secondEscape });

    const { event, stopPropagationSpy } = dispatchEscape();

    expect(secondEscape).toHaveBeenCalledTimes(1);
    expect(firstEscape).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the previous Escape handler after the top modal unmounts', () => {
    const firstEscape = vi.fn();
    const secondEscape = vi.fn();
    renderModalHandlers({ onEscape: firstEscape });
    const second = renderModalHandlers({ onEscape: secondEscape });

    second.unmount();
    dispatchEscape();

    expect(firstEscape).toHaveBeenCalledTimes(1);
    expect(secondEscape).not.toHaveBeenCalled();
  });

  it('removes the Escape handler when closed via rerender', () => {
    const onEscape = vi.fn();
    const { rerender } = renderHook((props: ModalHandlerProps) => useModalGlobalHandlers(props), {
      initialProps: createProps({ isOpen: true, onEscape }),
    });

    rerender(createProps({ isOpen: false, onEscape }));
    dispatchEscape();

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys', () => {
    const onEscape = vi.fn();
    renderModalHandlers({ onEscape });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('uses the latest onEscape callback after rerendering', () => {
    const initialEscape = vi.fn();
    const latestEscape = vi.fn();
    const { rerender } = renderHook((props: ModalHandlerProps) => useModalGlobalHandlers(props), {
      initialProps: createProps({ onEscape: initialEscape }),
    });

    rerender(createProps({ onEscape: latestEscape }));
    dispatchEscape();

    expect(latestEscape).toHaveBeenCalledTimes(1);
    expect(initialEscape).not.toHaveBeenCalled();
  });

  it('closes dropdowns when clicking outside all configured selectors', () => {
    const onCloseDropdowns = vi.fn();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    renderModalHandlers({ clickOutsideSelectors: ['.dropdown'], onCloseDropdowns });

    click(outside);

    expect(onCloseDropdowns).toHaveBeenCalledTimes(1);
  });

  it('does not close dropdowns when clicking inside any configured selector', () => {
    const onCloseDropdowns = vi.fn();
    const dropdown = document.createElement('div');
    const child = document.createElement('button');
    dropdown.className = 'dropdown';
    dropdown.appendChild(child);
    document.body.appendChild(dropdown);
    renderModalHandlers({ clickOutsideSelectors: ['.dropdown', '.picker'], onCloseDropdowns });

    click(child);

    expect(onCloseDropdowns).not.toHaveBeenCalled();
  });

  it('does not close dropdowns when selector list is empty or event target is not an Element', () => {
    const onCloseDropdowns = vi.fn();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    renderModalHandlers({ clickOutsideSelectors: [], onCloseDropdowns });

    click(outside);
    click(window);

    expect(onCloseDropdowns).not.toHaveBeenCalled();
  });

  it('removes click listeners on cleanup', () => {
    const onCloseDropdowns = vi.fn();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { unmount } = renderModalHandlers({ onCloseDropdowns });

    unmount();
    click(outside);

    expect(onCloseDropdowns).not.toHaveBeenCalled();
  });

  it('keeps body lock until the final nested modal closes via rerender', () => {
    document.body.style.overflow = 'clip';
    const first = renderHook((props: ModalHandlerProps) => useModalGlobalHandlers(props), {
      initialProps: createProps({ isOpen: true }),
    });
    const second = renderHook((props: ModalHandlerProps) => useModalGlobalHandlers(props), {
      initialProps: createProps({ isOpen: true }),
    });

    second.rerender(createProps({ isOpen: false }));
    expect(document.body.style.overflow).toBe('hidden');

    first.rerender(createProps({ isOpen: false }));
    expect(document.body.style.overflow).toBe('clip');
  });
});
