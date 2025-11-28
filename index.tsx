import React, { useState, useEffect, useRef, FormEvent, FC, ReactNode, ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import geminiIcon from './assets/Google-gemini-icon.png';
import { useGeminiSwarm, AppSettings, DEFAULT_SETTINGS, Work, Message, AgentState, Source } from './useGeminiSwarm';

const AgentAvatar: FC<{ type: 'user' | 'model' }> = ({ type }) => (
  <div className="avatar">
    {type === 'user' ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    ) : (
      <img src={geminiIcon} alt="Gemini Logo" />
    )}
  </div>
);

const EmptyState: FC<{ onPromptClick: (prompt: string) => void }> = ({ onPromptClick }) => {
  const examplePrompts = [
    "Explain the concept of 'agentic workflows' in AI.",
    "Compare the pros and cons of Next.js and Remix.",
    "What are the ethical implications of generative AI in art?",
  ];
  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">
        <img src={geminiIcon} alt="Gemini Logo" />
      </div>
      <h2 className="welcome-title">Gemini 3 Heavy</h2>
      <p className="welcome-subtitle">How can this AI swarm assist you today?</p>
      
      <a href="https://t.me/temnobogin9" target="_blank" rel="noopener noreferrer" className="creator-credit">
        by Lisova
      </a>

      <div className="example-prompts">
        {examplePrompts.map((prompt, i) => (
          <button key={i} className="prompt-button" onClick={() => onPromptClick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};

const CodeBlock: FC<{ children?: ReactNode, className?: string }> = ({ children, className }) => {
  const [copied, setCopied] = useState(false);
  const textToCopy = String(children).replace(/\n$/, '');

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="code-block-wrapper">
       <div className="code-block-header">
        <span>{language}</span>
        <button onClick={handleCopy} className="copy-button" aria-label="Copy code">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            {copied ? (
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
            ) : (
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-5zm0 16H8V7h11v14z"/>
            )}
          </svg>
          {copied ? 'Copied!' : 'Copy'}
        </button>
       </div>
      <pre><code>{children}</code></pre>
    </div>
  );
};

const SettingsModal: FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  settings: AppSettings; 
  onSave: (newSettings: AppSettings) => void;
}> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
        window.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
    }
    return () => {
        window.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]: name === 'numAgents' ? parseInt(value) || 1 : value
    }));
  };

  const handleReset = () => {
      setLocalSettings(DEFAULT_SETTINGS);
  };

  return createPortal(
    <div className="work-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="work-modal-header">
          <h3>Swarm Configuration</h3>
          <button className="close-modal-button" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        <div className="settings-modal-body">
            <div className="settings-form-group">
                <label className="settings-label">Model</label>
                <select
                    name="model"
                    value={localSettings.model || 'gemini-3-pro-preview'}
                    onChange={handleChange}
                    className="settings-input"
                >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro (Preview)</option>
                </select>
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Number of Agents (1-8)</label>
                <input 
                    type="number" 
                    name="numAgents" 
                    min="1" 
                    max="8" 
                    value={localSettings.numAgents} 
                    onChange={handleChange}
                    className="settings-input"
                />
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Initial Agent Instruction</label>
                <textarea 
                    name="initialInstruction" 
                    value={localSettings.initialInstruction} 
                    onChange={handleChange}
                    className="settings-textarea"
                />
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Refinement Instruction</label>
                <p className="settings-help">Instructions for agents critiquing the initial drafts.</p>
                <textarea 
                    name="refinementInstruction" 
                    value={localSettings.refinementInstruction} 
                    onChange={handleChange}
                    className="settings-textarea"
                />
            </div>

            <div className="settings-form-group">
                <label className="settings-label">Synthesizer Instruction</label>
                 <p className="settings-help">Instructions for the final agent merging all refined responses.</p>
                <textarea 
                    name="synthesizerInstruction" 
                    value={localSettings.synthesizerInstruction} 
                    onChange={handleChange}
                    className="settings-textarea"
                />
            </div>
        </div>
        <div className="settings-modal-footer">
            <button className="settings-btn reset" onClick={handleReset}>Reset to Defaults</button>
            <button className="settings-btn save" onClick={() => { onSave(localSettings); onClose(); }}>Save Changes</button>
        </div>
      </div>
    </div>,
    document.body
  );
};


const MarkdownRenderer: FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code(props) {
        const {children, className} = props;
        return <CodeBlock className={className}>{String(children)}</CodeBlock>;
      },
      table({node, ...props}) {
        return <div className="table-wrapper"><table {...props} /></div>;
      }
    }}
  >
    {content}
  </ReactMarkdown>
);

const WorkModal: FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return createPortal(
    <div className="work-modal-overlay" onClick={onClose}>
      <div className="work-modal" onClick={e => e.stopPropagation()}>
        <div className="work-modal-header">
          <h3>{title}</h3>
          <button className="close-modal-button" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div className="work-modal-body">
            <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>,
    document.body
  );
};

