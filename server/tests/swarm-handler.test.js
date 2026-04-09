import { describe, it, expect, vi, beforeEach } from 'vitest';
import handleSwarmConnection, { getSubscribers } from '../ws/swarmHandler.js';

function buildWs() {
  const handlers = new Map();
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
    readyState: 1,
    __handlers: handlers,
  };
}

describe('swarmHandler', () => {
  let swarmEngine;

  beforeEach(() => {
    swarmEngine = {
      getStatus: vi.fn(),
      getExecution: vi.fn(),
    };
  });

  it('sends the initial execution snapshot with workflowDef on connect', () => {
    const ws = buildWs();
    const req = { url: '/ws/swarm?executionId=exec-1' };
    const workflowDef = { id: 'wf-1', nodes: [{ id: 'node-a' }], edges: [] };

    swarmEngine.getStatus.mockReturnValue({
      executionId: 'exec-1',
      workflowId: 'wf-1',
      status: 'running',
      agentStates: {
        'node-a': {
          status: 'running',
          sessionId: 'sess-1',
          acceptsMessages: true,
          messageTransport: 'pty',
        },
      },
      edgeCounters: { 'edge-ab': 2 },
      budget: { estimatedTokensUsed: 5, limitTokens: 100 },
      inboxItems: [],
    });
    swarmEngine.getExecution.mockReturnValue({ workflowDef });

    handleSwarmConnection(ws, req, swarmEngine);

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      type: 'execution_status',
      executionId: 'exec-1',
      workflowId: 'wf-1',
      status: 'running',
      agentStates: {
        'node-a': {
          status: 'running',
          sessionId: 'sess-1',
          acceptsMessages: true,
          messageTransport: 'pty',
        },
      },
      edgeCounters: { 'edge-ab': 2 },
      budget: { estimatedTokensUsed: 5, limitTokens: 100 },
      inboxItems: [],
      workflowDef,
    });
    expect(getSubscribers('exec-1').has(ws)).toBe(true);
  });

  it('rejects the socket when the execution snapshot is unavailable', () => {
    const ws = buildWs();
    const req = { url: '/ws/swarm?executionId=missing-exec' };

    swarmEngine.getStatus.mockReturnValue(null);
    swarmEngine.getExecution.mockReturnValue(null);

    handleSwarmConnection(ws, req, swarmEngine);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', message: 'Execution not found' }));
    expect(ws.close).toHaveBeenCalled();
  });
});
