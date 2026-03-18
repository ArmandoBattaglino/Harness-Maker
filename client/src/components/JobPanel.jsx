// JobPanel.jsx — Job Mode UI
// Handles prompt input, SSE streaming display, Markdown result rendering, and cancel/copy.

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useJob from '../hooks/useJob.js';

// ---------------------------------------------------------------------------
// StreamLog — scrollable list of streaming SSE events
// ---------------------------------------------------------------------------
function StreamLog({ events }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [events]);

  if (events.length === 0) {
    return (
      <div
        className="flex items-center justify-center flex-1"
        style={{ color: '#4b5563' }}
      >
        <span className="text-xs">Waiting for output...</span>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-3 font-mono text-xs"
      style={{ backgroundColor: '#0d0d0d' }}
    >
      {events.map((ev, idx) => (
        <div
          key={idx}
          className="mb-1 flex gap-2"
          style={{ lineHeight: '1.5' }}
        >
          <span style={{ color: '#6b7280', flexShrink: 0, minWidth: '80px' }}>
            [{ev.type ?? 'event'}]
          </span>
          <span style={{ color: '#d1d5db', wordBreak: 'break-word' }}>
            {renderEventContent(ev)}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function renderEventContent(ev) {
  // Extract the most useful text from common Claude stream-json event types
  if (ev.type === 'assistant' && ev.message?.content) {
    const content = ev.message.content;
    if (Array.isArray(content)) {
      return content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join(' ')
        .slice(0, 300);
    }
  }
  if (ev.type === 'result' && ev.result) {
    return String(ev.result).slice(0, 300);
  }
  if (ev.type === 'raw' && ev.data) {
    return String(ev.data).slice(0, 300);
  }
  // Generic fallback: show type + any text/content fields
  if (ev.content) return String(ev.content).slice(0, 300);
  if (ev.text) return String(ev.text).slice(0, 300);
  return JSON.stringify(ev).slice(0, 200);
}

// ---------------------------------------------------------------------------
// MarkdownResult — rendered Markdown output
// ---------------------------------------------------------------------------
function MarkdownResult({ result, onCopy, copyLabel }) {
  return (
    <div
      className="flex flex-col flex-1 overflow-hidden"
      style={{ backgroundColor: '#111111' }}
    >
      {/* Result header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: '#1f2937', flexShrink: 0, backgroundColor: '#1a1a1a' }}
      >
        <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>
          Result
        </span>
        <button
          onClick={onCopy}
          className="px-3 py-1 text-xs rounded border"
          style={{
            color: '#9ca3af',
            borderColor: '#374151',
            backgroundColor: 'transparent',
          }}
        >
          {copyLabel}
        </button>
      </div>

      {/* Scrollable Markdown area */}
      <div
        className="flex-1 overflow-y-auto px-6 py-4"
        style={{ color: '#e5e7eb' }}
      >
        <div className="markdown-result">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdvancedOptions — collapsible section
// ---------------------------------------------------------------------------
function AdvancedOptions({ allowedTools, setAllowedTools, maxTurns, setMaxTurns, disabled }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: '1px solid #1f2937', marginTop: '8px' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full px-4 py-2 text-xs text-left"
        style={{ color: '#6b7280', backgroundColor: 'transparent' }}
        disabled={disabled}
      >
        <span style={{ fontSize: '10px' }}>{open ? '▼' : '▶'}</span>
        Advanced options
      </button>

      {open && (
        <div className="px-4 pb-3 flex gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs" style={{ color: '#9ca3af' }}>
              Allowed Tools
            </label>
            <input
              type="text"
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              disabled={disabled}
              placeholder="all"
              className="px-2 py-1 text-xs rounded border"
              style={{
                backgroundColor: '#1a1a1a',
                borderColor: '#374151',
                color: '#d1d5db',
                outline: 'none',
              }}
            />
          </div>
          <div className="flex flex-col gap-1" style={{ width: '100px' }}>
            <label className="text-xs" style={{ color: '#9ca3af' }}>
              Max Turns
            </label>
            <input
              type="number"
              value={maxTurns}
              onChange={(e) => setMaxTurns(e.target.value)}
              disabled={disabled}
              min={1}
              max={100}
              className="px-2 py-1 text-xs rounded border"
              style={{
                backgroundColor: '#1a1a1a',
                borderColor: '#374151',
                color: '#d1d5db',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobPanel — main export
// ---------------------------------------------------------------------------
export default function JobPanel({ projectId }) {
  const [prompt, setPrompt] = useState('');
  const [allowedTools, setAllowedTools] = useState('all');
  const [maxTurns, setMaxTurns] = useState(10);
  const [copyLabel, setCopyLabel] = useState('Copy result');

  const { startJob, cancelJob, reset, status, streamEvents, result, error } =
    useJob(projectId);

  const isRunning = status === 'running';
  const isDone = status === 'done';
  const canRun = Boolean(projectId) && prompt.trim().length > 0 && !isRunning;

  async function handleRun() {
    if (!canRun) return;
    await startJob({ prompt, allowedTools, maxTurns });
  }

  async function handleCancel() {
    await cancelJob();
  }

  function handleReset() {
    setPrompt('');
    reset();
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy result'), 2000);
    });
  }

  function handleKeyDown(e) {
    // Ctrl+Enter or Cmd+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
  }

  // -------------------------------------------------------------------------
  // Render: idle or running — show prompt form + stream area
  // -------------------------------------------------------------------------
  if (status === 'idle' || isRunning) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
        {/* Prompt form */}
        <div
          className="flex flex-col"
          style={{ borderBottom: '1px solid #1f2937', flexShrink: 0 }}
        >
          <div className="px-4 pt-4 pb-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              placeholder="Enter your prompt for Claude... (Ctrl+Enter to run)"
              rows={5}
              className="w-full rounded border px-3 py-2 text-xs font-mono resize-none"
              style={{
                backgroundColor: '#1a1a1a',
                borderColor: isRunning ? '#374151' : '#4b5563',
                color: isRunning ? '#6b7280' : '#e5e7eb',
                outline: 'none',
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 px-4 pb-3">
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="px-4 py-2 text-xs font-semibold rounded"
              style={{
                backgroundColor: canRun ? '#16a34a' : '#1f2937',
                color: canRun ? '#f0fdf4' : '#4b5563',
                cursor: canRun ? 'pointer' : 'not-allowed',
              }}
            >
              {isRunning ? 'Running...' : 'Run'}
            </button>

            {isRunning && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-xs font-semibold rounded"
                style={{
                  backgroundColor: '#7f1d1d',
                  color: '#fca5a5',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}

            {isRunning && (
              <span className="text-xs" style={{ color: '#6b7280' }}>
                <span style={{ color: '#4ade80' }}>●</span> Job running...
              </span>
            )}
          </div>

          <AdvancedOptions
            allowedTools={allowedTools}
            setAllowedTools={setAllowedTools}
            maxTurns={maxTurns}
            setMaxTurns={setMaxTurns}
            disabled={isRunning}
          />
        </div>

        {/* Stream events area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div
            className="px-4 py-2 text-xs font-semibold"
            style={{
              color: '#6b7280',
              borderBottom: '1px solid #1f2937',
              flexShrink: 0,
              backgroundColor: '#1a1a1a',
            }}
          >
            Stream output
          </div>
          <StreamLog events={streamEvents} />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: done — show Markdown result
  // -------------------------------------------------------------------------
  if (isDone) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
        <MarkdownResult result={result ?? ''} onCopy={handleCopy} copyLabel={copyLabel} />
        <div
          className="flex items-center justify-start px-4 py-3"
          style={{ borderTop: '1px solid #1f2937', flexShrink: 0 }}
        >
          <button
            onClick={handleReset}
            className="px-4 py-2 text-xs font-semibold rounded"
            style={{ backgroundColor: '#1f2937', color: '#9ca3af', cursor: 'pointer' }}
          >
            Run new job
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: cancelled
  // -------------------------------------------------------------------------
  if (status === 'cancelled') {
    return (
      <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <p className="text-xs" style={{ color: '#f97316' }}>
            Job cancelled.
          </p>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-xs font-semibold rounded"
            style={{ backgroundColor: '#1f2937', color: '#9ca3af', cursor: 'pointer' }}
          >
            Run new job
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: error
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <p className="text-xs" style={{ color: '#f87171' }}>
          Error: {error || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-xs font-semibold rounded"
          style={{ backgroundColor: '#1f2937', color: '#9ca3af', cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
