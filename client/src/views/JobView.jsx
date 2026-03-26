// JobView.jsx — Orchestration Center (Phase 9 redesign)
// Three-pane layout: Job Queue (left) + Control Bar + Output (right)

import { useState, useRef, useEffect } from 'react';
import { useAppState } from '../store/AppContext.jsx';
import useJob from '../hooks/useJob.js';
import { apiGet, apiDelete } from '../hooks/useApi.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(startISO) {
  if (!startISO) return '--:--:--';
  const seconds = Math.floor((Date.now() - new Date(startISO).getTime()) / 1000);
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function statusLabel(status) {
  if (status === 'running') return 'RUNNING';
  if (status === 'done') return 'COMPLETED';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'error') return 'ERROR';
  return status?.toUpperCase() ?? 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// JobCard — single item in the left pane queue
// ---------------------------------------------------------------------------
function JobCard({ job, isSelected, onClick }) {
  const isRunning = job.status === 'running';
  const isDone = job.status === 'done';
  const isError = job.status === 'error';
  const isCancelled = job.status === 'cancelled';

  const [elapsed, setElapsed] = useState(() => formatDuration(job.createdAt));

  useEffect(() => {
    if (!isRunning) {
      setElapsed(formatDuration(job.createdAt));
      return;
    }
    const id = setInterval(() => setElapsed(formatDuration(job.createdAt)), 1000);
    return () => clearInterval(id);
  }, [isRunning, job.createdAt]);

  const selectedClass = isSelected
    ? 'bg-surface-hover/40 border-l-2 border-primary'
    : 'border-l-2 border-transparent hover:bg-surface-hover/30';

  return (
    <div
      className={`p-5 cursor-pointer transition-colors ${selectedClass}`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-3">
        {/* Top row: job ID + status tag + duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-text-muted font-mono text-[10px] font-bold">
              {job.jobId?.slice(0, 8) ?? 'unknown'}
            </span>
            {isRunning && (
              <span className="bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase">
                RUNNING
              </span>
            )}
            {isDone && (
              <span className="bg-success/10 text-success/80 border border-success/20 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase">
                DONE
              </span>
            )}
            {isError && (
              <span className="bg-error/10 text-error/80 border border-error/20 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase">
                ERROR
              </span>
            )}
            {isCancelled && (
              <span className="bg-warning/10 text-warning/80 border border-warning/20 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase">
                CANCELLED
              </span>
            )}
          </div>
          <p className="text-text-muted text-[10px] font-mono">{elapsed}</p>
        </div>
        {/* Agent / project info */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isRunning ? (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            ) : isDone ? (
              <span
                className="material-symbols-outlined text-success/60 text-[14px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >check_circle</span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />
            )}
            <p className={`text-xs ${isRunning ? 'text-text-main font-semibold' : 'text-text-muted font-medium'}`}>
              Job {job.jobId?.slice(0, 8) ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-text-dimmer font-mono px-2 py-1 bg-background-dark/40 rounded border border-border-color/60 truncate">
            <span className="material-symbols-outlined text-[12px]">folder</span>
            <span>{job.projectId ?? 'unknown'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StreamLog — scrollable SSE event list
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
      <div className="flex items-center justify-center flex-1 text-text-muted">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary animate-spin text-[18px]">sync</span>
          <span className="text-xs font-mono">Waiting for output...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 font-mono text-xs custom-scrollbar bg-[#030303]">
      {events.map((ev, idx) => (
        <div key={idx} className="mb-1 flex gap-2" style={{ lineHeight: '1.6' }}>
          <span className="text-text-dimmer flex-shrink-0 min-w-[80px]">
            [{ev.type ?? 'event'}]
          </span>
          <span className="text-code-text break-words">
            {renderEventContent(ev)}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function renderEventContent(ev) {
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
  if (ev.type === 'result' && ev.result) return String(ev.result).slice(0, 300);
  if (ev.type === 'raw' && ev.data) return String(ev.data).slice(0, 300);
  if (ev.content) return String(ev.content).slice(0, 300);
  if (ev.text) return String(ev.text).slice(0, 300);
  return JSON.stringify(ev).slice(0, 200);
}

// ---------------------------------------------------------------------------
// MarkdownOutput — rendered Markdown in Stitch style
// ---------------------------------------------------------------------------
function MarkdownOutput({ result }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#030303] custom-scrollbar">
      <div className="max-w-4xl mx-auto p-10 space-y-8">
        {/* Header area */}
        <div className="space-y-4 border-b border-border-color pb-8">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              Job Complete
            </span>
          </div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Job Result</h1>
        </div>
        {/* Markdown body */}
        <div className="prose prose-invert max-w-none text-sm leading-relaxed">
          <div className="markdown-result">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result ?? ''}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptInput — shown when no job selected / idle state
// ---------------------------------------------------------------------------
function PromptInput({ onRun, onCancel, isRunning, canRun, prompt, setPrompt }) {
  const [allowedTools, setAllowedTools] = useState('all');
  const [maxTurns, setMaxTurns] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canRun) onRun({ prompt, allowedTools, maxTurns });
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#030303]">
      <div className="max-w-4xl mx-auto w-full p-10 flex flex-col gap-6 flex-1">
        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-text-main tracking-tight">New Job</h2>
          <p className="text-text-muted text-xs">
            Enter a prompt to run as a background job with Claude.
          </p>
        </div>

        {/* Prompt textarea */}
        <div className="relative group">
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder="Enter your prompt for Claude... (Ctrl+Enter to run)"
            rows={6}
            className="w-full rounded-lg border border-border-color bg-surface px-4 py-3 text-sm font-mono text-text-main placeholder:text-text-dimmer resize-none focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Advanced options toggle */}
        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-text-muted text-xs hover:text-text-main transition-colors"
            disabled={isRunning}
          >
            <span className="material-symbols-outlined text-[14px]">
              {showAdvanced ? 'expand_less' : 'expand_more'}
            </span>
            Advanced options
          </button>
          {showAdvanced && (
            <div className="mt-3 flex gap-4">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Allowed Tools</label>
                <input
                  type="text"
                  value={allowedTools}
                  onChange={(e) => setAllowedTools(e.target.value)}
                  disabled={isRunning}
                  placeholder="all"
                  className="px-3 py-1.5 text-xs font-mono rounded border border-border-color bg-surface text-text-main focus:outline-none focus:border-primary/40"
                />
              </div>
              <div className="flex flex-col gap-1 w-[100px]">
                <label className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Max Turns</label>
                <input
                  type="number"
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(e.target.value)}
                  disabled={isRunning}
                  min={1}
                  max={100}
                  className="px-3 py-1.5 text-xs font-mono rounded border border-border-color bg-surface text-text-main focus:outline-none focus:border-primary/40"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => canRun && onRun({ prompt, allowedTools, maxTurns })}
            disabled={!canRun}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-bold transition-all ${
              canRun
                ? 'bg-primary text-black hover:opacity-90 shadow-[0_0_15px_rgba(147,61,245,0.3)]'
                : 'bg-surface-hover text-text-dimmer cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            {isRunning ? 'Running...' : 'Run Job'}
          </button>
          {isRunning && (
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-error/5 text-error border border-error/20 hover:bg-error/20 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">stop_circle</span>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobView — main export
// ---------------------------------------------------------------------------
export default function JobView() {
  const { activeProjectId, projects } = useAppState();
  const { startJob, cancelJob, reset, status, streamEvents, result, error, jobId } =
    useJob(activeProjectId);

  const [backgroundJobs, setBackgroundJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [prompt, setPrompt] = useState('');

  const isRunning = status === 'running';
  const isDone = status === 'done';
  const canRun = Boolean(activeProjectId) && prompt.trim().length > 0 && !isRunning;

  // Fetch background jobs list
  async function fetchJobs() {
    try {
      const data = await apiGet('/api/v1/jobs');
      setBackgroundJobs(data.jobs ?? []);
    } catch {
      // silently ignore — best-effort listing
    }
  }

  useEffect(() => {
    if (!activeProjectId) return;
    fetchJobs();
    const id = setInterval(fetchJobs, 5000);
    return () => clearInterval(id);
  }, [activeProjectId]);

  // Auto-select the current running job
  useEffect(() => {
    if (jobId && isRunning) setSelectedJobId(jobId);
  }, [jobId, isRunning]);

  async function handleRun(opts) {
    if (!canRun) return;
    await startJob(opts);
  }

  async function handleKill(killJobId) {
    try {
      await apiDelete(`/api/v1/jobs/${killJobId}`);
      fetchJobs();
    } catch {
      // best-effort
    }
  }

  function handleReset() {
    setPrompt('');
    setSelectedJobId(null);
    reset();
  }

  // ---- Empty state: no project selected ----
  if (!activeProjectId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background-dark">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-text-dimmer text-[48px]">developer_board</span>
          <p className="text-text-muted text-xs">
            Select a project from the sidebar to run a job.
          </p>
        </div>
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectName = activeProject?.name ?? activeProjectId;

  // Find selected background job info
  const selectedBgJob = selectedJobId ? backgroundJobs.find((j) => j.jobId === selectedJobId) : null;
  // Is the selected job the one currently being managed by useJob?
  const isOwnJob = selectedJobId && selectedJobId === jobId;

  // Determine what status/info to show in control bar
  const controlStatus = isOwnJob ? status : (selectedBgJob?.status ?? null);
  const controlJobId = selectedJobId ?? jobId;

  return (
    <div className="flex flex-1 h-full min-w-0">
      {/* ── Left Pane: Job Queue ── */}
      <div className="w-[340px] shrink-0 border-r border-border-color flex flex-col bg-background-dark">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-color flex justify-between items-center bg-surface">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-text-muted uppercase">
            Active Background Jobs
          </h2>
          <button
            onClick={fetchJobs}
            className="material-symbols-outlined text-text-muted hover:text-text-main transition-colors text-[18px]"
          >
            refresh
          </button>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border-color/50 custom-scrollbar">
          {/* Show the current in-memory job if running/done */}
          {jobId && (
            <JobCard
              job={{
                jobId,
                projectId: activeProjectId,
                status,
                createdAt: new Date().toISOString(),
              }}
              isSelected={selectedJobId === jobId || (!selectedJobId && (isRunning || isDone))}
              onClick={() => setSelectedJobId(jobId)}
            />
          )}

          {/* Background jobs from server */}
          {backgroundJobs
            .filter((j) => j.jobId !== jobId)
            .map((job) => (
              <JobCard
                key={job.jobId}
                job={job}
                isSelected={selectedJobId === job.jobId}
                onClick={() => setSelectedJobId(job.jobId)}
              />
            ))}

          {/* Empty state */}
          {backgroundJobs.length === 0 && !jobId && (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-3">
              <span className="material-symbols-outlined text-text-dimmer text-[32px]">playlist_remove</span>
              <p className="text-text-muted text-[11px] text-center">
                No background jobs running. Enter a prompt to start one.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Pane ── */}
      <div className="flex-1 flex flex-col bg-background-dark min-w-0">
        {/* Control Bar */}
        <div className="h-16 border-b border-border-color bg-surface flex items-center justify-between px-6 shrink-0 font-mono">
          <div className="flex items-center gap-10">
            <div className="flex flex-col">
              <span className="text-[8px] text-text-dimmer uppercase tracking-widest font-black">Project</span>
              <span className="text-[11px] text-text-main font-bold">{projectName}</span>
            </div>
            {controlJobId && (
              <div className="flex flex-col">
                <span className="text-[8px] text-text-dimmer uppercase tracking-widest font-black">Job ID</span>
                <span className="text-[11px] text-text-main font-bold">{controlJobId?.slice(0, 8)}</span>
              </div>
            )}
            {controlStatus && (
              <div className="flex flex-col">
                <span className="text-[8px] text-text-dimmer uppercase tracking-widest font-black">Status</span>
                <span className="flex items-center gap-2">
                  {controlStatus === 'running' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                  {controlStatus === 'done' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  )}
                  {controlStatus === 'error' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-error" />
                  )}
                  {controlStatus === 'cancelled' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  )}
                  <span className={`text-[10px] font-bold tracking-tight ${
                    controlStatus === 'running' ? 'text-primary'
                    : controlStatus === 'done' ? 'text-success'
                    : controlStatus === 'error' ? 'text-error'
                    : 'text-text-muted'
                  }`}>
                    {statusLabel(controlStatus)}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Kill process button — for running jobs */}
            {controlStatus === 'running' && controlJobId && (
              <button
                onClick={() => isOwnJob ? cancelJob() : handleKill(controlJobId)}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-error/5 text-error border border-error/20 hover:bg-error/20 transition-all text-xs font-bold"
              >
                <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                Kill Process
              </button>
            )}
            {/* Reset / New Job button — for completed jobs */}
            {(controlStatus === 'done' || controlStatus === 'error' || controlStatus === 'cancelled') && isOwnJob && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border-color text-text-muted hover:text-text-main hover:bg-surface-hover transition-all text-xs font-medium"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                New Job
              </button>
            )}
          </div>
        </div>

        {/* ── Output Content Area ── */}

        {/* Error state */}
        {status === 'error' && isOwnJob && (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#030303] gap-4">
            <span className="material-symbols-outlined text-error text-[36px]">error</span>
            <p className="text-error text-sm font-medium">
              {error || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-border-color text-text-muted hover:text-text-main hover:bg-surface-hover transition-all text-xs font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Try Again
            </button>
          </div>
        )}

        {/* Cancelled state */}
        {status === 'cancelled' && isOwnJob && (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#030303] gap-4">
            <span className="material-symbols-outlined text-warning text-[36px]">cancel</span>
            <p className="text-warning text-sm font-medium">Job cancelled.</p>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-border-color text-text-muted hover:text-text-main hover:bg-surface-hover transition-all text-xs font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Run New Job
            </button>
          </div>
        )}

        {/* Running state — show stream */}
        {isRunning && isOwnJob && (
          <StreamLog events={streamEvents} />
        )}

        {/* Done state — show markdown result */}
        {isDone && isOwnJob && (
          <MarkdownOutput result={result} />
        )}

        {/* Viewing a background job (not own) */}
        {selectedBgJob && !isOwnJob && (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#030303] gap-4">
            <span className="material-symbols-outlined text-text-dimmer text-[36px]">visibility</span>
            <p className="text-text-muted text-sm">
              Background job <span className="text-text-main font-mono">{selectedBgJob.jobId?.slice(0, 8)}</span> — {statusLabel(selectedBgJob.status)}
            </p>
            <p className="text-text-dimmer text-xs">
              Live streaming is only available for jobs started in this session.
            </p>
          </div>
        )}

        {/* Idle state — prompt input */}
        {status === 'idle' && !selectedBgJob && (
          <PromptInput
            onRun={handleRun}
            onCancel={cancelJob}
            isRunning={isRunning}
            canRun={canRun}
            prompt={prompt}
            setPrompt={setPrompt}
          />
        )}

        {/* Bottom action bar for completed states */}
        {(isDone || status === 'cancelled' || status === 'error') && isOwnJob && (
          <div className="px-6 py-4 border-t border-border-color bg-surface shrink-0 flex items-center gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-md text-xs font-bold text-primary hover:bg-primary/20 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              Run New Job
            </button>
            {isDone && result && (
              <CopyButton text={result} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CopyButton — small copy-to-clipboard helper
// ---------------------------------------------------------------------------
function CopyButton({ text }) {
  const [label, setLabel] = useState('Copy Result');

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setLabel('Copied!');
      setTimeout(() => setLabel('Copy Result'), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-border-color text-text-muted hover:text-text-main hover:bg-surface-hover transition-all text-xs font-medium"
    >
      <span className="material-symbols-outlined text-[16px]">content_copy</span>
      {label}
    </button>
  );
}
