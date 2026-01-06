import React, { FC } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    discardLabel?: string;
    confirmVariant?: 'save' | 'danger';
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
    confirmVariant = 'save',
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
                <p className="modal-confirmation-text">{message}</p>
            </BaseModal.Body>
            <BaseModal.Footer>
                <div className="modal-footer-actions">
                    <button className="modal-btn outline" onClick={onCancel}>{cancelLabel}</button>
                    {onDiscard && discardLabel && (
                        <button className="modal-btn danger" onClick={onDiscard}>{discardLabel}</button>
                    )}
                </div>
                <button className={`modal-btn ${confirmVariant}`} onClick={onConfirm}>{confirmLabel}</button>
            </BaseModal.Footer>
        </BaseModal>
    );
};
