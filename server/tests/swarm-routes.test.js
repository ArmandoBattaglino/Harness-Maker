import { describe, it, expect, vi } from 'vitest';
import swarmRoutes, { resolveBroadcastNodeTargets, serializeSessionOutput } from '../routes/swarm.js';

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

describe('resolveBroadcastNodeTargets', () => {
  const execution = {
    workflowDef: {
      nodes: [
        { id: 'dept-billing', type: 'department', data: { label: 'Billing' } },
        {
          id: 'agent-triage',
          type: 'agent',
          data: { label: 'Triage Agent', parentDepartmentId: 'dept-billing' },
        },
        {
          id: 'agent-billing',
          type: 'agent',
          parentId: 'dept-billing',
          data: { label: 'Billing Agent' },
        },
        { id: 'agent-structured', type: 'agent', data: { label: 'Structured Agent' } },
        { id: 'agent-idle', type: 'agent', data: { label: 'Idle Agent' } },
      ],
    },
    agentStates: {
      'agent-triage': { status: 'running', sessionId: 'sess-triage' },
      'agent-billing': { status: 'running', sessionId: 'sess-billing' },
      'agent-structured': { status: 'done', sessionId: null },
      'agent-idle': { status: 'paused', sessionId: 'sess-idle' },
    },
  };

  it('returns all scoped agent recipients for all scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'all', null);

    expect(targets).toEqual([
      { nodeId: 'agent-triage', sessionId: 'sess-triage', label: 'Triage Agent' },
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
      { nodeId: 'agent-structured', sessionId: null, label: 'Structured Agent' },
      { nodeId: 'agent-idle', sessionId: 'sess-idle', label: 'Idle Agent' },
    ]);
  });

  it('filters scoped agent recipients by department scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'department', 'dept-billing');

    expect(targets).toEqual([
      { nodeId: 'agent-triage', sessionId: 'sess-triage', label: 'Triage Agent' },
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
    ]);
  });

  it('filters running agent recipients by specific agent scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'agent', 'agent-billing');

    expect(targets).toEqual([
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
    ]);
  });
});

describe('serializeSessionOutput', () => {
  it('serializes RingBuffer-backed session output to utf8 text', () => {
    const session = {
      buffer: {
        toBuffer: () => Buffer.from('hello from ring buffer', 'utf8'),
      },
    };

    expect(serializeSessionOutput(session)).toBe('hello from ring buffer');
  });

  it('falls back to String(buffer) for non-RingBuffer sessions', () => {
    const session = {
      buffer: 'plain text buffer',
    };

    expect(serializeSessionOutput(session)).toBe('plain text buffer');
  });
});

describe('swarmRoutes agent output fallback', () => {
  it('returns persisted live output when the agent PTY session is already gone', async () => {
    const execution = {
      executionId: 'exec-1',
      workflowDef: {
        name: 'Parallel Greetings Workflow',
        nodes: [
          { id: 'node-2', type: 'agent', data: { label: 'Agent-A English Greeter' } },
        ],
      },
      agentStates: {
        'node-2': { status: 'done', sessionId: 'sess-missing' },
      },
      chatMessages: [
        { nodeId: 'node-2', role: 'assistant', text: 'Saved terminal transcript', timestamp: 1 },
      ],
    };

    const swarmEngine = {
      getStatus: vi.fn().mockReturnValue(execution),
      getExecution: vi.fn().mockReturnValue(execution),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
    };
    const sessionManager = {
      getSession: vi.fn().mockReturnValue(null),
    };
    const router = swarmRoutes(swarmEngine, sessionManager);
    const handler = getRouteHandler(router, 'get', '/:executionId/agent/:nodeId/output');
    const req = {
      params: { executionId: 'exec-1', nodeId: 'node-2' },
      query: {},
      app: { locals: {} },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ output: 'Saved terminal transcript' });
  });
});

describe('swarmRoutes pause/resume contract', () => {
  it('returns 409 and skips pauseExecution when the execution is already blocked', async () => {
    const swarmEngine = {
      getStatus: vi.fn().mockReturnValue({ status: 'blocked' }),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
      getExecution: vi.fn(),
    };
    const router = swarmRoutes(swarmEngine, { getSession: vi.fn() });
    const handler = getRouteHandler(router, 'post', '/:executionId/pause');
    const req = { params: { executionId: 'exec-1' }, body: {}, app: { locals: {} } };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: "Execution cannot be paused from status 'blocked'" });
    expect(swarmEngine.pauseExecution).not.toHaveBeenCalled();
  });

  it('returns 409 and skips resumeExecution when the execution is blocked instead of paused', () => {
    const swarmEngine = {
      getStatus: vi.fn().mockReturnValue({ status: 'blocked' }),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
      getExecution: vi.fn(),
    };
    const router = swarmRoutes(swarmEngine, { getSession: vi.fn() });
    const handler = getRouteHandler(router, 'post', '/:executionId/resume');
    const req = { params: { executionId: 'exec-1' }, body: {}, app: { locals: {} } };
    const res = createMockRes();

    handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: "Execution cannot be resumed from status 'blocked'" });
    expect(swarmEngine.resumeExecution).not.toHaveBeenCalled();
  });
});

