// client/src/panels/AgentOutputPanel.jsx
// Legacy floating popover kept aligned with the shared output formatting contract.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useSwarmStore } from '../store/SwarmContext';
import { mdComponents, sanitizeSchema } from '../utils/markdownComponents';
import { formatAgentOutputText } from '../utils/formatAgentOutput';

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

const POPOVER_WIDTH = 360;
const POPOVER_MAX_HEIGHT = 480;
const POPOVER_GAP = 12;

export default function AgentOutputPanel({ nodeId, nodeLabel, onClose, anchorX, anchorY }) {
  const agentResult = useSwarmStore((s) => s.agentResults[nodeId]);
  const spawnMode = useSwarmStore((s) => s.agentStates[nodeId]?.spawnMode);
  const markViewed = useSwarmStore((s) => s.markAgentResultViewed);

  const rawFinalText = agentResult?.finalText || '';
  const handoffs = agentResult?.handoffPayloads || [];
  const hasHandoffs = handoffs.length > 0;
  const finalText = useMemo(
    () => formatAgentOutputText(rawFinalText, spawnMode),
    [rawFinalText, spawnMode],
  );
  const [activeTab, setActiveTab] = useState('output');
  const [copyLabel, setCopyLabel] = useState('Copy');

  const contentRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (nodeId) markViewed(nodeId);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [nodeId, markViewed]);

  useEffect(() => {
    if (!hasHandoffs && activeTab === 'handoff') setActiveTab('output');
  }, [hasHandoffs, activeTab]);

  const handleCopy = useCallback(async () => {
    const text = activeTab === 'output' ? finalText : JSON.stringify(handoffs, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 2000);
    } catch {
      // Clipboard is best-effort only.
    }
  }, [activeTab, finalText, handoffs]);

  const style = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = (anchorX ?? 400) + POPOVER_GAP;
    let top = (anchorY ?? 200) - 40;

    if (left + POPOVER_WIDTH > vw - 16) {
      left = (anchorX ?? 400) - POPOVER_WIDTH - POPOVER_GAP;
    }
    if (left < 16) left = 16;

    const maxH = Math.min(POPOVER_MAX_HEIGHT, vh - 32);
    if (top + maxH > vh - 16) {
      top = vh - maxH - 16;
    }
    if (top < 16) top = 16;

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${POPOVER_WIDTH}px`,
      maxHeight: `${maxH}px`,
      zIndex: 60,
    };
  }, [anchorX, anchorY]);

  const stopPropagation = useCallback((e) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={popoverRef}
      style={style}
      onClick={stopPropagation}
      onMouseDown={stopPropagation}
      className="bg-gray-950/[0.98] border border-gray-600 rounded-xl shadow-[0_8px_18px_rgba(0,0,0,0.28)] text-white text-sm flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <span className="font-semibold text-sm truncate flex-1">
          {nodeLabel || nodeId}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Close output popover"
        >
          &times;
        </button>
      </div>

      <div className="flex gap-1.5 px-4 pb-2">
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

      <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-1 custom-scrollbar">
        {activeTab === 'output' && (
          <div className="min-w-0 break-words overflow-wrap-anywhere text-[12.5px] leading-[1.75] text-gray-100">
            {finalText ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                components={mdComponents}
              >
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

      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-700">
        <button
          onClick={handleCopy}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        >
          {copyLabel}
        </button>
      </div>
    </div>
  );
}
