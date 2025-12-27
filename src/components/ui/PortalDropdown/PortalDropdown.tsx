import React, { FC, ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
    isOpen: boolean;
    triggerRef: React.RefObject<HTMLElement | null>;
    children: ReactNode;
    className?: string;
    width?: number; // Optional fixed width
}

/**
 * A dropdown component that renders via React Portal to document.body.
 * This prevents clipping by parent containers with overflow: hidden or auto.
 * 
 * Note: Uses inline styles for dynamic positioning (top/left/width) which is
 * an acceptable exception to the "no inline styles" rule for portal positioning.
 * 
 * Uses useLayoutEffect to calculate position synchronously before paint,
 * preventing the "flash in top-left corner" issue.
 */
export const PortalDropdown: FC<PortalDropdownProps> = ({
    isOpen,
    triggerRef,
    children,
    className = '',
    width
}) => {
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    const updateCoords = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Use viewport-relative coordinates for position:fixed
            setCoords({
                top: rect.bottom,
                left: rect.left,
                width: width || rect.width
            });
        }
    };

    // useLayoutEffect runs synchronously after DOM mutations but before browser paint
    // This prevents the dropdown from flashing at (0,0) before moving to correct position
    useLayoutEffect(() => {
        if (isOpen) {
            updateCoords();
            
            // Re-calculate on window events
            window.addEventListener('resize', updateCoords);
            window.addEventListener('scroll', updateCoords, true); // Capture phase to catch scroll in modal body

            return () => {
                window.removeEventListener('resize', updateCoords);
                window.removeEventListener('scroll', updateCoords, true);
                // Reset coords when closing so next open recalculates fresh
                setCoords(null);
            };
        }
    }, [isOpen, triggerRef, width]);

    // Don't render until we have calculated coordinates
    if (!isOpen || coords === null) return null;

    return createPortal(
        <div
            className={`modal-dropdown-portal ${className}`}
            style={{
                // Inline styles required for dynamic positioning
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: width ? `${width}px` : `${coords.width}px`
            }}
        >
            {children}
        </div>,
        document.body
    );
};
