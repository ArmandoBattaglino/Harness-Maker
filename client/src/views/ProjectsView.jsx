import { useEffect, useState, useRef } from 'react';
import { apiGet, apiPost, apiDelete } from '../hooks/useApi.js';
import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import AddProjectModal from '../components/AddProjectModal.jsx';

/* ── helpers ────────────────────────────────────────── */

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ── sub-components ─────────────────────────────────── */

function ConfirmDialog({ projectName, onConfirm, onCancel, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-[420px] rounded-xl border border-border-default bg-surface-default p-6">
        <h2 className="mb-3 text-sm font-semibold text-text-main">Remove Project</h2>
        <p className="mb-6 text-xs text-text-muted leading-relaxed">
          Remove project{' '}
          <span className="text-text-main font-medium">&quot;{projectName}&quot;</span>? This will
          only deregister it — no files will be deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border-default bg-transparent px-4 py-2 text-xs text-text-muted hover:bg-surface-hover disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-xs text-error hover:bg-error/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardMenu({ onOpenTerminal, onDelete, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-4 top-10 z-30 w-40 rounded-lg border border-border-default bg-surface-default py-1 shadow-lg"
    >
      <button
        onClick={onOpenTerminal}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted hover:bg-surface-hover hover:text-text-main"
      >
        <span className="material-symbols-outlined text-[16px]">terminal</span>
        Open Terminal
      </button>
      <button
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-error hover:bg-surface-hover"
      >
        <span className="material-symbols-outlined text-[16px]">delete</span>
        Delete
      </button>
    </div>
  );
}

function StatusDot({ status }) {
  if (status === 'active') {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
      </span>
    );
  }
  return <div className="w-2 h-2 rounded-full bg-border-hover" />;
}

function ProjectCard({ project, status, onOpenTerminal, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = status === 'active';

  const hoverBorder = isActive
    ? 'hover:border-primary/50'
    : 'hover:border-border-hover';

  return (
    <div
      className={`group bg-surface-default border border-border-color rounded-xl p-6 flex flex-col justify-between h-[180px] ${hoverBorder} hover:bg-surface-lighter cursor-pointer transition-all relative`}
      onClick={() => onOpenTerminal()}
    >
      <div>
        <div className="flex justify-between items-start mb-2">
          <h4
            className={`text-base font-semibold text-text-main truncate pr-4 ${isActive ? 'group-hover:text-primary' : ''} transition-colors`}
          >
            {project.name}
          </h4>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="material-symbols-outlined text-text-muted text-[18px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 focus:opacity-100 transition-opacity shrink-0"
          >
            more_vert
          </button>
        </div>
        <p
          className="text-[12px] text-text-muted font-mono truncate opacity-60"
          title={project.path}
        >
          {project.path}
        </p>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-color/50">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span
            className={`text-[12px] font-medium ${isActive ? 'text-text-main' : 'text-text-muted'}`}
          >
            {isActive ? 'Active' : 'Idle'}
          </span>
        </div>
        <span className="text-[11px] text-text-muted">
          {timeAgo(project.updatedAt || project.createdAt)}
        </span>
      </div>

      {menuOpen && (
        <CardMenu
          onOpenTerminal={() => {
            setMenuOpen(false);
            onOpenTerminal();
          }}
          onDelete={() => {
            setMenuOpen(false);
            onDelete();
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

function AddCard({ onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-transparent border border-dashed border-border-color rounded-xl p-6 flex flex-col items-center justify-center h-[180px] hover:border-primary hover:bg-[#080808] cursor-pointer transition-all group"
    >
      <div className="w-12 h-12 rounded-full bg-surface-default border border-border-color flex items-center justify-center mb-3 group-hover:border-primary group-hover:scale-110 transition-all">
        <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors">
          add
        </span>
      </div>
      <span className="text-sm font-semibold text-text-muted group-hover:text-text-main transition-colors">
        Register Existing Project
      </span>
      <span className="text-[11px] text-text-dimmer mt-1 group-hover:text-text-muted">
        Link a local directory
      </span>
    </div>
  );
}

function ListRow({ project, status, onOpenTerminal, onDelete }) {
  const isActive = status === 'active';
  return (
    <tr className="border-b border-border-color hover:bg-surface-hover transition-colors">
      <td className="py-3 pr-4 text-sm font-medium text-text-main">{project.name}</td>
      <td className="py-3 pr-4 max-w-xs">
        <span className="block truncate text-[12px] text-text-muted font-mono" title={project.path}>
          {project.path}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className={`text-[12px] font-medium ${isActive ? 'text-text-main' : 'text-text-muted'}`}>
            {isActive ? 'Active' : 'Idle'}
          </span>
        </div>
      </td>
      <td className="py-3 pr-4 text-[12px] text-text-muted">{formatDate(project.createdAt)}</td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onOpenTerminal()}
            className="rounded-lg border border-border-default bg-surface-default px-3 py-1.5 text-xs text-text-muted hover:border-primary hover:text-primary transition-colors"
          >
            Open Terminal
          </button>
          <button
            onClick={() => onDelete()}
            className="rounded-lg border border-border-default bg-surface-default px-3 py-1.5 text-xs text-text-muted hover:border-error hover:text-error transition-colors"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── main view ──────────────────────────────────────── */

export default function ProjectsView() {
  const { projects, sessions } = useAppState();
  const dispatch = useAppDispatch();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('register');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const searchRef = useRef(null);

  /* keyboard shortcut: "/" focuses search */
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function loadProjects() {
    setLoading(true);
    setLoadError(null);
    apiGet('/api/v1/projects')
      .then((data) => dispatch({ type: 'SET_PROJECTS', payload: data.projects ?? [] }))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpenTerminal(project) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project.id });

    // Create a PTY session if one doesn't already exist
    if (!sessions[project.id]) {
      try {
        const data = await apiPost('/api/v1/sessions', { projectId: project.id });
        dispatch({
          type: 'SET_SESSION',
          payload: { projectId: project.id, session: data.session },
        });
      } catch (err) {
        console.error('Failed to create session:', err.message);
      }
    }

    // Switch view AFTER session is verified or created
    dispatch({ type: 'SET_VIEW', payload: 'terminal' });
  }

  function handleDeleteClick(project) {
    setDeleteError(null);
    setConfirmTarget(project);
  }

  async function handleDeleteConfirm() {
    if (!confirmTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/v1/projects/${confirmTarget.id}`);
      dispatch({ type: 'REMOVE_PROJECT', payload: confirmTarget.id });
      setConfirmTarget(null);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleModalClose() {
    setShowModal(false);
    loadProjects();
  }

  /* filter projects by search */
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.path && p.path.toLowerCase().includes(query))
      )
    : projects;

  function getStatus(project) {
    return sessions[project.id] ? 'active' : 'idle';
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background-dark">
      {/* ── Header Bar ── */}
      <header className="h-[64px] flex-shrink-0 border-b border-border-color flex items-center px-8 justify-between bg-background-dark">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-text-main">
            Project Dashboard
          </h2>
        </div>

        {/* Global Search */}
        <div className="relative w-full max-w-lg mx-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-text-muted text-[18px]">search</span>
          </div>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-12 py-1.5 border border-border-color rounded-md leading-5 bg-surface text-text-main placeholder-text-dimmer focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm h-9"
            placeholder="Search projects, paths, or active tasks..."
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center border border-border-color rounded px-1.5 py-0.5 text-[10px] font-mono font-medium text-text-muted bg-surface-default">
              /
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button className="text-text-muted hover:text-text-main transition-colors">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-default border border-border-color flex items-center justify-center cursor-pointer">
            <span className="text-xs font-bold text-primary">U</span>
          </div>
        </div>
      </header>

      {/* ── Scrollable main ── */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto w-full">
          {/* Error banners */}
          {loadError && (
            <div className="mb-4 rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-xs text-error">
              Failed to load projects: {loadError}
            </div>
          )}
          {deleteError && (
            <div className="mb-4 rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-xs text-error">
              Delete failed: {deleteError}
            </div>
          )}

          {/* Section Title */}
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h3 className="text-text-muted font-bold text-[11px] tracking-[0.1em] uppercase mb-1">
                Active Environments
              </h3>
              <p className="text-sm text-text-muted">
                You have {projects.length} local project{projects.length !== 1 ? 's' : ''} being
                managed by Claude Code.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-text-muted bg-surface-default px-2.5 py-1 rounded border border-border-color">
                {filtered.length} TOTAL
              </span>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded border transition-all ${
                  viewMode === 'grid'
                    ? 'text-text-main bg-surface-default border-border-color'
                    : 'text-text-muted bg-transparent border-transparent hover:text-text-main'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded border transition-all ${
                  viewMode === 'list'
                    ? 'text-text-main bg-surface-default border-border-color'
                    : 'text-text-muted bg-transparent border-transparent hover:text-text-main'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">list</span>
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && projects.length === 0 && (
            <p className="text-xs text-text-muted">Loading...</p>
          )}

          {/* Empty state */}
          {!loading && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-default border border-border-color flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-text-muted text-[28px]">folder_open</span>
              </div>
              <p className="mb-2 text-sm text-text-muted">No projects registered yet.</p>
              <p className="text-xs text-text-dimmer mb-6">
                Register an existing project or scaffold a new one to get started.
              </p>
              <button
                onClick={() => { setModalMode('register'); setShowModal(true); }}
                className="rounded-lg h-10 px-6 bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all"
              >
                Register Project
              </button>
            </div>
          )}

          {/* Grid view */}
          {viewMode === 'grid' && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  status={getStatus(project)}
                  onOpenTerminal={() => handleOpenTerminal(project)}
                  onDelete={() => handleDeleteClick(project)}
                />
              ))}
              <AddCard onClick={() => { setModalMode('register'); setShowModal(true); }} />
            </div>
          )}

          {/* List view */}
          {viewMode === 'list' && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-color text-text-muted uppercase tracking-wide text-[11px]">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Path</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Created</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => (
                    <ListRow
                      key={project.id}
                      project={project}
                      status={getStatus(project)}
                      onOpenTerminal={() => handleOpenTerminal(project)}
                      onDelete={() => handleDeleteClick(project)}
                    />
                  ))}
                </tbody>
              </table>
              <div className="mt-6">
                <button
                  onClick={() => { setModalMode('register'); setShowModal(true); }}
                  className="rounded-lg border border-dashed border-border-color px-4 py-2 text-sm text-text-muted hover:border-primary hover:text-primary transition-colors"
                >
                  + Register Existing Project
                </button>
              </div>
            </div>
          )}

          {/* No search results */}
          {query && filtered.length === 0 && projects.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-text-muted text-[32px] mb-3">search_off</span>
              <p className="text-sm text-text-muted">No projects matching &quot;{searchQuery}&quot;</p>
            </div>
          )}

          {/* Scaffold CTA Banner */}
          {projects.length > 0 && (
            <div className="mt-16 p-8 border border-border-color rounded-2xl bg-surface-default/50 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[28px]">
                    rocket_launch
                  </span>
                </div>
                <div>
                  <h4 className="text-base font-semibold text-text-main">
                    Start a new project with AI?
                  </h4>
                  <p className="text-sm text-text-muted">
                    Generate a boilerplate project structure with automated scaffolding.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setModalMode('scaffold'); setShowModal(true); }}
                className="flex items-center justify-center rounded-lg h-11 px-8 bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                Scaffold New Project
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {showModal && <AddProjectModal mode={modalMode} onClose={handleModalClose} />}
      {confirmTarget && (
        <ConfirmDialog
          projectName={confirmTarget.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmTarget(null)}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}
