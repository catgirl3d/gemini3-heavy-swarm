import { useRef, useMemo } from 'react';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { AiProviderFactory } from '@/services/ai';
import { useAppSettings } from '@/hooks/state/useAppSettings';
import { useMessages } from '@/hooks/state/useMessages';
import { useAbortController } from '@/hooks/network/useAbortController';
import { type StepId } from '@/types/steps';

import { useSwarmOrchestration } from '@/hooks/swarm/useSwarmOrchestration';
import { useSwarmRegeneration } from '@/hooks/swarm/useSwarmRegeneration';
import { useAgentStore } from '@/stores/agentStore';

/**
 * useGeminiSwarm - Composite hook that provides the main API for the agentic workflow.
 * Composes specialized hooks for orchestration and regeneration to maintain readability.
 */
export const useGeminiSwarm = () => {
  // 1. Compose State Hooks
  const { settings, settingsLoaded, setSettings, resetSettings, loadError, clearLoadError } = useAppSettings();
  const { messages, setMessages, messagesRef } = useMessages();
  
  // Zustand Store - All swarm state in one place
  const agents = useAgentStore(state => state.agents);
  const currentWork = useAgentStore(state => state.currentWork);
  const isLoading = useAgentStore(state => state.isLoading);
  const isPaused = useAgentStore(state => state.isPaused);
  const loadingStatus = useAgentStore(state => state.loadingStatus);
  const error = useAgentStore(state => state.error);
  const currentMessageId = useAgentStore(state => state.currentMessageId);
  
  // 2. Shared Infrastructure
  const mainAbort = useAbortController();
  
  // Create provider when settings change
  const provider = useMemo(
    () => AiProviderFactory.create(settings),
    [settings.provider, settings.apiKey, settings.openRouterApiKey, settings.openRouterModel]
  );

  const orchestrator = useMemo(() => new SwarmOrchestrator(provider), [provider]);
  const orchestratorRef = useRef<SwarmOrchestrator>(orchestrator);
  orchestratorRef.current = orchestrator;
  const pauseResolverRef = useRef<(() => void) | null>(null);

  // 3. Specialized Orchestration Hook (SendMessage, Stop, Retry, Continue)
  const orchestration = useSwarmOrchestration({
    settings,
    messagesRef,
    setMessages,
    mainAbort,
    pauseResolverRef,
    orchestratorRef
  });

  // 4. Specialized Regeneration Hook (RegenerateAgentResponse)
  const regeneration = useSwarmRegeneration({
    settings,
    messages,
    messagesRef,
    setMessages,
    currentWork,
    currentMessageId,
    orchestratorRef,
    lastInput: orchestration.lastInput
  });

  // 5. Unified API
  return {
    // State (all from Zustand now)
    messages,
    isLoading,
    isPaused,
    loadingStatus,
    agentStates: agents,
    currentWork,
    settings,
    settingsLoaded,
    error,
    currentMessageId,
    loadError,
    
    // Actions
    setSettings,
    resetSettings,
    clearLoadError,
    sendMessage: orchestration.sendMessage,
    stopGeneration: orchestration.stopGeneration,
    retry: orchestration.retry,
    continueGeneration: orchestration.continueGeneration,
    // Bind pauseResolverRef to regenerateAgentResponse for cleaner API
    regenerateAgentResponse: (messageId: string, stepId: StepId, agentIndex: number) =>
      regeneration.regenerateAgentResponse(messageId, stepId, agentIndex, pauseResolverRef)
  };
};
