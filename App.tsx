import React, { useState, useEffect, useRef, FormEvent, FC } from 'react';
import { useGeminiSwarm } from './hooks/useGeminiSwarm';
import { useServerStatus } from './hooks/useServerStatus';
import { useAutoScroll } from './hooks/useAutoScroll';
import { getModelDisplayName } from './utils/modelUtils';
import { isUsingProxy as checkProxyUsage } from './services/proxyUtils';

import { StatusBanner } from './components/StatusBanner/StatusBanner';
import { Header } from './components/Header/Header';
import { MessageList } from './components/MessageList/MessageList';
import { InputArea } from './components/InputArea/InputArea';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { SettingsModal } from './components/SettingsModal';
import { InfoModal } from './components/InfoModal';
import { Toast, ToastType } from './components/Toast/Toast';
import { StepId } from './types/steps';

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

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePromptClick = (prompt: string) => {
    setUserInput(prompt);
    inputRef.current?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!userInput.trim() && !image) return;

    const currentInput = userInput;
    setUserInput('');
    
    await sendMessage(currentInput, image, imageFile);
    handleRemoveImage();
  };

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
        onRegenerate={(msgIndex, phase, agentIndex) => {
            if (phase === 'synthesis_step') {
              setShouldAutoScroll(true);
            }
            regenerateAgentResponse(msgIndex, phase as StepId, agentIndex);
        }}
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
