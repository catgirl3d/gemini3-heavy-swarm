import { BaseProvider } from './BaseProvider';
import { ProviderCapabilities, GenerateRequest, ProviderStreamResult, StreamChunk } from '@/types/ai-provider';
import { AppSettings, TokenUsage, ProviderType } from '@/types';
import { OpenRouterGenAI } from '@/services/openrouter/OpenRouterGenAI';

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
    const self = this;
    return {
      async generateContentStream(request: GenerateRequest): Promise<ProviderStreamResult> {
        const stream = await self.client.models.generateContentStream({
          model: request.model,
          contents: request.contents,
          config: request.config,
        });

        const normalizedStream = (async function* () {
          // OpenRouterGenAI already yields chunks that match our normalized structure
          // but we map it just to be sure and consistent with interface
          for await (const chunk of stream.stream) {
             yield self.normalizeChunk(chunk);
          }
        })();

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

  private normalizeChunk(chunk: any): StreamChunk {
    // OpenRouterGenAI.ts already normalize chunks to have candidates and usageMetadata
    // and even provides a text() helper which extracts text from candidates[0].content.parts
    
    // We can use the same extraction logic as Gemini or rely on OpenRouterGenAI's normalization
    // Since OpenRouterGenAI already did the heavy lifting, we just map it to our StreamChunk type.
    
    let text = '';
    if (typeof chunk.text === 'function') {
        text = chunk.text();
    }

    const thought = typeof chunk.thought === 'string'
      ? chunk.thought
      : chunk.candidates?.[0]?.content?.parts
          ?.filter((part: any) => part?.thought && typeof part.text === 'string')
          .map((part: any) => part.text)
          .join('') || '';
    
    // In OpenRouterGenAI, thoughts are extracted into candidates[0].content.parts[i].text where part.thought is true
    // If OpenRouterGenAI followed Gemini pattern, we can use extractTextFromParts
    
    return {
        text: text,
        thought,
        usage: this.extractUsage(chunk.usageMetadata),
        groundingChunks: chunk.groundingChunks,
        raw: chunk
    };
  }

  private extractUsage(metadata: any): TokenUsage | null {
    if (!metadata) return null;
    return {
      promptTokens: metadata.promptTokenCount || 0,
      candidatesTokens: metadata.candidatesTokenCount || 0,
      totalTokens: metadata.totalTokenCount || 0,
      thoughtsTokenCount: metadata.thoughtsTokenCount,
      cachedContentTokenCount: metadata.cachedContentTokenCount,
      toolUsePromptTokenCount: metadata.toolUsePromptTokenCount,
      isEstimated: metadata.isEstimated
    };
  }
}
