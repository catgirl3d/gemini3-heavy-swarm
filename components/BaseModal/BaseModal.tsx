import React, { FC } from 'react';
import { createPortal } from 'react-dom';
import { useModalGlobalHandlers } from '@/hooks/ui/useModalGlobalHandlers';
import { 
    BaseModalProps, 
    BaseModalHeaderProps, 
    BaseModalBodyProps, 
    BaseModalFooterProps 
} from '@/components/BaseModal/types';
import '../Modal.css';

const EMPTY_SELECTORS: string[] = [];
const NOOP = () => {};

const BaseModalMain: FC<BaseModalProps> = ({
    isOpen,
    onClose,
    children,
    size = 'md',
    className = '',
    overlayClassName = '',
    closeOnOverlayClick = true,
    clickOutsideSelectors = EMPTY_SELECTORS,
    onCloseDropdowns = NOOP,
    onEscape
}) => {
    useModalGlobalHandlers({
        isOpen,
        onEscape: onEscape || onClose,
        clickOutsideSelectors,
        onCloseDropdowns
    });

    if (!isOpen) return null;

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    return createPortal(
        <div className={`modal-overlay ${overlayClassName}`} onClick={handleOverlayClick}>
            <div 
                className={`modal-container modal-${size} ${className}`} 
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                {children}
            </div>
        </div>,
        document.body
    );
};

const Header: FC<BaseModalHeaderProps> = ({ title, onClose, children }) => (
    <div className="modal-header">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
        <div className="modal-header-actions">
            {children}
            {onClose && (
                <button className="close-modal-button" onClick={onClose} aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>
            )}
        </div>
    </div>
);

const Body: FC<BaseModalBodyProps> = ({ children, className = '' }) => (
    <div className={`modal-body ${className}`}>
        {children}
    </div>
);

const Footer: FC<BaseModalFooterProps> = ({ children, className = '' }) => (
    <div className={`modal-footer ${className}`}>
        {children}
    </div>
);

const Divider: FC = () => <div className="modal-divider"></div>;

export const BaseModal = Object.assign(BaseModalMain, {
    Header,
    Body,
    Footer,
    Divider
});
