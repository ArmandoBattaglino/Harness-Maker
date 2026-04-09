import React, { useEffect } from 'react';
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
      expect(state.agentStates['node-a'].lastOutputSnippet).toBe('Hello from the canonical snapshot');
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

  it('hydrates terminal snapshots with the concrete runtime when auto would make the toolbar misleading', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-auto-terminal');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitOpen();
      socket.emitMessage({
        type: 'execution_status',
        executionId: 'exec-auto-terminal',
        workflowId: 'workflow-1',
        status: 'completed',
        runtimeProvider: 'codex',
        activeProvider: 'codex',
        providerStrategy: { mode: 'auto', activeProvider: 'codex' },
        workflowDef: { id: 'workflow-1', nodes: [], edges: [] },
        agentStates: {
          'node-a': { status: 'done', spawnMode: 'stream-json' },
        },
      });
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.runtimeProvider).toBe('codex');
      expect(state.providerStrategy).toEqual({ mode: 'auto', activeProvider: 'codex' });
      expect(state.selectedRuntimeProvider).toBe('codex');
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
      expect(state.agentStates['node-a'].lastOutputSnippet).toBe('Hello');
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
      const state = useSwarmStore.getState();
      const texts = state.chatMessages.map((message) => message.text);
      expect(texts).toContain('Hello');
      expect(texts).toContain('fresh-terminal-text');
      expect(texts).not.toContain('stale-fragment');
      expect(state.agentStates['node-a'].lastOutputSnippet).toBe('Hello');
      expect(state.agentStates['node-b'].lastOutputSnippet).toBe('fresh-terminal-text');
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

  it('clears stale execution state when no persisted execution exists on mount', async () => {
    useSwarmStore.setState({
      activeExecutionId: 'stale-exec',
      executionStatus: 'running',
      agentStates: {
        'node-a': { status: 'running', spawnMode: 'stream-json' },
      },
      edgeCounters: { 'edge-a': 2 },
      interAgentFeed: [{ type: 'handoff_started', edgeId: 'edge-a' }],
    });

    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);

    await waitFor(() => {
      expect(swarmApi).toBeTruthy();
      const state = useSwarmStore.getState();
      expect(state.activeExecutionId).toBeNull();
      expect(state.executionStatus).toBe('idle');
      expect(state.agentStates).toEqual({});
      expect(state.edgeCounters).toEqual({});
      expect(state.interAgentFeed).toEqual([]);
    });
  });

  it('restores an active persisted execution and reconnects the websocket', async () => {
    window.localStorage.setItem('swarm-active-execution', JSON.stringify({
      executionId: 'exec-restore-active',
      workflowId: 'workflow-restore',
      status: 'running',
    }));
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/api/v1/swarm/exec-restore-active/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-restore-active',
            workflowId: 'workflow-restore',
            status: 'running',
            runtimeProvider: 'claude',
            providerStrategy: { mode: 'claude' },
            workflowDef: { id: 'workflow-restore', nodes: [], edges: [] },
            agentStates: {
              'node-a': { status: 'running', spawnMode: 'stream-json' },
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseSwarmHarness workflowId="workflow-restore" onReady={(api) => { swarmApi = api; }} />);

    await waitFor(() => {
      expect(swarmApi).toBeTruthy();
      expect(useSwarmStore.getState().activeExecutionId).toBe('exec-restore-active');
      expect(useSwarmStore.getState().executionStatus).toBe('running');
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toContain('executionId=exec-restore-active');
    });
  });

  it('restores terminal persisted executions from results without reconnecting the websocket', async () => {
    window.localStorage.setItem('swarm-active-execution', JSON.stringify({
      executionId: 'exec-restore-terminal',
      workflowId: 'workflow-terminal',
      status: 'completed',
    }));
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/api/v1/swarm/exec-restore-terminal/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-restore-terminal',
            workflowId: 'workflow-terminal',
            status: 'completed',
            workflowDef: { id: 'workflow-terminal', nodes: [], edges: [] },
            agentStates: {
              'node-a': { status: 'done', spawnMode: 'stream-json' },
            },
          }),
        });
      }
      if (String(url).endsWith('/api/v1/swarm/executions/exec-restore-terminal/results')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            agentOutputs: {
              'node-a': {
                finalText: 'Restored terminal result',
                handoffPayloads: [],
              },
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseSwarmHarness workflowId="workflow-terminal" onReady={(api) => { swarmApi = api; }} />);

    await waitFor(() => {
      expect(swarmApi).toBeTruthy();
      expect(useSwarmStore.getState().executionStatus).toBe('completed');
      expect(useSwarmStore.getState().agentResults['node-a']?.finalText).toBe('Restored terminal result');
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('reconciles a closed execution through history fallback when status refresh fails', async () => {
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/api/v1/swarm/exec-history/status')) {
        return Promise.reject(new Error('status unavailable'));
      }
      if (String(url).endsWith('/api/v1/swarm/history/workflow-history/exec-history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            execution: {
              status: 'completed',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseSwarmHarness workflowId="workflow-history" onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    useSwarmStore.setState({
      activeExecutionId: 'exec-history',
      executionStatus: 'running',
      workflowDef: { id: 'workflow-history', nodes: [], edges: [] },
      agentStates: {
        'node-a': { status: 'done', spawnMode: 'stream-json' },
      },
    });

    act(() => {
      swarmApi.connectWs('exec-history');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.close();
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.activeExecutionId).toBeNull();
      expect(state.executionStatus).toBe('completed');
      expect(state.wsConnected).toBe(false);
    });
  });

  it('updates inbox, feed, fallback, and trigger state for secondary websocket events', async () => {
    render(<UseSwarmHarness onReady={(api) => { swarmApi = api; }} />);
    await waitFor(() => expect(swarmApi).toBeTruthy());

    act(() => {
      swarmApi.connectWs('exec-events');
    });
    const socket = MockWebSocket.instances.at(-1);

    act(() => {
      socket.emitMessage({
        type: 'handoff_started',
        edgeId: 'edge-a',
        counter: 3,
        sourceNodeId: 'node-a',
        targetNodeId: 'node-b',
        payload: { summary: 'handoff payload' },
      });
      socket.emitMessage({
        type: 'handoff_completed',
        edgeId: 'edge-a',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-b',
      });
      socket.emitMessage({
        type: 'hitl_required',
        nodeId: 'node-a',
        item: {
          id: 'hitl-1',
          type: 'approval',
          message: 'Need approval',
          timestamp: 123,
        },
      });
      socket.emitMessage({
        type: 'hitl_resolved',
        itemId: 'hitl-1',
      });
      socket.emitMessage({
        type: 'runtime_provider_switch',
        fromProvider: 'claude',
        toProvider: 'codex',
        reason: 'quota',
        nodeId: 'node-a',
      });
      socket.emitMessage({
        type: 'trigger_fired',
        triggerId: 'trigger-a',
        firedAt: 111,
      });
      socket.emitMessage({
        type: 'trigger_status',
        triggerId: 'trigger-a',
        status: 'waiting',
      });
      socket.emitMessage({
        type: 'rss_item',
        nodeId: 'rss-1',
        guid: 'guid-1',
      });
    });

    await waitFor(() => {
      const state = useSwarmStore.getState();
      expect(state.edgeCounters['edge-a']).toBe(3);
      expect(state.agentStates['node-a'].handoffCount).toBe(1);
      expect(state.agentResults['node-a'].handoffPayloads).toHaveLength(1);
      expect(state.inboxItems).toEqual([]);
      expect(state.resolvedHitlIds).toContain('hitl-1');
      expect(state.chatMessages).toContainEqual(expect.objectContaining({
        role: 'hitl',
        text: 'Need approval',
        hitlItemId: 'hitl-1',
      }));
      expect(state.lastFallback).toEqual(expect.objectContaining({
        fromProvider: 'claude',
        toProvider: 'codex',
        reason: 'quota',
        nodeId: 'node-a',
      }));
      expect(state.triggerStates['trigger-a']).toEqual(expect.objectContaining({
        fired: true,
        status: 'waiting',
        fireCount: 1,
        lastFiredAt: 111,
      }));
      expect(state.triggerStates['rss-1']).toEqual(expect.objectContaining({
        fired: true,
        status: 'fired',
        fireCount: 1,
        lastItem: 'guid-1',
      }));
      expect(state.interAgentFeed).toHaveLength(4);
    });
  });
});
