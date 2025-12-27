import React, { useState, useEffect, useRef, useCallback, FormEvent, FC } from 'react';
import { useGeminiSwarm } from '@/hooks/core/useGeminiSwarm';
import { useServerStatus } from '@/hooks/network/useServerStatus';
import { useAutoScroll } from '@/hooks/ui/useAutoScroll';
import { getModelDisplayName } from '@/utils/modelUtils';
import { isUsingProxy as checkProxyUsage } from '@/services/proxyUtils';

import { StatusBanner } from '@/components/StatusBanner/StatusBanner';
import { Header } from '@/components/Header/Header';
import { MessageList } from '@/components/MessageList/MessageList';
import { InputArea } from '@/components/InputArea/InputArea';
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton';
import { SettingsModal } from '@/components/SettingsModal/SettingsModal';
import { InfoModal } from '@/components/InfoModal';
import { Toast, ToastType } from '@/components/Toast/Toast';
import { StepId } from '@/types/steps';

export const App: FC = () => {
  const {
    messages,
    isLoading,
    isPaused,
    loadingStatus,
    agentStates,
    currentWork,
    timer,
    settings,
    settingsLoaded,
    error,
    setSettings,
    sendMessage,
    stopGeneration,
    retry,
    continueGeneration,
    regenerateAgentResponse
  } = useGeminiSwarm();

  const {
    serverStatus,
    shouldShowLoadingBanner,
    isBannerDismissed,
    dismissBanner,
    isMissingKey,
    isProxyDemo,
    isProxyPrivate
  } = useServerStatus();

  const {
    messageListRef,
    showScrollButton,
    scrollToBottom,
    setShouldAutoScroll
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

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Check if there's content to send BEFORE clearing the fields
    if (!userInput.trim() && !image) return;
    
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
    
    await sendMessage(currentInput, currentImage, currentImageFile);
  }, [userInput, image, imageFile, sendMessage]);

  // Memoized handler for regeneration to prevent MessageList re-renders
  const handleRegenerate = useCallback((msgIndex: number, phase: StepId, agentIndex: number) => {
    if (phase === 'synthesis_step') {
      setShouldAutoScroll(true);
    }
    regenerateAgentResponse(msgIndex, phase, agentIndex);
  }, [setShouldAutoScroll, regenerateAgentResponse]);

  // Enforce model restrictions based on server status
  useEffect(() => {
    if (!serverStatus.isLoaded || !settingsLoaded) return;

    const isUsingProxyNow = checkProxyUsage(settings.apiKey);
    const isLocked = isUsingProxyNow && (serverStatus.proxyMode !== 'private');

    if (isLocked && settings.model !== 'gemini-2.5-flash-lite') {
        console.log("Enforcing demo model restriction (gemini-2.5-flash-lite)");
        setSettings(prev => ({ ...prev, model: 'gemini-2.5-flash-lite' }));
    }
  }, [serverStatus.isLoaded, serverStatus.proxyMode, settings.apiKey, settings.model, settingsLoaded, setSettings]);

  const isUsingProxy = checkProxyUsage(settings.apiKey);
  const modelDisplayName = getModelDisplayName(settings.model);

  return (
    <div className="chat-container">
      <StatusBanner
        serverStatus={serverStatus}
        shouldShowLoadingBanner={shouldShowLoadingBanner}
        isUsingProxy={isUsingProxy}
        isBannerDismissed={isBannerDismissed}
        onDismiss={dismissBanner}
        isMissingKey={isMissingKey}
        isProxyDemo={isProxyDemo}
        isProxyPrivate={isProxyPrivate}
      />
      
      <Header
        modelDisplayName={modelDisplayName}
        onInfoClick={() => setIsInfoOpen(true)}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <MessageList
        messages={messages}
        isLoading={isLoading}
        isPaused={isPaused}
        error={error}
        loadingStatus={loadingStatus}
        timer={timer}
        agentStates={agentStates}
        currentWork={currentWork}
        modelDisplayName={modelDisplayName}
        messageListRef={messageListRef}
        onPromptClick={handlePromptClick}
        onContinue={continueGeneration}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
        serverStatus={serverStatus}
      />
      
      <InfoModal
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      />

      {toast && (
        <Toast
          key={toast.message}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
