import { GoogleGenAI } from '@google/genai';
import { BaseProvider } from './BaseProvider';
import { ProviderCapabilities, GenerateRequest, ProviderStreamResult, StreamChunk } from '@/types/ai-provider';
import { AppSettings, TokenUsage } from '@/types';
import { extractPartsFromChunk, extractUsageMetadataFromChunk, extractGroundingChunksFromChunk, extractTokenUsage, extractTextFromParts } from '@/services/swarm/steps/utils/streamUtils';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    vision: true,
    reasoning: true,
    codeExecution: true,
  };

  private client: GoogleGenAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenAI({ apiKey });
  }

  get models() {
    const self = this;
    return {
      async generateContentStream(request: GenerateRequest): Promise<ProviderStreamResult> {
        // GoogleGenAI SDK returns AsyncGenerator directly, not wrapped
        const stream = await self.client.models.generateContentStream({
          model: request.model,
          contents: request.contents,
          config: request.config,
        });

        const normalizedStream = (async function* () {
          // stream is already an AsyncGenerator, iterate directly
          for await (const chunk of stream) {
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
    return settings.model;
  }

  private normalizeChunk(rawChunk: unknown): StreamChunk {
    const parts = extractPartsFromChunk(rawChunk);
    const usageMetadata = extractUsageMetadataFromChunk(rawChunk);
    const groundingChunks = extractGroundingChunksFromChunk(rawChunk);

    const { text, thought } = extractTextFromParts(parts);
    const usage = extractTokenUsage(usageMetadata);

    return { text, thought, usage, groundingChunks, raw: rawChunk };
  }
}
