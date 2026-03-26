import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import { apiDelete } from '../hooks/useApi.js';
import Terminal from '../components/Terminal.jsx';

/* ── Sub-components ─────────────────────────────────── */

function PtyHeader({ activeProject, session, sessionId, onKill }) {
  const displayName = activeProject.name || sessionId?.slice(0, 12) || 'Session';

  return (
    <header className="h-10 border-b border-white/[0.06] flex items-center justify-between px-4 z-10 shrink-0 bg-black/60 backdrop-blur-md">
      {/* Left side */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="material-symbols-outlined text-[16px] text-primary">terminal</span>
          <span className="font-mono text-[11px] tracking-tight text-text-main uppercase truncate">
            {displayName}
          </span>
        </div>
        <div className="h-3 w-px bg-border-color shrink-0" />
        <div className="flex items-center gap-2 text-text-muted min-w-0">
          <span className="material-symbols-outlined text-[14px] shrink-0">folder_open</span>
          <span className="text-[11px] font-mono truncate">{activeProject.path}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Memory badge */}
        <div className="flex items-center bg-white/[0.03] border border-white/10 rounded px-2 py-0.5 mr-2">
          <span className="text-[9px] font-bold text-text-muted uppercase tracking-tighter mr-2">Memory</span>
          <span className="text-[10px] font-mono text-primary">&mdash;</span>
        </div>

        {/* Copy output */}
        <button
          className="p-1.5 hover:bg-white/5 rounded text-text-muted hover:text-text-main transition-colors"
          title="Copy output"
        >
          <span className="material-symbols-outlined text-[16px]">content_copy</span>
        </button>

        {/* Split pane (disabled / future) */}
        <button
          className="p-1.5 rounded text-text-dimmer cursor-not-allowed"
          title="Split pane (coming soon)"
          disabled
        >
          <span className="material-symbols-outlined text-[16px]">vertical_split</span>
        </button>

        {/* Kill process */}
        <button
          className="p-1.5 hover:bg-red-500/20 rounded text-text-muted hover:text-red-400 transition-colors"
          title="Kill process"
          onClick={onKill}
          disabled={!sessionId}
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </header>
  );
}

function StatusBarFooter({ session }) {
  const isConnected = !!session;

  return (
    <footer className="h-9 bg-surface border-t border-border-color flex items-center px-4 justify-between z-10 select-none text-[11px] shrink-0">
      {/* Left: connection status + daemon */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`size-1.5 rounded-full ${isConnected ? 'bg-success active-indicator' : 'bg-text-muted'}`} />
          <span className="font-bold text-text-main tracking-tight uppercase text-[10px]">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="h-3 w-px bg-border-color" />
        <div className="flex items-center gap-2 text-text-muted">
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          <span className="font-mono">Local Daemon</span>
        </div>
      </div>

      {/* Right: tokens + latency (placeholders) */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="material-symbols-outlined text-[14px] text-warning/80">toll</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Tokens</span>
          <span className="font-mono text-text-main">&mdash;</span>
        </div>
        <div className="h-3 w-px bg-border-color" />
        <div className="flex items-center gap-2 text-text-muted">
          <span className="material-symbols-outlined text-[14px] text-accent/80">timer</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Latency</span>
          <span className="font-mono text-text-main">&mdash;</span>
        </div>
      </div>
    </footer>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background-dark">
      <span className="material-symbols-outlined text-[48px] text-text-dimmer mb-4">terminal</span>
      <p className="text-sm text-text-muted mb-1">No project selected</p>
      <p className="text-[11px] text-text-dim">
        Select a project from the sidebar to start a Claude session
      </p>
    </div>
  );
}

/* ── Main View ──────────────────────────────────────── */

export default function TerminalView() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { activeProjectId, projects, sessions } = state;

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const session = activeProjectId ? sessions[activeProjectId] : null;
  const sessionId = session ? session.sessionId : null;

  async function handleKill() {
    if (!sessionId) return;
    try {
      await apiDelete(`/api/v1/sessions/${sessionId}`);
      dispatch({ type: 'REMOVE_SESSION', payload: activeProjectId });
    } catch (err) {
      // Silently handle — session may already be dead
      console.error('Failed to kill session:', err.message);
    }
  }

  if (!activeProject) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background-dark">
      <PtyHeader
        activeProject={activeProject}
        session={session}
        sessionId={sessionId}
        onKill={handleKill}
      />

      {/* Terminal body — flex-1 overflow-hidden, NO padding, NO max-width */}
      <div className="flex-1 overflow-hidden bg-black">
        <Terminal sessionId={sessionId} projectPath={activeProject.path} />
      </div>

      <StatusBarFooter session={session} />
    </div>
  );
}
