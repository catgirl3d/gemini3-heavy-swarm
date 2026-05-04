import { type Content } from '@google/genai';
import { API_SECRET } from '@/constants';
import { Logger } from '@shared/utils/logger';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

const logger = new Logger('OpenRouterGenAI');

const DEFAULT_STREAM_READ_TIMEOUT_MS = 60000; // 60 seconds default for OpenRouter (increased for reasoning models)

// Lazy-load tokenizer once per module to avoid repeated dynamic import overhead during streaming
let encodeTokenizer: ((text: string) => number[]) | null = null;
let encodeTokenizerReady: Promise<void> | null = null;

const getEncodeTokenizer = async (): Promise<((text: string) => number[]) | null> => {
  if (encodeTokenizer) return encodeTokenizer;

  if (!encodeTokenizerReady) {
    encodeTokenizerReady = import('gpt-tokenizer')
      .then(({ encode }) => {
        encodeTokenizer = encode;
      })
      .catch(error => {
        // If loading fails, reset so future calls can retry and fall back
        encodeTokenizer = null;
        encodeTokenizerReady = null;
        logger.warn('Failed to load gpt-tokenizer, falling back to heuristic token estimation.', { error });
      });
  }

  await encodeTokenizerReady;
  return encodeTokenizer;
};

export interface OpenRouterOptions {
  apiKey?: string;
  model: string;
  isProxy?: boolean;
  timeout?: number;
}

export class OpenRouterGenAI {
  constructor(private options: OpenRouterOptions) {}

