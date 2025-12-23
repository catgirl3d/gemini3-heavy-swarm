import React, { FC, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { formatDebugInfo } from '../utils';
import { CloseIcon } from '../icons';

export const DebugModal: FC<{ title: string; debugInfo: any; onClose: () => void }> = ({ title, debugInfo, onClose }) => {
    const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

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
                    <div className="header-content">
                        <h3>{title}</h3>
                        <div className="debug-view-toggle">
                            <button
                                className={`toggle-btn ${viewMode === 'formatted' ? 'active' : ''}`}
                                onClick={() => setViewMode('formatted')}
                            >
                                Formatted
                            </button>
                            <button
                                className={`toggle-btn ${viewMode === 'raw' ? 'active' : ''}`}
                                onClick={() => setViewMode('raw')}
                            >
                                Raw JSON
                            </button>
                        </div>
                    </div>
                    <button className="close-modal-button" onClick={onClose} aria-label="Close">
                        <CloseIcon />
                    </button>
                </div>
                <div className="modal-body">
                    {viewMode === 'formatted' ? (
                        <MarkdownRenderer content={formatDebugInfo(debugInfo)} />
                    ) : (
                        <div className="raw-debug-container">
                            <button
                                className="copy-raw-button"
                                onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                                }}
                                title="Copy Raw JSON"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                </svg>
                                Copy
                            </button>
                            <pre className="raw-debug-view">
                                {JSON.stringify(debugInfo, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
