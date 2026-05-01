import React, { FC, useState, useEffect, useMemo } from 'react';
import { getModelDisplayName } from '@/utils/common/modelUtils';
import { fetchOpenRouterModels } from '@/services/openrouter/modelsService';
import { RECOMMENDED_MODEL_IDS, FILTERED_MODEL_IDS } from '@/services/openrouter/constants';
import { AVAILABLE_MODELS } from '@/components/modals/SettingsModal/constants';
import { SortAscIcon, SortDescIcon, StarIcon } from '@/components/modals/SettingsModal/icons';
import { ProviderType } from '@/types';
import { CustomSelect, CustomSelectOption } from '@/components/ui/CustomSelect';
import { getProviderLogo } from '@/utils/logoHelpers';
import thinkingIcon from '@/assets/thinking.png';
import './ModelSelector.css';

import { getCachedModels, setCachedModels, ModelOption } from '@/services/openrouter/modelsCache';

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
    isOpen,
    onOpenChange,
    isDemoMode = false
}) => {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'price_asc' | 'price_desc'>('name');

    // Initialize models from cache if available for OpenRouter
    const [models, setModels] = useState<ModelOption[]>(() => {
        // Only load from cache if we're using OpenRouter
        if (provider === ProviderType.OpenRouter) {
            return getCachedModels() || [];
        }
        return [];
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let isCurrent = true;

        if (provider === ProviderType.Gemini) {
            setModels(AVAILABLE_MODELS.map(m => ({ value: m.value, label: m.label })));
            setError(null);
            setIsLoading(false);
        } else if (provider === ProviderType.OpenRouter) {
            setModels(getCachedModels() || []);
            setIsLoading(true);
            setError(null);
            fetchOpenRouterModels()
                .then(fetchedModels => {
                    if (!isCurrent) return;
                    const processedModels = fetchedModels.map(m => {
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
                    });
                    
                    // Save to cache for future renders
                    setCachedModels(processedModels);
                    setModels(processedModels);
                })
                .catch(() => {
                    if (!isCurrent) return;
                    setError('Failed to load models from OpenRouter');
                })
                .finally(() => {
                    if (isCurrent) {
                        setIsLoading(false);
                    }
                });
        }

        return () => {
            isCurrent = false;
        };
    }, [provider, retryCount]);

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
    }, [models, search, provider, isDemoMode]);

    const options = useMemo(() => {
        const combined: CustomSelectOption<string>[] = [];
        
        if (showEmptyOption && !search) {
            combined.push({ value: '', label: emptyLabel || 'None' });
        }

        if (recommendedModels.length > 0) {
            combined.push({ value: 'header-rec', label: 'Recommended', isHeader: true });
            recommendedModels.forEach(m => {
                combined.push({ ...m, isRecommended: true });
            });
            combined.push({ value: 'header-all', label: 'All Models', isHeader: true });
        }

        sortedAndFilteredModels.forEach(m => {
            combined.push(m);
        });

        return combined;
    }, [showEmptyOption, emptyLabel, search, recommendedModels, sortedAndFilteredModels]);

    const renderTrigger = (selected: CustomSelectOption<string> | null) => {
        const logo = getProviderLogo(provider, selected?.value || value);
        const label = selected ? selected.label : (getModelDisplayName(value) || placeholder || 'Select model...');
        
        return (
            <>
                <span className="selected-model-label">
                    <img src={logo} alt="" className="model-trigger-icon" key={value} />
                    {label}
                </span>
                <svg className={`chevron ${isOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </>
        );
    };

    const renderOption = (option: CustomSelectOption<string>) => {
        if (option.value === '') {
            return <div className="model-option-label">{option.label}</div>;
        }

        return (
            <div className={`model-option-wrapper ${option.isRecommended ? 'recommended' : ''}`} title={option.description}>
                <div className="model-option-header">
                    <div className="model-option-label">
                        {option.isRecommended && <span className="star-icon"><StarIcon /></span>}
                        <img src={getProviderLogo(provider, option.value)} alt="" className="model-option-icon" />
                        {option.label}
                        {option.supportsReasoning && <img src={thinkingIcon} alt="thinking" className="thinking-indicator" title="Supports reasoning" />}
                    </div>
                    {option.priceText && <div className="model-price-tag">{option.priceText}</div>}
                </div>
                <div className="model-option-value">{option.value}</div>
            </div>
        );
    };

    const dropdownHeader = provider === ProviderType.OpenRouter && (
        <div className="model-sort-row">
            <span className="sort-label">Sort by:</span>
            <button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`} onClick={() => setSortBy('name')}>Name</button>
            <button className={`sort-btn ${sortBy === 'price_asc' ? 'active' : ''}`} onClick={() => setSortBy('price_asc')} title="Price: Low to High">Price <SortAscIcon /></button>
            <button className={`sort-btn ${sortBy === 'price_desc' ? 'active' : ''}`} onClick={() => setSortBy('price_desc')} title="Price: High to Low">Price <SortDescIcon /></button>
        </div>
    );

    const dropdownFooter = (isLoading || error) && (
        <div className="model-footer-status">
            {isLoading && <div className="model-loading">Loading models...</div>}
            {error && (
                <div className="model-error-container">
                    <div className="model-error-message">{error}</div>
                    <button className="model-retry-btn" onClick={(e) => { e.stopPropagation(); setRetryCount(prev => prev + 1); }}>Retry</button>
                </div>
            )}
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
            searchable={true}
            searchPlaceholder="Search models..."
            searchWrapperClassName="model-search-wrapper"
            onSearchChange={setSearch}
            renderTrigger={renderTrigger}
            renderOption={renderOption}
            dropdownHeader={dropdownHeader}
            dropdownFooter={dropdownFooter}
            className="model-selector-container"
            dropdownClassName="model-selector-dropdown"
        />
    );
};
