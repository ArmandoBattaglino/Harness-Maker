import { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSwarm } from './useSwarm.js';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';

class MockWebSocket {
  static instances = [];
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.close = vi.fn(() => {
      this.readyState = 3;
      this.onclose?.();
    });
    MockWebSocket.instances.push(this);
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function UseSwarmHarness({ workflowId = 'workflow-1', onReady }) {
  const api = useSwarm(workflowId);

  useEffect(() => {
    onReady(api);
  }, [api, onReady]);

  return null;
}

describe('useSwarm client contracts', () => {
  let swarmApi;
  let fetchMock;

  beforeEach(() => {
    resetSwarmStore();
    MockWebSocket.instances = [];
    swarmApi = null;
    globalThis.WebSocket = MockWebSocket;
    fetchMock = vi.fn(() => Promise.reject(new Error('Unexpected fetch')));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.WebSocket;
    delete globalThis.fetch;
  });

  it('hydrates execution snapshots from websocket execution_status messages', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-1');
    });
    const socket = MockWebSocket.instances.at(-1);
    act(() => {
      socket.emitOpen();
      socket.emitMessage({
        type: 'execution_status',
        executionId: 'exec-1',
        workflowId: 'workflow-1',
        status: 'completed',
        runtimeProvider: 'codex',
        providerStrategy: { mode: 'codex' },
        workflowDef: { id: 'workflow-1', nodes: [], edges: [] },
        agentStates: {
          'node-a': {
            status: 'done',
            spawnMode: 'stream-json',
            lastOutputSnippet: '__DONE__',
          },
        },
        budget: { estimatedTokensUsed: 12, limitTokens: 1000 },
        chatMessages: [
          {
            nodeId: 'node-a',
            role: 'assistant',
            text: 'Hello from the canonical snapshot',
            timestamp: 1,
            spawnMode: 'stream-json',
          },
        ],
      });
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.activeExecutionId).toBe('exec-1');
      expect(state.executionStatus).toBe('completed');
      expect(state.workflowDef?.id).toBe('workflow-1');
      expect(state.agentStates['node-a'].spawnMode).toBe('stream-json');
      expect(state.agentStates['node-a'].lastChatSnippet).toBe('Hello from the canonical snapshot');
      expect(state.budget).toEqual({ estimatedTokensUsed: 12, limitTokens: 1000 });
      expect(state.chatMessages).toHaveLength(1);
      expect(state.selectedRuntimeProvider).toBe('codex');
    });
  });

  it('keeps the selected runtime on auto when the snapshot shows an auto strategy using a concrete provider', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-auto');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitOpen();
      socket.emitMessage({
        type: 'execution_status',
        executionId: 'exec-auto',
        workflowId: 'workflow-1',
        status: 'running',
        runtimeProvider: 'codex',
        activeProvider: 'codex',
        providerStrategy: { mode: 'auto', activeProvider: 'codex' },
        workflowDef: { id: 'workflow-1', nodes: [], edges: [] },
        agentStates: {
          'node-a': { status: 'running', spawnMode: 'stream-json' },
        },
      });
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.runtimeProvider).toBe('codex');
      expect(state.providerStrategy).toEqual({ mode: 'auto', activeProvider: 'codex' });
      expect(state.selectedRuntimeProvider).toBe('auto');
    });
  });

  it('accumulates agent cost fields and clears tool/thinking state on terminal status', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-2');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'running',
        spawnMode: 'stream-json',
        sessionId: null,
      });
      socket.emitMessage({
        type: 'agent_tool_use',
        nodeId: 'node-a',
        toolName: 'Edit',
        toolUseId: 'tool-1',
      });
      socket.emitMessage({
        type: 'agent_tool_delta',
        nodeId: 'node-a',
        toolUseId: 'tool-1',
        partialJson: '{"file":"a.js"}',
      });
      socket.emitMessage({
        type: 'agent_thinking',
        nodeId: 'node-a',
        active: true,
      });
      socket.emitMessage({
        type: 'agent_cost',
        nodeId: 'node-a',
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        costUsd: 0.02,
        durationMs: 2500,
      });
      socket.emitMessage({
        type: 'agent_cost',
        nodeId: 'node-a',
        inputTokens: 6,
        outputTokens: 2,
        cacheReadTokens: 1,
        cacheWriteTokens: 0,
        costUsd: 0.01,
        durationMs: 1000,
      });
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'done',
        spawnMode: 'stream-json',
        sessionId: null,
      });
    });

    await waitFor(() => {
      const agentState = useSwarmStore.getState().agentStates['node-a'];
      expect(agentState.totalCost).toEqual({
        inputTokens: 16,
        outputTokens: 6,
        cacheReadTokens: 4,
        cacheWriteTokens: 1,
        costUsd: 0.03,
      });
      expect(agentState.turnCost).toEqual({
        inputTokens: 6,
        outputTokens: 2,
        cacheReadTokens: 1,
        cacheWriteTokens: 0,
        costUsd: 0.01,
        durationMs: 1000,
      });
      expect(agentState.currentTool).toBeNull();
      expect(agentState.isThinking).toBe(false);
      expect(agentState.status).toBe('done');
    });
  });

  it('replaces structured fragments with canonical chat and drops trailing fragments after canonical', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-3');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'running',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Hel',
        timestamp: 100,
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Hello',
        timestamp: 101,
        isCanonical: true,
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: ' world',
        timestamp: 102,
        spawnMode: 'stream-json',
      });
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.agentStates['node-a'].canonicalReceived).toBe(true);
      expect(state.agentStates['node-a'].lastChatSnippet).toBe('Hello');
      expect(state.agentResults['node-a'].finalText).toBe('Hello');
      expect(state.chatMessages).toEqual([
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Hello',
          timestamp: 101,
          spawnMode: 'stream-json',
        },
      ]);
    });
  });

  it('preserves earlier structured turns from the same node when a later turn completes', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-3b');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'running',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Hel',
        timestamp: 100,
        turnId: 'node-a:1',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Hello',
        timestamp: 101,
        turnId: 'node-a:1',
        isCanonical: true,
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'done',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'running',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Bon',
        timestamp: 200,
        turnId: 'node-a:2',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Bonjour',
        timestamp: 201,
        turnId: 'node-a:2',
        isCanonical: true,
        spawnMode: 'stream-json',
      });
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.agentStates['node-a'].canonicalReceived).toBe(true);
      expect(state.agentStates['node-a'].canonicalTurnId).toBe('node-a:2');
      expect(state.agentStates['node-a'].lastChatSnippet).toBe('Bonjour');
      expect(state.chatMessages).toEqual([
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Hello',
          timestamp: 101,
          turnId: 'node-a:1',
          spawnMode: 'stream-json',
        },
        {
          nodeId: 'node-a',
          role: 'assistant',
          text: 'Bonjour',
          timestamp: 201,
          turnId: 'node-a:2',
          spawnMode: 'stream-json',
        },
      ]);
    });
  });

  it('skips stale assistant fragments from REST hydration when canonical text already exists', async () => {
    fetchMock.mockImplementation((url) => {
      if (String(url).includes('/api/v1/swarm/executions/exec-4/results')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            agentOutputs: {
              'node-a': {
                finalText: 'Hello',
                handoffPayloads: [],
              },
            },
            chatMessages: [
              { nodeId: 'node-a', role: 'assistant', text: 'stale-fragment', timestamp: 200 },
              { nodeId: 'node-b', role: 'assistant', text: 'fresh-terminal-text', timestamp: 201 },
            ],
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-4');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitMessage({
        type: 'agent_status',
        nodeId: 'node-a',
        status: 'running',
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'chat_message',
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Hello',
        timestamp: 100,
        isCanonical: true,
        spawnMode: 'stream-json',
      });
      socket.emitMessage({
        type: 'execution_status',
        executionId: 'exec-4',
        workflowId: 'workflow-1',
        status: 'completed',
        workflowDef: { id: 'workflow-1', nodes: [], edges: [] },
        agentStates: {
          'node-a': {
            status: 'done',
            spawnMode: 'stream-json',
            canonicalReceived: true,
          },
          'node-b': {
            status: 'done',
            spawnMode: 'stream-json',
          },
        },
      });
    });

    await waitFor(() => {
      const texts = useSwarmStore.getState().chatMessages.map((message) => message.text);
      expect(texts).toContain('Hello');
      expect(texts).toContain('fresh-terminal-text');
      expect(texts).not.toContain('stale-fragment');
    });
  });

  it('keeps the websocket open after completion when agent sessions remain messageable', async () => {
    fetchMock.mockImplementation((url) => {
      if (String(url).includes('/api/v1/swarm/executions/exec-keepalive/results')) {
        return Promise.resolve({
          ok: false,
          json: async () => null,
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-keepalive');
    });
    const socket = MockWebSocket.instances.at(-1);
    vi.useFakeTimers();

    act(() => {
      socket.emitMessage({
        type: 'execution_status',
        executionId: 'exec-keepalive',
        workflowId: 'workflow-1',
        status: 'completed',
        workflowDef: { id: 'workflow-1', nodes: [], edges: [] },
        agentStates: {
          'node-a': {
            status: 'done',
            spawnMode: 'stream-json',
            acceptsMessages: true,
          },
        },
      });
    });

    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4000);

    expect(useSwarmStore.getState().executionStatus).toBe('completed');
    expect(socket.close).not.toHaveBeenCalled();
  });
});
