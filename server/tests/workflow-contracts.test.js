import { describe, expect, it } from 'vitest';
import {
  buildWorkflowResult,
  buildWorkflowRunContextPatch,
  getConnectedWorkflowInputContract,
  prepareWorkflowRun,
  resolveEffectiveWorkflowContracts,
  validateWorkflowContractFields,
} from '../services/workflowContracts.js';

describe('workflowContracts workflow-native inputs and outputs', () => {
  const workflowDef = {
    name: 'Campaign Workflow',
    description: 'Create a launch campaign',
    inputContract: [
      { key: 'brief', label: 'Brief', type: 'textarea', required: true, helpText: 'Campaign brief' },
      { key: 'channels', label: 'Channels', type: 'enum', required: true, options: ['email', 'social'] },
      { key: 'budget', label: 'Budget', type: 'integer', defaultValue: 10 },
    ],
    outputContract: {
      outputs: [{ key: 'summary', label: 'Summary', source: 'finalText' }],
      artifacts: [{ key: 'report', label: 'Report', format: 'markdown', source: 'aggregatedArtifact' }],
    },
  };

  it('validates, defaults, and prepares workflow-direct run inputs', () => {
    const run = prepareWorkflowRun(workflowDef, { brief: 'Launch X', channels: 'email' });

    expect(run.kind).toBe('workflow-direct');
    expect(run.inputs).toEqual({ brief: 'Launch X', channels: 'email', budget: 10 });
    expect(run.inputContract).toHaveLength(3);
    expect(run.outputContract.artifacts[0].format).toBe('markdown');
  });

  it('throws a structured 400 when workflow-direct input is incomplete or invalid', () => {
    expect(() => prepareWorkflowRun(workflowDef, { brief: '', channels: 'video' })).toThrow(/Workflow input validation failed/);
    try {
      prepareWorkflowRun(workflowDef, { brief: '', channels: 'video' });
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('WORKFLOW_INPUT_VALIDATION_FAILED');
      expect(error.details).toEqual(['brief is required', 'channels must be one of: email, social']);
    }
  });

  it('rejects unparsed raw strings for json workflow input fields', () => {
    const jsonWorkflow = {
      ...workflowDef,
      inputContract: [
        { key: 'payload', label: 'Payload', type: 'json', required: true },
      ],
    };

    expect(() => prepareWorkflowRun(jsonWorkflow, { payload: '{bad json' })).toThrow(/payload must be valid parsed JSON/);
    expect(prepareWorkflowRun(jsonWorkflow, { payload: { ok: true } }).inputs.payload).toEqual({ ok: true });
  });

  it('injects submitted inputs and expected outputs into workflow context prompt data', () => {
    const run = prepareWorkflowRun(workflowDef, { brief: 'Launch X', channels: 'social' });
    const patch = buildWorkflowRunContextPatch(workflowDef, run);

    expect(patch.currentTask).toContain('Launch X');
    expect(patch.currentTask).toContain('Expected workflow outputs: Summary.');
    expect(patch.workflowRun.inputs.channels).toBe('social');
  });

  it('maps canonical outputs and artifacts from terminal execution data', () => {
    const run = prepareWorkflowRun(workflowDef, { brief: 'Launch X', channels: 'email' });
    const result = buildWorkflowResult({
      workflowDef,
      workflowRun: run,
      workflowContext: {},
      status: 'completed',
      aggregatedArtifact: '# Final Report\n\nLaunch X report',
      agentOutputs: {
        'agent-a': {
          finalText: 'Launch X summary',
          lastMessageAt: '2026-04-12T03:00:00.000Z',
        },
      },
    });

    expect(result.inputs.brief).toBe('Launch X');
    expect(result.outputs.summary).toBe('Launch X summary');
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        id: 'report',
        name: 'Report',
        status: 'ready',
        value: expect.stringContaining('Launch X report'),
      }),
    ]);
  });

  it('rejects malformed workflow contract fields before persistence', () => {
    const errors = [];
    validateWorkflowContractFields({
      inputContract: [{ key: 'Invalid Key', type: 'unknown' }],
      outputContract: { outputs: [{ key: 'summary', source: 'wrong' }] },
    }, errors);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('inputContract[0].key'),
      expect.stringContaining('inputContract[0].type'),
      expect.stringContaining('outputContract.outputs[0].source'),
    ]));
  });

  it('derives effective contracts from visual input and output extractor nodes while legacy workflows still fallback', () => {
    const visualWorkflow = {
      name: 'Visual workflow',
      inputContract: [{ key: 'legacy', label: 'Legacy', type: 'text', required: true }],
      outputContract: { outputs: [{ key: 'legacy_result', label: 'Legacy result', source: 'finalText' }], artifacts: [] },
      nodes: [
        { id: 'input-a', type: 'input', data: { label: 'Creative intake', fields: [
          { key: 'brief', label: 'Brief', type: 'textarea', required: true },
          { key: 'notes', label: 'Notes', type: 'markdown', required: false },
          { key: 'reference_image', label: 'Reference image', type: 'image', required: true },
        ] } },
        { id: 'agent-a', type: 'agent', data: { label: 'Writer' } },
        { id: 'extract-a', type: 'outputExtractor', data: { artifactKey: 'report', artifactName: 'Report', format: 'table' } },
      ],
      edges: [
        { id: 'e1', source: 'input-a', target: 'agent-a' },
        { id: 'e2', source: 'agent-a', target: 'extract-a' },
      ],
    };

    const effective = resolveEffectiveWorkflowContracts(visualWorkflow);
    expect(effective.inputContract.map((field) => field.key)).toEqual(['brief', 'notes', 'reference_image']);
    expect(effective.inputContract[0]).toMatchObject({ inputNodeId: 'input-a', inputNodeLabel: 'Creative intake' });
    expect(effective.inputContract[1]).toMatchObject({ key: 'notes', type: 'markdown' });
    expect(effective.outputContract.outputs[0].key).toBe('legacy_result');
    expect(effective.outputContract.artifacts[0]).toMatchObject({
      key: 'report',
      format: 'table',
      source: 'outputExtractor',
      sourceNodeId: 'agent-a',
      outputExtractorNodeId: 'extract-a',
    });

    expect(resolveEffectiveWorkflowContracts(workflowDef).inputContract.map((field) => field.key)).toEqual(['brief', 'channels', 'budget']);
  });

  it('prepares visual text and image metadata without raw bytes and maps extractor artifacts from upstream output', () => {
    const visualWorkflow = {
      name: 'Visual workflow',
      nodes: [
        { id: 'input-a', type: 'input', data: { label: 'Creative intake', fields: [
          { key: 'brief', label: 'Brief', type: 'textarea', required: true },
          { key: 'reference_image', label: 'Reference image', type: 'image', required: true },
        ] } },
        { id: 'agent-a', type: 'agent', data: { label: 'Writer' } },
        { id: 'agent-b', type: 'agent', data: { label: 'Unconnected' } },
        { id: 'extract-a', type: 'outputExtractor', data: { artifactKey: 'report', artifactName: 'Report', format: 'markdown' } },
      ],
      edges: [
        { id: 'e1', source: 'input-a', target: 'agent-a' },
        { id: 'e2', source: 'agent-a', target: 'extract-a' },
      ],
    };

    expect(() => prepareWorkflowRun(visualWorkflow, {
      brief: 'Launch X',
      reference_image: { kind: 'run-image', name: 'bad.png', type: 'image/png', size: 12, data: 'raw-base64' },
    })).toThrow(/must not include data/);
    expect(() => prepareWorkflowRun(visualWorkflow, {
      brief: 'Launch X',
      reference_image: { kind: 'run-image', name: '../evil.png', type: 'image/png', size: 12 },
    })).toThrow(/image file name is invalid/);
    expect(() => prepareWorkflowRun(visualWorkflow, {
      brief: 'Launch X',
      reference_image: { kind: 'run-image', name: 'big.png', mimeType: 'image/png', size: (10 * 1024 * 1024) + 1 },
    })).toThrow(/exceeds 10485760 bytes/);

    const run = prepareWorkflowRun(visualWorkflow, {
      brief: 'Launch X',
      reference_image: { kind: 'run-image', name: 'ref.png', mimeType: 'image/png', size: 2048, previewUrl: '' },
    });
    const patch = buildWorkflowRunContextPatch(visualWorkflow, run);
    expect(run.visualInputMode).toBe(true);
    expect(run.inputs.reference_image).toMatchObject({
      mimeType: 'image/png',
      type: 'image/png',
    });
    expect(patch.currentTask).not.toContain('Launch X');
    expect(getConnectedWorkflowInputContract(visualWorkflow, 'agent-a').map((field) => field.key)).toEqual(['brief', 'reference_image']);
    expect(getConnectedWorkflowInputContract(visualWorkflow, 'agent-b')).toEqual([]);

    const result = buildWorkflowResult({
      workflowDef: visualWorkflow,
      workflowRun: run,
      status: 'completed',
      agentOutputs: {
        'agent-a': { finalText: '# Report\n\nDone', lastMessageAt: '2026-04-12T03:00:00.000Z' },
      },
    });

    expect(result.artifacts).toEqual([
      expect.objectContaining({
        id: 'report',
        name: 'Report',
        status: 'ready',
        value: expect.stringContaining('Done'),
        source: 'outputExtractor',
        sourceNodeId: 'agent-a',
      }),
    ]);
  });

  it('rejects unsafe image file names even when only metadata is submitted', () => {
    const visualWorkflow = {
      name: 'Visual workflow',
      nodes: [
        { id: 'input-a', type: 'input', data: { label: 'Creative intake', fields: [
          { key: 'reference_image', label: 'Reference image', type: 'image', required: true },
        ] } },
      ],
      edges: [],
    };

    expect(() => prepareWorkflowRun(visualWorkflow, {
      reference_image: { kind: 'run-image', name: '../secret.png', mimeType: 'image/png', size: 2048 },
    })).toThrow(/image file name is invalid/);
  });

  it('builds extractor artifacts from the configured source policy and records provenance', () => {
    const visualWorkflow = {
      name: 'Visual workflow',
      nodes: [
        { id: 'agent-a', type: 'agent', data: { label: 'Writer' } },
        { id: 'agent-b', type: 'agent', data: { label: 'Reviewer' } },
        {
          id: 'extract-a',
          type: 'outputExtractor',
          data: {
            artifactKey: 'report',
            artifactName: 'Report',
            format: 'markdown',
            sourcePolicy: 'selected',
            selectedSourceNodeIds: ['agent-b'],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'agent-a', target: 'extract-a' },
        { id: 'e2', source: 'agent-b', target: 'extract-a' },
      ],
    };

    const run = prepareWorkflowRun(visualWorkflow, {});
    const result = buildWorkflowResult({
      workflowDef: visualWorkflow,
      workflowRun: run,
      status: 'completed',
      agentOutputs: {
        'agent-a': { finalText: 'Writer draft', lastMessageAt: '2026-04-12T03:00:00.000Z' },
        'agent-b': { finalText: 'Reviewer report', lastMessageAt: '2026-04-12T03:05:00.000Z' },
      },
    });

    expect(result.artifacts).toEqual([
      expect.objectContaining({
        id: 'report',
        name: 'Report',
        status: 'ready',
        value: 'Reviewer report',
        source: 'outputExtractor',
        sourceNodeId: 'agent-b',
        outputExtractorNodeId: 'extract-a',
        provenance: {
          outputExtractorNodeId: 'extract-a',
          sourceNodeIds: ['agent-b'],
          sourcePolicy: 'selected',
        },
      }),
    ]);
  });
});

