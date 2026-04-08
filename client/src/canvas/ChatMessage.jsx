// client/src/canvas/ChatMessage.jsx
// Single message in the Unified Chat View.
import { useState } from 'react';
import { stripAnsi } from '../utils/stripAnsi';

const ROLE_STYLES = {
  assistant: 'bg-gray-800 border-gray-700 text-gray-200',
  system: 'bg-gray-900/50 border-gray-800 text-gray-500 italic text-[10px]',
  user: 'bg-blue-900/40 border-blue-800 text-blue-200',
};

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Repair ConPTY word fusion: when the terminal drops spaces between words,
 * producing long runs of letters like "nonesistonocusciniéserrature".
 * Insert spaces at camelCase boundaries and before/after common Italian
 * function words embedded in long fused tokens.
 */
function repairWordFusion(text) {
  // 1. Insert space at digit-letter boundaries (ConPTY fuses numbers and words)
  //    "156metrieaIto48" → "156 metrieaIto 48"
  //    Require 3+ letters to avoid breaking "v5", "m2", etc.
  text = text.replace(/(\d)([a-zA-Z\u00C0-\u00FF]{3,})/g, '$1 $2');
  text = text.replace(/([a-zA-Z\u00C0-\u00FF]{3,})(\d)/g, '$1 $2');

  // 2. Process long letter-only tokens (18+ chars) for word fusion repair
  text = text.replace(/[\p{L}\p{M}]{18,}/gu, (token) => {
    // 2a. Insert space before uppercase after lowercase (camelCase fusion)
    let fixed = token.replace(/([a-z\u00E0-\u00FF])([A-Z\u00C0-\u00D6])/g, '$1 $2');
    if (fixed.includes(' ')) return fixed;
    // 2b. All-lowercase fusion: insert spaces around common Italian function
    //     words (articles, prepositions, conjunctions) flanked by 3+ letters.
    const ITA_LONG = 'della|delle|degli|dello|nella|nelle|negli|nello|sulla|sulle|sugli|sullo|dalla|dalle|dagli|dallo|alla|alle|agli|allo|quando|anche|ancora|sempre|prima|dopo|senza|dentro|fuori|oltre|sotto|sopra|circa|insieme|durante|mentre|come|sono|tutto|questo|quella|quello|questi|quelle|immaginate|esistono|dormire|sveglia|potere|poter|occhio|aperto|capace|accogliere|marinai|flotta|imperiale|attraverso|spettatori|costruzione|sotterranei|destinati|gladiatori|macchinari|stupefacente|inaugurazione|interamente|autentiche|battaglie|prodigio|soltanto';
    const reIta = new RegExp(`(?<=[a-z\\u00E0-\\u00FF]{3})(${ITA_LONG})(?=[a-z\\u00E0-\\u00FF]{2})`, 'gi');
    fixed = token.replace(reIta, ' $1 ');
    if (fixed !== token) return fixed.replace(/\s{2,}/g, ' ').trim();
    // 2c. Shorter function words — require 4+ chars flanking to reduce false positives
    const SHORT = 'non|del|dei|con|per|che|nel|sul|fra|tra|una|uno|gli';
    const reShort = new RegExp(`(?<=[a-z\\u00E0-\\u00FF]{4})(${SHORT})(?=[a-z\\u00E0-\\u00FF]{3})`, 'gi');
    fixed = token.replace(reShort, ' $1 ');
    if (fixed !== token) return fixed.replace(/\s{2,}/g, ' ').trim();
    return token;
  });

  return text;
}

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

  const cleanedLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(?:\w{2,20}ing(?:\.{2,}|…)\s*){2,}$/i.test(line))
    .filter((line) => !/(?:bypass ?permissions ?on|shift\+tab ?to ?cycle|\/buddy)/i.test(line))
    .filter((line) => !/(?:ctrl\+[a-z]|to (?:edit|cycle)|now using extra usage|╭|╰|─{3,}|▸▸|❯❯)/i.test(line))
    .filter((line) => !/(?:fluttering|running stop hook|◐|◑|◒|◓|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏)/i.test(line))
    .filter((line) => !/^[….\s\w]{0,10}cycle\)?[\s◐◑◒◓]*\w*$/i.test(line))
    .filter((line) => !/^❯\s/.test(line))
    .filter((line) => !/(?:claude runtime is active|continue the workflow using the shared task context|is not the end of the workflow yet|do not stop at the done marker|you are a [a-z]+ agent\b|execute the workflow goal described|MUST emit a handoff token|downstream target is:|hand off with the most useful)/i.test(line))
    // Reject garbled ConPTY lines: dots/ellipsis scattered among fragments
    .filter((line) => {
      const dotRuns = line.match(/[.…]{2,}/g) || [];
      const dotLen = dotRuns.reduce((s, r) => s + r.length, 0);
      if (dotLen > 0 && dotLen / line.length > 0.12) {
        const validWords = (line.match(/[A-Za-z\u00C0-\u00FF]{4,}/g) || [])
          .filter(w => !/^(.)\1{2,}$/i.test(w));
        if (validWords.length < 2) return false;
      }
      return true;
    });

  let result = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Strip leading garbled ConPTY prefix before a real sentence start.
  // Matches runs of short fragments (1-4 chars) with dots/ellipsis, followed by
  // a proper word (uppercase + 3+ lowercase = real sentence start).
  // e.g. "gi...ng Ecco il paragrafo" → "Ecco il paragrafo"
  // e.g. "Booo st pap ini …ng… tra o B Sembra che" → "Sembra che"
  result = result.replace(/^(?:[a-zA-Z\u00C0-\u00FF.…]{1,4}\s+){3,}(?:[a-zA-Z\u00C0-\u00FF.…]{1,4}\s+)*(?=[A-Z\u00C0-\u00D6][a-z\u00E0-\u00FF]{3,})/u, '');
  // Also strip lowercase-only prefix (original pattern)
  result = result.replace(/^(?:[a-z\u00E0-\u00FF.…]{1,15}\s+)+(?=[A-Z\u00C0-\u00D6])/u, '');

  // Repair word fusion from ConPTY space-stripping
  result = repairWordFusion(result);

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

