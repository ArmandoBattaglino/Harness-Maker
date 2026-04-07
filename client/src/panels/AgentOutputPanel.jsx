// client/src/panels/AgentOutputPanel.jsx
// Side panel showing clean semantic output of a specific agent node,
// its handoff data, and copy-to-clipboard functionality.
import { useState, useEffect } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------------------------------------------------------------------------
// Tab bar pill button
// ---------------------------------------------------------------------------
function TabPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Handoff card
// ---------------------------------------------------------------------------
function HandoffCard({ handoff }) {
  const ts = handoff.timestamp
    ? new Date(handoff.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className="bg-gray-800 rounded p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-cyan-300 font-medium">
          &rarr; {handoff.target || 'unknown'}
        </span>
        {ts && <span className="text-gray-500">{ts}</span>}
      </div>
      <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap break-words bg-gray-900 rounded p-2 overflow-x-auto">
        {JSON.stringify(handoff.payload ?? handoff, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export default function AgentOutputPanel({ nodeId, nodeLabel, onClose, onSwitchToInspector }) {
  const agentResult = useSwarmStore((s) => s.agentResults[nodeId]);
  const markViewed = useSwarmStore((s) => s.markAgentResultViewed);

  const finalText = agentResult?.finalText || '';
  const handoffs = agentResult?.handoffPayloads || [];
  const hasHandoffs = handoffs.length > 0;

  const [activeTab, setActiveTab] = useState('output');
  const [copyLabel, setCopyLabel] = useState('Copy');

  // Mark viewed on mount
  useEffect(() => {
    if (nodeId) markViewed(nodeId);
  }, [nodeId, markViewed]);

  // Reset tab if handoffs disappear
  useEffect(() => {
    if (!hasHandoffs && activeTab === 'handoff') setActiveTab('output');
  }, [hasHandoffs, activeTab]);

  // Copy handler
  const handleCopy = async () => {
    let text = '';
    if (activeTab === 'output') {
      text = finalText;
    } else {
      text = JSON.stringify(handoffs, null, 2);
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 2000);
    } catch {
      // Fallback: silent fail
    }
  };

  return (
    <div className="w-[19rem] min-w-[19rem] shrink-0 bg-gray-900 border-l border-gray-700 p-4 text-white text-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-semibold text-sm truncate flex-1">
          {nodeLabel || nodeId}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Close output panel"
        >
          &times;
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-3">
        <TabPill
          label="Output"
          active={activeTab === 'output'}
          onClick={() => setActiveTab('output')}
        />
        {hasHandoffs && (
          <TabPill
            label="Handoff"
            active={activeTab === 'handoff'}
            onClick={() => setActiveTab('handoff')}
          />
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'output' && (
          <div className="prose prose-invert prose-sm max-w-none text-xs">
            {finalText ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {finalText}
              </ReactMarkdown>
            ) : (
              <p className="text-gray-500 italic">
                No output captured for this agent.
              </p>
            )}
          </div>
        )}

        {activeTab === 'handoff' && (
          <div className="flex flex-col gap-2">
            {handoffs.map((h, idx) => (
              <HandoffCard key={idx} handoff={h} />
            ))}
          </div>
        )}
      </div>

      {/* Footer action bar */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
        <button
          onClick={handleCopy}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        >
          {copyLabel}
        </button>
        <button
          onClick={onSwitchToInspector || onClose}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        >
          &larr; Inspector
        </button>
      </div>
    </div>
  );
}
