import { useMemo, useState } from 'react';
import { useSwarmStore } from '../store/SwarmContext';

const API_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'ClaudeCodeManager',
};

export default function BroadcastBar() {
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('soft');
  const [scope, setScope] = useState('all');
  const [targetId, setTargetId] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const isActive = executionStatus === 'running' && activeExecutionId;
  const departments = useMemo(
    () => (workflowDef?.nodes ?? []).filter((node) => node.type === 'department'),
    [workflowDef]
  );
  const agents = useMemo(
    () => (workflowDef?.nodes ?? []).filter((node) => node.type === 'agent'),
    [workflowDef]
  );
  const targetOptions = scope === 'department' ? departments : agents;

  const handleSend = async () => {
    if (!text.trim() || !isActive || sending) return;
    if ((scope === 'department' || scope === 'agent') && !targetId) return;

    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/swarm/${activeExecutionId}/broadcast`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
          text: text.trim(),
          scope,
          targetId: scope === 'all' ? null : targetId,
          mode,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { sent, recipientNodeIds = [] } = await res.json();
      const labels = recipientNodeIds
        .map((nodeId) => agents.find((node) => node.id === nodeId)?.data?.label || nodeId)
        .slice(0, 3);
      const suffix = labels.length > 0
        ? `: ${labels.join(', ')}${recipientNodeIds.length > 3 ? ', ...' : ''}`
        : '';
      setResult(`Sent to ${sent} agent${sent !== 1 ? 's' : ''}${suffix}`);
      setText('');
      setTimeout(() => setResult(null), 3000);
    } catch (error) {
      setResult(`Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 border-t border-gray-700">
      <span className="text-yellow-400 text-sm shrink-0">Broadcast</span>
      <select
        value={scope}
        onChange={(event) => {
          setScope(event.target.value);
          setTargetId('');
        }}
        className="text-xs bg-gray-700 text-gray-300 rounded px-1 py-1 border border-gray-600"
      >
        <option value="all">All Agents</option>
        <option value="department">Department</option>
        <option value="agent">Specific Agent</option>
      </select>
      {scope !== 'all' && (
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          className="min-w-40 text-xs bg-gray-700 text-gray-300 rounded px-1 py-1 border border-gray-600"
        >
          <option value="">
            {scope === 'department' ? 'Select department' : 'Select agent'}
          </option>
          {targetOptions.map((node) => (
            <option key={node.id} value={node.id}>
              {node.data?.label || node.id}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          scope === 'department'
            ? 'Broadcast to agents in a department...'
            : scope === 'agent'
            ? 'Broadcast to a specific agent...'
            : 'Broadcast to all agents...'
        }
        disabled={sending}
        className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-yellow-500 focus:outline-none placeholder-gray-500 disabled:opacity-50"
        maxLength={500}
      />
      <select
        value={mode}
        onChange={(event) => setMode(event.target.value)}
        className="text-xs bg-gray-700 text-gray-300 rounded px-1 py-1 border border-gray-600"
      >
        <option value="soft">Soft</option>
        <option value="hard">Hard</option>
      </select>
      <button
        onClick={handleSend}
        disabled={!text.trim() || sending || ((scope === 'department' || scope === 'agent') && !targetId)}
        className="text-xs px-2 py-1 rounded bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white transition-colors shrink-0"
      >
        {sending ? '...' : 'Send'}
      </button>
      {result && <span className="text-xs text-gray-400 shrink-0">{result}</span>}
    </div>
  );
}
