import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderType, RoleProfile } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';

const mocks = vi.hoisted(() => ({
  profileHeader: vi.fn(),
  roleItem: vi.fn(),
}));

vi.mock('@/components/modals/SettingsModal/components/ProfileHeader', () => ({
  ProfileHeader: (props: any) => {
    mocks.profileHeader(props);

    return (
      <div
        data-testid="profile-header"
        data-active-id={props.activeId}
        data-can-delete={String(props.canDelete)}
      >
        <span>{props.label}</span>
        <span>{props.activeName}</span>
        <button type="button" onClick={() => props.onProfileChange({ target: { value: 'secondary-profile' }, currentTarget: { value: 'secondary-profile' } })}>
          Change Profile
        </button>
        <button type="button" onClick={() => props.onRename('Renamed Profile')}>
          Rename Profile
        </button>
        <button type="button" onClick={props.onStartEditing}>Start Editing</button>
        <button type="button" onClick={props.onStopEditing}>Stop Editing</button>
        <button type="button" onClick={props.onCreate}>Create Profile</button>
        <button type="button" onClick={props.onDelete}>Delete Profile</button>
      </div>
    );
  },
}));

vi.mock('@/components/modals/SettingsModal/components/RoleItem', () => ({
  RoleItem: (props: any) => {
    mocks.roleItem(props);

    return (
      <div
        data-testid="role-item"
        data-index={props.index}
        data-first={String(props.isFirst)}
        data-last={String(props.isLast)}
        data-can-delete={String(props.canDelete)}
        data-provider={props.provider}
      >
        <span>{props.role.name}</span>
        <button type="button" onClick={props.onEdit}>Edit Role {props.index}</button>
        <button type="button" onClick={props.onDelete}>Delete Role {props.index}</button>
        <button type="button" onClick={props.onMoveUp}>Move Role Up {props.index}</button>
        <button type="button" onClick={props.onMoveDown}>Move Role Down {props.index}</button>
      </div>
    );
  },
}));

import { RolesTab, getRoleCyclingNotice } from './RolesTab';

const createRoleProfile = (overrides: Partial<RoleProfile> = {}): RoleProfile => ({
  id: 'primary-profile',
  name: 'Primary Roles',
  roles: [
    { id: 'role-1', name: 'Lead Drafter', instruction: 'Draft first' },
    { id: 'role-2', name: 'Proofreader', instruction: 'Polish draft' },
  ],
  criticRoles: [
    { id: 'critic-1', name: 'Reviewer', instruction: 'Review critically' },
  ],
  ...overrides,
});

const createProps = (overrides: Partial<ComponentProps<typeof RolesTab>> = {}) => {
  const activeRoleProfile = overrides.activeRoleProfile ?? createRoleProfile();
  const roleProfiles = overrides.localSettings?.roleProfiles ?? [activeRoleProfile, createRoleProfile({ id: 'secondary-profile', name: 'Secondary Roles' })];
  const localSettings = createMockSettings({
    provider: ProviderType.Gemini,
    numAgents: 4,
    activeRoleProfileId: activeRoleProfile.id,
    roleProfiles,
    ...overrides.localSettings,
  });

  return {
    localSettings,
    activeRoleProfile,
    isEditingRoleName: false,
    setIsEditingRoleName: vi.fn(),
    activeRoleType: 'drafter' as const,
    setActiveRoleType: vi.fn(),
    handleRenameRoleProfile: vi.fn(),
    handleRoleProfileChange: vi.fn(),
    handleCreateRoleProfile: vi.fn(),
    handleDeleteRoleProfile: vi.fn(),
    handleAddRole: vi.fn(),
    handleDeleteRole: vi.fn(),
    handleMoveRole: vi.fn(),
    handleRestoreDefaultRoles: vi.fn(),
    setEditingRoleIndex: vi.fn(),
    setLocalSettings: vi.fn(),
    ...overrides,
  };
};

const getRoleItemProps = (index: number) => mocks.roleItem.mock.calls[index]?.[0];

afterEach(() => {
  vi.clearAllMocks();
});

describe('getRoleCyclingNotice', () => {
  it('should return null when every drafter agent has a role', () => {
    expect(getRoleCyclingNotice(4, 4, 'drafter')).toBeNull();
  });

  it('should return null when no roles are configured', () => {
    expect(getRoleCyclingNotice(5, 0, 'critic')).toBeNull();
  });

  it('should describe drafter role cycling when agents exceed roles', () => {
    expect(getRoleCyclingNotice(5, 4, 'drafter')).toBe(
      'There are 5 drafter agents and 4 drafter roles. Roles will repeat: agent 5 uses role 1, agent 6 uses role 2, and so on.'
    );
  });

  it('should describe critic role cycling with singular role label', () => {
    expect(getRoleCyclingNotice(5, 1, 'critic')).toBe(
      'There are 5 critic agents and 1 critic role. Roles will repeat: every agent uses role 1.'
    );
  });

  it('should describe critic role cycling with examples for repeated agents', () => {
    expect(getRoleCyclingNotice(5, 2, 'critic')).toBe(
      'There are 5 critic agents and 2 critic roles. Roles will repeat: agent 3 uses role 1, agent 4 uses role 2, and so on.'
    );
  });
});

