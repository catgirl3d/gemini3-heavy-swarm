import React, { type ReactNode, useRef, useState } from 'react';
import { PortalDropdown } from '@/components/ui/PortalDropdown/PortalDropdown';
import './CustomSelect.css';

export interface CustomSelectOption<T = string> {
    value: T;
    label: string;
    [key: string]: any; // Allow additional properties
}

interface CustomSelectProps<T = string> {
    // Data
    options: CustomSelectOption<T>[];
    value: T;
    onChange: (value: T) => void;
    
    // Display
    placeholder?: string;
    disabled?: boolean;
    
    // Custom rendering
    renderTrigger?: (selected: CustomSelectOption<T> | null, isOpen: boolean) => ReactNode;
    renderOption?: (option: CustomSelectOption<T>, isSelected: boolean) => ReactNode;
    renderOptionTrailing?: (
        option: CustomSelectOption<T>,
        helpers: { closeDropdown: () => void; selectOption: () => void; isSelected: boolean }
    ) => ReactNode;
    
    // Additional features
    searchable?: boolean;
    searchPlaceholder?: string;
    filterFn?: (option: CustomSelectOption<T>, searchTerm: string) => boolean;
    
    // Header/Footer slots
    dropdownHeader?: ReactNode;
    dropdownFooter?: ReactNode;
    
    // Styling
    className?: string;
    triggerClassName?: string;
    dropdownClassName?: string;
    searchWrapperClassName?: string;
    dropdownWidth?: number;
    
    // Controlled state
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSearchChange?: (search: string) => void;
}

export function CustomSelect<T = string>({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    disabled = false,
    renderTrigger,
    renderOption,
    renderOptionTrailing,
    searchable = false,
    searchPlaceholder = 'Search...',
    filterFn,
    dropdownHeader,
    dropdownFooter,
    className = '',
    triggerClassName = '',
    dropdownClassName = '',
    searchWrapperClassName = '',
    dropdownWidth,
    isOpen: controlledIsOpen,
    onOpenChange,
    onSearchChange,
}: CustomSelectProps<T>) {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const handleSearchChange = (term: string) => {
        setSearchTerm(term);
        if (onSearchChange) onSearchChange(term);
    };

    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const setIsOpen = (open: boolean) => {
        if (onOpenChange) onOpenChange(open);
        else setInternalIsOpen(open);
        
        if (open && searchable) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        if (!open) {
            setSearchTerm('');
        }
    };

    const selectedOption = options.find(opt => opt.value === value) || null;
    const closeDropdown = () => setIsOpen(false);
    const renderSelectOption = (option: CustomSelectOption<T>, isSelected: boolean) => {
        const trailingContent = renderOptionTrailing?.(option, {
            closeDropdown,
            selectOption: () => handleSelect(option.value),
            isSelected,
        });

        if (!trailingContent) {
            return (
                <button
                    key={String(option.value)}
                    type="button"
                    className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(option.value)}
                >
                    {optionRenderer(option, isSelected)}
                </button>
            );
        }

        return (
            <div key={String(option.value)} className="custom-select-option-row">
                <button
                    type="button"
                    className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(option.value)}
                >
                    {optionRenderer(option, isSelected)}
                </button>
                <div className="custom-select-option-trailing">
                    {trailingContent}
                </div>
            </div>
        );
    };

    const handleSelect = (optionValue: T) => {
        onChange(optionValue);
        closeDropdown();
    };

    // Default filter function
    const defaultFilterFn = (option: CustomSelectOption<T>, search: string) => {
        const term = search.toLowerCase();
        return (
            option.label.toLowerCase().includes(term) ||
            String(option.value).toLowerCase().includes(term)
        );
    };

    const applyFilter = filterFn || defaultFilterFn;
    const filteredOptions = searchable && searchTerm
        ? options.filter(opt => applyFilter(opt, searchTerm))
        : options;

    // Default trigger renderer
    const defaultRenderTrigger = (selected: CustomSelectOption<T> | null, open: boolean) => (
        <>
            <span className="custom-select-label">
                {selected ? selected.label : placeholder}
            </span>
            <svg className={`custom-select-chevron ${open ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </>
    );

    // Default option renderer
    const defaultRenderOption = (option: CustomSelectOption<T>, isSelected: boolean) => (
        <span className="custom-select-option-label">{option.label}</span>
    );

    const triggerRenderer = renderTrigger || defaultRenderTrigger;
    const optionRenderer = renderOption || defaultRenderOption;

    return (
        <div className={`custom-select-container ${className}`}>
            <button
                ref={triggerRef}
                className={`custom-select-trigger ${triggerClassName} ${disabled ? 'disabled' : ''}`.trim()}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                type="button"
            >
                {triggerRenderer(selectedOption, isOpen)}
            </button>

            <PortalDropdown isOpen={isOpen} triggerRef={triggerRef} width={dropdownWidth}>
                <div className={`custom-select-dropdown ${dropdownClassName}`}>
                    {searchable && (
                        <div className={`custom-select-search-wrapper ${searchWrapperClassName}`}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="custom-select-search-input"
                                placeholder={searchPlaceholder}
                                value={searchTerm}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setIsOpen(false);
                                    if (e.key === 'Enter' && filteredOptions.length > 0) {
                                        handleSelect(filteredOptions[0].value);
                                    }
                                }}
                            />
                            {dropdownHeader}
                        </div>
                    )}
                    
                    {!searchable && dropdownHeader}

                    <div className="custom-select-options-list">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => {
                                const isSelected = option.value === value;
                                const isHeader = option.isHeader === true;

                                if (isHeader) {
                                    return (
                                        <div key={`header-${index}`} className="custom-select-header">
                                            {option.label}
                                        </div>
                                    );
                                }

                                return renderSelectOption(option, isSelected);
                            })
                        ) : (
                            <div className="custom-select-no-results">
                                {searchTerm ? 'No results found' : 'No options available'}
                            </div>
                        )}
                    </div>

                    {dropdownFooter}
                </div>
            </PortalDropdown>
        </div>
    );
}
