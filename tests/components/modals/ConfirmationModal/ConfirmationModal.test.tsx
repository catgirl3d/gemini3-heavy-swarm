import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/modals/BaseModal', () => {
  const BaseModal = ({
    isOpen,
    onClose,
    size,
    overlayClassName,
    children,
  }: {
    isOpen: boolean;
    onClose: () => void;
    size?: string;
    overlayClassName?: string;
    children: React.ReactNode;
  }) => {
    if (!isOpen) {
      return null;
    }

    return (
      <div data-testid="base-modal" data-size={size} data-overlay-class={overlayClassName}>
        <button type="button" onClick={onClose}>Overlay close</button>
        {children}
      </div>
    );
  };

  BaseModal.Header = ({ title, onClose }: { title: React.ReactNode; onClose?: () => void }) => (
    <div>
      <h1>{title}</h1>
      <button type="button" onClick={onClose}>Header close</button>
    </div>
  );
  BaseModal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  BaseModal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return { BaseModal };
});

import { ConfirmationModal } from '@/components/modals/ConfirmationModal/ConfirmationModal';

describe('ConfirmationModal', () => {
  it('renders nothing while closed', () => {
    render(
      <ConfirmationModal
        isOpen={false}
        title="Unsaved changes"
        message="Leave without saving?"
        confirmLabel="Save"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument();
  });

  it('renders the default save flow and routes all close actions to onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        isOpen
        title="Unsaved changes"
        message="Leave without saving?"
        confirmLabel="Save changes"
        cancelLabel="Stay here"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('base-modal')).toHaveAttribute('data-size', 'sm');
    expect(screen.getByTestId('base-modal')).toHaveAttribute('data-overlay-class', 'top');
    expect(screen.getByRole('heading', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass('modal-btn', 'save');
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
    fireEvent.click(screen.getByRole('button', { name: 'Header close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Overlay close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders the discard action and danger confirm variant when provided', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();

    render(
      <ConfirmationModal
        isOpen
        title="Delete profile"
        message={<span>Delete the selected profile permanently?</span>}
        confirmLabel="Delete"
        cancelLabel="Keep profile"
        discardLabel="Discard changes"
        confirmVariant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
        onDiscard={onDiscard}
      />
    );

    expect(screen.getByText('Delete the selected profile permanently?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('modal-btn', 'danger');

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
