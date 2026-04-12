import { createServer } from 'http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import packsRouter from '../routes/packs.js';
import { csrfMiddleware } from '../middleware/csrf.js';
import { ConfigStore } from '../services/ConfigStore.js';

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

function createPack(overrides = {}) {
  return {
    id: 'pack-1',
    name: 'Marketing Harness',
    workflowId: 'wf-1',
    packVersion: '1.0.0',
    engineCompatibility: '^1.0.0',
    dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: 'wf-1', required: true }],
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
    createdAt: '2026-04-11T10:00:00.000Z',
    updatedAt: '2026-04-11T10:00:00.000Z',
    ...overrides,
  };
}

function createExecutionHistoryEntry(overrides = {}) {
  return {
    executionId: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    workflowContext: {},
    agentOutputs: {
      'agent-a': {
        label: 'Agent A',
        finalText: 'ok final',
      },
    },
    aggregatedArtifact: '# final artifact',
    packRun: {
      packId: 'pack-1',
      packVersion: '1.0.0',
      visibleSteps: [{ id: 'draft', label: 'Draft', nodeIds: ['agent-a'] }],
      artifactDefinitions: [{ id: 'report', name: 'report', sourceType: 'aggregatedArtifact' }],
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      runtimePolicy: { provider: 'codex' },
      projectBinding: { projectId: 'proj-1', projectPath: 'C:/projects/canonical' },
      conflicts: [],
    },
    ...overrides,
  };
}

