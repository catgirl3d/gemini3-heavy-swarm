import React from 'react';

export interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    hasActiveDropdown?: boolean;
    onCloseDropdowns?: () => void;
    className?: string;
    overlayClassName?: string;
    closeOnOverlayClick?: boolean;
    onEscape?: () => void;
}

export interface BaseModalHeaderProps {
    title: React.ReactNode;
    onClose?: () => void;
    children?: React.ReactNode;
}

export interface BaseModalBodyProps {
    children: React.ReactNode;
    className?: string;
}

export interface BaseModalFooterProps {
    children: React.ReactNode;
    className?: string;
}
