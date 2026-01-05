import { ProviderType } from '@/types';
import { ModelOption as OpenRouterModelOption, getCachedModels } from '@/services/openrouter/modelsCache';
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
 * Capitalizes each word in a string and replaces delimiters with spaces.
 * Example: 'claude-3-opus' -> 'Claude 3 Opus'
 */
const beautifyModelId = (id: string): string => {
  return id
    .split(/[-_/: ]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Returns a human-readable name for the model.
 * Logic Hierarchy:
 * 1. Static Constants (MODEL_DISPLAY_NAMES).
 * 2. OpenRouter Cache (names fetched from API).
 * 3. Heuristic Beautification (stripping prefix, capitalizing words).
 *
 * Options allow for consistent short tags or ensuring the ' Swarm' suffix.
 * Used for main UI titles (Header, EmptyState) and small tags.
 */
export const getModelDisplayName = (model: string, options: ModelDisplayNameOptions = {}): string => {
  if (!model || model.trim() === '') {
    return '';
  }
  
  // 1. Try to get name from static constants
  let displayName = MODEL_DISPLAY_NAMES[model];
  
  // 2. Fallback to OpenRouter cache (pretty names from API)
  if (!displayName) {
    try {
      const cachedModels = getCachedModels();
      if (cachedModels) {
        const found = cachedModels.find(m => m.value === model);
        if (found) displayName = found.label;
      }
    } catch (e) {
      // Ignore cache errors in SSR or restricted environments
    }
  }

  // 3. Fallback to beautifying the technical ID
  if (!displayName) {
    // Strip provider prefix if present
    const baseId = model.includes('/') ? model.split('/').pop() || model : model;
    displayName = beautifyModelId(baseId);
  }

  // 4. Strip provider prefix with colon if present (e.g. "Anthropic: Claude 3" -> "Claude 3")
  // We look for ": " pattern which is common for pretty names from APIs.
  if (displayName.includes(': ')) {
    displayName = displayName.split(': ').pop()?.trim() || displayName;
  }

  // 5. Handle 'short' option (strip ' Swarm' suffix if present)
  if (options.short) {
    return displayName.replace(/ Swarm$/, '');
  }

  // 5. Handle 'withSwarmSuffix' option
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
