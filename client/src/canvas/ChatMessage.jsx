// client/src/canvas/ChatMessage.jsx
// Single message in the Unified Chat View — with full markdown rendering.
import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { stripAnsi } from '../utils/stripAnsi';
import { isStructuredSpawnMode } from '../utils/runtimeModes.js';
import { repairTokenSplitting } from '../utils/repairTokenSpacing';

const ROLE_STYLES = {
  assistant: 'bg-gray-800/80 border-gray-700/60',
  system: 'bg-gray-900/50 border-gray-800 text-gray-500 italic text-[10px]',
  user: 'bg-blue-900/30 border-blue-800/50',
};

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const NOISE_LINE_PATTERNS = [
  /^(?:\w{2,20}ing(?:\.{2,}|…)\s*){2,}$/i,
  /(?:bypass ?permissions ?on|shift\+tab ?to ?cycle|\/buddy)/i,
  /(?:ctrl\+[a-z]|to (?:edit|cycle)|now using extra usage|╭|╰|─{3,}|▸▸|❯❯)/i,
  /(?:fluttering|running stop hook|◐|◑|◒|◓|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏)/i,
  /^[….\s\w]{0,10}cycle\)?[\s◐◑◒◓]*\w*$/i,
  /^❯\s/,
  /(?:claude runtime is active|continue the workflow using the shared task context|is not the end of the workflow yet|do not stop at the done marker|you are a [a-z]+ agent\b|execute the workflow goal described|MUST emit a handoff token|downstream target is:|hand off with the most useful)/i,
];

function isMarkdownStructuralLine(line) {
  const trimmed = line.trimStart();
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^```/.test(trimmed)) return true;
  if (/^\|.+\|/.test(trimmed)) return true;
  if (/^[-*+]\s/.test(trimmed)) return true;
  if (/^\d+\.\s/.test(trimmed)) return true;
  if (/^>\s/.test(trimmed)) return true;
  if (/^---+$/.test(trimmed)) return true;
  if (/^[\s\t]+/.test(line) && line.trim().length > 0) return true;
  return false;
}

function isNoiseLine(line) {
  return NOISE_LINE_PATTERNS.some((re) => re.test(line));
}

function isGarbledLine(line) {
  const dotRuns = line.match(/[.…]{2,}/g) || [];
  const dotLen = dotRuns.reduce((s, r) => s + r.length, 0);
  if (dotLen > 0 && dotLen / line.length > 0.12) {
    const validWords = (line.match(/[A-Za-z\u00C0-\u00FF]{4,}/g) || [])
      .filter((w) => !/^(.)\1{2,}$/i.test(w));
    if (validWords.length < 2) return true;
  }
  return false;
}

/**
 * Clean PTY terminal output for markdown rendering.
 * Preserves markdown structural elements (headings, code fences, tables,
 * lists, blockquotes) while filtering ConPTY noise and garbled lines.
 */
function formatChatText(rawText = '') {
  let text = stripAnsi(String(rawText ?? ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const jsonStart = text.search(/\{\s*"/);
  if (jsonStart > 0) {
    const possibleJson = text.slice(jsonStart);
    const jsonPunctuation = (possibleJson.match(/[{}":[\],]/g) || []).length;
    if (jsonPunctuation > Math.max(10, Math.floor(possibleJson.length * 0.12))) {
      text = text.slice(0, jsonStart).trimEnd();
    }
  }

  let insideCodeFence = false;
  const cleanedLines = [];

  for (const rawLine of text.split('\n')) {
    if (/^```/.test(rawLine.trimStart())) {
      insideCodeFence = !insideCodeFence;
      cleanedLines.push(rawLine);
      continue;
    }
    if (insideCodeFence) {
      cleanedLines.push(rawLine);
      continue;
    }
    if (isMarkdownStructuralLine(rawLine)) {
      cleanedLines.push(rawLine);
      continue;
    }
    const trimmed = rawLine.trim();
    if (!trimmed) {
      cleanedLines.push('');
      continue;
    }
    if (isNoiseLine(trimmed)) continue;
    if (isGarbledLine(trimmed)) continue;
    cleanedLines.push(trimmed);
  }

  let result = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  result = result.replace(
    /^(?:[a-zA-Z\u00C0-\u00FF.…]{1,4}\s+){3,}(?=[A-Z\u00C0-\u00D6][a-z\u00E0-\u00FF]{3,})/u,
    '',
  );
  result = result.replace(
    /^(?:[a-z\u00E0-\u00FF.…]{1,15}\s+)+(?=[A-Z\u00C0-\u00D6])/u,
    '',
  );

  result = repairTokenSplitting(result);

  return result;
}

