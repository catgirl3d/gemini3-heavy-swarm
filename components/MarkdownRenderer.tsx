import React, { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

export const MarkdownRenderer: FC<{ content: string }> = ({ content }) => (
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
      {content}
    </ReactMarkdown>
  </div>
);