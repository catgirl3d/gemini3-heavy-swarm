import type { Content, GenerationConfig, Tool } from '@google/genai';

export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_PROXY_MODE?: string;
}

export interface GeminiRequest {
  model?: string;
  contents: Content[];
  generationConfig?: GenerationConfig;
  systemInstruction?: Content;
  tools?: Tool[];
}
