import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../hooks/useApi.js';
import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import AddProjectModal from './AddProjectModal.jsx';

const NAV_ITEMS = [
  { view: 'terminal', label: 'Terminal', icon: '>' },
  { view: 'jobs', label: 'Jobs', icon: '#' },
  { view: 'entities', label: 'Entities', icon: '@' },
  { view: 'projects', label: 'Projects', icon: '=' },
];

export default function Sidebar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [showModal, setShowModal] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Load projects on mount
  useEffect(() => {
    apiGet('/api/v1/projects')
      .then((projects) => dispatch({ type: 'SET_PROJECTS', payload: projects }))
      .catch((err) => setLoadError(err.message));
  }, [dispatch]);

  async function handleProjectClick(project) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project.id });
    dispatch({ type: 'SET_VIEW', payload: 'terminal' });

    if (!state.sessions[project.id]) {
      try {
        const session = await apiPost('/api/v1/sessions', { projectId: project.id });
        dispatch({
          type: 'SET_SESSION',
          payload: { projectId: project.id, session },
        });
      } catch (err) {
        // Session creation failure is non-fatal — Terminal will show empty state
        console.error('Failed to create session:', err.message);
      }
    }
  }

  function handleNavClick(view) {
    dispatch({ type: 'SET_VIEW', payload: view });
  }

  return (
    <>
      <aside
        className="flex flex-col h-full border-r border-gray-800"
        style={{ width: '256px', minWidth: '256px', backgroundColor: '#1a1a1a' }}
      >
        {/* App title */}
        <div
          className="px-4 py-4 border-b border-gray-800"
          style={{ flexShrink: 0 }}
        >
          <span
            className="text-xs font-bold tracking-wide"
            style={{ color: '#4ade80', lineHeight: 1.4 }}
          >
            Claude Code
            <br />
            <span style={{ color: '#9ca3af' }}>Visual Manager</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="px-2 py-3 border-b border-gray-800" style={{ flexShrink: 0 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = state.view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNavClick(item.view)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs transition-colors text-left"
                style={{
                  color: isActive ? '#4ade80' : '#9ca3af',
                  backgroundColor: isActive ? 'rgba(74,222,128,0.08)' : 'transparent',
                }}
              >
                <span style={{ fontFamily: 'monospace', width: '12px' }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Projects list */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{ flexShrink: 0 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Projects
            </span>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Add project"
              aria-label="Add project"
              style={{ fontSize: '14px', lineHeight: 1 }}
            >
              +
            </button>
          </div>

          {loadError && (
            <p className="px-4 pb-2 text-xs text-red-400">{loadError}</p>
          )}

          <ul className="flex-1 overflow-y-auto px-2 pb-2">
            {state.projects.length === 0 && !loadError && (
              <li className="px-3 py-3 text-xs text-gray-600 italic">
                No projects yet. Click + to add one.
              </li>
            )}
            {state.projects.map((project) => {
              const session = state.sessions[project.id];
              const hasSession = Boolean(session);
              const isActive = state.activeProjectId === project.id;

              return (
                <li key={project.id}>
                  <button
                    onClick={() => handleProjectClick(project)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded text-left transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? 'rgba(74,222,128,0.10)'
                        : 'transparent',
                      color: isActive ? '#f9fafb' : '#d1d5db',
                    }}
                  >
                    {/* Session status dot */}
                    <span
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width: '7px',
                        height: '7px',
                        backgroundColor: hasSession ? '#4ade80' : '#4b5563',
                      }}
                    />
                    <span
                      className="flex-1 truncate text-xs"
                      title={project.path}
                    >
                      {project.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {showModal && <AddProjectModal onClose={() => setShowModal(false)} />}
    </>
  );
}
