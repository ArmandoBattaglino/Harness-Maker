import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import workflowsRouter from '../routes/workflows.js';
import { WorkflowStore } from '../services/WorkflowStore.js';

let tmpDir;
let store;

function getRouteHandler(method, routePath) {
  const layer = workflowsRouter.stack.find(
    (candidate) => candidate.route?.path === routePath && candidate.route.methods?.[method]
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
  return layer.route.stack[0].handle;
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function createReq({ body = {}, params = {} } = {}) {
  return {
    body,
    params,
    app: { locals: { workflowStore: store } },
  };
}

function workflowPayload(overrides = {}) {
  return {
    name: 'Workflow Heart Smoke',
    description: 'Workflow direct-run contract',
    nodes: [
      {
        id: 'agent-a',
        type: 'agent',
        data: {
          label: 'Agent A',
          systemPrompt: 'Produce the result.',
          skillHints: ['writer'],
          contextSources: ['brief'],
          expectedOutput: 'A measurable final report.',
        },
      },
    ],
    edges: [],
    settings: {},
    initialContext: {},
    inputContract: [
      { key: 'brief', label: 'Brief', type: 'textarea', required: true, helpText: 'Campaign brief' },
      { key: 'tone', label: 'Tone', type: 'enum', required: false, options: ['formal', 'friendly'], defaultValue: 'friendly' },
    ],
    outputContract: {
      outputs: [{ key: 'result', label: 'Result', source: 'finalText' }],
      artifacts: [{ key: 'report', label: 'Report', format: 'markdown', source: 'aggregatedArtifact' }],
    },
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-routes-test-'));
  store = new WorkflowStore(tmpDir);
  await store.init();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('workflow routes workflow-native contracts', () => {
  it('creates and returns workflow input/output contracts plus agent guidance fields', async () => {
    const handler = getRouteHandler('post', '/');
    const res = createRes();

    await handler(createReq({ body: workflowPayload() }), res, (error) => { throw error; });

    expect(res.statusCode).toBe(201);
    expect(res.body.workflow.inputContract).toHaveLength(2);
    expect(res.body.workflow.outputContract.artifacts[0]).toMatchObject({ key: 'report', format: 'markdown' });
    expect(res.body.workflow.nodes[0].data).toMatchObject({
      skillHints: ['writer'],
      contextSources: ['brief'],
      expectedOutput: 'A measurable final report.',
    });

    const loaded = await store.get(res.body.workflow.id);
    expect(loaded.inputContract[0].key).toBe('brief');
    expect(loaded.outputContract.outputs[0].key).toBe('result');
  });

  it('updates workflow contracts without dropping existing contracts when omitted later', async () => {
    const created = await store.create(workflowPayload());
    const put = getRouteHandler('put', '/:id');
    const res = createRes();

    await put(createReq({
      params: { id: created.id },
      body: {
        name: 'Workflow Heart Smoke Updated',
        description: created.description,
        nodes: created.nodes,
        edges: created.edges,
        settings: created.settings,
        initialContext: created.initialContext,
      },
    }), res, (error) => { throw error; });

    expect(res.statusCode).toBe(200);
    expect(res.body.workflow.inputContract[0].key).toBe('brief');
    expect(res.body.workflow.outputContract.outputs[0].key).toBe('result');
  });

  it('loads legacy workflow files with safe empty contract defaults', async () => {
    const workflowsDir = path.join(tmpDir, 'workflows');
    const legacyPath = path.join(workflowsDir, 'legacy-wf.json');
    fs.writeFileSync(legacyPath, JSON.stringify({
      id: 'legacy-wf',
      name: 'Legacy Workflow',
      nodes: [],
      edges: [],
      settings: {},
      initialContext: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, null, 2));

    const get = getRouteHandler('get', '/:id');
    const res = createRes();
    await get(createReq({ params: { id: 'legacy-wf' } }), res, (error) => { throw error; });

    expect(res.statusCode).toBe(200);
    expect(res.body.workflow.inputContract).toEqual([]);
    expect(res.body.workflow.outputContract).toEqual({ outputs: [], artifacts: [] });
  });

  it('returns structured 400 details for malformed workflow contracts', async () => {
    const handler = getRouteHandler('post', '/');
    const res = createRes();

    await handler(createReq({
      body: workflowPayload({
        inputContract: [{ key: 'Bad Key', type: 'alien' }],
        outputContract: { artifacts: [{ key: 'report', format: 'pdf' }] },
      }),
    }), res, (error) => { throw error; });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([
      expect.stringContaining('inputContract[0].key'),
      expect.stringContaining('inputContract[0].type'),
      expect.stringContaining('outputContract.artifacts[0].format'),
    ]));
  });
});