describe('RolesTab', () => {
  it('renders drafter roles, banners, and ordered role item props', () => {
    render(<RolesTab {...createProps()} />);

    expect(screen.getByText('Primary Roles')).toBeInTheDocument();
    expect(screen.getByText('Initial Draft')).toBeInTheDocument();
    expect(screen.getByText('There are 4 drafter agents and 2 drafter roles. Roles will repeat: agent 3 uses role 1, agent 4 uses role 2, and so on.')).toBeInTheDocument();
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-delete', 'true');
    expect(screen.getAllByTestId('role-item')).toHaveLength(2);
    expect(screen.getByText('Lead Drafter')).toBeInTheDocument();
    expect(screen.getByText('Proofreader')).toBeInTheDocument();

    expect(getRoleItemProps(0)).toMatchObject({
      index: 0,
      isFirst: true,
      isLast: false,
      canDelete: true,
      provider: ProviderType.Gemini,
    });
    expect(getRoleItemProps(1)).toMatchObject({
      index: 1,
      isFirst: false,
      isLast: true,
      canDelete: true,
      provider: ProviderType.Gemini,
    });
  });

  it('renders critic roles without warning and passes single-role delete state', () => {
    const props = createProps({
      activeRoleType: 'critic',
      localSettings: createMockSettings({
        provider: ProviderType.OpenRouter,
        numAgents: 1,
        activeRoleProfileId: 'primary-profile',
        roleProfiles: [createRoleProfile()],
      }),
    });

    render(<RolesTab {...props} />);

    expect(screen.getByText('Refinement (Critique)')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.queryByText(/Roles will repeat:/)).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-delete', 'false');
    expect(getRoleItemProps(0)).toMatchObject({
      index: 0,
      isFirst: true,
      isLast: true,
      canDelete: false,
      provider: ProviderType.OpenRouter,
    });

    fireEvent.click(screen.getByText('Drafters'));
    fireEvent.click(screen.getByText('Critics'));

    expect(props.setActiveRoleType).toHaveBeenNthCalledWith(1, 'drafter');
    expect(props.setActiveRoleType).toHaveBeenNthCalledWith(2, 'critic');
  });

  it('shows the empty-state message when the selected role list has no entries', () => {
    render(
      <RolesTab
        {...createProps({
          activeRoleType: 'critic',
          activeRoleProfile: createRoleProfile({ criticRoles: [] }),
          localSettings: createMockSettings({
            numAgents: 3,
            activeRoleProfileId: 'primary-profile',
            roleProfiles: [createRoleProfile({ criticRoles: [] })],
          }),
        })}
      />
    );

    expect(screen.getByText('No roles defined. Add a role to get started.')).toBeInTheDocument();
    expect(screen.queryAllByTestId('role-item')).toHaveLength(0);
  });

  it('wires profile and role action handlers', () => {
    const props = createProps();

    render(<RolesTab {...props} />);

    fireEvent.click(screen.getByText('Change Profile'));
    fireEvent.click(screen.getByText('Rename Profile'));
    fireEvent.click(screen.getByText('Start Editing'));
    fireEvent.click(screen.getByText('Stop Editing'));
    fireEvent.click(screen.getByText('Create Profile'));
    fireEvent.click(screen.getByText('Delete Profile'));
    fireEvent.click(screen.getByText('Edit Role 1'));
    fireEvent.click(screen.getByText('Delete Role 1'));
    fireEvent.click(screen.getByText('Move Role Up 1'));
    fireEvent.click(screen.getByText('Move Role Down 1'));
    fireEvent.click(screen.getByText('Restore Defaults'));
    fireEvent.click(screen.getByText('+ Add Role'));

    expect(props.handleRoleProfileChange).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({ value: 'secondary-profile' }),
    }));
    expect(props.handleRenameRoleProfile).toHaveBeenCalledWith('Renamed Profile');
    expect(props.setIsEditingRoleName).toHaveBeenNthCalledWith(1, true);
    expect(props.setIsEditingRoleName).toHaveBeenNthCalledWith(2, false);
    expect(props.handleCreateRoleProfile).toHaveBeenCalledTimes(1);
    expect(props.handleDeleteRoleProfile).toHaveBeenCalledTimes(1);
    expect(props.setEditingRoleIndex).toHaveBeenCalledWith(1);
    expect(props.handleDeleteRole).toHaveBeenCalledWith(1);
    expect(props.handleMoveRole).toHaveBeenNthCalledWith(1, 1, 'up');
    expect(props.handleMoveRole).toHaveBeenNthCalledWith(2, 1, 'down');
    expect(props.handleRestoreDefaultRoles).toHaveBeenCalledTimes(1);
    expect(props.handleAddRole).toHaveBeenCalledTimes(1);
  });
});
