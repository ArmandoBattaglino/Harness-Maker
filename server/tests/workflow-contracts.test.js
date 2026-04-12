import { describe, expect, it } from 'vitest';
import {
  buildWorkflowResult,
  buildWorkflowRunContextPatch,
  prepareWorkflowRun,
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
});
