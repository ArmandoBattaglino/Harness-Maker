import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SwarmEngine from '../services/SwarmEngine.js';
import CircuitBreaker from '../services/CircuitBreaker.js';
import BudgetTracker from '../services/BudgetTracker.js';
import { normalizeCodexSdkItem } from '../services/CodexSdkAdapter.js';

function buildSingleNodeCodexWorkflow() {
  return {
    id: 'wf-codex-sdk',
    name: 'Codex SDK Workflow',
    description: 'Single-node workflow used to verify Codex SDK structured execution.',
    nodes: [
      {
        id: 'node-a',
        type: 'agent',
        data: {
          isTriageNode: true,
          label: 'Codex Worker',
          systemPrompt: 'Diagnose the issue and emit __DONE__ when complete.',
          model: 'gpt-5.4',
        },
      },
    ],
    edges: [],
    settings: {},
    initialContext: {},
  };
}

function buildMockSessionManager() {
  return {
    claudeBin: '/usr/local/bin/claude',
    codexBin: '/usr/local/bin/codex',
    geminiBin: '/usr/local/bin/gemini',
    createSession: vi.fn(),
    getSession: vi.fn(() => null),
    getSanitizedSessionOutput: vi.fn(() => ''),
    writeInput: vi.fn(),
    killSession: vi.fn().mockResolvedValue(undefined),
  };
}

async function flushMicrotasks(rounds = 20) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

function makeEventStream(events) {
  return (async function* stream() {
    for (const event of events) {
      yield event;
      await Promise.resolve();
    }
  }());
}

describe('SwarmEngine Codex SDK integration', () => {
  let engine;
  let wsBroadcast;
  let workflowStore;
  let sessionManager;

  beforeEach(() => {
    wsBroadcast = vi.fn();
    sessionManager = buildMockSessionManager();
    workflowStore = {
      get: vi.fn().mockResolvedValue(buildSingleNodeCodexWorkflow()),
    };

    engine = new SwarmEngine(
      sessionManager,
      workflowStore,
      new CircuitBreaker(),
      new BudgetTracker()
    );
    engine.setWsBroadcast(wsBroadcast);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes Codex executions through the SDK path and emits structured runtime events', async () => {
    const createClient = vi.fn(() => ({ kind: 'codex-client' }));
    const runTurnStreamed = vi.fn(async () => ({
      thread: { id: 'thread-123' },
      events: makeEventStream([
        { type: 'thread.started', thread_id: 'thread-123' },
        { type: 'item.started', item: { id: 'reason-1', type: 'reasoning', text: 'Looking at the repo' } },
        { type: 'item.started', item: { id: 'cmd-1', type: 'command_execution', command: 'npm test', aggregated_output: '', status: 'in_progress' } },
        { type: 'item.updated', item: { id: 'cmd-1', type: 'command_execution', command: 'npm test', aggregated_output: 'ok', status: 'in_progress' } },
        { type: 'item.completed', item: { id: 'cmd-1', type: 'command_execution', command: 'npm test', aggregated_output: 'ok', exit_code: 0, status: 'completed' } },
        { type: 'item.started', item: { id: 'msg-1', type: 'agent_message', text: 'Final summary from Codex.\n__DONE__' } },
        { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 } },
      ]),
    }));

    engine._codexSdkFactory = {
      forceEnabled: true,
      createClient,
      runTurnStreamed,
      normalizeItem: normalizeCodexSdkItem,
    };

    const executionId = await engine.startExecution(
      'wf-codex-sdk',
      'proj-1',
      'C:\\repo',
      { runtimeProvider: 'codex' }
    );

    await flushMicrotasks();

    const status = engine.getStatus(executionId);
    expect(status.status).toBe('completed');
    expect(status.agentStates['node-a']).toMatchObject({
      spawnMode: 'codex-sdk',
      provider: 'codex',
      runtimeProvider: 'codex',
      status: 'done',
      turnCount: 1,
      totalInputTokens: 8,
      totalOutputTokens: 4,
      totalCachedInputTokens: 2,
    });

    expect(sessionManager.createSession).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledWith({
      codexPath: '/usr/local/bin/codex',
    });
    expect(runTurnStreamed).toHaveBeenCalledWith(expect.objectContaining({
      client: { kind: 'codex-client' },
      threadId: null,
      threadOptions: expect.objectContaining({
        model: 'gpt-5.4',
        workingDirectory: 'C:\\repo',
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
      }),
    }));

    const events = wsBroadcast.mock.calls.map(([, event]) => event);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'agent_status',
        nodeId: 'node-a',
        spawnMode: 'codex-sdk',
        status: 'running',
      }),
      expect.objectContaining({
        type: 'agent_tool_use',
        nodeId: 'node-a',
        toolName: 'command_execution',
      }),
      expect.objectContaining({
        type: 'agent_tool_delta',
        nodeId: 'node-a',
      }),
      expect.objectContaining({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Final summary from Codex.\n__DONE__',
        spawnMode: 'codex-sdk',
      }),
      expect.objectContaining({
        type: 'agent_cost',
        nodeId: 'node-a',
        inputTokens: 8,
        cacheReadTokens: 2,
        outputTokens: 4,
      }),
    ]));
  });

  it('supports structured reset for Codex SDK agents by aborting the active turn and clearing thread state', async () => {
    let capturedSignal = null;
    const blockedTurn = new Promise(() => {});

    engine._codexSdkFactory = {
      forceEnabled: true,
      createClient: vi.fn(() => ({ kind: 'codex-client' })),
      runTurnStreamed: vi.fn(async ({ turnOptions }) => {
        capturedSignal = turnOptions.signal;
        return {
          thread: { id: 'thread-reset' },
          events: (async function* stream() {
            yield { type: 'thread.started', thread_id: 'thread-reset' };
            await blockedTurn;
          }()),
        };
      }),
      normalizeItem: normalizeCodexSdkItem,
    };

    const executionId = await engine.startExecution(
      'wf-codex-sdk',
      'proj-1',
      'C:\\repo',
      { runtimeProvider: 'codex' }
    );

    await flushMicrotasks(5);

    const resetStatus = await engine.stopStreamJsonAgent(executionId, 'node-a', 'reset');

    expect(capturedSignal?.aborted).toBe(true);
    expect(resetStatus.agentStates['node-a']).toMatchObject({
      spawnMode: 'codex-sdk',
      status: 'idle',
      turnCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedInputTokens: 0,
      lastOutputSnippet: '',
    });
    expect(resetStatus.agentStates['node-a'].sessionId).toBeNull();
    expect(engine.getExecution(executionId).agentStates.get('node-a').codexThreadId).toBeNull();
  });
});
