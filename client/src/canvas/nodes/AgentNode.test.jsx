import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AgentNode from './AgentNode.jsx';
import { useSwarmStore } from '../../store/SwarmContext.jsx';
import { resetSwarmStore } from '../../test/resetSwarmStore.js';
import CanvasActionsContext from '../CanvasActionsContext.jsx';

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
  },
}));

describe('AgentNode runtime shell contracts', () => {
  beforeEach(() => {
    resetSwarmStore();
  });

  it('prioritizes the thinking ticker over tool and snippet text for structured runtimes', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-a': {
          status: 'running',
          spawnMode: 'stream-json',
          isThinking: true,
          currentTool: {
            toolName: 'Edit',
            toolUseId: 'tool-1',
            partialArgs: '{"file":"demo.js"}',
          },
          totalCost: {
            inputTokens: 12,
            outputTokens: 4,
            costUsd: 0.03,
          },
          lastChatSnippet: 'Structured output',
        },
      },
    });

    render(
      <AgentNode
        id="node-a"
        data={{ label: 'Agent A', systemPrompt: 'Be helpful' }}
        selected={false}
      />
    );

    expect(screen.getByText('Agent A')).toBeInTheDocument();
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    expect(screen.queryByText('Using: Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Structured output')).not.toBeInTheDocument();
    expect(screen.getByText('$0.03')).toBeInTheDocument();
  });

  it('does not leak structured-only badges for PTY agents', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-b': {
          status: 'running',
          spawnMode: 'pty',
          isThinking: true,
          currentTool: {
            toolName: 'Edit',
            toolUseId: 'tool-2',
            partialArgs: '{}',
          },
          lastOutputSnippet: 'Plain PTY output',
        },
      },
    });

    render(
      <AgentNode
        id="node-b"
        data={{ label: 'Agent B', systemPrompt: 'Be helpful' }}
        selected={false}
      />
    );

    expect(screen.getByText('Agent B')).toBeInTheDocument();
    expect(screen.getByText('Plain PTY output')).toBeInTheDocument();
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    expect(screen.queryByText('Using: Edit')).not.toBeInTheDocument();
  });

  it('shows aggregated validation badge, unread output, handoff count, and flat reconcile cost badges when appropriate', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-c': {
          status: 'done',
          spawnMode: 'stream-json',
          handoffCount: 2,
          totalCostUsd: 1.25,
        },
      },
      agentResults: {
        'node-c': {
          finalText: 'Unread output',
          viewed: false,
          handoffPayloads: [],
          updatedAt: Date.now(),
        },
      },
      agentValidationIssuesByNodeId: {
        'node-c': [
          {
            id: 'agent:node-c:empty-system-prompt',
            scope: 'agent',
            nodeId: 'node-c',
            severity: 'warning',
            summary: 'Empty system prompt',
            detail: 'Agent C has an empty system prompt. Add guidance so the agent knows what to do.',
          },
        ],
      },
    });

    render(
      <AgentNode
        id="node-c"
        data={{ label: 'Agent C', systemPrompt: '' }}
        selected={false}
      />
    );

    expect(screen.getByTitle('1 issue — click to review')).toBeInTheDocument();
    expect(screen.getByTitle('New output — click to view')).toBeInTheDocument();
    expect(screen.getByText('2 handoffs')).toBeInTheDocument();
    expect(screen.getByText('$1.25')).toBeInTheDocument();
  });

  it('opens and closes the validation card from the warning badge', () => {
    useSwarmStore.setState({
      agentValidationIssuesByNodeId: {
        'node-v': [
          {
            id: 'agent:node-v:empty-system-prompt',
            scope: 'agent',
            nodeId: 'node-v',
            severity: 'warning',
            summary: 'Empty system prompt',
            detail: 'Validator has an empty system prompt. Add guidance so the agent knows what to do.',
          },
          {
            id: 'agent:node-v:disconnected',
            scope: 'agent',
            nodeId: 'node-v',
            severity: 'warning',
            summary: 'Disconnected agent',
            detail: 'Validator is disconnected (no edges). Connect it or mark it as a Start Node if it should run alone.',
          },
        ],
      },
    });

    render(
      <AgentNode
        id="node-v"
        data={{ label: 'Validator', systemPrompt: '' }}
        selected={false}
      />
    );

    fireEvent.click(screen.getByLabelText('2 issues — click to review'));
    expect(screen.getByText('Disconnected agent')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close validation details'));
    expect(screen.queryByText('Disconnected agent')).not.toBeInTheDocument();
  });

  it('adds bottom spacing when the cost badge is shown alongside runtime metrics', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-cost': {
          status: 'done',
          spawnMode: 'stream-json',
          totalCost: {
            costUsd: 0.06,
            inputTokens: 1200,
            outputTokens: 300,
          },
          turnCost: {
            inputTokens: 24_000,
          },
        },
      },
    });

    render(
      <AgentNode
        id="node-cost"
        data={{ label: 'Writer', systemPrompt: 'Be helpful', model: 'sonnet' }}
        selected={false}
      />
    );

    expect(screen.getByText('$0.06')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('Writer').closest('div.relative')).toHaveClass('pb-8');
  });

  it('routes output clicks through the canvas actions so the right inspector can open', () => {
    const onViewOutput = vi.fn();

    useSwarmStore.setState({
      agentStates: {
        'node-d': {
          status: 'done',
          spawnMode: 'stream-json',
        },
      },
      agentResults: {
        'node-d': {
          finalText: 'Finished output',
          viewed: false,
          handoffPayloads: [],
          updatedAt: Date.now(),
        },
      },
    });

    render(
      <CanvasActionsContext.Provider value={{ onViewOutput, onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }}>
        <AgentNode
          id="node-d"
          data={{ label: 'Agent D', systemPrompt: 'Be helpful' }}
          selected={false}
        />
      </CanvasActionsContext.Provider>
    );

    fireEvent.click(screen.getByLabelText('View agent output'));

    expect(onViewOutput).toHaveBeenCalledWith('node-d');
  });

  it('renders drop preview mode without interactive runtime chrome', () => {
    render(
      <AgentNode
        id="preview-node"
        data={{ label: 'Preview Agent', isDropPreview: true, systemPrompt: 'ignored' }}
        selected={false}
      />
    );

    expect(screen.getByText('Drop preview')).toBeInTheDocument();
    expect(screen.queryByTestId('handle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/click to review/i)).not.toBeInTheDocument();
  });

  it('keeps the action menu in the title row so long labels do not overlap it', () => {
    const longLabel = 'Agent con warning e titolo molto lungo che deve fermarsi prima del menu';

    render(
      <CanvasActionsContext.Provider value={{ onViewOutput: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }}>
        <AgentNode
          id="node-layout"
          data={{ label: longLabel, systemPrompt: 'Be helpful' }}
          selected={false}
        />
      </CanvasActionsContext.Provider>
    );

    expect(screen.getByText(longLabel)).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(screen.getByLabelText('Agent actions').closest('div')).toHaveClass('relative', 'shrink-0');
  });

  it('renders amber border for maxTurns_reached status', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-mt': {
          status: 'maxTurns_reached',
          ptyHandoffCount: 3,
        },
      },
    });

    const { container } = render(
      <AgentNode
        id="node-mt"
        data={{ label: 'Agent MT', systemPrompt: 'Be helpful' }}
        selected={false}
      />
    );

    const nodeDiv = container.querySelector('.border-amber-400');
    expect(nodeDiv).toBeTruthy();
  });

  it('renders yellow pulsing border for retrying status', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-retry': {
          status: 'retrying',
        },
      },
    });

    const { container } = render(
      <AgentNode
        id="node-retry"
        data={{ label: 'Agent Retry', systemPrompt: 'Be helpful' }}
        selected={false}
      />
    );

    const nodeDiv = container.querySelector('.border-yellow-400');
    expect(nodeDiv).toBeTruthy();
  });
});
