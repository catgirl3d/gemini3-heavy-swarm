import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StepperControl } from '@/components/modals/SettingsModal/components/StepperControl';

describe('StepperControl', () => {
  it('disables boundary buttons and ignores clicks outside the available range', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <StepperControl
        value={1}
        min={1}
        max={3}
        onValueChange={onValueChange}
      />
    );

    let buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(buttons[0]);
    expect(onValueChange).not.toHaveBeenCalled();

    rerender(
      <StepperControl
        value={3}
        min={1}
        max={3}
        onValueChange={onValueChange}
      />
    );

    buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(buttons[1]);
    expect(onValueChange).not.toHaveBeenCalled();

    rerender(
      <StepperControl
        value={2}
        min={2}
        max={2}
        onValueChange={onValueChange}
      />
    );

    buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('forwards adjacent decrements and increments from enabled controls', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <StepperControl
        value={2}
        min={1}
        max={3}
        onValueChange={onValueChange}
      />
    );

    let buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onValueChange).toHaveBeenNthCalledWith(1, 1);
    expect(onValueChange).toHaveBeenNthCalledWith(2, 3);

    rerender(
      <StepperControl
        value={1}
        min={1}
        max={3}
        onValueChange={onValueChange}
      />
    );

    buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);

    expect(onValueChange).toHaveBeenNthCalledWith(3, 2);
  });
});
