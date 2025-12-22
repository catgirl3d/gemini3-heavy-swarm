import { useEffect } from 'react';

// Module-level state to track active modals and preserve original body styles
let activeModalCount = 0;
let originalOverflow = '';

interface UseModalGlobalHandlersProps {
    isOpen: boolean;
    onEscape: () => void;
    clickOutsideSelectors: string[];
    onCloseDropdowns: () => void;
}

/**
 * A hook to manage global event handlers for modals:
 * 1. ESC key to close/backtrack
 * 2. Click-outside to close dropdowns
 * 3. Body scroll lock
 */
export const useModalGlobalHandlers = ({
    isOpen,
    onEscape,
    clickOutsideSelectors,
    onCloseDropdowns
}: UseModalGlobalHandlersProps) => {
    // Manage body overflow with ref-counting to support nested modals
    useEffect(() => {
        if (!isOpen) return;

        activeModalCount++;
        if (activeModalCount === 1) {
            originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }

        return () => {
            activeModalCount--;
            if (activeModalCount === 0) {
                document.body.style.overflow = originalOverflow;
                originalOverflow = '';
            }
        };
    }, [isOpen]);

    // Manage global listeners
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onEscape();
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return;
            const target = e.target;

            // Check if click was outside all specified selectors
            // If no selectors provided, we don't trigger the callback
            if (clickOutsideSelectors.length === 0) return;

            const isOutsideAll = clickOutsideSelectors.every(selector => !target.closest(selector));
            
            if (isOutsideAll) {
                onCloseDropdowns();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            window.addEventListener('click', handleClickOutside, true);
        }

        return () => {
            window.removeEventListener('keydown', handleEsc);
            window.removeEventListener('click', handleClickOutside, true);
        };
    }, [isOpen, onEscape, clickOutsideSelectors, onCloseDropdowns]);
};
