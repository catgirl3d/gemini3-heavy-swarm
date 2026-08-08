import { GoogleGenAI } from '@google/genai';
import { BaseProvider } from './BaseProvider';
import { type ProviderCapabilities, type GenerateRequest, type ProviderStreamResult, type StreamChunk } from '@/types/ai-provider';
import { type AppSettings, ProviderType } from '@/types';
import { extractPartsFromChunk, extractUsageMetadataFromChunk, extractGroundingChunksFromChunk, extractTokenUsage, extractTextFromParts } from '@/services/swarm/steps/utils/streamUtils';

export class GeminiProvider extends BaseProvider {
  readonly name = ProviderType.Gemini;
  readonly capabilities: ProviderCapabilities = {
    search: true,
    vision: true,
    reasoning: true,
    codeExecution: true,
  };
  readonly isProxy = false;

  private client: GoogleGenAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenAI({ apiKey });
  }

  get models() {
    return {
      generateContentStream: async (request: GenerateRequest): Promise<ProviderStreamResult> => {
        // GoogleGenAI SDK returns AsyncGenerator directly, not wrapped
        const stream = await this.client.models.generateContentStream({
          model: request.model,
          contents: request.contents,
          config: request.config,
        });

        const normalizedStream = this.normalizeStream(stream);

        return {
          stream: normalizedStream,
          [Symbol.asyncIterator]() { return normalizedStream[Symbol.asyncIterator](); }
        };
      },
    };
  }



  getDefaultModel(settings: AppSettings): string {
    return settings.geminiModel;
  }

  private async *normalizeStream(stream: AsyncIterable<unknown>): AsyncIterable<StreamChunk> {
    for await (const chunk of stream) {
      yield this.normalizeChunk(chunk);
    }
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
