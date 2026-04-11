// client/src/utils/formatChatText.js
// Shared text formatting for PTY and stream-json agent output,
// used by both ChatMessage and AgentOutputPanel.
import { stripAnsi } from './stripAnsi';
import { repairTokenSplitting } from './repairTokenSpacing';

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
export function formatChatText(rawText = '') {
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

export function formatStreamJsonText(rawText = '') {
  return stripAnsi(String(rawText ?? ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}
