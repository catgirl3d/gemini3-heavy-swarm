import React, { useState, useEffect, useRef, useCallback, type FormEvent, type FC, lazy, Suspense } from 'react';
import { useGeminiSwarm } from '@/hooks/core/useGeminiSwarm';
import { useServerStatus } from '@/hooks/network/useServerStatus';
import { useAutoScroll } from '@/hooks/ui/useAutoScroll';
import { useDynamicFavicon } from '@/hooks/ui/useDynamicFavicon';
import { useProviderInfo } from '@/hooks/core/useProviderInfo';
import { ConfigProvider } from '@/providers';
import { Logger } from '@shared/utils/logger';

import { StatusBanner, Header, Toast, type ToastType } from '@/components/layout';
import { MessageList, InputArea } from '@/components/chat';
import { ScrollToBottomButton } from '@/components/ui';
import { type StepId } from '@/types/steps';
import { runAsyncAction } from '@/utils/common/asyncAction';

const SettingsModal = lazy(() => import('@/components/modals/SettingsModal').then(m => ({ default: m.SettingsModal })));
const InfoModal = lazy(() => import('@/components/modals/InfoModal').then(m => ({ default: m.InfoModal })));

export const App: FC = () => {
  const {
    messages,
    isLoading,
    isPaused,
    loadingStatus,
    agentStates,
    currentWork,
    settings,
    settingsLoaded,
    error,
    setSettings,
    resetSettings,
    sendMessage,
    stopGeneration,
    retry,
    continueGeneration,
    regenerateAgentResponse,
    currentMessageId,
    loadError,
    clearLoadError
  } = useGeminiSwarm();

  const {
    serverStatus,
    shouldShowLoadingBanner,
    isBannerDismissed,
    dismissBanner
  } = useServerStatus();

  const providerInfo = useProviderInfo(settings, serverStatus);

  useDynamicFavicon(settings.provider, providerInfo.currentModelId, providerInfo.modelDisplayName);

  const {
    messageListRef,
    showScrollButton,
    scrollToBottom
  } = useAutoScroll({
    messagesLength: messages.length,
    isLoading,
    error
  });

  const [userInput, setUserInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loggerRef = useRef(new Logger('App', settings.debugMode));
  const loggerDebugModeRef = useRef(settings.debugMode);

  if (loggerDebugModeRef.current !== settings.debugMode) {
    loggerRef.current = new Logger('App', settings.debugMode);
    loggerDebugModeRef.current = settings.debugMode;
  }

  const handleImageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setToast({ message: "File size exceeds 4MB limit.", type: 'error' });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImage(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handlePromptClick = useCallback((prompt: string) => {
    setUserInput(prompt);
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Check if there's content to send BEFORE clearing the fields
    if (!providerInfo.canSend(userInput, !!image)) {
      if (!providerInfo.isUnlocked) {
        setToast({ 
          message: 'Please provide an API key in settings or ensure server has one configured.', 
          type: 'error' 
        });
      } else if (!providerInfo.currentModelId) {
        setToast({ 
          message: providerInfo.isOpenRouter 
            ? 'Please select an OpenRouter model in settings before sending a message.' 
            : 'Please select a model in settings before sending a message.', 
          type: 'error' 
        });
      }
      return;
    }
    
    // Store current values
    const currentInput = userInput;
    const currentImage = image;
    const currentImageFile = imageFile;
    
    // Clear the input fields
    setUserInput('');
    setImage(null);
    setImageFile(null);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    runAsyncAction(
      () => sendMessage(currentInput, currentImage, currentImageFile),
      (error) => loggerRef.current.error('Unhandled sendMessage failure:', error)
    );
  }, [userInput, image, imageFile, sendMessage, providerInfo, setToast]);

  const handleContinue = useCallback(() => {
    runAsyncAction(
      continueGeneration,
      (error) => loggerRef.current.error('Unhandled continueGeneration failure:', error)
    );
  }, [continueGeneration]);

  // Memoized handler for regeneration to prevent MessageList re-renders
  const handleRegenerate = useCallback((messageId: string, phase: StepId, agentIndex: number) => {
    runAsyncAction(
      () => regenerateAgentResponse(messageId, phase, agentIndex),
      (error) => loggerRef.current.error('Unhandled regeneration failure:', error)
    );
  }, [regenerateAgentResponse]);

  // Enforce model restrictions based on server status
  useEffect(() => {
    if (!serverStatus.isLoaded || !settingsLoaded) return;

    // Enforce Gemini restrictions for demo model if applicable
    if (providerInfo.isGemini && providerInfo.isDemoMode) {
        if (settings.model !== 'gemini-2.5-flash-lite') {
            loggerRef.current.info("Enforcing demo model restriction (gemini-2.5-flash-lite)");
            setSettings(prev => ({ ...prev, model: 'gemini-2.5-flash-lite' }));
        }
    }
  }, [serverStatus.isLoaded, providerInfo.isGemini, providerInfo.isDemoMode, settings.model, settingsLoaded, setSettings]);

  // Show toast when loadError is present (e.g. from corrupt settings fallback)
  useEffect(() => {
    if (loadError) {
      setToast({ message: loadError, type: 'error' });
      clearLoadError();
    }
  }, [loadError, clearLoadError]);

  const { modelDisplayName } = providerInfo;

  return (
    <ConfigProvider settings={settings}>
      <div className="chat-container">
      <StatusBanner
        serverStatus={serverStatus}
        providerInfo={providerInfo}
        shouldShowLoadingBanner={shouldShowLoadingBanner}
        isBannerDismissed={isBannerDismissed}
        onDismiss={dismissBanner}
      />
      
      <Header
        modelDisplayName={modelDisplayName}
        provider={settings.provider}
        model={providerInfo.currentModelId}
        onInfoClick={() => setIsInfoOpen(true)}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <MessageList
        messages={messages}
        isLoading={isLoading}
        isPaused={isPaused}
        error={error}
        loadingStatus={loadingStatus}
        agentStates={agentStates}
        currentWork={currentWork}
        modelDisplayName={modelDisplayName}
        provider={settings.provider}
        model={providerInfo.currentModelId}
        messageListRef={messageListRef}
        messageId={currentMessageId}
        onPromptClick={handlePromptClick}
        onContinue={handleContinue}
        onRetry={retry}
        onRegenerate={handleRegenerate}
      />

      <InputArea
        isLoading={isLoading}
        image={image}
        userInput={userInput}
        onUserInputChange={setUserInput}
        onImageChange={handleImageChange}
        onRemoveImage={handleRemoveImage}
        onSubmit={handleSubmit}
        onStop={stopGeneration}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
      />

      <ScrollToBottomButton
        visible={showScrollButton}
        onClick={scrollToBottom}
      />

      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={setSettings}
          onReset={() => {
            resetSettings();
            setToast({ message: "Settings reset successfully", type: 'success' });
          }}
          serverStatus={serverStatus}
          onShowError={(message) => setToast({ message, type: 'error' })}
        />
        
        <InfoModal
          isOpen={isInfoOpen}
          onClose={() => setIsInfoOpen(false)}
        />
      </Suspense>

      {toast && (
        <Toast
          key={toast.message}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      </div>
    </ConfigProvider>
  );
};
