import { describe, it, expect, beforeEach } from 'vitest';
import { useSwarmStore } from './SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';

describe('SwarmContext client contracts', () => {
  beforeEach(() => {
    resetSwarmStore();
  });

  it('shallow-merges agent state patches without dropping previous fields', () => {
    const store = useSwarmStore.getState();

    store.updateAgentState('node-a', {
      status: 'running',
      handoffCount: 2,
      lastOutputSnippet: 'hello',
    });
    const startedAt = useSwarmStore.getState().agentStates['node-a'].timestamps.started;

    store.updateAgentState('node-a', {
      currentTool: {
        toolName: 'Edit',
        toolUseId: 'tool-1',
        partialArgs: '{}',
      },
    });

    const state = useSwarmStore.getState().agentStates['node-a'];
    expect(state.status).toBe('running');
    expect(state.handoffCount).toBe(2);
    expect(state.lastOutputSnippet).toBe('hello');
    expect(state.currentTool).toEqual({
      toolName: 'Edit',
      toolUseId: 'tool-1',
      partialArgs: '{}',
    });
    expect(state.timestamps.started).toBe(startedAt);
  });

  it('replaces matching assistant fragments with one canonical message while preserving order', () => {
    useSwarmStore.setState({
      chatMessages: [
        { role: 'system', text: 'System divider', timestamp: 50 },
        { nodeId: 'node-a', role: 'assistant', text: 'Hel', timestamp: 100, spawnMode: 'stream-json' },
        { nodeId: 'node-a', role: 'assistant', text: 'lo', timestamp: 101, spawnMode: 'stream-json' },
        { nodeId: 'node-b', role: 'assistant', text: 'Other', timestamp: 200, spawnMode: 'stream-json' },
      ],
    });

    useSwarmStore.getState().replaceNodeChatMessages(
      'node-a',
      {
        nodeId: 'node-a',
        role: 'assistant',
        text: 'Hello',
        timestamp: 150,
        spawnMode: 'stream-json',
      },
      (message) => (message.role === 'assistant' || !message.role) && message.spawnMode === 'stream-json',
    );

    expect(useSwarmStore.getState().chatMessages).toEqual([
      { role: 'system', text: 'System divider', timestamp: 50 },
      { nodeId: 'node-a', role: 'assistant', text: 'Hello', timestamp: 150, spawnMode: 'stream-json' },
      { nodeId: 'node-b', role: 'assistant', text: 'Other', timestamp: 200, spawnMode: 'stream-json' },
    ]);
  });

  it('ignores empty canonical replacements', () => {
    const originalMessages = [
      { nodeId: 'node-a', role: 'assistant', text: 'Hello', timestamp: 100, spawnMode: 'stream-json' },
    ];
    useSwarmStore.setState({ chatMessages: originalMessages });

    useSwarmStore.getState().replaceNodeChatMessages(
      'node-a',
      { nodeId: 'node-a', role: 'assistant', text: '', timestamp: 200, spawnMode: 'stream-json' },
      (message) => message.nodeId === 'node-a',
    );

    expect(useSwarmStore.getState().chatMessages).toEqual(originalMessages);
  });

  it('resolves wrapped and flat inbox items and tracks resolved ids', () => {
    useSwarmStore.setState({
      inboxItems: [
        { item: { id: 'wrapped-1', status: 'pending' } },
        { id: 'flat-2', status: 'pending' },
      ],
      resolvedHitlIds: [],
    });

    useSwarmStore.getState().resolveInboxItem('wrapped-1');
    expect(useSwarmStore.getState().inboxItems).toEqual([
      { id: 'flat-2', status: 'pending' },
    ]);
    expect(useSwarmStore.getState().resolvedHitlIds).toContain('wrapped-1');
  });

  it('clears stale execution state when switching to a different workflow id', () => {
    useSwarmStore.setState({
      activeExecutionId: 'exec-1',
      executionStatus: 'running',
      agentStates: {
        'node-a': { status: 'running', canonicalReceived: true },
      },
      chatMessages: [
        { nodeId: 'node-a', role: 'assistant', text: 'stale', timestamp: 1 },
      ],
      packRun: { packId: 'pack-1' },
      packResult: { outputs: { result: 'stale' } },
      workflowDef: { id: 'workflow-old', nodes: [], edges: [] },
    });

    useSwarmStore.getState().setWorkflowDef({ id: 'workflow-new', nodes: [], edges: [] });

    const state = useSwarmStore.getState();
    expect(state.activeExecutionId).toBeNull();
    expect(state.executionStatus).toBe('idle');
    expect(state.agentStates).toEqual({});
    expect(state.chatMessages).toEqual([]);
    expect(state.packRun).toBeNull();
    expect(state.packResult).toBeNull();
    expect(state.workflowDef).toEqual({ id: 'workflow-new', nodes: [], edges: [] });
  });

  it('hydrates additive pack runtime metadata without touching workflow execution state', () => {
    useSwarmStore.getState().hydratePackRuntime({
      packRun: { packId: 'pack-1', packVersion: '1.0.0' },
      packResult: { outputs: { result: 'Done' }, artifacts: [] },
    });

    const state = useSwarmStore.getState();
    expect(state.packRun).toEqual({ packId: 'pack-1', packVersion: '1.0.0' });
    expect(state.packResult.outputs.result).toBe('Done');
    expect(state.activeExecutionId).toBeNull();
  });

  it('preserves the selected runtime provider and chat history when reset clears execution state', () => {
    const chatMessages = [
      { nodeId: 'node-a', role: 'assistant', text: 'Done', timestamp: 1 },
    ];
    useSwarmStore.setState({
      selectedRuntimeProvider: 'codex',
      activeExecutionId: 'exec-1',
      executionStatus: 'completed',
      runtimeProvider: 'codex',
      providerStrategy: { mode: 'codex' },
      chatMessages,
    });

    useSwarmStore.getState().reset();

    const state = useSwarmStore.getState();
    expect(state.activeExecutionId).toBeNull();
    expect(state.executionStatus).toBe('idle');
    expect(state.chatMessages).toEqual(chatMessages);
    expect(state.selectedRuntimeProvider).toBe('codex');
  });
});
