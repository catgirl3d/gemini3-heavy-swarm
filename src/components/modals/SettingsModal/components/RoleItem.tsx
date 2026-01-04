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
        <div className="modal-item-card compact">
            <div className="modal-item-row">
                <div className="modal-item-ordinal">#{index + 1}</div>

                <div className="modal-item-main">
                    <div className="modal-item-info">
                        <div className="modal-item-name">
                            {role.name || 'Unnamed Role'}
                        </div>
                        {role.model && (
                            <div className="modal-item-tag">
                                {role.model}
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-item-actions">
                    <div className="modal-item-move-controls horizontal">
                        <button
                            className="modal-item-move-btn"
                            onClick={onMoveUp}
                            disabled={isFirst}
                            title="Move Up"
                        >
                            <ArrowUpIcon />
                        </button>
                        <button
                            className="modal-item-move-btn"
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
                            className="modal-icon-btn modal-item-delete-btn"
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
