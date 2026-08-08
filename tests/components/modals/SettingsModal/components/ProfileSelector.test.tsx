import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type CustomSelectProps = {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

vi.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({ options, value, onChange, isOpen, onOpenChange }: CustomSelectProps) => {
    const activeOption = options.find(option => option.value === value);

    return (
      <div data-testid="custom-select" data-open={String(!!isOpen)}>
        <span>{activeOption?.label ?? 'Missing profile'}</span>
        <button type="button" onClick={() => onOpenChange?.(!isOpen)}>Toggle Selector</button>
        <button type="button" onClick={() => onChange('profile-2')}>Choose Profile</button>
      </div>
    );
  },
}));

import { ProfileSelector } from '@/components/modals/SettingsModal/components/ProfileSelector';

describe('ProfileSelector', () => {
  it('forwards profiles, selection, and controlled open state into CustomSelect', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ProfileSelector
        profiles={[
          { id: 'profile-1', name: 'General Purpose' },
          { id: 'profile-2', name: 'Research' },
        ]}
        activeId="profile-1"
        onChange={onChange}
        isOpen
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.getByTestId('custom-select')).toHaveAttribute('data-open', 'true');
    expect(screen.getByText('General Purpose')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Profile' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith('profile-2');
  });
});
