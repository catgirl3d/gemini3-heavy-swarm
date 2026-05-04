import { createContext } from 'react';

interface BaseModalInteractionContextValue {
    registerClickInsideElement: (element: HTMLElement | null) => void;
    unregisterClickInsideElement: (element: HTMLElement | null) => void;
}

export const BaseModalInteractionContext = createContext<BaseModalInteractionContextValue | null>(null);
