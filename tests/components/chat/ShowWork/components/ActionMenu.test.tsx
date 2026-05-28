import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '@/components/chat/ShowWork/components/ActionMenu';

describe('ActionMenu', () => {
  it('opens the menu, executes enabled actions, and closes afterwards', () => {
    const onInspect = vi.fn();

    render(
      <ActionMenu
        actions={[
          {
            label: 'Inspect output',
            icon: <span>inspect</span>,
            onClick: onInspect,
            danger: true,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    const action = screen.getByText('Inspect output').closest('button');
    expect(action).toHaveClass('action-menu-item', 'danger');

    fireEvent.mouseDown(screen.getByText('Inspect output'));
    expect(screen.getByText('Inspect output').closest('button')).toBeInTheDocument();

    fireEvent.click(action as HTMLButtonElement);

    expect(onInspect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Inspect output' })).not.toBeInTheDocument();
  });

  it('keeps disabled actions inert and closes on outside mousedown', () => {
    const onDisabled = vi.fn();

    render(
      <div>
        <button type="button">Outside</button>
        <ActionMenu
          actions={[
            {
              label: 'Disabled action',
              icon: <span>disabled</span>,
              onClick: onDisabled,
              disabled: true,
            },
          ]}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    const disabledAction = screen.getByText('Disabled action').closest('button');
    expect(disabledAction).toBeDisabled();

    (disabledAction as HTMLButtonElement).disabled = false;
    fireEvent.click(disabledAction as HTMLButtonElement);

    expect(onDisabled).not.toHaveBeenCalled();
    expect(screen.getByText('Disabled action').closest('button')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByRole('button', { name: 'Disabled action' })).not.toBeInTheDocument();
  });

  it('guards against actions that become disabled before the click handler runs', () => {
    const onInspect = vi.fn();
    const action = {
      label: 'Late disabled action',
      icon: <span>late</span>,
      onClick: onInspect,
      disabled: false,
    };

    render(<ActionMenu actions={[action]} />);

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    action.disabled = true;

    fireEvent.click(screen.getByText('Late disabled action').closest('button') as HTMLButtonElement);

    expect(onInspect).not.toHaveBeenCalled();
    expect(screen.getByText('Late disabled action').closest('button')).toBeInTheDocument();
  });
});
