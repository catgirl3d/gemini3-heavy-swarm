import React, { useState, useEffect, useRef, FormEvent, FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Content, Part, GroundingChunk } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MODEL_NAME = 'gemini-3-pro-preview';
const NUM_AGENTS = 4;

const INITIAL_SYSTEM_INSTRUCTION = `You follow prompt that user gives and add your intelligence creatively to achieve what user wants and what user will want in future by analyzing his prompt. Provide the most creative and beautiful version of the solution possible.`;

const REFINEMENT_SYSTEM_INSTRUCTION = `Your goal is to RUTHLESSLY IMPROVE the provided response.
STRICT GUIDELINES:
1. DEMAND Creativity: If the initial code/logic is simple, make it creative and logical.
3. NO MERCY: Point out every flaw in the initial draft and fix it with a creative, more robust solution.
4. Your output must be significantly larger and more detailed than the input.for example user asked for svg episode of southpark - you should first focus on each charcter extreme detailed svg then environment with lots of easter eggs and interaction and then dialogues related to series and characters with proper animation then all get into one code block `;

const SYNTHESIZER_SYSTEM_INSTRUCTION = `You are a master synthesizer AI.

SECTION 1: SWARM LEARNINGS
Start your response with a section titled "## Swarm Learnings". Explicitly state what specific technical details, edge cases, strategies, or improvements you learned and adopted from the previous agent critiques and refinements.

SECTION 2: MASSIVE CODE ARTIFACT (2000+ LINES) only when user asked for it.
CRITICAL MANDATE: The user explicitly demands a MASSIVE code output (aiming for 2000+ lines).
STRICT PROHIBITIONS:
1. NEVER write 'Technical Note' or excuses about token limits.
2. NO placeholders ('// ...').
3. NO "lazy" filler.
4. DO NOT apologize for length.
Your goal is to hit the token limit with pure, functional, executable code. Do not stop.`;

interface Source {
  uri: string;
  title: string;
}
interface Work {
  initialResponses: (string | null)[];
  refinedResponses: (string | null)[];
}
interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  image?: string;
  sources?: Source[];
  work?: Work;
}

interface AgentState {
  id: string;
  name: string;
  status: 'waiting' | 'working' | 'done';
  label: string;
}

