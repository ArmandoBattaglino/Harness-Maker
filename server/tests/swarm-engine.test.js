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
    description: 'Analyze the request, hand off the useful context, and complete the workflow.',
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
  const sessions = new Map();
  const sessionIds = ['sess-node-a', 'sess-node-b'];
  const createMockSession = (sessionId) => ({
    swarmListeners: new Set(),
    writeInput: vi.fn(),
    onData: vi.fn(),   // pre-existing handler — must NOT be removed or replaced
    sessionId,
  });
  const mockSession = createMockSession('sess-node-a');
  sessions.set(mockSession.sessionId, mockSession);

  let sessionCallCount = 0;
  const mockSessionManager = {
    claudeBin: '/usr/local/bin/claude',
    codexBin: '/usr/local/bin/codex',
    geminiBin: '/usr/local/bin/gemini',
    createSession: vi.fn().mockImplementation(async (_projectId, _projectPath, _bin) => {
      sessionCallCount++;
      if (sessionCallCount === 1) {
        return mockSession;
      }
      const sessionId = sessionIds[sessionCallCount - 1] ?? `sess-${sessionCallCount}`;
      const session = createMockSession(sessionId);
      sessions.set(sessionId, session);
      return session;
    }),
    getSession: vi.fn().mockImplementation((sessionId) => sessions.get(sessionId)),
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
    vi.unstubAllEnvs();
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

    it('should seed workflowContext with the workflow goal before the first agent starts', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      const execution = engine._executions.get(executionId);
      expect(execution.workflowContext).toMatchObject({
        workflowName: 'Test Workflow',
        workflowDescription: 'Analyze the request, hand off the useful context, and complete the workflow.',
        currentTask: 'Execute the workflow goal described here: Analyze the request, hand off the useful context, and complete the workflow.',
      });
    });

    it('should start an explicit Codex execution with provider metadata in the snapshot contract', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        'proj-1',
        '/projects/proj-1',
        '/usr/local/bin/codex',
        expect.objectContaining({
          provider: 'codex',
          args: [
            '--no-alt-screen',
            '-a',
            'never',
            '-s',
            'workspace-write',
            '-m',
            'gpt-5.1-codex',
          ],
          initialPrompt: expect.stringContaining('Codex runtime is active for this Swarm agent.'),
        })
      );

      const status = engine.getStatus(executionId);
      expect(status).toMatchObject({
        status: 'running',
        runtimeProvider: 'codex',
        activeProvider: 'codex',
      });
      expect(status.providerStrategy).toMatchObject({
        mode: 'codex',
        activeProvider: 'codex',
        fallbackProvider: null,
        allowFallback: false,
      });
      expect(status.lastFallback).toBeNull();
      expect(status.agentStates['node-a']).toMatchObject({
        provider: 'codex',
        runtimeProvider: 'codex',
        status: 'running',
      });
    });

    it('should honor SWARM_CODEX_MODEL when building the Codex runtime launch args', async () => {
      vi.stubEnv('SWARM_CODEX_MODEL', 'gpt-5.4');

      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        'proj-1',
        '/projects/proj-1',
        '/usr/local/bin/codex',
        expect.objectContaining({
          provider: 'codex',
          args: [
            '--no-alt-screen',
            '-a',
            'never',
            '-s',
            'workspace-write',
            '-m',
            'gpt-5.4',
          ],
        })
      );
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

    it('should inject an explicit current task and valid handoff targets into the first agent prompt', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      const initialPrompt = mockSessionManager.writeInput.mock.calls[0]?.[1] ?? '';
      expect(initialPrompt).toContain('Current task: Execute the workflow goal described here: Analyze the request, hand off the useful context, and complete the workflow.');
      expect(initialPrompt).toContain('Workflow goal: Analyze the request, hand off the useful context, and complete the workflow.');
      expect(initialPrompt).toContain('Valid target IDs: node-b');
      expect(initialPrompt).toContain('This agent is not terminal in the workflow.');
      expect(initialPrompt).toContain('Your required downstream target is: node-b');
      expect(initialPrompt).toContain('primitive values only (string, number, or boolean)');
      expect(initialPrompt).toContain('Keep it compact.');
      expect(initialPrompt).toContain('Do NOT output __DONE__ from this agent while downstream handoff targets still exist.');
      expect(initialPrompt).toContain('Do not emit __DONE__ immediately just because you understand the instructions.');
      expect(initialPrompt).toContain('For this workflow, <targetId> must be node-b.');
      expect(initialPrompt).toContain('__HANDOFF__:<targetId>:{"summary": "your real work summary", "result": "your real findings"}');
      expect(initialPrompt).not.toContain('__HANDOFF__:node-b:{"summary": "Completed my stage of the task", "result": "key findings here"}');
    });

    it('should keep recovery handoff instructions templated so echoed follow-up prompts cannot become a fake handoff', () => {
      const prompt = engine._buildContinueAfterDonePrompt(wf.nodes[0], engine._buildInitialWorkflowContext(wf), ['node-b']);

      expect(prompt).toContain('Use node-b in place of <targetId> for this workflow.');
      expect(prompt).toContain('__HANDOFF__:<targetId>:{"summary": "your work summary here"}');
      expect(prompt).not.toContain('__HANDOFF__:node-b:');
    });

    it('should submit the pasted swarm prompt with a follow-up enter key', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      await vi.advanceTimersByTimeAsync(101);

      expect(mockSessionManager.writeInput.mock.calls[0]?.[1]).toContain('--- END SWARM INPUT ---');
      expect(mockSessionManager.writeInput.mock.calls.at(-1)).toEqual(['sess-node-a', '\r']);
    });

    it('should interrupt an active Codex runtime before sending a follow-up swarm prompt', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get([...engine._executions.keys()][0]);
      const nodeAState = execution.agentStates.get('node-a');
      nodeAState.runtimeSession = true;
      nodeAState.promptReady = true;
      nodeAState.promptSubmissionCount = 1;

      mockSessionManager.writeInput.mockClear();
      engine._writeSwarmPrompt('sess-node-a', 'Follow-up prompt', nodeAState);
      await vi.advanceTimersByTimeAsync(500);

      expect(mockSessionManager.writeInput.mock.calls[0]).toEqual(['sess-node-a', '\x1b']);
      expect(mockSessionManager.writeInput.mock.calls.at(-1)).toEqual(['sess-node-a', '\r']);
    });

    it('should auto-dismiss the Codex model-selection menu by choosing the existing model', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get([...engine._executions.keys()][0]);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      mockSessionManager.writeInput.mockClear();
      tapFn("Choose how you'd like Codex to proceed.\n1. Try new model\n2. Use existing model");
      await vi.advanceTimersByTimeAsync(80);

      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\x1b[B']);
      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\r']);
      expect(nodeAState.modelSelectionMenuHandled).toBe(true);
    });

    it('should auto-dismiss the rendered Codex model-selection menu even when cursor-control ANSI strips spacing', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get([...engine._executions.keys()][0]);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      mockSessionManager.writeInput.mockClear();
      tapFn("Choose\u001b[1Chow\u001b[1Cyou'd\u001b[1Clike\u001b[1CCodex\u001b[1Cto\u001b[1Cproceed.\u001b[38;5;6m\u001b[15;1H› 1. Try new model\u001b[m\u001b[16;3H2.\u001b[1CUse\u001b[1Cexisting\u001b[1Cmodel");
      await vi.advanceTimersByTimeAsync(80);

      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\x1b[B']);
      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\r']);
      expect(nodeAState.modelSelectionMenuHandled).toBe(true);
    });

    it('should auto-dismiss the Codex approaching-rate-limits menu by keeping the current model', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      mockSessionManager.writeInput.mockClear();
      tapFn('Approaching rate limits.\n1. Switch to gpt-5.1-codex-mini\n2. Keep current model\n3. Keep current model (never show again)');
      await vi.advanceTimersByTimeAsync(80);

      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\x1b[B']);
      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\r']);
      expect(nodeAState.rateLimitMenuHandled).toBe(true);

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.runtimeBlocker).toBeUndefined();
    });

    it('should auto-dismiss the rendered Codex approaching-rate-limits menu even when ANSI strips spacing', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get([...engine._executions.keys()][0]);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      mockSessionManager.writeInput.mockClear();
      tapFn('Approaching\u001b[1Crate\u001b[1Climits.\u001b[38;5;6m\u001b[15;1H› 1. Switch\u001b[1Cto\u001b[1Cgpt-5.1-codex-mini\u001b[m\u001b[16;3H2.\u001b[1CKeep\u001b[1Ccurrent\u001b[1Cmodel\u001b[17;3H3.\u001b[1CKeep\u001b[1Ccurrent\u001b[1Cmodel');
      await vi.advanceTimersByTimeAsync(80);

      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\x1b[B']);
      expect(mockSessionManager.writeInput.mock.calls).toContainEqual(['sess-node-a', '\r']);
      expect(nodeAState.rateLimitMenuHandled).toBe(true);
    });

    it('should prefer a hard Codex usage-limit blocker over auto-dismissing the approaching-rate-limits menu', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      mockSessionManager.writeInput.mockClear();
      tapFn("You've hit your usage limit. Try again at Apr 9th, 2026 4:22 PM.\nApproaching rate limits.\n1. Switch to gpt-5.1-codex-mini\n2. Keep current model");
      await vi.advanceTimersByTimeAsync(80);

      expect(mockSessionManager.writeInput.mock.calls).not.toContainEqual(['sess-node-a', '\x1b[B']);
      expect(mockSessionManager.writeInput.mock.calls).not.toContainEqual(['sess-node-a', '\r']);

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'codex',
        nodeId: 'node-a',
      });
    });

    it('should ignore the rendered Codex initial prompt until the swarm echo marker so prompt examples do not count as handoffs', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      tapFn('__HANDOFF__:node-b:{"summary":"prompt example","status":"ignore me"}');

      let status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].handoffCount).toBe(0);
      expect(status.agentStates['node-b']).toBeUndefined();

      tapFn('\n--- END SWARM INPUT ---');
      await Promise.resolve();
      await Promise.resolve();

      status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].handoffCount).toBe(0);
      expect(status.agentStates['node-b']).toBeUndefined();

      tapFn('\n__HANDOFF__:node-b:{"summary":"real work","status":"ready"}');
      await Promise.resolve();
      await Promise.resolve();

      status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].handoffCount).toBe(1);
      expect(status.agentStates['node-b'].status).toBe('running');
    });

    it('should ignore replayed prompt templates after the echo marker because <targetId> is not a real downstream node id', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      tapFn('\n--- END SWARM INPUT ---');
      await Promise.resolve();
      await Promise.resolve();

      tapFn('\n__HANDOFF__:<targetId>:{"summary":"your real work summary","result":"your real findings"}');
      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].handoffCount).toBe(0);
      expect(status.agentStates['node-b']).toBeUndefined();
    });

    it('should keep a non-terminal agent running and send a recovery prompt when it emits __DONE__', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      wsBroadcast.mockClear();
      mockSessionManager.writeInput.mockClear();

      engine._onDone(executionId, 'node-a');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.agentStates['node-a'].status).toBe('running');
      expect(mockSessionManager.writeInput).toHaveBeenCalledWith(
        'sess-node-a',
        expect.stringContaining('Your very last line must be a valid handoff token')
      );

      const executionEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'execution_status');
      expect(executionEvents.some((ev) => ev.status === 'completed')).toBe(false);
    });

    it('should register the PTY tap before writing the initial swarm prompt so echo suppression can recover', async () => {
      mockSessionManager.writeInput.mockImplementation((sessionId, data) => {
        for (const listener of mockSession.swarmListeners) {
          listener(data);
        }
      });

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const handoffPayload = b64({ summary: 'handoff context' });
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      expect(tapFn).toBeDefined();
      expect(nodeAState.ignoreParserUntil).toBeNull();
      expect(mockSessionManager.writeInput).toHaveBeenCalled();

      tapFn(`Work complete\n__HANDOFF__:node-b:${handoffPayload}`);
      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].handoffCount).toBeGreaterThan(0);
      expect(status.agentStates['node-b'].status).toBe('running');

      const handoffEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'handoff_started' || ev.type === 'handoff_completed');
      expect(handoffEvents.some((ev) => ev.type === 'handoff_started')).toBe(true);
    });

    it('should auto-clear ignoreParserUntil after the echo marker timeout if the marker never arrives (Claude provider)', async () => {
      // Claude provider does NOT set ignoreParserUntil at spawn time (only Codex does).
      // But after a handoff, _writeSwarmPrompt -> _flushSwarmPrompt sets ignoreParserUntil
      // for the target agent's prompt injection. Simulate that scenario.
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      // Simulate _flushSwarmPrompt having been called (sets ignoreParserUntil)
      nodeAState.ignoreParserUntil = '--- END SWARM INPUT ---';
      nodeAState.ignoreParserBuffer = '';
      // Start the echo marker timeout (mimicking _flushSwarmPrompt behavior)
      nodeAState.echoMarkerTimer = setTimeout(() => {
        if (nodeAState.ignoreParserUntil) {
          nodeAState.ignoreParserUntil = null;
          nodeAState.ignoreParserBuffer = '';
        }
        nodeAState.echoMarkerTimer = null;
      }, 10000);

      // The parser should still be blocked
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);
      tapFn('__DONE__');
      let status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].status).toBe('running');

      // Advance past the 10s timeout
      await vi.advanceTimersByTimeAsync(10001);

      // ignoreParserUntil should now be cleared
      expect(nodeAState.ignoreParserUntil).toBeNull();
      expect(nodeAState.echoMarkerTimer).toBeNull();

      // Now a __DONE__ should be parseable
      tapFn('__DONE__');

      // node-a has downstream targets, so _onDone should reinject (not complete)
      status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].status).toBe('running');
      // But the reinject proves the parser is working (doneReinjectCount > 0)
      expect(nodeAState.doneReinjectCount).toBeGreaterThan(0);
    });

    it('should cancel the echo marker timeout when the marker arrives before the timeout fires', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      // Codex sets ignoreParserUntil at spawn. Verify it's set.
      expect(nodeAState.ignoreParserUntil).toBe('--- END SWARM INPUT ---');

      // Send the echo marker BEFORE the timeout fires
      tapFn('\n--- END SWARM INPUT ---');

      // ignoreParserUntil should be cleared immediately
      expect(nodeAState.ignoreParserUntil).toBeNull();
      // echoMarkerTimer should also be cleared
      expect(nodeAState.echoMarkerTimer).toBeNull();
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

    it('should classify provider blocker output and move the execution into blocked state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn("You've hit your limit\n/rate-limit-options");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'claude',
        nodeId: 'node-a',
      });

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');

      expect(blockedSnapshot).toBeDefined();
      expect(blockedSnapshot.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'claude',
      });
    });

    it('should fallback from Claude to Codex when a pre-work blocker is detected in auto mode', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const initialCallCount = mockSessionManager.createSession.mock.calls.length;

      wsBroadcast.mockClear();
      await engine._handleRuntimeBlocker(executionId, 'node-a', {
        type: 'rate_limited',
        provider: 'claude',
        message: 'Claude hit its usage limit before the swarm agent could continue.',
        detectedAt: '2026-04-02T10:00:00.000Z',
      });

      expect(mockSessionManager.createSession.mock.calls.length).toBe(initialCallCount + 1);
      const fallbackCall = mockSessionManager.createSession.mock.calls.at(-1);
      expect(fallbackCall[2]).toBe('/usr/local/bin/codex');
      expect(fallbackCall[3]).toMatchObject({
        provider: 'codex',
        args: [
          '--no-alt-screen',
          '-a',
          'never',
          '-s',
          'workspace-write',
          '-m',
          'gpt-5.1-codex',
        ],
      });
      expect(mockSessionManager.killSession).toHaveBeenCalledWith('sess-node-a');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.activeProvider).toBe('codex');
      expect(status.providerStrategy).toMatchObject({
        mode: 'auto',
        activeProvider: 'codex',
        fallbackProvider: 'codex',
        allowFallback: true,
      });
      expect(status.lastFallback).toMatchObject({
        fromProvider: 'claude',
        toProvider: 'codex',
        type: 'rate_limited',
        nodeId: 'node-a',
      });
      expect(status.runtimeBlocker).toBeUndefined();
      expect(status.agentStates['node-a']).toMatchObject({
        provider: 'codex',
        runtimeProvider: 'codex',
        status: 'running',
      });

      const executionEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'execution_status');
      expect(executionEvents.some((ev) => ev.status === 'blocked')).toBe(true);
      expect(executionEvents.at(-1)).toMatchObject({
        status: 'running',
        runtimeProvider: 'codex',
        activeProvider: 'codex',
      });

      const providerSwitch = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'runtime_provider_switch');
      expect(providerSwitch).toMatchObject({
        nodeId: 'node-a',
        fromProvider: 'claude',
        toProvider: 'codex',
      });
    });

    it('should classify Codex usage-limit output as a blocked runtime state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn("You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 2:39 AM.");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.activeProvider).toBe('codex');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'codex',
        nodeId: 'node-a',
      });
      expect(status.lastFallback).toBeNull();

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');

      expect(blockedSnapshot).toBeDefined();
      expect(blockedSnapshot.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'codex',
      });
    });

    it('should classify Codex trust/bootstrap output as a blocked runtime state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn('Do you trust the contents of this directory? Trust this folder to continue.');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.activeProvider).toBe('codex');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'trust_required',
        provider: 'codex',
        nodeId: 'node-a',
      });
      expect(status.lastFallback).toBeNull();

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');

      expect(blockedSnapshot).toBeDefined();
      expect(blockedSnapshot.runtimeBlocker).toMatchObject({
        type: 'trust_required',
        provider: 'codex',
      });
    });

    it('should classify Codex CLI usage errors as provider_unavailable instead of leaving the execution running', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn("error: unexpected argument '--skip-git-repo-check' found\r\nUsage: codex [OPTIONS] [PROMPT]");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.activeProvider).toBe('codex');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'provider_unavailable',
        provider: 'codex',
        nodeId: 'node-a',
      });

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');

      expect(blockedSnapshot).toBeDefined();
      expect(blockedSnapshot.runtimeBlocker).toMatchObject({
        type: 'provider_unavailable',
        provider: 'codex',
      });
    });

    it('should classify Codex unsupported reasoning-effort errors as provider_unavailable', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn("{\"type\":\"error\",\"error\":{\"code\":\"unsupported_value\",\"message\":\"Unsupported value: 'xhigh' is not supported\",\"param\":\"reasoning.effort\"},\"status\":400}");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.activeProvider).toBe('codex');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'provider_unavailable',
        provider: 'codex',
        nodeId: 'node-a',
      });
    });

    it('should classify Codex conversation-interrupted output as a blocked runtime state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      tapFn('■ Conversation interrupted - tell the model what to do differently. Something went wrong? Hit `/feedback` to report the issue.');
      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.activeProvider).toBe('codex');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'prompt_rejected',
        provider: 'codex',
        nodeId: 'node-a',
      });

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');

      expect(blockedSnapshot).toBeDefined();
      expect(blockedSnapshot.runtimeBlocker).toMatchObject({
        type: 'prompt_rejected',
        provider: 'codex',
      });
    });

    it('should keep the execution blocked when a done event arrives after a runtime blocker', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      await engine._handleRuntimeBlocker(executionId, 'node-a', {
        type: 'prompt_rejected',
        provider: 'codex',
        message: 'Codex rejected the injected swarm steering prompt and could not continue the workflow in interactive mode.',
        detectedAt: '2026-04-03T11:10:51.098Z',
      });

      engine._onDone(executionId, 'node-a');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'prompt_rejected',
        provider: 'codex',
        nodeId: 'node-a',
      });
      expect(nodeAState.runtimeBlocker).toMatchObject({
        type: 'prompt_rejected',
        provider: 'codex',
      });
    });
    it('should classify Gemini rate limit output as a blocked runtime state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn("resource exhausted (429)");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('gemini');
      expect(status.activeProvider).toBe('gemini');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'gemini',
        nodeId: 'node-a',
      });
      expect(status.lastFallback).toBeNull();
    });

    it('should classify Gemini authentication required output as a blocked runtime state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn("Error: not authenticated. please sign in.");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('gemini');
      expect(status.activeProvider).toBe('gemini');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'provider_unavailable',
        provider: 'gemini',
        nodeId: 'node-a',
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

  // -------------------------------------------------------------------------
  // Case 8: _onDone max reinject limit — forces handoff after N failed attempts
  // -------------------------------------------------------------------------
  describe('_onDone max reinject limit', () => {
    const ECHO_MARKER = '--- END SWARM INPUT ---';

    /**
     * Simulate a full __DONE__ → reinject → echo marker clearance cycle.
     * After _onDone reinjects, ignoreParserUntil is set. We must echo back
     * the marker to clear it before the next __DONE__ can be detected.
     */
    async function simulateDoneAndEchoCycle(tapFn) {
      // Advance timer to flush the pending prompt (fallback 2500ms + submit 100ms)
      await vi.advanceTimersByTimeAsync(3000);
      // Feed __DONE__ to trigger the handler
      tapFn('__DONE__');
      // After _onDone reinjects, ignoreParserUntil is set.
      // Simulate the PTY echoing back the prompt + marker to clear the filter.
      await vi.advanceTimersByTimeAsync(3000);
      tapFn(ECHO_MARKER);
    }

    it('should force a handoff to first downstream target after MAX_DONE_REINJECT_ATTEMPTS', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      // Get the tapFn registered on the mock session
      const tapFn = [...mockSession.swarmListeners].find(fn => typeof fn === 'function');
      expect(tapFn).toBeDefined();

      // Clear the initial prompt's ignoreParserUntil by echoing back the marker
      await vi.advanceTimersByTimeAsync(200);
      tapFn(ECHO_MARKER);

      // Cycle 1-3: __DONE__ → reinject → echo clears filter
      for (let i = 0; i < 3; i++) {
        await simulateDoneAndEchoCycle(tapFn);
      }

      // Cycle 4: __DONE__ should trigger forced handoff (no more reinjects)
      await vi.advanceTimersByTimeAsync(3000);
      tapFn('__DONE__');

      // Allow the async _onHandoff → _ensureAgentPty → createSession promise chain to settle.
      // Flush microtasks repeatedly so chained .then() / await resolutions complete.
      for (let tick = 0; tick < 10; tick++) {
        await Promise.resolve();
      }
      await vi.advanceTimersByTimeAsync(500);

      // After forced handoff, node-a should be 'done' and node-b should exist
      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].status).toBe('done');
      expect(status.agentStates['node-b']).toBeDefined();
    });

    it('should broadcast handoff_started when forcing handoff after max reinjects', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const tapFn = [...mockSession.swarmListeners].find(fn => typeof fn === 'function');

      // Clear the initial prompt's ignoreParserUntil
      await vi.advanceTimersByTimeAsync(200);
      tapFn(ECHO_MARKER);

      // Cycle 1-3: __DONE__ → reinject → echo clears filter
      for (let i = 0; i < 3; i++) {
        await simulateDoneAndEchoCycle(tapFn);
      }

      wsBroadcast.mockClear();

      // Cycle 4: triggers forced handoff
      await vi.advanceTimersByTimeAsync(3000);
      tapFn('__DONE__');

      // Check that handoff_started was broadcast (from the forced handoff)
      const handoffStarted = wsBroadcast.mock.calls.find(
        call => call[1]?.type === 'handoff_started'
      );
      expect(handoffStarted).toBeDefined();
      expect(handoffStarted[1].sourceNodeId).toBe('node-a');
      expect(handoffStarted[1].targetNodeId).toBe('node-b');
    });

    it('should stop after exactly three reinject prompts before forcing the downstream handoff', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const tapFn = [...mockSession.swarmListeners].find(fn => typeof fn === 'function');

      await vi.advanceTimersByTimeAsync(200);
      tapFn(ECHO_MARKER);
      mockSessionManager.writeInput.mockClear();

      for (let i = 0; i < 3; i++) {
        await simulateDoneAndEchoCycle(tapFn);
      }

      await vi.advanceTimersByTimeAsync(3000);
      tapFn('__DONE__');
      for (let tick = 0; tick < 10; tick++) {
        await Promise.resolve();
      }

      const reinjectPrompts = mockSessionManager.writeInput.mock.calls.filter(
        ([, input]) =>
          typeof input === 'string'
          && input.includes('Your very last line must be a valid handoff token')
      );

      expect(reinjectPrompts).toHaveLength(3);

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].status).toBe('done');
      expect(status.agentStates['node-b']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Test 8: Full E2E handoff lifecycle with echo marker timeout
  // Simulates the exact bug from live testing:
  //   1. node-a starts and produces output
  //   2. node-a emits __HANDOFF__:node-b:{...}
  //   3. Handoff fires → node-b spawned → context prompt injected
  //   4. _flushSwarmPrompt sets ignoreParserUntil on node-b
  //   5. Claude CLI does NOT echo the marker (ignoreParserUntil stays set)
  //   6. 10s timeout fires → ignoreParserUntil cleared
  //   7. node-b emits __DONE__ → execution completes
  //
  // Without the timeout fix, step 7 would never work because the parser
  // would be permanently blocked, and node-b would stay 'running' forever.
  // -------------------------------------------------------------------------
  describe('Test 8: Full E2E handoff lifecycle with echo marker timeout (deterministic)', () => {
    it('should complete a full 2-agent workflow when the echo marker is never observed', async () => {
      // Claude provider (default) — ignoreParserUntil is NOT set at spawn
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      // Get node-a's tap function
      const tapFnA = [...mockSession.swarmListeners].find(
        (listener) => listener === nodeAState.tapFn
      );
      expect(tapFnA).toBeDefined();

      // --- Phase 1: node-a works and emits handoff ---
      // Claude provider doesn't set ignoreParserUntil at spawn, but
      // _writeSwarmPrompt was called for initial prompt injection.
      // The promptReady fallback timer would have flushed it.
      // Advance past the promptReady fallback and echo marker timeout
      // so node-a's parser is clear.
      await vi.advanceTimersByTimeAsync(15000);

      // Simulate node-a producing work output and a handoff token
      tapFnA('Research complete. Handing off to writer.\n__HANDOFF__:node-b:{"summary":"project analysis","findings":"codebase is well structured"}');

      // Allow promises to settle
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // Verify handoff occurred
      let status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].status).toBe('done');
      expect(status.agentStates['node-a'].handoffCount).toBe(1);
      expect(status.agentStates['node-b']).toBeDefined();
      expect(status.agentStates['node-b'].status).toBe('running');
      expect(status.edgeCounters['edge-ab']).toBe(1);

      // Verify context was merged
      expect(execution.workflowContext.summary).toBe('project analysis');
      expect(execution.workflowContext.findings).toBe('codebase is well structured');

      // --- Phase 2: node-b's parser is blocked by ignoreParserUntil ---
      // _onHandoff → _writeSwarmPrompt → _flushSwarmPrompt set
      // ignoreParserUntil on node-b's state.
      const nodeBState = execution.agentStates.get('node-b');
      // After _flushSwarmPrompt, ignoreParserUntil should be set
      // (the promptReady fallback may have fired, which calls _flushSwarmPrompt)
      // Give the promptReady fallback time to fire
      await vi.advanceTimersByTimeAsync(3000);

      // At this point, either:
      // a) ignoreParserUntil is set (prompt was flushed), or
      // b) ignoreParserUntil was already cleared by timeout
      // Either way, we need to verify the parser works.
      // Force the scenario: set ignoreParserUntil manually to simulate
      // the exact bug condition (echo marker never arrives)
      nodeBState.ignoreParserUntil = '--- END SWARM INPUT ---';
      nodeBState.ignoreParserBuffer = '';
      if (nodeBState.echoMarkerTimer) {
        clearTimeout(nodeBState.echoMarkerTimer);
      }
      nodeBState.echoMarkerTimer = setTimeout(() => {
        if (nodeBState.ignoreParserUntil) {
          nodeBState.ignoreParserUntil = null;
          nodeBState.ignoreParserBuffer = '';
        }
        nodeBState.echoMarkerTimer = null;
      }, 10000);

      // Get node-b's tap function
      const nodeBSession = mockSessionManager.getSession(nodeBState.sessionId);
      const tapFnB = [...nodeBSession.swarmListeners].find(
        (listener) => listener === nodeBState.tapFn
      );
      expect(tapFnB).toBeDefined();

      // Simulate node-b output WHILE parser is blocked — this should be ignored
      tapFnB('Writing the summary report...\n__DONE__');

      // The __DONE__ should NOT have been detected (parser blocked)
      status = engine.getStatus(executionId);
      expect(status.agentStates['node-b'].status).toBe('running');
      expect(status.status).toBe('running');

      // --- Phase 3: Echo marker timeout fires → parser unblocked ---
      await vi.advanceTimersByTimeAsync(10001);

      // ignoreParserUntil should now be null
      expect(nodeBState.ignoreParserUntil).toBeNull();
      expect(nodeBState.echoMarkerTimer).toBeNull();

      // --- Phase 4: node-b emits __DONE__ AFTER parser is unblocked ---
      tapFnB('Report writing complete.\n__DONE__');

      // Allow promises to settle
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // node-b is terminal (no outgoing edges) → status should be 'done'
      status = engine.getStatus(executionId);
      expect(status.agentStates['node-b'].status).toBe('done');

      // Both agents are done → execution should be 'completed'
      expect(status.status).toBe('completed');

      // Verify WS events were broadcast
      const completedEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'execution_status' && ev.status === 'completed');
      expect(completedEvents.length).toBeGreaterThan(0);

      // Verify handoff events
      const handoffEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'handoff_started' || ev.type === 'handoff_completed');
      expect(handoffEvents.some((ev) => ev.type === 'handoff_started')).toBe(true);
      expect(handoffEvents.some((ev) => ev.type === 'handoff_completed')).toBe(true);
    });

    it('should complete the workflow directly when the echo marker DOES arrive (no timeout needed)', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      const tapFnA = [...mockSession.swarmListeners].find(
        (listener) => listener === nodeAState.tapFn
      );

      // Clear initial prompt gate
      await vi.advanceTimersByTimeAsync(15000);

      // Trigger handoff
      tapFnA('Done researching.\n__HANDOFF__:node-b:{"result":"ready"}');
      for (let i = 0; i < 10; i++) await Promise.resolve();

      const nodeBState = execution.agentStates.get('node-b');
      expect(nodeBState).toBeDefined();

      // Wait for promptReady fallback on node-b
      await vi.advanceTimersByTimeAsync(3000);

      // The parser should be in blocked state (ignoreParserUntil set by _flushSwarmPrompt)
      // Simulate the echo marker arriving (as it does with Codex)
      const nodeBSession = mockSessionManager.getSession(nodeBState.sessionId);
      const tapFnB = [...nodeBSession.swarmListeners].find(
        (listener) => listener === nodeBState.tapFn
      );

      // Force the blocked state
      nodeBState.ignoreParserUntil = '--- END SWARM INPUT ---';
      nodeBState.ignoreParserBuffer = '';

      // Send the marker — this should clear ignoreParserUntil immediately
      tapFnB('\n--- END SWARM INPUT ---');
      expect(nodeBState.ignoreParserUntil).toBeNull();

      // Now __DONE__ should work immediately (no timeout needed)
      tapFnB('Summary: project looks great.\n__DONE__');
      for (let i = 0; i < 10; i++) await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-b'].status).toBe('done');
      expect(status.status).toBe('completed');
    });
  });

  // -------------------------------------------------------------------------
  // BUG-GEMINI-2: Gemini prompt-ready detection patterns
  // -------------------------------------------------------------------------
  describe('_isRuntimePromptReady — Gemini patterns (BUG-GEMINI-2)', () => {
    it('should detect Gemini prompt-ready on "type your message"', () => {
      const result = engine._isRuntimePromptReady(
        '> Type your message or @path/to/file', 'gemini'
      );
      expect(result).toBe(true);
    });

    it('should detect Gemini prompt-ready on "? for shortcuts"', () => {
      const result = engine._isRuntimePromptReady(
        '? for shortcuts', 'gemini'
      );
      expect(result).toBe(true);
    });

    it('should NOT detect Gemini prompt-ready on random output', () => {
      const result = engine._isRuntimePromptReady(
        'some random output from gemini', 'gemini'
      );
      expect(result).toBe(false);
    });

    it('should NOT detect Gemini prompt-ready on old false pattern "esc to interrupt"', () => {
      const result = engine._isRuntimePromptReady(
        'esc to interrupt', 'gemini'
      );
      expect(result).toBe(false);
    });

    it('should still detect Codex prompt-ready on "esc to interrupt" (no regression)', () => {
      const result = engine._isRuntimePromptReady(
        'esc to interrupt', 'codex'
      );
      expect(result).toBe(true);
    });

    it('should still detect Codex prompt-ready on "workspace-write" (no regression)', () => {
      const result = engine._isRuntimePromptReady(
        'workspace-write', 'codex'
      );
      expect(result).toBe(true);
    });

    it('should still detect Claude prompt-ready patterns (no regression)', () => {
      const result = engine._isRuntimePromptReady(
        'bypass permissions on', 'claude'
      );
      expect(result).toBe(true);
    });

    it('should NOT detect Gemini prompt-ready during auth phase', () => {
      expect(engine._isRuntimePromptReady(
        'Waiting for authentication... (Press Esc or Ctrl+C to cancel)', 'gemini'
      )).toBe(false);
    });

    it('should NOT detect Gemini prompt-ready on geminicli-updates banner', () => {
      expect(engine._isRuntimePromptReady(
        'Read more: https://goo.gle/geminicli-updates', 'gemini'
      )).toBe(false);
    });
  });

  describe('_buildRuntimeProviderArgs — per-workflow model override (V4.1)', () => {
    it('should use default model when no runtimeModels provided', () => {
      const args = engine._buildRuntimeProviderArgs('codex', null);
      expect(args).toContain('-m');
      const mIdx = args.indexOf('-m');
      expect(args[mIdx + 1]).toBe('gpt-5.1-codex');
    });

    it('should override Codex model from runtimeModels', () => {
      const args = engine._buildRuntimeProviderArgs('codex', { codex: 'gpt-4.1-codex' });
      const mIdx = args.indexOf('-m');
      expect(mIdx).toBeGreaterThan(-1);
      expect(args[mIdx + 1]).toBe('gpt-4.1-codex');
    });

    it('should override Gemini model from runtimeModels', () => {
      const args = engine._buildRuntimeProviderArgs('gemini', { gemini: 'gemini-2.5-flash' });
      const mIdx = args.indexOf('-m');
      expect(mIdx).toBeGreaterThan(-1);
      expect(args[mIdx + 1]).toBe('gemini-2.5-flash');
    });

    it('should NOT add -m flag for Claude even with runtimeModels', () => {
      const args = engine._buildRuntimeProviderArgs('claude', { claude: 'some-model' });
      expect(args).not.toContain('-m');
    });

    it('should ignore empty string model override', () => {
      const args = engine._buildRuntimeProviderArgs('codex', { codex: '' });
      const mIdx = args.indexOf('-m');
      expect(args[mIdx + 1]).toBe('gpt-5.1-codex');
    });
  });
});