function formatStreamJsonText(rawText = '') {
  return stripAnsi(String(rawText ?? ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function formatToolArgs(partialArgs = '') {
  const raw = String(partialArgs ?? '').trim();
  if (!raw) return '{}';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatTokenCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function CostFooter({ cost }) {
  if (!cost) return null;
  const inputTokens = Number(cost.inputTokens ?? 0);
  const outputTokens = Number(cost.outputTokens ?? 0);
  const cacheReadTokens = Number(cost.cacheReadTokens ?? 0);
  const cacheWriteTokens = Number(cost.cacheWriteTokens ?? 0);
  const totalTokens = inputTokens + outputTokens;
  const costUsd = Number(cost.costUsd ?? 0);
  const durationMs = Number(cost.durationMs ?? 0);
  const hasCache = cacheReadTokens > 0 || cacheWriteTokens > 0;

  return (
    <div className="mt-2 rounded border border-gray-700/50 bg-gray-900/50 px-2.5 py-1.5 text-[10px] leading-[1.7] overflow-hidden">
      <div className="flex items-center gap-3 text-gray-400 flex-wrap">
        <span>
          <span className="text-gray-500">In:</span>{' '}
          <span className="font-medium text-gray-300">{formatTokenCount(inputTokens)}</span>
        </span>
        <span>
          <span className="text-gray-500">Out:</span>{' '}
          <span className="font-medium text-gray-300">{formatTokenCount(outputTokens)}</span>
        </span>
        <span>
          <span className="text-gray-500">Total:</span>{' '}
          <span className="font-semibold text-white">{formatTokenCount(totalTokens)}</span>
        </span>
      </div>
      <div className="flex items-center gap-3 text-gray-500 flex-wrap">
        <span>
          <span className="text-emerald-400 font-semibold">${costUsd.toFixed(4)}</span>
        </span>
        {durationMs > 0 && <span>{(durationMs / 1000).toFixed(1)}s</span>}
        {hasCache && (
          <span className="text-gray-600">
            cache {cacheReadTokens > 0 ? `${formatTokenCount(cacheReadTokens)}r` : ''}{cacheReadTokens > 0 && cacheWriteTokens > 0 ? '/' : ''}{cacheWriteTokens > 0 ? `${formatTokenCount(cacheWriteTokens)}w` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), 'className'],
  },
};

// ─── Custom ReactMarkdown component overrides ──────────────────────────────

function CodeBlock({ className, children, ...props }) {
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

const mdComponents = {
  code: CodeBlock,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded border border-gray-700/60">
      <table className="w-full text-[12px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-900/80">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-primary-light border-b border-gray-700/60">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 text-[12px] text-gray-300 border-b border-gray-800/60">{children}</td>
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

// ─── Collapsible meta block (tool use, thinking) ───────────────────────────

function CollapsibleMetaBlock({ title, children, tone = 'gray' }) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === 'amber'
    ? 'border-amber-900/60 bg-amber-950/30 text-amber-100'
    : 'border-gray-700 bg-gray-900/70 text-gray-300';

  return (
    <div className={`mt-2 rounded border overflow-hidden ${toneClass}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em]"
      >
        <span className="truncate">{title}</span>
        <span className="text-[9px] shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-inherit px-2 py-2 text-[11px] leading-5 overflow-x-auto">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ChatMessage({ message, agentLabel }) {
  const { role, text, timestamp, nodeId, spawnMode, toolUse, thinking, cost } = message;
  const style = ROLE_STYLES[role] || ROLE_STYLES.assistant;
  const isStreamJson = isStructuredSpawnMode(spawnMode);
  const displayText = role === 'system'
    ? text
    : isStreamJson
    ? formatStreamJsonText(text)
    : formatChatText(text);

  if (role === 'system') {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-[10px] text-gray-600 shrink-0">{text}</span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <div className={`rounded-lg border px-3.5 py-2.5 overflow-hidden min-w-0 ${style}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[11px] font-semibold ${role === 'user' ? 'text-green-400' : 'text-blue-400'}`}>
            {role === 'user' ? 'You' : (agentLabel || nodeId?.slice(0, 12) || 'Agent')}
          </span>
          {role === 'user' && agentLabel && (
            <span className="text-[10px] text-gray-500">to {agentLabel}</span>
          )}
          <span className="text-[10px] text-gray-600">{formatTime(timestamp)}</span>
        </div>
        <div className="min-w-0 break-words overflow-wrap-anywhere">
          {displayText ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} components={mdComponents}>
              {displayText}
            </ReactMarkdown>
          ) : (
            <p className="text-[12px] text-gray-400 italic">Structured handoff sent.</p>
          )}
        </div>
        {isStreamJson && Array.isArray(toolUse) && toolUse.map((tool, index) => (
          <CollapsibleMetaBlock
            key={`${tool.toolUseId || tool.toolName || 'tool'}-${index}`}
            title={tool.toolName || 'Tool'}
            tone="amber"
          >
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-amber-100">
              {formatToolArgs(tool.partialArgs)}
            </pre>
          </CollapsibleMetaBlock>
        ))}
        {isStreamJson && thinking && (
          <CollapsibleMetaBlock title="Thinking">
            <div className="italic text-gray-400">
              {typeof thinking === 'string' ? thinking : 'Thinking block captured for this turn.'}
            </div>
          </CollapsibleMetaBlock>
        )}
        {cost && <CostFooter cost={cost} />}
      </div>
    </div>
  );
}
