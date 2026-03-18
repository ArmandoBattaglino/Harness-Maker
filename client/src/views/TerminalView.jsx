import { useAppState } from '../store/AppContext.jsx';
import Terminal from '../components/Terminal.jsx';

export default function TerminalView() {
  const state = useAppState();
  const { activeProjectId, projects, sessions } = state;

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const session = activeProjectId ? sessions[activeProjectId] : null;
  const sessionId = session ? session.sessionId : null;

  if (!activeProject) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ backgroundColor: '#111111' }}>
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-2">No project selected</p>
          <p className="text-xs text-gray-600">
            Select a project from the sidebar to start a Claude session
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0"
        style={{ backgroundColor: '#1a1a1a', minHeight: '40px' }}
      >
        <span className="text-xs font-semibold text-gray-200">
          {activeProject.name}
        </span>
        <span className="text-xs text-gray-600 truncate" style={{ maxWidth: '320px' }}>
          {activeProject.path}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {session ? (
            <>
              <span
                className="inline-block rounded-full"
                style={{ width: '7px', height: '7px', backgroundColor: '#4ade80' }}
              />
              <span className="text-xs text-gray-400">
                PID {session.pid ?? session.sessionId?.slice(0, 8)}
              </span>
              {session.status && (
                <span className="text-xs text-gray-500">· {session.status}</span>
              )}
            </>
          ) : (
            <>
              <span
                className="inline-block rounded-full"
                style={{ width: '7px', height: '7px', backgroundColor: '#4b5563' }}
              />
              <span className="text-xs text-gray-500">No session</span>
            </>
          )}
        </div>
      </div>

      {/* Terminal fills the remaining space */}
      <div className="flex-1 overflow-hidden">
        <Terminal sessionId={sessionId} projectPath={activeProject.path} />
      </div>
    </div>
  );
}
