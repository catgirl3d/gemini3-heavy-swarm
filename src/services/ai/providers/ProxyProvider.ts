import { ProxyGenAI } from '@/services/proxy/ProxyGenAI';
import { BaseProvider } from './BaseProvider';
import { type ProviderCapabilities, type GenerateRequest, type ProviderStreamResult, type StreamChunk } from '@/types/ai-provider';
import { type AppSettings } from '@/types';
import { extractPartsFromChunk, extractUsageMetadataFromChunk, extractGroundingChunksFromChunk, extractTokenUsage, extractTextFromParts } from '@/services/swarm/steps/utils/streamUtils';

export class ProxyProvider extends BaseProvider {
  readonly name = 'proxy';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    vision: true,
    reasoning: true,
    codeExecution: true,
  };
  readonly isProxy = true;

  private client: ProxyGenAI;

  constructor() {
    super();
    this.client = new ProxyGenAI();
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
