import React, { FC, ReactNode } from 'react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { SpinnerIcon, ErrorIcon, CheckIcon, ExpandIcon, ThoughtIcon, DebugIcon, DownloadIcon, RegenerateIcon } from '../icons';
import { ActionMenu } from './ActionMenu';
import { TokenUsage } from './TokenUsage';
import { downloadContent } from '../utils';

interface WorkCardProps {
  title: string;
  statusLabel: string;
  status: 'working' | 'done' | 'error' | 'waiting';
  icon?: ReactNode;
  content: string | null;
  tokenUsage?: any;
  thought?: string | null;
  debugInfo?: any;
  onExpand: () => void;
  onShowThought?: () => void;
  onShowDebug?: () => void;
  onRegenerate?: () => void;
  downloadFilename: string;
  className?: string;
}

export const WorkCard: FC<WorkCardProps> = ({
  title,
  statusLabel,
  status,
  icon,
  content,
  tokenUsage,
  thought,
  debugInfo,
  onExpand,
  onShowThought,
  onShowDebug,
  onRegenerate,
  downloadFilename,
  className = ''
}) => {
  const renderContent = (content: string | null) => {
    if (content === null) return <div className="pending-work">Waiting for agent output...</div>;
    if (content === '') return <div className="pending-work">Thinking...</div>;
    return <MarkdownRenderer content={content} />;
  };

  const actions = [
    ...(thought ? [{
        label: 'Show Thought Process',
        icon: <ThoughtIcon />,
        onClick: onShowThought!
    }] : []),
    ...(debugInfo ? [{
        label: 'Debug Info',
        icon: <DebugIcon />,
        onClick: onShowDebug!
    }] : []),
    ...(content ? [{
        label: 'Download Response',
        icon: <DownloadIcon />,
        onClick: () => downloadContent(downloadFilename, content)
    }] : []),
    ...(onRegenerate ? [{
        label: status === 'error' ? 'Retry' : 'Regenerate',
        icon: <RegenerateIcon />,
        onClick: onRegenerate,
        danger: status === 'error'
    }] : [])
  ];

  return (
    <div className={`work-card ${className} ${status === 'error' ? 'error' : ''}`}>
      <div className="modal-header work-card-header">
        <div className="work-card-title-group">
          <div className={`work-card-icon ${status}`}>
            {status === 'working' ? <SpinnerIcon /> : 
             status === 'error' ? <ErrorIcon /> : 
             status === 'done' ? <CheckIcon /> : 
             icon || null}
          </div>
          <div className="work-card-info">
            <span className="work-card-name">{title}</span>
            <span className={`work-card-status ${status === 'error' ? 'error' : ''}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        {content && (
          <div className="work-card-actions">
            <button
              className="modal-icon-btn expand-work-button"
              onClick={(e) => {
                e.preventDefault();
                onExpand();
              }}
              title="Expand Response"
              aria-label="Expand Response"
            >
              <ExpandIcon />
            </button>
            <ActionMenu actions={actions} />
          </div>
        )}
      </div>
      <div className="modal-body work-card-body">
        {renderContent(content)}
      </div>
      {tokenUsage && (
        <div className="modal-footer work-card-footer">
          <TokenUsage usage={tokenUsage} />
        </div>
      )}
    </div>
  );
};
