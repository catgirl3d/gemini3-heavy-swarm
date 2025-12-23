import React, { FC, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { CloseIcon } from '../icons';

export const WorkModal: FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container work-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-modal-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
            <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>,
    document.body
  );
};
