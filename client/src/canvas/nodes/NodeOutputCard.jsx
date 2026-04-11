import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useSwarmStore } from '../../store/SwarmContext';
import { mdComponents, sanitizeSchema } from '../../utils/markdownComponents';
import { getAgentOutputEntries, serializeAgentOutputEntries } from '../../utils/agentOutputEntries.js';

function formatEntryTimestamp(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

export default function NodeOutputCard({ nodeId, nodeLabel, onClose }) {
  const agentResult = useSwarmStore((s) => s.agentResults[nodeId]);
  const spawnMode = useSwarmStore((s) => s.agentStates[nodeId]?.spawnMode);
  const chatMessages = useSwarmStore((s) => s.chatMessages);
  const markViewed = useSwarmStore((s) => s.markAgentResultViewed);

  const handoffs = agentResult?.handoffPayloads || [];
  const hasHandoffs = handoffs.length > 0;
  const outputEntries = useMemo(
    () => getAgentOutputEntries({ nodeId, chatMessages, agentResult, spawnMode }),
    [agentResult, chatMessages, nodeId, spawnMode],
  );
  const [activeTab, setActiveTab] = useState('output');
  const [copyLabel, setCopyLabel] = useState('Copy');
  const contentRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (nodeId) markViewed(nodeId);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [nodeId, markViewed]);

  useEffect(() => {
    if (!hasHandoffs && activeTab === 'handoff') setActiveTab('output');
  }, [hasHandoffs, activeTab]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        const isInsideNode = e.target.closest('.react-flow__node');
        if (!isInsideNode) onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    const text = activeTab === 'output'
      ? serializeAgentOutputEntries(outputEntries)
      : JSON.stringify(handoffs, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 2000);
    } catch {
      // Clipboard is best-effort only.
    }
  }, [activeTab, handoffs, outputEntries]);

  return (
    <div
      ref={cardRef}
      className="nowheel nodrag nopan absolute top-0 left-[calc(100%+14px)] z-50 w-[340px] max-h-[420px] flex flex-col rounded-lg border border-gray-600/70 bg-gray-950/[0.98] backdrop-blur-sm shadow-[0_8px_18px_rgba(0,0,0,0.28)] text-white text-sm"
      style={{ animation: 'outputCardSlideIn 0.2s ease-out' }}
      onClick={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-700/70">
        <span className="font-semibold text-[13px] truncate flex-1 text-gray-100">
          {nodeLabel || nodeId}
        </span>
        <div className="flex items-center gap-1.5">
          {hasHandoffs && (
            <>
              <button
                onClick={() => setActiveTab('output')}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  activeTab === 'output'
                    ? 'bg-blue-600/80 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Output
              </button>
              <button
                onClick={() => setActiveTab('handoff')}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  activeTab === 'handoff'
                    ? 'bg-blue-600/80 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Handoff
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm leading-none ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700/60 transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      </div>

      <div ref={contentRef} className="nowheel flex-1 overflow-y-auto min-h-0 px-3.5 py-3 output-card-scrollbar">
        {activeTab === 'output' && (
          <div className="flex flex-col gap-3">
            {outputEntries.length > 0 ? outputEntries.map((entry, index) => {
              const outputNumber = outputEntries.length - index;
              const formattedTimestamp = formatEntryTimestamp(entry.timestamp);
              return (
                <section
                  key={entry.id}
                  className={`min-w-0 break-words overflow-wrap-anywhere text-[12.5px] leading-[1.75] text-gray-100 ${
                    index > 0 ? 'border-t border-gray-800/80 pt-3' : ''
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em] text-gray-500">
                    <span>{`Output ${outputNumber}`}</span>
                    {formattedTimestamp && <span className="text-[10px] normal-case tracking-normal">{formattedTimestamp}</span>}
                  </div>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                    components={mdComponents}
                  >
                    {entry.text}
                  </ReactMarkdown>
                </section>
              );
            }) : (
              <p className="text-gray-500 italic text-[11px]">No output yet.</p>
            )}
          </div>
        )}
        {activeTab === 'handoff' && (
          <div className="flex flex-col gap-2">
            {handoffs.map((h, idx) => (
              <div key={idx} className="bg-gray-800 rounded p-2.5 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cyan-300 font-medium">&rarr; {h.target || 'unknown'}</span>
                  {h.timestamp && (
                    <span className="text-gray-500">
                      {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
                <pre className="text-[10px] text-gray-300 font-mono whitespace-pre-wrap break-words bg-gray-900 rounded p-1.5 overflow-x-auto">
                  {JSON.stringify(h.payload ?? h, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700/70">
        <button
          onClick={handleCopy}
          className="text-[10px] px-2.5 py-1 rounded bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        >
          {copyLabel}
        </button>
      </div>
    </div>
  );
}
