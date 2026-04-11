import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import NodeOutputCard from './NodeOutputCard.jsx';
import { useSwarmStore } from '../../store/SwarmContext.jsx';
import { resetSwarmStore } from '../../test/resetSwarmStore.js';

describe('NodeOutputCard scroll behavior', () => {
  beforeEach(() => {
    resetSwarmStore();
  });

  it('marks the floating card and scroll area as nowheel so React Flow does not zoom on wheel', () => {
    useSwarmStore.setState({
      agentResults: {
        'node-a': {
          finalText: 'Line 1\n\nLine 2',
          handoffPayloads: [],
          viewed: false,
          updatedAt: Date.now(),
        },
      },
    });

    render(
      <NodeOutputCard
        nodeId="node-a"
        nodeLabel="Agent A"
        onClose={vi.fn()}
      />
    );

    const card = screen.getByText('Agent A').closest('div.nowheel.nodrag.nopan');
    expect(card).toBeInTheDocument();

    const scrollArea = card.querySelector('.output-card-scrollbar');
    expect(scrollArea).toHaveClass('nowheel');
  });

  it('uses the structured chat-safe formatter for stream-json output text', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-a': {
          spawnMode: 'stream-json',
        },
      },
      agentResults: {
        'node-a': {
          finalText: "Penguins are among nature's most remarkable survivors.\n\nTheir social lives are equally charming.",
          handoffPayloads: [],
          viewed: false,
          updatedAt: Date.now(),
        },
      },
    });

    render(
      <NodeOutputCard
        nodeId="node-a"
        nodeLabel="Agent A"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Penguins are among nature's most remarkable survivors.")).toBeInTheDocument();
    expect(screen.getByText('Their social lives are equally charming.')).toBeInTheDocument();
    expect(screen.queryByText(/Penguinsare/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/livesare/i)).not.toBeInTheDocument();
  });

  it('renders separate outputs with the newest entry first', () => {
    useSwarmStore.setState({
      agentStates: {
        'node-a': {
          spawnMode: 'stream-json',
        },
      },
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'First output', timestamp: 100, turnId: 'node-a:1', spawnMode: 'stream-json' },
        { nodeId: 'node-a', role: 'assistant', text: 'Newest output', timestamp: 200, turnId: 'node-a:2', spawnMode: 'stream-json' },
      ],
      agentResults: {
        'node-a': {
          finalText: 'Legacy fallback',
          handoffPayloads: [],
          viewed: false,
          updatedAt: Date.now(),
        },
      },
    });

    render(
      <NodeOutputCard
        nodeId="node-a"
        nodeLabel="Agent A"
        onClose={vi.fn()}
      />
    );

    const card = screen.getByText('Agent A').closest('div.nowheel.nodrag.nopan');
    const sections = card.querySelectorAll('section');

    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveTextContent('Output 2');
    expect(sections[0]).toHaveTextContent('Newest output');
    expect(sections[1]).toHaveTextContent('Output 1');
    expect(sections[1]).toHaveTextContent('First output');
  });
});
