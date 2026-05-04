import { type AiProvider } from '@/types/ai-provider';
import { type AppSettings, ProviderType } from '@/types';
import { GeminiProvider, ProxyProvider, OpenRouterProvider } from './providers';
import { getDirectApiKey } from '@/services/proxy/proxyUtils';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('AiProviderFactory');

/**
 * Factory for creating AI providers based on settings.
 * Centralizes provider instantiation logic that was previously in GeminiService.
 */
export class AiProviderFactory {
  /**
   * Creates the appropriate provider based on user settings.
   * @throws Error if no valid configuration is found
   */
  static create(settings: AppSettings): AiProvider {
    logger.debug('Creating provider', { provider: settings.provider });

    let provider: AiProvider;

    if (settings.provider === ProviderType.OpenRouter) {
      provider = new OpenRouterProvider({
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
        isProxy: !settings.openRouterApiKey,
      });
    } else {
      // Default: Gemini provider
      const apiKey = getDirectApiKey(settings.apiKey);
      if (apiKey) {
        logger.debug('Using direct Gemini API');
        provider = new GeminiProvider(apiKey);
      } else {
        logger.debug('Using Proxy for Gemini');
        provider = new ProxyProvider();
      }
    }

    // Runtime validation: ensure proxy providers are properly configured
    this.validateProviderConfiguration(provider, settings);

    return provider;
  }

  /**
   * Validates that the provider is properly configured.
   * - If isProxy=true: ensures proxy endpoint is available
   * - If isProxy=false: ensures required API keys are present
   * @throws Error if configuration is invalid
   */
  private static validateProviderConfiguration(provider: AiProvider, settings: AppSettings): void {
    if (provider.isProxy) {
      // For proxy mode, the endpoint is hardcoded to /api/* in ProxyGenAI and OpenRouterGenAI
      // We just need to ensure we're in a browser environment where fetch is available
      if (typeof fetch === 'undefined') {
        throw new Error(
          `Proxy mode requires a browser environment with fetch API. Provider: ${provider.name}`
        );
      }
      logger.debug(`Proxy provider validated: ${provider.name}`);
    } else {
      // For direct mode, validate API keys are present
      if (provider.name === ProviderType.OpenRouter && !settings.openRouterApiKey) {
        throw new Error(
          'OpenRouter direct mode requires an API key. Please provide openRouterApiKey in settings or use proxy mode.'
        );
      }
      if (provider.name === ProviderType.Gemini && !settings.apiKey && !process.env.GEMINI_API_KEY) {
        throw new Error(
          'Gemini direct mode requires an API key. Please provide apiKey in settings or set GEMINI_API_KEY environment variable.'
        );
      }
      logger.debug(`Direct provider validated: ${provider.name}`);
    }
  }


  /**
   * Returns provider name without creating an instance.
   * Useful for logging and UI display.
   */
  static getProviderName(settings: AppSettings): string {
    if (settings.provider === ProviderType.OpenRouter) return ProviderType.OpenRouter;
    const apiKey = getDirectApiKey(settings.apiKey);
    return apiKey ? ProviderType.Gemini : 'proxy';
  }
}
