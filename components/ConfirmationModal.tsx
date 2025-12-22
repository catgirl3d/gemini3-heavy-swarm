import React, { FC } from 'react';
import { createPortal } from 'react-dom';
import { useModalGlobalHandlers } from '../hooks/useModalGlobalHandlers';
import './Modal.css';

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
    useModalGlobalHandlers({
        isOpen,
        onEscape: onCancel,
        clickOutsideSelectors: [],
        onCloseDropdowns: () => {}
    });

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay top" onClick={onCancel}>
            <div className="modal-container modal-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-modal-button" onClick={onCancel} aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>
                <div className="modal-body">
                    <p>{message}</p>
                </div>
                <div className="modal-footer">
                    <div className="modal-footer-actions">
                        {onDiscard && discardLabel && (
                            <button className="modal-btn danger" onClick={onDiscard}>{discardLabel}</button>
                        )}
                        <button className="modal-btn outline" onClick={onCancel}>{cancelLabel}</button>
                    </div>
                    <button className="modal-btn save" onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>,
        document.body
    );
};
