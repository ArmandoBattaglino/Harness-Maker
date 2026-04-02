// tests/swarm-engine.test.js
// Integration tests for SwarmEngine — 7 test cases covering execution lifecycle,
// handoff processing, circuit breaker, budget tracking, heartbeat, HITL mode,
// and DEC-009 preservation (swarmListeners tap must not modify existing onData handler).
//
// SessionManager is FULLY MOCKED — no real PTY processes are spawned.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SwarmEngine from '../services/SwarmEngine.js';
import CircuitBreaker from '../services/CircuitBreaker.js';
import BudgetTracker from '../services/BudgetTracker.js';

// ---------------------------------------------------------------------------
// Helpers — build fake workflow definitions
// ---------------------------------------------------------------------------

/**
 * Build a minimal workflow definition with two nodes connected by one edge.
 * node-a is the triage node; node-b is the target.
 */
function buildTwoNodeWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    nodes: [
      { id: 'node-a', data: { isTriageNode: true, systemPrompt: 'You are agent A.' } },
      { id: 'node-b', data: { systemPrompt: 'You are agent B.' } },
    ],
    edges: [
      { id: 'edge-ab', source: 'node-a', target: 'node-b' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

/**
 * Encode a context update as base64 JSON (matches HandoffParser token format).
 */
function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

// ---------------------------------------------------------------------------
// Mock factory — returns a fresh mockSession + mockSessionManager per test.
// The mockSession has a real swarmListeners Set and a pre-existing onData mock
// to verify DEC-009: the existing onData is never removed.
// ---------------------------------------------------------------------------

function buildMocks() {
  const mockSession = {
    swarmListeners: new Set(),
    writeInput: vi.fn(),
    onData: vi.fn(),   // pre-existing handler — must NOT be removed or replaced
    sessionId: 'sess-node-a',
  };

  // Map from nodeId to session so _spawnAgentPty can retrieve the right session
  const sessionsByNodeId = new Map();

  let sessionCallCount = 0;
  const mockSessionManager = {
    claudeBin: '/usr/local/bin/claude',
    createSession: vi.fn().mockImplementation(async (_projectId, _projectPath, _bin) => {
      sessionCallCount++;
      // Return the same mockSession for simplicity — sufficient for all 7 tests
      return mockSession;
    }),
    getSession: vi.fn().mockReturnValue(mockSession),
    writeInput: vi.fn(),
    killSession: vi.fn().mockResolvedValue(undefined),
  };

  return { mockSession, mockSessionManager };
}

// ---------------------------------------------------------------------------
// Shared workflow and mocks (re-created per test in beforeEach)
// ---------------------------------------------------------------------------

describe('SwarmEngine', () => {
  let wsBroadcast;
  let mockSession;
  let mockSessionManager;
  let workflowStoreMock;
  let circuitBreaker;
  let budgetTracker;
  let engine;
  let wf;

  beforeEach(() => {
    vi.useFakeTimers();
    wsBroadcast = vi.fn();
    ({ mockSession, mockSessionManager } = buildMocks());

    wf = buildTwoNodeWorkflow({ budgetTokens: 0, circuitBreakerThreshold: 10 });
    workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };

    circuitBreaker = new CircuitBreaker();
    budgetTracker = new BudgetTracker();

    engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
    engine.setWsBroadcast(wsBroadcast);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Execution lifecycle
  // startExecution() → agentStates populated → stopExecution() → terminal snapshot retained
  // -------------------------------------------------------------------------
  describe('Test 1: Execution lifecycle', () => {
    it('should retain a stopped execution snapshot after stopExecution', async () => {
      // Act — start
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Assert — execution record exists with correct shape
      const status = engine.getStatus(executionId);
      expect(status).not.toBeNull();
      expect(status.status).toBe('running');
      expect(status.agentStates).toBeDefined();
      // Triage node (node-a) must be in agentStates after startExecution
      expect(status.agentStates['node-a']).toBeDefined();
      expect(status.agentStates['node-a'].status).toBe('running');

      // Act — stop
      await engine.stopExecution(executionId);

      // Assert — execution remains retrievable with canonical stopped state
      const stoppedStatus = engine.getStatus(executionId);
      expect(stoppedStatus).not.toBeNull();
      expect(stoppedStatus.status).toBe('stopped');
      expect(stoppedStatus.agentStates['node-a'].status).toBe('stopped');
      expect(stoppedStatus.agentStates['node-a'].sessionId).toBeNull();
    });

    it('should remove swarm tap listener from session on stopExecution', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // swarmListeners must have the tap registered
      expect(mockSession.swarmListeners.size).toBeGreaterThan(0);

      await engine.stopExecution(executionId);

      // After stop, tap must be removed (cleanup)
      expect(mockSession.swarmListeners.size).toBe(0);
    });

    it('should broadcast stopping and stopped execution_status events on stopExecution', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      wsBroadcast.mockClear();
      await engine.stopExecution(executionId);

      const executionEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'execution_status');

      expect(executionEvents.some((ev) => ev.status === 'stopping')).toBe(true);
      expect(executionEvents.some((ev) => ev.status === 'stopped')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Handoff processing
  // Simulate PTY output with __HANDOFF__ token → workflowContext merged → target spawned
  // -------------------------------------------------------------------------
  describe('Test 2: Handoff processing', () => {
    it('should merge contextUpdate into workflowContext when handoff event fires', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Directly call _onHandoff to simulate a parsed handoff event
      const contextUpdate = { ticket: 'PROJ-42', priority: 'high' };
      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate,
      });

      // Verify context was merged
      const exec = engine._executions.get(executionId);
      expect(exec).toBeDefined();
      expect(exec.workflowContext.ticket).toBe('PROJ-42');
      expect(exec.workflowContext.priority).toBe('high');
    });

    it('should call createSession for target node after handoff', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // createSession is called once for the triage node (node-a) at start
      const callsBeforeHandoff = mockSessionManager.createSession.mock.calls.length;

      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate: {},
      });

      // createSession must have been called again for node-b
      expect(mockSessionManager.createSession.mock.calls.length).toBeGreaterThan(callsBeforeHandoff);
    });

    it('should broadcast handoff_started event when handoff fires', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate: {},
      });

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const handoffEvent = events.find((e) => e.type === 'handoff_started');
      expect(handoffEvent).toBeDefined();
      expect(handoffEvent.sourceNodeId).toBe('node-a');
      expect(handoffEvent.targetNodeId).toBe('node-b');
    });

    it('should set source node status to done after handoff', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate: {},
      });

      const exec = engine._executions.get(executionId);
      expect(exec.agentStates.get('node-a').status).toBe('done');
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Circuit breaker
  // Simulate 10 handoffs on same edge → circuit_breaker WS event emitted → execution NOT stopped
  // -------------------------------------------------------------------------
  describe('Test 3: Circuit breaker', () => {
    it('should emit circuit_breaker WS event when edge counter reaches threshold', async () => {
      // Build workflow with threshold = 10 (default)
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Fire 10 handoffs on the same edge — mock _ensureAgentPty to avoid re-spawn complexity
      // by making node-b already "done" so it gets re-spawned each time (exercising the path)
      for (let i = 0; i < 10; i++) {
        // Reset node-b status so _ensureAgentPty re-spawns each time
        const exec = engine._executions.get(executionId);
        if (exec.agentStates.has('node-b')) {
          exec.agentStates.get('node-b').status = 'done';
        }
        await engine._onHandoff(executionId, 'node-a', {
          type: 'handoff',
          targetId: 'node-b',
          contextUpdate: {},
        });
        // Reset source back to running for next iteration
        if (exec.agentStates.has('node-a')) {
          exec.agentStates.get('node-a').status = 'running';
        }
      }

      // Assert: circuit_breaker event was emitted
      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const cbEvent = events.find((e) => e.type === 'circuit_breaker');
      expect(cbEvent).toBeDefined();
      expect(cbEvent.edgeId).toBe('edge-ab');
      expect(cbEvent.counter).toBeGreaterThanOrEqual(10);
    });

    it('should NOT stop execution when circuit breaker fires', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Fire exactly threshold number of handoffs
      for (let i = 0; i < 10; i++) {
        const exec = engine._executions.get(executionId);
        if (exec.agentStates.has('node-b')) {
          exec.agentStates.get('node-b').status = 'done';
        }
        await engine._onHandoff(executionId, 'node-a', {
          type: 'handoff',
          targetId: 'node-b',
          contextUpdate: {},
        });
        if (exec.agentStates.has('node-a')) {
          exec.agentStates.get('node-a').status = 'running';
        }
      }

      // Execution must still be present and running
      const status = engine.getStatus(executionId);
      expect(status).not.toBeNull();
      expect(status.status).toBe('running');
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Budget tracking
  // Simulate large output chunks → budget_update WS event emitted at threshold
  // -------------------------------------------------------------------------
  describe('Test 4: Budget tracking', () => {
    it('should emit budget_update WS event when output exceeds budget limit', async () => {
      // Create workflow with budgetTokens = 10 (very low — easy to exceed)
      const tinyBudgetWf = buildTwoNodeWorkflow({ budgetTokens: 10 });
      workflowStoreMock.get.mockResolvedValue(tinyBudgetWf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Retrieve the tap function registered on swarmListeners
      const tapFn = [...mockSession.swarmListeners][0];
      expect(tapFn).toBeDefined();

      // Feed a large chunk to trigger budget exceeded path (>10 token limit = >40 chars)
      const bigChunk = 'A'.repeat(500); // 500 chars ≈ 125 tokens — well over 10-token limit
      tapFn(bigChunk);

      // Assert: budget_update event emitted
      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const budgetEvent = events.find((e) => e.type === 'budget_update');
      expect(budgetEvent).toBeDefined();
      expect(budgetEvent.estimatedTokensUsed).toBeGreaterThan(10);
      expect(budgetEvent.limitTokens).toBe(10);
    });

    it('should NOT emit budget_update when output is within budget limit', async () => {
      const wfWithBudget = buildTwoNodeWorkflow({ budgetTokens: 10000 });
      workflowStoreMock.get.mockResolvedValue(wfWithBudget);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const tapFn = [...mockSession.swarmListeners][0];

      // Feed tiny chunk — well under the 10000-token limit
      tapFn('tiny');

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const budgetEvent = events.find((e) => e.type === 'budget_update');
      expect(budgetEvent).toBeUndefined();
    });

    it('should emit agent_status updates with lastOutputSnippet as PTY output arrives', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const tapFn = [...mockSession.swarmListeners][0];

      wsBroadcast.mockClear();
      tapFn('first chunk');
      tapFn(' second chunk');

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.length).toBeGreaterThanOrEqual(2);
      expect(statusEvents.at(-1)).toMatchObject({
        status: 'running',
        sessionId: 'sess-node-a',
        lastOutputSnippet: 'first chunk second chunk',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Test 5: Heartbeat
  // Fake timers → verify writeInput called with '' every 5 minutes
  // -------------------------------------------------------------------------
  describe('Test 5: Heartbeat', () => {
    it('should call writeInput with empty string for running agents every 5 minutes', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Clear any calls made during setup
      mockSessionManager.writeInput.mockClear();

      // Advance fake timers by exactly 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // writeInput must have been called with '' for the running agent (node-a)
      const heartbeatCalls = mockSessionManager.writeInput.mock.calls.filter(
        ([, input]) => input === ''
      );
      expect(heartbeatCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT call writeInput for paused agents during heartbeat', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Pause node-a
      const exec = engine._executions.get(executionId);
      exec.agentStates.get('node-a').status = 'paused';

      mockSessionManager.writeInput.mockClear();

      // Advance 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      // No heartbeat calls expected for paused agent
      const heartbeatCalls = mockSessionManager.writeInput.mock.calls.filter(
        ([, input]) => input === ''
      );
      expect(heartbeatCalls.length).toBe(0);
    });

    it('should set the execution status to paused and then back to running on pause/resume', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      const paused = engine.pauseExecution(executionId);
      expect(paused.status).toBe('paused');
      expect(paused.agentStates['node-a'].status).toBe('paused');

      const resumed = engine.resumeExecution(executionId);
      expect(resumed.status).toBe('running');
      expect(resumed.agentStates['node-a'].status).toBe('running');
    });
  });

  // -------------------------------------------------------------------------
  // Test 6: HITL mode
  // freezeAgent() → InboxItem created → agent status paused → broadcast emitted
  // (The SwarmEngine does not auto-freeze in _onHandoff; HITL is via freezeAgent())
  // -------------------------------------------------------------------------
  describe('Test 6: HITL mode (freezeAgent)', () => {
    it('should create an inbox item and set agent status to paused when freezeAgent is called', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      const inboxItem = {
        id: 'hitl-item-1',
        reason: 'Human review required for this step.',
        sourceNodeId: 'node-a',
      };

      engine.freezeAgent(executionId, 'node-a', inboxItem);

      // Agent status must be paused
      const exec = engine._executions.get(executionId);
      expect(exec.agentStates.get('node-a').status).toBe('paused');

      // Inbox item must be stored
      expect(exec.inboxItems).toHaveLength(1);
      expect(exec.inboxItems[0].id).toBe('hitl-item-1');
      expect(exec.inboxItems[0].nodeId).toBe('node-a');
    });

    it('should broadcast hitl_required and agent_status events when freezeAgent is called', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      engine.freezeAgent(executionId, 'node-a', { id: 'hitl-2', reason: 'Review needed' });

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const hitlEvent = events.find((e) => e.type === 'hitl_required');
      const statusEvent = events.filter((e) => e.type === 'agent_status' && e.nodeId === 'node-a');

      expect(hitlEvent).toBeDefined();
      expect(hitlEvent.nodeId).toBe('node-a');

      // At minimum one agent_status event with status 'paused' for node-a
      const pausedEvent = statusEvent.find((e) => e.status === 'paused');
      expect(pausedEvent).toBeDefined();
    });

    it('should NOT auto-spawn target when freezeAgent is used (target must not have sessionId until unfreezeAgent)', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // createSession has been called for node-a (triage). Record call count.
      const callsAfterStart = mockSessionManager.createSession.mock.calls.length;

      // Freeze node-a for HITL — this must not spawn node-b
      engine.freezeAgent(executionId, 'node-a', { id: 'hitl-3', reason: 'Review' });

      // createSession must NOT have been called again (node-b must not be spawned)
      expect(mockSessionManager.createSession.mock.calls.length).toBe(callsAfterStart);

      const exec = engine._executions.get(executionId);
      // node-b must not be in agentStates at all
      expect(exec.agentStates.has('node-b')).toBe(false);
    });

    it('should mark the execution completed when the final active agent reports done', async () => {
      const singleNodeWorkflow = {
        id: 'wf-single',
        name: 'Single Node Workflow',
        nodes: [
          { id: 'node-a', data: { isTriageNode: true, systemPrompt: 'You are agent A.' } },
        ],
        edges: [],
        settings: { budgetTokens: 0, circuitBreakerThreshold: 10 },
        initialContext: {},
      };
      workflowStoreMock.get.mockResolvedValue(singleNodeWorkflow);

      const executionId = await engine.startExecution('wf-single', 'proj-1', '/projects/proj-1');

      wsBroadcast.mockClear();
      engine._onDone(executionId, 'node-a');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('completed');
      expect(status.agentStates['node-a'].status).toBe('done');

      const executionEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'execution_status');
      expect(executionEvents.some((ev) => ev.status === 'completed')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test 7: DEC-009 preservation
  // swarmListeners tap MUST NOT modify or remove the existing onData handler on a session.
  // The permanent onData handler registered by SessionManager must survive SwarmEngine operations.
  // -------------------------------------------------------------------------
  describe('Test 7: DEC-009 — swarmListeners tap must not remove existing onData handler', () => {
    it('should NOT remove or replace the pre-existing onData mock when registering tap', async () => {
      // Record the original onData reference before SwarmEngine touches the session
      const originalOnData = mockSession.onData;

      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // The pre-existing onData handler must be exactly the same function reference
      expect(mockSession.onData).toBe(originalOnData);
    });

    it('should register tap via swarmListeners.add() — not by replacing onData', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // swarmListeners Set must contain at least one tap function
      expect(mockSession.swarmListeners.size).toBeGreaterThan(0);

      // The tap function in swarmListeners must be a function (not a test artifact)
      for (const fn of mockSession.swarmListeners) {
        expect(typeof fn).toBe('function');
      }
    });

    it('should not clear swarmListeners Set on startExecution (only adds)', async () => {
      // Pre-populate swarmListeners with a sentinel listener
      const sentinelFn = vi.fn();
      mockSession.swarmListeners.add(sentinelFn);

      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Sentinel must still be present — SwarmEngine must only ADD, never clear
      expect(mockSession.swarmListeners.has(sentinelFn)).toBe(true);
    });

    it('should remove ONLY the swarm tap on stopExecution — not the sentinel listener', async () => {
      const sentinelFn = vi.fn();
      mockSession.swarmListeners.add(sentinelFn);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      // swarmListeners now has sentinel + engine tap
      expect(mockSession.swarmListeners.size).toBe(2);

      await engine.stopExecution(executionId);

      // Sentinel must survive — only the engine's own tap is removed
      expect(mockSession.swarmListeners.has(sentinelFn)).toBe(true);
      expect(mockSession.swarmListeners.size).toBe(1);
    });
  });
});
