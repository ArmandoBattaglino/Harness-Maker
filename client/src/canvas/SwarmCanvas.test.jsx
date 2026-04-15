import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SwarmCanvas from './SwarmCanvas.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';

let lastReactFlowProps = null;

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props) => {
    lastReactFlowProps = props;
    return <div data-testid="react-flow">{props.children}</div>;
  },
  Background: () => null,
  Controls: ({ className }) => <div data-testid="react-flow-controls" className={className} />,
  MiniMap: ({ className }) => <div data-testid="react-flow-minimap" className={className} />,
  ConnectionLineType: { SmoothStep: 'smoothstep' },
  ConnectionMode: { Loose: 'loose' },
  MarkerType: { Arrow: 'arrow' },
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  Handle: () => null,
  useNodesState: (initial) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial) => [initial, vi.fn(), vi.fn()],
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  useReactFlow: () => ({
    fitView: vi.fn(),
    screenToFlowPosition: (position) => position,
  }),
}));

vi.mock('./AgentInspector', () => ({
  default: () => null,
}));

vi.mock('./BreadcrumbBar', () => ({
  default: () => null,
}));

vi.mock('./ContextMenu', () => ({
  default: () => null,
}));

vi.mock('./NodePalette', () => ({
  default: () => null,
}));

vi.mock('../hooks/useCanvasHistory', () => ({
  useCanvasHistory: () => ({
    pushHistory: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

describe('SwarmCanvas activity rail', () => {
  beforeEach(() => {
    resetSwarmStore();
    lastReactFlowProps = null;
  });

  it('keeps the chat empty state visible while idle when the side panel is open', () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-1',
        name: 'Workflow 1',
        nodes: [],
        edges: [],
      },
      executionStatus: 'idle',
      sidePanelOpen: true,
      sidePanelMode: 'chat',
      chatMessages: [],
      interAgentFeed: [],
    });

    render(
      <SwarmCanvas
        workflowDef={{ id: 'workflow-1', name: 'Workflow 1', nodes: [], edges: [] }}
        markDirty={vi.fn()}
        onCanvasChange={vi.fn()}
      />
    );

    expect(screen.getByText('Chat View')).toBeInTheDocument();
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
  });

  it('preserves chat messages after reset without reopening an idle activity rail', () => {
    const workflowDef = {
      id: 'workflow-1',
      name: 'Workflow 1',
      nodes: [],
      edges: [],
    };

    useSwarmStore.setState({
      workflowDef,
      executionStatus: 'completed',
      sidePanelOpen: false,
      sidePanelMode: 'feed',
      chatMessages: [
        { role: 'assistant', text: 'Finished run', timestamp: 100, nodeId: 'node-a' },
      ],
      interAgentFeed: [
        { type: 'handoff_started', timestamp: 100 },
      ],
    });

    render(
      <SwarmCanvas
        workflowDef={workflowDef}
        markDirty={vi.fn()}
        onCanvasChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Activity' })).toBeInTheDocument();

    act(() => {
      useSwarmStore.getState().reset();
    });

    expect(screen.queryByText('Chat View')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Activity' })).toBeInTheDocument();
  });

  it('shows unread activity as a badge without auto-opening the rail', () => {
    const workflowDef = {
      id: 'workflow-activity-badge',
      name: 'Workflow Activity Badge',
      nodes: [],
      edges: [],
    };

    useSwarmStore.setState({
      workflowDef,
      executionStatus: 'running',
      sidePanelOpen: false,
      activityUnreadCount: 0,
    });

    render(
      <SwarmCanvas
        workflowDef={workflowDef}
        markDirty={vi.fn()}
        onCanvasChange={vi.fn()}
      />
    );

    act(() => {
      useSwarmStore.getState().addChatMessage({
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Routine activity',
        timestamp: 1,
      });
    });

    expect(screen.queryByText('Chat View')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Activity (1 unread)' })).toBeInTheDocument();
  });

  it('applies hardened class names to React Flow controls and minimap', () => {
    useSwarmStore.setState({
      workflowDef: {
        id: 'workflow-visual-shell',
        name: 'Workflow Visual Shell',
        nodes: [],
        edges: [],
      },
      executionStatus: 'idle',
      sidePanelOpen: true,
      sidePanelMode: 'chat',
    });

    render(
      <SwarmCanvas
        workflowDef={{ id: 'workflow-visual-shell', name: 'Workflow Visual Shell', nodes: [], edges: [] }}
        markDirty={vi.fn()}
        onCanvasChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('react-flow-controls')).toHaveClass('swarm-flow-controls');
    expect(screen.getByTestId('react-flow-minimap')).toHaveClass('swarm-flow-minimap');
  });

  it('normalizes legacy input nodes to the canonical workflowInput type before rendering', () => {
    const workflowDef = {
      id: 'workflow-legacy-input',
      name: 'Workflow Legacy Input',
      nodes: [
        {
          id: 'input-a',
          type: 'input',
          position: { x: 10, y: 20 },
          data: { label: 'Legacy Input', fields: [{ key: 'brief', label: 'Brief', type: 'text' }] },
        },
      ],
      edges: [],
    };

    render(
      <SwarmCanvas
        workflowDef={workflowDef}
        markDirty={vi.fn()}
        onCanvasChange={vi.fn()}
      />
    );

    expect(lastReactFlowProps.nodes[0].type).toBe('workflowInput');
  });
});
