import React, { type FC, type RefObject, memo } from 'react';
import { AgentAvatar } from '@/components/chat/AgentAvatar';
import { EmptyState } from '@/components/chat/EmptyState';
import { MarkdownRenderer, LoadingIndicator } from '@/components/ui';
import { ShowWork } from '@/components/chat/ShowWork';
import { DownloadIcon, CopyIcon, CheckIcon } from '@/components/chat/ShowWork/icons';
import { downloadContent } from '@/components/chat/ShowWork/utils';
import { Sources } from '@/components/chat/Sources';
import { type Message, type Work, type ProviderType } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
import { selectActiveSession, selectActiveSessionMessageId, useAgentStore } from '@/stores/agentStore';
import { getStepResults } from '@/utils/swarm/workHelpers';
import { getMessageDisplaySources, getMessageDisplayText, getMessageDisplayWork } from '@/utils/chat/messageProjection';
import { isLatestRegenerableMessage } from '@/utils/swarm/sessionHelpers';
import { Logger } from '@shared/utils/logger';
import { copyTextToClipboard } from '@/utils/common/clipboard';

const logger = new Logger('MessageList');
const EMPTY_WORK: Work = { results: {} };

type ActionButtonClickResult = boolean | void | Promise<boolean | void>;

const copyResponseText = (text: string): Promise<boolean> => copyTextToClipboard(text)
  .then(() => true)
  .catch((error: unknown) => {
    logger.error('Failed to copy response:', error);
    return false;
  });

interface ActionButtonProps {
  onClick: () => ActionButtonClickResult;
  icon: React.ReactNode;
  successIcon: React.ReactNode;
  title: string;
  successTitle: string;
}

const ActionButton: FC<ActionButtonProps> = ({ onClick, icon, successIcon, title, successTitle }) => {
  const [complete, setComplete] = React.useState(false);

  const handleClick = () => {
    const markComplete = (result: boolean | void) => {
      if (result === false) return;

      setComplete(true);
      setTimeout(() => setComplete(false), 2000);
    };

    try {
      void Promise.resolve(onClick())
        .then(markComplete)
        .catch((error: unknown) => {
          logger.error('Action button handler failed:', error);
        });
    } catch (error) {
      logger.error('Action button handler failed:', error);
    }
  };

  return (
    <button
      className={`message-action-btn ${complete ? 'complete' : ''}`}
      onClick={handleClick}
      title={complete ? successTitle : title}
    >
      {complete ? successIcon : icon}
    </button>
  );
};

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isPaused: boolean;
  error: string | null;
  loadingStatus: string;
  modelDisplayName: string;
  provider: ProviderType;
  model: string;
  messageListRef: RefObject<HTMLDivElement>;
  onPromptClick: (prompt: string) => void;
  onContinue: () => void;
  onRetry: () => void;
  onRegenerate: (messageId: string, phase: StepId, agentIndex: number) => void;
}

