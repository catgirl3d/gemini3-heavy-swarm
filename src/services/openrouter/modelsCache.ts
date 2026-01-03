
// LocalStorage cache configuration for OpenRouter models
const CACHE_KEY = 'openrouter_models_cache';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface ModelOption {
    value: string;
    label: string;
    description?: string;
    price?: number;
    priceText?: string;
    supportsReasoning?: boolean;
}

interface CachedModels {
    timestamp: number;
    models: ModelOption[];
}

/**
 * Get cached models from localStorage if valid
 */
export function getCachedModels(): ModelOption[] | null {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const data: CachedModels = JSON.parse(cached);
        const now = Date.now();

        // Check if cache is still valid
        if (now - data.timestamp < CACHE_DURATION_MS) {
            return data.models;
        }

        // Cache expired, remove it
        localStorage.removeItem(CACHE_KEY);
        return null;
    } catch (error) {
        // Invalid cache, remove it
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}

/**
 * Save models to localStorage cache
 */
export function setCachedModels(models: ModelOption[]): void {
    try {
        const data: CachedModels = {
            timestamp: Date.now(),
            models
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
        // Silently fail if localStorage is unavailable
        console.warn('Failed to cache OpenRouter models:', error);
    }
}

/**
 * Clear the models cache
 */
export function clearCachedModels(): void {
    localStorage.removeItem(CACHE_KEY);
}
