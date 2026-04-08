import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SwarmEngine from '../../services/SwarmEngine.js';
import CircuitBreaker from '../../services/CircuitBreaker.js';
import BudgetTracker from '../../services/BudgetTracker.js';

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

const STREAM_JSON_THINKING_PLACEHOLDER = 'Thinking block captured for this turn.';

function streamEvent(event) {
  return JSON.stringify({ type: 'stream_event', event });
}

function buildClaudeToCodexWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-stream-json-e2e',
    name: 'Stream JSON E2E Workflow',
    description: 'Claude gathers facts via stream-json, then hands off to Codex PTY for the final answer.',
    nodes: [
      {
        id: 'node-a',
        data: {
          isTriageNode: true,
          systemPrompt: 'You are the Claude reader.',
          model: 'sonnet',
          tools: ['Read', 'Grep'],
        },
      },
      {
        id: 'node-b',
        data: {
          systemPrompt: 'You are the Codex finisher.',
          model: 'gpt-5.4',
        },
      },
    ],
    edges: [
      { id: 'edge-ab', source: 'node-a', target: 'node-b' },
    ],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildStreamJsonSoloWorkflow({ budgetTokens = 0, circuitBreakerThreshold = 10 } = {}) {
  return {
    id: 'wf-stream-json-e2e-solo',
    name: 'Stream JSON E2E Solo Workflow',
    description: 'Single Claude stream-json node used to verify stop/resume/reset lifecycle.',
    nodes: [
      {
        id: 'node-a',
        data: {
          isTriageNode: true,
          systemPrompt: 'You are the stream-json lifecycle agent.',
          model: 'sonnet',
          tools: ['Read'],
        },
      },
    ],
    edges: [],
    settings: { budgetTokens, circuitBreakerThreshold },
    initialContext: {},
  };
}

