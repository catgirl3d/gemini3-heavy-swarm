import React, { FC } from 'react';
import { EditIcon } from '@/components/modals/SettingsModal/icons';
import { ProfileSelector } from './ProfileSelector';

interface ProfileHeaderProps {
    label: string;
    profiles: { id: string; name: string }[];
    activeId: string;
    isEditing: boolean;
    activeName: string;
    onProfileChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onRename: (newName: string) => void;
    onStartEditing: () => void;
    onStopEditing: () => void;
    onCreate: () => void;
    onDelete: () => void;
    canDelete: boolean;
    isSelectorOpen?: boolean;
    onSelectorOpenChange?: (open: boolean) => void;
}

export const ProfileHeader: FC<ProfileHeaderProps> = ({
    label,
    profiles,
    activeId,
    isEditing,
    activeName,
    onProfileChange,
    onRename,
    onStartEditing,
    onStopEditing,
    onCreate,
    onDelete,
    canDelete,
    isSelectorOpen,
    onSelectorOpenChange
}) => {
    const handleProfileSelect = (id: string) => {
        // Convert to synthetic event to match existing signature
        const syntheticEvent = {
            target: { value: id },
            currentTarget: { value: id }
        } as React.ChangeEvent<HTMLSelectElement>;
        onProfileChange(syntheticEvent);
    };

    return (
        <div className="modal-card-container profile-manager-wrapper">
            <div className="modal-card-header">
                <span className="modal-card-title">{label}</span>
            </div>
            <div className="modal-card-content">
                <div className="profile-manager-content">
                    <div className="profile-select-section">
                        {isEditing ? (
                            <div className="profile-name-edit">
                                <input
                                    type="text"
                                    value={activeName}
                                    onChange={(e) => onRename(e.target.value)}
                                    onBlur={onStopEditing}
                                    onKeyDown={(e) => e.key === 'Enter' && onStopEditing()}
                                    className="edit-name-input"
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <div className="profile-name-edit">
                                <ProfileSelector
                                    profiles={profiles}
                                    activeId={activeId}
                                    onChange={handleProfileSelect}
                                    isOpen={isSelectorOpen}
                                    onOpenChange={onSelectorOpenChange}
                                />
                                <button
                                    className="modal-icon-btn"
                                    onClick={onStartEditing}
                                    title="Rename"
                                >
                                    <EditIcon />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="profile-actions">
                        <button className="modal-btn outline" onClick={onCreate}>+ New</button>
                        {canDelete && (
                            <button className="modal-btn danger" onClick={onDelete}>Delete</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
