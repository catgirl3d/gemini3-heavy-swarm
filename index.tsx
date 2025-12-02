import React, { useState, useEffect, useRef, FormEvent, FC } from 'react';
import { createRoot } from 'react-dom/client';
import geminiIcon from './assets/Google-gemini-icon.png';
import { useGeminiSwarm } from './hooks/useGeminiSwarm';
import { AgentAvatar } from './components/AgentAvatar';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { ShowWork } from './components/ShowWork';
import { LoadingIndicator } from './components/LoadingIndicator';
import { Sources } from './components/Sources';

const getModelDisplayName = (model: string) => {
  if (model === 'gemini-2.5-flash-lite') return 'Gemini 2.5 Flash-Lite Swarm';
  if (model === 'gemini-2.5-flash') return 'Gemini 2.5 Flash Swarm';
  if (model === 'gemini-2.5-pro') return 'Gemini 2.5 Pro Swarm';
  return 'Gemini 3 Heavy Swar';
};

const App: FC = () => {
  const {
    messages,
    isLoading,
    isPaused,
    loadingStatus,
    agentStates,
    currentWork,
    timer,
    settings,
    error,
    setSettings,
    sendMessage,
    stopGeneration,
    retry,
    continueGeneration,
    regenerateAgentResponse
  } = useGeminiSwarm();

  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const messageListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Smart Auto-scroll Logic
  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      // Check if user is near the bottom (within 100px)
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldAutoScroll(isNearBottom);
      setShowScrollButton(!isNearBottom);
    };

    element.addEventListener('scroll', handleScroll);
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (shouldAutoScroll && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading, agentStates, currentWork, shouldAutoScroll]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        alert("File size exceeds 4MB limit.");
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
    if (formRef.current) {
      const input = formRef.current.querySelector('input[name="userInput"]') as HTMLInputElement;
      if (input) {
        input.value = prompt;
        input.focus();
      }
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const userInput = formData.get('userInput') as string;
    
    if (!userInput.trim() && !image) return;

    event.currentTarget.reset();
    
    await sendMessage(userInput, image, imageFile);
    handleRemoveImage();
  };

  const scrollToBottom = () => {
    if (messageListRef.current) {
      messageListRef.current.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  return (
    <div className="chat-container">
      <header>
        <div className="header-content">
            <div className="header-logo">
                <img src={geminiIcon} alt="Gemini Logo" />
            </div>
            <h1>{getModelDisplayName(settings.model)}</h1>
        </div>
        <div className="header-actions">
            <button
                className="settings-button"
                onClick={() => window.location.reload()}
                aria-label="Home"
                title="Reset / Home"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
            </button>
            <button
                className="settings-button"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Swarm Settings"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.15 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
            </button>
        </div>
      </header>
      <div className="message-list" ref={messageListRef}>
        {messages.length === 0 && !isLoading ? (
           <EmptyState onPromptClick={handlePromptClick} modelDisplayName={getModelDisplayName(settings.model)} />
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <AgentAvatar type={msg.role} />
              <div className={`message ${msg.role}`}>
                {msg.role === 'model' && <div className="agent-label-header"><span className="agent-label">Synthesizer Agent</span></div>}
                {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
                {msg.parts[0].text && (
                  <MarkdownRenderer content={msg.parts[0].text} />
                )}
                {/* Ensure Work is displayed if it exists on the message */}
                {msg.work && (
                    <ShowWork
                        work={msg.work}
                        onRegenerate={(phase, agentIndex) => regenerateAgentResponse(index, phase, agentIndex)}
                    />
                )}
                {msg.sources && <Sources sources={msg.sources} />}
              </div>
            </div>
          ))
        )}
        {isLoading && (
            <LoadingIndicator
                status={loadingStatus}
                time={timer}
                agentStates={agentStates}
                currentWork={currentWork}
                isPaused={isPaused}
                onContinue={continueGeneration}
                onRegenerate={(phase, agentIndex) => {
                    // When paused, the current message is the last one in the messages array
                    // because we push the user message, then start loading.
                    // Wait, if we are paused, we haven't pushed the final model message yet?
                    // Let's check useGeminiSwarm.
                    // In useGeminiSwarm, we push the user message, then start loading.
                    // The model message is streamed into messages array via onMessageUpdate.
                    // So the last message in 'messages' should be the one we are working on.
                    regenerateAgentResponse(messages.length - 1, phase, agentIndex);
                }}
            />
        )}
        {error && (
          <div className="error-container">
            <div className="error-message">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="error-icon">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <span>{error}</span>
            </div>
            <button className="retry-button" onClick={retry}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
              Retry
            </button>
          </div>
        )}
      </div>
      <div className="input-container">
        {image && (
          <div className="image-preview">
            <img src={image} alt="Preview" className="preview-img" />
            <button onClick={handleRemoveImage} className="remove-image-btn" aria-label="Remove image">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        )}
        <form className="input-area" ref={formRef} onSubmit={handleSubmit}>
          <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} aria-label="Attach image">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
            </svg>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden-input" />
          </button>
          <input
            type="text"
            name="userInput"
            placeholder="Ask the swarm..."
            aria-label="User input"
            disabled={isLoading}
          />
          {isLoading ? (
            <button type="button" className="stop-button" onClick={stopGeneration} aria-label="Stop generation">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>
          ) : (
            <button type="submit" className="send-button" disabled={isLoading} aria-label="Send message">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
            </button>
          )}
        </form>
      </div>
      {showScrollButton && (
        <button
          className="scroll-to-bottom-btn"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
          </svg>
        </button>
      )}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);