import React, { FC, ChangeEvent } from 'react';
import { AppSettings, RoleProfile } from '@/types';
import { ProfileHeader } from '@/components/modals/SettingsModal/components/ProfileHeader';
import { RoleItem } from '@/components/modals/SettingsModal/components/RoleItem';
import { InfoIcon } from '@/components/modals/SettingsModal/icons';

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
    handleRestoreDefaultRoles: () => void;
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
    handleRestoreDefaultRoles,
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

            <div className="modal-card-container">
                <div className="modal-card-header">
                    <span className="modal-card-title">Roles</span>
                    <div className="modal-card-header-content">
                        <div className="modal-type-toggle">
                            <button
                                className={`modal-type-toggle-btn ${activeRoleType === 'drafter' ? 'active' : ''}`}
                                onClick={() => setActiveRoleType('drafter')}
                            >
                                Drafters
                            </button>
                            <button
                                className={`modal-type-toggle-btn ${activeRoleType === 'critic' ? 'active' : ''}`}
                                onClick={() => setActiveRoleType('critic')}
                            >
                                Critics
                            </button>
                        </div>
                    </div>
                </div>

                <div className="modal-card-content">
                    <div className="modal-banner info">
                        <InfoIcon />
                        <span>
                            Roles are applied during the <strong>{activeRoleType === 'drafter' ? 'Initial Draft' : 'Refinement (Critique)'}</strong> phase.
                        </span>
                    </div>
                    <div className="modal-section-list">
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
                            <div className="modal-no-items-message">
                                No roles defined. Add a role to get started.
                            </div>
                        )}
                    </div>
                    <div className="modal-card-footer-actions">
                        <button className="modal-btn outline" onClick={handleRestoreDefaultRoles}>
                            Restore Defaults
                        </button>
                        <button className="modal-btn outline" onClick={handleAddRole}>+ Add Role</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
