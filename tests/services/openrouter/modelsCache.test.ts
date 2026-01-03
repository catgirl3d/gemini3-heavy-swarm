
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedModels, setCachedModels, clearCachedModels, ModelOption } from '@/services/openrouter/modelsCache';

// Mock localStorage for Node environment tests
const localStorageMock = (function() {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('modelsCache', () => {
    const mockModels: ModelOption[] = [
        { value: 'model-1', label: 'Model 1', price: 0.1, priceText: '$0.1/M' },
        { value: 'model-2', label: 'Model 2', price: 0.2, priceText: '$0.2/M', supportsReasoning: true }
    ];

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('should return null when cache is empty', () => {
        expect(getCachedModels()).toBeNull();
    });

    it('should save and retrieve models', () => {
        setCachedModels(mockModels);
        const cached = getCachedModels();
        expect(cached).toEqual(mockModels);
    });

    it('should return null when cache is expired', () => {
        const expiredTimestamp = Date.now() - (7 * 60 * 60 * 1000); // 7 hours ago (limit is 6)
        
        const data = {
            timestamp: expiredTimestamp,
            models: mockModels
        };
        
        localStorage.setItem('openrouter_models_cache', JSON.stringify(data));
        
        expect(getCachedModels()).toBeNull();
        expect(localStorage.getItem('openrouter_models_cache')).toBeNull(); // Should be removed
    });

    it('should return models when cache is within duration', () => {
        const validTimestamp = Date.now() - (5 * 60 * 60 * 1000); // 5 hours ago
        
        const data = {
            timestamp: validTimestamp,
            models: mockModels
        };
        
        localStorage.setItem('openrouter_models_cache', JSON.stringify(data));
        
        expect(getCachedModels()).toEqual(mockModels);
    });

    it('should handle invalid JSON in cache', () => {
        localStorage.setItem('openrouter_models_cache', 'invalid-json');
        
        expect(getCachedModels()).toBeNull();
        expect(localStorage.getItem('openrouter_models_cache')).toBeNull();
    });

    it('should clear cache', () => {
        setCachedModels(mockModels);
        expect(getCachedModels()).toEqual(mockModels);
        
        clearCachedModels();
        expect(getCachedModels()).toBeNull();
    });

    it('should silently handle localStorage errors in setCachedModels', () => {
        const setItemSpy = vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
            throw new Error('Quota exceeded');
        });
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        setCachedModels(mockModels);
        
        expect(consoleSpy).toHaveBeenCalledWith('Failed to cache OpenRouter models:', expect.any(Error));
        
        setItemSpy.mockRestore();
        consoleSpy.mockRestore();
    });
});
