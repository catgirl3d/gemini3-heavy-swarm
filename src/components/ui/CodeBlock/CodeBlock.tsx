import React, { type FC, type ReactNode, useState } from 'react';
import './CodeBlock.css';
import { Logger } from '@shared/utils/logger';

export const CodeBlock: FC<{ children?: ReactNode, className?: string }> = ({ children, className }) => {
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
      new Logger('CodeBlock').error('Failed to copy text: ', err);
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
