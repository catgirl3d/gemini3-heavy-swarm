import React, { FC } from 'react';
import { ArrowUpIcon, ArrowDownIcon, ConfigIcon, TrashIcon } from '@/components/modals/SettingsModal/icons';

interface RoleItemProps {
    index: number;
    role: { name: string; instruction: string; model?: string };
    isFirst: boolean;
    isLast: boolean;
    canDelete: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

export const RoleItem: FC<RoleItemProps> = ({
    index,
    role,
    isFirst,
    isLast,
    canDelete,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown
}) => {
    return (
        <div className="role-item compact">
            <div className="role-compact-row">
                <div className="role-ordinal">#{index + 1}</div>

                <div className="role-main-content">
                    <div className="role-info-group">
                        <div className="role-name-display">
                            {role.name || 'Unnamed Role'}
                        </div>
                        {role.model && (
                            <div className="role-model-tag">
                                {role.model}
                            </div>
                        )}
                    </div>
                </div>

                <div className="role-actions-compact">
                    <div className="role-move-buttons horizontal">
                        <button
                            className="move-role-btn"
                            onClick={onMoveUp}
                            disabled={isFirst}
                            title="Move Up"
                        >
                            <ArrowUpIcon />
                        </button>
                        <button
                            className="move-role-btn"
                            onClick={onMoveDown}
                            disabled={isLast}
                            title="Move Down"
                        >
                            <ArrowDownIcon />
                        </button>
                    </div>

                    <button
                        className="modal-icon-btn"
                        onClick={onEdit}
                        title="Configure Role"
                    >
                        <ConfigIcon />
                    </button>

                    {canDelete && (
                        <button
                            className="modal-icon-btn delete-role-btn"
                            onClick={onDelete}
                            title="Delete Role"
                        >
                            <TrashIcon />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
