// client/src/canvas/ChatPanel.jsx
// Unified Chat View — shows agent outputs as a conversation.
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiPost } from '../hooks/useApi.js';
import ChatMessage from './ChatMessage';

export default function ChatPanel() {
  const chatMessages = useSwarmStore((s) => s.chatMessages);
  const chatFilter = useSwarmStore((s) => s.chatFilter);
  const setChatFilter = useSwarmStore((s) => s.setChatFilter);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const bottomRef = useRef(null);
  const [inputText, setInputText] = useState('');

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

  // Filter messages
  const filteredMessages = useMemo(() => {
    if (chatFilter === 'all') return chatMessages;
    return chatMessages.filter(
      (msg) => msg.role === 'system' || msg.nodeId === chatFilter
    );
  }, [chatMessages, chatFilter]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages.length]);

  const handleChatSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !activeExecutionId) return;

    const scope = chatFilter === 'all' ? 'all' : 'agent';
    const targetId = chatFilter === 'all' ? null : chatFilter;

    try {
      await apiPost(`/api/v1/swarm/${activeExecutionId}/broadcast`, {
        text: trimmed,
        scope,
        targetId,
        mode: 'soft',
      });
      setInputText('');
    } catch (err) {
      console.error('Chat send failed:', err);
    }
  }, [inputText, activeExecutionId, chatFilter]);

  if (chatMessages.length === 0) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-gray-900">
        <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700">
          Chat View
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          No messages yet — run a workflow to see agent output here
        </div>
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
        <span className="text-gray-600">{filteredMessages.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar min-h-0">
        {filteredMessages.map((msg, i) => (
          <ChatMessage
            key={`${msg.nodeId}-${msg.timestamp}-${i}`}
            message={msg}
            agentLabel={agentLabels[msg.nodeId]}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      {executionStatus === 'running' && activeExecutionId && (
        <div className="px-2 py-2 border-t border-gray-700">
          <div className="flex gap-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              placeholder={chatFilter === 'all' ? 'Message all agents...' : `Message ${agentLabels[chatFilter] || 'agent'}...`}
              className="flex-1 bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-500"
              maxLength={500}
            />
            <button
              onClick={handleChatSend}
              disabled={!inputText.trim()}
              className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
