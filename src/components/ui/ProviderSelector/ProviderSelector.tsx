import React, { type FC } from 'react';
import { ProviderType } from '@/types';
import { CustomSelect, type CustomSelectOption } from '@/components/ui/CustomSelect';
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
    isOpen,
    onOpenChange,
}) => {
    const options: CustomSelectOption<ProviderType>[] = [
        { value: ProviderType.Gemini, label: 'Google Gemini' },
        { value: ProviderType.OpenRouter, label: 'OpenRouter' },
    ];

    const renderTrigger = (selected: CustomSelectOption<ProviderType> | null) => {
        if (!selected) return <span>Select Provider</span>;
        return (
            <div className="selected-provider-label">
                <img 
                    src={getProviderLogo(selected.value)} 
                    alt="" 
                    className="provider-trigger-icon" 
                />
                {selected.label}
            </div>
        );
    };

    const renderOption = (option: CustomSelectOption<ProviderType>) => (
        <div className="provider-option-content">
            <img src={getProviderLogo(option.value)} alt="" className="provider-option-icon" />
            <span className="provider-option-label">{option.label}</span>
        </div>
    );

    return (
        <CustomSelect
            options={options}
            value={value}
            onChange={onChange}
            disabled={disabled}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            renderTrigger={renderTrigger}
            renderOption={renderOption}
            className="provider-selector-container"
            dropdownClassName="provider-selector-dropdown"
        />
    );
};
