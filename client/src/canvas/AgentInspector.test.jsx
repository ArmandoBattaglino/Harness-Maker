import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AgentInspector from './AgentInspector.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';

describe('AgentInspector output parity', () => {
  beforeEach(() => {
    resetSwarmStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

    // V20.3: live output is now in the Runtime tab, not Setup
    fireEvent.click(screen.getByRole('button', { name: 'Runtime' }));

    expect(screen.getByText("Penguins are among nature's most remarkable survivors.")).toBeInTheDocument();
    expect(screen.queryByText(/Penguinsare/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Output' }));

    const sections = document.querySelectorAll('section');
    expect(sections[0]).toHaveTextContent('Output 2');
    expect(sections[0]).toHaveTextContent('Newest structured output.');
    expect(sections[1]).toHaveTextContent('Output 1');
    expect(sections[1]).toHaveTextContent('Older structured output.');
  });

  it('does not expose prompt-related fields that moved to the Prompt Block Editor', () => {
    useSwarmStore.setState({ selectedNodeId: 'node-a' });

    render(
      <AgentInspector
        nodes={[
          {
            id: 'node-a',
            type: 'agent',
            data: {
              label: 'Writer',
              systemPrompt: 'You are a writer.',
              mission: 'Write well.',
              guardrails: 'No slang.',
              skillHints: ['writer'],
              expectedOutput: 'A report.',
              expectedOutputContract: { format: 'json', instructions: 'Return JSON.' },
              contextSources: ['brief'],
              memorySources: ['policy-docs'],
            },
          },
        ]}
        onUpdateNode={vi.fn()}
      />
    );

    // Removed sections should not be in the DOM
    expect(screen.queryByRole('button', { name: /Behavior & Output Guidance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Effective Preview/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Agent mission')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('System Prompt')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Guardrails')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Skill hints')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expected output')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expected output format')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expected output instructions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Context sources')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Memory sources')).not.toBeInTheDocument();

    // Kept sections should still be present
    expect(screen.getByRole('button', { name: /Essentials/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Context Visibility/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Runtime & Policies/i })).toBeInTheDocument();
  });

  it('keeps runtime and visibility controls functional after prompt field removal', () => {
    useSwarmStore.setState({ selectedNodeId: 'node-a' });
    const onUpdateNode = vi.fn();

    render(
      <AgentInspector
        nodes={[
          {
            id: 'node-a',
            type: 'agent',
            data: { label: 'Strategist', model: 'gpt-5.4' },
          },
        ]}
        onUpdateNode={onUpdateNode}
      />
    );

    // Context Visibility
    fireEvent.click(screen.getByRole('button', { name: /Context Visibility/i }));
    fireEvent.change(screen.getByLabelText('Context Visibility'), { target: { value: 'minimal' } });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { contextVisibility: 'minimal' });

    // Runtime & Policies
    fireEvent.click(screen.getByRole('button', { name: /Runtime & Policies/i }));
    fireEvent.change(screen.getByLabelText('Handoff policy'), { target: { value: 'explicit' } });
    fireEvent.change(screen.getByLabelText('Error/retry policy'), { target: { value: 'retry-on-error' } });

    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { handoffPolicy: 'explicit' });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { errorRetryPolicy: 'retry-on-error' });
  });

  it('edits Input block fields and Output Extractor artifact settings', () => {
    useSwarmStore.setState({
      selectedNodeId: 'input-1',
      workflowDef: {
        nodes: [
          {
            id: 'input-1',
            type: 'workflowInput',
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
            type: 'workflowInput',
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

  it('still renders Input block controls for legacy input node aliases', () => {
    useSwarmStore.setState({ selectedNodeId: 'legacy-input' });

    render(
      <AgentInspector
        nodes={[
          {
            id: 'legacy-input',
            type: 'input',
            data: {
              label: 'Legacy Input',
              prompt: 'Legacy prompt',
              fields: [{ id: 'field-1', key: 'brief', label: 'Brief', type: 'textarea', required: true }],
            },
          },
        ]}
        onUpdateNode={vi.fn()}
      />
    );

    expect(screen.getByText('Input Block')).toBeInTheDocument();
    expect(screen.getByText('What the agent receives')).toBeInTheDocument();
  });
});



