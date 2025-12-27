import { useEffect, useRef } from 'react';

// Module-level state to track active modals and preserve original body styles
let activeModalCount = 0;
let originalOverflow = '';

// Global stack for Escape key handlers to ensure only the top-most modal reacts
const escStack: (() => void)[] = [];

const handleGlobalEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && escStack.length > 0) {
        // Prevent other Escape listeners from firing (e.g., dropdowns, other modals)
        e.preventDefault();
        e.stopPropagation();
        // Execute only the top-most handler
        const topHandler = escStack[escStack.length - 1];
        topHandler();
    }
};

interface UseModalGlobalHandlersProps {
    isOpen: boolean;
    onEscape: () => void;
    clickOutsideSelectors: string[];
    onCloseDropdowns: () => void;
}

/**
 * A hook to manage global event handlers for modals:
 * 1. ESC key to close/backtrack (uses a global stack for nested modals)
 * 2. Click-outside to close dropdowns
 * 3. Body scroll lock
 */
export const useModalGlobalHandlers = ({
    isOpen,
    onEscape,
    clickOutsideSelectors,
    onCloseDropdowns
}: UseModalGlobalHandlersProps) => {
    // Use a ref for onEscape to ensure the stack always calls the latest handler
    // without needing to re-register in the stack on every render/handler change.
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;

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

    // Manage global ESC stack
    useEffect(() => {
        if (!isOpen) return;

        // Wrap the ref-based call so the handler identity in the stack remains stable
        const handler = () => onEscapeRef.current();
        
        escStack.push(handler);
        if (escStack.length === 1) {
            window.addEventListener('keydown', handleGlobalEsc);
        }

        return () => {
            const index = escStack.indexOf(handler);
            if (index > -1) {
                escStack.splice(index, 1);
            }
            if (escStack.length === 0) {
                window.removeEventListener('keydown', handleGlobalEsc);
            }
        };
    }, [isOpen]);

    // Manage global Click-outside listener (kept per-modal for targeted dropdown closing)
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return;
            const target = e.target;

            // Check if click was outside all specified selectors
            if (clickOutsideSelectors.length === 0) return;

            const isOutsideAll = clickOutsideSelectors.every(selector => !target.closest(selector));
            
            if (isOutsideAll) {
                onCloseDropdowns();
            }
        };

        window.addEventListener('click', handleClickOutside, true);

        return () => {
            window.removeEventListener('click', handleClickOutside, true);
        };
    }, [isOpen, clickOutsideSelectors, onCloseDropdowns]);
};
