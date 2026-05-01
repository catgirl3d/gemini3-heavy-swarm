import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseModal } from './BaseModal';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BaseModal', () => {
  it('renders nothing when it starts closed', () => {
    render(
      <BaseModal isOpen={false} onClose={vi.fn()}>
        <div>Hidden Content</div>
      </BaseModal>
    );

    expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders into a portal, keeps inner clicks open, and closes from the overlay', () => {
    const onClose = vi.fn();

    render(
      <BaseModal
        isOpen
        onClose={onClose}
        size="lg"
        className="custom-modal"
        overlayClassName="custom-overlay"
      >
        <div>Modal Body</div>
      </BaseModal>
    );

    const overlay = document.querySelector('.modal-overlay');
    const dialog = screen.getByRole('dialog');

    expect(overlay).toHaveClass('modal-overlay', 'custom-overlay');
    expect(dialog).toHaveClass('modal-container', 'modal-lg', 'custom-modal');
    expect(screen.getByText('Modal Body')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByText('Modal Body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('respects closeOnOverlayClick=false', () => {
    const onClose = vi.fn();

    render(
      <BaseModal isOpen onClose={onClose} closeOnOverlayClick={false}>
        <div>Sticky Modal</div>
      </BaseModal>
    );

    fireEvent.click(document.querySelector('.modal-overlay') as Element);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the explicit escape handler and falls back to onClose when none is provided', () => {
    const onClose = vi.fn();
    const onEscape = vi.fn();
    const { rerender } = render(
      <BaseModal isOpen onClose={onClose} onEscape={onEscape}>
        <div>Escape Modal</div>
      </BaseModal>
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <BaseModal isOpen onClose={onClose}>
        <div>Escape Modal</div>
      </BaseModal>
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal mounted with closing classes until the exit timer completes', () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <BaseModal isOpen onClose={vi.fn()}>
        <div>Animated Modal</div>
      </BaseModal>
    );

    rerender(
      <BaseModal isOpen={false} onClose={vi.fn()}>
        <div>Animated Modal</div>
      </BaseModal>
    );

    const overlay = document.querySelector('.modal-overlay');
    const dialog = screen.getByRole('dialog');

    expect(overlay).toHaveClass('closing');
    expect(dialog).toHaveClass('closing');
    expect(screen.getByText('Animated Modal')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.queryByText('Animated Modal')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders header, body, footer, divider, and close-button variants', () => {
    const onHeaderClose = vi.fn();

    render(
      <BaseModal isOpen onClose={vi.fn()}>
        <BaseModal.Header title="Settings" onClose={onHeaderClose}>
          <button type="button">Extra Action</button>
        </BaseModal.Header>
        <BaseModal.Header title={<span>Custom Title</span>} />
        <BaseModal.Body className="body-extra">Body Content</BaseModal.Body>
        <BaseModal.Divider />
        <BaseModal.Footer className="footer-extra">Footer Content</BaseModal.Footer>
      </BaseModal>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Extra Action')).toBeInTheDocument();
    expect(screen.getByText('Body Content')).toHaveClass('modal-body', 'body-extra');
    expect(screen.getByText('Footer Content')).toHaveClass('modal-footer', 'footer-extra');
    expect(document.querySelector('.modal-divider')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onHeaderClose).toHaveBeenCalledTimes(1);
  });

  it('forwards clickOutsideSelectors and outside-click closing callbacks to the global handler', () => {
    const onCloseDropdowns = vi.fn();
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.appendChild(outside);

    render(
      <BaseModal
        isOpen
        onClose={vi.fn()}
        clickOutsideSelectors={['.dropdown']}
        onCloseDropdowns={onCloseDropdowns}
      >
        <div>Dropdown Modal</div>
      </BaseModal>
    );

    fireEvent.click(outside);

    expect(onCloseDropdowns).toHaveBeenCalledTimes(1);
  });
});
