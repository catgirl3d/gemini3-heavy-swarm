import React, { FC, useState } from 'react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { BaseModal } from '@/components/BaseModal';
import { formatDebugInfo } from '../utils';

export const DebugModal: FC<{ title: string; debugInfo: any; onClose: () => void }> = ({ title, debugInfo, onClose }) => {
    const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            size="xl"
            className=""
        >
            <BaseModal.Header title={title} onClose={onClose}>
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
            </BaseModal.Header>
            <BaseModal.Body>
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
            </BaseModal.Body>
        </BaseModal>
    );
};