const ShowWork: FC<{ work: Work, isLive?: boolean }> = ({ work, isLive = false }) => {
  const [modalData, setModalData] = useState<{title: string, content: string} | null>(null);

  const renderContent = (content: string | null) => {
    if (content === null) return <div className="pending-work">Waiting for agent output...</div>;
    if (content === '') return <div className="pending-work">Thinking...</div>;
    return <MarkdownRenderer content={content} />;
  };

  return (
    <>
    <details className="show-work-container">
      <summary className={`show-work-button ${!isLive ? 'completed' : ''}`}>
        <span>{isLive ? 'Show Agent Work (Live)' : 'View Full Agent Swarm Process'}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="work-arrow">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="work-details">
        <div className="work-category">
          <h4 className="work-category-title">Initial Drafts</h4>
          <div className="work-grid">
            {work.initialResponses.map((resp, i) => (
              <div key={`initial-${i}`} className="work-card">
                <div className="work-card-header">
                    <div className="work-card-title-group" style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                        <div className="work-card-icon">{i + 1}</div>
                        Agent {i + 1}
                    </div>
                    {resp && (
                        <button 
                            className="expand-work-button"
                            onClick={(e) => {
                                e.preventDefault();
                                setModalData({ title: `Agent ${i + 1} - Initial Draft`, content: resp });
                            }}
                            title="Expand Response"
                            aria-label="Expand Response"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                            </svg>
                        </button>
                    )}
                </div>
                <div className="work-card-body">
                    {renderContent(resp)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="work-category">
          <h4 className="work-category-title">Critiques & Refinements</h4>
           <div className="work-grid">
            {work.refinedResponses.map((resp, i) => (
              <div key={`refined-${i}`} className="work-card refined">
                 <div className="work-card-header">
                    <div className="work-card-title-group" style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                        <div className="work-card-icon">{i + 1}</div>
                        Agent {i + 1}
                    </div>
                    {resp && (
                        <button 
                            className="expand-work-button"
                            onClick={(e) => {
                                e.preventDefault();
                                setModalData({ title: `Agent ${i + 1} - Refined Response`, content: resp });
                            }}
                             title="Expand Response"
                             aria-label="Expand Response"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                            </svg>
                        </button>
                    )}
                 </div>
                 <div className="work-card-body">
                    {renderContent(resp)}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
    {modalData && <WorkModal title={modalData.title} content={modalData.content} onClose={() => setModalData(null)} />}
    </>
  );
};

const LoadingIndicator: FC<{ status: string; time: number; agentStates: AgentState[]; currentWork?: Work }> = ({ status, time, agentStates, currentWork }) => (
  <div className="message-wrapper model">
    <AgentAvatar type="model" />
    <div className="loading-container-wrapper" style={{ width: '100%', maxWidth: '800px' }}>
        <div className="loading-animation">
        <div className="loading-header">
            <span className="loading-status">{status}</span>
            <span className="timer-display">{(time / 1000).toFixed(1)}s</span>
        </div>
        <div className="agent-progress-list">
            {agentStates.map((agent) => (
            <div key={agent.id} className="agent-progress-item">
                <div className={`agent-icon ${agent.status}`}>
                    {agent.id === 'synthesizer' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 2l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 6 6.5 9.5 3 12l3.5 2.5L9 18l2.5-3.5L15 12l-3.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
                        </svg>
                    ) : (
                        agent.name.split(' ')[1]
                    )}
                </div>
                <div className="agent-details">
                    <div className="agent-header">
                        <span className="agent-name">{agent.name}</span>
                        <span className="agent-status-text">{agent.label}</span>
                    </div>
                    <div className="agent-progress-track">
                        <div className={`agent-progress-fill ${agent.status}`}></div>
                    </div>
                </div>
            </div>
            ))}
        </div>
        </div>
        {currentWork && (
            <div style={{ marginTop: '1rem' }}>
                <ShowWork work={currentWork} isLive={true} />
            </div>
        )}
    </div>
  </div>
);

const Sources: FC<{ sources: Source[] }> = ({ sources }) => (
  <div className="sources-container">
    <h3 className="sources-title">Sources & Citations</h3>
    <div className="sources-list">
      {sources.map((source, index) => (
        <a key={index} href={source.uri} target="_blank" rel="noopener noreferrer" className="source-link">
          <div className="source-index">{index + 1}</div>
          <div className="source-title">{source.title || new URL(source.uri).hostname}</div>
          <svg className="source-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.41l-7.79 7.79-1.42-1.42L17.59 5H13V3h8z" />
          </svg>
        </a>
      ))}
    </div>
  </div>
);

const App: FC = () => {
  const {
    messages,
    isLoading,
    loadingStatus,
    agentStates,
    currentWork,
    timer,
    settings,
    error,
    setSettings,
    sendMessage,
    stopGeneration,
    retry
  } = useGeminiSwarm();

  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

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

  return (
    <div className="chat-container">
      <header>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
            <div className="header-logo">
                <img src={geminiIcon} alt="Gemini Logo" />
            </div>
            <h1>Gemini 3 Heavy</h1>
        </div>
        <button 
            className="settings-button" 
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Swarm Settings"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.15 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
        </button>
      </header>
      <div className="message-list" ref={messageListRef}>
        {messages.length === 0 && !isLoading ? (
           <EmptyState onPromptClick={handlePromptClick} />
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <AgentAvatar type={msg.role} />
              <div className={`message ${msg.role}`}>
                {msg.role === 'model' && <div className="agent-label-header"><span className="agent-label">Synthesizer Agent</span></div>}
                {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
                {msg.parts[0].text && (
                  <div className="markdown-content">
                    <MarkdownRenderer content={msg.parts[0].text} />
                  </div>
                )}
                {/* Ensure Work is displayed if it exists on the message */}
                {msg.work && <ShowWork work={msg.work} />}
                {msg.sources && <Sources sources={msg.sources} />}
              </div>
            </div>
          ))
        )}
        {isLoading && <LoadingIndicator status={loadingStatus} time={timer} agentStates={agentStates} currentWork={currentWork} />}
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
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" style={{ display: 'none' }} />
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