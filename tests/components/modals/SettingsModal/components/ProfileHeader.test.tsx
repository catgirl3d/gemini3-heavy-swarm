import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type Profile = { id: string; name: string };
type ProfileSelectorProps = {
  profiles: Profile[];
  activeId: string;
  onChange: (id: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

vi.mock('@/components/modals/SettingsModal/components/ProfileSelector', () => ({
  ProfileSelector: ({ profiles, activeId, onChange, isOpen, onOpenChange }: ProfileSelectorProps) => {
    const activeProfile = profiles.find(profile => profile.id === activeId);

    return (
      <div data-testid="profile-selector" data-open={String(!!isOpen)}>
        <button type="button" onClick={() => onChange('profile-2')}>
          {activeProfile?.name ?? 'Missing profile'}
        </button>
        <button type="button" onClick={() => onOpenChange?.(!isOpen)}>
          Toggle Selector
        </button>
      </div>
    );
  },
}));

import { ProfileHeader } from '@/components/modals/SettingsModal/components/ProfileHeader';

const baseProps = {
  label: 'Active Profile',
  profiles: [
    { id: 'profile-1', name: 'Default Profile' },
    { id: 'profile-2', name: 'Research Profile' },
  ],
  activeId: 'profile-1',
  isEditing: false,
  activeName: 'Default Profile',
  onProfileChange: vi.fn(),
  onRename: vi.fn(),
  onStartEditing: vi.fn(),
  onStopEditing: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
  canDelete: true,
};

describe('ProfileHeader', () => {
  it('forwards selector changes via a synthetic event and wires action buttons', () => {
    const onProfileChange = vi.fn();
    const onStartEditing = vi.fn();
    const onCreate = vi.fn();
    const onDelete = vi.fn();
    const onSelectorOpenChange = vi.fn();

    render(
      <ProfileHeader
        {...baseProps}
        onProfileChange={onProfileChange}
        onStartEditing={onStartEditing}
        onCreate={onCreate}
        onDelete={onDelete}
        isSelectorOpen
        onSelectorOpenChange={onSelectorOpenChange}
      />
    );

    expect(screen.getByText('Active Profile')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Default Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Selector' }));
    fireEvent.click(screen.getByTitle('Rename'));
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: 'profile-2' }),
        currentTarget: expect.objectContaining({ value: 'profile-2' }),
      })
    );
    expect(onStartEditing).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelectorOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('profile-selector')).toHaveAttribute('data-open', 'true');
  });

  it('supports inline renaming and hides delete when deletion is disabled', () => {
    const onRename = vi.fn();
    const onStopEditing = vi.fn();
    const { rerender } = render(
      <ProfileHeader
        {...baseProps}
        isEditing
        canDelete={false}
        onRename={onRename}
        onStopEditing={onStopEditing}
      />
    );

    const input = screen.getByDisplayValue('Default Profile');

    fireEvent.change(input, { target: { value: 'Renamed Profile' } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledWith('Renamed Profile');
    expect(onStopEditing).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    rerender(
      <ProfileHeader
        {...baseProps}
        isEditing
        canDelete={false}
        onRename={onRename}
        onStopEditing={onStopEditing}
      />
    );

    fireEvent.keyDown(screen.getByDisplayValue('Default Profile'), { key: 'Enter' });

    expect(onStopEditing).toHaveBeenCalledTimes(2);
  });
});
