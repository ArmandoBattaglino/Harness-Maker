import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkflowStore } from '../services/WorkflowStore.js';
import PackStore from '../stores/PackStore.js';

function buildWorkflowPayload() {
  return {
    name: 'Base Workflow',
    description: 'Workflow used by packs',
    nodes: [
      { id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Do the work' } },
    ],
    edges: [],
    settings: {},
    initialContext: {},
  };
}

function buildPackPayload(workflowId) {
  return {
    name: 'Marketing Harness',
    description: 'Guided harness',
    category: 'marketing',
    workflowId,
    packVersion: '1.0.0',
    status: 'draft',
    engineCompatibility: '^1.0.0',
    visibility: 'private',
    runtimePolicy: {
      provider: 'auto',
      requiresProjectBinding: true,
      allowBuilderDebug: true,
    },
    dependencies: [
      { id: 'workflow-link', type: 'workflow', targetId: workflowId, version: 'current', required: true },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string' },
      },
      required: ['brief'],
      additionalProperties: false,
    },
    knowledgeSources: [
      {
        id: 'domain-kb',
        name: 'Domain KB',
        type: 'inline',
        mergeStrategy: 'merge',
        content: { audience: 'B2B' },
        required: true,
      },
    ],
    behaviorRules: [
      {
        id: 'tone',
        name: 'Tone',
        instruction: 'Be concise and persuasive.',
        mode: 'append',
        priority: 10,
      },
    ],
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
      },
      required: ['result'],
      additionalProperties: false,
    },
    artifactDefinitions: [
      {
        id: 'artifact-report',
        name: 'report',
        sourceType: 'aggregatedArtifact',
        required: true,
      },
    ],
    visibleSteps: [
      {
        id: 'draft',
        label: 'Draft',
        description: 'Draft the first output',
        nodeIds: ['agent-a'],
      },
    ],
    completionCriteria: ['Return a final result'],
  };
}

describe('PackStore', () => {
  let tempDir;
  let workflowStore;
  let packStore;
  let workflow;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-store-test-'));
    workflowStore = new WorkflowStore(tempDir);
    await workflowStore.init();
    workflow = await workflowStore.create(buildWorkflowPayload());

    packStore = new PackStore(tempDir, workflowStore);
    await packStore.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates, lists, and loads packs from atomic JSON persistence', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));

    expect(created.id).toBeTruthy();
    expect(created.workflowId).toBe(workflow.id);

    const listed = await packStore.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const loaded = await packStore.get(created.id);
    expect(loaded.name).toBe('Marketing Harness');
    expect(loaded.knowledgeSources[0].content).toEqual({ audience: 'B2B' });
  });

  it('rejects packs whose linked workflow does not exist', async () => {
    await expect(packStore.create(buildPackPayload('missing-workflow'))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('saves versions before update and can restore a prior version', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const updated = await packStore.update(created.id, {
      ...created,
      name: 'Marketing Harness v2',
      description: 'Updated description',
    });

    expect(updated.name).toBe('Marketing Harness v2');

    const versions = await packStore.listVersions(created.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].name).toBe('Marketing Harness');

    const restored = await packStore.restoreVersion(created.id, versions[0].timestamp);
    expect(restored.name).toBe('Marketing Harness');
    expect(restored.description).toBe('Guided harness');
  });

  it('returns null for malformed pack files instead of throwing', async () => {
    fs.writeFileSync(path.join(tempDir, 'packs', 'broken.json'), '{not-json');
    const pack = await packStore.get('broken');
    expect(pack).toBeNull();
    expect(await packStore.list()).toEqual([]);
  });

  it('stores and retrieves fixtures for a specific pack', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const fixture = await packStore.saveFixture(created.id, {
      name: 'Happy path',
      packVersion: created.packVersion,
      input: { brief: 'Create a teaser' },
      assertions: [
        { type: 'statusEquals', expected: 'completed' },
      ],
    });

    expect(fixture.id).toBeTruthy();
    const fixtures = await packStore.listFixtures(created.id);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe('Happy path');
  });

  it('preserves the pre-publish draft snapshot when publishing a pack', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));

    const published = await packStore.createPublishedVersion(created.id);
    expect(published.status).toBe('published');

    const versions = await packStore.listVersions(created.id);
    expect(versions).toHaveLength(1);

    const restored = await packStore.restoreVersion(created.id, versions[0].timestamp);
    expect(restored.status).toBe('draft');
  });

  it('blocks direct edits to published pack records', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const published = await packStore.createPublishedVersion(created.id);

    await expect(packStore.update(published.id, {
      ...published,
      name: 'Edited Published Pack',
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
