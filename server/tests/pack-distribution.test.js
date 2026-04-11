import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkflowStore } from '../services/WorkflowStore.js';
import PackStore from '../stores/PackStore.js';

function workflowPayload() {
  return {
    name: 'Portable Workflow',
    nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Work' } }],
    edges: [],
  };
}

function packPayload(workflowId) {
  return {
    name: 'Portable Pack',
    category: 'ops',
    workflowId,
    packVersion: '1.2.3',
    status: 'draft',
    engineCompatibility: '^1.0.0',
    visibility: 'private',
    runtimePolicy: { provider: 'auto' },
    dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: workflowId, version: 'current', required: true }],
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    knowledgeSources: [],
    behaviorRules: [],
    outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    artifactDefinitions: [],
    visibleSteps: [{ id: 'step-a', label: 'Step A', nodeIds: ['agent-a'] }],
    completionCriteria: ['Done'],
  };
}

describe('pack distribution', () => {
  let tempDir;
  let workflowStore;
  let packStore;
  let workflow;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-dist-test-'));
    workflowStore = new WorkflowStore(tempDir);
    await workflowStore.init();
    workflow = await workflowStore.create(workflowPayload());
    packStore = new PackStore(tempDir, workflowStore);
    await packStore.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exports a local bundle with manifest, pack, and workflow data', async () => {
    const pack = await packStore.create(packPayload(workflow.id));
    const bundle = await packStore.exportBundle(pack.id);

    expect(bundle.manifest).toMatchObject({
      bundleVersion: 1,
      packId: pack.id,
      packVersion: '1.2.3',
      workflowId: workflow.id,
    });
    expect(bundle.pack.id).toBe(pack.id);
    expect(bundle.workflow.id).toBe(workflow.id);
  });

  it('imports a bundle by rebinding the workflow dependency atomically enough for local use', async () => {
    const pack = await packStore.create(packPayload(workflow.id));
    const bundle = await packStore.exportBundle(pack.id);
    const imported = await packStore.importBundle(bundle);

    expect(imported.pack.id).not.toBe(pack.id);
    expect(imported.workflow.id).not.toBe(workflow.id);
    expect(imported.pack.workflowId).toBe(imported.workflow.id);
    expect(imported.pack.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'workflow', targetId: imported.workflow.id }),
    ]));
  });

  it('records installs and forks installed/authored packs into editable drafts', async () => {
    const pack = await packStore.create(packPayload(workflow.id));
    const install = await packStore.saveInstall({
      packId: pack.id,
      sourcePackId: pack.id,
      packVersion: pack.packVersion,
      installType: 'local',
      provenance: { source: 'test' },
    });
    const forked = await packStore.forkPack(pack.id);

    expect(install.id).toBeTruthy();
    expect((await packStore.listInstalls())[0].packId).toBe(pack.id);
    expect(forked.id).not.toBe(pack.id);
    expect(forked.status).toBe('draft');
    expect(forked.installMetadata.sourcePackId).toBe(pack.id);
  });
});
