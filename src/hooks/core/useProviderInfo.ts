import { useMemo } from 'react';
import { AppSettings, ServerStatus, ProviderType } from '@/types';
import { getModelDisplayName } from '@/utils/common/modelUtils';
import { isUsingProxy as checkProxyUsage } from '@/services/proxy/proxyUtils';

/**
 * Pure function to derive provider info from settings and server status.
 * Useful for logic outside of React components or in event handlers.
 */
export function getProviderInfo(settings: AppSettings, serverStatus?: ServerStatus) {
  const isGemini = settings.provider === ProviderType.Gemini;
  const isOpenRouter = settings.provider === ProviderType.OpenRouter;

  // 1. Determine active model ID
  const currentModelId = isOpenRouter ? settings.openRouterModel : settings.model;

  // 2. Check if requests are routed through the proxy
  const isUsingProxy = isOpenRouter 
    ? !settings.openRouterApiKey 
    : checkProxyUsage(settings.apiKey);

  // 3. Determine if model is unlocked (has any key that will actually be used)
  // For OpenRouter:
  //   - If user has API key -> unlocked (direct call)
  //   - If using proxy -> check if server has OpenRouter key
  // For Gemini:
  //   - If user has API key -> unlocked (direct call)
  //   - If using proxy -> check if server has Gemini key
  //   - If not using proxy but no user key -> must have env variable (handled by checkProxyUsage), so unlocked
  const isUnlocked = isOpenRouter
    ? (settings.openRouterApiKey ? true : !!serverStatus?.hasOpenRouterKey)
    : (settings.apiKey ? true : (isUsingProxy ? !!serverStatus?.hasServerKey : true));

  // 4. Check if we are in demo mode (using server key via proxy, but not private)
  // Demo mode means: server has a key, user doesn't, and proxy mode is 'demo'
  const isDemoMode = isUsingProxy && isUnlocked && serverStatus?.proxyMode !== 'private';

  // 5. Get display name for the model
  const modelDisplayName = isOpenRouter
    ? (settings.openRouterModel ? `${settings.openRouterModel} Swarm` : 'OpenRouter Swarm')
    : getModelDisplayName(settings.model);

  // 6. Validation logic for sending messages
  const canSend = (userInput: string, hasImage: boolean) => {
    // Basic requirement: must have input or an image
    if (!userInput.trim() && !hasImage) return false;
    
    // Model must be selected
    if (!currentModelId || currentModelId.trim() === '') return false;

    // Must have some way to call the API
    if (!isUnlocked) return false;

    return true;
  };

  return {
    isGemini,
    isOpenRouter,
    currentModelId,
    isUsingProxy,
    isUnlocked,
    isDemoMode,
    modelDisplayName,
    canSend
  };
}

/**
 * Hook to abstract provider-specific logic and derived settings.
 * Centralizes checks for Gemini vs OpenRouter to keep components clean.
 */
export function useProviderInfo(settings: AppSettings, serverStatus?: ServerStatus) {
  return useMemo(() => getProviderInfo(settings, serverStatus), [
    settings.provider, 
    settings.model, 
    settings.openRouterModel, 
    settings.apiKey, 
    settings.openRouterApiKey,
    serverStatus?.hasServerKey,
    serverStatus?.hasOpenRouterKey,
    serverStatus?.proxyMode
  ]);
}
