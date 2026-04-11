// client/src/utils/markdownComponents.jsx
// Shared ReactMarkdown component overrides and sanitization schema
// used by both ChatMessage and AgentOutputPanel.
import { useState, useCallback } from 'react';
import { defaultSchema } from 'rehype-sanitize';

export const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), 'className'],
  },
};

export function CodeBlock({ className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');
  const isInline = !match && !code.includes('\n');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  if (isInline) {
    return (
      <code
        className="bg-gray-900/80 text-code-purple px-1.5 py-0.5 rounded text-[0.8em] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="group relative my-2">
      <div className="flex items-center justify-between bg-gray-900 border border-gray-700/60 rounded-t px-3 py-1">
        <span className="text-[10px] text-gray-500 font-mono">{match?.[1] || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="bg-gray-950 border border-t-0 border-gray-700/60 rounded-b p-3 overflow-x-auto !my-0">
        <code className="text-[11px] leading-[1.6] text-code-text font-mono" {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export const mdComponents = {
  code: CodeBlock,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded border border-gray-700/60" style={{ overflowWrap: 'normal', wordBreak: 'normal' }}>
      <table className="text-[12px] border-collapse" style={{ minWidth: 'max-content' }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-900/80">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-primary-light border-b border-gray-700/60 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 text-[12px] text-gray-300 border-b border-gray-800/60 whitespace-nowrap">{children}</td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="even:bg-gray-900/40" {...props}>{children}</tr>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-gray-400 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-gray-700/60 my-3" />,
  h1: ({ children }) => (
    <h1 className="text-[15px] font-bold text-primary-light mt-3 mb-1.5">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[14px] font-bold text-primary-light mt-2.5 mb-1">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-semibold text-gray-100 mt-2 mb-1">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[12px] font-semibold text-gray-200 mt-1.5 mb-0.5">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-[12.5px] leading-[1.7] text-gray-200 my-1.5">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 my-1.5 space-y-0.5 text-[12.5px] text-gray-200">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 my-1.5 space-y-0.5 text-[12.5px] text-gray-200">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="text-gray-300">{children}</em>,
};
