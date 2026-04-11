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

  it('rejects traversal-style ids across pack, version, fixture, and install lookups', async () => {
    expect(await packStore.get('../escape')).toBeNull();
    expect(await packStore.delete('../escape')).toBe(false);
    expect(await packStore.getVersion('../escape', '2026-04-11T00-00-00-000Z')).toBeNull();
    expect(await packStore.getVersion('pack-1', '../escape')).toBeNull();
    expect(await packStore.getFixture('../escape', 'fixture-1')).toBeNull();
    expect(await packStore.getFixture('pack-1', '../escape')).toBeNull();
    expect(await packStore.getInstall('../escape')).toBeNull();
  });

  it('rejects invalid install ids before attempting persistence', async () => {
    await expect(packStore.saveInstall({
      id: '../escape',
      packId: 'pack-1',
      sourcePackId: 'pack-1',
      packVersion: '1.0.0',
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('skips corrupt fixture and install files without breaking list operations', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const fixturesDir = path.join(tempDir, 'packs', 'fixtures', created.id);
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'broken.json'), '{not-json');

    const installsDir = path.join(tempDir, 'packs', 'installs');
    fs.mkdirSync(installsDir, { recursive: true });
    fs.writeFileSync(path.join(installsDir, 'broken.json'), '{not-json');

    expect(await packStore.listFixtures(created.id)).toEqual([]);
    expect(await packStore.listInstalls()).toEqual([]);
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

  it('treats fixture lastResult as server-owned state', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const forged = await packStore.saveFixture(created.id, {
      name: 'Forged result',
      packVersion: created.packVersion,
      input: { brief: 'Create a teaser' },
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
      lastResult: {
        source: 'fixture-runner',
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
      },
    });

    expect(forged.lastResult).toBeNull();
    expect((await packStore.getFixture(created.id, forged.id)).lastResult).toBeNull();

    const runnerOwned = await packStore.saveFixtureResult(created.id, {
      ...forged,
      lastResult: {
        source: 'fixture-runner',
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
      },
    });

    expect(runnerOwned.lastResult).toMatchObject({ source: 'fixture-runner', passed: true });
  });

  it('requires runner result data and normalizes runner-owned result metadata', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const fixture = await packStore.saveFixture(created.id, {
      name: 'Happy path',
      packVersion: created.packVersion,
      input: { brief: 'Create a teaser' },
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
    });

    await expect(packStore.saveFixtureResult(created.id, fixture)).rejects.toMatchObject({ statusCode: 400 });

    const saved = await packStore.saveFixtureResult(created.id, {
      ...fixture,
      lastResult: {
        source: 'client',
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
      },
    });

    expect(saved.lastResult.source).toBe('fixture-runner');
    expect(Date.parse(saved.lastResult.ranAt)).not.toBeNaN();
  });

  it('invalidates fixture lastResult when a pack is updated', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    const fixture = await packStore.saveFixture(created.id, {
      name: 'Happy path',
      packVersion: created.packVersion,
      input: { brief: 'Create a teaser' },
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
    });
    await packStore.saveFixtureResult(created.id, {
      ...fixture,
      lastResult: {
        source: 'fixture-runner',
        packId: created.id,
        packVersion: created.packVersion,
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
        ranAt: new Date().toISOString(),
      },
    });

    expect((await packStore.getFixture(created.id, fixture.id)).lastResult).toMatchObject({ passed: true });

    await packStore.update(created.id, {
      ...created,
      name: 'Marketing Harness v2',
    });

    expect((await packStore.getFixture(created.id, fixture.id)).lastResult).toBeNull();
  });

  it('hard deletes local pack definitions, version snapshots, and fixtures while preserving install provenance', async () => {
    const created = await packStore.create(buildPackPayload(workflow.id));
    await packStore.update(created.id, { ...created, name: 'Marketing Harness v2' });
    await packStore.saveFixture(created.id, {
      name: 'Happy path',
      packVersion: created.packVersion,
      input: { brief: 'Create a teaser' },
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
    });
    await packStore.saveInstall({
      id: 'install-1',
      packId: created.id,
      sourcePackId: created.id,
      packVersion: created.packVersion,
    });

    expect(await packStore.listVersions(created.id)).toHaveLength(1);
    expect(await packStore.listFixtures(created.id)).toHaveLength(1);

    await expect(packStore.delete(created.id)).resolves.toBe(true);

    expect(await packStore.get(created.id)).toBeNull();
    expect(await packStore.listVersions(created.id)).toEqual([]);
    expect(await packStore.listFixtures(created.id)).toEqual([]);
    expect(await packStore.getInstall('install-1')).toMatchObject({ packId: created.id });
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
