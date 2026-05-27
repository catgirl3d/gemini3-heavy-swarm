import React, { type FC, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/components/ui/CodeBlock';
import './MarkdownRenderer.css';

interface CodeElementProps {
  children?: ReactNode;
  className?: string;
}

const isCodeElement = (value: ReactNode): value is ReactElement<CodeElementProps, 'code'> => {
  return React.isValidElement<CodeElementProps>(value) && value.type === 'code';
};

const MarkdownRendererComponent: FC<{ content: string }> = ({ content }) => (
  <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre(props: React.ComponentProps<'pre'>) {
          const { children, ...rest } = props;
          const firstChild = React.Children.toArray(children)[0];

          if (!isCodeElement(firstChild)) {
            return <pre {...rest}>{children}</pre>;
          }

          return <CodeBlock className={firstChild.props.className}>{firstChild.props.children}</CodeBlock>;
        },
        table(props: React.ComponentProps<'table'>) {
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
