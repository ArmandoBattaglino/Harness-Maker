import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AgentInspector from './AgentInspector.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';

describe('AgentInspector output parity', () => {
  beforeEach(() => {
    resetSwarmStore();
  });

  it('prefers the canonical structured chat snippet in the live output section and keeps output text readable', () => {
    useSwarmStore.setState({
      selectedNodeId: 'node-a',
      chatMessages: [
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Older structured output.',
          timestamp: 100,
          turnId: 'node-a:1',
          spawnMode: 'stream-json',
        },
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Newest structured output.',
          timestamp: 200,
          turnId: 'node-a:2',
          spawnMode: 'stream-json',
        },
      ],
      agentStates: {
        'node-a': {
          status: 'running',
          spawnMode: 'stream-json',
          lastChatSnippet: "Penguins are among nature's most remarkable survivors.",
          lastOutputSnippet: "Penguinsare among nature's most remarkable survivors.",
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
      <AgentInspector
        nodes={[
          {
            id: 'node-a',
            type: 'agent',
            data: { label: 'Writer' },
          },
        ]}
        onUpdateNode={vi.fn()}
      />
    );

    expect(screen.getByText("Penguins are among nature's most remarkable survivors.")).toBeInTheDocument();
    expect(screen.queryByText(/Penguinsare/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Output' }));

    const sections = document.querySelectorAll('section');
    expect(sections[0]).toHaveTextContent('Output 2');
    expect(sections[0]).toHaveTextContent('Newest structured output.');
    expect(sections[1]).toHaveTextContent('Output 1');
    expect(sections[1]).toHaveTextContent('Older structured output.');
  });

  it('exposes and saves lightweight workflow guidance controls for an agent', () => {
    useSwarmStore.setState({ selectedNodeId: 'node-a' });
    const onUpdateNode = vi.fn();

    render(
      <AgentInspector
        nodes={[
          {
            id: 'node-a',
            type: 'agent',
            data: { label: 'Writer' },
          },
        ]}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Workflow Guidance/i }));
    fireEvent.change(screen.getByLabelText('Skill hints'), { target: { value: 'writer, qa-tester' } });
    fireEvent.change(screen.getByLabelText('Context sources'), { target: { value: 'brief, docs/memory' } });
    fireEvent.change(screen.getByLabelText('Expected output'), { target: { value: 'A measurable markdown report.' } });

    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { skillHints: ['writer', 'qa-tester'] });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { contextSources: ['brief', 'docs/memory'] });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { expectedOutput: 'A measurable markdown report.' });
    expect(screen.getByText(/guidance \+ visibility/i)).toBeInTheDocument();
  });
});