  get models() {
    return {
      generateContentStream: async (request: { model?: string; config?: any; contents: Content[] }) => {
        const modelName = request.model || this.options.model;
        const { temperature, maxOutputTokens, systemInstruction } = request.config || {};

        // Validate request.contents to prevent runtime errors
        if (!request.contents || !Array.isArray(request.contents)) {
          throw new AppError('Invalid request: contents must be a non-empty array', ErrorCode.INVALID_SETTINGS);
        }

        if (request.contents.length === 0) {
          throw new AppError('Invalid request: contents array cannot be empty', ErrorCode.INVALID_SETTINGS);
        }

        // Map Google contents to OpenAI messages with safe part access
        const messages = request.contents.map(content => {
          if (!content.parts || !Array.isArray(content.parts)) {
            throw new AppError('Invalid content: parts must be an array', ErrorCode.INVALID_SETTINGS);
          }
          
          return {
            role: content.role === 'model' ? 'assistant' : 'user',
            content: content.parts.map(p => p.text || '').join('')
          };
        });

        // Add system instruction if present
        if (systemInstruction) {
          const systemContent = typeof systemInstruction === 'string'
            ? systemInstruction
            : (systemInstruction.parts?.map((p: any) => p.text || '').join('') || '');
          
          if (systemContent) {
            messages.unshift({
              role: 'system',
              content: systemContent
            });
          }
        }

        const payload = {
          model: modelName,
          messages,
          stream: true,
          temperature: temperature,
          max_tokens: maxOutputTokens
        };

        // Log request payload for debugging (only visible in debug mode)
        logger.debug('OpenRouter Request Payload:', JSON.stringify(payload, null, 2));

        let response: Response;
        try {
          if (this.options.isProxy) {
            response = await fetch('/api/openrouter', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Secret': API_SECRET,
              },
              body: JSON.stringify(payload)
            });
          } else {
            response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.options.apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Gemini Swarm'
              },
              body: JSON.stringify(payload)
            });
          }
        } catch (fetchError: any) {
          throw new AppError(`Network or connection error: ${fetchError.message}`, ErrorCode.NETWORK_ERROR, fetchError);
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw AppError.from(new Error(`OpenRouter error (${response.status}): ${errorText}`), response.status);
        }

        if (!response.body) {
          throw new AppError('No response body from OpenRouter', ErrorCode.PROXY_ERROR);
        }

        const decoder = new TextDecoderStream();
        const stream = response.body.pipeThrough(decoder).getReader();
        
        /**
         * RATIONALE FOR CUSTOM TOKEN COUNTING:
         * Unlike the Google Gemini API, OpenRouter (and OpenAI-compatible APIs in general) typically
         * sends token usage metadata (prompt_tokens, completion_tokens, and reasoning_tokens) ONLY 
         * in the final chunk of the stream (often when finish_reason is present).
         * 
         * To provide a responsive UI where the token counter updates in real-time as the model 
         * streams its response or thought process, we calculate approximate/precise token counts 
         * on the client-side during the streaming process. 
         * 
         * We use the 'gpt-tokenizer' (cl100k_base) which is the standard for GPT, Claude, 
         * and many other modern models supported by OpenRouter. This gives us near-perfect 
         * accuracy while streaming.
         * 
         * The estimated values are used for live UI updates and are ultimately overwritten 
         * by the official 'usage' data from the API's final chunk to ensure 100% accuracy 
         * once the generation is complete.
         */
        const estimateTokens = async (textOrCharCount: string | number): Promise<number> => {
          if (typeof textOrCharCount === 'number') {
            // If we only have char count (fallback), use a safe heuristic
            return Math.ceil(textOrCharCount / 3.5);
          }

          try {
            const encode = await getEncodeTokenizer();
            if (!encode) {
              // Tokenizer failed to initialize, fall back to heuristic
              return Math.ceil(textOrCharCount.length / 3.5);
            }

            return encode(textOrCharCount).length;
          } catch (e) {
            // Fallback if tokenizer fails at runtime
            return Math.ceil(textOrCharCount.length / 3.5);
          }
        };

        // Estimate prompt tokens from initial messages (system already included via unshift)
        const estimatePromptTokens = async (): Promise<number> => {
          let totalContent = '';
          
          // Count all messages (includes system instruction added via unshift)
          for (const msg of messages) {
            totalContent += `${msg.role}: ${msg.content}\n`;
          }
          
          // Add 5% overhead for chat template and special tokens
          const baseCount = await estimateTokens(totalContent);
          return Math.ceil(baseCount * 1.05);
        };

        const timeoutMs = this.options.timeout || DEFAULT_STREAM_READ_TIMEOUT_MS;

        const resultStream = (async function* () {
          let buffer = '';
          
          // Initialize with estimated prompt tokens
          const estimatedPromptTokens = await estimatePromptTokens();
          let accumulatedContent = '';
          let accumulatedReasoning = '';
          
          let lastUsage: any = {
            promptTokenCount: estimatedPromptTokens,
            candidatesTokenCount: 0,
            totalTokenCount: estimatedPromptTokens,
            isEstimated: true
          };
          
          let hasYieldedContent = false;
          
          try {
            while (true) {
              const readPromise = stream.read();
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new AppError('Stream read timeout', ErrorCode.NETWORK_ERROR)), timeoutMs)
              );

              const { done, value } = await Promise.race([readPromise, timeoutPromise]);
              if (done) break;

              buffer += value;
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                
                const data = trimmedLine.substring(6);
                if (data === '[DONE]') break;

                try {
                  const parsed = JSON.parse(data);
                  
                  // If real usage data arrives, use it (overrides estimates)
                  if (parsed.usage) {
                    logger.debug('Received raw usage from OpenRouter:', parsed.usage);
                    lastUsage = {
                      promptTokenCount: parsed.usage.prompt_tokens || 0,
                      candidatesTokenCount: parsed.usage.completion_tokens || 0,
                      totalTokenCount: parsed.usage.total_tokens || 0,
                      thoughtsTokenCount: parsed.usage.reasoning_tokens || undefined,
                      isEstimated: false
                    };
                  }
                  
                  // Capture reasoning/thinking tokens
                  const reasoning = parsed.choices?.[0]?.delta?.reasoning || '';
                  if (reasoning) {
                    accumulatedReasoning += reasoning;
                    if (!parsed.usage) {
                      // Accurate token count for reasoning
                      lastUsage.thoughtsTokenCount = await estimateTokens(accumulatedReasoning);
                      lastUsage.isEstimated = true;
                    }
                  }
                  
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content || reasoning) {
                    hasYieldedContent = true;
                    
                    if (content) {
                      accumulatedContent += content;
                      // Only update estimates if we don't have real usage yet
                      if (!parsed.usage) {
                        const candidateTokens = await estimateTokens(accumulatedContent);
                        const reasoningTokens = await estimateTokens(accumulatedReasoning);
                        lastUsage.candidatesTokenCount = candidateTokens;
                        lastUsage.totalTokenCount = estimatedPromptTokens + candidateTokens + reasoningTokens;
                        lastUsage.isEstimated = true;
                      }
                    }
                    
                    // Build parts array matching Gemini format
                    const parts: Array<{ text: string; thought?: boolean }> = [];
                    
                    // Add reasoning as thought part
                    if (reasoning) {
                      parts.push({ text: reasoning, thought: true });
                    }
                    
                    // Add regular content
                    if (content) {
                      parts.push({ text: content });
                    }
                    
                    yield {
                      text: () => content,
                      candidates: [{
                        content: {
                          parts
                        }
                      }],
                      usageMetadata: lastUsage
                    } as any;
                  }
                } catch (e) {
                  logger.warn('Error parsing SSE chunk:', { error: e, data });
                }
              }
            }
            
            // Always yield final usage metadata if we have it
            if (lastUsage) {
              yield {
                text: () => '',
                candidates: [{
                  content: {
                    parts: [{ text: '' }]
                  }
                }],
                usageMetadata: lastUsage
              } as any;
            }
          } catch (error) {
            logger.error('OpenRouter stream processing error:', error);
            throw error;
          }
        })();

        return {
          stream: resultStream,
          [Symbol.asyncIterator]: function() { return resultStream; }
        };
      }
    };
  }
}