describe('packs routes', () => {
  const servers = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
    vi.restoreAllMocks();
  });

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

  it('preserves known statusCode errors from version listing', async () => {
    const err = new Error('Version metadata unavailable');
    err.statusCode = 418;
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      listVersions: vi.fn().mockRejectedValue(err),
    };
    const handler = getRouteHandler(packsRouter, 'get', '/:id/versions');
    const req = { params: { id: 'pack-1' }, app: { locals: { packStore } } };
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.statusCode).toBe(418);
    expect(res.body).toEqual({ error: 'Version metadata unavailable' });
    expect(next).not.toHaveBeenCalled();
  });

  it('starts a pack using the server-registered project path for projectId', async () => {
    const pack = createPack();
    vi.spyOn(ConfigStore, 'getProjects').mockReturnValue([
      { id: 'proj-1', path: 'C:/projects/canonical', name: 'Canonical project' },
    ]);
    const packStore = {
      get: vi.fn().mockResolvedValue(pack),
    };
    const swarmEngine = {
      startExecution: vi.fn().mockResolvedValue('exec-1'),
      getStatus: vi.fn().mockReturnValue({ status: 'running', workflowId: 'wf-1' }),
    };
    const workflowStore = {
      get: vi.fn().mockResolvedValue({ id: 'wf-1', nodes: [{ id: 'agent-a' }] }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: 'pack-1' },
      body: {
        projectId: 'proj-1',
        projectPath: 'C:/projects/canonical',
        input: { brief: 'Launch a campaign', rounds: 3, tags: ['b2b'] },
      },
      app: { locals: { packStore, swarmEngine, workflowStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(swarmEngine.startExecution).toHaveBeenCalledWith(
      'wf-1',
      'proj-1',
      'C:/projects/canonical',
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

  it('rejects pack start when projectId is not registered', async () => {
    vi.spyOn(ConfigStore, 'getProjects').mockReturnValue([]);
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
    };
    const swarmEngine = {
      startExecution: vi.fn(),
    };
    const workflowStore = {
      get: vi.fn().mockResolvedValue({ id: 'wf-1', nodes: [{ id: 'agent-a' }] }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: 'pack-1' },
      body: {
        projectId: 'missing-project',
        input: { brief: 'Launch a campaign', rounds: 3 },
      },
      app: { locals: { packStore, swarmEngine, workflowStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Project not found');
    expect(swarmEngine.startExecution).not.toHaveBeenCalled();
  });

  it('rejects pack start when client projectPath mismatches the registered project', async () => {
    vi.spyOn(ConfigStore, 'getProjects').mockReturnValue([
      { id: 'proj-1', path: 'C:/projects/canonical', name: 'Canonical project' },
    ]);
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
    };
    const swarmEngine = {
      startExecution: vi.fn(),
    };
    const workflowStore = {
      get: vi.fn().mockResolvedValue({ id: 'wf-1', nodes: [{ id: 'agent-a' }] }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: 'pack-1' },
      body: {
        projectId: 'proj-1',
        projectPath: 'C:/projects/other',
        input: { brief: 'Launch a campaign', rounds: 3 },
      },
      app: { locals: { packStore, swarmEngine, workflowStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('projectPath does not match the registered project');
    expect(swarmEngine.startExecution).not.toHaveBeenCalled();
  });

  it('rejects malformed pack input payloads before execution starts', async () => {
    vi.spyOn(ConfigStore, 'getProjects').mockReturnValue([
      { id: 'proj-1', path: 'C:/projects/canonical', name: 'Canonical project' },
    ]);
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
    };
    const swarmEngine = {
      startExecution: vi.fn(),
      getStatus: vi.fn(),
    };
    const workflowStore = {
      get: vi.fn().mockResolvedValue({ id: 'wf-1', nodes: [{ id: 'agent-a' }] }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: 'pack-1' },
      body: {
        projectId: 'proj-1',
        projectPath: 'C:/projects/canonical',
        input: { brief: 42, rounds: 'three', extra: true },
      },
      app: { locals: { packStore, swarmEngine, workflowStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(swarmEngine.startExecution).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Input validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([
      'input must NOT have additional properties',
      'input.brief must be string',
      'input.rounds must be integer',
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

  it('evaluates fixture assertions from execution-backed results and stores the last result', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Execution-backed fixture',
      packVersion: '1.0.0',
      input: {},
      assertions: [
        { type: 'statusEquals', expected: 'completed' },
        { type: 'outputIncludes', outputKey: 'result', expected: 'ok' },
        { type: 'artifactExists', artifactId: 'report' },
      ],
    };
    const packStore = {
      getFixture: vi.fn().mockResolvedValue(fixture),
      get: vi.fn().mockResolvedValue(createPack()),
      saveFixtureResult: vi.fn().mockResolvedValue(fixture),
    };
    const executionHistoryStore = {
      getEntry: vi.fn().mockResolvedValue(createExecutionHistoryEntry()),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const req = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: {
        executionId: '11111111-1111-4111-8111-111111111111',
      },
      app: { locals: { packStore, executionHistoryStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.result.passed).toBe(true);
    expect(packStore.saveFixtureResult).toHaveBeenCalledWith('pack-1', expect.objectContaining({
      lastResult: expect.objectContaining({
        passed: true,
        source: 'fixture-runner',
        executionId: '11111111-1111-4111-8111-111111111111',
      }),
    }));
  });

  it('rejects fixture runs that submit synthetic result payloads without executionId', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Malformed legacy fixture',
      packVersion: '1.0.0',
      input: {},
      assertions: [
        { type: 'outputIncludes' },
      ],
    };
    const packStore = {
      getFixture: vi.fn().mockResolvedValue(fixture),
      get: vi.fn().mockResolvedValue(createPack()),
      saveFixtureResult: vi.fn(),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const req = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: { status: 'completed', outputs: { result: 'anything' }, artifacts: [] },
      app: { locals: { packStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('executionId is required and must be a valid UUID');
    expect(packStore.saveFixtureResult).not.toHaveBeenCalled();
  });

  it('fails closed when a persisted fixture contains malformed assertions', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Malformed legacy fixture',
      packVersion: '1.0.0',
      input: {},
      assertions: [
        { type: 'outputIncludes' },
      ],
    };
    const packStore = {
      getFixture: vi.fn().mockResolvedValue(fixture),
      get: vi.fn().mockResolvedValue(createPack()),
      saveFixtureResult: vi.fn().mockResolvedValue(fixture),
    };
    const executionHistoryStore = {
      getEntry: vi.fn().mockResolvedValue(createExecutionHistoryEntry()),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const req = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: { executionId: '11111111-1111-4111-8111-111111111111' },
      app: { locals: { packStore, executionHistoryStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.result.passed).toBe(false);
    expect(res.body.result.assertions[0].error).toContain('expected is required');
  });

  it('does not treat missing artifact selector fields as wildcard matches during fixture runs', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Artifact id check',
      packVersion: '1.0.0',
      input: {},
      assertions: [
        { type: 'artifactExists', artifactId: 'expected-artifact' },
      ],
    };
    const packStore = {
      getFixture: vi.fn().mockResolvedValue(fixture),
      get: vi.fn().mockResolvedValue(createPack()),
      saveFixtureResult: vi.fn().mockResolvedValue(fixture),
    };
    const executionHistoryStore = {
      getEntry: vi.fn().mockResolvedValue(createExecutionHistoryEntry({
        packRun: {
          ...createExecutionHistoryEntry().packRun,
          artifactDefinitions: [{ id: 'artifact-1', name: 'report', sourceType: 'aggregatedArtifact' }],
        },
      })),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const req = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: {
        executionId: '11111111-1111-4111-8111-111111111111',
      },
      app: { locals: { packStore, executionHistoryStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.result.passed).toBe(false);
  });

  it('rejects fixture runs when execution-backed result cannot be found', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Missing execution fixture',
      packVersion: '1.0.0',
      input: {},
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
    };
    const packStore = {
      getFixture: vi.fn().mockResolvedValue(fixture),
      get: vi.fn().mockResolvedValue(createPack()),
      saveFixtureResult: vi.fn(),
    };
    const executionHistoryStore = {
      getEntry: vi.fn().mockResolvedValue(null),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const req = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: { executionId: '11111111-1111-4111-8111-111111111111' },
      app: { locals: { packStore, executionHistoryStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Execution not found');
    expect(packStore.saveFixtureResult).not.toHaveBeenCalled();
  });

  it('rejects fixture runs when execution-backed results belong to a different pack version', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Wrong pack version',
      packVersion: '1.0.0',
      input: {},
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
    };
    const packStore = {
      getFixture: vi.fn().mockResolvedValue(fixture),
      get: vi.fn().mockResolvedValue(createPack()),
      saveFixtureResult: vi.fn(),
    };
    const executionHistoryStore = {
      getEntry: vi.fn().mockResolvedValue(createExecutionHistoryEntry({
        packRun: {
          ...createExecutionHistoryEntry().packRun,
          packId: 'other-pack',
          packVersion: '9.9.9',
        },
      })),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const req = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: { executionId: '11111111-1111-4111-8111-111111111111' },
      app: { locals: { packStore, executionHistoryStore } },
    };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Execution does not belong to the requested pack version');
    expect(packStore.saveFixtureResult).not.toHaveBeenCalled();
  });

  it('blocks publish until at least one fixture has a passing last result', async () => {
    const failingFixture = {
      id: 'fixture-1',
      name: 'Failing',
      packVersion: '1.0.0',
      input: {},
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
      lastResult: { source: 'fixture-runner', passed: false, assertions: [{ type: 'statusEquals', expected: 'completed', passed: false }] },
    };
    const passingFixture = {
      id: 'fixture-1',
      name: 'Passing',
      packVersion: '1.0.0',
      input: {},
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
      lastResult: {
        source: 'fixture-runner',
        packId: 'pack-1',
        packVersion: '1.0.0',
        ranAt: '2026-04-11T10:00:01.000Z',
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
      },
    };
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      listFixtures: vi.fn()
        .mockResolvedValueOnce([failingFixture])
        .mockResolvedValueOnce([passingFixture]),
      createPublishedVersion: vi.fn().mockResolvedValue({ ...createPack(), status: 'published' }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const req = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const blocked = createMockRes();
    const allowed = createMockRes();

    await handler(req, blocked, vi.fn());
    await handler(req, allowed, vi.fn());

    expect(blocked.statusCode).toBe(409);
    expect(blocked.body.error).toBe('Cannot publish without a passing fixture run');
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.pack.status).toBe('published');
  });

  it('does not publish when a malformed fixture claims a passing last result', async () => {
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      listFixtures: vi.fn().mockResolvedValue([
        {
          id: 'fixture-1',
          name: 'Malformed',
          packVersion: '1.0.0',
          input: {},
          assertions: [{ type: 'outputIncludes', expected: '' }],
          lastResult: { source: 'fixture-runner', passed: true, assertions: [{ type: 'outputIncludes', expected: '', passed: true }] },
        },
      ]),
      createPublishedVersion: vi.fn(),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const req = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(packStore.createPublishedVersion).not.toHaveBeenCalled();
  });

  it('does not publish a fixture with a forged passing lastResult not produced by the runner', async () => {
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      listFixtures: vi.fn().mockResolvedValue([
        {
          id: 'fixture-1',
          name: 'Forged',
          packVersion: '1.0.0',
          input: {},
          assertions: [{ type: 'statusEquals', expected: 'completed' }],
          lastResult: { passed: true, assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }] },
        },
      ]),
      createPublishedVersion: vi.fn(),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const req = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(packStore.createPublishedVersion).not.toHaveBeenCalled();
  });

  it('does not publish a runner-owned fixture result that predates the current pack update', async () => {
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack({ updatedAt: '2026-04-11T10:00:00.000Z' })),
      listFixtures: vi.fn().mockResolvedValue([
        {
          id: 'fixture-1',
          name: 'Stale',
          packVersion: '1.0.0',
          input: {},
          assertions: [{ type: 'statusEquals', expected: 'completed' }],
          lastResult: {
            source: 'fixture-runner',
            packId: 'pack-1',
            packVersion: '1.0.0',
            ranAt: '2026-04-11T09:59:59.000Z',
            passed: true,
            assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
          },
        },
      ]),
      createPublishedVersion: vi.fn(),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const req = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(packStore.createPublishedVersion).not.toHaveBeenCalled();
  });

  it('publishes after a fresh runner-owned fixture rerun for the current pack', async () => {
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack({ updatedAt: '2026-04-11T10:00:00.000Z' })),
      listFixtures: vi.fn().mockResolvedValue([
        {
          id: 'fixture-1',
          name: 'Fresh',
          packVersion: '1.0.0',
          input: {},
          assertions: [{ type: 'statusEquals', expected: 'completed' }],
          lastResult: {
            source: 'fixture-runner',
            packId: 'pack-1',
            packVersion: '1.0.0',
            ranAt: '2026-04-11T10:00:01.000Z',
            passed: true,
            assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
          },
        },
      ]),
      createPublishedVersion: vi.fn().mockResolvedValue({ ...createPack(), status: 'published' }),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const req = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.pack.status).toBe('published');
  });

  it('does not allow a rejected synthetic fixture run to unlock publish', async () => {
    const fixture = {
      id: 'fixture-1',
      name: 'Synthetic rejected',
      packVersion: '1.0.0',
      input: {},
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
      lastResult: null,
    };
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      getFixture: vi.fn().mockResolvedValue(fixture),
      listFixtures: vi.fn().mockResolvedValue([fixture]),
      saveFixtureResult: vi.fn(),
      createPublishedVersion: vi.fn(),
    };
    const handlerRun = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const handlerPublish = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const runReq = {
      params: { id: 'pack-1', fixtureId: 'fixture-1' },
      body: { status: 'completed', outputs: { result: 'forged' }, artifacts: [] },
      app: { locals: { packStore } },
    };
    const runRes = createMockRes();

    await handlerRun(runReq, runRes, vi.fn());

    const publishReq = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const publishRes = createMockRes();
    await handlerPublish(publishReq, publishRes, vi.fn());

    expect(runRes.statusCode).toBe(400);
    expect(publishRes.statusCode).toBe(409);
    expect(packStore.createPublishedVersion).not.toHaveBeenCalled();
  });

  it('preserves known statusCode errors from publish state transition', async () => {
    const err = new Error('Pack is archived');
    err.statusCode = 409;
    const packStore = {
      get: vi.fn().mockResolvedValue(createPack()),
      listFixtures: vi.fn().mockResolvedValue([
        {
          id: 'fixture-1',
          name: 'Passing',
          packVersion: '1.0.0',
          input: {},
          assertions: [{ type: 'statusEquals', expected: 'completed' }],
          lastResult: {
            source: 'fixture-runner',
            packId: 'pack-1',
            packVersion: '1.0.0',
            ranAt: '2026-04-11T10:00:01.000Z',
            passed: true,
            assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
          },
        },
      ]),
      createPublishedVersion: vi.fn().mockRejectedValue(err),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const req = { params: { id: 'pack-1' }, body: {}, app: { locals: { packStore } } };
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Pack is archived' });
    expect(next).not.toHaveBeenCalled();
  });

  it('enforces JSON parsing, mount path, and CSRF at the Express app boundary', async () => {
    const app = express();
    app.use(express.json());
    app.use(csrfMiddleware);
    app.locals.packStore = {
      create: vi.fn().mockResolvedValue(createPack()),
    };
    app.use('/api/v1/packs', packsRouter);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    });
    const server = createServer(app);
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/api/v1/packs`;

    const blocked = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPack()),
    });
    expect(blocked.status).toBe(403);

    const allowed = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ClaudeCodeManager',
      },
      body: JSON.stringify(createPack()),
    });

    expect(allowed.status).toBe(201);
    expect(await allowed.json()).toMatchObject({ pack: { id: 'pack-1' } });
  });
});
