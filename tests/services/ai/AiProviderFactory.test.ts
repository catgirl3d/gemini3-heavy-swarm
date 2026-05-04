import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiProviderFactory } from '@/services/ai/AiProviderFactory';
import { AppSettings, ProviderType } from '@/types';

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
    if (userApiKey) return userApiKey;
    if (mockIsForcedProxy.value) return null;
    return mockEnvGeminiApiKey.value || null;
  }),
}));

vi.mock('@/constants', () => ({
  IS_FORCED_PROXY: false,
}));

// Import mocked modules after mocks are set up
import { GeminiProvider, ProxyProvider, OpenRouterProvider } from '@/services/ai/providers';

const createMockSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  provider: ProviderType.Gemini,
  numAgents: 3,
  model: 'gemini-1.5-flash',
  openRouterModel: 'openai/gpt-3.5-turbo',
  activeProfileId: 'default',
  profiles: [],
  devMode: false,
  debugMode: false,
  simulateInitialError: 'none',
  simulateRefinementError: 'none',
  simulateSynthesisError: 'none', // Error simulation for testing
  simulateInitialErrorAttempts: 0,
  simulateRefinementErrorAttempts: 0,
  simulateSynthesisErrorAttempts: 0,
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  useSearchInInitial: false,
  useSearchInRefinement: false,
  useSearchInSynthesis: false,
  temperature: 0.7,
  maxOutputTokens: 2048,
  dynamicAgentRoles: false,
  activeRoleProfileId: 'default',
  roleProfiles: [],
  savedInstructions: [],
  savedRoles: [],
  ...overrides,
});

