import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SwarmView from './SwarmView.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';
import { useInbox } from '../hooks/useInbox.js';
import { useSwarm } from '../hooks/useSwarm.js';
import { apiGet } from '../hooks/useApi.js';

const workflowListMock = {
  workflows: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
};

const emptyValidation = {
  errors: [],
};

const useSwarmMockValue = {
  startExecution: vi.fn(),
  stopExecution: vi.fn(),
};

vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }) => <div data-testid="react-flow-provider">{children}</div>,
}));

vi.mock('../canvas/SwarmCanvas', () => ({
  default: () => <div data-testid="swarm-canvas" />,
}));

vi.mock('../canvas/PromptToFlowBar', () => ({
  default: () => <div data-testid="prompt-to-flow" />,
}));

vi.mock('../canvas/PtyExplosion', () => ({
  default: () => null,
}));

vi.mock('../canvas/WorkflowSettingsModal', () => ({
  default: () => null,
}));

vi.mock('../canvas/ExecutionHistory', () => ({
  default: () => null,
}));

vi.mock('../canvas/TemplateGallery', () => ({
  default: () => null,
}));

vi.mock('../canvas/VersionHistory', () => ({
  default: () => null,
}));

vi.mock('../panels/WorkflowArtifactPanel', () => ({
  default: () => null,
}));

vi.mock('../panels/HitlInbox', () => ({
  getPendingCount: vi.fn(() => 0),
}));

vi.mock('../hooks/useSwarm.js', () => ({
  useSwarm: vi.fn(),
}));

vi.mock('../hooks/useInbox.js', () => ({
  useInbox: vi.fn(),
}));

vi.mock('../hooks/useWorkflow.js', () => ({
  useWorkflowList: vi.fn(() => workflowListMock),
}));

vi.mock('../store/AppContext', () => ({
  useAppState: vi.fn(() => ({
    activeProjectId: 'project-1',
    projects: [
      { id: 'project-1', name: 'Project One', path: 'C:\\Projects\\One' },
    ],
    projectsHydrated: true,
  })),
}));

vi.mock('../hooks/useApi.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('../hooks/useCanvasValidation.js', () => ({
  useCanvasValidation: vi.fn(() => emptyValidation),
}));

describe('SwarmView runtime shell contracts', () => {
  beforeEach(() => {
    resetSwarmStore();
    vi.mocked(useInbox).mockReset();
    workflowListMock.refresh.mockReset();
    useSwarmMockValue.startExecution.mockReset();
    useSwarmMockValue.stopExecution.mockReset();
    vi.mocked(useSwarm).mockReturnValue(useSwarmMockValue);
    vi.mocked(apiGet).mockImplementation(async (path) => {
      if (path === '/api/v1/swarm/runtime-capabilities') {
        return {
          providers: {
            claude: ['claude-sonnet'],
            codex: ['gpt-5.4'],
            gemini: [],
          },
          defaults: {
            claude: 'claude-sonnet',
            codex: 'gpt-5.4',
            gemini: '',
          },
          availability: {
            claude: true,
            codex: true,
            gemini: false,
          },
        };
      }
      throw new Error(`Unexpected apiGet path: ${path}`);
    });
  });

  it('shows structured-runtime controls for active stream-json executions', async () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-1',
        name: 'Workflow 1',
        nodes: [
          { id: 'node-a', type: 'agent', data: { label: 'Agent A' } },
        ],
        edges: [],
      },
      activeExecutionId: 'exec-1',
      executionStatus: 'running',
      runtimeProvider: 'claude',
      providerStrategy: { mode: 'auto' },
      agentStates: {
        'node-a': {
          status: 'running',
          spawnMode: 'stream-json',
          acceptsMessages: true,
        },
      },
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/v1/swarm/runtime-capabilities');
    });

    expect(useInbox).toHaveBeenCalledWith('exec-1');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Session' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.getByText('Provider: Claude')).toBeInTheDocument();
    expect(screen.getByText('Auto fallback')).toBeInTheDocument();
  });

  it('keeps structured session controls visible for completed executions with reusable sessions', async () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-1',
        name: 'Workflow 1',
        nodes: [
          { id: 'node-a', type: 'agent', data: { label: 'Agent A' } },
        ],
        edges: [],
      },
      activeExecutionId: 'exec-2',
      executionStatus: 'completed',
      runtimeProvider: 'claude',
      providerStrategy: { mode: 'auto' },
      agentStates: {
        'node-a': {
          status: 'done',
          spawnMode: 'stream-json',
          acceptsMessages: true,
        },
      },
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/v1/swarm/runtime-capabilities');
    });

    expect(screen.getByRole('button', { name: 'Reset Session' })).toBeInTheDocument();
  });
});
