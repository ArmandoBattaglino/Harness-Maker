// client/src/canvas/ChatPanel.jsx
// Unified Chat View — shows agent outputs as a conversation.
// Integrates broadcast controls (scope, mode, target) directly in the input area.
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiPost } from '../hooks/useApi.js';
import { isStructuredSpawnMode } from '../utils/runtimeModes.js';
import ChatMessage from './ChatMessage';
import HitlChatCard from './HitlChatCard';

export default function ChatPanel() {
  const chatMessages = useSwarmStore((s) => s.chatMessages);
  const agentStates = useSwarmStore((s) => s.agentStates);
  const chatFilter = useSwarmStore((s) => s.chatFilter);
  const setChatFilter = useSwarmStore((s) => s.setChatFilter);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const bottomRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [scope, setScope] = useState('all');
  const [mode, setMode] = useState('soft');
  const [targetId, setTargetId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const sendingRef = useRef(false); // sync guard against rapid clicks

  // Build nodeId → label map from workflow definition
  const agentLabels = useMemo(() => {
    const map = {};
    for (const node of workflowDef?.nodes ?? []) {
      map[node.id] = node.data?.label || node.id;
    }
    return map;
  }, [workflowDef]);

  // Get unique agent nodeIds for filter dropdown
  const agentNodeIds = useMemo(() => {
    const ids = new Set();
    for (const msg of chatMessages) {
      if (msg.nodeId && msg.role !== 'system') ids.add(msg.nodeId);
    }
    return Array.from(ids);
  }, [chatMessages]);

  // All agents and departments from workflow for scope targeting
  const agents = useMemo(
    () => (workflowDef?.nodes ?? []).filter((n) => n.type === 'agent'),
    [workflowDef]
  );
  const departments = useMemo(
    () => (workflowDef?.nodes ?? []).filter((n) => n.type === 'department'),
    [workflowDef]
  );
  const targetOptions = scope === 'department' ? departments : agents;

  // Filter messages
  const filteredMessages = useMemo(() => {
    if (chatFilter === 'all') return chatMessages;
    return chatMessages.filter(
      (msg) => msg.role === 'system' || msg.role === 'hitl' || msg.nodeId === chatFilter
    );
  }, [chatMessages, chatFilter]);

  const enrichedMessages = useMemo(() => {
    const grouped = [];

    for (const rawMessage of filteredMessages) {
      const runtimeState = rawMessage?.nodeId ? agentStates[rawMessage.nodeId] : null;
      const structuredSpawnMode = rawMessage.spawnMode ?? runtimeState?.spawnMode ?? null;
      const isStructuredAssistant = (rawMessage.role === 'assistant' || !rawMessage.role)
        && isStructuredSpawnMode(structuredSpawnMode);
      const nextMessage = isStructuredAssistant
        ? {
            ...rawMessage,
            spawnMode: structuredSpawnMode,
            toolUse: rawMessage.toolUse ?? [],
            cost: rawMessage.cost ?? null,
            thinking: rawMessage.thinking ?? null,
          }
        : rawMessage;

      if (isStructuredAssistant) {
        const previous = grouped[grouped.length - 1];
        if (
          previous
          && isStructuredSpawnMode(previous.spawnMode)
          && previous.nodeId === nextMessage.nodeId
          && (previous.role === 'assistant' || !previous.role)
        ) {
          previous.text = `${previous.text ?? ''}${nextMessage.text ?? ''}`;
          previous.timestamp = nextMessage.timestamp ?? previous.timestamp;
          if ((nextMessage.toolUse ?? []).length > 0) previous.toolUse = nextMessage.toolUse;
          if (nextMessage.cost) previous.cost = nextMessage.cost;
          if (nextMessage.thinking) previous.thinking = nextMessage.thinking;
          continue;
        }
      }

      grouped.push({ ...nextMessage });
    }

    return grouped;
  }, [filteredMessages, agentStates]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [enrichedMessages.length]);

  // Sync scope with chatFilter — if filtering by agent, default scope to that agent
  useEffect(() => {
    if (chatFilter !== 'all') {
      setScope('agent');
      setTargetId(chatFilter);
    } else {
      setScope('all');
      setTargetId('');
    }
  }, [chatFilter]);

  const handleChatSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !activeExecutionId || sendingRef.current) return;
    if ((scope === 'department' || scope === 'agent') && !targetId) return;

    sendingRef.current = true;
    setSending(true);
    setSendResult(null);
    try {
      const res = await apiPost(`/api/v1/swarm/${activeExecutionId}/broadcast`, {
        text: trimmed,
        scope,
        targetId: scope === 'all' ? null : targetId,
        mode,
      });
      const { sent, recipientNodeIds = [] } = res;
      if (sent === 0) {
        setSendResult('No active agents to receive the message');
        setTimeout(() => setSendResult(null), 4000);
        return;
      }
      const labels = recipientNodeIds
        .map((nid) => agentLabels[nid] || nid.slice(0, 12))
        .slice(0, 3);
      const suffix = labels.length > 0
        ? `: ${labels.join(', ')}${recipientNodeIds.length > 3 ? ', ...' : ''}`
        : '';
      setSendResult(`Sent to ${sent} agent${sent !== 1 ? 's' : ''}${suffix}`);
      setInputText('');
      setTimeout(() => setSendResult(null), 3000);
    } catch (err) {
      setSendResult(`Error: ${err.message}`);
      setTimeout(() => setSendResult(null), 5000);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [inputText, activeExecutionId, scope, targetId, mode, agentLabels]);

  const canSend = activeExecutionId && executionStatus !== 'idle';

  if (chatMessages.length === 0) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-gray-900">
        <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700">
          Chat View
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          No messages yet — run a workflow to see agent output here
        </div>
        {canSend && (
          <ChatInputArea
            inputText={inputText}
            setInputText={setInputText}
            scope={scope}
            setScope={setScope}
            mode={mode}
            setMode={setMode}
            targetId={targetId}
            setTargetId={setTargetId}
            targetOptions={targetOptions}
            agentLabels={agentLabels}
            chatFilter={chatFilter}
            sending={sending}
            sendResult={sendResult}
            onSend={handleChatSend}
            departments={departments}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-gray-900">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700 flex items-center justify-between gap-2">
        <span>Chat View</span>
        <select
          value={chatFilter}
          onChange={(e) => setChatFilter(e.target.value)}
          className="bg-gray-800 text-gray-300 text-[10px] rounded px-1.5 py-0.5 border border-gray-700"
        >
          <option value="all">All agents</option>
          {agentNodeIds.map((id) => (
            <option key={id} value={id}>
              {agentLabels[id] || id.slice(0, 12)}
            </option>
          ))}
        </select>
        <span className="text-gray-600">{enrichedMessages.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar min-h-0">
        {enrichedMessages.map((msg, i) =>
          msg.role === 'hitl' ? (
            <HitlChatCard
              key={`hitl-${msg.hitlItemId}-${i}`}
              message={msg}
              agentLabel={agentLabels[msg.nodeId]}
              executionId={activeExecutionId}
            />
          ) : (
            <ChatMessage
              key={`${msg.nodeId}-${msg.timestamp}-${i}`}
              message={msg}
              agentLabel={agentLabels[msg.nodeId]}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>
      {canSend && (
        <ChatInputArea
          inputText={inputText}
          setInputText={setInputText}
          scope={scope}
          setScope={setScope}
          mode={mode}
          setMode={setMode}
          targetId={targetId}
          setTargetId={setTargetId}
          targetOptions={targetOptions}
          agentLabels={agentLabels}
          chatFilter={chatFilter}
          sending={sending}
          sendResult={sendResult}
          onSend={handleChatSend}
          departments={departments}
        />
      )}
    </div>
  );
}

// ─── Chat Input Area with integrated broadcast controls ────────────────────
function ChatInputArea({
  inputText, setInputText, scope, setScope, mode, setMode,
  targetId, setTargetId, targetOptions, agentLabels, chatFilter,
  sending, sendResult, onSend, departments,
}) {
  const hasTarget = scope === 'all' || targetId;
  const placeholder = scope === 'department'
    ? `Message department${targetId ? ` "${targetOptions.find((n) => n.id === targetId)?.data?.label || targetId}"` : ''}...`
    : scope === 'agent'
    ? `Message ${targetId ? (agentLabels[targetId] || targetId.slice(0, 12)) : 'agent'}...`
    : 'Message all agents...';

  return (
    <div className="border-t border-gray-700 px-2 py-2 space-y-1.5">
      {/* Controls row — scope, target, mode */}
      <div className="flex items-center gap-1.5">
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            if (e.target.value === 'all') setTargetId('');
          }}
          className="text-[10px] bg-gray-800 text-gray-400 rounded px-1.5 py-0.5 border border-gray-700 hover:border-gray-600"
        >
          <option value="all">All Agents</option>
          {departments.length > 0 && <option value="department">Department</option>}
          <option value="agent">Agent</option>
        </select>
        {scope !== 'all' && (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="text-[10px] bg-gray-800 text-gray-400 rounded px-1.5 py-0.5 border border-gray-700 hover:border-gray-600 max-w-[8rem] truncate"
          >
            <option value="">
              {scope === 'department' ? 'Select dept...' : 'Select agent...'}
            </option>
            {targetOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.data?.label || node.id}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setMode(mode === 'soft' ? 'hard' : 'soft')}
          title={mode === 'soft' ? 'Soft: appends text gently' : 'Hard: Ctrl-C first, then sends text'}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
            mode === 'hard'
              ? 'bg-red-900/40 border-red-700 text-red-400 hover:bg-red-900/60'
              : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
          }`}
        >
          {mode === 'soft' ? 'Soft' : 'Hard'}
        </button>
      </div>
      {/* Input row */}
      <div className="flex gap-1">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          disabled={sending}
          className="flex-1 bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-500 disabled:opacity-50"
          maxLength={500}
        />
        <button
          onClick={onSend}
          disabled={!inputText.trim() || sending || !hasTarget}
          className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shrink-0 transition-colors"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
      {/* Result feedback */}
      {sendResult && (
        <div className={`text-[10px] px-1 ${sendResult.startsWith('Error') ? 'text-red-400' : 'text-gray-500'}`}>
          {sendResult}
        </div>
      )}
    </div>
  );
}
