import { GenerationConfig, Content } from '@google/genai';

// Minimal interface matching what the steps use from the Google SDK
export class ProxyGenAI {
  constructor() {}

  getGenerativeModel(config: { model: string; generationConfig?: GenerationConfig }) {
    return new ProxyGenerativeModel(config.model, config.generationConfig);
  }

  // Add models property to match GoogleGenAI interface used by steps
  get models() {
    return {
      generateContentStream: async (request: any) => {
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
    private systemInstruction?: any,
    private tools?: any[]
  ) {}

  async generateContentStream(request: { contents: Content[] }) {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        contents: request.contents,
        generationConfig: this.generationConfig,
        systemInstruction: this.systemInstruction,
        tools: this.tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from proxy');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = (async function* () {
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done && buffer.length === 0) break;

        if (value) {
            buffer += decoder.decode(value, { stream: true });
        }

        // Process buffer for complete JSON objects
        while (true) {
            const openBraceIndex = buffer.indexOf('{');
            if (openBraceIndex === -1) {
                // No start of object found
                if (done) {
                    buffer = ''; // Clear buffer to exit loop
                }
                break;
            }

            // We have a '{'. Now find the matching '}'.
            let braceCount = 0;
            let inString = false;
            let escape = false;
            let endIndex = -1;

            for (let i = openBraceIndex; i < buffer.length; i++) {
                const char = buffer[i];
                
                if (inString) {
                    if (escape) {
                        escape = false;
                    } else if (char === '\\') {
                        escape = true;
                    } else if (char === '"') {
                        inString = false;
                    }
                } else {
                    if (char === '"') {
                        inString = true;
                    } else if (char === '{') {
                        braceCount++;
                    } else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            endIndex = i;
                            break;
                        }
                    }
                }
            }

            if (endIndex !== -1) {
                // Found a complete object
                const jsonStr = buffer.substring(openBraceIndex, endIndex + 1);
                buffer = buffer.substring(endIndex + 1); // Advance buffer
                
                try {
                    const parsed = JSON.parse(jsonStr);
                    yield {
                        text: () => {
                            if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts) {
                                return parsed.candidates[0].content.parts.map((p: any) => p.text).join('');
                            }
                            return '';
                        },
                        candidates: parsed.candidates,
                        usageMetadata: parsed.usageMetadata
                    };
                } catch (e) {
                    console.warn('Failed to parse extracted JSON:', e);
                }
            } else {
                // Incomplete object
                if (done) {
                    console.warn('Stream ended with incomplete JSON object');
                    buffer = '';
                }
                break; // Wait for more data
            }
        }
      }
    })();

    return {
      stream,
      [Symbol.asyncIterator]: function() { return stream; }
    };
  }
}