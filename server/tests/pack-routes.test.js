import { describe, expect, it, vi } from 'vitest';

import packsRouter from '../routes/packs.js';

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer.route.stack[0].handle;
}

function createMockRes() {
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

function createPack() {
  return {
    id: 'pack-1',
    name: 'Marketing Harness',
    workflowId: 'wf-1',
    packVersion: '1.0.0',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string' },
        rounds: { type: 'integer' },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['brief', 'rounds'],
      additionalProperties: false,
    },
    runtimePolicy: { provider: 'auto' },
    visibleSteps: [{ id: 'draft', label: 'Draft', nodeIds: ['agent-a'] }],
    artifactDefinitions: [{ id: 'report', name: 'report', sourceType: 'aggregatedArtifact' }],
    outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
  };
}

describe('packs routes', () => {
  it('creates a pack and unwraps validation success', async () => {
    const packStore = {
      create: vi.fn().mockResolvedValue(createPack()),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/');
    const req = { body: createPack(), app: { locals: { packStore } } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(201);
    expect(res.body.pack.name).toBe('Marketing Harness');
  });

  it('lists versions for an existing pack', async () => {
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      listVersions: vi.fn().mockResolvedValue([
        { timestamp: '2026-04-11T03-00-00-000Z', packVersion: '1.0.0', status: 'draft' },
      ]),
    };
    const handler = getRouteHandler(packsRouter, 'get', '/:id/versions');
    const req = { params: { id: 'pack-1' }, app: { locals: { packStore } } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.versions).toHaveLength(1);
  });

  it('starts a pack through the existing swarm engine with reserved pack metadata', async () => {
    const pack = createPack();
    const packStore = {
      get: vi.fn().mockResolvedValue(pack),
    };
    const swarmEngine = {
      startExecution: vi.fn().mockResolvedValue('exec-1'),
      getStatus: vi.fn().mockReturnValue({ status: 'running', workflowId: 'wf-1' }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: 'pack-1' },
      body: {
        projectId: 'proj-1',
        projectPath: 'C:/projects/demo',
        input: { brief: 'Launch a campaign', rounds: 3, tags: ['b2b'] },
      },
      app: { locals: { packStore, swarmEngine } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(swarmEngine.startExecution).toHaveBeenCalledWith(
      'wf-1',
      'proj-1',
      'C:/projects/demo',
      expect.objectContaining({
        packMetadata: expect.objectContaining({
          packId: 'pack-1',
          packVersion: '1.0.0',
        }),
        workflowContextPatch: expect.objectContaining({
          pack: expect.objectContaining({
            input: { brief: 'Launch a campaign', rounds: 3, tags: ['b2b'] },
          }),
        }),
      })
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.packRun.packId).toBe('pack-1');
  });

  it('rejects malformed pack input payloads before execution starts', async () => {
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
    };
    const swarmEngine = {
      startExecution: vi.fn(),
      getStatus: vi.fn(),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: 'pack-1' },
      body: {
        projectId: 'proj-1',
        projectPath: 'C:/projects/demo',
        input: { brief: 42, rounds: 'three', extra: true },
      },
      app: { locals: { packStore, swarmEngine } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(swarmEngine.startExecution).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Input validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([
      'input.brief must be a string',
      'input.rounds must be an integer',
      'input.extra is not allowed',
    ]));
  });

  it('returns the intended status code when the pack service is unavailable', async () => {
    const handler = getRouteHandler(packsRouter, 'get', '/');
    const req = { app: { locals: {} } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Pack service unavailable' });
  });
});
