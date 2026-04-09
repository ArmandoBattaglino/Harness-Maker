import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SwarmView from './SwarmView.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';
import { useInbox } from '../hooks/useInbox.js';
import { useSwarm } from '../hooks/useSwarm.js';
import { apiGet } from '../hooks/useApi.js';
import { getPendingCount } from '../panels/HitlInbox';
import { useCanvasValidation } from '../hooks/useCanvasValidation.js';

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
    vi.mocked(getPendingCount).mockReturnValue(0);
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
    expect(screen.getByText('Provider: Codex')).toBeInTheDocument();
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
      expect(screen.getByText(/Provider: gemini\./i)).toBeInTheDocument();
      expect(screen.getByText(/Runtime fallback: claude to codex because quota\./i)).toBeInTheDocument();
    });
  });

  it('disables Run and shows validation plus HITL state when operator blockers exist', async () => {
    vi.mocked(getPendingCount).mockReturnValue(2);
    vi.mocked(useCanvasValidation).mockReturnValue({
      errors: [
        { severity: 'error', message: 'Triage node missing' },
        { severity: 'warning', message: 'One node has no label' },
      ],
    });

    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-validation',
        name: 'Workflow Validation',
        nodes: [],
        edges: [],
      },
      executionStatus: 'idle',
      inboxItems: [{ id: 'hitl-1' }, { id: 'hitl-2' }],
    });

    render(<SwarmView />);

    await waitFor(() => {
      expect(screen.getByText(/Validation \(2\):/i)).toBeInTheDocument();
    });

    const runButton = screen.getByRole('button', { name: 'Run' });
    expect(runButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /HITL \(2\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Triage node missing/i)).toBeInTheDocument();
    expect(screen.getByText(/One node has no label/i)).toBeInTheDocument();
  });
});
