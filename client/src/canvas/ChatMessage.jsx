// client/src/canvas/ChatMessage.jsx
// Single message in the Unified Chat View.
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
    .filter((line) => !/(?:ctrl\+[a-z]|to (?:edit|cycle)|now using extra usage|╭|╰|─{3,}|▸▸|❯❯)/i.test(line));

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default function ChatMessage({ message, agentLabel }) {
  const { role, text, timestamp, nodeId } = message;
  const style = ROLE_STYLES[role] || ROLE_STYLES.assistant;
  const displayText = role === 'system' ? text : formatChatText(text);

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
      </div>
    </div>
  );
}
