import React, { type FC, useState } from 'react';
import { MarkdownRenderer } from '@/components/ui';
import { BaseModal } from '@/components/modals';
import { formatDebugInfo } from '@/components/chat/ShowWork/utils';
import { type StepDebugInfo } from '@/types/app-types';
import { Logger } from '@shared/utils/logger';
import { copyTextToClipboard } from '@/utils/common/clipboard';

const logger = new Logger('DebugModal');

export const DebugModal: FC<{ title: string; debugInfo: StepDebugInfo | undefined; onClose: () => void }> = ({ title, debugInfo, onClose }) => {
    const [viewMode, setViewMode] = useState<'formatted' | 'raw' | 'readable'>('formatted');
    const rawDebugJson = JSON.stringify(debugInfo, null, 2) ?? 'undefined';

    const getReadableJson = (data: unknown): string => {
        // Simple YAML-like formatter for better readability
        const format = (obj: unknown, level: number = 0): string => {
            const indent = '  '.repeat(level);
            
            if (obj === null) return 'null';
            if (Array.isArray(obj)) {
                if (obj.length === 0) return '[]';
                return '\n' + obj.map(item => `${indent}- ${format(item, level + 1).trim()}`).join('\n');
            }
            
            if (typeof obj === 'object') {
                const entries = Object.entries(obj as Record<string, unknown>);
                if (entries.length === 0) return '{}';
                
                return '\n' + entries.map(([key, value]) => {
                    // Skip noisy binary data
                    if (key === 'inlineData') return `${indent}${key}: [Binary Data]`;
                    
                    const formattedValue = format(value, level + 1);
                    const isMultiline = typeof value === 'string' && value.includes('\n');
                    
                    if (isMultiline) {
                        return `${indent}${key}: |\n${value.split('\n').map(line => '  '.repeat(level + 1) + line).join('\n')}`;
                    }
                    
                    return `${indent}${key}:${formattedValue.startsWith('\n') ? formattedValue : ' ' + formattedValue}`;
                }).join('\n');
            }
            
            if (typeof obj === 'string') {
                if (obj.length > 2000 && !obj.includes('<')) return `[Long string: ${obj.length} chars]`;
                return obj;
            }
            
            return String(obj);
        };
        
        return format(data).trim();
    };

    const copyRawDebugJson = () => {
        void copyTextToClipboard(rawDebugJson).catch((error: unknown) => {
            logger.error('Failed to copy raw debug JSON:', error);
        });
    };

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
                        className={`toggle-btn ${viewMode === 'readable' ? 'active' : ''}`}
                        onClick={() => setViewMode('readable')}
                    >
                        Readable JSON
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
                ) : viewMode === 'readable' ? (
                    <div className="raw-debug-container">
                        <pre className="raw-debug-view">
                            {getReadableJson(debugInfo)}
                        </pre>
                    </div>
                ) : (

                    <div className="raw-debug-container">
                        <button
                            className="copy-raw-button"
                            onClick={copyRawDebugJson}
                            title="Copy Raw JSON"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                            Copy
                        </button>
                        <pre className="raw-debug-view">
                            {rawDebugJson}
                        </pre>
                    </div>
                )}
            </BaseModal.Body>

        </BaseModal>
    );
};
