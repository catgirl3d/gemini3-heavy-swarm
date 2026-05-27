import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoModal } from './InfoModal';

describe('InfoModal', () => {
  it('renders nothing while closed', () => {
    render(<InfoModal isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('How it Works')).not.toBeInTheDocument();
  });

  it('renders the workflow summary and forwards the component-owned close actions', () => {
    const onClose = vi.fn();

    render(<InfoModal isOpen onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it Works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Initial Drafts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. Refinement & Critique' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. Synthesis' })).toBeInTheDocument();
    expect(screen.getByText(/independently analyze your request/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