const MessageListComponent: FC<MessageListProps> = ({
  messages,
  isLoading,
  isPaused,
  error,
  loadingStatus,
  modelDisplayName,
  provider,
  model,
  messageListRef,
  onPromptClick,
  onContinue,
  onRetry,
  onRegenerate
}) => {
  const activeSessionMessageId = useAgentStore(selectActiveSessionMessageId);
  const activeSession = useAgentStore(selectActiveSession);
  const activeAgentStates = activeSession?.agentStates ?? [];
  const activeWork = activeSession?.work;

  return (
    <div className="message-list" ref={messageListRef}>
      {messages.length === 0 && !isLoading ? (
        <EmptyState 
          onPromptClick={onPromptClick} 
          modelDisplayName={modelDisplayName} 
          provider={provider}
          model={model}
        />
      ) : (
        messages.map((msg, index) => {
          // Determine if this message is actively being generated/regenerated
          const isActiveGeneration = isLoading && msg.id === activeSessionMessageId;
          // Only the active model row is allowed to read from the live session store.
          // Historical rows must stay pinned to their message snapshot.
          const liveWork = isActiveGeneration ? activeWork : undefined;
          // This is the single render-time work source for the row: visibility checks,
          // markdown text, sources, loading UI, and ShowWork all read from the same object.
          const effectiveWork = getMessageDisplayWork(msg, liveWork);
          const displayText = getMessageDisplayText(msg, liveWork);
          const displaySources = getMessageDisplaySources(msg, liveWork);
          const hasText = displayText.length > 0;
          // Check if message has valid work content OR active agents (even if results are empty/error)
          // preventing the message from being hidden if it only contains error states
          const hasWork = !!effectiveWork && (
            (!!effectiveWork.results && Object.values(effectiveWork.results).some(v => 
              Array.isArray(v) ? v.some(item => !!item) : !!v
            )) || 
            (!!effectiveWork.agentStates && effectiveWork.agentStates.length > 0)
          );
          
          const isLast = index === messages.length - 1;
          
          // Check if we have substantial completed work (like initial drafts) that should be shown despite an error
          const hasCompletedDrafts = effectiveWork
            ? getStepResults(effectiveWork, STEPS.INITIAL).some(draft => !!draft && draft.length > 0)
            : false;

          // CRITICAL: If a global error occurred, hide the last model message if it has no final text AND no completed drafts.
          // This prevents showing an empty/broken "Show Work" card alongside the main error banner,
          // while still preserving visibility of drafts if the error occurred later (e.g. during synthesis).
          if (error && isLast && msg.role === 'model' && !hasText && !hasCompletedDrafts) {
             return null;
          }
          
          // Skip empty model messages ONLY if not currently loading
          if (msg.role === 'model' && !hasText && !hasWork && !isActiveGeneration) {
            return null;
          }
          
          return (
            <div key={msg.id} className={`message-wrapper ${msg.role}`}>
              <AgentAvatar type={msg.role} provider={provider} model={model} />
              <div className={`message ${msg.role}`}>
                {msg.role === 'model' && hasText && (
                  <div className="agent-label-header">
                    <span className="agent-label">Synthesizer Agent</span>
                    <div className="message-actions-group">
                      <ActionButton 
                        onClick={() => copyResponseText(displayText)}
                        icon={<CopyIcon />}
                        successIcon={<CheckIcon />}
                        title="Copy Response"
                        successTitle="Copied!"
                      />
                      <ActionButton 
                        onClick={() => downloadContent('Synthesis_Report.md', displayText)}
                        icon={<DownloadIcon />}
                        successIcon={<CheckIcon />}
                        title="Export Response"
                        successTitle="Exported!"
                      />
                    </div>
                  </div>
                )}
                {msg.image && <img src={msg.image} alt="User upload" className="message-image" />}
                {hasText && (
                  msg.role === 'user' ? displayText : <MarkdownRenderer content={displayText} />
                )}
                
                {/* Model messages: Show work if available, otherwise show loading indicator if actively generating */}
                {msg.role === 'model' && (
                  <>
                    {/* 1. Progress/Status Header (Live only) */}
                    {isActiveGeneration && (
                      <LoadingIndicator
                        noWrapper
                        status={loadingStatus}
                        agentStates={activeAgentStates}
                        isPaused={isPaused}
                        messageId={activeSessionMessageId}
                        onContinue={onContinue}
                        onRegenerate={(phase, agentIndex) => onRegenerate(msg.id, phase as StepId, agentIndex)}
                        work={effectiveWork}
                        provider={provider}
                        model={model}
                      />
                    )}

                    {/* 2. Work Content (Live or History) */}
                    {(() => {
                      if (!effectiveWork) return null;
                          
                      // Allow regeneration only for the latest assistant turn that was not manually stopped.
                      const isStopped = !!(effectiveWork.isStopped || msg.work?.isStopped);
                      const canRegenerate = isLatestRegenerableMessage(messages, msg.id) && !isStopped;
                      const handleRegenerate = canRegenerate 
                        ? (phase: string, agentIndex: number) => onRegenerate(msg.id, phase as StepId, agentIndex)
                        : undefined;
                      
                      return (
                        <ShowWork
                          work={effectiveWork ?? EMPTY_WORK}
                          messageId={msg.id}
                          isLive={isActiveGeneration}
                          isPaused={isPaused}
                          onContinue={onContinue}
                          onRegenerate={handleRegenerate}
                        />
                      );
                    })()}
                  </>
                )}
                
                {displaySources && <Sources sources={displaySources} />}
              </div>
            </div>
          );
        })
      )}
      
      {/* Show loading indicator at bottom only if generating a NEW message not yet in the list */}
      {isLoading && activeSessionMessageId && !messages.some(m => m.id === activeSessionMessageId) && (
        <div className="message-wrapper model loading-state">
          <AgentAvatar type="model" provider={provider} model={model} />
          <div className="loading-container-wrapper">
            <LoadingIndicator
              noWrapper
              status={loadingStatus}
              agentStates={activeAgentStates}
              isPaused={isPaused}
              messageId={activeSessionMessageId}
              onContinue={onContinue}
              onRegenerate={(phase, agentIndex) => onRegenerate(activeSessionMessageId, phase as StepId, agentIndex)}
              work={activeWork}
              provider={provider}
              model={model}
            />
            {activeWork && (
              <div className="show-work-wrapper">
                <ShowWork
                  work={activeWork}
                  isLive={true}
                  messageId={activeSessionMessageId}
                  isPaused={isPaused}
                  onContinue={onContinue}
                  onRegenerate={isPaused ? (phase, agentIndex) => onRegenerate(activeSessionMessageId, phase as StepId, agentIndex) : undefined}
                />
              </div>
            )}
          </div>
        </div>
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
