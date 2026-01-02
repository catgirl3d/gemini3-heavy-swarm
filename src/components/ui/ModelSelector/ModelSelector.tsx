import React, { FC, useState, useEffect, useRef, useMemo } from 'react';
import { fetchOpenRouterModels } from '@/services/openrouter/modelsService';
import { RECOMMENDED_MODEL_IDS, FILTERED_MODEL_IDS } from '@/services/openrouter/constants';
import { AVAILABLE_MODELS } from '@/components/modals/SettingsModal/constants';
import { ProviderType } from '@/types';
import { PortalDropdown } from '@/components/ui/PortalDropdown/PortalDropdown';
import thinkingIcon from '@/assets/thinking.png';
import './ModelSelector.css';

interface ModelSelectorProps {
    value: string;
    onChange: (value: string) => void;
    provider: ProviderType;
    disabled?: boolean;
    placeholder?: string;
    showEmptyOption?: boolean;
    emptyLabel?: string;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    isDemoMode?: boolean;
}

export const ModelSelector: FC<ModelSelectorProps> = ({
    value,
    onChange,
    provider,
    disabled,
    placeholder,
    showEmptyOption,
    emptyLabel,
    isOpen: controlledIsOpen,
    onOpenChange,
    isDemoMode = false
}) => {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
    const setIsOpen = (open: boolean) => {
        if (onOpenChange) onOpenChange(open);
        else setInternalIsOpen(open);
    };

    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'price_asc' | 'price_desc'>('name');

    const [models, setModels] = useState<Array<{
        value: string;
        label: string;
        description?: string;
        price?: number;
        priceText?: string;
        supportsReasoning?: boolean;
    }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (provider === ProviderType.Gemini) {
            setModels(AVAILABLE_MODELS.map(m => ({ value: m.value, label: m.label })));
            setError(null);
        } else if (provider === ProviderType.OpenRouter) {
            setIsLoading(true);
            setError(null);
            fetchOpenRouterModels()
                .then(fetchedModels => {
                    setModels(fetchedModels.map(m => {
                        const completionPrice = parseFloat(m.pricing.completion) || 0;
                        
                        // Human readable price (per 1M tokens) - using output/completion price
                        const displayPrice = completionPrice > 0
                            ? `$${(completionPrice * 1000000).toFixed(2)}/M`
                            : 'Free';
                        
                        // Check if model supports reasoning/thinking
                        const supportsReasoning = m.supported_parameters?.includes('reasoning') || false;

                        return {
                            value: m.id,
                            label: m.name,
                            description: m.description,
                            price: completionPrice,
                            priceText: displayPrice,
                            supportsReasoning
                        };
                    }));
                })
                .catch(() => {
                    setError('Failed to load models from OpenRouter');
                    setModels([]);
                })
                .finally(() => setIsLoading(false));
        }
    }, [provider, retryCount]);

    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const sortedAndFilteredModels = useMemo(() => {
        const lowerSearch = search.toLowerCase();
        const isModelFiltered = (id: string) => FILTERED_MODEL_IDS.some(f => id.toLowerCase().includes(f.toLowerCase()));
        
        let result = models.filter(m =>
            (m.label.toLowerCase().includes(lowerSearch) ||
            m.value.toLowerCase().includes(lowerSearch)) &&
            !isModelFiltered(m.value)
        );

        // Filter by free models only in demo mode for OpenRouter
        if (isDemoMode && provider === ProviderType.OpenRouter) {
            result = result.filter(m => m.priceText === 'Free');
        }

        // Filter out recommended from the "all" list when not searching to avoid duplication
        if (!search && provider === ProviderType.OpenRouter) {
            result = result.filter(m => !RECOMMENDED_MODEL_IDS.includes(m.value));
        }

        if (sortBy === 'price_asc') {
            result.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else if (sortBy === 'price_desc') {
            result.sort((a, b) => (b.price || 0) - (a.price || 0));
        } else {
            result.sort((a, b) => a.label.localeCompare(b.label));
        }

        return result;
        // FILTERED_MODEL_IDS and RECOMMENDED_MODEL_IDS are external constants
    }, [models, search, sortBy, provider, isDemoMode]);

    const recommendedModels = useMemo(() => {
        if (provider !== ProviderType.OpenRouter || search) return [];
        // Use exact match to avoid false positives (like 'gpt-5.1 codex' matching 'gpt-5.1')
        // Also sort recommended by their order in the RECOMMENDED_MODEL_IDS list
        const isModelFiltered = (id: string) => FILTERED_MODEL_IDS.some(f => id.toLowerCase().includes(f.toLowerCase()));
        const filtered = models.filter(m =>
            RECOMMENDED_MODEL_IDS.includes(m.value) &&
            !isModelFiltered(m.value) &&
            (!isDemoMode || m.priceText === 'Free')
        );
        return filtered.sort((a, b) =>
            RECOMMENDED_MODEL_IDS.indexOf(a.value) - RECOMMENDED_MODEL_IDS.indexOf(b.value)
        );
        // RECOMMENDED_MODEL_IDS and FILTERED_MODEL_IDS are external constants
    }, [models, search, provider, isDemoMode]);

    const selectedModel = models.find(m => m.value === value) || (value ? { value, label: value } : null);
    const displayLabel = selectedModel ? selectedModel.label : (value === '' && showEmptyOption ? (emptyLabel || 'None') : (placeholder || 'Select model...'));

    const handleSelect = (modelValue: string) => {
        onChange(modelValue);
        setIsOpen(false);
    };

    return (
        <div className="model-selector-container">
            <button
                ref={triggerRef}
                className={`model-selector-trigger ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                type="button"
            >
                <span className="selected-model-label">
                    {displayLabel}
                </span>
                <svg className={`chevron ${isOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            <PortalDropdown isOpen={isOpen} triggerRef={triggerRef}>
                <div className="model-selector-dropdown">
                    <div className="model-search-wrapper">
                        <div className="model-search-row">
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="model-search-input"
                                placeholder="Search models..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setIsOpen(false);
                                    if (e.key === 'Enter' && search && sortedAndFilteredModels.length > 0) {
                                        handleSelect(sortedAndFilteredModels[0].value);
                                    }
                                }}
                            />
                        </div>
                        {provider === ProviderType.OpenRouter && (
                            <div className="model-sort-row">
                                <span className="sort-label">Sort by:</span>
                                <button
                                    className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
                                    onClick={() => setSortBy('name')}
                                >
                                    Name
                                </button>
                                <button
                                    className={`sort-btn ${sortBy === 'price_asc' ? 'active' : ''}`}
                                    onClick={() => setSortBy('price_asc')}
                                >
                                    Price ↓
                                </button>
                                <button
                                    className={`sort-btn ${sortBy === 'price_desc' ? 'active' : ''}`}
                                    onClick={() => setSortBy('price_desc')}
                                >
                                    Price ↑
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="model-options-list">
                        {isLoading ? (
                            <div className="model-loading">Loading models...</div>
                        ) : error ? (
                            <div className="model-error-container">
                                <div className="model-error-message">{error}</div>
                                <button 
                                    className="model-retry-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRetryCount(prev => prev + 1);
                                    }}
                                >
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <>
                                {showEmptyOption && !search && (
                                    <button
                                        className={`model-option ${value === '' ? 'selected' : ''}`}
                                        onClick={() => handleSelect('')}
                                    >
                                        <div className="model-option-label">{emptyLabel || 'None'}</div>
                                    </button>
                                )}

                                {recommendedModels.length > 0 && (
                                    <>
                                        <div className="model-list-section-header">Recommended</div>
                                        {recommendedModels.map(m => (
                                            <button
                                                key={`rec-${m.value}`}
                                                className={`model-option recommended ${m.value === value ? 'selected' : ''}`}
                                                onClick={() => handleSelect(m.value)}
                                                title={m.description}
                                            >
                                                <div className="model-option-header">
                                                    <div className="model-option-label">
                                                        <span className="star-icon">★</span> {m.label}
                                                        {m.supportsReasoning && <img src={thinkingIcon} alt="thinking" className="thinking-indicator" title="Supports reasoning" />}
                                                    </div>
                                                    {m.priceText && <div className="model-price-tag">{m.priceText}</div>}
                                                </div>
                                                <div className="model-option-value">{m.value}</div>
                                            </button>
                                        ))}
                                        <div className="model-list-section-header">All Models</div>
                                    </>
                                )}

                                {sortedAndFilteredModels.map(m => (
                                    <button
                                        key={m.value}
                                        className={`model-option ${m.value === value ? 'selected' : ''}`}
                                        onClick={() => handleSelect(m.value)}
                                        title={m.description}
                                    >
                                        <div className="model-option-header">
                                            <div className="model-option-label">
                                                {m.label}
                                                {m.supportsReasoning && <img src={thinkingIcon} alt="thinking" className="thinking-indicator" title="Supports reasoning" />}
                                            </div>
                                            {m.priceText && <div className="model-price-tag">{m.priceText}</div>}
                                        </div>
                                        <div className="model-option-value">{m.value}</div>
                                    </button>
                                ))}
                            </>
                        )}
                        {!isLoading && sortedAndFilteredModels.length === 0 && (!showEmptyOption || search) && (
                            <div className="no-models-found">
                                {search ? 'No models match your search' : 'No models available'}
                            </div>
                        )}
                    </div>
                </div>
            </PortalDropdown>
        </div>
    );
};
