import { useEffect, useState } from 'react';
import { apiGet, apiDelete } from '../hooks/useApi.js';
import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import AddProjectModal from '../components/AddProjectModal.jsx';

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-900 bg-opacity-60 text-green-400 border border-green-800">
      <span
        className="rounded-full"
        style={{ width: '6px', height: '6px', backgroundColor: '#4ade80', display: 'inline-block' }}
      />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-gray-800 text-gray-500 border border-gray-700">
      <span
        className="rounded-full"
        style={{ width: '6px', height: '6px', backgroundColor: '#4b5563', display: 'inline-block' }}
      />
      No session
    </span>
  );
}

function ConfirmDialog({ projectName, onConfirm, onCancel, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div
        className="w-full rounded border border-gray-700 bg-gray-900 p-6"
        style={{ maxWidth: '420px' }}
      >
        <h2 className="mb-3 text-sm font-semibold text-white">Remove Project</h2>
        <p className="mb-6 text-xs text-gray-400 leading-relaxed">
          Remove project{' '}
          <span className="text-white font-medium">"{projectName}"</span>? This will only
          deregister it — no files will be deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-gray-700 bg-transparent px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded border border-red-800 bg-red-900 bg-opacity-40 px-4 py-2 text-xs text-red-300 hover:bg-opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProjectsView() {
  const { projects, sessions } = useAppState();
  const dispatch = useAppDispatch();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // project to delete
  const [deleteError, setDeleteError] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  function handleOpenTerminal(project) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project.id });
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
    // Re-fetch to sync after ADD_PROJECT was dispatched inside the modal
    loadProjects();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ backgroundColor: '#111111' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-gray-800 px-6 py-4"
        style={{ flexShrink: 0 }}
      >
        <h1 className="text-sm font-semibold text-white">Projects</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded border border-green-700 bg-green-900 bg-opacity-30 px-4 py-2 text-xs text-green-300 hover:bg-opacity-60"
        >
          + Register Project
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {/* API-level load error */}
        {loadError && (
          <div className="mb-4 rounded border border-red-800 bg-red-900 bg-opacity-30 px-4 py-3 text-xs text-red-400">
            Failed to load projects: {loadError}
          </div>
        )}

        {/* Delete error (shown above table so it's visible without a modal) */}
        {deleteError && (
          <div className="mb-4 rounded border border-red-800 bg-red-900 bg-opacity-30 px-4 py-3 text-xs text-red-400">
            Delete failed: {deleteError}
          </div>
        )}

        {loading && projects.length === 0 ? (
          <p className="text-xs text-gray-600">Loading...</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="mb-2 text-sm text-gray-500">No projects registered yet.</p>
            <p className="text-xs text-gray-600">
              Click "Register Project" to add your first project.
            </p>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-700 text-gray-500 uppercase tracking-wide text-xs">
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">Path</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Created</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {projects.map((project) => {
                const hasSession = Boolean(sessions[project.id]);
                return (
                  <tr key={project.id} className="text-gray-300">
                    <td className="py-3 pr-4 font-medium text-white">{project.name}</td>
                    <td className="py-3 pr-4 max-w-xs">
                      <span
                        className="block truncate text-gray-400 font-mono"
                        title={project.path}
                      >
                        {project.path}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge active={hasSession} />
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{formatDate(project.createdAt)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenTerminal(project)}
                          className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:border-green-700 hover:text-green-300"
                        >
                          Open Terminal
                        </button>
                        <button
                          onClick={() => handleDeleteClick(project)}
                          className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-400 hover:border-red-800 hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showModal && <AddProjectModal onClose={handleModalClose} />}
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
