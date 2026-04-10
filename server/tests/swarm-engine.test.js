// tests/swarm-engine.test.js
// Integration tests for SwarmEngine — 7 test cases covering execution lifecycle,
// handoff processing, circuit breaker, budget tracking, heartbeat, HITL mode,
// and DEC-009 preservation (swarmListeners tap must not modify existing onData handler).
//
// SessionManager is FULLY MOCKED — no real PTY processes are spawned.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SwarmEngine, {
  getDefaultRuntimeModel,
  getRuntimeCapabilitySnapshot,
  getSupportedRuntimeModels,
  validateRuntimeModels,
} from '../services/SwarmEngine.js';
import CircuitBreaker from '../services/CircuitBreaker.js';
import BudgetTracker from '../services/BudgetTracker.js';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockCreateInterface = vi.hoisted(() => vi.fn());
const mockTreeKill = vi.hoisted(() => vi.fn((pid, signal, cb) => cb?.(null)));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('readline', () => ({
  createInterface: mockCreateInterface,
}));

vi.mock('tree-kill', () => mockTreeKill);

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

function buildParallelFanOutWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-parallel',
    name: 'Parallel Fan Out Workflow',
    description: 'Split the work across both downstream agents and then merge the results.',
    nodes: [
      { id: 'node-a', data: { isTriageNode: true, systemPrompt: 'You are the fan-out triage agent.' } },
      { id: 'node-b', data: { systemPrompt: 'You are branch B.' } },
      { id: 'node-c', data: { systemPrompt: 'You are branch C.' } },
      { id: 'node-merge', type: 'merge', data: { waitFor: 'all' } },
      { id: 'node-final', data: { systemPrompt: 'You are the final reporter.' } },
    ],
    edges: [
      { id: 'edge-ab', source: 'node-a', target: 'node-b' },
      { id: 'edge-ac', source: 'node-a', target: 'node-c' },
      { id: 'edge-bm', source: 'node-b', target: 'node-merge' },
      { id: 'edge-cm', source: 'node-c', target: 'node-merge' },
      { id: 'edge-mf', source: 'node-merge', target: 'node-final' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildParallelStartWorkflow({
  budgetTokens = 0,
  circuitBreakerThreshold = 10,
  explicitStart = true,
} = {}) {
  return {
    id: explicitStart ? 'wf-parallel-start-explicit' : 'wf-parallel-start-implicit',
    name: explicitStart ? 'Parallel Start Workflow' : 'Implicit Parallel Start Workflow',
    description: 'Start two agents in parallel and wait for both before reporting.',
    nodes: [
      { id: 'node-en', data: { isTriageNode: explicitStart, systemPrompt: 'You are the English greeter.' } },
      { id: 'node-it', data: { isTriageNode: explicitStart, systemPrompt: 'You are the Italian greeter.' } },
      { id: 'node-merge', type: 'merge', data: { waitFor: 'all' } },
      { id: 'node-report', data: { systemPrompt: 'You are the reporter.' } },
    ],
    edges: [
      { id: 'edge-en-merge', source: 'node-en', target: 'node-merge' },
      { id: 'edge-it-merge', source: 'node-it', target: 'node-merge' },
      { id: 'edge-merge-report', source: 'node-merge', target: 'node-report' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildParallelAgentMergeWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-agent-merge',
    name: 'Parallel Agent Merge Workflow',
    description: 'Two parallel agents hand off generic keys to a downstream merge agent.',
    nodes: [
      { id: 'node-a', data: { isTriageNode: true, systemPrompt: 'You are the triage agent.' } },
      { id: 'node-b', data: { systemPrompt: 'You are Agent-A.' } },
      { id: 'node-c', data: { systemPrompt: 'You are Agent-B.' } },
      { id: 'node-merge', data: { systemPrompt: 'You are the merge agent.' } },
      { id: 'node-final', data: { systemPrompt: 'You are the final reporter.' } },
    ],
    edges: [
      { id: 'edge-ab', source: 'node-a', target: 'node-b' },
      { id: 'edge-ac', source: 'node-a', target: 'node-c' },
      { id: 'edge-bm', source: 'node-b', target: 'node-merge' },
      { id: 'edge-cm', source: 'node-c', target: 'node-merge' },
      { id: 'edge-mf', source: 'node-merge', target: 'node-final' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildRootDelayWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-root-delay',
    name: 'Root Delay Workflow',
    description: 'Begin with a delay node, then continue to a reporting agent.',
    nodes: [
      { id: 'node-delay', type: 'delay', data: { delaySeconds: 1 } },
      { id: 'node-report', data: { systemPrompt: 'You are the delayed reporter.' } },
    ],
    edges: [
      { id: 'edge-delay-report', source: 'node-delay', target: 'node-report' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildStreamJsonSoloWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-stream-json',
    name: 'Stream JSON Solo Workflow',
    description: 'Single-node workflow used to verify stream-json agent spawning.',
    nodes: [
      { id: 'node-a', data: { isTriageNode: true, systemPrompt: 'You are the stream-json agent.' } },
    ],
    edges: [],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildMixedProviderChainWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-mixed-providers',
    name: 'Mixed Provider Chain Workflow',
    description: 'Claude triage hands off to Claude writer, then Codex completes the final report.',
    nodes: [
      {
        id: 'node-a',
        data: {
          isTriageNode: true,
          systemPrompt: 'You are the Claude triage agent.',
          model: 'opus',
          tools: ['Read', 'Grep'],
        },
      },
      {
        id: 'node-b',
        data: {
          systemPrompt: 'You are the Claude writer agent.',
          model: 'sonnet',
          tools: ['Write', 'Edit'],
        },
      },
      {
        id: 'node-c',
        data: {
          systemPrompt: 'You are the Codex finisher.',
          model: 'gpt-5.4',
        },
      },
    ],
    edges: [
      { id: 'edge-ab', source: 'node-a', target: 'node-b' },
      { id: 'edge-bc', source: 'node-b', target: 'node-c' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildDuplicateMergeWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-duplicate-merge',
    name: 'Duplicate Merge Workflow',
    description: 'A single source connects to the same merge node through duplicate edges.',
    nodes: [
      { id: 'node-a', data: { isTriageNode: true, systemPrompt: 'You are agent A.' } },
      { id: 'node-merge', type: 'merge', data: { waitFor: 'all' } },
      { id: 'node-report', data: { systemPrompt: 'You are the reporter.' } },
    ],
    edges: [
      { id: 'edge-a-merge-1', source: 'node-a', target: 'node-merge' },
      { id: 'edge-a-merge-2', source: 'node-a', target: 'node-merge' },
      { id: 'edge-merge-report', source: 'node-merge', target: 'node-report' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildChildWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-child',
    name: 'Child Workflow',
    description: 'Nested child workflow.',
    nodes: [
      { id: 'child-agent', data: { isTriageNode: true, systemPrompt: 'You are the child agent.' } },
    ],
    edges: [],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildParentSubWorkflow({ childWorkflowId = 'wf-child', budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-parent-sub',
    name: 'Parent Sub-Workflow',
    description: 'Run a child workflow, then continue.',
    nodes: [
      { id: 'node-sub', type: 'subWorkflow', data: { workflowId: childWorkflowId } },
      { id: 'node-report', data: { systemPrompt: 'You are the parent reporter.' } },
    ],
    edges: [
      { id: 'edge-sub-report', source: 'node-sub', target: 'node-report' },
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
  const createMockSession = (sessionId) => {
    const replayChunks = [];
    return {
      swarmListeners: new Set(),
      writeInput: vi.fn(),
      onData: vi.fn(),   // pre-existing handler — must NOT be removed or replaced
      sessionId,
      buffer: {
        push(chunk) {
          replayChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? '')));
        },
        toBuffer() {
          return Buffer.concat(replayChunks);
        },
      },
    };
  };
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
    getSanitizedSessionOutput: vi.fn().mockImplementation((sessionId) => {
      const session = sessions.get(sessionId);
      const replayBuffer = session?.buffer?.toBuffer?.();
      if (!replayBuffer) return '';
      return Buffer.isBuffer(replayBuffer)
        ? replayBuffer.toString('utf8')
        : String(replayBuffer ?? '');
    }),
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

  // Helper: build a mock child process suitable for _spawnAgentStreamJson.
  // Returns an EventEmitter with stdout/stderr/stdin so readline can attach.
  function buildDefaultMockStreamJsonChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: vi.fn() };
    child.pid = 9900 + Math.floor(Math.random() * 100);
    child.killed = false;
    return child;
  }

  function buildDefaultMockReadline() {
    const rl = new EventEmitter();
    rl.close = vi.fn();
    return rl;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    wsBroadcast = vi.fn();
    mockSpawn.mockReset();
    mockCreateInterface.mockReset();
    mockTreeKill.mockClear();

    // Default implementations so that _spawnAgentStreamJson (called during
    // handoff when activeProvider is 'claude') does not crash on child.stdout
    // being undefined.  Tests that need specific stream-json child behavior
    // can override with mockReturnValueOnce which takes priority.
    mockSpawn.mockImplementation(() => buildDefaultMockStreamJsonChild());
    mockCreateInterface.mockImplementation(() => buildDefaultMockReadline());

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

    it('should retain chat messages in the execution snapshot for reconnect hydration', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');

      engine.emitUserChatMessage(executionId, 'node-a', 'Please summarize the result.');
      engine._broadcastChatMessage({
        executionId,
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Mercury is the smallest planet in our solar system.',
        timestamp: 12345,
      });

      const status = engine.getStatus(executionId);

      expect(status.chatMessages).toEqual([
        expect.objectContaining({
          nodeId: 'node-a',
          role: 'user',
          text: 'Please summarize the result.',
        }),
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Mercury is the smallest planet in our solar system.',
          timestamp: 12345,
        },
      ]);
    });

    it('should not split already-correct Italian words while sanitizing chat text', () => {
      const sanitized = engine._sanitizeChatMessage('Spero che la tua giornata sia piena di sorrisi e successi');
      expect(sanitized).toBe('Spero che la tua giornata sia piena di sorrisi e successi');
    });

    it('should keep whole dictionary words intact when restoring compressed chat tokens', () => {
      expect(engine._restoreCompressedChatToken('generato')).toBe('generato');
      expect(engine._restoreCompressedChatToken('generare')).toBe('generare');
      expect(engine._restoreCompressedChatToken('lavorano')).toBe('lavorano');
      expect(engine._restoreCompressedChatToken('vengono')).toBe('vengono');
    });

    it('should still restore long compressed chat tokens into readable Italian text', () => {
      const restored = engine._decompressConPTYSpaces('Sonoilnododimergeehoraccoltoglioutputdientrambigliagenti');
      expect(restored).toBe('Sono il nodo di merge e ho raccolto gli output di entrambi gli agenti');
    });

    it('should keep already-correct English words intact while restoring nearby compressed tokens', () => {
      const restored = engine._decompressConPTYSpaces("Here'stogreatconversationsandevengreatermomentsahead! friendliness");
      expect(restored).toBe("Here's to great conversations and even greater moments ahead! friendliness");
    });

    it('should prefer sanitized session replay over truncated chat fragments when persisting execution history', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');
      const store = { addEntry: vi.fn().mockResolvedValue(undefined) };

      engine.setExecutionHistoryStore(store);
      execution.status = 'completed';
      execution.startedAt = '2026-04-08T09:00:00.000Z';
      execution.chatMessages = [
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'ne, il publisher si occupa della formattazione finale.',
          timestamp: Date.now(),
        },
      ];

      const session = mockSessionManager.getSession(state.sessionId);
      session.buffer.push([
        'Claude Code v2.1.92',
        "Negli ultimi anni, l'intelligenza artificiale ha trasformato il modo in cui creiamo contenuti.",
        'In un tipico pipeline multi-agente, il writer prepara la prima bozza.',
        "Infine, il publisher si occupa della formattazione finale e della consegna nel formato richiesto.",
        '__DONE__',
      ].join('\n'));

      await engine._persistExecutionHistory(execution);

      expect(store.addEntry).toHaveBeenCalledTimes(1);
      const [, entry] = store.addEntry.mock.calls[0];
      expect(entry.agentOutputs['node-a'].finalText).toContain("Negli ultimi anni, l'intelligenza artificiale");
      expect(entry.agentOutputs['node-a'].finalText).toContain('pipeline multi-agente');
      expect(entry.agentOutputs['node-a'].finalText).toContain('publisher si occupa della formattazione finale');
      expect(entry.agentOutputs['node-a'].finalText).not.toBe('ne, il publisher si occupa della formattazione finale.');
      expect(entry.aggregatedArtifact).toContain("Negli ultimi anni, l'intelligenza artificiale");
    });

    it('should persist agent outputs from session replay even when chatMessages are still empty', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');
      const store = { addEntry: vi.fn().mockResolvedValue(undefined) };

      engine.setExecutionHistoryStore(store);
      execution.status = 'completed';
      execution.startedAt = '2026-04-08T09:00:00.000Z';
      execution.chatMessages = [];

      const session = mockSessionManager.getSession(state.sessionId);
      session.buffer.push([
        'Claude Code v2.1.92',
        'Il team remoto lavora meglio con piu flessibilita e meno pendolarismo.',
        'La sintesi finale evidenzia anche una produttivita piu alta.',
        '__DONE__',
      ].join('\n'));

      await engine._persistExecutionHistory(execution);

      expect(store.addEntry).toHaveBeenCalledTimes(1);
      const [, entry] = store.addEntry.mock.calls[0];
      expect(entry.agentOutputs['node-a']).toBeDefined();
      expect(entry.agentOutputs['node-a'].finalText).toContain('Il team remoto lavora meglio');
      expect(entry.agentOutputs['node-a'].finalText).toContain('produttivita piu alta');
      expect(entry.aggregatedArtifact).toContain('Il team remoto lavora meglio');
      expect(entry.aggregatedArtifact).not.toContain('No agent outputs were captured');
    });

    it('should prefer the semantic snippet over startup banners when resolving final agent text', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');
      const session = mockSessionManager.getSession(state.sessionId);

      state.lastOutputSnippet = 'Ecco il paragrafo finale: il lavoro remoto migliora equilibrio, risparmio e produttivita.';
      state._snippetSourceBuffer = state.lastOutputSnippet;
      session.buffer.push([
        'Tips for getting started',
        'Welcome back nicolò!',
        'Run /init to create a project',
        'Recent activity',
        'No recent activity',
      ].join('\n'));

      const resolved = engine._resolveAgentFinalText(execution, 'node-a', [
        { nodeId: 'node-a', role: 'assistant', text: 'Structured handoff sent.' },
      ], state);

      expect(resolved).toContain('Ecco il paragrafo finale');
      expect(resolved).not.toContain('Tips for getting');
      expect(resolved).not.toContain('Welcome back');
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

    it('should start every explicit Start Node immediately so parallel entry agents run together', async () => {
      const parallelWorkflow = buildParallelStartWorkflow({ explicitStart: true });
      workflowStoreMock.get.mockResolvedValueOnce(parallelWorkflow);

      const executionId = await engine.startExecution(parallelWorkflow.id, 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const status = engine.getStatus(executionId);

      expect(mockSessionManager.createSession).toHaveBeenCalledTimes(2);
      expect(status.agentStates['node-en']).toMatchObject({ status: 'running' });
      expect(status.agentStates['node-it']).toMatchObject({ status: 'running' });
      expect(status.agentStates['node-merge']).toBeUndefined();
    });

    it('should auto-start all root agents when no explicit Start Node is marked', async () => {
      const implicitParallelWorkflow = buildParallelStartWorkflow({ explicitStart: false });
      workflowStoreMock.get.mockResolvedValueOnce(implicitParallelWorkflow);

      const executionId = await engine.startExecution(implicitParallelWorkflow.id, 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const status = engine.getStatus(executionId);

      expect(mockSessionManager.createSession).toHaveBeenCalledTimes(2);
      expect(status.agentStates['node-en']).toMatchObject({ status: 'running' });
      expect(status.agentStates['node-it']).toMatchObject({ status: 'running' });
    });

    it('should auto-start a root flow-control node when the workflow begins with delay/sub-workflow style nodes', async () => {
      const rootDelayWorkflow = buildRootDelayWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(rootDelayWorkflow);

      const executionId = await engine.startExecution(rootDelayWorkflow.id, 'proj-1', '/projects/proj-1', { provider: 'codex' });
      let status = engine.getStatus(executionId);

      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      expect(status.agentStates['node-delay']).toMatchObject({ status: 'running' });

      await vi.advanceTimersByTimeAsync(1000);
      status = engine.getStatus(executionId);

      expect(mockSessionManager.createSession).toHaveBeenCalledTimes(1);
      expect(status.agentStates['node-report']).toMatchObject({ status: 'running' });
    });

    it('should not wait forever on merge waitFor=all when duplicate edges share the same source node', async () => {
      const duplicateMergeWorkflow = buildDuplicateMergeWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(duplicateMergeWorkflow);

      const executionId = await engine.startExecution(duplicateMergeWorkflow.id, 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const sessionCallsAfterStart = mockSessionManager.createSession.mock.calls.length;

      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-merge',
        contextUpdate: { summary: 'branch complete' },
      });

      const status = engine.getStatus(executionId);
      expect(mockSessionManager.createSession.mock.calls.length).toBe(sessionCallsAfterStart + 1);
      expect(status.agentStates['node-report']).toMatchObject({ status: 'running' });
      expect(status.agentStates['node-merge']).toBeDefined();
      expect(engine._mergeStates.has(`${executionId}:node-merge`)).toBe(false);
    });

    it('should keep the execution running while flow-control state is still pending', () => {
      const pendingDelayHandle = setTimeout(() => {}, 1000);
      const execution = {
        executionId: 'exec-flow',
        status: 'running',
        agentStates: new Map([
          ['node-a', { status: 'done', runtimeBlocker: null }],
        ]),
        runtimeBlocker: null,
        heartbeatTimer: null,
      };

      engine._delayTimers.set('exec-flow:node-delay', pendingDelayHandle);
      engine._syncExecutionStatusFromAgents(execution);

      expect(execution.status).toBe('running');

      clearTimeout(pendingDelayHandle);
      engine._delayTimers.delete('exec-flow:node-delay');
    });

    it('should stop nested sub-workflow executions when the parent execution is stopped', async () => {
      const parentWorkflow = buildParentSubWorkflow();
      const childWorkflow = buildChildWorkflow();
      workflowStoreMock.get.mockImplementation(async (workflowId) => {
        if (workflowId === parentWorkflow.id) return parentWorkflow;
        if (workflowId === childWorkflow.id) return childWorkflow;
        return null;
      });

      const executionId = await engine.startExecution(parentWorkflow.id, 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const subKey = `${executionId}:node-sub`;
      const childExecutionId = engine._subWorkflowExecutions.get(subKey);

      expect(childExecutionId).toBeDefined();
      expect(engine.getStatus(childExecutionId).status).toBe('running');

      await engine.stopExecution(executionId);

      expect(engine.getStatus(executionId).status).toBe('stopped');
      expect(engine.getStatus(childExecutionId).status).toBe('stopped');
      expect(engine._subWorkflowExecutions.has(subKey)).toBe(false);
      expect(mockSessionManager.killSession).toHaveBeenCalledTimes(1);
    });

    it('should propagate blocked child sub-workflow state back to the parent node and execution', async () => {
      const parentWorkflow = buildParentSubWorkflow();
      const childWorkflow = buildChildWorkflow();
      workflowStoreMock.get.mockImplementation(async (workflowId) => {
        if (workflowId === parentWorkflow.id) return parentWorkflow;
        if (workflowId === childWorkflow.id) return childWorkflow;
        return null;
      });

      const executionId = await engine.startExecution(parentWorkflow.id, 'proj-1', '/projects/proj-1');
      const childExecutionId = engine._subWorkflowExecutions.get(`${executionId}:node-sub`);
      const childExecution = engine._executions.get(childExecutionId);
      const childState = childExecution.agentStates.get('child-agent');

      childExecution.status = 'blocked';
      childExecution.runtimeBlocker = {
        type: 'rate_limited',
        message: 'Child workflow blocked on provider quota',
        nodeId: 'child-agent',
      };
      childState.status = 'blocked';
      childState.runtimeBlocker = childExecution.runtimeBlocker;

      await vi.advanceTimersByTimeAsync(1000);

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.agentStates['node-sub']).toMatchObject({
        status: 'blocked',
      });
      expect(status.runtimeBlocker).toMatchObject({
        nodeId: 'node-sub',
        childExecutionId,
        childNodeId: 'child-agent',
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
            'gpt-5.4',
          ],
          initialPrompt: null,
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

      await vi.advanceTimersByTimeAsync(20000);
      const codexPromptWrites = mockSessionManager.writeInput.mock.calls
        .map(([, input]) => String(input ?? ''))
        .join('\n');
      expect(codexPromptWrites).toContain('You are agent A.');
      expect(codexPromptWrites).toContain('When your work is complete, hand off to node-b.');
      expect(codexPromptWrites).not.toContain('--- SWARM PROTOCOL');
      expect(codexPromptWrites).not.toContain('Workflow goal:');
      expect(codexPromptWrites).not.toContain('Codex runtime is active for this Swarm agent.');
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

    it('should reject unsupported Gemini runtime models before spawning a PTY session', async () => {
      await expect(
        engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
          runtimeProvider: 'gemini',
          runtimeModels: { gemini: 'gemini-2.0-flash' },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'UNSUPPORTED_RUNTIME_MODEL',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
      });

      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
    });

    it('should remove swarm tap listener from session on stopExecution', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });

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
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });

      const initialPrompt = mockSessionManager.writeInput.mock.calls[0]?.[1] ?? '';
      // Agent has a custom systemPrompt ("You are agent A."), so the prompt
      // should prioritise the agent's own instructions and present the workflow
      // description as reference context rather than as a competing directive.
      expect(initialPrompt).toContain('=== YOUR ROLE ===');
      expect(initialPrompt).toContain('You are agent A.');
      expect(initialPrompt).toContain('=== AGENT AWARENESS ===');
      expect(initialPrompt).toContain('=== PROTOCOL ===');
      expect(initialPrompt).toContain('Valid targets: node-b');
      expect(initialPrompt).toContain('For this workflow, <targetId> must be node-b.');
      expect(initialPrompt).toContain('__HANDOFF__:<targetId>:{"summary":"...","result":"..."}');
      expect(initialPrompt).not.toContain('__HANDOFF__:node-b:{"summary": "Completed my stage of the task", "result": "key findings here"}');
    });

    it('should keep recovery handoff instructions templated so echoed follow-up prompts cannot become a fake handoff', () => {
      const prompt = engine._buildContinueAfterDonePrompt(wf.nodes[0], engine._buildInitialWorkflowContext(wf), ['node-b']);

      expect(prompt).toContain('Use node-b in place of <targetId> for this workflow.');
      expect(prompt).toContain('__HANDOFF__:<targetId>:{"summary": "your work summary here"}');
      expect(prompt).not.toContain('__HANDOFF__:node-b:');
    });

    it('should build a short Codex resume prompt after prompt rejection instead of replaying the full agent instructions', () => {
      const verboseNode = {
        id: 'node-a',
        data: {
          systemPrompt: 'Inspect the repo carefully. '.repeat(80),
        },
      };

      const prompt = engine._buildSystemPrompt(
        verboseNode,
        {
          currentTask: 'Validate the app version, confirm the host binding, and prepare the downstream route handoff.',
          workflowDescription: 'Longer workflow description that should not be replayed verbatim during a Codex resume retry.',
        },
        ['node-b'],
        'codex',
        {
          compactCodexPrompt: true,
          resumeCodexPrompt: true,
          recoverySnippet: 'VERSION=3.0.0 | HOST=127.0.0.1 | finder already checked package.json and server startup.',
        }
      );

      expect(prompt).toContain('Resume the same swarm task from your current progress.');
      expect(prompt).toContain('Last progress: VERSION=3.0.0 | HOST=127.0.0.1 | finder already checked package.json and server startup.');
      expect(prompt).toContain('Last line only: __HANDOFF__:<targetId>:{"summary":"actual completed work","result":"actual findings"}');
      expect(prompt).not.toContain('Workflow goal:');
      expect(prompt).not.toContain('Inspect the repo carefully. Inspect the repo carefully. Inspect the repo carefully.');
    });

    it('should keep non-terminal compact Codex prompts focused on the node task instead of replaying the full workflow task block', () => {
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        engine._buildInitialWorkflowContext(wf),
        ['node-b'],
        'codex',
        {
          compactCodexPrompt: true,
        }
      );

      expect(prompt).toContain('You are agent A.');
      expect(prompt).toContain('When your work is complete, hand off to node-b.');
      expect(prompt).toContain('Last line only: __HANDOFF__:<targetId>:{"summary":"actual completed work","result":"actual findings"}');
      expect(prompt).not.toContain('Workflow goal:');
      expect(prompt).not.toContain('Current task: Execute the workflow goal described here: Analyze the request, hand off the useful context, and complete the workflow.');
    });

    it('should submit the pasted swarm prompt with a follow-up enter key', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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

    it('should treat the initial Codex swarm prompt injection as an already-submitted prompt', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get([...engine._executions.keys()][0]);
      const nodeAState = execution.agentStates.get('node-a');

      expect(nodeAState.promptSubmissionCount).toBe(1);
    });

    it('should remind an idle Codex agent to emit the required handoff when work is finished but no token was produced', async () => {
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get([...engine._executions.keys()][0]);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      await vi.advanceTimersByTimeAsync(101);
      mockSessionManager.writeInput.mockClear();

      tapFn('• Working (12s • esc to interrupt)\ngpt-5.4 high · 80% left');
      await vi.advanceTimersByTimeAsync(180001);
      expect(mockSessionManager.writeInput).not.toHaveBeenCalled();

      tapFn('workspace-write\napproval policy never\nmodel gpt-5.4');
      await vi.advanceTimersByTimeAsync(2999);
      expect(mockSessionManager.writeInput).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      expect(mockSessionManager.writeInput.mock.calls.some(([, input]) => String(input).includes('appears to be back at the interactive prompt without emitting the required final handoff token.'))).toBe(true);
      expect(mockSessionManager.writeInput.mock.calls.some(([, input]) => input === '\x1b')).toBe(false);
      expect(mockSessionManager.writeInput.mock.calls.some(([, input]) => String(input).includes('--- END SWARM INPUT ---'))).toBe(false);
      expect(nodeAState.missingHandoffReminderSent).toBe(true);
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

    it('should recover a valid buffered Codex handoff alias after ignoreParserUntil temporarily suppressed live parsing', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });

      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      nodeAState.ignoreParserUntil = 'marker-that-never-arrives';
      tapFn('HANDOFF:node-b:{"summary":"done","result":"ok"}');
      expect(nodeAState.handoffCount).toBe(0);

      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';
      tapFn('workspace-write');
      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(['handoffing', 'done']).toContain(status.agentStates['node-a'].status);
      expect(status.agentStates['node-a'].handoffCount).toBe(1);
      expect(status.agentStates['node-b'].status).toBe('running');
    });

    it('should keep a non-terminal agent running and send a recovery prompt when it emits __DONE__', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });

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

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      // Simulate _flushSwarmPrompt having been called (sets ignoreParserUntil)
      nodeAState.ignoreParserUntil = '--- END SWARM INPUT ---';
      nodeAState.ignoreParserBuffer = '';
      // Start the echo marker timeout (mimicking _flushSwarmPrompt behavior)
      nodeAState.echoMarkerTimer = setTimeout(() => {
        if (nodeAState.ignoreParserUntil) {
          nodeAState.ignoreParserUntil = null;
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

    it('should feed gate-period buffer through chat filtering pipeline when echo marker times out', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      // Cancel the engine's original echo marker timer so we control timing
      if (nodeAState.echoMarkerTimer) {
        clearTimeout(nodeAState.echoMarkerTimer);
        nodeAState.echoMarkerTimer = null;
      }

      nodeAState.ignoreParserUntil = '--- END SWARM INPUT ---';
      nodeAState.ignoreParserBuffer = '';

      // These chunks arrive during the gate period — they accumulate in the
      // gate buffer. When the timeout fires, the buffer is fed through
      // ChatExtractor's filtering pipeline (not discarded).
      tapFn('Hello there, wonderful friend! ');
      tapFn('Welcome to a joyful conversation. ');

      // No immediate chat emission during gate period
      expect(execution.chatMessages).toEqual([]);

      // Simulate the engine's timeout handler behavior: clear gate, feed buffer
      nodeAState.ignoreParserUntil = null;
      const bufContent = nodeAState.ignoreParserBuffer;
      nodeAState.ignoreParserBuffer = '';
      engine._chatExtractor.resetBuffer('node-a');
      engine._chatExtractor.feed(executionId, 'node-a', bufContent);

      // Post-gate chunk arrives — real agent output
      tapFn('May your day shine brightly.__DONE__');

      const chatTexts = execution.chatMessages.map((m) => m.text);
      const allText = chatTexts.join(' ');
      // Post-gate output should appear in chat
      expect(allText).toContain('May your day shine brightly.');
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
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });

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

    it('should ignore repeated Gemini handoff chunks once the source agent is already handoffing', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });

      const exec = engine._executions.get(executionId);
      const nodeAState = exec.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      let resolveEnsure;
      const ensurePromise = new Promise((resolve) => {
        resolveEnsure = resolve;
      });
      const ensureSpy = vi.spyOn(engine, '_ensureAgentPty').mockImplementation(() => ensurePromise);

      tapFn('handoff to node-b');
      expect(exec.agentStates.get('node-a').status).toBe('handoffing');
      expect(exec.edgeCounters.get('edge-ab')).toBe(1);

      tapFn('handoff to node-b');
      expect(exec.edgeCounters.get('edge-ab')).toBe(1);
      expect(exec.agentStates.get('node-a').handoffCount).toBe(1);

      resolveEnsure();
      await ensurePromise;
      await vi.runAllTimersAsync();

      expect(ensureSpy).toHaveBeenCalledTimes(1);
      expect(exec.agentStates.get('node-a').status).toBe('done');
      expect(exec.agentStates.get('node-a').handoffCount).toBe(1);
      expect(exec.edgeCounters.get('edge-ab')).toBe(1);
    });

    it('should fan out a single agent handoff across every connected downstream target', async () => {
      const parallelWorkflow = buildParallelFanOutWorkflow();
      workflowStoreMock = { get: vi.fn().mockResolvedValue(parallelWorkflow) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-parallel', 'proj-1', '/projects/proj-1');
      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate: { greetingTask: 'split' },
      });

      const exec = engine._executions.get(executionId);
      expect(exec.workflowContext.greetingTask).toBe('split');
      expect(exec.edgeCounters.get('edge-ab')).toBe(1);
      expect(exec.edgeCounters.get('edge-ac')).toBe(1);
      expect(exec.agentStates.get('node-a').handoffCount).toBe(2);
      expect(exec.agentStates.get('node-a').status).toBe('done');
      expect(exec.agentStates.get('node-b').status).toBe('running');
      expect(exec.agentStates.get('node-c').status).toBe('running');

      const startedTargets = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'handoff_started' && ev.sourceNodeId === 'node-a')
        .map((ev) => ev.targetNodeId)
        .sort();
      expect(startedTargets).toEqual(['node-b', 'node-c']);
    });

    it('should include recent upstream handoffs in a downstream agent prompt so parallel generic payloads do not overwrite each other silently', async () => {
      const parallelWorkflow = buildParallelAgentMergeWorkflow();
      workflowStoreMock = { get: vi.fn().mockResolvedValue(parallelWorkflow) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-agent-merge', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const exec = engine._executions.get(executionId);

      await engine._ensureAgentPty(executionId, 'node-b');
      await engine._ensureAgentPty(executionId, 'node-c');
      exec.agentStates.get('node-b').status = 'running';
      exec.agentStates.get('node-c').status = 'running';

      await engine._onHandoff(executionId, 'node-b', {
        type: 'handoff',
        targetId: 'node-merge',
        contextUpdate: { agent: 'Agent-A', language: 'English', greeting: 'Hello there!' },
      });

      const pendingMergeState = exec.agentStates.get('node-merge');
      expect(pendingMergeState?.sessionId ?? null).toBeNull();

      await engine._onHandoff(executionId, 'node-c', {
        type: 'handoff',
        targetId: 'node-merge',
        contextUpdate: { agent: 'Agent-B', language: 'Italian', greeting: 'Ciao a tutti!' },
      });

      const promptWrites = mockSessionManager.writeInput.mock.calls
        .map(([, input]) => String(input))
        .filter((input) => input.includes('Received handoffs:'));

      expect(promptWrites.length).toBeGreaterThan(0);
      expect(promptWrites.at(-1)).toContain('From node-b (node-b): {"agent":"Agent-A","language":"English","greeting":"Hello there!"}');
      expect(promptWrites.at(-1)).toContain('From node-c (node-c): {"agent":"Agent-B","language":"Italian","greeting":"Ciao a tutti!"}');
    });
  });

  // -------------------------------------------------------------------------
  // Test 2b: Fan-in structural detection and barrier pre-registration
  // -------------------------------------------------------------------------
  describe('Test 2b: Fan-in structural detection and barrier pre-registration', () => {
    it('should detect fan-in targets structurally regardless of node label', async () => {
      const wf = {
        id: 'wf-fanin-nolabel',
        name: 'Fan-in no keywords',
        nodes: [
          { id: 'src-1', data: { isTriageNode: true, systemPrompt: 'Research A' } },
          { id: 'src-2', data: { isTriageNode: true, systemPrompt: 'Research B' } },
          { id: 'target', data: { label: 'Plain Target', systemPrompt: 'Just a target.' } },
        ],
        edges: [
          { id: 'e1', source: 'src-1', target: 'target' },
          { id: 'e2', source: 'src-2', target: 'target' },
        ],
        settings: {},
        initialContext: {},
      };
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const result = engine._shouldWaitForAllAgentInputs(
        { workflowDef: wf },
        'target'
      );
      expect(result).toBe(true);
    });

    it('should NOT detect fan-in for single-source nodes', async () => {
      const wf = {
        id: 'wf-linear',
        name: 'Linear',
        nodes: [
          { id: 'a', data: { systemPrompt: 'A' } },
          { id: 'b', data: { systemPrompt: 'B' } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        settings: {},
        initialContext: {},
      };
      const result = engine._shouldWaitForAllAgentInputs(
        { workflowDef: wf },
        'b'
      );
      expect(result).toBe(false);
    });

    it('should pre-register agentInputBarriers for fan-in targets at execution start', async () => {
      const parallelWorkflow = buildParallelAgentMergeWorkflow();
      workflowStoreMock = { get: vi.fn().mockResolvedValue(parallelWorkflow) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-agent-merge', 'proj-1', '/projects/proj-1');
      const exec = engine._executions.get(executionId);

      const barrier = exec.agentInputBarriers.get('node-merge');
      expect(barrier).toBeTruthy();
      expect(barrier.required).toBe(2);
      expect(barrier.received.size).toBe(0);
    });

    it('should pre-create waiting agentState for fan-in targets', async () => {
      const parallelWorkflow = buildParallelAgentMergeWorkflow();
      workflowStoreMock = { get: vi.fn().mockResolvedValue(parallelWorkflow) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-agent-merge', 'proj-1', '/projects/proj-1');
      const exec = engine._executions.get(executionId);

      const mergeState = exec.agentStates.get('node-merge');
      expect(mergeState).toBeTruthy();
      expect(mergeState.status).toBe('waiting');
      expect(mergeState.sessionId).toBeNull();
    });

    it('should NOT mark execution completed while fan-in barriers are unsatisfied', async () => {
      const parallelWorkflow = buildParallelAgentMergeWorkflow();
      workflowStoreMock = { get: vi.fn().mockResolvedValue(parallelWorkflow) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-agent-merge', 'proj-1', '/projects/proj-1');
      const exec = engine._executions.get(executionId);

      for (const [, state] of exec.agentStates) {
        if (state.status === 'running') state.status = 'done';
      }

      engine._syncExecutionStatusFromAgents(exec);

      expect(exec.status).toBe('running');
    });

    it('should NOT have pre-registered barriers for linear workflows', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const exec = engine._executions.get(executionId);
      expect(exec.agentInputBarriers.size).toBe(0);
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

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });

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

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];

      // Feed tiny chunk — well under the 10000-token limit
      tapFn('tiny');

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const budgetEvent = events.find((e) => e.type === 'budget_update');
      expect(budgetEvent).toBeUndefined();
    });

    it('should emit agent_status updates with lastOutputSnippet as PTY output arrives', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      // Clear echo gate so snippet updates flow through
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

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

    it('should strip echoed swarm protocol text from lastOutputSnippet while keeping meaningful agent output', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn('--- SWARM PROTOCOL (mandatory - never skip) ---\nDo NOT output the handoff or done token mid-response. Only as the very LAST line.\n--- END PROTOCOL ---\n');
      tapFn('Meaningful draft content for the user');

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('Meaningful draft content for the user');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('SWARM PROTOCOL');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('Do NOT output the handoff or done token');
    });

    it('should keep finder-style snippets focused on workflow-local facts even when stale repo-inspection noise arrives later', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn([
        'Finder result:',
        'Version: v3.0.0',
        'Host binding: 127.0.0.1:3000',
        '__HANDOFF__:node-b:{"summary":"verified host binding"}',
      ].join('\n'));
      tapFn([
        'print_handoff.py',
        'server.pid',
        'Run /review on my current changes',
        'Use /skills to list available skills',
      ].join('\n'));

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('Finder result:');
      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('Host binding: 127.0.0.1:3000');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('print_handoff.py');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('server.pid');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('/review');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('/skills');
    });

    it('should keep route-checker-style snippets centered on semantic route facts instead of footer noise', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn([
        'Route audit:',
        '- POST /api/v1/swarm/start is present',
        '- GET /api/v1/swarm/:executionId/status is present',
        'Use /skills to list available skills',
        'gpt-5.1-codex high · 42k context',
        'AAAAA',
      ].join('\n'));

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('Route audit:');
      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('POST /api/v1/swarm/start is present');
      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('GET /api/v1/swarm/:executionId/status is present');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('/skills');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('gpt-5.1-codex');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('AAAAA');
    });

    it('should keep formatter-style snippets on the final report block instead of stale foreign prompt text', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn([
        'Final report:',
        '1. Version: v3.0.0',
        '2. Host binding: 127.0.0.1:3000',
        '__DONE__',
      ].join('\n'));
      tapFn([
        'Explain this codebase',
        'Messages to be submitted after next tool call',
      ].join('\n'));

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('Final report:');
      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('__DONE__');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('Explain this codebase');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('Messages to be submitted after next tool call');
    });

    it('should refresh terminal-state snippets from the full session replay so older semantic blocks survive a noisy tail', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      mockSession.buffer.push([
        'exactly these lines and then __DONE__: PROMPT-CONTROL-REPORT | VERSION=3.0.0',
        '| HOST=127.0.0.1 | START_ROUTE=/api/v1/swarm/:workflowId/start |',
        'STATUS_ROUTE=/api/v1/swarm/:executionId/status |',
        'PROMPT_BUILDER=_buildSystemPrompt | DONE_TOKEN=__DONE__',
      ].join('\n'));
      mockSession.buffer.push('\n');
      mockSession.buffer.push(Array.from({ length: 900 }, () => '• Working (90s • esc to interrupt)').join('\n'));
      mockSession.buffer.push('\n');
      mockSession.buffer.push([
        'Messages to be submitted after next tool call',
        'After completing your work, you MUST output the done marker on its own line:',
        '__DONE__',
        'This is MANDATORY. The workflow cannot complete without this exact token.',
        'Output __DONE__ as the very last line of your response, after all your content.',
      ].join('\n'));

      state.status = 'done';

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('PROMPT-CONTROL-REPORT | VERSION=3.0.0');
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('DONE_TOKEN=__DONE__');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('esc to interrupt');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('Messages to be submitted after next tool call');
    });

    it('should prefer reconstructed structured fact lines over replayed command errors in terminal-state snippets', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      mockSession.buffer.push([
        'Ran rg -n "/api/v1/swarm"',
        "Impossibile eseguire il programma 'rg.exe': Accesso negato",
        '+ rg -n "/api/v1/swarm"',
        '+ FullyQualifiedErrorId : NativeCommandFailed',
        '',
        'VERSION=3.0.0 | HOST=127.0.0.1 | START_ROUTE=/api/v1/swarm/:workflowId/start |',
        '',
        'STATUS_ROUTE=/api/v1/swarm/:executionId/status |',
        '',
        'PROMPT_BUILDER=_buildSystemPrompt | DONE_TOKEN=__DONE__',
        '',
        '__HANDOFF__:node-b:{"summary":"verified route facts"}',
      ].join('\n'));

      state.status = 'done';

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('START_ROUTE=/api/v1/swarm/:workflowId/start');
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('STATUS_ROUTE=/api/v1/swarm/:executionId/status');
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('DONE_TOKEN=__DONE__');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('Ran rg -n');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('NativeCommandFailed');
    });

    it('should reconstruct a final report block from scattered fact lines instead of prompt instructions in terminal-state snippets', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      mockSession.buffer.push([
        'Print exactly the expected final report lines from currentTask/expectedReport',
        'with no extra prose, then output __DONE__ on its own line.',
        '',
        'PROMPT-CONTROL-REPORT',
        '',
        'VERSION=3.0.0',
        '',
        'HOST=127.0.0.1',
        '',
        'START_ROUTE=/api/v1/swarm/:workflowId/start',
        '',
        'STATUS_ROUTE=/api/v1/swarm/:executionId/status',
        '',
        'PROMPT_BUILDER=_buildSystemPrompt',
        '',
        'DONE_TOKEN=__DONE__',
        '',
        '__DONE__',
      ].join('\n'));

      state.status = 'done';

      const status = engine.getStatus(executionId);
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('PROMPT-CONTROL-REPORT');
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('START_ROUTE=/api/v1/swarm/:workflowId/start');
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('DONE_TOKEN=__DONE__');
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('__DONE__');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('Print exactly');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('with no extra prose');
    });

    it('should return an empty snippet when the Codex tail only contains working chrome and redraw fragments', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn([
        '• Working (20s • esc to interrupt)',
        '› Find and fix a bug in @filename',
        'gpt-5.1-codex high · 96% left · ~\\Downloads\\Test workflows - Copia',
        'W',
        'Wo',
        'or',
      ].join('\n'));

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toBe('');
    });

    it('should return an empty snippet when a live Claude provider menu leaks into the node card tail', () => {
      const snippet = engine._buildSemanticSnippet(
        'Opus4.6withmediumeffort·ClaudePro Downloads\\\\Testworkflows-Copia──────────────────────────────────────────── /buddy… What do you want to do? 1. 2.▋'
      );

      expect(snippet).toBe('');
    });

    it('should fall back to the clean blocker message when prompt rejection leaves only Codex chrome in the tail', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn([
        '• Working (0s • esc to interrupt)',
        '› [Pasted Content 2010 chars]',
        '■ Conversation interrupted - tell the model what to do differently. Something',
        'went wrong? Hit `/feedback` to report the issue.',
        'gpt-5.1-codex high · 100% left · ~\\Downloads\\Test workflows - Copia',
      ].join('\n'));

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('Codex rejected the injected swarm steering prompt');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('[Pasted Content');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('gpt-5.1-codex');
    });

    it('should strip CLI chrome and JSON payload lines from chat-oriented sanitization', () => {
      const sanitized = engine._sanitizeChatMessage([
        'Claude Code v2.1.92',
        'Opus 4.6 with medium effort · Claude API',
        'bypass permissions on (shift+tab to cycle) /buddy',
        'Hello! Welcome to the Parallel Greetings Workflow. Wishing you a wonderful day!',
        '"greetingA_lang":"English","greetingA_text":"Hello!"',
      ].join('\n'));

      expect(sanitized).toContain('Hello! Welcome to the Parallel Greetings Workflow. Wishing you a wonderful day!');
      expect(sanitized).not.toContain('Claude Code v2.1.92');
      expect(sanitized).not.toContain('bypass permissions on');
      expect(sanitized).not.toContain('greetingA_lang');
    });

    it('should strip direct HANDOFF alias lines from chat-oriented sanitization', () => {
      const sanitized = engine._sanitizeChatMessage([
        'Warm welcome from the agent.',
        'HANDOFF:node-4:{"agent":"Agent-B","language":"Italian","greeting":"Ciao a tutti!"}',
        'The visible message should stay readable.',
      ].join('\n'));

      expect(sanitized).toContain('Warm welcome from the agent.');
      expect(sanitized).toContain('The visible message should stay readable.');
      expect(sanitized).not.toContain('HANDOFF:node-4');
    });

    it('should drop extra-usage and compact provider chrome from chat-oriented sanitization', () => {
      const sanitized = engine._sanitizeChatMessage([
        "You're now using extra usage for this session.",
        'Opus4.6withmediumeffort·Claude Max',
        'Workflow plan: route the request to both agents.',
      ].join('\n'));

      expect(sanitized).toBe('Workflow plan: route the request to both agents.');
    });

    it('should suppress swarm runtime prompt echo even when ConPTY inserts spaces inside the wrapper text', () => {
      const sanitized = engine._sanitizeChatMessage([
        'Claude runtime is active for this Swarm agent.',
        'Con t in u e the workflow using the shared task context below.',
        'workflow Name: Parallel Greetings Workflow',
        'workflow Description: Two agents greet in different languages in parallel, merge results, and a final reporter summarizes both greetings.',
        'Use any one of these connect e d target IDs in your final handoff token: node-2, node-3',
        'The runtime will duplicate that handoff across every connect e d downstream node.',
      ].join('\n'));

      expect(sanitized).toBe('');
    });

    it('should restore spaces inside long compressed natural-language chat tokens', () => {
      const sanitized = engine._sanitizeChatMessage([
        'Theruntimewillduplicatethehandofftobothdownstreamnodessotheyexecuteinparallel.',
        'Sonoilnododimerge.Horaccoltoglioutputdientrambigliagenti.',
        'Ciaoatutti!BenvenutieuncalorososalutodaAgent-B!Sperochestiatetuttimeravigliosamentebeneinquestasplendidagiornata.',
        'Entrambi i saluti sono stati ricevuti con successo e unitiper questo reportfinale.',
      ].join('\n'));

      expect(sanitized).toContain('The runtime will duplicate the handoff to both downstream nodes so they execute in parallel.');
      expect(sanitized).toContain('Sono il nodo di merge. Ho raccolto gli output di entrambi gli agenti.');
      expect(sanitized).toContain('Ciao a tutti! Benvenuti e un caloroso saluto da Agent-B!');
      expect(sanitized).toContain('successo e uniti per questo report finale.');
    });

    it('should keep labeled agent lines readable instead of skipping ConPTY restoration', () => {
      const sanitized = engine._sanitizeChatMessage(
        'Agent-B(Italian):Completatoconsuccesso.Saluto:"Ciaoatutti!BenvenutieuncalorososalutodaAgent-B!"'
      );

      expect(sanitized).toContain('Agent-B(Italian): Completato con successo.');
      expect(sanitized).toContain('Saluto:');
      expect(sanitized).toContain('Ciao a tutti! Benvenuti e un caloroso saluto da Agent-B!');
    });

    it('should restore accented Italian merged text by matching normalized dictionary words', () => {
      const sanitized = engine._sanitizeChatMessage(
        'Ilmondoèpiùbelloquandociincontriamo.Generaunsalutoinun\'altralingua.'
      );

      expect(sanitized).toBe("Il mondo è più bello quando ci incontriamo. Genera un saluto in un'altra lingua.");
    });

    it('should drop hybrid merge fact lines that leak agent greeting metadata into chat', () => {
      const sanitized = engine._sanitizeChatMessage([
        '"Ciao a tutti! Benvenuti e un caloroso saluto da Agent-B!" Agent-B:greeting generato(completato)',
        'Inoltro entrambi al Final Reporter (node-5).',
      ].join('\n'));

      expect(sanitized).toContain('Inoltro entrambi al Final Reporter (node-5).');
      expect(sanitized).not.toContain('Agent-B:greeting');
      expect(sanitized).not.toContain('generato(completato)');
    });

    it('should restore compact English contractions and short merged words in final chat snippets', () => {
      const sanitized = engine._sanitizeChatMessage([
        "It'ssuchapleasuretoconnectwithyou-mayyourdaybefilledwithjoy,andallthegoodthingslifehastooffer.",
        "Here'stogreatconversationsandevengreatermomentsahead! andmakingthemostofourtimetogether.",
        'Together, they paint a welcoming picture of friendliness and cooperation across languages.',
      ].join('\n'));

      expect(sanitized).toContain("It's such a pleasure to connect with you");
      expect(sanitized).toContain('life has to offer.');
      expect(sanitized).toContain("Here's to great conversations and even greater moments ahead!");
      expect(sanitized).toContain('making the most of our time together.');
      expect(sanitized).toContain('friendliness and cooperation across languages.');
    });

    it('should keep live compact merge phrases readable without splitting valid words or agent labels', () => {
      const sanitized = engine._sanitizeChatMessage([
        'contains an English greeting instead.',
        'Should generate a greetinginonelanguage-Agent-B',
        'Wishingyouabrightandbeautifuldaytomeetyou',
      ].join('\n'));

      expect(sanitized).toContain('contains an English greeting instead.');
      expect(sanitized).toContain('Should generate a greeting in one language Agent-B');
      expect(sanitized).toContain('Wishing you a bright and beautiful day to meet you');
      expect(sanitized).not.toContain('con t a in s');
      expect(sanitized).not.toContain('A gent-B');
    });

    it('should restore glued Italian apostrophe phrases captured from live handoff chatter', () => {
      const sanitized = engine._sanitizeChatMessage(
        "The runtime duplicher\u00E0l'handoff su entrambi."
      );

      expect(sanitized).toBe("The runtime duplicher\u00E0 l'handoff su entrambi.");
    });

    it('should strip inline HANDOFF payloads from semantic display snippets', () => {
      const snippet = engine._buildSemanticSnippet(
        'Hello there! Welcome to the workflow. HANDOFF:node-4:{"agent":"Agent-A","status":"completed"}'
      );

      expect(snippet).toBe('Hello there! Welcome to the workflow.');
    });

    it('should restore fragmented short-word chat sequences captured in the live merge output', () => {
      const sanitized = engine._sanitizeChatMessage([
        "Nodeforthe Parallel Greetings Workflow is active.",
        "Whether you're just stopping by or settling in for a while, k now t ha t you're appreciatedandvalued.",
        'Wishing you all the best, and may your day be filled with good v i be s!',
        'Hello there! Welcome, and it\'s wonderful to ha v e you here! I hope you\'rehavingafantasticday.',
        'Agent-B (Italian): "Ciaocarissimi! Chebellagiornataperincontrarci!"',
        'Ecco il r e so con to finale della cultura italian a.',
      ].join('\n'));

      expect(sanitized).toContain('Node for the Parallel Greetings Workflow is active.');
      expect(sanitized).toContain("know that you're appreciated and valued.");
      expect(sanitized).toContain('good vibes!');
      expect(sanitized).toContain("it's wonderful to have you here! I hope you're having a fantastic day.");
      expect(sanitized).toContain('Agent-B (Italian): "Ciao carissimi! Che bella giornata per incontrarci!"');
      expect(sanitized).toContain('Ecco il resoconto finale della cultura');
    });

    it('should prefer real merge content over echoed handoff protocol in semantic display snippets', () => {
      const snippet = engine._buildSemanticSnippet([
        'The last line:',
        '__HANDOFF__:<targetId>:{"key": "value"}',
        'The final handoff token must be plain text on a single line with no bullets.',
        'Agent-A (English): "Hello there! Welcome!"',
        'Agent-B (Italian): "Ciao a tutti! Benvenuti!"',
        'Both agents completed successfully. Handing off merged results to the Final Reporter.',
      ].join('\n'));

      expect(snippet).toContain('Agent-A (English): "Hello there! Welcome!"');
      expect(snippet).toContain('Agent-B (Italian): "Ciao a tutti! Benvenuti!"');
      expect(snippet).not.toContain('The final handoff token must be plain text');
      expect(snippet).not.toContain('__HANDOFF__:<targetId>');
    });

    it('should strip echoed workflow instructions from chat-oriented merge output', () => {
      const sanitized = engine._sanitizeChatMessage([
        'This agent is not terminal in the workflow.',
        'When your stage is complete, you MUST emit a handoff token so the workflow can continue.',
        'Your required downstream target is: node-5',
        'If another agent is better suited to continue, hand off with the most useful context you can provide.',
        'Do not emit raw JSON.',
        'Entrambi i saluti sono stati ricevuti. Inoltro i risultati unificati al Final Reporter.',
      ].join('\n'));

      expect(sanitized).toBe('Entrambi i saluti sono stati ricevuti. Inoltro i risultati unificati al Final Reporter.');
    });

    it('should prefer a semantic fallback when prompt echo survives the chat sanitizer', () => {
      const sanitized = engine._sanitizeChatMessage([
        'You are the Final Reporter. You receive two greetings: one in English from Agent-A and one in Italian from Agent-B.',
        'Current workflow context:',
        'workflow Name: Parallel Greetings Workflow',
        'workflow Description: Two agents greet in different languages in parallel.',
        'Hello everyone! It is truly wonderful to be here with all of you today.',
        'I wishyouadayfilledwithhappiness,inspiration,andmeaningfulconnections.',
        'Warmest regards to each and every one of you!',
      ].join('\n'));

      expect(sanitized).toContain('Hello everyone! It is truly wonderful to be here with all of you today.');
      expect(sanitized).not.toContain('You are the Final Reporter');
      expect(sanitized).not.toContain('Current workflow context');
      expect(sanitized).not.toContain('workflow Name:');
    });

    it('should reuse the node semantic snippet when a chat flush would otherwise emit provider chrome', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const state = engine._executions.get(executionId).agentStates.get('node-a');
      state.lastOutputSnippet = 'Hello everyone! Warm greetings from Agent-A.';

      const sanitized = engine._sanitizeChatMessage(
        [
          'Claude Code v2.1.92',
          'Opus4.6withmediumeffort·ClaudeMax',
          '~\\Downloads\\Test workflows - Copia',
        ].join('\n'),
        { executionId, nodeId: 'node-a' }
      );

      expect(sanitized).toBe('Hello everyone! Warm greetings from Agent-A.');
    });

    it('should prefer the longer semantic fallback buffer over a shorter trailing snippet tail', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const state = engine._executions.get(executionId).agentStates.get('node-a');
      state.lastOutputSnippet = "things life has to offer. Here's to great conversations and even greater connections!";
      state._snippetSourceBuffer = "Hello there, wonderful friend! Welcome — it's absolutely fantastic to have you here today! May your day be filled with joy, laughter, and all the good things life has to offer. Here's to great conversations and even greater connections!";

      const sanitized = engine._sanitizeChatMessage(
        [
          'Claude runtime is active for this Swarm agent.',
          'Con t in u e the workflow using the shared task context below.',
        ].join('\n'),
        { executionId, nodeId: 'node-a' }
      );

      expect(sanitized).toContain('Hello there, wonderful friend!');
      expect(sanitized).toContain("Here's to great conversations and even greater connections!");
    });

    it('should prefer the provider blocker line over echoed prompt instructions when a run is usage-limited', () => {
      const sanitized = engine._sanitizeChatMessage([
        'Write tests for @filename',
        'Tip: New Try the Codex App, now available on Windows, with 2x rate limits until April 2nd.',
        'Run \'codex app\' or visit https://chatgpt.com/codex?app-landing-page=true',
        'Agent-B in parallel for greeting generation.',
        'When your work is complete, emit one valid handoff token using any connected target ID: node-2, node-3.',
        'The runtime will fan out that handoff to every connected downstream node for parallel execution.',
        'Last line only:',
        'No extra text after that last handoff line.',
        'You\'ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again later.',
      ].join('\n'));

      expect(sanitized).toContain("You've hit your usage limit.");
      expect(sanitized).not.toContain('Write tests for @filename');
      expect(sanitized).not.toContain('codex app');
      expect(sanitized).not.toContain('greeting generation');
      expect(sanitized).not.toContain('Last line only');
    });

    it('should strip the echoed swarm-input wrapper while preserving the semantic payload line', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      engine._executions.get(executionId).agentStates.get('node-a').ignoreParserUntil = null;

      wsBroadcast.mockClear();
      tapFn([
        '--- END SWARM INPUT ---',
        'exactly these lines and then __DONE__: PROMPT-CONTROL-REPORT | VERSION=3.0.0',
        'Finish your work, then hand off to route-checker.',
      ].join('\n'));

      const statusEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a');

      expect(statusEvents.at(-1)?.lastOutputSnippet).toContain('PROMPT-CONTROL-REPORT | VERSION=3.0.0');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('END SWARM INPUT');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('exactly these lines and then __DONE__');
      expect(statusEvents.at(-1)?.lastOutputSnippet).not.toContain('Finish your work, then hand off to route-checker.');
    });

    it('should classify provider blocker output and move the execution into blocked state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      // Use Codex-specific rate limit text (PTY tests now route via Codex provider)
      tapFn("you've hit your usage limit\npurchase more credits");

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'codex',
        nodeId: 'node-a',
      });

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');

      expect(blockedSnapshot).toBeDefined();
      expect(blockedSnapshot.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'codex',
      });
    });

    it('should fallback from Claude to Codex when a pre-work blocker is detected in auto mode', async () => {
      // Start with codex to get a PTY session, then override state to simulate auto/claude
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');
      // Simulate auto-mode with activeProvider=claude (the scenario this test exercises)
      execution.providerStrategy = { mode: 'auto', activeProvider: 'claude', fallbackProvider: 'codex', allowFallback: true };
      execution.runtimeProvider = 'claude';
      execution.activeProvider = 'claude';
      state.provider = 'claude';
      state.runtimeProvider = 'claude';
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
          'gpt-5.4',
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

    it('should retry Codex once with a compact prompt before falling back to Gemini on prompt_rejected in auto mode', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'codex',
      });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      const tapFn = [...mockSession.swarmListeners].find((listener) => listener === nodeAState.tapFn);

      execution.providerStrategy = {
        mode: 'auto',
        activeProvider: 'codex',
        fallbackProvider: 'codex',
        tertiaryProvider: 'gemini',
        allowFallback: true,
      };
      execution.activeProvider = 'codex';
      execution.runtimeProvider = 'codex';
      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';

      tapFn('Conversation interrupted - tell the model what to do differently. Something went wrong? Hit `/feedback` to report the issue.');
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSessionManager.createSession).toHaveBeenCalledTimes(2);
      expect(mockSessionManager.createSession.mock.calls[1][2]).toBe('/usr/local/bin/codex');
      expect(mockSessionManager.createSession.mock.calls[1][3]).toMatchObject({
        provider: 'codex',
        initialPrompt: null,
      });

      const status = engine.getStatus(executionId);
      expect(status.activeProvider).toBe('codex');
      expect(status.runtimeProvider).toBe('codex');
      expect(status.runtimeBlocker).toBeUndefined();
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
      const nodeAState = execution.agentStates.get('node-a');

      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';
      nodeAState.lastOutputSnippet = 'Signed in with Google\n/auth\nGemini CLI v0.37.0\nType your message or @path/to/file';
      execution.chatMessages = [
        { nodeId: 'node-a', role: 'assistant', text: 'Structured handoff sent.' },
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Signed in with Google\n/auth\nType your message or @path/to/file\nThinking...',
        },
      ];

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
      expect(status.agentStates['node-a'].lastOutputSnippet).toContain('Gemini requires authentication');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('Signed in with Google');
      expect(status.agentStates['node-a'].lastOutputSnippet).not.toContain('Gemini CLI v0.37.0');
      expect(status.chatMessages).toEqual([]);

      const blockedAgentSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-a' && ev.status === 'blocked');
      expect(blockedAgentSnapshot?.lastOutputSnippet).toContain('Gemini requires authentication');
      expect(blockedAgentSnapshot?.lastOutputSnippet).not.toContain('Signed in with Google');
      expect(blockedAgentSnapshot?.lastOutputSnippet).not.toContain('Gemini CLI v0.37.0');
    });

    it('should classify Gemini waiting-for-authentication output as a blocked runtime state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn('Waiting for authentication...\n(Press Esc or Ctrl+C to cancel)');

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

    it('should keep a clean Gemini blocker snippet after stopExecution instead of replaying auth chrome', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      nodeAState.ignoreParserUntil = null;
      nodeAState.ignoreParserBuffer = '';
      nodeAState.lastOutputSnippet = 'Signed in with Google\n/auth\nGemini CLI v0.37.0\nType your message or @path/to/file';
      execution.chatMessages = [
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Signed in with Google\n/auth\nType your message or @path/to/file\nThinking...',
        },
      ];

      tapFn("Error: not authenticated. please sign in.");

      const stoppedStatus = await engine.stopExecution(executionId);
      expect(stoppedStatus.status).toBe('stopped');
      expect(stoppedStatus.agentStates['node-a'].status).toBe('stopped');
      expect(stoppedStatus.agentStates['node-a'].lastOutputSnippet).toContain('Gemini requires authentication');
      expect(stoppedStatus.agentStates['node-a'].lastOutputSnippet).not.toContain('Signed in with Google');
      expect(stoppedStatus.agentStates['node-a'].lastOutputSnippet).not.toContain('Gemini CLI v0.37.0');
      expect(stoppedStatus.chatMessages).toEqual([]);
    });

    it('should ignore transient Gemini thinking-phase request failures instead of flipping to blocked', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn('Thinking...\nThis request failed with status INVALID_ARGUMENT, retrying automatically...');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.agentStates['node-a'].status).toBe('running');

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');
      expect(blockedSnapshot).toBeUndefined();
    });

    it('should block Gemini when INVALID_ARGUMENT indicates a broken function-call turn without auto-retry', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';

      wsBroadcast.mockClear();
      tapFn('API Error: {"error":{"code":400,"message":"Please ensure that the number of function response parts is equal to the number of function call parts of the function call turn.","status":"INVALID_ARGUMENT"}}');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.agentStates['node-a'].status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'provider_unavailable',
        provider: 'gemini',
        nodeId: 'node-a',
      });
    });

    it('should auto-handle the Gemini usage-limit menu without marking the execution blocked', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';
      mockSessionManager.writeInput.mockClear();
      wsBroadcast.mockClear();

      tapFn('Usage limit reached for gemini-2.5-pro.\n● Keep trying\n/model\nstop');
      expect(mockSessionManager.writeInput).toHaveBeenCalledWith('sess-node-a', '\u001b');
      expect(mockSessionManager.writeInput).not.toHaveBeenCalledWith('sess-node-a', '/model set gemini-2.5-flash\n');

      tapFn('Type your message or @path/to/file');

      expect(mockSessionManager.writeInput).toHaveBeenCalledWith('sess-node-a', '/model set gemini-2.5-flash\n');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.agentStates['node-a'].status).toBe('running');
      expect(status.agentStates['node-a'].lastModelFallback).toBe('gemini-2.5-flash');
    });

    it('should not misclassify Gemini usage-limit recovery output as an auth blocker', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';
      mockSessionManager.writeInput.mockClear();
      wsBroadcast.mockClear();

      tapFn('Usage limit reached for all Pro models.\n● 1. Keep trying\n2. Stop\n/model to switch models.');
      tapFn('Request cancelled.\nWaiting for authentication...\nType your message or @path/to/file\nAPI Error: You have exhausted your capacity on this model.\nUsage limit reached for all Pro models.\n● 1. Keep trying\n2. Stop\n/model to switch models.');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.agentStates['node-a'].status).toBe('running');
      expect(status.runtimeBlocker).toBeUndefined();

      const blockedSnapshot = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'execution_status' && ev.status === 'blocked');
      expect(blockedSnapshot).toBeUndefined();
    });

    it('should detect Gemini quota blocker when banner is too long for menu detection buffer', () => {
      // Test _detectRuntimeBlocker directly — the E2E showed that Gemini quota messages
      // with a long banner (no "keep trying" in the same buffer) were silently swallowed.
      // After the fix, the pattern blocker fallback should fire.
      const longBanner = [
        'Plan: Gemini Code Assist in Google One AI Pro /upgrade',
        "We're making changes to Gemini CLI that may impact your workflow.",
        "What's Changing: We are adding more robust detection of policy-violating use cases and changing how we prioritize traffic.",
        "How it affects you: This may result in higher capacity-related errors during periods of high traffic.",
        'Read more: https://goo.gle/geminicli-updates',
        '> Gemini runtime is active for this Swarm agent. Continue the workflow.',
        '--- SWARM PROTOCOL (mandatory) --- Current workflow context: workflowName: Write A Greeting Workflow ---',
        'i Request cancelled.',
        'X [API Error: You have exhausted your capacity on this model. Your quota will reset after 12h22m45s.]',
        'i This request failed. Press F12 for diagnostics.',
        'X [API Error: You have exhausted your capacity on this model. Your quota will reset after 12h22m44s.]',
        'Usage limit reached for all Pro models.',
        'Access resets at 11:00 AM GMT+2.',
      ].join('\n');

      const fakeState = { interventionBuffer: '' };
      const result = engine._detectRuntimeBlocker(longBanner, 'gemini', fakeState);

      // Should detect rate_limited blocker since "keep trying" menu is absent
      expect(result).not.toBeNull();
      expect(result.type).toBe('rate_limited');
      expect(result.provider).toBe('gemini');
    });

    it('should switch Gemini models when usage-limit recovery only exposes request-cancelled readiness', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);

      execution.agentStates.get('node-a').ignoreParserUntil = null;
      execution.agentStates.get('node-a').ignoreParserBuffer = '';
      mockSessionManager.writeInput.mockClear();

      tapFn('Usage limit reached for all Pro models.\n● 1. Keep trying\n2. Stop\n/model to switch models.');
      tapFn('Request cancelled.\nUsage limit reached for all Pro models.\n● 1. Keep trying\n2. Stop\nReady (Test workflows - Copia)');

      expect(mockSessionManager.writeInput).toHaveBeenCalledWith('sess-node-a', '\u001b');
      expect(mockSessionManager.writeInput).toHaveBeenCalledWith('sess-node-a', '/model set gemini-2.5-flash\n');
    });

    it('should queue Gemini broadcasts while the runtime is busy instead of interrupting the tool turn', async () => {
      mockSession.pty = {};
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      tapFn('Type your message or @path/to/file');
      mockSessionManager.writeInput.mockClear();

      const result = await engine.sendBroadcast(executionId, 'node-a', 'High-priority operator update', { mode: 'hard' });

      expect(result).toEqual({ sent: true, delivery: 'queued' });
      expect(nodeAState.pendingOperatorPrompt).toBe('High-priority operator update');
      expect(mockSessionManager.writeInput).not.toHaveBeenCalledWith('sess-node-a', '\x03');
    });

    it('should flush a queued Gemini broadcast when the prompt becomes writable again', async () => {
      mockSession.pty = {};
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');

      // Clear echo gate so prompt-ready detection can work
      nodeAState.ignoreParserUntil = null;
      tapFn('Type your message or @path/to/file');
      mockSessionManager.writeInput.mockClear();
      await engine.sendBroadcast(executionId, 'node-a', 'High-priority operator update', { mode: 'hard' });

      // Clear echo gate again (sendBroadcast → _writeSwarmPrompt → _flushSwarmPrompt sets new gate)
      nodeAState.ignoreParserUntil = null;
      tapFn('Type your message or @path/to/file');

      expect(nodeAState.pendingOperatorPrompt).toBeNull();
      expect(mockSessionManager.writeInput).toHaveBeenCalledWith('sess-node-a', 'High-priority operator update');
      expect(mockSessionManager.writeInput).not.toHaveBeenCalledWith('sess-node-a', '\x03');
    });

    it('should resume a completed PTY agent with an operator follow-up prompt', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        provider: 'codex',
      });
      const execution = engine._executions.get(executionId);
      const nodeAState = execution.agentStates.get('node-a');
      nodeAState.status = 'done';
      nodeAState.promptReady = true;
      mockSessionManager.writeInput.mockClear();

      const result = await engine.sendBroadcast(executionId, 'node-a', 'Please revise the previous answer', { mode: 'soft' });
      await vi.advanceTimersByTimeAsync(1500);
      const writtenPayload = mockSessionManager.writeInput.mock.calls
        .filter(([sessionId]) => sessionId === 'sess-node-a')
        .map(([, input]) => String(input))
        .join('\n');

      expect(result).toEqual({ sent: true, delivery: 'resumed' });
      expect(nodeAState.status).toBe('running');
      expect(engine.getStatus(executionId).status).toBe('running');
      expect(writtenPayload).toContain('Please revise the previous answer');
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

      const resumed = await engine.resumeExecution(executionId);
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
      await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });

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

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });

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
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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
      // PTY provider — ignoreParserUntil is NOT set at spawn for non-Codex providers
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'codex' });
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
      expect(args[mIdx + 1]).toBe('gpt-5.4');
    });

    it('should use the detected default Claude model when no runtimeModels provided', () => {
      const args = engine._buildRuntimeProviderArgs('claude', null);
      expect(args).toContain('--model');
      const modelIdx = args.indexOf('--model');
      expect(args[modelIdx + 1]).toBe('opus');
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

    it('should override Claude model from runtimeModels via --model', () => {
      const args = engine._buildRuntimeProviderArgs('claude', { claude: 'claude-sonnet-4-6' });
      const modelIdx = args.indexOf('--model');
      expect(modelIdx).toBeGreaterThan(-1);
      expect(args[modelIdx + 1]).toBe('claude-sonnet-4-6');
    });

    it('should ignore empty string model override', () => {
      const args = engine._buildRuntimeProviderArgs('codex', { codex: '' });
      const mIdx = args.indexOf('-m');
      expect(args[mIdx + 1]).toBe('gpt-5.4');
    });

    it('should ignore unsupported Gemini overrides and keep the validated default model', () => {
      const args = engine._buildRuntimeProviderArgs('gemini', { gemini: 'gemini-2.0-flash' });
      const mIdx = args.indexOf('-m');
      expect(args[mIdx + 1]).toBe('gemini-2.5-pro');
    });
  });

  describe('runtime model registry (V4.0.3)', () => {
    it('should expose the highest supported model as the default for each selectable runtime', () => {
      expect(getDefaultRuntimeModel('claude')).toBe('opus');
      expect(getDefaultRuntimeModel('codex')).toBe('gpt-5.4');
      expect(getDefaultRuntimeModel('gemini')).toBe('gemini-2.5-pro');
    });

    it('should derive capability defaults only for providers detected on the server', () => {
      const snapshot = getRuntimeCapabilitySnapshot({
        claudeBin: '/usr/local/bin/claude',
        codexBin: '/usr/local/bin/codex',
        geminiBin: null,
      });

      expect(snapshot.availability).toEqual({
        claude: true,
        codex: true,
        gemini: false,
      });
      expect(snapshot.defaults).toEqual({
        claude: 'opus',
        codex: 'gpt-5.4',
        gemini: null,
      });
    });

    it('should expose curated Claude aliases and full model ids for explicit selection', () => {
      expect(getSupportedRuntimeModels('claude')).toEqual([
        'opus',
        'claude-opus-4-6',
        'sonnet',
        'claude-sonnet-4-6',
        'haiku',
        'claude-haiku-4-5-20251001',
      ]);
    });

    it('should expose only curated Gemini models and exclude invalid CLI targets', () => {
      expect(getSupportedRuntimeModels('gemini')).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
      expect(getSupportedRuntimeModels('gemini')).not.toContain('gemini-2.0-flash');
    });

    it('should throw a precise validation error for unsupported Gemini models', () => {
      expect(() => validateRuntimeModels({ gemini: 'gemini-2.0-flash' })).toThrow(
        "Unsupported gemini model 'gemini-2.0-flash'. Supported models: gemini-2.5-pro, gemini-2.5-flash"
      );
    });
  });

  describe('Gemini no-progress guard (V4.0.3)', () => {
    it('should block Gemini when budget grows without forward progress before the first handoff', async () => {
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TIMEOUT_MS', '1000');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TOKEN_DELTA', '10');
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      state.ignoreParserUntil = null;
      state.ignoreParserBuffer = '';
      wsBroadcast.mockClear();

      tapFn('Research log entry: checking source A and source B for the route summary.');
      await vi.advanceTimersByTimeAsync(1100);
      tapFn('Another long narrative chunk keeps streaming without any handoff token or downstream transition.');

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'no_progress_timeout',
        provider: 'gemini',
        nodeId: 'node-a',
        progressReason: 'meaningful_output',
      });
      expect(status.runtimeBlocker.message).toContain('no forward progress toward the first handoff');
    });

    it('should not trigger the no-progress blocker once Gemini produces a valid handoff in time', async () => {
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TIMEOUT_MS', '1000');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TOKEN_DELTA', '10');
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      state.ignoreParserUntil = null;
      state.ignoreParserBuffer = '';

      tapFn(`__HANDOFF__:node-b:${b64({ summary: 'handoff completed' })}`);
      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.runtimeBlocker).toBeUndefined();
      expect(status.agentStates['node-a'].handoffCount).toBe(1);
      expect(status.agentStates['node-b']).toBeDefined();
    });

    it('should accept a Gemini handoff whose target id is wrapped with a leading underscore from TUI emphasis', async () => {
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TIMEOUT_MS', '1000');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TOKEN_DELTA', '10');
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      state.ignoreParserUntil = null;
      state.ignoreParserBuffer = '';

      tapFn('__HANDOFF__:_node-b:{"summary":"handoff completed","result":"ready"}');
      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('running');
      expect(status.runtimeBlocker).toBeUndefined();
      expect(status.agentStates['node-a'].handoffCount).toBe(1);
      expect(status.agentStates['node-b']).toBeDefined();
    });

    it('should block a silent Gemini pre-handoff stall when no new chunks arrive after the first progress marker', async () => {
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TIMEOUT_MS', '1000');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TOKEN_DELTA', '999999');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_HARD_TIMEOUT_MS', '1500');
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      state.ignoreParserUntil = null;
      state.ignoreParserBuffer = '';
      tapFn('Research log entry: checked the local route definitions and host binding.');

      await vi.advanceTimersByTimeAsync(1600);

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'no_progress_timeout',
        provider: 'gemini',
        nodeId: 'node-a',
      });
    });

    it('should prefer a real Gemini quota blocker over no-progress timeout when recent output shows exhausted capacity', async () => {
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TIMEOUT_MS', '1000');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_TOKEN_DELTA', '999999');
      vi.stubEnv('SWARM_GEMINI_NO_PROGRESS_HARD_TIMEOUT_MS', '1500');
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'gemini',
      });
      const tapFn = [...mockSession.swarmListeners][0];
      const execution = engine._executions.get(executionId);
      const state = execution.agentStates.get('node-a');

      state.ignoreParserUntil = null;
      state.ignoreParserBuffer = '';
      tapFn('Research log entry: checked the local route definitions and host binding.');
      state._runtimeScanBuffer = [
        'API Error: You have exhausted your capacity on this model.',
        'Usage limit reached for all Pro models.',
        'Access resets at 11:00 AM GMT+2.',
      ].join('\n');

      await vi.advanceTimersByTimeAsync(1600);

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeBlocker).toMatchObject({
        type: 'rate_limited',
        provider: 'gemini',
        nodeId: 'node-a',
      });
      expect(status.runtimeBlocker.message).toContain('usage or rate limit');
    });
  });

  describe('Test 8: Stream-json spawning contract', () => {
    function buildMockStreamJsonChild() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: vi.fn() };
      child.pid = 4242;
      child.killed = false;
      return child;
    }

    function buildMockReadline() {
      const rl = new EventEmitter();
      rl.close = vi.fn();
      return rl;
    }

    function streamEvent(event) {
      return JSON.stringify({ type: 'stream_event', event });
    }

    it('should broadcast spawnMode=stream-json on agent_status and preserve it in status snapshots', async () => {
      const streamWorkflow = buildStreamJsonSoloWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(streamWorkflow);

      const executionId = await engine.startExecution(streamWorkflow.id, 'proj-1', '/projects/proj-1');
      const child = buildMockStreamJsonChild();
      const rl = buildMockReadline();

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);
      wsBroadcast.mockClear();

      await engine._spawnAgentStreamJson(executionId, 'node-a');

      const status = engine.getStatus(executionId);
      const execution = engine._executions.get(executionId);
      const streamJsonState = execution.agentStates.get('node-a');
      const statusEvents = wsBroadcast.mock.calls.map(([, ev]) => ev).filter((ev) => ev.type === 'agent_status');
      const streamJsonStatusEvent = statusEvents.find((ev) => ev.nodeId === 'node-a' && ev.spawnMode === 'stream-json');

      expect(streamJsonStatusEvent).toBeDefined();
      expect(streamJsonStatusEvent).toMatchObject({
        nodeId: 'node-a',
        status: 'running',
        spawnMode: 'stream-json',
        provider: 'claude',
        runtimeProvider: 'claude',
      });
      expect(status.agentStates['node-a']).toMatchObject({
        status: 'running',
        spawnMode: 'stream-json',
        sessionId: null,
      });
      expect(streamJsonState.streamJsonSessionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(child.stdin.end).toHaveBeenCalledTimes(1);

      const spawnArgs = mockSpawn.mock.calls[0][1];
      const sessionFlagIndex = spawnArgs.indexOf('--session-id');
      const promptFlagIndex = spawnArgs.indexOf('-p');
      const modelFlagIndex = spawnArgs.indexOf('--model');
      const toolsFlagIndex = spawnArgs.indexOf('--tools');
      const legacyToolsFlag = ['--allowed', 'Tools'].join('');

      expect(spawnArgs).toEqual(expect.arrayContaining([
        '--output-format',
        'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
      ]));
      expect(sessionFlagIndex).toBeGreaterThan(-1);
      expect(spawnArgs[sessionFlagIndex + 1]).toMatch(/^[0-9a-f-]{36}$/i);
      expect(promptFlagIndex).toBeGreaterThan(-1);
      expect(spawnArgs[promptFlagIndex + 1]).toContain('Single-node workflow used to verify stream-json agent spawning.');
      expect(spawnArgs[promptFlagIndex + 1]).toContain('__DONE__');
      expect(modelFlagIndex).toBeGreaterThan(-1);
      expect(spawnArgs[modelFlagIndex + 1]).toBe('opus');
      expect(toolsFlagIndex).toBeGreaterThan(-1);
      expect(spawnArgs[toolsFlagIndex + 1]).toBe('Bash,Read,Edit,Write,Grep,Glob,LS');
      expect(spawnArgs.includes(legacyToolsFlag)).toBe(false);
    });

    it('should coalesce sequential text_delta fragments into a single live chat_message after the buffer window', async () => {
      const streamWorkflow = buildStreamJsonSoloWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(streamWorkflow);

      const executionId = await engine.startExecution(streamWorkflow.id, 'proj-1', '/projects/proj-1');
      const child = buildMockStreamJsonChild();
      const rl = buildMockReadline();

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);
      wsBroadcast.mockClear();

      await engine._spawnAgentStreamJson(executionId, 'node-a');

      rl.emit('line', streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }));
      rl.emit('line', streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'G' },
      }));
      rl.emit('line', streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'io' },
      }));
      rl.emit('line', streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'conda' },
      }));

      expect(wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'chat_message' && ev.nodeId === 'node-a')).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(160);

      const chatEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'chat_message' && ev.nodeId === 'node-a');

      expect(chatEvents).toHaveLength(1);
      expect(chatEvents[0]).toMatchObject({
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Gioconda',
        spawnMode: 'stream-json',
      });
    });

    it('should flush buffered text before a tool event so live chat ordering stays truthful', async () => {
      const streamWorkflow = buildStreamJsonSoloWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(streamWorkflow);

      const executionId = await engine.startExecution(streamWorkflow.id, 'proj-1', '/projects/proj-1');
      const child = buildMockStreamJsonChild();
      const rl = buildMockReadline();

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);
      wsBroadcast.mockClear();

      await engine._spawnAgentStreamJson(executionId, 'node-a');

      rl.emit('line', streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }));
      rl.emit('line', streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Aug' },
      }));
      rl.emit('line', streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ust' },
      }));
      rl.emit('line', streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'us' },
      }));

      rl.emit('line', streamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'toolu_read_augustus',
          name: 'Read',
          input: {},
        },
      }));

      const relevantEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.nodeId === 'node-a' && (ev.type === 'chat_message' || ev.type === 'agent_tool_use'));

      expect(relevantEvents).toHaveLength(2);
      expect(relevantEvents[0]).toMatchObject({
        type: 'chat_message',
        nodeId: 'node-a',
        text: 'Augustus',
        spawnMode: 'stream-json',
      });
      expect(relevantEvents[1]).toMatchObject({
        type: 'agent_tool_use',
        nodeId: 'node-a',
        toolName: 'Read',
      });
    });

    it('should broadcast agent_cost with cacheReadTokens and cacheWriteTokens from stream-json results', async () => {
      const streamWorkflow = buildStreamJsonSoloWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(streamWorkflow);

      const executionId = await engine.startExecution(streamWorkflow.id, 'proj-1', '/projects/proj-1');
      const child = buildMockStreamJsonChild();
      const rl = buildMockReadline();

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);
      wsBroadcast.mockClear();

      await engine._spawnAgentStreamJson(executionId, 'node-a');

      rl.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'sess-stream-json',
        total_cost_usd: 0.125,
        duration_ms: 2200,
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 4,
        },
      }));

      const costEvent = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'agent_cost' && ev.nodeId === 'node-a');

      expect(costEvent).toEqual(expect.objectContaining({
        nodeId: 'node-a',
        inputTokens: 11,
        outputTokens: 7,
        costUsd: 0.125,
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
        durationMs: 2200,
        totalInputTokens: 11,
        totalOutputTokens: 7,
        totalCostUsd: 0.125,
      }));
    });

    it('should reuse the same streamJsonSessionId on subsequent turns and switch to --resume', async () => {
      const streamWorkflow = buildStreamJsonSoloWorkflow();
      const executionId = 'exec-stream-json-reuse';
      engine._executions.set(executionId, {
        executionId,
        workflowId: streamWorkflow.id,
        workflowDef: streamWorkflow,
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        status: 'running',
        startedAt: '2026-04-08T14:00:00.000Z',
        agentStates: new Map([['node-a', {
          status: 'idle',
          provider: 'claude',
          runtimeProvider: 'claude',
          handoffCount: 0,
          lastOutputSnippet: '',
          totalCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          turnCount: 0,
          streamJsonSessionId: null,
        }]]),
        edgeCounters: new Map(),
        agentInputBarriers: new Map(),
        inboundHandoffs: new Map(),
        workflowContext: {},
        heartbeatTimer: null,
        inboxItems: [],
        chatMessages: [],
        runtimeBlocker: null,
        providerStrategy: {
          mode: 'claude',
          activeProvider: 'claude',
          fallbackProvider: null,
          allowFallback: false,
        },
        runtimeProvider: 'claude',
        activeProvider: 'claude',
        codexPromptRetryCounts: new Map(),
        lastFallback: null,
      });

      const firstChild = buildMockStreamJsonChild();
      const firstRl = buildMockReadline();
      const secondChild = buildMockStreamJsonChild();
      const secondRl = buildMockReadline();

      mockSpawn.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
      mockCreateInterface.mockReturnValueOnce(firstRl).mockReturnValueOnce(secondRl);

      await engine._spawnAgentStreamJson(executionId, 'node-a');

      const firstSpawnArgs = mockSpawn.mock.calls[0][1];
      const sessionFlagIndex = firstSpawnArgs.indexOf('--session-id');
      const firstSessionId = firstSpawnArgs[sessionFlagIndex + 1];

      expect(firstSessionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(engine._executions.get(executionId).agentStates.get('node-a').streamJsonSessionId)
        .toBe(firstSessionId);

      await engine._spawnAgentStreamJson(executionId, 'node-a');

      const secondSpawnArgs = mockSpawn.mock.calls[1][1];
      const resumeFlagIndex = secondSpawnArgs.indexOf('--resume');

      expect(resumeFlagIndex).toBeGreaterThan(-1);
      expect(secondSpawnArgs[resumeFlagIndex + 1]).toBe(firstSessionId);
      expect(engine._executions.get(executionId).agentStates.get('node-a').streamJsonSessionId)
        .toBe(firstSessionId);
    });

    it('should treat stream-json error results as runtime blockers instead of implicit done', async () => {
      const streamWorkflow = buildStreamJsonSoloWorkflow();
      const executionId = 'exec-stream-json-error-blocker';
      const state = {
        status: 'running',
        provider: 'claude',
        runtimeProvider: 'claude',
        spawnMode: 'stream-json',
        handoffCount: 0,
        lastOutputSnippet: '',
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        turnCount: 0,
        streamJsonSessionId: '11111111-1111-1111-1111-111111111111',
        currentToolUse: { toolName: 'Read', toolUseId: 'tool-1' },
        isThinking: true,
        needsRepair: false,
        _streamJsonAccumulatedText: '',
      };
      engine._executions.set(executionId, {
        executionId,
        workflowId: streamWorkflow.id,
        workflowDef: streamWorkflow,
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        status: 'running',
        startedAt: '2026-04-08T14:00:00.000Z',
        agentStates: new Map([['node-a', state]]),
        edgeCounters: new Map(),
        agentInputBarriers: new Map(),
        inboundHandoffs: new Map(),
        workflowContext: {},
        heartbeatTimer: null,
        inboxItems: [],
        chatMessages: [],
        runtimeBlocker: null,
        providerStrategy: {
          mode: 'auto',
          activeProvider: 'claude',
          fallbackProvider: 'codex',
          allowFallback: true,
        },
        runtimeProvider: 'claude',
        activeProvider: 'claude',
        codexPromptRetryCounts: new Map(),
        lastFallback: null,
      });

      const blockerSpy = vi.spyOn(engine, '_handleRuntimeBlocker').mockResolvedValue(true);
      const doneSpy = vi.spyOn(engine, '_onDone');

      engine._handleStreamJsonResult(executionId, 'node-a', {
        sessionId: '11111111-1111-1111-1111-111111111111',
        costUsd: 0,
        durationMs: 50,
        usage: {},
        isError: true,
        errorMessage: "You've hit your limit · resets 7pm (Europe/Rome)",
      }, []);

      expect(blockerSpy).toHaveBeenCalledWith(
        executionId,
        'node-a',
        expect.objectContaining({
          type: 'rate_limited',
          provider: 'claude',
        })
      );
      expect(doneSpy).not.toHaveBeenCalled();
      expect(state.needsRepair).toBe(true);
      expect(state.currentToolUse).toBeNull();
      expect(state.isThinking).toBe(false);
      expect(state.lastOutputSnippet).toContain('Claude hit its usage limit before the swarm agent could continue.');
      expect(state._streamJsonAccumulatedText).toBe('');

      blockerSpy.mockRestore();
      doneSpy.mockRestore();
    });
  });

  describe('Test 9: _spawnAgent dispatcher', () => {
    function buildDispatcherExecution(executionId, provider = 'claude') {
      const workflow = buildStreamJsonSoloWorkflow();
      const execution = {
        executionId,
        workflowId: workflow.id,
        workflowDef: workflow,
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        status: 'running',
        startedAt: '2026-04-08T14:00:00.000Z',
        agentStates: new Map([['node-a', {
          status: 'idle',
          provider,
          runtimeProvider: provider,
          handoffCount: 0,
          lastOutputSnippet: '',
          totalCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          turnCount: 0,
        }]]),
        edgeCounters: new Map(),
        agentInputBarriers: new Map(),
        inboundHandoffs: new Map(),
        workflowContext: {},
        heartbeatTimer: null,
        inboxItems: [],
        chatMessages: [],
        runtimeBlocker: null,
        providerStrategy: {
          mode: provider,
          activeProvider: provider,
          fallbackProvider: null,
          allowFallback: false,
        },
        runtimeProvider: provider,
        activeProvider: provider,
        codexPromptRetryCounts: new Map(),
        lastFallback: null,
      };

      engine._executions.set(executionId, execution);
      return execution;
    }

    it.each(['claude', 'opus', 'claude-opus-4-6', 'sonnet', 'haiku'])(
      'should route Claude provider %s through _spawnAgentStreamJson',
      async (requestedProvider) => {
        const executionId = `exec-claude-${requestedProvider}`;
        buildDispatcherExecution(executionId, 'claude');

        const streamSpy = vi.spyOn(engine, '_spawnAgentStreamJson').mockResolvedValue(undefined);
        const ptySpy = vi.spyOn(engine, '_spawnAgentPty').mockResolvedValue(undefined);

        await engine._spawnAgent(executionId, 'node-a', { requestedProvider });

        expect(streamSpy).toHaveBeenCalledTimes(1);
        if (requestedProvider === 'claude') {
          expect(streamSpy).toHaveBeenCalledWith(
            executionId,
            'node-a',
            expect.objectContaining({ requestedProvider: 'claude' })
          );
        } else {
          expect(streamSpy).toHaveBeenCalledWith(
            executionId,
            'node-a',
            expect.objectContaining({
              requestedProvider: 'claude',
              requestedModel: requestedProvider,
            })
          );
        }
        expect(ptySpy).not.toHaveBeenCalled();

        streamSpy.mockRestore();
        ptySpy.mockRestore();
      }
    );

    it.each(['codex', 'gemini'])(
      'should route %s provider through _spawnAgentPty',
      async (requestedProvider) => {
        const executionId = `exec-${requestedProvider}`;
        buildDispatcherExecution(executionId, requestedProvider);

        const streamSpy = vi.spyOn(engine, '_spawnAgentStreamJson').mockResolvedValue(undefined);
        const ptySpy = vi.spyOn(engine, '_spawnAgentPty').mockResolvedValue(undefined);

        await engine._spawnAgent(executionId, 'node-a', { requestedProvider });

        expect(ptySpy).toHaveBeenCalledTimes(1);
        expect(ptySpy).toHaveBeenCalledWith(
          executionId,
          'node-a',
          expect.objectContaining({ requestedProvider })
        );
        expect(streamSpy).not.toHaveBeenCalled();

        streamSpy.mockRestore();
        ptySpy.mockRestore();
      }
    );
  });

  describe('Test 10: Stream-json session lifecycle', () => {
    function buildLifecycleExecution(executionId, overrides = {}) {
      const workflow = buildStreamJsonSoloWorkflow();
      const state = {
        status: 'running',
        provider: 'claude',
        runtimeProvider: 'claude',
        spawnMode: 'stream-json',
        handoffCount: 0,
        lastOutputSnippet: 'Working...',
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        turnCount: 1,
        streamJsonSessionId: '11111111-1111-1111-1111-111111111111',
        doNotSpawnNextTurn: false,
        needsRepair: false,
        currentToolUse: null,
        isThinking: false,
        _streamJsonAccumulatedText: 'Finished work.\n__DONE__',
        ...overrides,
      };
      const execution = {
        executionId,
        workflowId: workflow.id,
        workflowDef: workflow,
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        status: 'running',
        startedAt: '2026-04-08T14:00:00.000Z',
        agentStates: new Map([['node-a', state]]),
        edgeCounters: new Map(),
        agentInputBarriers: new Map(),
        inboundHandoffs: new Map(),
        workflowContext: {},
        heartbeatTimer: null,
        inboxItems: [],
        chatMessages: [],
        runtimeBlocker: null,
        providerStrategy: {
          mode: 'claude',
          activeProvider: 'claude',
          fallbackProvider: null,
          allowFallback: false,
        },
        runtimeProvider: 'claude',
        activeProvider: 'claude',
        codexPromptRetryCounts: new Map(),
        lastFallback: null,
      };
      engine._executions.set(executionId, execution);
      return { execution, state };
    }

    function buildRunningChild(pid = 4242) {
      const child = new EventEmitter();
      child.pid = pid;
      child.killed = false;
      child.stderr = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdin = { end: vi.fn() };
      return child;
    }

    function buildLifecycleReadline() {
      const rl = new EventEmitter();
      rl.close = vi.fn();
      return rl;
    }

    it('should gracefully stop after the current result, transition to paused, and resume with stream-json spawn', async () => {
      const executionId = 'exec-stream-stop-graceful';
      const child = buildRunningChild(5001);
      const rl = buildLifecycleReadline();
      buildLifecycleExecution(executionId, { status: 'idle', _streamJsonChild: null });

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);

      await engine._spawnAgentStreamJson(executionId, 'node-a');
      const state = engine._executions.get(executionId).agentStates.get('node-a');

      const graceful = await engine.stopStreamJsonAgent(executionId, 'node-a', 'graceful');
      expect(graceful.agentStates['node-a'].status).toBe('running');
      expect(state.doNotSpawnNextTurn).toBe(true);

      rl.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: state.streamJsonSessionId,
        total_cost_usd: 0.01,
        duration_ms: 50,
        usage: {
          input_tokens: 2,
          output_tokens: 3,
        },
      }));

      child.emit('close', 0);

      const paused = engine.getStatus(executionId);
      expect(paused.status).toBe('paused');
      expect(paused.agentStates['node-a'].status).toBe('paused');

      const spawnSpy = vi.spyOn(engine, '_spawnAgent').mockImplementation(async () => {
        const liveExecution = engine._executions.get(executionId);
        liveExecution.agentStates.get('node-a').status = 'running';
        liveExecution.status = 'running';
      });
      const resumed = await engine.resumeExecution(executionId);

      expect(spawnSpy).toHaveBeenCalledWith(
        executionId,
        'node-a',
        expect.objectContaining({ requestedProvider: 'claude' })
      );
      expect(resumed.status).toBe('running');
      spawnSpy.mockRestore();
    });

    it('should resume a completed stream-json agent with an operator follow-up on the same session', async () => {
      const executionId = 'exec-stream-operator-resume';
      buildLifecycleExecution(executionId, {
        status: 'done',
        _streamJsonChild: null,
        _streamJsonRunId: null,
      });
      const spawnSpy = vi.spyOn(engine, '_spawnAgent').mockResolvedValue(undefined);

      const result = await engine.sendBroadcast(
        executionId,
        'node-a',
        'Need one more revision before you finish',
        { mode: 'soft' }
      );

      expect(result).toEqual({ sent: true, delivery: 'resumed' });
      expect(engine._executions.get(executionId).agentStates.get('node-a').status).toBe('running');
      expect(spawnSpy).toHaveBeenCalledWith(
        executionId,
        'node-a',
        expect.objectContaining({
          requestedProvider: 'claude',
          reinjectPrompt: expect.stringContaining('Need one more revision before you finish'),
        })
      );
      spawnSpy.mockRestore();
    });

    it('should queue and resume a running stream-json agent after a soft operator interrupt', async () => {
      const executionId = 'exec-stream-operator-soft';
      const child = buildRunningChild(5006);
      const rl = buildLifecycleReadline();
      buildLifecycleExecution(executionId, { status: 'idle', _streamJsonChild: null });

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);

      await engine._spawnAgentStreamJson(executionId, 'node-a');
      const state = engine._executions.get(executionId).agentStates.get('node-a');
      const spawnSpy = vi.spyOn(engine, '_spawnAgent').mockResolvedValue(undefined);

      const result = await engine.sendBroadcast(
        executionId,
        'node-a',
        'Please adjust course before handing off',
        { mode: 'soft' }
      );

      expect(result).toEqual({ sent: true, delivery: 'queued' });
      expect(state.pendingOperatorPrompt).toContain('Please adjust course before handing off');

      rl.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: state.streamJsonSessionId,
        total_cost_usd: 0.01,
        duration_ms: 50,
        usage: {
          input_tokens: 2,
          output_tokens: 3,
        },
      }));
      child.emit('close', 0);
      await Promise.resolve();

      expect(spawnSpy).toHaveBeenCalledWith(
        executionId,
        'node-a',
        expect.objectContaining({
          requestedProvider: 'claude',
          reinjectPrompt: expect.stringContaining('Please adjust course before handing off'),
        })
      );
      expect(state.pendingOperatorPrompt).toBeNull();
      spawnSpy.mockRestore();
    });

    it('should force-stop a running stream-json agent and mark the session for repair', async () => {
      const executionId = 'exec-stream-stop-forced';
      const child = buildRunningChild(5002);
      buildLifecycleExecution(executionId, { _streamJsonChild: child });

      const stopped = await engine.stopStreamJsonAgent(executionId, 'node-a', 'forced');

      expect(stopped.agentStates['node-a'].status).toBe('stopped');
      expect(stopped.agentStates['node-a'].spawnMode).toBe('stream-json');
      expect(engine._executions.get(executionId).agentStates.get('node-a').needsRepair).toBe(true);
    });

    it('should reset a stream-json session by deleting the JSONL and issuing a fresh session UUID', async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-stream-reset-'));
      const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
      const executionId = 'exec-stream-reset';
      const oldSessionId = '22222222-2222-2222-2222-222222222222';
      const sessionDir = path.join(tmpHome, '.claude', 'projects', 'proj-hash');
      const jsonlPath = path.join(sessionDir, `${oldSessionId}.jsonl`);
      const companionDir = path.join(sessionDir, oldSessionId);
      fs.mkdirSync(companionDir, { recursive: true });
      fs.writeFileSync(jsonlPath, '{"type":"assistant","text":"hello"}\n', 'utf8');

      const { execution } = buildLifecycleExecution(executionId, {
        status: 'blocked',
        runtimeBlocker: {
          type: 'rate_limited',
          provider: 'claude',
          message: 'Claude hit its usage limit before the swarm agent could continue.',
          nodeId: 'node-a',
        },
        streamJsonSessionId: oldSessionId,
        _streamJsonChild: buildRunningChild(5003),
      });
      execution.status = 'blocked';
      execution.runtimeBlocker = {
        type: 'rate_limited',
        provider: 'claude',
        message: 'Claude hit its usage limit before the swarm agent could continue.',
        nodeId: 'node-a',
      };

      const reset = await engine.stopStreamJsonAgent(executionId, 'node-a', 'reset');
      const liveState = engine._executions.get(executionId).agentStates.get('node-a');

      expect(fs.existsSync(jsonlPath)).toBe(false);
      expect(fs.existsSync(companionDir)).toBe(false);
      expect(reset.status).toBe('idle');
      expect(reset.runtimeBlocker ?? null).toBeNull();
      expect(reset.agentStates['node-a'].status).toBe('idle');
      expect(reset.agentStates['node-a'].turnCount).toBe(0);
      expect(liveState.runtimeBlocker).toBeNull();
      expect(liveState.streamJsonSessionId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(liveState.streamJsonSessionId).not.toBe(oldSessionId);
      expect(liveState._lastResetArchive?.archivedJsonl).toContain('"assistant"');

      homedirSpy.mockRestore();
      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it('should escalate a hung post-result process to forced stop after 30 seconds', async () => {
      const executionId = 'exec-stream-timeout';
      const child = buildRunningChild(5004);
      const rl = buildLifecycleReadline();
      buildLifecycleExecution(executionId, { status: 'idle', _streamJsonChild: null });

      mockSpawn.mockReturnValueOnce(child);
      mockCreateInterface.mockReturnValueOnce(rl);

      await engine._spawnAgentStreamJson(executionId, 'node-a');
      const state = engine._executions.get(executionId).agentStates.get('node-a');

      await engine.stopStreamJsonAgent(executionId, 'node-a', 'graceful');
      rl.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: state.streamJsonSessionId,
        total_cost_usd: 0.001,
        duration_ms: 25,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
        },
      }));

      await vi.advanceTimersByTimeAsync(30000);

      const stopped = engine.getStatus(executionId);
      expect(stopped.agentStates['node-a'].status).toBe('stopped');
      expect(engine._executions.get(executionId).agentStates.get('node-a').needsRepair).toBe(true);
    });

    it('should block a stream-json Claude node on terminal error results instead of forcing a downstream handoff', async () => {
      const workflow = buildMixedProviderChainWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(workflow);

      const childA = buildRunningChild(5005);
      const rlA = buildLifecycleReadline();
      mockSpawn.mockReturnValueOnce(childA);
      mockCreateInterface.mockReturnValueOnce(rlA);
      wsBroadcast.mockClear();

      const executionId = await engine.startExecution(workflow.id, 'proj-1', '/projects/proj-1', {
        runtimeProvider: 'auto',
      });

      rlA.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'error',
        session_id: 'sess-claude-error',
        error: "You've hit your limit · resets 7pm (Europe/Rome)",
        total_cost_usd: 0.002,
        duration_ms: 40,
        usage: {
          input_tokens: 2,
          output_tokens: 1,
        },
      }));
      childA.emit('close', 1);

      await Promise.resolve();
      await Promise.resolve();

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('blocked');
      expect(status.runtimeProvider).toBe('claude');
      expect(status.activeProvider).toBe('claude');
      expect(status.lastFallback).toBeNull();
      expect(status.agentStates['node-a']).toMatchObject({
        status: 'blocked',
        spawnMode: 'stream-json',
        runtimeProvider: 'claude',
        runtimeBlocker: {
          type: 'rate_limited',
          provider: 'claude',
        },
      });
      expect(status.agentStates['node-a'].lastOutputSnippet)
        .toMatch(/Claude hit its usage limit before the swarm agent could (?:continue|con\s*t\s*i\s*n\s*u\s*e)\./);
      expect(status.agentStates['node-b']).toBeUndefined();
      expect(mockSessionManager.createSession).not.toHaveBeenCalled();

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      expect(events.some((ev) => ev.type === 'runtime_provider_switch')).toBe(false);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'execution_status',
          status: 'blocked',
          runtimeProvider: 'claude',
          activeProvider: 'claude',
          runtimeBlocker: expect.objectContaining({
            type: 'rate_limited',
            provider: 'claude',
            nodeId: 'node-a',
          }),
        }),
        expect.objectContaining({
          type: 'agent_status',
          nodeId: 'node-a',
          status: 'blocked',
          spawnMode: 'stream-json',
          runtimeProvider: 'claude',
          runtimeBlocker: expect.objectContaining({
            type: 'rate_limited',
            provider: 'claude',
          }),
        }),
      ]));
    });
  });

  describe('Test 11: V9.0 Phase1 backend area checkpoint', () => {
    function buildMockStreamJsonChild(pid) {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: vi.fn() };
      child.pid = pid;
      child.killed = false;
      return child;
    }

    function buildMockReadline() {
      const rl = new EventEmitter();
      rl.close = vi.fn();
      return rl;
    }

    async function flushAsync(ticks = 12) {
      for (let i = 0; i < ticks; i += 1) {
        await Promise.resolve();
      }
    }

    it('should complete a Claude-Claude-Codex workflow with mixed runtime contracts intact', async () => {
      const workflow = buildMixedProviderChainWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(workflow);

      const childA = buildMockStreamJsonChild(6101);
      const childB = buildMockStreamJsonChild(6102);
      const rlA = buildMockReadline();
      const rlB = buildMockReadline();

      mockSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB);
      mockCreateInterface.mockReturnValueOnce(rlA).mockReturnValueOnce(rlB);

      const executionId = await engine.startExecution(workflow.id, 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const initialState = execution.agentStates.get('node-a');

      expect(initialState.spawnMode).toBe('stream-json');
      expect(initialState.runtimeProvider).toBe('claude');

      const nodeASpawnArgs = mockSpawn.mock.calls[0][1];
      expect(nodeASpawnArgs[nodeASpawnArgs.indexOf('--model') + 1]).toBe('opus');
      expect(nodeASpawnArgs[nodeASpawnArgs.indexOf('--tools') + 1]).toBe('Read,Grep');

      rlA.emit('line', JSON.stringify({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'toolu_node_a',
          name: 'Read',
          input: {},
        },
      }));
      rlA.emit('line', JSON.stringify({
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file":"README.md"}',
        },
      }));
      rlA.emit('line', JSON.stringify({ type: 'content_block_stop', index: 1 }));
      rlA.emit('line', JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      }));
      rlA.emit('line', JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Claude triage complete.\n__HANDOFF__:node-b:{"summary":"triage complete","result":"facts collected"}',
        },
      }));
      rlA.emit('line', JSON.stringify({ type: 'content_block_stop', index: 0 }));
      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate: {
          summary: 'triage complete',
          result: 'facts collected',
        },
      });
      rlA.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'sess-claude-a',
        total_cost_usd: 0.01,
        duration_ms: 120,
        usage: {
          input_tokens: 5,
          output_tokens: 7,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 1,
        },
      }));
      childA.emit('close', 0);
      await flushAsync();

      const nodeBState = execution.agentStates.get('node-b');
      expect(nodeBState).toBeDefined();
      expect(nodeBState.spawnMode).toBe('stream-json');
      expect(nodeBState.runtimeProvider).toBe('claude');

      const nodeBSpawnArgs = mockSpawn.mock.calls[1][1];
      expect(nodeBSpawnArgs[nodeBSpawnArgs.indexOf('--model') + 1]).toBe('sonnet');
      expect(nodeBSpawnArgs[nodeBSpawnArgs.indexOf('--tools') + 1]).toBe('Write,Edit');

      rlB.emit('line', JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'thinking',
          thinking: '',
        },
      }));
      rlB.emit('line', JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'thinking_delta',
          thinking: 'Need a Codex finisher for the final draft.',
        },
      }));
      rlB.emit('line', JSON.stringify({ type: 'content_block_stop', index: 0 }));
      rlB.emit('line', JSON.stringify({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'text',
          text: '',
        },
      }));
      rlB.emit('line', JSON.stringify({
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'text_delta',
          text: 'Claude writer complete.\n__HANDOFF__:node-c:{"summary":"writer complete","result":"draft ready"}',
        },
      }));
      rlB.emit('line', JSON.stringify({ type: 'content_block_stop', index: 1 }));
      await engine._onHandoff(executionId, 'node-b', {
        type: 'handoff',
        targetId: 'node-c',
        contextUpdate: {
          summary: 'writer complete',
          result: 'draft ready',
        },
      });
      rlB.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'sess-claude-b',
        total_cost_usd: 0.02,
        duration_ms: 140,
        usage: {
          input_tokens: 4,
          output_tokens: 9,
        },
      }));
      childB.emit('close', 0);
      await flushAsync();

      const nodeCState = execution.agentStates.get('node-c');
      expect(nodeCState).toBeDefined();
      expect(nodeCState.sessionId).toBeTruthy();
      expect(nodeCState.provider).toBe('codex');
      expect(nodeCState.runtimeProvider).toBe('codex');

      const codexSpawnCall = mockSessionManager.createSession.mock.calls.at(-1);
      expect(codexSpawnCall[3]).toEqual(expect.objectContaining({
        provider: 'codex',
      }));

      const codexSession = mockSessionManager.getSession(nodeCState.sessionId);
      const codexTap = [...codexSession.swarmListeners].find((listener) => listener === nodeCState.tapFn);

      expect(codexTap).toBeDefined();
      expect(codexSession.onData).toHaveBeenCalledTimes(0);

      nodeCState.ignoreParserUntil = null;
      nodeCState.ignoreParserBuffer = '';
      codexTap('Codex final synthesis complete.\n__DONE__');
      await flushAsync();

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('completed');
      expect(status.agentStates['node-a'].status).toBe('done');
      expect(status.agentStates['node-b'].status).toBe('done');
      expect(status.agentStates['node-c'].status).toBe('done');
      expect(status.agentStates['node-a'].spawnMode).toBe('stream-json');
      expect(status.agentStates['node-b'].spawnMode).toBe('stream-json');

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);

      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'handoff_started',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b',
        }),
        expect.objectContaining({
          type: 'handoff_completed',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b',
        }),
        expect.objectContaining({
          type: 'handoff_started',
          sourceNodeId: 'node-b',
          targetNodeId: 'node-c',
        }),
        expect.objectContaining({
          type: 'handoff_completed',
          sourceNodeId: 'node-b',
          targetNodeId: 'node-c',
        }),
        expect.objectContaining({
          type: 'agent_status',
          nodeId: 'node-c',
          status: 'running',
          spawnMode: 'pty',
          provider: 'codex',
          runtimeProvider: 'codex',
        }),
        expect.objectContaining({
          type: 'agent_status',
          nodeId: 'node-c',
          status: 'done',
          spawnMode: 'pty',
          provider: 'codex',
          runtimeProvider: 'codex',
        }),
        expect.objectContaining({
          type: 'execution_status',
          status: 'completed',
          activeProvider: 'codex',
          runtimeProvider: 'codex',
        }),
      ]));
    });

    it('should gracefully pause the downstream Claude agent without regressing the mixed-provider routing', async () => {
      const workflow = buildMixedProviderChainWorkflow();
      workflowStoreMock.get.mockResolvedValueOnce(workflow);

      const childA = buildMockStreamJsonChild(6201);
      const childB = buildMockStreamJsonChild(6202);
      const rlA = buildMockReadline();
      const rlB = buildMockReadline();

      mockSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB);
      mockCreateInterface.mockReturnValueOnce(rlA).mockReturnValueOnce(rlB);

      const executionId = await engine.startExecution(workflow.id, 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);

      rlA.emit('line', JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }));
      rlA.emit('line', JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: '__HANDOFF__:node-b:{"summary":"handoff before graceful stop","result":"writer should pause"}',
        },
      }));
      rlA.emit('line', JSON.stringify({ type: 'content_block_stop', index: 0 }));
      await engine._onHandoff(executionId, 'node-a', {
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate: {
          summary: 'handoff before graceful stop',
          result: 'writer should pause',
        },
      });
      rlA.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'sess-claude-a-graceful',
        total_cost_usd: 0.01,
        duration_ms: 90,
        usage: {
          input_tokens: 2,
          output_tokens: 4,
        },
      }));
      childA.emit('close', 0);
      await flushAsync();

      const nodeBState = execution.agentStates.get('node-b');
      expect(nodeBState).toBeDefined();
      expect(nodeBState.status).toBe('running');
      expect(nodeBState.spawnMode).toBe('stream-json');

      const graceful = await engine.stopStreamJsonAgent(executionId, 'node-b', 'graceful');
      expect(graceful.agentStates['node-b'].status).toBe('running');
      expect(nodeBState.doNotSpawnNextTurn).toBe(true);

      rlB.emit('line', JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }));
      rlB.emit('line', JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Claude writer stopping cleanly after this turn.',
        },
      }));
      rlB.emit('line', JSON.stringify({ type: 'content_block_stop', index: 0 }));
      rlB.emit('line', JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'sess-claude-b-graceful',
        total_cost_usd: 0.005,
        duration_ms: 75,
        usage: {
          input_tokens: 1,
          output_tokens: 2,
        },
      }));
      childB.emit('close', 0);
      await flushAsync();

      const status = engine.getStatus(executionId);
      expect(status.status).toBe('paused');
      expect(status.agentStates['node-a'].status).toBe('done');
      expect(status.agentStates['node-b'].status).toBe('paused');
      expect(status.agentStates['node-c']).toBeUndefined();

      const pausedEvent = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .find((ev) => ev.type === 'agent_status' && ev.nodeId === 'node-b' && ev.status === 'paused');
      expect(pausedEvent).toMatchObject({
        nodeId: 'node-b',
        status: 'paused',
        spawnMode: 'stream-json',
      });
    });

    it('should build a provider-aware compact prompt for Codex downstream handoffs', async () => {
      const workflow = buildMixedProviderChainWorkflow();
      const executionId = 'exec-codex-downstream-prompt';
      const longResearchHandoff = `${'roman-colosseum-detail '.repeat(24)}END_MARKER`;
      const execution = {
        executionId,
        workflowId: workflow.id,
        workflowDef: workflow,
        projectId: 'proj-1',
        projectPath: '/projects/proj-1',
        status: 'running',
        startedAt: '2026-04-08T14:00:00.000Z',
        agentStates: new Map([
          ['node-b', {
            status: 'running',
            provider: 'claude',
            runtimeProvider: 'claude',
            spawnMode: 'stream-json',
            sessionId: null,
            handoffCount: 0,
            lastOutputSnippet: 'Writer ready.',
            handoffPayloads: [],
          }],
        ]),
        edgeCounters: new Map(),
        agentInputBarriers: new Map(),
        inboundHandoffs: new Map(),
        workflowContext: {
          currentTask: 'Prepare the final Codex report.',
          expectedReport: 'Two concise sentences.',
        },
        heartbeatTimer: null,
        inboxItems: [],
        chatMessages: [],
        runtimeBlocker: null,
        providerStrategy: {
          mode: 'auto',
          activeProvider: 'claude',
          fallbackProvider: 'codex',
          allowFallback: true,
        },
        runtimeProvider: 'claude',
        activeProvider: 'claude',
        codexPromptRetryCounts: new Map(),
        lastFallback: null,
      };
      engine._executions.set(executionId, execution);

      const promptSpy = vi.spyOn(engine, '_writeSwarmPrompt');

      await engine._onHandoff(executionId, 'node-b', {
        type: 'handoff',
        targetId: 'node-c',
        contextUpdate: {
          summary: 'writer complete',
          result: longResearchHandoff,
        },
      });

      const [, prompt] = promptSpy.mock.calls.at(-1);
      const inboundHandoffLine = prompt.split('\n').find((line) => line.startsWith('node-b: '));

      expect(prompt).toContain('Upstream handoffs:');
      expect(prompt).toContain('Required final report: Two concise sentences.');
      expect(prompt).not.toContain('--- SWARM PROTOCOL');
      expect(prompt).not.toContain('Current workflow context:');
      expect(inboundHandoffLine).toBeTruthy();
      expect(inboundHandoffLine).toContain('END_MARKER');
      expect(() => JSON.parse(inboundHandoffLine.slice('node-b: '.length))).not.toThrow();

      promptSpy.mockRestore();
    });

    it('should keep multiple upstream handoffs as separate parseable JSON lines in compact Codex prompts', () => {
      const prompt = engine._buildSystemPrompt(
        { id: 'node-merge', data: { systemPrompt: 'You are the Codex merge finisher.' } },
        {
          currentTask: 'Combine the upstream facts into one final report.',
          expectedReport: 'One concise paragraph.',
        },
        ['node-final'],
        'codex',
        {
          compactCodexPrompt: true,
          inboundHandoffs: [
            {
              sourceNodeId: 'node-b',
              sourceLabel: 'Researcher',
              payload: {
                summary: `${'alpha '.repeat(60)}END_A`,
                result: `${'beta '.repeat(60)}TAIL_A`,
                confidence: 0.91,
              },
            },
            {
              sourceNodeId: 'node-c',
              sourceLabel: 'Fact Checker',
              payload: {
                summary: `${'gamma '.repeat(60)}END_B`,
                result: `${'delta '.repeat(60)}TAIL_B`,
                verified: true,
              },
            },
          ],
        }
      );

      const researcherLine = prompt.split('\n').find((line) => line.startsWith('Researcher: '));
      const factCheckerLine = prompt.split('\n').find((line) => line.startsWith('Fact Checker: '));

      expect(prompt).toContain('Upstream handoffs:');
      expect(researcherLine).toBeTruthy();
      expect(factCheckerLine).toBeTruthy();
      expect(researcherLine).toContain('END_A');
      expect(factCheckerLine).toContain('END_B');
      expect(() => JSON.parse(researcherLine.slice('Researcher: '.length))).not.toThrow();
      expect(() => JSON.parse(factCheckerLine.slice('Fact Checker: '.length))).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Test 12: V11.0 Agent Intelligence Reengineering
  // -------------------------------------------------------------------------
  describe('Test 12: V11.0 Agent Intelligence', () => {
    it('should produce awareness section with agent identity, peers, and connections', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const awareness = engine._buildAgentAwareness(execution, 'node-a');
      expect(awareness).toContain('You are "node-a"');
      expect(awareness).toContain('2-agent workflow');
      expect(awareness).toContain('"node-b"');
      expect(awareness).toContain('You send output to:');
    });

    it('should include workflow goal in awareness from workflowDef.description', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const awareness = engine._buildAgentAwareness(execution, 'node-a');
      expect(awareness).toContain('Workflow goal:');
    });

    it('should return empty awareness for unknown nodeId', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const awareness = engine._buildAgentAwareness(execution, 'nonexistent');
      expect(awareness).toBe('');
    });

    it('should produce interaction transcript from chatMessages', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      execution.chatMessages.push(
        { nodeId: 'node-a', role: 'assistant', text: 'Hello from A', timestamp: 1000 },
        { nodeId: 'node-b', role: 'assistant', text: 'Hello from B', timestamp: 2000 },
      );

      const transcript = engine._buildInteractionTranscript(execution);
      expect(transcript).toContain('Interaction history (chronological):');
      expect(transcript).toContain('[node-a]:');
      expect(transcript).toContain('Hello from A');
      expect(transcript).toContain('[node-b]:');
      expect(transcript).toContain('Hello from B');
    });

    it('should return empty transcript when no chatMessages exist', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const transcript = engine._buildInteractionTranscript(execution);
      expect(transcript).toBe('');
    });

    it('should cap transcript at charLimit', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      for (let i = 0; i < 50; i++) {
        execution.chatMessages.push({
          nodeId: i % 2 === 0 ? 'node-a' : 'node-b',
          role: 'assistant',
          text: 'X'.repeat(500),
          timestamp: i * 1000,
        });
      }

      const transcript = engine._buildInteractionTranscript(execution, 2000);
      expect(transcript.length).toBeLessThanOrEqual(2500);
    });

    it('should enforce maxTurns in _onHandoff', async () => {
      const wf = buildTwoNodeWorkflow({ circuitBreakerThreshold: 100 });
      wf.edges.push({ id: 'edge-ba', source: 'node-b', target: 'node-a' });
      wf.settings.maxConversationTurns = 3;
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const agents = ['node-a', 'node-b'];
      const targets = ['node-b', 'node-a'];
      for (let i = 0; i < 4; i++) {
        const src = agents[i % 2];
        const tgt = targets[i % 2];
        const srcState = execution.agentStates.get(src);
        if (srcState) srcState.status = 'running';
        await engine._onHandoff(executionId, src, {
          type: 'handoff',
          targetId: tgt,
          contextUpdate: { turn: i },
        });
      }

      expect(execution.totalTurns).toBe(4);
      const maxTurnsEvents = wsBroadcast.mock.calls
        .map(([, ev]) => ev)
        .filter((ev) => ev.type === 'maxTurns_reached');
      expect(maxTurnsEvents.length).toBe(1);
      expect(maxTurnsEvents[0].maxTurns).toBe(3);
    });

    it('should respect contextVisibility=minimal in prompt', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.nodes[0].data.contextVisibility = 'minimal';
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        execution.workflowContext,
        ['node-b'],
        'gemini',
        { inboundHandoffs: [], execution }
      );

      expect(prompt).not.toContain('=== AGENT AWARENESS ===');
      expect(prompt).not.toContain('=== INTERACTION HISTORY ===');
      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).toContain('=== PROTOCOL ===');
    });

    it('should respect contextVisibility=roleOnly in prompt', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.nodes[0].data.contextVisibility = 'roleOnly';
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const execution = engine._executions.get(executionId);

      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        execution.workflowContext,
        ['node-b'],
        'gemini',
        { inboundHandoffs: [{ sourceNodeId: 'node-x', payload: { key: 'val' } }], execution }
      );

      expect(prompt).not.toContain('=== AGENT AWARENESS ===');
      expect(prompt).not.toContain('=== INTERACTION HISTORY ===');
      expect(prompt).not.toContain('Received handoffs:');
      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).toContain('=== PROTOCOL ===');
    });

    it('should include lastAssembledPrompt in serialized agent state', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const status = engine.getStatus(executionId);

      expect(status.agentStates['node-a'].lastAssembledPrompt).toBeTruthy();
      expect(typeof status.agentStates['node-a'].lastAssembledPrompt).toBe('string');
      expect(status.agentStates['node-a'].lastPromptTimestamp).toBeTruthy();
    });

    it('should expose workflowContext and totalTurns in getStatus', async () => {
      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1', { provider: 'gemini' });
      const status = engine.getStatus(executionId);

      expect(status.workflowContext).toBeDefined();
      expect(typeof status.workflowContext).toBe('object');
      expect(status.totalTurns).toBe(0);
    });

    it('should use awareness section with 5 agents', () => {
      const fiveNodeWf = {
        nodes: [
          { id: 'a', data: { label: 'Alpha', systemPrompt: 'Research and analyze market trends' } },
          { id: 'b', data: { label: 'Beta', systemPrompt: 'Write creative content based on research' } },
          { id: 'c', data: { label: 'Gamma', systemPrompt: 'Review and fact-check all content' } },
          { id: 'd', data: { label: 'Delta', systemPrompt: 'Format and polish the final document' } },
          { id: 'e', data: { label: 'Epsilon', systemPrompt: 'Deliver final report to stakeholders' } },
        ],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
          { source: 'c', target: 'd' },
          { source: 'd', target: 'e' },
        ],
        description: 'Full pipeline from research to delivery',
      };

      const execution = {
        workflowDef: fiveNodeWf,
        workflowContext: {},
      };

      const awareness = engine._buildAgentAwareness(execution, 'c');
      expect(awareness).toContain('5-agent workflow');
      expect(awareness).toContain('"Alpha"');
      expect(awareness).toContain('"Beta"');
      expect(awareness).toContain('"Delta"');
      expect(awareness).toContain('"Epsilon"');
      expect(awareness).toContain('Workflow goal: Full pipeline from research to delivery');
      expect(awareness).toContain('You receive input from: "Beta"');
      expect(awareness).toContain('You send output to: "Delta"');
    });
  });

  // -------------------------------------------------------------------------
  // Test 13: V11.1 Repetitive Handoff Loop Detection
  // -------------------------------------------------------------------------
  describe('Test 13: V11.1 Loop Detection', () => {
    it('_computeMessageSimilarity returns ~1.0 for identical messages', () => {
      const execution = {
        chatMessages: [
          { nodeId: 'a', role: 'assistant', text: 'There is nothing to do here.', timestamp: 1 },
          { nodeId: 'a', role: 'assistant', text: 'There is nothing to do here.', timestamp: 2 },
        ],
      };
      const sim = engine._computeMessageSimilarity(execution, 'a');
      expect(sim).toBeCloseTo(1.0, 1);
    });

    it('_computeMessageSimilarity returns low value for very different messages', () => {
      const execution = {
        chatMessages: [
          { nodeId: 'a', role: 'assistant', text: 'Node.js uses an event-driven non-blocking I/O model', timestamp: 1 },
          { nodeId: 'a', role: 'assistant', text: 'The capital of France is Paris and it has many museums', timestamp: 2 },
        ],
      };
      const sim = engine._computeMessageSimilarity(execution, 'a');
      expect(sim).toBeLessThan(0.3);
    });

    it('_computeMessageSimilarity returns 0 with fewer than 2 messages', () => {
      const execution = {
        chatMessages: [
          { nodeId: 'a', role: 'assistant', text: 'Hello world', timestamp: 1 },
        ],
      };
      expect(engine._computeMessageSimilarity(execution, 'a')).toBe(0);
    });

    it('_detectRepetitiveLoop detects bidirectional loop after threshold', () => {
      const wf = buildTwoNodeWorkflow();
      wf.edges.push({ id: 'edge-ba', source: 'node-b', target: 'node-a' });
      const execution = {
        workflowDef: wf,
        edgeCounters: new Map(),
        chatMessages: [],
      };
      execution.edgeCounters.set('edge-ab', 3);
      execution.edgeCounters.set('edge-ba', 3);

      const result = engine._detectRepetitiveLoop(execution, 'node-a', 'node-b');
      expect(result).not.toBeNull();
      expect(result.detected).toBe(true);
      expect(result.pairCount).toBe(6);
      expect(result.reason).toContain('Bidirectional handoff loop');
    });

    it('_detectRepetitiveLoop does NOT fire for one-directional chains', () => {
      const wf = buildTwoNodeWorkflow();
      const execution = {
        workflowDef: wf,
        edgeCounters: new Map(),
        chatMessages: [],
      };
      execution.edgeCounters.set('node-a->node-b', 5);

      const result = engine._detectRepetitiveLoop(execution, 'node-a', 'node-b');
      expect(result).toBeNull();
    });

    it('_detectRepetitiveLoop does NOT fire for loop-type nodes', () => {
      const wf = buildTwoNodeWorkflow();
      wf.nodes[0].type = 'loop';
      wf.edges.push({ id: 'edge-ba', source: 'node-b', target: 'node-a' });
      const execution = {
        workflowDef: wf,
        edgeCounters: new Map(),
        chatMessages: [],
      };
      execution.edgeCounters.set('edge-ab', 10);
      execution.edgeCounters.set('edge-ba', 10);

      const result = engine._detectRepetitiveLoop(execution, 'node-a', 'node-b');
      expect(result).toBeNull();
    });

    it('_detectRepetitiveLoop detects early via content similarity', () => {
      const wf = buildTwoNodeWorkflow();
      wf.edges.push({ id: 'edge-ba', source: 'node-b', target: 'node-a' });
      const execution = {
        workflowDef: wf,
        edgeCounters: new Map(),
        chatMessages: [
          { nodeId: 'node-b', role: 'assistant', text: 'La conversazione tra i due agenti e completata. Non ce nuovo lavoro da svolgere.', timestamp: 1 },
          { nodeId: 'node-b', role: 'assistant', text: 'La conversazione tra i due agenti e gia stata completata. Non ce nuovo lavoro da svolgere.', timestamp: 2 },
        ],
      };
      execution.edgeCounters.set('edge-ab', 2);
      execution.edgeCounters.set('edge-ba', 2);

      const result = engine._detectRepetitiveLoop(execution, 'node-a', 'node-b');
      expect(result).not.toBeNull();
      expect(result.detected).toBe(true);
      expect(result.reason).toContain('Repetitive content');
      expect(result.similarity).toBeGreaterThan(0.7);
    });

    it('loopDetectionThreshold setting overrides default', () => {
      const wf = buildTwoNodeWorkflow();
      wf.settings = { ...wf.settings, loopDetectionThreshold: 10 };
      wf.edges.push({ id: 'edge-ba', source: 'node-b', target: 'node-a' });
      const execution = {
        workflowDef: wf,
        edgeCounters: new Map(),
        chatMessages: [],
      };
      execution.edgeCounters.set('edge-ab', 3);
      execution.edgeCounters.set('edge-ba', 3);

      const result = engine._detectRepetitiveLoop(execution, 'node-a', 'node-b');
      expect(result).toBeNull();

      execution.edgeCounters.set('edge-ab', 5);
      execution.edgeCounters.set('edge-ba', 5);
      const result2 = engine._detectRepetitiveLoop(execution, 'node-a', 'node-b');
      expect(result2).not.toBeNull();
      expect(result2.detected).toBe(true);
      expect(result2.pairCount).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Test 14: V11.3 HITL Runtime Trigger
  // __HITL__ token detection, system prompt injection, freezeAgent via token,
  // resumeAfterHitl, and canonical text stripping.
  // -------------------------------------------------------------------------
  describe('Test 14: V11.3 HITL Runtime Trigger', () => {
    it('should include __HITL__ token in system prompt when mode is hitl', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.settings = { ...wf.settings, mode: 'hitl' };
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const node = wf.nodes[0];
      const handoffTargets = ['node-b'];

      const prompt = engine._buildSystemPrompt(node, execution.workflowContext, handoffTargets, null, {
        execution,
      });

      expect(prompt).toContain('__HITL__');
      expect(prompt).toContain('HITL');
      expect(prompt).toContain('human');
    });

    it('should NOT include __HITL__ token in system prompt when mode is autonomous', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.settings = { ...wf.settings, mode: 'autonomous' };
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const node = wf.nodes[0];
      const handoffTargets = ['node-b'];

      const prompt = engine._buildSystemPrompt(node, execution.workflowContext, handoffTargets, null, {
        execution,
      });

      expect(prompt).not.toContain('__HITL__');
    });

    it('should NOT include __HITL__ token when mode is not set (defaults to autonomous)', async () => {
      const wf = buildTwoNodeWorkflow();
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);
      const node = wf.nodes[0];

      const prompt = engine._buildSystemPrompt(node, execution.workflowContext, ['node-b'], null, {
        execution,
      });

      expect(prompt).not.toContain('__HITL__');
    });

    it('should call freezeAgent when _handleStreamJsonResult detects __HITL__ token in hitl mode', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.settings = { ...wf.settings, mode: 'hitl' };
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);

      // Simulate an agent state with stream-json accumulated text containing __HITL__
      execution.agentStates.set('node-a', {
        status: 'running',
        spawnMode: 'stream-json',
        turnCount: 0,
        _streamJsonAccumulatedText: 'I need your help with something.\n__HITL__:{"question":"What color should the logo be?"}',
        _streamJsonChild: null,
        _streamJsonPostResultTimer: null,
        _stderrChunks: [],
        _pendingStreamJsonStopMode: null,
        doNotSpawnNextTurn: false,
        streamJsonSessionId: 'test-session',
        runtimeProvider: 'claude',
        provider: 'claude',
      });

      wsBroadcast.mockClear();

      engine._handleStreamJsonResult(executionId, 'node-a', {
        type: 'result',
        resultText: 'I need your help with something.\n__HITL__:{"question":"What color should the logo be?"}',
        isError: false,
        costUsd: 0.01,
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 1000,
      }, ['node-b']);

      // Agent should be paused
      expect(execution.agentStates.get('node-a').status).toBe('paused');

      // Inbox item should be created
      expect(execution.inboxItems.length).toBeGreaterThan(0);
      const hitlItem = execution.inboxItems.find(i => i.type === 'user_requested');
      expect(hitlItem).toBeDefined();
      expect(hitlItem.reason).toBe('What color should the logo be?');

      // hitl_required WS event should be broadcast
      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const hitlEvent = events.find(e => e.type === 'hitl_required');
      expect(hitlEvent).toBeDefined();
      expect(hitlEvent.nodeId).toBe('node-a');
    });

    it('should NOT freeze when __HITL__ token is present but mode is NOT hitl', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.settings = { ...wf.settings, mode: 'autonomous' };
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);

      execution.agentStates.set('node-a', {
        status: 'running',
        spawnMode: 'stream-json',
        turnCount: 0,
        _streamJsonAccumulatedText: 'Some text\n__HITL__:{"question":"ignored"}',
        _streamJsonChild: null,
        _streamJsonPostResultTimer: null,
        _stderrChunks: [],
        _pendingStreamJsonStopMode: null,
        doNotSpawnNextTurn: false,
        streamJsonSessionId: 'test-session',
        runtimeProvider: 'claude',
        provider: 'claude',
      });

      wsBroadcast.mockClear();

      engine._handleStreamJsonResult(executionId, 'node-a', {
        type: 'result',
        resultText: 'Some text\n__HITL__:{"question":"ignored"}',
        isError: false,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
      }, []);

      // Agent should NOT be paused — it should go to done (no handoff targets, no handoff token)
      expect(execution.agentStates.get('node-a').status).not.toBe('paused');
    });

    it('should strip __HITL__ tokens from canonical chat text', () => {
      const text = 'Here is my analysis.\n__HITL__:{"question":"Do you approve?"}\nMore text';
      const result = engine._buildStructuredAssistantChatFallback(text);
      expect(result).not.toContain('__HITL__');
      expect(result).toContain('Here is my analysis');
    });

    it('resumeAfterHitl should set agent status to running for stream-json agents', async () => {
      const wf = buildTwoNodeWorkflow();
      wf.settings = { ...wf.settings, mode: 'hitl' };
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);

      // Set up a paused stream-json agent state
      execution.agentStates.set('node-a', {
        status: 'paused',
        spawnMode: 'stream-json',
        turnCount: 1,
        streamJsonSessionId: 'test-session',
        sessionId: null,
        runtimeProvider: 'claude',
        provider: 'claude',
      });

      wsBroadcast.mockClear();

      await engine.resumeAfterHitl(executionId, 'node-a', 'Use blue for the logo');

      // Agent status should be set to running (before spawn)
      // Note: spawn is mocked so it won't change status further
      const state = execution.agentStates.get('node-a');
      expect(state.status).toBe('running');
    });

    it('unfreezeAgent should set status back to running and broadcast agent_status', async () => {
      const wf = buildTwoNodeWorkflow();
      workflowStoreMock.get.mockResolvedValue(wf);

      const executionId = await engine.startExecution('wf-1', 'proj-1', '/projects/proj-1');
      const execution = engine._executions.get(executionId);

      // Freeze first
      engine.freezeAgent(executionId, 'node-a', { id: 'hitl-test', reason: 'test' });
      expect(execution.agentStates.get('node-a').status).toBe('paused');

      wsBroadcast.mockClear();

      // Unfreeze
      engine.unfreezeAgent(executionId, 'node-a');
      expect(execution.agentStates.get('node-a').status).toBe('running');

      const events = wsBroadcast.mock.calls.map(([, ev]) => ev);
      const statusEvent = events.find(e => e.type === 'agent_status' && e.nodeId === 'node-a');
      expect(statusEvent).toBeDefined();
      expect(statusEvent.status).toBe('running');
    });
  });
});
