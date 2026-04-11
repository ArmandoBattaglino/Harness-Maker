// client/src/canvas/ChatMessage.jsx
// Single message in the Unified Chat View — with full markdown rendering.
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { isStructuredSpawnMode } from '../utils/runtimeModes.js';
import { mdComponents, sanitizeSchema } from '../utils/markdownComponents';
import { formatChatText, formatStreamJsonText } from '../utils/formatChatText';

const ROLE_STYLES = {
  assistant: 'bg-gray-800/80 border-gray-700/60',
  system: 'bg-gray-900/50 border-gray-800 text-gray-500 italic text-[10px]',
  user: 'bg-blue-900/30 border-blue-800/50',
};

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
        <div className={`rounded-lg border px-3.5 py-2.5 min-w-0 ${style}`}>
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
