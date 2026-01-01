import { Logger } from '@shared/utils/logger';

const logger = new Logger('OpenRouterModelsService');

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
  top_provider: {
    context_length: number | null;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  supported_parameters?: string[];
}

let modelsCache: OpenRouterModel[] | null = null;
let lastFetchTime: number = 0;
let fetchPromise: Promise<OpenRouterModel[]> | null = null;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (modelsCache && (now - lastFetchTime < CACHE_DURATION)) {
    return modelsCache;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      modelsCache = data.data as OpenRouterModel[];
      lastFetchTime = Date.now();
      return modelsCache;
    } catch (error) {
      logger.error('Error fetching OpenRouter models:', error);
      // If we have cached models, return them even if expired if fetch fails
      if (modelsCache) return modelsCache;
      throw error;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}
