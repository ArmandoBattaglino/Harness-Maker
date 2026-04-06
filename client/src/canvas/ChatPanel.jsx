// client/src/canvas/ChatPanel.jsx
// Unified Chat View — shows agent outputs as a conversation.
import { useEffect, useRef, useMemo } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import ChatMessage from './ChatMessage';

export default function ChatPanel() {
  const chatMessages = useSwarmStore((s) => s.chatMessages);
  const chatFilter = useSwarmStore((s) => s.chatFilter);
  const setChatFilter = useSwarmStore((s) => s.setChatFilter);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const bottomRef = useRef(null);

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

  if (chatMessages.length === 0) {
    return (
      <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 w-72 shrink-0">
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
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 w-72 shrink-0">
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
      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
        {filteredMessages.map((msg, i) => (
          <ChatMessage
            key={`${msg.nodeId}-${msg.timestamp}-${i}`}
            message={msg}
            agentLabel={agentLabels[msg.nodeId]}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
