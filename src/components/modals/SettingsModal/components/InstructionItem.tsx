import React, { FC } from 'react';
import { ConfigIcon } from '@/components/modals/SettingsModal/icons';

interface InstructionItemProps {
    index: number;
    label: string;
    help: string;
    onEdit: () => void;
}

export const InstructionItem: FC<InstructionItemProps> = ({ index, label, help, onEdit }) => {
    return (
        <div className="role-item compact">
            <div className="role-compact-row">
                <div className="role-ordinal">#{index + 1}</div>

                <div className="role-main-content">
                    <div className="role-info-group">
                        <div className="role-name-display">
                            {label}
                        </div>
                        <div className="modal-help-text ellipsis">
                            {help}
                        </div>
                    </div>
                </div>

                <div className="role-actions-compact">
                    <button
                        className="modal-icon-btn"
                        onClick={onEdit}
                        title="Configure Instruction"
                    >
                        <ConfigIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};
