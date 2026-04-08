import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SwarmEngine from '../services/SwarmEngine.js';
import CircuitBreaker from '../services/CircuitBreaker.js';
import BudgetTracker from '../services/BudgetTracker.js';
import { normalizeCodexSdkItem } from '../services/CodexSdkAdapter.js';

function buildSingleNodeCodexWorkflow(overrides = {}) {
  const {
    systemPrompt = 'Diagnose the issue and emit __DONE__ when complete.',
  } = overrides;
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
          systemPrompt,
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
  let workflowDef;

  beforeEach(() => {
    wsBroadcast = vi.fn();
    sessionManager = buildMockSessionManager();
    workflowDef = buildSingleNodeCodexWorkflow();
    workflowStore = {
      get: vi.fn().mockResolvedValue(workflowDef),
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

  it('ignores late abort failures after a codex-sdk reset and keeps execution idle', async () => {
    let capturedSignal = null;

    engine._codexSdkFactory = {
      forceEnabled: true,
      createClient: vi.fn(() => ({ kind: 'codex-client' })),
      runTurnStreamed: vi.fn(async ({ turnOptions }) => {
        capturedSignal = turnOptions.signal;
        return {
          thread: { id: 'thread-reset-late-abort' },
          events: (async function* stream() {
            yield { type: 'thread.started', thread_id: 'thread-reset-late-abort' };
            await new Promise((resolve, reject) => {
              if (capturedSignal.aborted) {
                reject(new Error('The operation was aborted'));
                return;
              }
              capturedSignal.addEventListener('abort', () => {
                reject(new Error('The operation was aborted'));
              }, { once: true });
            });
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
    await flushMicrotasks(20);

    const status = engine.getStatus(executionId);
    expect(capturedSignal?.aborted).toBe(true);
    expect(resetStatus.status).toBe('idle');
    expect(status.status).toBe('idle');
    expect(status.runtimeBlocker ?? null).toBeNull();
    expect(status.agentStates['node-a'].status).toBe('idle');
    expect(status.agentStates['node-a'].lastOutputSnippet).toBe('');
    expect(status.agentStates['node-a'].runtimeBlocker ?? null).toBeNull();
  });

  it('persists a fallback assistant chat message when codex final output exists but extractor drops it as prompt echo', async () => {
    workflowDef = buildSingleNodeCodexWorkflow({
      systemPrompt: 'Use a shell command to read the workspace package.json name and version. Then answer exactly two lines: NAME=<name> and VERSION=<version>. Finish with __DONE__ on its own line.',
    });
    workflowStore.get.mockResolvedValue(workflowDef);

    engine._codexSdkFactory = {
      forceEnabled: true,
      createClient: vi.fn(() => ({ kind: 'codex-client' })),
      runTurnStreamed: vi.fn(async () => ({
        thread: { id: 'thread-chat-fallback' },
        events: makeEventStream([
          { type: 'thread.started', thread_id: 'thread-chat-fallback' },
          {
            type: 'item.started',
            item: {
              id: 'msg-echo-like',
              type: 'agent_message',
              text: 'Reading the workspace package.json via shell now and extracting name and version.\n\nNAME=claude-code-visual-manager\nVERSION=9.0.0\n__DONE__',
            },
          },
          { type: 'turn.completed', usage: { input_tokens: 12, cached_input_tokens: 0, output_tokens: 9 } },
        ]),
      })),
      normalizeItem: normalizeCodexSdkItem,
    };

    const executionId = await engine.startExecution(
      'wf-codex-sdk',
      'proj-1',
      'C:\\repo',
      { runtimeProvider: 'codex' }
    );

    await flushMicrotasks(30);

    const status = engine.getStatus(executionId);
    expect(status.status).toBe('completed');
    expect(status.chatMessages).toHaveLength(1);
    expect(status.chatMessages[0]).toMatchObject({
      nodeId: 'node-a',
      role: 'assistant',
    });
    expect(status.chatMessages[0].text).toContain('NAME=claude-code-visual-manager');
    expect(status.chatMessages[0].text).toContain('VERSION=9.0.0');
    expect(status.chatMessages[0].text).not.toContain('__DONE__');
  });
});
