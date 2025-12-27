import React, { FC } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    discardLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    onDiscard?: () => void;
}

export const ConfirmationModal: FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    discardLabel,
    onConfirm,
    onCancel,
    onDiscard
}) => {
    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onCancel}
            size="sm"
            overlayClassName="top"
        >
            <BaseModal.Header title={title} onClose={onCancel} />
            <BaseModal.Body>
                <p>{message}</p>
            </BaseModal.Body>
            <BaseModal.Footer>
                <div className="modal-footer-actions">
                    {onDiscard && discardLabel && (
                        <button className="modal-btn danger" onClick={onDiscard}>{discardLabel}</button>
                    )}
                    <button className="modal-btn outline" onClick={onCancel}>{cancelLabel}</button>
                </div>
                <button className="modal-btn save" onClick={onConfirm}>{confirmLabel}</button>
            </BaseModal.Footer>
        </BaseModal>
    );
};
