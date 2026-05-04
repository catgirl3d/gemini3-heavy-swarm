import React, { ReactNode, useMemo } from 'react';
import { CustomSelect, CustomSelectOption } from '@/components/ui/CustomSelect';
import './PresetSelector.css';

export interface PresetSelectorOption {
    id: string;
    name: string;
    isCustom: boolean;
}

interface PresetSelectOption<T extends PresetSelectorOption> extends CustomSelectOption<string> {
    preset: T;
}

interface PresetSelectorProps<T extends PresetSelectorOption> {
    presets: T[];
    onSelect: (preset: T) => void;
    onDeletePreset?: (preset: T) => void;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const PresetSelector = <T extends PresetSelectorOption,>({
    presets,
    onSelect,
    onDeletePreset,
    isOpen,
    onOpenChange,
}: PresetSelectorProps<T>) => {
    const options = useMemo<PresetSelectOption<T>[]>(() => presets.map((preset) => ({
        value: preset.id,
        label: preset.name,
        preset,
    })), [presets]);

    const optionsById = useMemo(() => new Map(options.map((option) => [option.value, option.preset])), [options]);
    const hasPresets = presets.length > 0;

    const handleChange = (id: string) => {
        const preset = optionsById.get(id);

        if (preset) {
            onSelect(preset);
        }
    };

    const renderTrigger = (_selected: CustomSelectOption<string> | null, open: boolean): ReactNode => (
        <>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span className="preset-selector-trigger-label">{hasPresets ? 'Select a Preset...' : 'No Presets Available'}</span>
            <svg className={`custom-select-chevron ${open ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </>
    );

    return (
        <CustomSelect
            options={options}
            value=""
            onChange={handleChange}
            disabled={!hasPresets}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            className="preset-selector-container"
            triggerClassName="preset-selector-trigger"
            dropdownClassName="preset-selector-dropdown"
            dropdownWidth={300}
            dropdownHeader={<div className="preset-selector-header">Presets</div>}
            renderTrigger={renderTrigger}
            renderOption={(option) => (
                <div className="preset-selector-option-content">
                    <div className="preset-selector-option-name">
                        {option.label}
                        {option.preset.isCustom && <span className="preset-selector-tag">Saved</span>}
                    </div>
                </div>
            )}
            renderOptionTrailing={onDeletePreset ? (option, { closeDropdown }) => {
                if (!option.preset.isCustom) return null;

                return (
                    <button
                        type="button"
                        className="preset-selector-delete-btn"
                        onClick={() => {
                            onDeletePreset(option.preset);
                            closeDropdown();
                        }}
                        title="Delete Preset"
                        aria-label={`Delete preset ${option.label}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                );
            } : undefined}
        />
    );
};