describe('AiProviderFactory', () => {
  beforeEach(() => {
    // Reset mock flags
    mockIsForcedProxy.value = false;
    mockEnvGeminiApiKey.value = undefined;
     
    vi.mocked(GeminiProvider).mockClear();
    vi.mocked(ProxyProvider).mockClear();
    vi.mocked(OpenRouterProvider).mockClear();

    vi.mocked(GeminiProvider).mockImplementation(function (this: any, apiKey: any) {
      return {
      name: ProviderType.Gemini,
      isProxy: false,
      apiKey,
      } as any;
    } as any);
    vi.mocked(ProxyProvider).mockImplementation(function (this: any) {
      return {
      name: 'proxy',
      isProxy: true,
      } as any;
    } as any);
    vi.mocked(OpenRouterProvider).mockImplementation(function (this: any, config: any) {
      return {
      name: ProviderType.OpenRouter,
      isProxy: config.isProxy,
      config,
      } as any;
    } as any);
  });

  describe('Provider creation', () => {
    it('should create OpenRouterProvider when provider is openrouter', () => {
      const settings = createMockSettings({
        provider: ProviderType.OpenRouter,
        openRouterApiKey: 'or-key',
        openRouterModel: 'or-model'
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(OpenRouterProvider)).toHaveBeenCalledWith({
        apiKey: 'or-key',
        model: 'or-model',
        isProxy: false // Has API key, so not in proxy mode
      });
    });

    it('should create GeminiProvider when apiKey is valid', () => {
      const settings = createMockSettings({
          provider: ProviderType.Gemini,
          apiKey: 'valid-key'
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
    });

    it('should create ProxyProvider when no apiKey is valid', () => {
      const settings = createMockSettings({
          provider: ProviderType.Gemini,
          apiKey: ''
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
    });
  });

  describe('getProviderName', () => {
    it('should return correct provider name using getProviderName', () => {
      expect(AiProviderFactory.getProviderName(createMockSettings({ provider: ProviderType.OpenRouter }))).toBe(ProviderType.OpenRouter);
      expect(AiProviderFactory.getProviderName(createMockSettings({ provider: ProviderType.Gemini, apiKey: 'valid-key' }))).toBe(ProviderType.Gemini);
      expect(AiProviderFactory.getProviderName(createMockSettings({ provider: ProviderType.Gemini, apiKey: '' }))).toBe('proxy');
    });

    it('returns gemini when the direct API key comes from the environment fallback', () => {
      mockEnvGeminiApiKey.value = 'env-gemini-key';

      expect(AiProviderFactory.getProviderName(createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: undefined,
      }))).toBe(ProviderType.Gemini);
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
        const settings = createMockSettings({
          provider: ProviderType.OpenRouter,
          openRouterApiKey: apiKey,
          openRouterModel: 'test-model'
        });
        
        AiProviderFactory.create(settings);
        
        expect(vi.mocked(OpenRouterProvider)).toHaveBeenCalledWith({
          apiKey,
          model: 'test-model',
          isProxy: expectedIsProxy
        });
      }
    );

    it('should handle missing openRouterModel gracefully', () => {
      const settings = createMockSettings({
        provider: ProviderType.OpenRouter,
        openRouterApiKey: 'key',
        openRouterModel: undefined as any // Force undefined for test
      });
      
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
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
      expect(vi.mocked(GeminiProvider)).not.toHaveBeenCalled();
    });

    it('should create ProxyProvider when apiKey is whitespace only (truthy but invalid)', () => {
      // Note: Current getDirectApiKey doesn't trim, so whitespace is returned as-is
      // This would create GeminiProvider with invalid key, which may fail at runtime
      // This test documents current behavior - consider adding trim in production code
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: '   '
      });
      
      // With current implementation, whitespace is truthy and returned
      mockEnvGeminiApiKey.value = undefined;
      
      AiProviderFactory.create(settings);
      
      // Documents current behavior: whitespace passes through
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('   ');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });

    it('should create GeminiProvider with valid apiKey', () => {
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: 'valid-key'
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });

    it('should fall back to environment variable when user apiKey is not provided', () => {
      const originalEnvKey = process.env.GEMINI_API_KEY;
      mockEnvGeminiApiKey.value = 'env-gemini-key';
      process.env.GEMINI_API_KEY = 'env-gemini-key';
      
      try {
        const settings = createMockSettings({
          provider: ProviderType.Gemini,
          apiKey: undefined
        });
        
        AiProviderFactory.create(settings);
        
        expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('env-gemini-key');
        expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
      } finally {
        if (originalEnvKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalEnvKey;
        }
      }
    });

    it('should prioritize user apiKey over environment variable', () => {
      mockEnvGeminiApiKey.value = 'env-gemini-key';
      
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: 'user-key'
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('user-key');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });
  });

  describe('Provider switching', () => {
    it('should handle provider switching from gemini to openrouter', () => {
      // First create Gemini provider
      const geminiSettings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: 'valid-key'
      });
      
      AiProviderFactory.create(geminiSettings);
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
      
      // Clear mocks between calls
      vi.mocked(GeminiProvider).mockClear();
      vi.mocked(OpenRouterProvider).mockClear();
      
      // Then switch to OpenRouter
      const orSettings = createMockSettings({
        provider: ProviderType.OpenRouter,
        openRouterApiKey: 'or-key',
        openRouterModel: 'test-model'
      });
      
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
    it('should prioritize user apiKey over IS_FORCED_PROXY', () => {
      mockIsForcedProxy.value = true;
      
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: 'valid-key'
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(GeminiProvider)).toHaveBeenCalledWith('valid-key');
      expect(vi.mocked(ProxyProvider)).not.toHaveBeenCalled();
    });

    it('should create ProxyProvider when IS_FORCED_PROXY is true with environment key', () => {
      mockIsForcedProxy.value = true;
      mockEnvGeminiApiKey.value = 'env-key';
      
      const settings = createMockSettings({
        provider: ProviderType.Gemini,
        apiKey: undefined
      });
      
      AiProviderFactory.create(settings);
      
      expect(vi.mocked(ProxyProvider)).toHaveBeenCalled();
      expect(vi.mocked(GeminiProvider)).not.toHaveBeenCalled();
    });
  });

  describe('validation failures', () => {
    it('throws when proxy mode is used without fetch in the runtime', () => {
      const originalFetch = globalThis.fetch;
      Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true });

      try {
        expect(() => AiProviderFactory.create(createMockSettings({
          provider: ProviderType.Gemini,
          apiKey: '',
        }))).toThrow('Proxy mode requires a browser environment with fetch API. Provider: proxy');
      } finally {
        Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true });
      }
    });

    it('throws when an OpenRouter provider reports direct mode without an API key', () => {
      vi.mocked(OpenRouterProvider).mockImplementation(function () {
        return {
        name: ProviderType.OpenRouter,
        isProxy: false,
        } as any;
      } as any);

      expect(() => AiProviderFactory.create(createMockSettings({
        provider: ProviderType.OpenRouter,
        openRouterApiKey: '',
        openRouterModel: 'or-model',
      }))).toThrow('OpenRouter direct mode requires an API key. Please provide openRouterApiKey in settings or use proxy mode.');
    });

    it('throws when a Gemini provider reports direct mode but no settings/env API key is available', () => {
      const originalEnvKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      mockEnvGeminiApiKey.value = 'env-direct-key';

      try {
        expect(() => AiProviderFactory.create(createMockSettings({
          provider: ProviderType.Gemini,
          apiKey: '',
        }))).toThrow('Gemini direct mode requires an API key. Please provide apiKey in settings or set GEMINI_API_KEY environment variable.');
      } finally {
        if (originalEnvKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = originalEnvKey;
        }
      }
    });
  });
});
