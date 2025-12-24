import React, { FC } from 'react';
import { EditIcon } from '../icons';

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
    canDelete
}) => {
    return (
        <div className="profile-header-compact">
            <div className="profile-select-wrapper">
                <span className="modal-section-title">{label}</span>
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
                        <select
                            value={activeId}
                            onChange={onProfileChange}
                            className="modal-input font-semibold"
                        >
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
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
    );
};
