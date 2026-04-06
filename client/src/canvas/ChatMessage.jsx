// client/src/canvas/ChatMessage.jsx
// Single message in the Unified Chat View.

const ROLE_STYLES = {
  assistant: 'bg-gray-800 border-gray-700 text-gray-200',
  system: 'bg-gray-900/50 border-gray-800 text-gray-500 italic text-[10px]',
  user: 'bg-blue-900/40 border-blue-800 text-blue-200',
};

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ChatMessage({ message, agentLabel }) {
  const { role, text, timestamp, nodeId } = message;
  const style = ROLE_STYLES[role] || ROLE_STYLES.assistant;

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
          <span className="text-[10px] font-semibold text-blue-400">
            {agentLabel || nodeId?.slice(0, 12) || 'Agent'}
          </span>
          <span className="text-[10px] text-gray-600">{formatTime(timestamp)}</span>
        </div>
        <div className="text-xs whitespace-pre-wrap break-words leading-relaxed">
          {text}
        </div>
      </div>
    </div>
  );
}
