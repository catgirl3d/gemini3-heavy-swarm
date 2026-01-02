import { AiProvider, ProviderCapabilities, GenerateRequest, ProviderStreamResult } from '@/types/ai-provider';
import { AppSettings } from '@/types';

/**
 * Abstract base class for AI providers.
 * Provides common functionality and enforces interface contract.
 */
export abstract class BaseProvider implements AiProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  /**
   * Default implementation - returns settings unchanged.
   * Override in providers that need to modify settings.
   */
  getEffectiveSettings(settings: AppSettings): AppSettings {
    return settings;
  }

  abstract get models(): {
    generateContentStream(request: GenerateRequest): Promise<ProviderStreamResult>;
  };

  abstract getDefaultModel(settings: AppSettings): string;

  /**
   * Helper to check if a feature is supported.
   */
  protected supportsFeature(feature: keyof ProviderCapabilities): boolean {
    return this.capabilities[feature];
  }
}
