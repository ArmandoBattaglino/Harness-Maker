import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SwarmView from './SwarmView.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';
import { useInbox } from '../hooks/useInbox.js';
import { useSwarm } from '../hooks/useSwarm.js';
import { apiGet, apiPost, apiPut } from '../hooks/useApi.js';
import { useCanvasValidation } from '../hooks/useCanvasValidation.js';

const workflowListMock = {
  workflows: [],
  loading: false,
  error: null,
  refresh: vi.fn(),
};

const emptyValidation = {
  errors: [],
  globalIssues: [],
  agentIssuesByNodeId: {},
  blockingIssues: [],
};

const useSwarmMockValue = {
  startExecution: vi.fn(),
  stopExecution: vi.fn(),
};
const appStateMock = {
  activeProjectId: 'project-1',
  projects: [
    { id: 'project-1', name: 'Project One', path: 'C:\\Projects\\One' },
  ],
  projectsHydrated: true,
  navigationIntent: null,
};
const appDispatchMock = vi.fn();

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
  default: ({ onApply }) => (
    <button
      type="button"
      onClick={() => onApply(
        {},
        {},
        'Dirty workflow goal',
        [{ key: 'brief', label: 'Brief', type: 'textarea', required: true, helpText: 'Campaign brief' }],
        {
          outputs: [{ key: 'result', label: 'Result', source: 'finalText' }],
          artifacts: [{ key: 'report', label: 'Report', format: 'markdown', source: 'aggregatedArtifact' }],
        }
      )}
    >
      Apply mocked workflow interface
    </button>
  ),
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
  useAppState: vi.fn(() => appStateMock),
  useAppDispatch: vi.fn(() => appDispatchMock),
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
    workflowListMock.workflows = [];
    appStateMock.navigationIntent = null;
    appDispatchMock.mockReset();
    vi.mocked(useInbox).mockReset();
    vi.mocked(useCanvasValidation).mockReturnValue(emptyValidation);
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
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPut).mockReset();
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
    expect(screen.getByTitle('Choose the provider strategy for the next run')).toHaveValue('auto');
    expect(screen.getAllByText('Claude').length).toBeGreaterThan(0);
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

  it('keeps the runtime selector truthful after reset from a completed concrete-provider run', async () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-reset',
        name: 'Workflow Reset',
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Agent A' } }],
        edges: [],
      },
      activeExecutionId: 'exec-reset',
      executionStatus: 'completed',
      runtimeProvider: 'codex',
      providerStrategy: { mode: 'codex' },
      selectedRuntimeProvider: 'codex',
      agentStates: {
        'node-a': {
          status: 'done',
          spawnMode: 'codex-sdk',
        },
      },
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/v1/swarm/runtime-capabilities');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(useSwarmStore.getState().selectedRuntimeProvider).toBe('codex');
    expect(screen.getByTitle('Choose the provider strategy for the next run')).toHaveValue('codex');
    expect(screen.getAllByText('Codex').length).toBeGreaterThan(0);
  });

  it('shows PTY pause/stop controls during an active PTY run', async () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-pty',
        name: 'Workflow PTY',
        nodes: [{ id: 'node-pty', type: 'agent', data: { label: 'PTY Agent' } }],
        edges: [],
      },
      activeExecutionId: 'exec-pty',
      executionStatus: 'running',
      agentStates: {
        'node-pty': {
          status: 'running',
          spawnMode: 'pty',
        },
      },
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset Session' })).not.toBeInTheDocument();
  });

  it('shows Resume plus blocker and fallback banners for paused or blocked states', async () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-stateful',
        name: 'Workflow Stateful',
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Agent A' } }],
        edges: [],
      },
      activeExecutionId: 'exec-stateful',
      executionStatus: 'paused',
      runtimeBlocker: {
        message: 'Provider requires authentication',
        provider: 'gemini',
      },
      lastFallback: {
        fromProvider: 'claude',
        toProvider: 'codex',
        reason: 'quota',
      },
      agentStates: {
        'node-a': {
          status: 'paused',
          spawnMode: 'pty',
        },
      },
    });

    const { rerender } = render(<SwarmView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });

    useSwarmStore.setState({ executionStatus: 'blocked' });
    rerender(<SwarmView />);

    await waitFor(() => {
      expect(screen.getByText(/Provider requires authentication/i)).toBeInTheDocument();
      expect(screen.getByText(/Gemini error/i)).toBeInTheDocument();
      expect(screen.getByText(/Runtime fallback: claude to codex because quota\./i)).toBeInTheDocument();
    });
  });

  it('disables Run for global blockers and keeps agent warnings out of the top summary', async () => {
    vi.mocked(useCanvasValidation).mockReturnValue({
      errors: [
        {
          id: 'workflow:no-start-node',
          scope: 'global',
          severity: 'error',
          summary: 'No start node',
          detail: 'No start node — mark one or more agents as Start Node, or keep at least one root agent with no incoming edges.',
          message: 'No start node — mark one or more agents as Start Node, or keep at least one root agent with no incoming edges.',
        },
        {
          id: 'agent:node-a:empty-system-prompt',
          scope: 'agent',
          nodeId: 'node-a',
          severity: 'warning',
          summary: 'Empty system prompt',
          detail: 'Agent A has an empty system prompt. Add guidance so the agent knows what to do.',
          message: 'Agent A has an empty system prompt. Add guidance so the agent knows what to do.',
        },
      ],
      globalIssues: [
        {
          id: 'workflow:no-start-node',
          scope: 'global',
          severity: 'error',
          summary: 'No start node',
          detail: 'No start node — mark one or more agents as Start Node, or keep at least one root agent with no incoming edges.',
        },
      ],
      agentIssuesByNodeId: {
        'node-a': [
          {
            id: 'agent:node-a:empty-system-prompt',
            scope: 'agent',
            nodeId: 'node-a',
            severity: 'warning',
            summary: 'Empty system prompt',
            detail: 'Agent A has an empty system prompt. Add guidance so the agent knows what to do.',
          },
        ],
      },
      blockingIssues: [
        {
          id: 'workflow:no-start-node',
          scope: 'global',
          severity: 'error',
          summary: 'No start node',
          detail: 'No start node — mark one or more agents as Start Node, or keep at least one root agent with no incoming edges.',
        },
      ],
    });

    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-validation',
        name: 'Workflow Validation',
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Agent A' } }],
        edges: [],
      },
      executionStatus: 'idle',
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(screen.getByText(/workflow issue needs attention\./i)).toBeInTheDocument();
    });

    const runButton = screen.getByRole('button', { name: 'Run' });
    expect(runButton).toBeDisabled();
    expect(screen.getByText('No start node')).toBeInTheDocument();
    expect(screen.queryByText(/empty system prompt/i)).not.toBeInTheDocument();
  });

  it('opens a workflow-native run form, blocks missing required input, and starts with submitted values', async () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-inputs',
        name: 'Workflow Inputs',
        inputContract: [
          { key: 'brief', label: 'Brief', type: 'textarea', required: true, helpText: 'Campaign brief' },
          { key: 'tone', label: 'Tone', type: 'enum', required: false, options: ['formal', 'friendly'], defaultValue: 'friendly' },
        ],
        outputContract: {
          outputs: [{ key: 'result', label: 'Result', source: 'finalText' }],
          artifacts: [{ key: 'report', label: 'Report', format: 'markdown', source: 'aggregatedArtifact' }],
        },
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Agent A' } }],
        edges: [],
      },
      executionStatus: 'idle',
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/v1/swarm/runtime-capabilities');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('Run workflow')).toBeInTheDocument();
    expect(screen.getByText(/Expected run result/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Brief is required.');

    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Launch campaign X' } });
    fireEvent.change(screen.getByLabelText(/Tone/i), { target: { value: 'formal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => {
      expect(useSwarmMockValue.startExecution).toHaveBeenCalledWith(
        'project-1',
        'C:\\Projects\\One',
        'auto',
        expect.objectContaining({ claude: 'claude-sonnet', codex: 'gpt-5.4' }),
        'workflow-inputs',
        { brief: 'Launch campaign X', tone: 'formal' }
      );
    });
  });

  it('saves dirty workflow interface contracts before starting a direct run', async () => {
    vi.mocked(apiPut).mockResolvedValue({
      workflow: {
        id: 'workflow-dirty',
        name: 'Workflow Dirty',
        description: 'Dirty workflow goal',
        inputContract: [{ key: 'brief', label: 'Brief', type: 'textarea', required: true, helpText: 'Campaign brief' }],
        outputContract: {
          outputs: [{ key: 'result', label: 'Result', source: 'finalText' }],
          artifacts: [{ key: 'report', label: 'Report', format: 'markdown', source: 'aggregatedArtifact' }],
        },
        nodes: [{ id: 'node-a', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agent A' } }],
        edges: [],
      },
    });
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-dirty',
        name: 'Workflow Dirty',
        description: 'Old goal',
        nodes: [{ id: 'node-a', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agent A' } }],
        edges: [],
      },
      executionStatus: 'idle',
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/v1/swarm/runtime-capabilities');
    });
    fireEvent.click(screen.getByRole('button', { name: /Settings/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply mocked workflow interface' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Fresh brief' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith('/api/v1/workflows/workflow-dirty', expect.objectContaining({
        inputContract: [expect.objectContaining({ key: 'brief', required: true })],
        outputContract: expect.objectContaining({
          outputs: [expect.objectContaining({ key: 'result' })],
          artifacts: [expect.objectContaining({ key: 'report' })],
        }),
      }));
      expect(useSwarmMockValue.startExecution).toHaveBeenCalledWith(
        'project-1',
        'C:\\Projects\\One',
        'auto',
        expect.any(Object),
        'workflow-dirty',
        { brief: 'Fresh brief' }
      );
    });
  });

  it('creates an unsaved workflow with its workflow-native contracts before direct run', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      workflow: {
        id: 'workflow-created',
        name: 'Unsaved Workflow',
        inputContract: [{ key: 'brief', label: 'Brief', type: 'textarea', required: true }],
        outputContract: { outputs: [{ key: 'result', label: 'Result', source: 'finalText' }], artifacts: [] },
        nodes: [{ id: 'node-a', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agent A' } }],
        edges: [],
      },
    });
    useSwarmStore.setState({
      workflowDef: {
        name: 'Unsaved Workflow',
        inputContract: [{ key: 'brief', label: 'Brief', type: 'textarea', required: true }],
        outputContract: { outputs: [{ key: 'result', label: 'Result', source: 'finalText' }], artifacts: [] },
        nodes: [{ id: 'node-a', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agent A' } }],
        edges: [],
      },
      executionStatus: 'idle',
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/v1/swarm/runtime-capabilities');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Unsaved brief' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/v1/workflows', expect.objectContaining({
        name: 'Unsaved Workflow',
        inputContract: [expect.objectContaining({ key: 'brief' })],
        outputContract: expect.objectContaining({
          outputs: [expect.objectContaining({ key: 'result' })],
        }),
      }));
      expect(useSwarmMockValue.startExecution).toHaveBeenCalledWith(
        'project-1',
        'C:\\Projects\\One',
        'auto',
        expect.any(Object),
        'workflow-created',
        { brief: 'Unsaved brief' }
      );
    });
  });

  it('consumes workflow drill-down navigation intent and shows pack drill-down context', async () => {
    workflowListMock.workflows = [
      {
        id: 'wf-pack',
        name: 'Pack Workflow',
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Agent A' } }],
        edges: [],
      },
    ];
    appStateMock.navigationIntent = {
      source: 'pack-builder',
      focus: 'workflow-runtime',
      packId: 'pack-1',
      workflowId: 'wf-pack',
      executionId: 'exec-pack-1',
    };

    render(<SwarmView />);

    await waitFor(() => {
      expect(useSwarmStore.getState().workflowDef?.id).toBe('wf-pack');
      expect(screen.getByText(/Pack drill-down from pack-builder/i)).toBeInTheDocument();
      expect(screen.getByText(/Relevant execution context: exec-pack-1/i)).toBeInTheDocument();
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'CLEAR_NAVIGATION_INTENT' });
    });

    appStateMock.navigationIntent = null;
    await act(async () => {
      useSwarmStore.setState({
        workflowDef: {
          id: 'wf-other',
          name: 'Other Workflow',
          nodes: [{ id: 'node-b', type: 'agent', data: { label: 'Agent B' } }],
          edges: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Pack drill-down from pack-builder/i)).not.toBeInTheDocument();
    });
  });
});
