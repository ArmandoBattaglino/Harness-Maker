import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AgentNode from './AgentNode.jsx';
import { useSwarmStore } from '../../store/SwarmContext.jsx';
import { resetSwarmStore } from '../../test/resetSwarmStore.js';

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

  it('shows thinking, tool, snippet, and cost for structured runtimes', () => {
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
    expect(screen.getByText('Using: Edit')).toBeInTheDocument();
    expect(screen.getByText('Structured output')).toBeInTheDocument();
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

  it('shows warning, unread output, handoff count, and flat reconcile cost badges when appropriate', () => {
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
    });

    render(
      <AgentNode
        id="node-c"
        data={{ label: 'Agent C', systemPrompt: '' }}
        selected={false}
      />
    );

    expect(screen.getByTitle('Empty system prompt')).toBeInTheDocument();
    expect(screen.getByTitle('Output ready - click to view')).toBeInTheDocument();
    expect(screen.getByText('2 handoffs')).toBeInTheDocument();
    expect(screen.getByText('$1.25')).toBeInTheDocument();
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
    expect(screen.queryByTitle('Empty system prompt')).not.toBeInTheDocument();
  });
});
