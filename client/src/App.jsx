import { lazy, Suspense } from 'react';
import { AppProvider, useAppState } from './store/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';

const TerminalView = lazy(() => import('./views/TerminalView.jsx'));
const JobView = lazy(() => import('./views/JobView.jsx'));
const ProjectsView = lazy(() => import('./views/ProjectsView.jsx'));
const ContextEditorView = lazy(() => import('./views/ContextEditorView.jsx'));
const DeploymentManagerView = lazy(() => import('./views/DeploymentManagerView.jsx'));
const SwarmView = lazy(() => import('./views/SwarmView.jsx'));
const PackBuilderView = lazy(() => import('./views/PackBuilderView.jsx'));
const PackLibraryView = lazy(() => import('./views/PackLibraryView.jsx'));

function ViewFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-text-muted">
      Loading view…
    </div>
  );
}

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
    case 'packs':
      return <PackLibraryView />;
    default:
      return <ProjectsView />;
  }
}

function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background-dark text-text-main">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Suspense fallback={<ViewFallback />}>
          <MainContent />
        </Suspense>
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
