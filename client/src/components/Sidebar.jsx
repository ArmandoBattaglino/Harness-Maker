import { useEffect, useState, useRef } from 'react';
import { apiGet, apiPost } from '../hooks/useApi.js';
import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import { NAV_ITEMS } from '../lib/constants.js';
import AddProjectModal from './AddProjectModal.jsx';

export default function Sidebar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [showModal, setShowModal] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const creatingSessionRef = useRef(false);
  const [loadError, setLoadError] = useState(null);

  // Load projects on mount
  useEffect(() => {
    apiGet('/api/v1/projects')
      .then((data) => dispatch({ type: 'SET_PROJECTS', payload: data.projects ?? [] }))
      .catch((err) => setLoadError(err.message));
  }, [dispatch]);

  async function handleProjectClick(project) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project.id });
    dispatch({ type: 'SET_VIEW', payload: 'terminal' });

    if (!state.sessions[project.id] && !creatingSessionRef.current) {
      creatingSessionRef.current = true;
      try {
        const data = await apiPost('/api/v1/sessions', { projectId: project.id });
        dispatch({
          type: 'SET_SESSION',
          payload: { projectId: project.id, session: data.session },
        });
      } catch (err) {
        console.error('Failed to create session:', err.message);
        setSessionError(err.message);
        setTimeout(() => setSessionError(null), 8000);
      } finally {
        creatingSessionRef.current = false;
      }
    }
  }

  function handleNavClick(view) {
    dispatch({ type: 'SET_VIEW', payload: view });
  }

  // Collect active sessions as array for display
  const activeSessions = Object.entries(state.sessions).map(([projectId, session]) => {
    const project = state.projects.find((p) => p.id === projectId);
    return { projectId, session, projectName: project?.name ?? 'Unknown' };
  });

  return (
    <>
      <aside className="flex flex-col h-full w-[250px] min-w-[250px] shrink-0 bg-surface border-r border-border-color z-20">
        {/* Header */}
        <SidebarHeader />

        {/* Navigation */}
        <nav className="px-2 py-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.view}
              item={item}
              isActive={state.view === item.view}
              onClick={() => handleNavClick(item.view)}
            />
          ))}
        </nav>

        {/* Active PTY Sessions */}
        <div className="flex-1 flex flex-col overflow-hidden border-t border-border-color">
          <div className="px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
              Active PTY Sessions
            </span>
            <span className="text-[10px] text-text-muted font-mono">
              {activeSessions.length} Total
            </span>
          </div>

          {loadError && (
            <p className="px-4 pb-2 text-xs text-error">{loadError}</p>
          )}
          {sessionError && (
            <p className="px-4 pb-2 text-xs text-error">Session failed: {sessionError}</p>
          )}

          <ul className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 flex flex-col gap-1">
            {activeSessions.length === 0 && !loadError && (
              <li className="px-3 py-3 text-[11px] text-text-muted italic">
                No active sessions.
              </li>
            )}
            {activeSessions.map(({ projectId, session, projectName }) => (
              <SessionItem
                key={projectId}
                projectId={projectId}
                session={session}
                projectName={projectName}
                isActive={state.activeProjectId === projectId}
                onClick={() => {
                  const project = state.projects.find((p) => p.id === projectId);
                  if (project) handleProjectClick(project);
                }}
              />
            ))}
          </ul>

          {/* New Local Session button */}
          <div className="px-3 pb-3 shrink-0">
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-1.5 border border-dashed border-border-default hover:border-text-muted/50 hover:bg-white/[0.02] rounded text-[11px] text-text-muted flex items-center justify-center gap-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span>New Local Session</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <SidebarFooter />
      </aside>

      {showModal && <AddProjectModal onClose={() => setShowModal(false)} />}
    </>
  );
}

/* ── Sub-components ──────────────────────────────────── */

function SidebarHeader() {
  return (
    <div className="p-4 border-b border-border-color flex items-center gap-2.5 shrink-0">
      <div className="size-7 rounded bg-gradient-to-br from-primary to-purple-800 flex items-center justify-center text-white shrink-0 overflow-hidden">
        <span className="material-symbols-outlined text-[16px]">terminal</span>
      </div>
      <div className="flex flex-col">
        <h1 className="font-bold text-sm text-text-main tracking-tight leading-none">Claude Code</h1>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-widest leading-none mt-0.5">
          Visual Manager
        </p>
      </div>
    </div>
  );
}

function NavItem({ item, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-3 w-full px-3 py-2 rounded text-sm font-medium text-left transition-colors' +
        (isActive
          ? ' bg-surface-hover border border-border-color text-text-main'
          : ' border border-transparent text-text-muted hover:bg-surface-hover hover:text-text-main')
      }
    >
      <span
        className={
          'material-symbols-outlined text-[20px]' +
          (isActive ? ' text-primary' : '')
        }
        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
    </button>
  );
}

function SessionItem({ projectId, session, projectName, isActive, onClick }) {
  return (
    <li>
      <button
        onClick={onClick}
        className={
          'w-full px-3 py-2.5 rounded text-left transition-colors border' +
          (isActive
            ? ' bg-white/[0.03] border-white/[0.05]'
            : ' border-transparent hover:bg-white/[0.02]')
        }
      >
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            <span className={
              'truncate text-[13px]' +
              (isActive ? ' font-semibold text-text-main' : ' font-medium text-text-muted')
            }>
              {projectName}
            </span>
          </div>
          {session?.pid && (
            <span className="text-[9px] font-mono text-text-muted bg-black/40 px-1 rounded border border-white/5 shrink-0 ml-2">
              PID {session.pid}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function SidebarFooter() {
  const [appVersion, setAppVersion] = useState('...');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    apiGet('/api/v1/version')
      .then((data) => setAppVersion(data.appVersion ?? '0.0.0'))
      .catch(() => setAppVersion('err'));
  }, []);

  return (
    <div className="border-t border-border-color shrink-0">
      {settingsOpen && (
        <div className="px-3 py-2 bg-surface-hover text-[11px] text-text-muted border-b border-border-color flex items-center justify-between">
          <span>Settings — coming soon</span>
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-text-dimmer hover:text-text-muted transition-colors"
            aria-label="Close settings notice"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-muted">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-xs font-mono uppercase tracking-widest">Active</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="text-text-dimmer hover:text-text-muted transition-colors focus:outline-none"
            aria-label="Open settings"
          >
            <span className="material-symbols-outlined text-[18px]">settings</span>
          </button>
          <span className="text-[10px] text-text-muted font-mono">v{appVersion}</span>
        </div>
      </div>
    </div>
  );
}
