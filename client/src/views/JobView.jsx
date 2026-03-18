import { useAppState } from '../store/AppContext.jsx';
import JobPanel from '../components/JobPanel.jsx';

export default function JobView() {
  const { activeProjectId, projects } = useAppState();

  if (!activeProjectId) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ backgroundColor: '#111111' }}
      >
        <p className="text-xs" style={{ color: '#4b5563' }}>
          Select a project from the sidebar to run a job.
        </p>
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectName = activeProject ? activeProject.name : activeProjectId;

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: '#111111' }}>
      {/* Header */}
      <div
        className="flex items-center px-4 py-3 border-b"
        style={{
          borderColor: '#1f2937',
          flexShrink: 0,
          backgroundColor: '#1a1a1a',
        }}
      >
        <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>
          Job Mode
        </span>
        <span className="mx-2 text-xs" style={{ color: '#374151' }}>
          /
        </span>
        <span className="text-xs truncate" style={{ color: '#9ca3af' }}>
          {projectName}
        </span>
      </div>

      <JobPanel projectId={activeProjectId} />
    </div>
  );
}
