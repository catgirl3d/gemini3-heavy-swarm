import { useRef, useMemo } from 'react';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { AiProviderFactory } from '@/services/ai';
import { useAppSettings } from '@/hooks/state/useAppSettings';
import { useMessages } from '@/hooks/state/useMessages';
import { useAbortController } from '@/hooks/network/useAbortController';
import { type StepId } from '@/types/steps';

import { useSwarmOrchestration } from '@/hooks/swarm/useSwarmOrchestration';
import { useSwarmRegeneration } from '@/hooks/swarm/useSwarmRegeneration';
import { selectActiveSessionUi, useAgentStore } from '@/stores/agentStore';
import { useShallow } from 'zustand/shallow';

/**
 * useGeminiSwarm - Composite hook that provides the main API for the agentic workflow.
 * Composes specialized hooks for orchestration and regeneration to maintain readability.
 */
export const useGeminiSwarm = () => {
  // 1. Compose State Hooks
  const { settings, settingsLoaded, setSettings, resetSettings, loadError, clearLoadError } = useAppSettings();
  const { messages, setMessages, messagesRef } = useMessages();
  
  // Zustand Store - derive UI state from the active session phase.
  const sessionUi = useAgentStore(useShallow(selectActiveSessionUi));
  const isLoading = sessionUi.isInputLocked;
  const isPaused = sessionUi.isPausedForAction;
  const loadingStatus = sessionUi.loadingStatus;
  const error = sessionUi.globalErrorMessage;
  
  // 2. Shared Infrastructure
  const mainAbort = useAbortController();
  const selectedProvider = settings.provider;
  const apiKey = settings.apiKey;
  const openRouterApiKey = settings.openRouterApiKey;
  const openRouterModel = settings.openRouterModel;
  
  // Create provider when settings change
  const provider = useMemo(
    () => AiProviderFactory.create({
      provider: selectedProvider,
      apiKey,
      openRouterApiKey,
      openRouterModel,
    }),
    [selectedProvider, apiKey, openRouterApiKey, openRouterModel]
  );

  const orchestrator = useMemo(() => new SwarmOrchestrator(provider), [provider]);
  const orchestratorRef = useRef<SwarmOrchestrator>(orchestrator);
  orchestratorRef.current = orchestrator;

  // 3. Specialized Orchestration Hook (SendMessage, Stop, Retry, Continue)
  const orchestration = useSwarmOrchestration({
    settings,
    messagesRef,
    setMessages,
    mainAbort,
    orchestratorRef
  });

  // 4. Specialized Regeneration Hook (RegenerateAgentResponse)
  const regeneration = useSwarmRegeneration({
    settings,
    messages,
    messagesRef,
    setMessages,
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
    sessionUi,
    activePhase: sessionUi.activePhase,
    isInputLocked: sessionUi.isInputLocked,
    canStartNewPrompt: sessionUi.canStartNewPrompt,
    canStop: sessionUi.canStop,
    canAbortRequest: sessionUi.canAbortRequest,
    shouldShowLoadingIndicator: sessionUi.shouldShowLoadingIndicator,
    shouldReadLiveWork: sessionUi.shouldReadLiveWork,
    shouldAutoScrollOnSessionChange: sessionUi.shouldAutoScrollOnSessionChange,
    isPausedForAction: sessionUi.isPausedForAction,
    isTimerActive: sessionUi.isTimerActive,
    progressStatusText: sessionUi.progressStatusText,
    inlineErrorMessage: sessionUi.inlineErrorMessage,
    globalErrorMessage: sessionUi.globalErrorMessage,
    settings,
    settingsLoaded,
    error,
    loadError,
    
    // Actions
    setSettings,
    resetSettings,
    clearLoadError,
    sendMessage: orchestration.sendMessage,
    stopGeneration: orchestration.stopGeneration,
    retry: orchestration.retry,
    continueGeneration: orchestration.continueGeneration,
    regenerateAgentResponse: (messageId: string, stepId: StepId, agentIndex: number) =>
      regeneration.regenerateAgentResponse(messageId, stepId, agentIndex)
  };
};
