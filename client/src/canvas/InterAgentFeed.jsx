// client/src/canvas/InterAgentFeed.jsx
// Real-time log of agent handoff events during swarm execution.
import { useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/SwarmContext';

const EVENT_ICONS = {
  handoff_started: '→',
  agent_status: '●',
  circuit_breaker: '⚠',
  execution_status: '⚡',
};

function formatTimestamp(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function InterAgentFeed() {
  const feed = useSwarmStore((s) => s.interAgentFeed);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  if (feed.length === 0) {
    return (
      <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 w-56 shrink-0">
        <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700">
          Inter-Agent Feed
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          No handoffs yet
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 w-56 shrink-0">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700 flex items-center justify-between">
        <span>Inter-Agent Feed</span>
        <span className="text-gray-600">{feed.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {feed.map((event, i) => (
          <div key={i} className="text-xs text-gray-300 flex gap-1.5 items-start">
            <span className="text-gray-500 shrink-0 mt-0.5">
              {event.timestamp ? formatTimestamp(event.timestamp) : ''}
            </span>
            <span className="text-blue-400 shrink-0">
              {EVENT_ICONS[event.type] ?? '?'}
            </span>
            <span className="truncate">
              {event.type === 'handoff_started'
                ? `${event.sourceNodeId?.slice(0, 6)} → ${event.targetNodeId?.slice(0, 6)}`
                : event.type === 'circuit_breaker'
                ? `⚠ loop ${event.edgeId?.slice(0, 8)} (${event.counter})`
                : event.type}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
