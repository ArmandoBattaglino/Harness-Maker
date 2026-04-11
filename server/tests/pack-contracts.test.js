import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkflowStore } from '../services/WorkflowStore.js';
import { validatePackDefinition, validatePackFixture, validateValueAgainstSchema, JSON_SCHEMA_DRAFT } from '../services/packContracts.js';
import PackStore from '../stores/PackStore.js';

function validPack(workflowId, overrides = {}) {
  return {
    name: 'Contract Harness',
    description: 'A contract-valid pack',
    category: 'ops',
    workflowId,
    packVersion: '1.0.0',
    status: 'draft',
    engineCompatibility: '^1.0.0',
    visibility: 'private',
    runtimePolicy: { provider: 'auto', requiresProjectBinding: true, allowBuilderDebug: true },
    dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: workflowId, version: 'current', required: true }],
    inputSchema: {
      $schema: JSON_SCHEMA_DRAFT,
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          'x-packField': { fieldType: 'textarea', help: 'Operator brief' },
        },
      },
      required: ['brief'],
      additionalProperties: false,
    },
    knowledgeSources: [{ id: 'source-a', name: 'Source A', type: 'inline', mergeStrategy: 'merge', content: {}, required: true }],
    behaviorRules: [{ id: 'rule-a', name: 'Rule A', instruction: 'Be accurate.', mode: 'append', priority: 10 }],
    outputSchema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false },
    artifactDefinitions: [{ id: 'artifact-a', name: 'Report', sourceType: 'aggregatedArtifact', format: 'markdown', required: true }],
    visibleSteps: [{ id: 'step-a', label: 'Step A', nodeIds: ['agent-a'] }],
    completionCriteria: ['Status is completed'],
    ...overrides,
  };
}

describe('pack contract validation', () => {
  let tempDir;
  let workflowStore;
  let packStore;
  let workflow;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-contract-test-'));
    workflowStore = new WorkflowStore(tempDir);
    await workflowStore.init();
    workflow = await workflowStore.create({
      name: 'Contract Workflow',
      nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Work' } }],
      edges: [],
    });
    packStore = new PackStore(tempDir, workflowStore);
    await packStore.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts a Draft 2020-12 schema-bearing pack with the four authoring surfaces', async () => {
    const pack = await packStore.create(validPack(workflow.id));
    expect(pack.inputSchema.$schema).toBe(JSON_SCHEMA_DRAFT);
    expect(pack.knowledgeSources).toHaveLength(1);
    expect(pack.behaviorRules).toHaveLength(1);
    expect(pack.artifactDefinitions[0].format).toBe('markdown');
  });

  it('rejects unsupported input field metadata and artifact formats', () => {
    const invalid = validatePackDefinition(validPack(workflow.id, {
      inputSchema: {
        type: 'object',
        properties: {
          bad: { type: 'string', 'x-packField': { fieldType: 'slider' } },
        },
      },
      artifactDefinitions: [{ id: 'bad-artifact', name: 'Bad', sourceType: 'aggregatedArtifact', format: 'pdf' }],
    }), { workflowDef: workflow });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'inputSchema.properties.bad.x-packField.fieldType is invalid',
      'artifactDefinitions[0].format is invalid',
    ]));
  });

  it('accepts all V17 input field metadata types and preserves defaults without auto-filling runtime input', async () => {
    const fields = {
      headline: { type: 'string', default: 'Launch', 'x-packField': { fieldType: 'text', help: 'Short headline' } },
      brief: { type: 'string', 'x-packField': { fieldType: 'textarea', help: 'Long brief' } },
      channel: { type: 'string', enum: ['email', 'social'], default: 'email', 'x-packField': { fieldType: 'enum' } },
      approved: { type: 'boolean', default: false, 'x-packField': { fieldType: 'boolean' } },
      config: { type: 'object', default: {}, 'x-packField': { fieldType: 'json' } },
      sourceFile: { type: 'string', 'x-packField': { fieldType: 'fileRef', help: 'Local file reference only' } },
    };

    const pack = await packStore.create(validPack(workflow.id, {
      inputSchema: {
        $schema: JSON_SCHEMA_DRAFT,
        type: 'object',
        properties: fields,
        required: ['headline'],
        additionalProperties: false,
      },
    }));

    expect(Object.keys(pack.inputSchema.properties)).toEqual(Object.keys(fields));
    expect(pack.inputSchema.properties.headline.default).toBe('Launch');
    expect(validateValueAgainstSchema(pack.inputSchema, { headline: 'Manual value' }, 'input', [])).toEqual([]);
    expect(validateValueAgainstSchema(pack.inputSchema, {}, 'input', [])).toEqual(expect.arrayContaining([
      "input must have required property 'headline'",
    ]));
  });

  it('rejects packs without the required workflow dependency', () => {
    const invalid = validatePackDefinition(validPack(workflow.id, { dependencies: [] }), { workflowDef: workflow });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('dependencies must include the linked workflow dependency');
  });

  it('rejects visibleSteps that reference unknown workflow nodes', async () => {
    await expect(packStore.create(validPack(workflow.id, {
      visibleSteps: [{ id: 'step-bad', label: 'Bad Step', nodeIds: ['missing-node'] }],
    }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('validates runtime values against nested schemas with additionalProperties disabled', () => {
    const errors = validateValueAgainstSchema({
      type: 'object',
      properties: {
        details: {
          type: 'object',
          properties: {
            count: { type: 'integer' },
          },
          required: ['count'],
          additionalProperties: false,
        },
      },
      required: ['details'],
      additionalProperties: false,
    }, {
      details: { count: 2, extra: true },
      surprise: true,
    }, 'input', []);

    expect(errors).toEqual(expect.arrayContaining([
      'input.details must NOT have additional properties',
      'input must NOT have additional properties',
    ]));
  });

  it('rejects malformed fixture assertions instead of letting publish gates pass trivially', () => {
    const invalidFixtures = [
      {
        name: 'Missing expected status',
        packVersion: '1.0.0',
        input: {},
        assertions: [{ type: 'statusEquals' }],
      },
      {
        name: 'Empty output expected',
        packVersion: '1.0.0',
        input: {},
        assertions: [{ type: 'outputIncludes', outputKey: 'result', expected: '' }],
      },
      {
        name: 'Missing artifact selector',
        packVersion: '1.0.0',
        input: {},
        assertions: [{ type: 'artifactExists' }],
      },
    ];

    for (const fixture of invalidFixtures) {
      expect(validatePackFixture(fixture).valid).toBe(false);
    }

    expect(validatePackFixture({
      name: 'Default result output',
      packVersion: '1.0.0',
      input: {},
      assertions: [{ type: 'outputIncludes', expected: 'ok' }],
    })).toMatchObject({ valid: true });
  });
});
