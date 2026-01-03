import geminiIcon from '@/assets/Google-gemini-icon.webp';
import openRouterLogo from '@/assets/openrouter.svg';
import openaiLogo from '@/assets/openai.webp';
import anthropicLogo from '@/assets/anthropic.svg';
import claudeLogo from '@/assets/claude-color.webp';
import deepseekLogo from '@/assets/deepseek-color.svg';
import grokLogo from '@/assets/grok.webp';
import mistralLogo from '@/assets/mistral-color.svg';
import qwenLogo from '@/assets/qwen-color.svg';
import metaLogo from '@/assets/meta-color.svg';
import minimaxLogo from '@/assets/minimax-color.webp';
import perplexityLogo from '@/assets/perplexity-color.svg';
import zaiLogo from '@/assets/zai.svg';
import { ProviderType } from '@/types';

/**
 * Determines which logo to use based on the selected provider and model.
 * 
 * @param provider The current AI provider (Gemini or OpenRouter)
 * @param model The specific model ID (e.g., 'openai/gpt-4o')
 * @returns The path to the appropriate logo asset
 */
export function getProviderLogo(provider: ProviderType, model?: string): string {
  if (provider === ProviderType.OpenRouter) {
    if (!model) return openRouterLogo;
    
    const m = model.toLowerCase();
    
    // Check for specific model providers/families
    if (m.includes('gemini') || m.includes('google')) {
      return geminiIcon;
    }
    if (m.includes('gpt') || m.includes('openai')) {
      return openaiLogo;
    }
    if (m.includes('claude')) {
      return claudeLogo;
    }
    if (m.includes('anthropic')) {
      return anthropicLogo;
    }
    if (m.includes('deepseek') || m.includes('r1')) {
      return deepseekLogo;
    }
    if (m.startsWith('meta')) {
      return metaLogo;
    }
    if (m.includes('grok') || m.includes('x-ai')) {
      return grokLogo;
    }
    if (m.includes('mistral') || m.includes('mixtral')) {
      return mistralLogo;
    }
    if (m.includes('qwen')) {
      return qwenLogo;
    }
    if (m.includes('minimax')) {
      return minimaxLogo;
    }
    if (m.includes('perplexity')) {
      return perplexityLogo;
    }
    if (m.startsWith('z-ai')) {
      return zaiLogo;
    }

    // Default fallback for OpenRouter
    return openRouterLogo;
  }
  
  // Default to Gemini logo for Gemini provider or any other case
  return geminiIcon;
}
