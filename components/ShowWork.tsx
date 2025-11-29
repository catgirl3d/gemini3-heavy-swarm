import React, { FC, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Work } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

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

export const ShowWork: FC<{ work: Work, isLive?: boolean }> = ({ work, isLive = false }) => {
  const [modalData, setModalData] = useState<{title: string, content: string} | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const renderContent = (content: string | null) => {
    if (content === null) return <div className="pending-work">Waiting for agent output...</div>;
    if (content === '') return <div className="pending-work">Thinking...</div>;
    return <MarkdownRenderer content={content} />;
  };

  return (
    <>
    <details className="show-work-container" ref={detailsRef}>
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
                        {work.agentNames ? work.agentNames[i] : `Agent ${i + 1}`}
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
                        {work.agentNames ? work.agentNames[i] : `Agent ${i + 1}`}
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
        <button
          className={`show-work-button ${!isLive ? 'completed' : ''}`}
          onClick={() => {
            if (detailsRef.current) {
              detailsRef.current.open = false;
            }
          }}
          style={{ marginTop: '1rem' }}
        >
          <span>Collapse Agent Work</span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="work-arrow" style={{ transform: 'rotate(180deg)' }}>
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </details>
    {modalData && <WorkModal title={modalData.title} content={modalData.content} onClose={() => setModalData(null)} />}
    </>
  );
};