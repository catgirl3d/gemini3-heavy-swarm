import React, { FC, ChangeEvent } from 'react';
import { AppSettings, RoleProfile } from '../../../types';
import { ProfileHeader } from '../components/ProfileHeader';
import { RoleItem } from '../components/RoleItem';
import { InfoIcon, WarningIcon } from '../icons';

interface RolesTabProps {
    localSettings: AppSettings;
    activeRoleProfile: RoleProfile;
    isEditingRoleName: boolean;
    setIsEditingRoleName: (val: boolean) => void;
    activeRoleType: 'drafter' | 'critic';
    setActiveRoleType: (type: 'drafter' | 'critic') => void;
    handleRenameRoleProfile: (name: string) => void;
    handleRoleProfileChange: (e: ChangeEvent<HTMLSelectElement>) => void;
    handleCreateRoleProfile: () => void;
    handleDeleteRoleProfile: () => void;
    handleAddRole: () => void;
    handleDeleteRole: (index: number) => void;
    handleMoveRole: (index: number, direction: 'up' | 'down') => void;
    setEditingRoleIndex: (index: number | null) => void;
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const RolesTab: FC<RolesTabProps> = ({
    localSettings,
    activeRoleProfile,
    isEditingRoleName,
    setIsEditingRoleName,
    activeRoleType,
    setActiveRoleType,
    handleRenameRoleProfile,
    handleRoleProfileChange,
    handleCreateRoleProfile,
    handleDeleteRoleProfile,
    handleAddRole,
    handleDeleteRole,
    handleMoveRole,
    setEditingRoleIndex,
    setLocalSettings
}) => {
    const roles = (activeRoleType === 'drafter' ? activeRoleProfile.roles : activeRoleProfile.criticRoles) || [];

    return (
        <div className="settings-section fade-in">
            <ProfileHeader
                label="Active Role Set"
                profiles={localSettings.roleProfiles || []}
                activeId={localSettings.activeRoleProfileId}
                isEditing={isEditingRoleName}
                activeName={activeRoleProfile.name}
                onProfileChange={handleRoleProfileChange}
                onRename={handleRenameRoleProfile}
                onStartEditing={() => setIsEditingRoleName(true)}
                onStopEditing={() => setIsEditingRoleName(false)}
                onCreate={handleCreateRoleProfile}
                onDelete={handleDeleteRoleProfile}
                canDelete={(localSettings.roleProfiles || []).length > 1}
            />

            <div className="roles-section-wrapper">
                <div className="roles-toolbar">
                    <div className="roles-toolbar-content">
                        <div className="role-type-toggle">
                            <button
                                className={`role-type-btn ${activeRoleType === 'drafter' ? 'active' : ''}`}
                                onClick={() => setActiveRoleType('drafter')}
                            >
                                Drafters
                            </button>
                            <button
                                className={`role-type-btn ${activeRoleType === 'critic' ? 'active' : ''}`}
                                onClick={() => setActiveRoleType('critic')}
                            >
                                Critics
                            </button>
                        </div>
                    </div>
                    <button className="add-role-btn-small" onClick={handleAddRole}>+ Add Role</button>
                </div>

                {!localSettings.dynamicAgentRoles && (
                    <div className="modal-banner warning">
                        <WarningIcon />
                        <span>
                            <strong>Dynamic Agent Roles</strong> are currently disabled. These roles will not be used until you enable them in the <strong>General</strong> tab.
                        </span>
                        <button
                            onClick={() => setLocalSettings(prev => ({ ...prev, dynamicAgentRoles: true }))}
                            className="warning-banner-btn"
                        >
                            Enable
                        </button>
                    </div>
                )}

                <div className="roles-list-container">
                    <div className="modal-banner info">
                        <InfoIcon />
                        <span>
                            Roles are applied during the <strong>{activeRoleType === 'drafter' ? 'Initial Draft' : 'Refinement (Critique)'}</strong> phase.
                        </span>
                    </div>
                    <div className="roles-list">
                        {roles.map((role, index) => (
                            <RoleItem
                                key={index}
                                index={index}
                                role={role}
                                isFirst={index === 0}
                                isLast={index === roles.length - 1}
                                canDelete={roles.length > 1}
                                onEdit={() => setEditingRoleIndex(index)}
                                onDelete={() => handleDeleteRole(index)}
                                onMoveUp={() => handleMoveRole(index, 'up')}
                                onMoveDown={() => handleMoveRole(index, 'down')}
                            />
                        ))}
                        {roles.length === 0 && (
                            <div className="no-roles-message">
                                No roles defined. Add a role to get started.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
