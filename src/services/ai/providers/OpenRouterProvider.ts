import { BaseProvider } from './BaseProvider';
import { type ProviderCapabilities, type GenerateRequest, type ProviderStreamResult, type StreamChunk } from '@/types/ai-provider';
import { type AppSettings, ProviderType } from '@/types';
import { OpenRouterGenAI } from '@/services/openrouter/OpenRouterGenAI';
import {
  extractGroundingChunksFromChunk,
  extractPartsFromChunk,
  extractTextFromParts,
  extractTokenUsage,
  extractUsageMetadataFromChunk,
} from '@/services/swarm/steps/utils/streamUtils';

export class OpenRouterProvider extends BaseProvider {
  readonly name = ProviderType.OpenRouter;
  readonly capabilities: ProviderCapabilities = {
    search: false,  // OpenRouter doesn't support Google Search grounding
    vision: false,  // Text-only for now
    reasoning: true,
    codeExecution: false,
  };
  readonly isProxy: boolean;

  private client: OpenRouterGenAI;

  constructor(options: { apiKey?: string; model: string; isProxy?: boolean }) {
    super();
    this.isProxy = options.isProxy ?? false;
    this.client = new OpenRouterGenAI(options);
  }

  /**
   * Override: Disable search flags for OpenRouter.
   * This moves provider-specific logic INTO the provider.
   */
  getEffectiveSettings(settings: AppSettings): AppSettings {
    return {
      ...settings,
      useSearchInInitial: false,
      useSearchInRefinement: false,
      useSearchInSynthesis: false,
    };
  }

  get models() {
    return {
      generateContentStream: async (request: GenerateRequest): Promise<ProviderStreamResult> => {
        const stream = await this.client.models.generateContentStream({
          model: request.model,
          contents: request.contents,
          config: request.config,
        });

        const normalizedStream = this.normalizeStream(stream.stream);

        return {
          stream: normalizedStream,
          [Symbol.asyncIterator]() { return normalizedStream[Symbol.asyncIterator](); }
        };
      }
    };
  }

  getDefaultModel(settings: AppSettings): string {
    return settings.openRouterModel;
  }

  private async *normalizeStream(stream: AsyncIterable<unknown>): AsyncIterable<StreamChunk> {
    // OpenRouterGenAI already yields chunks that match our normalized structure,
    // but we remap them here to keep the provider contract consistent.
    for await (const chunk of stream) {
      yield this.normalizeChunk(chunk);
    }
  }

  private normalizeChunk(chunk: unknown): StreamChunk {
    const parts = extractPartsFromChunk(chunk);
    const usageMetadata = extractUsageMetadataFromChunk(chunk);
    const groundingChunks = extractGroundingChunksFromChunk(chunk);
    const { text, thought } = extractTextFromParts(parts);

    return {
        text,
        thought,
        usage: extractTokenUsage(usageMetadata),
        groundingChunks,
        raw: chunk,
    };
  }
}
