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
        { id: 'agent-idle', type: 'agent', data: { label: 'Idle Agent' } },
      ],
    },
    agentStates: {
      'agent-triage': { status: 'running', sessionId: 'sess-triage' },
      'agent-billing': { status: 'running', sessionId: 'sess-billing' },
      'agent-idle': { status: 'paused', sessionId: 'sess-idle' },
    },
  };

  it('returns all running agent recipients for all scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'all', null);

    expect(targets).toEqual([
      { nodeId: 'agent-triage', sessionId: 'sess-triage', label: 'Triage Agent' },
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
    ]);
  });

  it('filters running agent recipients by department scope', () => {
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
