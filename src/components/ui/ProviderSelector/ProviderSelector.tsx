import React, { FC, useState, useRef } from 'react';
import { ProviderType } from '@/types';
import { PortalDropdown } from '@/components/ui/PortalDropdown/PortalDropdown';
import { getProviderLogo } from '@/utils/logoHelpers';
import './ProviderSelector.css';

interface ProviderSelectorProps {
    value: ProviderType;
    onChange: (value: ProviderType) => void;
    disabled?: boolean;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const ProviderSelector: FC<ProviderSelectorProps> = ({
    value,
    onChange,
    disabled,
    isOpen: controlledIsOpen,
    onOpenChange,
}) => {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const setIsOpen = (open: boolean) => {
        if (onOpenChange) onOpenChange(open);
        else setInternalIsOpen(open);
    };

    const triggerRef = useRef<HTMLButtonElement>(null);

    const handleSelect = (provider: ProviderType) => {
        onChange(provider);
        setIsOpen(false);
    };

    const getLabel = (provider: ProviderType) => {
        return provider === ProviderType.Gemini ? 'Google Gemini' : 'OpenRouter';
    };

    return (
        <div className="provider-selector-container">
            <button
                ref={triggerRef}
                className={`provider-selector-trigger ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                type="button"
            >
                <div className="selected-provider-label">
                    <img 
                      src={getProviderLogo(value)} 
                      alt="" 
                      className="provider-trigger-icon" 
                      key={value}
                    />
                    {getLabel(value)}
                </div>
                <svg className={`chevron ${isOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            <PortalDropdown isOpen={isOpen} triggerRef={triggerRef}>
                <div className="provider-selector-dropdown">
                    <div className="provider-options-list">
                        <button
                            className={`provider-option ${value === ProviderType.Gemini ? 'selected' : ''}`}
                            onClick={() => handleSelect(ProviderType.Gemini)}
                        >
                            <div className="provider-option-content">
                                <img src={getProviderLogo(ProviderType.Gemini)} alt="" className="provider-option-icon" />
                                <span className="provider-option-label">Google Gemini</span>
                            </div>
                        </button>
                        <button
                            className={`provider-option ${value === ProviderType.OpenRouter ? 'selected' : ''}`}
                            onClick={() => handleSelect(ProviderType.OpenRouter)}
                        >
                            <div className="provider-option-content">
                                <img src={getProviderLogo(ProviderType.OpenRouter)} alt="" className="provider-option-icon" />
                                <span className="provider-option-label">OpenRouter</span>
                            </div>
                        </button>
                    </div>
                </div>
            </PortalDropdown>
        </div>
    );
};
