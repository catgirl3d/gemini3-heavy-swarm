import { GenerationConfig, Content } from '@google/genai';
import { API_SECRET } from '@/constants';
import { Logger } from '@shared/utils/logger';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

const logger = new Logger('ProxyGenAI');

const STREAM_READ_TIMEOUT_MS = 60000; // 60 seconds (increased for reasoning models and slow responses)

// Minimal interface matching what the steps use from the Google SDK
export class ProxyGenAI {
  constructor() {}

  getGenerativeModel(config: { model: string; generationConfig?: GenerationConfig }) {
    return new ProxyGenerativeModel(config.model, config.generationConfig);
  }

  // Add models property to match GoogleGenAI interface used by steps
  get models() {
    return {
      generateContentStream: async (request: { model?: string; config?: any; contents: Content[] }) => {
        // Use the requested model, or fallback to flash-lite
        // The server will enforce restrictions if GEMINI_PROXY_MODE is 'demo'
        const modelName = request.model || 'gemini-2.5-flash-lite';
        
        // Separate generationConfig from top-level fields like systemInstruction and tools
        const { systemInstruction, tools, ...genConfig } = request.config || {};
        
        // Ensure systemInstruction is in the correct format for the REST API
        // The SDK might accept a string, but the REST API expects a Content object
        let formattedSystemInstruction = systemInstruction;
        if (typeof systemInstruction === 'string') {
            formattedSystemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const proxyModel = new ProxyGenerativeModel(modelName, genConfig, formattedSystemInstruction, tools);
        return proxyModel.generateContentStream(request);
      }
    };
  }
}

class ProxyGenerativeModel {
  constructor(
    private model: string,
    private generationConfig?: GenerationConfig,
    private systemInstruction?: unknown,
    private tools?: unknown[]
  ) {}

  async generateContentStream(request: { contents: Content[] }) {
    let response: Response;
    try {
      response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': API_SECRET,
        },
        body: (() => {
          const payload = {
            model: this.model,
            contents: request.contents,
            generationConfig: this.generationConfig,
            systemInstruction: this.systemInstruction,
            tools: this.tools
          };
          // Stringify for better visibility in logs (prevents object collapsing)
          logger.info('Gemini SDK Request Payload:', JSON.stringify(payload, null, 2));
          return JSON.stringify(payload);
        })()
      });
    } catch (fetchError: any) {
      if (fetchError instanceof AppError) throw fetchError;
      throw new AppError(`Network or connection error: ${fetchError.message}`, ErrorCode.NETWORK_ERROR, fetchError);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      // Use centralized error classification
      throw AppError.from(new Error(`Proxy error (${response.status}): ${errorText}`), response.status);
    }

    if (!response.body) {
      throw new AppError('No response body from proxy', ErrorCode.PROXY_ERROR);
    }

    const decoder = new TextDecoderStream();
    const stream = response.body.pipeThrough(decoder).getReader();

    const resultStream = (async function* () {
      let buffer = '';
      const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB safety limit
      
      try {
        while (true) {
          // Add timeout to prevent hanging if the server stops sending data but keeps connection open
          const readPromise = stream.read();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new AppError('Stream read timeout', ErrorCode.NETWORK_ERROR)), STREAM_READ_TIMEOUT_MS)
          );

          const { done, value } = await Promise.race([readPromise, timeoutPromise]);
          if (done) break;

          buffer += value;
          
          if (buffer.length > MAX_BUFFER_SIZE) {
            logger.error('Stream buffer size exceeded limit');
            throw new AppError('Response stream buffer overflow', ErrorCode.PROXY_ERROR);
          }

          // Gemini streaming REST API returns a JSON array that is progressively filled:
          // [
          //   {...},
          //   {...}
          // ]
          // Individual chunks might contain ",", "[", "]" or parts of objects.
          
          while (true) {
            const openBraceIndex = buffer.indexOf('{');
            if (openBraceIndex === -1) break;

            let braceCount = 0;
            let found = false;
            let inString = false;
            let escaped = false;

            for (let i = openBraceIndex; i < buffer.length; i++) {
              const char = buffer[i];
              
              if (escaped) {
                escaped = false;
                continue;
              }
              if (char === '\\') {
                escaped = true;
                continue;
              }
              if (char === '"') {
                inString = !inString;
                continue;
              }
              
              if (!inString) {
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;

                if (braceCount === 0) {
                  const potentialJson = buffer.substring(openBraceIndex, i + 1);
                  try {
                    const parsed = JSON.parse(potentialJson);
                    yield {
                      text: () => {
                        try {
                          if (parsed.candidates?.[0]?.content?.parts) {
                            return parsed.candidates[0].content.parts.map((p: any) => p.text || '').join('');
                          }
                        } catch (e) {
                          logger.warn('Error extracting text from chunk:', e);
                        }
                        return '';
                      },
                      candidates: parsed.candidates,
                      usageMetadata: parsed.usageMetadata
                    };
                    buffer = buffer.substring(i + 1);
                    found = true;
                    break;
                  } catch (e) {
                    // If JSON.parse fails despite balanced braces, it might be an invalid fragment or nested structure not handled by simple counting
                    // We let it continue to see if more data fixes it
                  }
                }
              }
            }
            if (!found) break;
          }
        }
      } catch (error) {
        logger.error('Stream processing error:', error);
        throw error;
      }
    })();

    return {
      stream: resultStream,
      [Symbol.asyncIterator]: function() { return resultStream; }
    };
  }
}
