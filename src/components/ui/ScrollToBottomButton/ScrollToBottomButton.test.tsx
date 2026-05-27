import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScrollToBottomButton } from './ScrollToBottomButton';

describe('ScrollToBottomButton', () => {
  it('does not render while hidden', () => {
    render(<ScrollToBottomButton visible={false} onClick={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).not.toBeInTheDocument();
  });

  it('renders the button accessibly and forwards clicks when visible', () => {
    const onClick = vi.fn();

    render(<ScrollToBottomButton visible onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scroll to bottom' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
