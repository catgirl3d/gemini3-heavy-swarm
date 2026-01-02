import { AiProvider } from '@/types/ai-provider';
import { AppSettings } from '@/types';
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

    if (settings.provider === 'openrouter') {
      return new OpenRouterProvider({
        apiKey: settings.openRouterApiKey,
        model: settings.openRouterModel,
        isProxy: !settings.openRouterApiKey,
      });
    }

    // Default: Gemini provider
    const apiKey = getDirectApiKey(settings.apiKey);
    if (apiKey) {
      logger.debug('Using direct Gemini API');
      return new GeminiProvider(apiKey);
    }

    logger.debug('Using Proxy for Gemini');
    return new ProxyProvider();
  }

  /**
   * Returns provider name without creating an instance.
   * Useful for logging and UI display.
   */
  static getProviderName(settings: AppSettings): string {
    if (settings.provider === 'openrouter') return 'openrouter';
    const apiKey = getDirectApiKey(settings.apiKey);
    return apiKey ? 'gemini' : 'proxy';
  }
}
