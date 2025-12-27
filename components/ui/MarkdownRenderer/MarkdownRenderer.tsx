import React, { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/components/ui/CodeBlock';
import './MarkdownRenderer.css';

const MarkdownRendererComponent: FC<{ content: string }> = ({ content }) => (
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

// Memoized to prevent expensive markdown parsing on every render
export const MarkdownRenderer = React.memo(MarkdownRendererComponent);