function formatCostFooter(cost) {
  if (!cost) return '';
  const inputTokens = Number(cost.inputTokens ?? 0);
  const outputTokens = Number(cost.outputTokens ?? 0);
  const cacheReadTokens = Number(cost.cacheReadTokens ?? 0);
  const cacheWriteTokens = Number(cost.cacheWriteTokens ?? 0);
  const costUsd = Number(cost.costUsd ?? 0);
  const durationMs = Number(cost.durationMs ?? 0);
  const cachePart = (cacheReadTokens > 0 || cacheWriteTokens > 0)
    ? ` (cache: ${cacheReadTokens}read / ${cacheWriteTokens}write)`
    : '';
  return `Tokens: ${inputTokens}in / ${outputTokens}out${cachePart} | Cost: $${costUsd.toFixed(4)} | ${durationMs}ms`;
}

function CollapsibleMetaBlock({ title, children, tone = 'gray' }) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === 'amber'
    ? 'border-amber-900/60 bg-amber-950/30 text-amber-100'
    : 'border-gray-700 bg-gray-900/70 text-gray-300';

  return (
    <div className={`mt-2 rounded border ${toneClass}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em]"
      >
        <span>{title}</span>
        <span className="text-[9px]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-inherit px-2 py-2 text-[11px] leading-5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ChatMessage({ message, agentLabel }) {
  const { role, text, timestamp, nodeId, spawnMode, toolUse, thinking, cost } = message;
  const style = ROLE_STYLES[role] || ROLE_STYLES.assistant;
  const isStreamJson = spawnMode === 'stream-json';
  const displayText = role === 'system'
    ? text
    : isStreamJson
    ? formatStreamJsonText(text)
    : formatChatText(text);

  if (role === 'system') {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex-1 h-px bg-gray-800" />
        <span className={`text-[10px] text-gray-600 shrink-0`}>{text}</span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <div className={`rounded-lg border px-3 py-2 ${style}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-semibold ${role === 'user' ? 'text-green-400' : 'text-blue-400'}`}>
            {role === 'user' ? 'You' : (agentLabel || nodeId?.slice(0, 12) || 'Agent')}
          </span>
          {role === 'user' && agentLabel && (
            <span className="text-[10px] text-gray-500">to {agentLabel}</span>
          )}
          <span className="text-[10px] text-gray-600">{formatTime(timestamp)}</span>
        </div>
        <div className="text-[12px] whitespace-pre-wrap break-words leading-5 text-gray-100">
          {displayText || 'Structured handoff sent.'}
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
        {isStreamJson && cost && (
          <div className="mt-2 text-[10px] text-gray-500">
            {formatCostFooter(cost)}
          </div>
        )}
      </div>
    </div>
  );
}
