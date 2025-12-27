import { useRef } from 'react';
import { GeminiService } from '@/services/swarm/GeminiService';
import { useAppSettings } from '@/hooks/state/useAppSettings';
import { useSwarmStatus } from '@/hooks/swarm/useSwarmStatus';
import { useSwarmWork } from '@/hooks/swarm/useSwarmWork';
import { useMessages } from '@/hooks/state/useMessages';
import { useAbortController } from '@/hooks/network/useAbortController';
import { useAgentStateSync } from '@/hooks/swarm/useAgentStateSync';
import { useSwarmOrchestration } from '@/hooks/swarm/useSwarmOrchestration';
import { useSwarmRegeneration } from '@/hooks/swarm/useSwarmRegeneration';

/**
 * useGeminiSwarm - Composite hook that provides the main API for the agentic workflow.
 * Composes specialized hooks for orchestration and regeneration to maintain readability.
 */
export const useGeminiSwarm = () => {
  // 1. Compose State Hooks
  const { settings, settingsLoaded, setSettings } = useAppSettings();
  const swarmStatus = useSwarmStatus();
  const { messages, setMessages, messagesRef } = useMessages();
  const { agentStates, setAgentStates, currentWork, setCurrentWork } = useSwarmWork();
  
  // 2. Shared Infrastructure
  const mainAbort = useAbortController();
  const regenAbort = useAbortController();
  const geminiServiceRef = useRef<GeminiService>(new GeminiService());
  const pauseResolverRef = useRef<(() => void) | null>(null);
  
  const { updateAgentStatus } = useAgentStateSync(setAgentStates, setMessages, setCurrentWork);

  // 3. Specialized Orchestration Hook (SendMessage, Stop, Retry, Continue)
  const orchestration = useSwarmOrchestration({
    settings,
    messagesRef,
    setMessages,
    setIsLoading: swarmStatus.setIsLoading,
    setIsPaused: swarmStatus.setIsPaused,
    setLoadingStatus: swarmStatus.setLoadingStatus,
    setAgentStates,
    setCurrentWork,
    setError: swarmStatus.setError,
    mainAbort,
    pauseResolverRef,
    geminiServiceRef
  });

  // 4. Specialized Regeneration Hook (RegenerateAgentResponse)
  const regeneration = useSwarmRegeneration({
    settings,
    messages,
    messagesRef,
    setMessages,
    agentStates,
    currentWork,
    isLoading: swarmStatus.isLoading,
    isPaused: swarmStatus.isPaused,
    setIsLoading: swarmStatus.setIsLoading,
    setIsPaused: swarmStatus.setIsPaused,
    setLoadingStatus: swarmStatus.setLoadingStatus,
    setAgentStates,
    setCurrentWork,
    updateAgentStatus,
    regenAbort,
    geminiServiceRef,
    lastInput: orchestration.lastInput
  });

  // 5. Unified API
  return {
    // State
    messages,
    isLoading: swarmStatus.isLoading,
    isPaused: swarmStatus.isPaused,
    loadingStatus: swarmStatus.loadingStatus,
    agentStates,
    currentWork,
    settings,
    settingsLoaded,
    error: swarmStatus.error,
    
    // Actions
    setSettings,
    sendMessage: orchestration.sendMessage,
    stopGeneration: orchestration.stopGeneration,
    retry: orchestration.retry,
    continueGeneration: orchestration.continueGeneration,
    regenerateAgentResponse: regeneration.regenerateAgentResponse
  };
};