const AgentAvatar: FC<{ type: 'user' | 'model' }> = ({ type }) => (
  <div className="avatar">
    {type === 'user' ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-1.07 3.97-2.9 5.4z"/>
      </svg>
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-1.07 3.97-2.9 5.4z"/>
        </svg>
      </div>
      <h2 className="welcome-title">Gemini 3 Heavy</h2>
      <p className="welcome-subtitle">How can this AI swarm assist you today?</p>
      
      <a href="https://x.com/chetaslua" target="_blank" rel="noopener noreferrer" className="creator-credit">
        by chetaslua
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

const ShowWork: FC<{ work: Work }> = ({ work }) => {
  const renderContent = (content: string | null) => {
    if (!content) return <div className="pending-work">Waiting for agent output...</div>;
    return (
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
  };

  return (
    <details className="show-work-container">
      <summary className="show-work-button">
        Show Agent Work (Live)
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
                    <div className="work-card-icon">{i + 1}</div>
                    Agent {i + 1}
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
                    <div className="work-card-icon">{i + 1}</div>
                    Agent {i + 1}
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
                <ShowWork work={currentWork} />
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [currentWork, setCurrentWork] = useState<Work | undefined>(undefined);
  const [timer, setTimer] = useState<number>(0);
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const startTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading, agentStates, currentWork]);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      startTimeRef.current = Date.now();
      interval = setInterval(() => {
        setTimer(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

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

    const userMessage: Message = { role: 'user', parts: [{ text: userInput }], image: image || undefined };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setIsLoading(true);
    handleRemoveImage();
    setAgentStates([]);
    
    // Initialize current work for live viewing
    const liveWork: Work = {
        initialResponses: Array(NUM_AGENTS).fill(null),
        refinedResponses: Array(NUM_AGENTS).fill(null)
    };
    setCurrentWork(liveWork);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const mainChatHistory: Content[] = currentMessages.slice(0, -1).map(msg => ({
        role: msg.role,
        parts: msg.parts,
      }));

      const baseApiParts: Part[] = [];
      if (image && imageFile) {
        baseApiParts.push({
          inlineData: {
            mimeType: imageFile.type,
            data: image.split(',')[1],
          },
        });
      }
      if (userInput.trim()) {
        baseApiParts.push({ text: userInput });
      }

      const currentUserTurn: Content = { role: 'user', parts: baseApiParts };

      // STEP 1: Initial Responses
      setLoadingStatus('Initializing agents...');
      setAgentStates(Array.from({ length: NUM_AGENTS }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i + 1}`,
        status: 'working',
        label: 'Drafting initial response...'
      })));

      const initialAgentPromises = Array(NUM_AGENTS).fill(0).map((_, i) => 
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: [...mainChatHistory, currentUserTurn],
          config: { 
            systemInstruction: INITIAL_SYSTEM_INSTRUCTION,
            temperature: 0.7,
            tools: [{googleSearch: {}}],
            thinkingConfig: { thinkingBudget: 32768 },
            maxOutputTokens: 65536, 
          },
        }).then(res => {
            setAgentStates(prev => prev.map((a, idx) => idx === i ? { ...a, status: 'done', label: 'Drafted' } : a));
            // Update live work state
            setCurrentWork(prev => {
                if (!prev) return prev;
                const newInitials = [...prev.initialResponses];
                newInitials[i] = res.text;
                return { ...prev, initialResponses: newInitials };
            });
            return res;
        })
      );
      
      // Wait for all initial responses, but UI updates live via the .then() blocks
      const initialResponses = await Promise.all(initialAgentPromises);
      const initialAnswers = initialResponses.map(res => res.text);

      // STEP 2: Refined Responses
      setLoadingStatus('Refining answers...');
      setAgentStates(prev => prev.map(a => ({ ...a, status: 'working', label: 'Critiquing & Refining...' })));

      const refinementAgentPromises = initialAnswers.map((initialAnswer, index) => {
        const otherAnswers = initialAnswers.filter((_, i) => i !== index);
        const otherAnswersText = otherAnswers.map((answer, i) => `${i + 1}. "${answer}"`).join('\n');
        const refinementContext = `My initial response was: "${initialAnswer}". The other agents responded with:\n${otherAnswersText}\n\nBased on this context, critically re-evaluate and provide a new, improved response to the original query.`;
        
        const refinementTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${refinementContext}`}] };
        
        return ai.models.generateContent({ 
          model: MODEL_NAME, 
          contents: [...mainChatHistory, refinementTurn],
          config: { 
            systemInstruction: REFINEMENT_SYSTEM_INSTRUCTION,
            temperature: 0.7,
            tools: [{googleSearch: {}}],
            thinkingConfig: { thinkingBudget: 32768 },
            maxOutputTokens: 65536,
          },
        }).then(res => {
            setAgentStates(prev => prev.map((a, idx) => idx === index ? { ...a, status: 'done', label: 'Refined' } : a));
            // Update live work state
            setCurrentWork(prev => {
                if (!prev) return prev;
                const newRefined = [...prev.refinedResponses];
                newRefined[index] = res.text;
                return { ...prev, refinedResponses: newRefined };
            });
            return res;
        });
      });
      
      const refinedResponses = await Promise.all(refinementAgentPromises);
      const refinedAnswers = refinedResponses.map(res => res.text);

      // STEP 3: Final Synthesis (Streaming)
      setLoadingStatus('Synthesizing massive final response...');
      setAgentStates(prev => [
        ...prev,
        { id: 'synthesizer', name: 'Synthesizer', status: 'working', label: 'Synthesizing...' }
      ]);
      
      const synthesizerContext = `Here are the ${NUM_AGENTS} refined responses to the user's query. Your task is to synthesize them into the best single, final answer. REMEMBER: 2000+ LINES OF CODE IF APPLICABLE. DO NOT SHORTCUT.\n\n${refinedAnswers.map((answer, i) => `Refined Response ${i + 1}:\n"${answer}"`).join('\n\n')}`;
      const synthesizerTurn: Content = { role: 'user', parts: [...baseApiParts, {text: `\n\n---INTERNAL CONTEXT---\n${synthesizerContext}`}] };
      
      const stream = await ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: [...mainChatHistory, synthesizerTurn],
        config: { 
          systemInstruction: SYNTHESIZER_SYSTEM_INSTRUCTION,
          temperature: 0.7,
          tools: [{googleSearch: {}}],
          thinkingConfig: { thinkingBudget: 32768 },
          maxOutputTokens: 65536, // Ensure max tokens for massive response
        },
      });

      let finalResponseText = '';
      const allGroundingChunks: GroundingChunk[] = [];
      let isFirstChunk = true;

      for await (const chunk of stream) {
        finalResponseText += chunk.text;
        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
            allGroundingChunks.push(...groundingChunks);
        }

        if (isFirstChunk) {
            isFirstChunk = false;
            setIsLoading(false);
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: finalResponseText }] }]);
            // Keep currentWork in state until we attach it to the final message at the end
        } else {
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].parts[0].text = finalResponseText;
                return newMessages;
            });
        }
      }

      const sources = allGroundingChunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title: string; } => !!web && !!web.uri)
        .filter((web, index, self) => index === self.findIndex(w => w.uri === web.uri));

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        lastMessage.sources = sources.length > 0 ? sources : undefined;
        // Attach the final completed work to the message so it stays there
        lastMessage.work = currentWork;
        return newMessages;
      });

      // Clear temporary live state
      setCurrentWork(undefined);

    } catch (error) {
      console.error('Error in agentic workflow:', error);
      setIsLoading(false);
      setCurrentWork(undefined);
      let errorMessage = 'An unexpected error occurred. Please check the console for details and try again.';
      if (error instanceof Error) {
        errorMessage = `Sorry, I encountered an error: ${error.message}. Please try again.`;
      }
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: errorMessage }] }]);
    }
  };

  return (
    <div className="chat-container">
      <header>
        <div className="header-logo">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-1.07 3.97-2.9 5.4z"/>
           </svg>
        </div>
        <h1>Gemini 3 Heavy</h1>
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
                      {msg.parts[0].text}
                    </ReactMarkdown>
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
          <button type="submit" className="send-button" disabled={isLoading} aria-label="Send message">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);