import React, { FC, RefObject, memo } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { EmptyState } from '@/components/EmptyState';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ShowWork } from '@/components/ShowWork';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Sources } from '@/components/Sources';
import { Message, AgentState, Work } from '@/types';
import { StepId } from '@/types/steps';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isPaused: boolean;
  error: string | null;
  loadingStatus: string;
  agentStates: AgentState[];
  currentWork: Work | undefined;
  modelDisplayName: string;
  messageListRef: RefObject<HTMLDivElement>;
  onPromptClick: (prompt: string) => void;
  onContinue: () => void;
  onRetry: () => void;
  onRegenerate: (msgIndex: number, phase: StepId, agentIndex: number) => void;
}

const MessageListComponent: FC<MessageListProps> = ({
  messages,
  isLoading,
  isPaused,
  error,
  loadingStatus,
  agentStates,
  currentWork,
  modelDisplayName,
  messageListRef,
  onPromptClick,
  onContinue,
  onRetry,
  onRegenerate
}) => {
  return (
    <div className="message-list" ref={messageListRef}>
      {messages.length === 0 && !isLoading ? (
        <EmptyState onPromptClick={onPromptClick} modelDisplayName={modelDisplayName} />
      ) : (
        messages.map((msg, index) => (
          <div key={msg.id} className={`message-wrapper ${msg.role}`}>
            <AgentAvatar type={msg.role} />
            <div className={`message ${msg.role}`}>
              {msg.role === 'model' && <div className="agent-label-header"><span className="agent-label">Synthesizer Agent</span></div>}
              {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
              {msg.parts?.[0]?.text && (
                msg.role === 'user' ? msg.parts[0].text : <MarkdownRenderer content={msg.parts[0].text} />
              )}
              {msg.work && (
                  <ShowWork
                      work={msg.work}
                      onRegenerate={(phase, agentIndex) => onRegenerate(index, phase as StepId, agentIndex)}
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
              agentStates={agentStates}
              currentWork={currentWork}
              isPaused={isPaused}
              onContinue={onContinue}
              onRegenerate={(phase, agentIndex) => onRegenerate(messages.length - 1, phase as StepId, agentIndex)}
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
          <button className="retry-button" onClick={onRetry}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

// Memoized version for performance optimization
export const MessageList = memo(MessageListComponent);
