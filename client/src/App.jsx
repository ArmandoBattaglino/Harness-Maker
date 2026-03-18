import { AppProvider, useAppState } from './store/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TerminalView from './views/TerminalView.jsx';
import JobView from './views/JobView.jsx';
import EntitiesView from './views/EntitiesView.jsx';
import ProjectsView from './views/ProjectsView.jsx';

function MainContent() {
  const { view } = useAppState();

  switch (view) {
    case 'terminal':
      return <TerminalView />;
    case 'jobs':
      return <JobView />;
    case 'entities':
      return <EntitiesView />;
    case 'projects':
      return <ProjectsView />;
    default:
      return <TerminalView />;
  }
}

function AppLayout() {
  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ backgroundColor: '#111111', color: 'white' }}
    >
      <Sidebar />
      <main className="flex flex-1 overflow-hidden">
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