function buildMocks() {
  const sessions = new Map();
  let sessionCallCount = 0;

  const createMockSession = (sessionId) => {
    const replayChunks = [];
    return {
      swarmListeners: new Set(),
      writeInput: vi.fn(),
      onData: vi.fn(),
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

  const mockSessionManager = {
    claudeBin: '/usr/local/bin/claude',
    codexBin: '/usr/local/bin/codex',
    geminiBin: null,
    createSession: vi.fn().mockImplementation(async () => {
      sessionCallCount += 1;
      const sessionId = `sess-pty-${sessionCallCount}`;
      const session = createMockSession(sessionId);
      sessions.set(sessionId, session);
      return session;
    }),
    getSession: vi.fn().mockImplementation((sessionId) => sessions.get(sessionId)),
    getSanitizedSessionOutput: vi.fn().mockImplementation((sessionId) => {
      const session = sessions.get(sessionId);
      const replayBuffer = session?.buffer?.toBuffer?.();
      if (!replayBuffer) return '';
      return Buffer.isBuffer(replayBuffer) ? replayBuffer.toString('utf8') : String(replayBuffer ?? '');
    }),
    writeInput: vi.fn(),
    killSession: vi.fn().mockResolvedValue(undefined),
  };

  return { mockSessionManager, sessions };
}

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

function buildClientStreamJsonHarness() {
  const agentStates = {};
  const chatMessages = [];
  const pendingTurns = {};

  function getPendingTurn(nodeId) {
    if (!pendingTurns[nodeId]) {
      pendingTurns[nodeId] = { toolUse: [], sawThinking: false, cost: null };
    }
    return pendingTurns[nodeId];
  }

  function patchLatestAssistantMessage(nodeId, patch) {
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const message = chatMessages[i];
      if (message.nodeId === nodeId && (message.role === 'assistant' || !message.role)) {
        chatMessages[i] = { ...message, ...patch };
        return;
      }
    }
  }

  function flushPendingTurn(nodeId) {
    const pending = pendingTurns[nodeId];
    if (!pending) return;

    const patch = { spawnMode: 'stream-json' };
    if (pending.toolUse.length > 0) {
      patch.toolUse = pending.toolUse.map((tool) => ({ ...tool }));
    }
    if (pending.sawThinking) {
      patch.thinking = STREAM_JSON_THINKING_PLACEHOLDER;
    }
    if (pending.cost) {
      patch.cost = { ...pending.cost };
    }

    patchLatestAssistantMessage(nodeId, patch);
    delete pendingTurns[nodeId];
  }

  function updateAgentState(nodeId, patch) {
    agentStates[nodeId] = {
      ...(agentStates[nodeId] ?? {}),
      ...patch,
    };
  }

  function consume(event) {
    switch (event.type) {
      case 'chat_message':
        chatMessages.push({
          nodeId: event.nodeId,
          role: event.role,
          text: event.text,
          timestamp: event.timestamp,
        });
        break;
      case 'agent_tool_use':
        getPendingTurn(event.nodeId).toolUse.push({
          toolName: event.toolName ?? 'unknown',
          toolUseId: event.toolUseId ?? '',
          partialArgs: '',
        });
        updateAgentState(event.nodeId, {
          currentTool: {
            toolName: event.toolName,
            toolUseId: event.toolUseId,
            partialArgs: '',
          },
        });
        break;
      case 'agent_tool_delta': {
        const currentTool = agentStates[event.nodeId]?.currentTool;
        const pending = getPendingTurn(event.nodeId);
        const toolUseId = event.toolUseId ?? currentTool?.toolUseId ?? '';
        const toolName = currentTool?.toolName ?? 'unknown';
        let toolIndex = -1;
        for (let i = pending.toolUse.length - 1; i >= 0; i -= 1) {
          const tool = pending.toolUse[i];
          if (tool.toolUseId === toolUseId || (!toolUseId && tool.toolName === toolName)) {
            toolIndex = i;
            break;
          }
        }
        if (toolIndex >= 0) {
          pending.toolUse[toolIndex] = {
            ...pending.toolUse[toolIndex],
            partialArgs: `${pending.toolUse[toolIndex].partialArgs ?? ''}${event.partialJson ?? ''}`,
          };
        }
        updateAgentState(event.nodeId, {
          currentTool: {
            toolName,
            toolUseId,
            partialArgs: `${currentTool?.partialArgs ?? ''}${event.partialJson ?? ''}`,
          },
        });
        break;
      }
      case 'agent_thinking':
        if (event.active) {
          getPendingTurn(event.nodeId).sawThinking = true;
        }
        updateAgentState(event.nodeId, { isThinking: Boolean(event.active) });
        break;
      case 'agent_cost':
        getPendingTurn(event.nodeId).cost = {
          inputTokens: event.inputTokens ?? 0,
          outputTokens: event.outputTokens ?? 0,
          costUsd: event.costUsd ?? 0,
          durationMs: event.durationMs ?? 0,
        };
        flushPendingTurn(event.nodeId);
        break;
      case 'agent_status':
        updateAgentState(event.nodeId, {
          status: event.status,
          ...(Object.prototype.hasOwnProperty.call(event, 'spawnMode')
            ? { spawnMode: event.spawnMode }
            : {}),
          ...(['done', 'idle', 'paused', 'error', 'failed'].includes(event.status)
            ? { currentTool: null, isThinking: false }
            : {}),
        });
        if (
          (event.spawnMode === 'stream-json' || agentStates[event.nodeId]?.spawnMode === 'stream-json')
          && ['done', 'idle', 'error', 'failed'].includes(event.status)
        ) {
          flushPendingTurn(event.nodeId);
        }
        break;
      default:
        break;
    }
  }

  return { agentStates, chatMessages, consume };
}

describe('stream-json E2E contract', () => {
  let wsBroadcast;
  let mockSessionManager;
  let workflowStoreMock;
  let circuitBreaker;
  let budgetTracker;
  let engine;

  beforeEach(() => {
    vi.useFakeTimers();
    wsBroadcast = vi.fn();
    mockSpawn.mockReset();
    mockCreateInterface.mockReset();
    mockTreeKill.mockClear();

    ({ mockSessionManager } = buildMocks());
    workflowStoreMock = { get: vi.fn() };
    circuitBreaker = new CircuitBreaker();
    budgetTracker = new BudgetTracker();
    engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
    engine.setWsBroadcast(wsBroadcast);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('assembles a client-ready stream-json turn and hands off to Codex PTY without regression', async () => {
    const workflow = buildClaudeToCodexWorkflow();
    workflowStoreMock.get.mockResolvedValueOnce(workflow);

    const childA = buildMockStreamJsonChild(7101);
    const rlA = buildMockReadline();
    mockSpawn.mockReturnValueOnce(childA);
    mockCreateInterface.mockReturnValueOnce(rlA);

    const executionId = await engine.startExecution(workflow.id, 'proj-1', '/projects/proj-1', {
      runtimeProvider: 'auto',
    });
    const execution = engine._executions.get(executionId);
    const nodeAState = execution.agentStates.get('node-a');

    const nodeASpawnArgs = mockSpawn.mock.calls[0][1];
    expect(nodeASpawnArgs).toEqual(expect.arrayContaining([
      '--output-format',
      'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--tools',
      'Read,Grep',
      '--model',
      'sonnet',
    ]));
    expect(nodeAState.spawnMode).toBe('stream-json');
    expect(nodeAState.runtimeProvider).toBe('claude');

    rlA.emit('line', streamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    }));
    rlA.emit('line', streamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Checking package manifests before handoff.' },
    }));
    rlA.emit('line', streamEvent({ type: 'content_block_stop', index: 0 }));
    rlA.emit('line', streamEvent({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu-read-1', name: 'Read', input: {} },
    }));
    rlA.emit('line', streamEvent({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"file":"package.json"}' },
    }));
    rlA.emit('line', streamEvent({ type: 'content_block_stop', index: 1 }));
    rlA.emit('line', streamEvent({
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'text', text: '' },
    }));
    rlA.emit('line', streamEvent({
      type: 'content_block_delta',
      index: 2,
      delta: {
        type: 'text_delta',
        text: 'Package versions collected.\n__HANDOFF__:node-b:{"summary":"package versions collected","result":"Codex can now draft the final summary"}',
      },
    }));
    rlA.emit('line', streamEvent({ type: 'content_block_stop', index: 2 }));
    await flushAsync();

    rlA.emit('line', JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: nodeAState.streamJsonSessionId,
      total_cost_usd: 0.125,
      duration_ms: 2200,
      usage: {
        input_tokens: 123,
        output_tokens: 45,
        cache_read_input_tokens: 8,
        cache_creation_input_tokens: 3,
      },
    }));
    childA.emit('close', 0);
    await flushAsync();

    const nodeBState = execution.agentStates.get('node-b');
    expect(nodeBState).toBeDefined();
    expect(nodeBState.provider).toBe('codex');
    expect(nodeBState.runtimeProvider).toBe('codex');
    expect(nodeBState.sessionId).toBeTruthy();
    expect(mockSessionManager.createSession).toHaveBeenCalledTimes(1);

    const codexSession = mockSessionManager.getSession(nodeBState.sessionId);
    const codexTap = [...codexSession.swarmListeners].find((listener) => listener === nodeBState.tapFn);
    expect(codexTap).toBeDefined();

    nodeBState.ignoreParserUntil = null;
    nodeBState.ignoreParserBuffer = '';
    codexTap('Codex final report complete.\n__DONE__');
    await flushAsync();

    const status = engine.getStatus(executionId);
    expect(status.status).toBe('completed');
    expect(status.agentStates['node-a'].status).toBe('done');
    expect(status.agentStates['node-a'].spawnMode).toBe('stream-json');
    expect(status.agentStates['node-b'].status).toBe('done');

    const events = wsBroadcast.mock.calls.map(([, event]) => event);
    const harness = buildClientStreamJsonHarness();
    events.forEach((event) => harness.consume(event));

    const assistantTurn = [...harness.chatMessages]
      .reverse()
      .find((message) => message.nodeId === 'node-a');
    expect(assistantTurn).toMatchObject({
      nodeId: 'node-a',
      role: 'assistant',
      spawnMode: 'stream-json',
      thinking: STREAM_JSON_THINKING_PLACEHOLDER,
      cost: {
        inputTokens: 123,
        outputTokens: 45,
        costUsd: 0.125,
        durationMs: 2200,
      },
    });
    expect(assistantTurn.toolUse).toEqual([
      expect.objectContaining({
        toolName: 'Read',
        partialArgs: '{"file":"package.json"}',
      }),
    ]);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'agent_thinking', nodeId: 'node-a', active: true }),
      expect.objectContaining({ type: 'agent_thinking', nodeId: 'node-a', active: false }),
      expect.objectContaining({ type: 'agent_tool_use', nodeId: 'node-a', toolName: 'Read' }),
      expect.objectContaining({ type: 'agent_tool_delta', nodeId: 'node-a', partialJson: '{"file":"package.json"}' }),
      expect.objectContaining({
        type: 'agent_cost',
        nodeId: 'node-a',
        inputTokens: 123,
        outputTokens: 45,
        cacheReadTokens: 8,
        cacheWriteTokens: 3,
      }),
      expect.objectContaining({
        type: 'agent_status',
        nodeId: 'node-b',
        status: 'running',
        provider: 'codex',
        runtimeProvider: 'codex',
      }),
      expect.objectContaining({
        type: 'agent_status',
        nodeId: 'node-b',
        status: 'done',
        provider: 'codex',
        runtimeProvider: 'codex',
      }),
    ]));
  });

  it('gracefully pauses and resumes a Claude stream-json turn with --resume and preserved tool whitelist', async () => {
    const workflow = buildStreamJsonSoloWorkflow();
    workflowStoreMock.get.mockResolvedValueOnce(workflow);

    const childA1 = buildMockStreamJsonChild(7201);
    const childA2 = buildMockStreamJsonChild(7202);
    const rlA1 = buildMockReadline();
    const rlA2 = buildMockReadline();
    mockSpawn.mockReturnValueOnce(childA1).mockReturnValueOnce(childA2);
    mockCreateInterface.mockReturnValueOnce(rlA1).mockReturnValueOnce(rlA2);

    const executionId = await engine.startExecution(workflow.id, 'proj-1', '/projects/proj-1');
    const execution = engine._executions.get(executionId);
    const initialState = execution.agentStates.get('node-a');
    const firstSessionId = initialState.streamJsonSessionId;

    expect(mockSpawn.mock.calls[0][1]).toEqual(expect.arrayContaining([
      '--tools',
      'Read',
    ]));

    const graceful = await engine.stopStreamJsonAgent(executionId, 'node-a', 'graceful');
    expect(graceful.agentStates['node-a'].status).toBe('running');
    expect(execution.agentStates.get('node-a').doNotSpawnNextTurn).toBe(true);

    rlA1.emit('line', JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: firstSessionId,
      total_cost_usd: 0.01,
      duration_ms: 90,
      usage: {
        input_tokens: 2,
        output_tokens: 4,
      },
    }));
    childA1.emit('close', 0);
    await flushAsync();

    let status = engine.getStatus(executionId);
    expect(status.status).toBe('paused');
    expect(status.agentStates['node-a'].status).toBe('paused');

    const resumed = await engine.resumeExecution(executionId);
    expect(resumed.status).toBe('running');
    expect(mockSpawn.mock.calls[1][1]).toEqual(expect.arrayContaining([
      '--resume',
      firstSessionId,
      '--tools',
      'Read',
    ]));
  });

  it('resets a Claude stream-json session by archiving and deleting its JSONL artifacts', async () => {
    const workflow = buildStreamJsonSoloWorkflow();
    workflowStoreMock.get.mockResolvedValueOnce(workflow);

    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-json-e2e-reset-'));
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);

    const childA = buildMockStreamJsonChild(7301);
    const rlA = buildMockReadline();
    mockSpawn.mockReturnValueOnce(childA);
    mockCreateInterface.mockReturnValueOnce(rlA);

    const executionId = await engine.startExecution(workflow.id, 'proj-1', '/projects/proj-1');
    const execution = engine._executions.get(executionId);
    const state = execution.agentStates.get('node-a');
    const oldSessionId = state.streamJsonSessionId;

    const sessionDir = path.join(tmpHome, '.claude', 'projects', 'proj-hash');
    const jsonlPath = path.join(sessionDir, `${oldSessionId}.jsonl`);
    const companionDir = path.join(sessionDir, oldSessionId);
    fs.mkdirSync(companionDir, { recursive: true });
    fs.writeFileSync(jsonlPath, '{"type":"assistant","text":"hello"}\n', 'utf8');

    const reset = await engine.stopStreamJsonAgent(executionId, 'node-a', 'reset');
    const liveState = engine._executions.get(executionId).agentStates.get('node-a');

    expect(fs.existsSync(jsonlPath)).toBe(false);
    expect(fs.existsSync(companionDir)).toBe(false);
    expect(reset.agentStates['node-a'].status).toBe('idle');
    expect(reset.agentStates['node-a'].turnCount).toBe(0);
    expect(liveState.streamJsonSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(liveState.streamJsonSessionId).not.toBe(oldSessionId);
    expect(liveState._lastResetArchive?.archivedJsonl).toContain('"assistant"');

    homedirSpy.mockRestore();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });
});

// NOTE:
// These tests intentionally use mocked NDJSON + mocked PTY sessions so the
// contract stays deterministic in CI. Real provider smoke still belongs to
// browser/debugger-loop runs because auth, quota, and provider latency make a
// live CLI test non-hermetic.
