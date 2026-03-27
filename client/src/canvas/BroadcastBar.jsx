// client/src/canvas/BroadcastBar.jsx
// Broadcast input bar — sends text to all (or specific) running agent PTYs.
import { useState } from 'react';
import { useSwarmStore } from '../store/SwarmContext';

const API_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'ClaudeCodeManager',
};

export default function BroadcastBar() {
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('soft');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const isActive = executionStatus === 'running' && activeExecutionId;

  const handleSend = async () => {
    if (!text.trim() || !isActive || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/swarm/${activeExecutionId}/broadcast`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({ text: text.trim(), scope: 'all', mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { sent } = await res.json();
      setResult(`Sent to ${sent} agent${sent !== 1 ? 's' : ''}`);
      setText('');
      setTimeout(() => setResult(null), 3000);
    } catch (e) {
      setResult(`Error: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!isActive) return null; // Only show during active execution

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 border-t border-gray-700">
      <span className="text-yellow-400 text-sm shrink-0">📢</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Broadcast to all agents..."
        disabled={sending}
        className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1
                   border border-gray-600 focus:border-yellow-500 focus:outline-none
                   placeholder-gray-500 disabled:opacity-50"
        maxLength={500}
      />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="text-xs bg-gray-700 text-gray-300 rounded px-1 py-1 border border-gray-600"
      >
        <option value="soft">Soft</option>
        <option value="hard">Hard</option>
      </select>
      <button
        onClick={handleSend}
        disabled={!text.trim() || sending}
        className="text-xs px-2 py-1 rounded bg-yellow-600 hover:bg-yellow-500
                   disabled:opacity-40 text-white transition-colors shrink-0"
      >
        {sending ? '...' : 'Send'}
      </button>
      {result && <span className="text-xs text-gray-400 shrink-0">{result}</span>}
    </div>
  );
}
