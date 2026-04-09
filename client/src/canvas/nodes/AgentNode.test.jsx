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
});
