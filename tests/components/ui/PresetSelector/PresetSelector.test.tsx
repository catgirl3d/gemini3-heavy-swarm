import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

type PortalDropdownProps = { isOpen?: boolean; children: ReactNode };

vi.mock('@/components/ui/PortalDropdown/PortalDropdown', () => ({
  PortalDropdown: ({ isOpen, children }: PortalDropdownProps) => (isOpen ? <div data-testid="portal-dropdown">{children}</div> : null),
}));

import { PresetSelector } from '@/components/ui/PresetSelector/PresetSelector';

const presets = [
  { id: 'preset-default', name: 'Default Preset', isCustom: false, instruction: 'Default instruction' },
  { id: 'preset-custom', name: 'Custom Preset', isCustom: true, instruction: 'Custom instruction' },
];

describe('PresetSelector', () => {
  it('disables the trigger when no presets are available', () => {
    render(<PresetSelector presets={[]} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /No Presets Available/i })).toBeDisabled();
  });

  it('selects presets and closes through the shared CustomSelect layer', () => {
    const onSelect = vi.fn();

    render(<PresetSelector presets={presets} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /Select a Preset/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Default Preset' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'preset-default' }));
    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();
  });

  it('renders delete actions only for custom presets and closes after deleting', () => {
    const onDeletePreset = vi.fn();

    render(<PresetSelector presets={presets} onSelect={vi.fn()} onDeletePreset={onDeletePreset} />);

    fireEvent.click(screen.getByRole('button', { name: /Select a Preset/i }));

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete preset Custom Preset' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Custom Preset' }));

    expect(onDeletePreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'preset-custom' }));
    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();
  });
});
