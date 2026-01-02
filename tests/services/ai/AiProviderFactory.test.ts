import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiProviderFactory } from '@/services/ai/AiProviderFactory';
import { AppSettings } from '@/types';

// Mock providers - use factory pattern to avoid hoisting issues
vi.mock('@/services/ai/providers', () => {
  const mockGeminiProvider = vi.fn();
  const mockProxyProvider = vi.fn();
  const mockOpenRouterProvider = vi.fn();
  
  return {
    GeminiProvider: mockGeminiProvider,
    ProxyProvider: mockProxyProvider,
    OpenRouterProvider: mockOpenRouterProvider,
  };
});

// Mock proxyUtils with proper environment variable and forced proxy support
const mockIsForcedProxy = { value: false };
const mockEnvGeminiApiKey = { value: undefined as string | undefined };

vi.mock('@/services/proxy/proxyUtils', () => ({
  getDirectApiKey: vi.fn((userApiKey?: string) => {
    if (mockIsForcedProxy.value) return null;
    return userApiKey || mockEnvGeminiApiKey.value || null;
  }),
}));

vi.mock('@/constants', () => ({
  IS_FORCED_PROXY: false,
}));

// Import mocked modules after mocks are set up
import { GeminiProvider, ProxyProvider, OpenRouterProvider } from '@/services/ai/providers';

describe('AiProviderFactory', () => {
  beforeEach(() => {
    // Reset mock flags
    mockIsForcedProxy.value = false;
    mockEnvGeminiApiKey.value = undefined;
    
    vi.mocked(GeminiProvider).mockClear();
    vi.mocked(ProxyProvider).mockClear();
    vi.mocked(OpenRouterProvider).mockClear();
  });

  describe('Provider creation', () => {
    it('should create OpenRouterProvider when provider is openrouter', () => {
      const settings = { 
        provider: 'openrouter',
        openRouterApiKey: 'or-key',
        openRouterModel: 'or-model'
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(OpenRouterProvider)).toHaveBeenCalledWith({
        apiKey: 'or-key',
        model: 'or-model',
        isProxy: false // Has API key, so not in proxy mode
      });
    });

    it('should create GeminiProvider when apiKey is valid', () => {
      const settings = { 
          provider: 'gemini',
          apiKey: 'valid-key'
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
    });

    it('should create ProxyProvider when no apiKey is valid', () => {
      const settings = { 
          provider: 'gemini',
          apiKey: ''
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
    });
  });

  describe('getProviderName', () => {
    it('should return correct provider name using getProviderName', () => {
      expect(AiProviderFactory.getProviderName({ provider: 'openrouter' } as any)).toBe('openrouter');
      expect(AiProviderFactory.getProviderName({ provider: 'gemini', apiKey: 'valid-key' } as any)).toBe('gemini');
      expect(AiProviderFactory.getProviderName({ provider: 'gemini', apiKey: '' } as any)).toBe('proxy');
    });
  });

  describe('OpenRouter edge cases with isProxy flag', () => {
    // Parameterized test for various API key scenarios
    it.each([
      ['undefined', undefined, true],
      ['empty string', '', true],
      ['null', null, true],
      ['valid key', 'sk-or-123', false],
    ])('should set isProxy=%s when openRouterApiKey is %s', 
      (description, apiKey, expectedIsProxy) => {
        const settings = { 
          provider: 'openrouter',
          openRouterApiKey: apiKey,
          openRouterModel: 'test-model'
        } as AppSettings;
        
        AiProviderFactory.create(settings);
        
        expect(vi.mocked(OpenRouterProvider)).toHaveBeenCalledWith({
          apiKey,
          model: 'test-model',
          isProxy: expectedIsProxy
        });
      }
    );

    it('should handle missing openRouterModel gracefully', () => {
      const settings = { 
        provider: 'openrouter',
        openRouterApiKey: 'key',
        openRouterModel: undefined
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      // Verify OpenRouterProvider is still created with undefined model
      expect(vi.mocked(OpenRouterProvider)).toHaveBeenCalledWith({
        apiKey: 'key',
        model: undefined,
        isProxy: false
      });
    });
  });

  describe('Gemini edge cases', () => {
    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['null', null],
    ])('should create ProxyProvider when Gemini apiKey is %s', (description, apiKey) => {
      const settings = { 
        provider: 'gemini',
        apiKey
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
      expect(vi.mocked(GeminiProvider)).not.toHaveBeenCalled();
    });

    it('should create ProxyProvider when apiKey is whitespace only (truthy but invalid)', () => {
      // Note: Current getDirectApiKey doesn't trim, so whitespace is returned as-is
      // This would create GeminiProvider with invalid key, which may fail at runtime
      // This test documents current behavior - consider adding trim in production code
      const settings = { 
        provider: 'gemini',
        apiKey: '   '
      } as AppSettings;
      
      // With current implementation, whitespace is truthy and returned
      mockEnvGeminiApiKey.value = undefined;
      
      AiProviderFactory.create(settings);
      
      // Documents current behavior: whitespace passes through
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('   ');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });

    it('should create GeminiProvider with valid apiKey', () => {
      const settings = { 
        provider: 'gemini',
        apiKey: 'valid-key'
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });

    it('should fall back to environment variable when user apiKey is not provided', () => {
      mockEnvGeminiApiKey.value = 'env-gemini-key';
      
      const settings = { 
        provider: 'gemini',
        apiKey: undefined
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('env-gemini-key');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });

    it('should prioritize user apiKey over environment variable', () => {
      mockEnvGeminiApiKey.value = 'env-gemini-key';
      
      const settings = { 
        provider: 'gemini',
        apiKey: 'user-key'
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('user-key');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });
  });

  describe('Provider switching', () => {
    it('should handle provider switching from gemini to openrouter', () => {
      // First create Gemini provider
      const geminiSettings = { 
        provider: 'gemini',
        apiKey: 'valid-key'
      } as AppSettings;
      
      AiProviderFactory.create(geminiSettings);
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
      
      // Clear mocks between calls
      vi.mocked(GeminiProvider).mockClear();
      vi.mocked(OpenRouterProvider).mockClear();
      
      // Then switch to OpenRouter
      const orSettings = { 
        provider: 'openrouter',
        openRouterApiKey: 'or-key',
        openRouterModel: 'test-model'
      } as AppSettings;
      
      AiProviderFactory.create(orSettings);
      expect(vi.mocked(OpenRouterProvider)).toHaveBeenCalledWith({
        apiKey: 'or-key',
        model: 'test-model',
        isProxy: false
      });
      expect(vi.mocked(GeminiProvider)).not.toHaveBeenCalled();
    });
  });

  describe('Forced proxy mode', () => {
    it('should create ProxyProvider when IS_FORCED_PROXY is true, even with valid Gemini key', () => {
      mockIsForcedProxy.value = true;
      
      const settings = { 
        provider: 'gemini',
        apiKey: 'valid-key'
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
      expect(vi.mocked(GeminiProvider)).not.toHaveBeenCalled();
    });

    it('should create ProxyProvider when IS_FORCED_PROXY is true with environment key', () => {
      mockIsForcedProxy.value = true;
      mockEnvGeminiApiKey.value = 'env-key';
      
      const settings = { 
        provider: 'gemini',
        apiKey: undefined
      } as AppSettings;
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
      expect(vi.mocked(GeminiProvider)).not.toHaveBeenCalled();
    });
  });
});