describe('swarmRoutes runtime model contract', () => {
  it('returns backend-authoritative runtime capabilities', () => {
    const swarmEngine = {
      getStatus: vi.fn(),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
      getExecution: vi.fn(),
    };
    const router = swarmRoutes(swarmEngine, {
      getSession: vi.fn(),
      claudeBin: '/usr/local/bin/claude',
      codexBin: '/usr/local/bin/codex',
      geminiBin: '/usr/local/bin/gemini',
    });
    const handler = getRouteHandler(router, 'get', '/runtime-capabilities');
    const req = { params: {}, body: {}, app: { locals: {} } };
    const res = createMockRes();

    handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.availability).toEqual({
      claude: true,
      codex: true,
      gemini: true,
    });
    expect(res.body.defaults).toEqual({
      claude: 'opus',
      codex: 'gpt-5.4',
      gemini: 'gemini-2.5-pro',
    });
    expect(res.body.providers.claude).toEqual([
      'opus',
      'claude-opus-4-6',
      'sonnet',
      'claude-sonnet-4-6',
      'haiku',
      'claude-haiku-4-5-20251001',
    ]);
    expect(res.body.providers.gemini).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(res.body.providers.codex).toEqual(['gpt-5.4', 'gpt-5.1-codex', 'gpt-4.1-codex']);
    expect(res.body.providers.gemini).not.toContain('gemini-2.0-flash');
  });

  it('returns a precise 400 when startExecution rejects an unsupported runtime model', async () => {
    const error = new Error("Unsupported gemini model 'gemini-2.0-flash'. Supported models: gemini-2.5-pro, gemini-2.5-flash");
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_RUNTIME_MODEL';

    const swarmEngine = {
      startExecution: vi.fn().mockRejectedValue(error),
      getStatus: vi.fn(),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
      getExecution: vi.fn(),
    };
    const router = swarmRoutes(swarmEngine, { getSession: vi.fn() });
    const handler = getRouteHandler(router, 'post', '/:workflowId/start');
    const req = {
      params: { workflowId: 'wf-1' },
      body: {
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        runtimeProvider: 'gemini',
        runtimeModels: { gemini: 'gemini-2.0-flash' },
      },
      app: { locals: {} },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Unsupported gemini model 'gemini-2.0-flash'. Supported models: gemini-2.5-pro, gemini-2.5-flash",
      code: 'UNSUPPORTED_RUNTIME_MODEL',
    });
  });

  it('passes workflow-native direct-run input into SwarmEngine start options', async () => {
    const swarmEngine = {
      startExecution: vi.fn().mockResolvedValue('exec-workflow-input'),
      getStatus: vi.fn().mockReturnValue({
        status: 'running',
        workflowRun: {
          kind: 'workflow-direct',
          inputs: { brief: 'Launch X', tone: 'formal' },
        },
      }),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
      getExecution: vi.fn(),
    };
    const router = swarmRoutes(swarmEngine, { getSession: vi.fn() });
    const handler = getRouteHandler(router, 'post', '/:workflowId/start');
    const req = {
      params: { workflowId: 'wf-input' },
      body: {
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        runtimeProvider: 'codex',
        workflowInput: { brief: 'Launch X', tone: 'formal' },
      },
      app: { locals: {} },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(swarmEngine.startExecution).toHaveBeenCalledWith('wf-input', 'proj-1', '/projects/proj-1', {
      runtimeProvider: 'codex',
      runtimeModels: undefined,
      workflowInput: { brief: 'Launch X', tone: 'formal' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.workflowRun.inputs.brief).toBe('Launch X');
  });

  it('returns workflow input validation details from SwarmEngine start failures', async () => {
    const error = new Error('Workflow input validation failed: payload must be valid parsed JSON, not a raw string');
    error.statusCode = 400;
    error.code = 'WORKFLOW_INPUT_VALIDATION_FAILED';
    error.details = ['payload must be valid parsed JSON, not a raw string'];
    const swarmEngine = {
      startExecution: vi.fn().mockRejectedValue(error),
      getStatus: vi.fn(),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
      getExecution: vi.fn(),
    };
    const router = swarmRoutes(swarmEngine, { getSession: vi.fn() });
    const handler = getRouteHandler(router, 'post', '/:workflowId/start');
    const req = {
      params: { workflowId: 'wf-input' },
      body: {
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        workflowInput: { payload: '{bad json' },
      },
      app: { locals: {} },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Workflow input validation failed: payload must be valid parsed JSON, not a raw string',
      code: 'WORKFLOW_INPUT_VALIDATION_FAILED',
      details: ['payload must be valid parsed JSON, not a raw string'],
    });
  });
});

describe('swarmRoutes broadcast delivery', () => {
  it('uses SwarmEngine.sendBroadcast so Gemini sessions can queue safe injections', async () => {
    const swarmEngine = {
      getStatus: vi.fn().mockReturnValue({
        status: 'running',
        agentStates: {
          'agent-a': { status: 'running', sessionId: 'sess-a' },
        },
      }),
      getExecution: vi.fn().mockReturnValue({
        workflowDef: {
          nodes: [
            { id: 'agent-a', type: 'agent', data: { label: 'Agent A' } },
          ],
        },
      }),
      sendBroadcast: vi.fn().mockResolvedValue({ sent: true, delivery: 'queued' }),
    };
    const sessionManager = { writeInput: vi.fn(), getSession: vi.fn() };
    const router = swarmRoutes(swarmEngine, sessionManager);
    const handler = getRouteHandler(router, 'post', '/:executionId/broadcast');
    const req = {
      params: { executionId: 'exec-1' },
      body: { text: 'Redirect the task', scope: 'all', mode: 'hard' },
      app: { locals: {} },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(swarmEngine.sendBroadcast).toHaveBeenCalledWith('exec-1', 'agent-a', 'Redirect the task', { mode: 'hard' });
    expect(sessionManager.writeInput).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      sent: 1,
      recipientNodeIds: ['agent-a'],
      deliveries: [{ nodeId: 'agent-a', delivery: 'queued' }],
    });
  });
});
