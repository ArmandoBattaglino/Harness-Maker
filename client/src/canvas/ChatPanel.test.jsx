import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from './ChatPanel.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';
import { apiPost } from '../hooks/useApi.js';

vi.mock('../hooks/useApi.js', () => ({
  apiPost: vi.fn(),
}));

const scrollTops = new WeakMap();

beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return Number(this.dataset.scrollHeight ?? 500);
    },
  });

  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return Number(this.dataset.clientHeight ?? 100);
    },
  });

  Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return scrollTops.get(this) ?? 0;
    },
    set(value) {
      scrollTops.set(this, value);
    },
  });
});

describe('ChatPanel client rendering contracts', () => {
  beforeEach(() => {
    resetSwarmStore();
    vi.mocked(apiPost).mockReset();
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-1',
        nodes: [
          { id: 'node-a', type: 'agent', data: { label: 'Agent A', parentDepartmentId: 'dept-1' } },
          { id: 'node-b', type: 'agent', data: { label: 'Agent B' } },
          { id: 'dept-1', type: 'department', data: { label: 'Dept 1' } },
        ],
        edges: [],
      },
      activeExecutionId: 'exec-1',
      executionStatus: 'running',
      sidePanelOpen: true,
      sidePanelMode: 'chat',
      chatFilter: 'all',
    });
  });

  it('groups consecutive structured assistant fragments from the same node', () => {
    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Hel', timestamp: 100, spawnMode: 'stream-json' },
        { nodeId: 'node-a', role: 'assistant', text: 'lo', timestamp: 101, spawnMode: 'stream-json' },
        { nodeId: 'node-b', role: 'assistant', text: 'World', timestamp: 102, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json' },
        'node-b': { spawnMode: 'stream-json' },
      },
    });

    const { container } = render(<ChatPanel />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
    expect(container.querySelectorAll('.px-2.py-1 > .rounded-lg')).toHaveLength(2);
  });

  it('keeps consecutive structured turns from the same node as separate bubbles', () => {
    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Hello', timestamp: 100, turnId: 'node-a:1', spawnMode: 'stream-json' },
        { nodeId: 'node-a', role: 'assistant', text: 'Bonjour', timestamp: 101, turnId: 'node-a:2', spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json' },
      },
    });

    const { container } = render(<ChatPanel />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(container.querySelectorAll('.px-2.py-1 > .rounded-lg')).toHaveLength(2);
  });

  it('filters by agent without hiding system messages', async () => {
    const user = userEvent.setup();
    useSwarmStore.setState({
      chatMessages: [
        { role: 'system', text: 'System marker', timestamp: 50 },
        { nodeId: 'node-a', role: 'assistant', text: 'Alpha', timestamp: 100, spawnMode: 'stream-json' },
        { nodeId: 'node-b', role: 'assistant', text: 'Beta', timestamp: 101, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json' },
        'node-b': { spawnMode: 'stream-json' },
      },
    });

    render(<ChatPanel />);

    await user.selectOptions(screen.getAllByRole('combobox')[0], 'node-a');

    expect(screen.getByText('System marker')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('sends the integrated broadcast payload for agent-targeted messages', async () => {
    const user = userEvent.setup();
    vi.mocked(apiPost).mockResolvedValue({
      sent: 1,
      recipientNodeIds: ['node-a'],
    });

    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Ready', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json', acceptsMessages: true },
      },
    });

    render(<ChatPanel />);

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'agent');
    await user.selectOptions(screen.getAllByRole('combobox')[2], 'node-a');
    await user.type(screen.getByPlaceholderText(/Message Agent A/i), 'Ping');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(apiPost).toHaveBeenCalledWith('/api/v1/swarm/exec-1/broadcast', {
      text: 'Ping',
      scope: 'agent',
      targetId: 'node-a',
      mode: 'soft',
    });
    await waitFor(() => {
      expect(screen.getByText('Sent to 1 agent: Agent A')).toBeInTheDocument();
    });
  });

  it('sends the integrated broadcast payload for department-targeted messages', async () => {
    const user = userEvent.setup();
    vi.mocked(apiPost).mockResolvedValue({
      sent: 1,
      recipientNodeIds: ['node-a'],
    });

    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Ready', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json', acceptsMessages: true },
      },
    });

    render(<ChatPanel />);

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'department');
    await user.selectOptions(screen.getAllByRole('combobox')[2], 'dept-1');
    expect(screen.getByPlaceholderText(/Message department "Dept 1"/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Message department "Dept 1"/i), 'Coordinate');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(apiPost).toHaveBeenCalledWith('/api/v1/swarm/exec-1/broadcast', {
      text: 'Coordinate',
      scope: 'department',
      targetId: 'dept-1',
      mode: 'soft',
    });
  });

  it('shows a truthful no-recipient result when no reusable sessions are available', async () => {
    const user = userEvent.setup();
    vi.mocked(apiPost).mockResolvedValue({
      sent: 0,
      recipientNodeIds: [],
    });

    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Ready', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json', acceptsMessages: true },
      },
    });

    render(<ChatPanel />);

    await user.type(screen.getByPlaceholderText(/Message all agents/i), 'Ping');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('No reusable agent sessions available for this target')).toBeInTheDocument();
    });
  });

  it('renders HITL messages through the inline card path', () => {
    useSwarmStore.setState({
      chatMessages: [
        {
          nodeId: 'node-a',
          role: 'hitl',
          text: 'Approval required',
          timestamp: 100,
          hitlItemId: 'hitl-1',
          hitlType: 'approval',
        },
      ],
      inboxItems: [
        {
          item: {
            id: 'hitl-1',
            status: 'pending',
            message: 'Approval required',
          },
          nodeId: 'node-a',
        },
      ],
    });

    render(<ChatPanel />);

    expect(screen.getByText('Approval required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
  });

  it('syncs the input scope with the active chat filter', async () => {
    useSwarmStore.setState({
      chatFilter: 'node-a',
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Ready', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json', acceptsMessages: true },
      },
    });

    render(<ChatPanel />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Message Agent A/i)).toBeInTheDocument();
    });
  });

  it('keeps the user position when new messages arrive far from the bottom', async () => {
    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'One', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json' },
      },
    });

    const { container } = render(<ChatPanel />);
    const scrollContainer = container.querySelector('.overflow-y-auto');

    expect(scrollContainer.scrollTop).toBe(500);

    scrollContainer.dataset.scrollHeight = '600';
    scrollContainer.scrollTop = 200;

    act(() => {
      useSwarmStore.getState().addChatMessage({
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Two',
        timestamp: 101,
        spawnMode: 'stream-json',
      });
    });

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(200);
    });
  });

  it('auto-scrolls when the user is already near the bottom', async () => {
    useSwarmStore.setState({
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'One', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json' },
      },
    });

    const { container } = render(<ChatPanel />);
    const scrollContainer = container.querySelector('.overflow-y-auto');

    scrollContainer.dataset.scrollHeight = '600';
    scrollContainer.scrollTop = 450;

    act(() => {
      scrollContainer.dataset.scrollHeight = '700';
      useSwarmStore.getState().addChatMessage({
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Two',
        timestamp: 101,
        spawnMode: 'stream-json',
      });
    });

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(700);
    });
  });

  it('keeps chat input available for completed executions with reusable agent sessions', () => {
    useSwarmStore.setState({
      executionStatus: 'completed',
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'Completed', timestamp: 100, spawnMode: 'stream-json' },
      ],
      agentStates: {
        'node-a': { spawnMode: 'stream-json', acceptsMessages: true },
      },
    });

    render(<ChatPanel />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
