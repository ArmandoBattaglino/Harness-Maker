import { AppProvider, useAppState } from './store/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TerminalView from './views/TerminalView.jsx';
import JobView from './views/JobView.jsx';
import ProjectsView from './views/ProjectsView.jsx';
import ContextEditorView from './views/ContextEditorView.jsx';
import DeploymentManagerView from './views/DeploymentManagerView.jsx';
import SwarmView from './views/SwarmView.jsx';
import PackBuilderView from './views/PackBuilderView.jsx';

function MainContent() {
  const { view } = useAppState();

  switch (view) {
    case 'projects':
      return <ProjectsView />;
    case 'terminal':
      return <TerminalView />;
    case 'jobs':
      return <JobView />;
    case 'context':
      return <ContextEditorView />;
    case 'deployments':
      return <DeploymentManagerView />;
    case 'swarm':
      return <SwarmView />;
    case 'pack-builder':
      return <PackBuilderView />;
    default:
      return <ProjectsView />;
  }
}

function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background-dark text-text-main">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <MainContent />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
}
