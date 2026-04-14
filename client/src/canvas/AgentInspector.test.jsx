import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('exposes Agent Definition Center controls and compiled preview observability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        preview: {
          ok: true,
          domains: {
            agents: [
              {
                id: 'node-a',
                provider: 'codex',
                model: 'gpt-5.4',
                runtime: { spawnMode: 'codex-sdk' },
                io: {
                  inputKeys: ['brief'],
                  artifactExpectations: [{ key: 'report' }],
                },
                memory: { precedence: ['workflow run inputs', 'agent memory sources'] },
                policy: { handoff: 'explicit', errorRetry: 'retry-on-error' },
                incompatibilities: [
                  { code: 'tools_not_supported_by_provider', message: 'Codex does not enforce Claude tool allowlists.' },
                ],
                whyThisOutput: 'Provider codex executes the agent with its effective model.',
              },
            ],
          },
          observability: {
            promptAssemblyOrder: ['agent awareness', 'mission/system prompt', 'runtime protocol'],
          },
          errors: [],
          warnings: [{ code: 'guardrails_advisory', message: 'Guardrails are prompt guidance.' }],
        },
      }),
    }));
    useSwarmStore.setState({
      selectedNodeId: 'node-a',
      workflowDef: {
        id: 'wf-1',
        name: 'Harness workflow',
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Strategist' } }],
        edges: [],
      },
    });
    const onUpdateNode = vi.fn();

    render(
      <AgentInspector
        nodes={[
          {
            id: 'node-a',
            type: 'agent',
            data: { label: 'Strategist', model: 'gpt-5.4' },
          },
          { id: 'extractor-1', type: 'outputExtractor', data: { label: 'Report', artifactKey: 'report' } },
        ]}
        edges={[{ id: 'edge-agent-report', source: 'node-a', target: 'extractor-1' }]}
        onUpdateNode={onUpdateNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Agent Definition Center/i }));
    fireEvent.change(screen.getByLabelText('Agent mission'), { target: { value: 'Design a sector harness.' } });
    fireEvent.change(screen.getByLabelText('Memory sources'), { target: { value: 'brief, policy-docs' } });
    fireEvent.change(screen.getByLabelText('Guardrails'), { target: { value: 'Do not invent APIs.' } });
    fireEvent.change(screen.getByLabelText('Handoff policy'), { target: { value: 'explicit' } });
    fireEvent.change(screen.getByLabelText('Error/retry policy'), { target: { value: 'retry-on-error' } });

    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { mission: 'Design a sector harness.' });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { memorySources: ['brief', 'policy-docs'] });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { guardrails: 'Do not invent APIs.' });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { handoffPolicy: 'explicit' });
    expect(onUpdateNode).toHaveBeenCalledWith('node-a', { errorRetryPolicy: 'retry-on-error' });

    await waitFor(() => expect(screen.getByText('codex / gpt-5.4')).toBeInTheDocument());
    expect(screen.getByText('Prompt assembly order')).toBeInTheDocument();
    expect(screen.getByText(/Memory provenance/)).toBeInTheDocument();
    expect(screen.getByText(/Inputs: brief/)).toBeInTheDocument();
    expect(screen.getByText(/Artifacts: report/)).toBeInTheDocument();
    expect(screen.getByText(/Structured incompatibilities/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/swarm/compiled-preview', expect.objectContaining({
      method: 'POST',
    }));
    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.workflowDef.edges).toEqual([
      { id: 'edge-agent-report', source: 'node-a', target: 'extractor-1' },
    ]);
  });


  it('keeps structured compiled preview errors visible when the preview API returns 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Compiled execution preview is invalid',
        preview: {
          ok: false,
          domains: { agents: [] },
          errors: [
            { code: 'runtime_model_unsupported', message: 'Unsupported gemini model gemini-2.0-flash.' },
          ],
          warnings: [],
        },
        details: [{ code: 'runtime_model_unsupported' }],
      }),
    }));
    useSwarmStore.setState({
      selectedNodeId: 'node-a',
      workflowDef: {
        id: 'wf-1',
        name: 'Harness workflow',
        nodes: [{ id: 'node-a', type: 'agent', data: { label: 'Strategist' } }],
        edges: [],
      },
    });

    render(
      <AgentInspector
        nodes={[{ id: 'node-a', type: 'agent', data: { label: 'Strategist', model: 'gemini-2.0-flash' } }]}
        onUpdateNode={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText('Compiled execution preview is invalid')).toBeInTheDocument());
    expect(screen.getByText(/Unsupported gemini model/)).toBeInTheDocument();
    expect(screen.getByText(/Structured incompatibilities/)).toBeInTheDocument();
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



