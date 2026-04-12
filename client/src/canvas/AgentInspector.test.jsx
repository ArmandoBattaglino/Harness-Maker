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

  it('edits agent expected output contracts without replacing legacy expected output', () => {
    useSwarmStore.setState({ selectedNodeId: 'node-a' });
    const onUpdateNode = vi.fn();

    render(
      <AgentInspector
        nodes={[
          {
            id: 'node-a',
            type: 'agent',
            data: { label: 'Writer', expectedOutput: 'Legacy fallback.' },
          },
        ]}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Workflow Guidance/i }));
    fireEvent.change(screen.getByLabelText('Expected output format'), { target: { value: 'json' } });
    fireEvent.change(screen.getByLabelText('Expected output instructions'), { target: { value: 'Return JSON findings.' } });

    expect(onUpdateNode).toHaveBeenCalledWith('node-a', {
      expectedOutputContract: { format: 'json' },
    });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', {
      expectedOutputContract: { format: 'markdown', instructions: 'Return JSON findings.' },
    });
    expect(screen.getByLabelText('Expected output')).toHaveValue('Legacy fallback.');
  });

  it('edits Input block fields and Output Extractor artifact settings', () => {
    useSwarmStore.setState({
      selectedNodeId: 'input-1',
      workflowDef: {
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            data: {
              label: 'Client Input',
              prompt: 'Original prompt',
              fields: [{ id: 'field-1', key: 'brief', label: 'Brief', type: 'textarea', required: true }],
            },
          },
          { id: 'agent-a', type: 'agent', data: { label: 'Strategist' } },
          { id: 'extractor-1', type: 'outputExtractor', data: { label: 'Extractor', artifactKey: 'final-report', artifactName: 'Final report', format: 'markdown', instruction: 'Extract the report.', sourcePolicy: 'allIncoming' } },
        ],
        edges: [
          { id: 'e1', source: 'input-1', target: 'agent-a' },
          { id: 'e2', source: 'agent-a', target: 'extractor-1' },
        ],
      },
    });
    const onUpdateNode = vi.fn();

    const { rerender } = render(
      <AgentInspector
        nodes={[
          {
            id: 'input-1',
            type: 'input',
            data: {
              label: 'Client Input',
              prompt: 'Original prompt',
              fields: [{ id: 'field-1', key: 'brief', label: 'Brief', type: 'textarea', required: true }],
            },
          },
        ]}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Original prompt'), { target: { value: 'Updated prompt' } });
    fireEvent.change(screen.getByDisplayValue('brief'), { target: { value: 'reference_image' } });
    fireEvent.change(screen.getByDisplayValue('Textarea'), { target: { value: 'image' } });
    expect(screen.getByText('What the agent receives')).toBeInTheDocument();
    expect(screen.getByText(/Connected agents: Strategist/)).toBeInTheDocument();
    expect(screen.getByText(/What the agent receives/)).toBeInTheDocument();
    expect(screen.getByText(/<textarea>/)).toBeInTheDocument();

    expect(onUpdateNode).toHaveBeenCalledWith('input-1', { prompt: 'Updated prompt' });
    expect(onUpdateNode).toHaveBeenCalledWith('input-1', {
      fields: [expect.objectContaining({ key: 'reference_image' })],
    });
    expect(onUpdateNode).toHaveBeenCalledWith('input-1', {
      fields: [expect.objectContaining({ type: 'image' })],
    });

    useSwarmStore.setState({
      selectedNodeId: 'extractor-1',
      workflowDef: {
        nodes: [
          { id: 'input-1', type: 'input', data: { label: 'Client Input', fields: [] } },
          { id: 'agent-a', type: 'agent', data: { label: 'Strategist' } },
          {
            id: 'extractor-1',
            type: 'outputExtractor',
            data: {
              label: 'Extractor',
              artifactKey: 'final-report',
              artifactName: 'Final report',
              format: 'markdown',
              instruction: 'Extract the report.',
              sourcePolicy: 'allIncoming',
            },
          },
        ],
        edges: [
          { id: 'e2', source: 'agent-a', target: 'extractor-1' },
        ],
      },
    });
    rerender(
      <AgentInspector
        nodes={[
          {
            id: 'extractor-1',
            type: 'outputExtractor',
            data: {
              label: 'Extractor',
              artifactKey: 'final-report',
              artifactName: 'Final report',
              format: 'markdown',
              instruction: 'Extract the report.',
              sourcePolicy: 'allIncoming',
            },
          },
        ]}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.change(screen.getByDisplayValue('final-report'), { target: { value: 'qa-report' } });
    fireEvent.change(screen.getByDisplayValue('Markdown'), { target: { value: 'table' } });
    expect(screen.getByText('What the user gets')).toBeInTheDocument();
    expect(screen.getByText(/Upstream agents: Strategist/)).toBeInTheDocument();
    expect(screen.getByText(/Selected-source extraction is deferred in this MVP/)).toBeInTheDocument();

    expect(onUpdateNode).toHaveBeenCalledWith('extractor-1', { artifactKey: 'qa-report' });
    expect(onUpdateNode).toHaveBeenCalledWith('extractor-1', { format: 'table' });
  });
});



