import { BaseProvider } from './BaseProvider';
import { type ProviderCapabilities, type GenerateRequest, type ProviderStreamResult, type StreamChunk } from '@/types/ai-provider';
import { type AppSettings, type TokenUsage, ProviderType } from '@/types';
import { OpenRouterGenAI } from '@/services/openrouter/OpenRouterGenAI';
import {
  extractPartsFromChunk,
  extractTextFromParts,
} from '@/services/swarm/steps/utils/streamUtils';

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const hasTextFunction = (chunk: unknown): chunk is { text: () => string } => {
  return isObjectRecord(chunk) && typeof chunk.text === 'function';
};

const hasThoughtString = (chunk: unknown): chunk is { thought: string } => {
  return isObjectRecord(chunk) && typeof chunk.thought === 'string';
};

const getUsageMetadata = (chunk: unknown): Record<string, unknown> | null | undefined => {
  if (!isObjectRecord(chunk) || !('usageMetadata' in chunk)) return undefined;
  if (chunk.usageMetadata === null) return null;
  return isObjectRecord(chunk.usageMetadata) ? chunk.usageMetadata : undefined;
};

const getGroundingChunks = (chunk: unknown): StreamChunk['groundingChunks'] => {
  if (!isObjectRecord(chunk) || !Array.isArray(chunk.groundingChunks)) return undefined;
  return chunk.groundingChunks as StreamChunk['groundingChunks'];
};

const getNumericValue = (value: unknown): number | undefined => {
  return typeof value === 'number' ? value : undefined;
};

const normalizeUsage = (metadata: Record<string, unknown> | null | undefined): TokenUsage | null => {
  if (!metadata) return null;

  const isEstimated = typeof metadata.isEstimated === 'boolean'
    ? metadata.isEstimated
    : undefined;

  return {
    promptTokens: getNumericValue(metadata.promptTokenCount) ?? 0,
    candidatesTokens: getNumericValue(metadata.candidatesTokenCount) ?? 0,
    totalTokens: getNumericValue(metadata.totalTokenCount) ?? 0,
    thoughtsTokenCount: getNumericValue(metadata.thoughtsTokenCount),
    cachedContentTokenCount: getNumericValue(metadata.cachedContentTokenCount),
    toolUsePromptTokenCount: getNumericValue(metadata.toolUsePromptTokenCount),
    isEstimated,
  };
};

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
    const extractedContent = extractTextFromParts(parts) ?? { text: '', thought: '' };
    const topLevelText = hasTextFunction(chunk) ? chunk.text() : '';
    const topLevelThought = hasThoughtString(chunk) ? chunk.thought : '';
    const text = topLevelText || extractedContent.text;
    const thought = topLevelThought || extractedContent.thought;
    const usageMetadata = getUsageMetadata(chunk);
    const groundingChunks = getGroundingChunks(chunk);

    return {
        text,
        thought,
        usage: normalizeUsage(usageMetadata),
        groundingChunks,
        raw: chunk,
    };
  }
}
