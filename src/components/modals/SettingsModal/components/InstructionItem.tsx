import React, { FC } from 'react';
import { ConfigIcon } from '@/components/modals/SettingsModal/icons';

interface InstructionItemProps {
    index: number;
    label: string;
    help: string;
    model?: string;
    onEdit: () => void;
}

export const InstructionItem: FC<InstructionItemProps> = ({ index, label, help, model, onEdit }) => {
    return (
        <div className="modal-item-card compact">
            <div className="modal-item-row">
                <div className="modal-item-ordinal">#{index + 1}</div>

                <div className="modal-item-main">
                    <div className="modal-item-info">
                        <div className="modal-item-name">
                            {label}
                            {model && (
                                <span className="modal-item-tag">
                                    {model}
                                </span>
                            )}
                        </div>
                        <div className="modal-help-text ellipsis">
                            {help}
                        </div>
                    </div>
                </div>

                <div className="modal-item-actions">
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
