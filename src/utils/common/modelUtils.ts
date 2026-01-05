import { ProviderType } from '@/types';
import { ModelOption as OpenRouterModelOption } from '@/services/openrouter/modelsCache';
import { MODEL_DISPLAY_NAMES } from '@/constants/models';

export const isThinkingModel = (
  provider: ProviderType,
  modelId: string,
  openRouterModels?: OpenRouterModelOption[]
): boolean => {
  if (provider === ProviderType.Gemini) {
    return modelId.includes('gemini-3') || modelId.toLowerCase().includes('thinking');
  }

  if (provider === ProviderType.OpenRouter && modelId) {
    // 1. Check by metadata if available (most reliable)
    if (openRouterModels) {
      const model = openRouterModels.find(m => m.value === modelId);
      if (model) return !!model.supportsReasoning;
    }

    // 2. Fallback to name check
    return modelId.toLowerCase().includes('thinking');
  }

  return false;
};

export interface ModelDisplayNameOptions {
  /** Return only the model name, stripping provider prefix and 'Swarm' suffix */
  short?: boolean;
  /** Ensure ' Swarm' suffix is present in the display name */
  withSwarmSuffix?: boolean;
}

/**
 * Returns a human-readable name for the model.
 * 1. Checks MODEL_DISPLAY_NAMES for a "pretty" name (e.g., 'Gemini 3 Flash Swarm').
 * 2. If not found and is in 'provider/model' format, returns just the 'model' part.
 * 3. Otherwise returns the model ID as is.
 *
 * Options allow for consistent short tags or ensuring the ' Swarm' suffix.
 * Used for main UI titles (Header, EmptyState) and small tags.
 */
export const getModelDisplayName = (model: string, options: ModelDisplayNameOptions = {}): string => {
  if (!model || model.trim() === '') {
    return '';
  }
  
  // 1. Try to get name from constants
  let displayName = MODEL_DISPLAY_NAMES[model];
  
  // 2. Fallback to processing the ID
  if (!displayName) {
    displayName = model.includes('/') ? model.split('/').pop() || model : model;
  }

  // 3. Handle 'short' option (strip ' Swarm' suffix)
  if (options.short) {
    return displayName.replace(/ Swarm$/, '');
  }

  // 4. Handle 'withSwarmSuffix' option
  if (options.withSwarmSuffix && !displayName.endsWith(' Swarm')) {
    return `${displayName} Swarm`;
  }

  return displayName;
};

/**
 * Returns a compact tag for the model.
 * Wrapper around getModelDisplayName with { short: true }.
 *
 * Used for small UI tags (InstructionItem, RoleItem).
 */
export const formatModelTag = (model: string): string => {
  if (!model) return 'Default';
  return getModelDisplayName(model, { short: true });
};
