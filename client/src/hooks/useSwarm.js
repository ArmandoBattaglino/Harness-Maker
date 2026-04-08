// useSwarm.js — WebSocket hook for swarm execution control and live state updates.
import { useEffect, useRef, useCallback } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiGet, apiPost, apiDelete } from './useApi.js';

const EXECUTION_STORAGE_KEY = 'swarm-active-execution';
const STREAM_JSON_THINKING_PLACEHOLDER = 'Thinking block captured for this turn.';

function createPendingStreamJsonTurn() {
  return {
    toolUse: [],
    sawThinking: false,
    cost: null,
  };
}

function readStoredExecution() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredExecution(snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures; live runtime state still works in-memory.
  }
}

function clearStoredExecution() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(EXECUTION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function useSwarm(workflowId) {
  const wsRef = useRef(null);
  const setExecution = useSwarmStore((s) => s.setExecution);
  const setWorkflowDef = useSwarmStore((s) => s.setWorkflowDef);
  const updateAgentState = useSwarmStore((s) => s.updateAgentState);
  const updateEdgeCounter = useSwarmStore((s) => s.updateEdgeCounter);
  const updateBudget = useSwarmStore((s) => s.updateBudget);
  const addInboxItem = useSwarmStore((s) => s.addInboxItem);
  const resolveInboxItem = useSwarmStore((s) => s.resolveInboxItem);
  const addFeedEvent = useSwarmStore((s) => s.addFeedEvent);
  const addChatMessage = useSwarmStore((s) => s.addChatMessage);
  const patchLatestChatMessage = useSwarmStore((s) => s.patchLatestChatMessage);
  const updateTriggerState = useSwarmStore((s) => s.updateTriggerState);
  const setWsConnected = useSwarmStore((s) => s.setWsConnected);
  const clearExecutionState = useSwarmStore((s) => s.clearExecutionState);
  const pendingStreamJsonTurnsRef = useRef({});

  const getPendingStreamJsonTurn = useCallback((nodeId) => {
    if (!nodeId) return createPendingStreamJsonTurn();
    if (!pendingStreamJsonTurnsRef.current[nodeId]) {
      pendingStreamJsonTurnsRef.current[nodeId] = createPendingStreamJsonTurn();
    }
    return pendingStreamJsonTurnsRef.current[nodeId];
  }, []);

  const resetPendingStreamJsonTurn = useCallback((nodeId) => {
    if (!nodeId) return;
    delete pendingStreamJsonTurnsRef.current[nodeId];
  }, []);

  const flushPendingStreamJsonTurn = useCallback((nodeId) => {
    const pendingTurn = pendingStreamJsonTurnsRef.current[nodeId];
    if (!pendingTurn) return;

    const patch = { spawnMode: 'stream-json' };
    if (pendingTurn.toolUse.length > 0) {
      patch.toolUse = pendingTurn.toolUse.map((tool) => ({ ...tool }));
    }
    if (pendingTurn.sawThinking) {
      patch.thinking = STREAM_JSON_THINKING_PLACEHOLDER;
    }
    if (pendingTurn.cost) {
      patch.cost = { ...pendingTurn.cost };
    }

    patchLatestChatMessage(
      nodeId,
      patch,
      (message) => (message.role === 'assistant' || !message.role)
    );
    resetPendingStreamJsonTurn(nodeId);
  }, [patchLatestChatMessage, resetPendingStreamJsonTurn]);

  const applyExecutionSnapshot = useCallback(async (snapshot) => {
    const currentState = useSwarmStore.getState();
    const nextExecutionId = snapshot.executionId ?? currentState.activeExecutionId;
    const nextStatus = snapshot.status ?? currentState.executionStatus ?? 'running';

    useSwarmStore.setState({
      activeExecutionId: nextExecutionId,
      executionStatus: nextStatus,
      runtimeBlocker: Object.prototype.hasOwnProperty.call(snapshot, 'runtimeBlocker')
        ? snapshot.runtimeBlocker
        : nextStatus === 'blocked'
        ? currentState.runtimeBlocker
        : null,
      runtimeProvider: Object.prototype.hasOwnProperty.call(snapshot, 'runtimeProvider')
        ? snapshot.runtimeProvider
        : Object.prototype.hasOwnProperty.call(snapshot, 'activeProvider')
        ? snapshot.activeProvider
        : currentState.runtimeProvider,
      providerStrategy: Object.prototype.hasOwnProperty.call(snapshot, 'providerStrategy')
        ? snapshot.providerStrategy
        : currentState.providerStrategy,
      lastFallback: Object.prototype.hasOwnProperty.call(snapshot, 'lastFallback')
        ? snapshot.lastFallback
        : currentState.lastFallback,
      ...(snapshot.agentStates ? { agentStates: snapshot.agentStates } : {}),
      ...(snapshot.triggerStates ? { triggerStates: snapshot.triggerStates } : {}),
      ...(snapshot.edgeCounters ? { edgeCounters: snapshot.edgeCounters } : {}),
      ...(snapshot.budget ? { budget: snapshot.budget } : {}),
      ...(snapshot.inboxItems ? { inboxItems: snapshot.inboxItems } : {}),
      ...(snapshot.interAgentFeed ? { interAgentFeed: snapshot.interAgentFeed } : {}),
      ...(snapshot.chatMessages ? { chatMessages: snapshot.chatMessages } : {}),
    });

    const workflowIdToPersist = snapshot.workflowId ?? snapshot.workflowDef?.id ?? currentState.workflowDef?.id ?? null;
    if (nextExecutionId) {
      // Persist execution ID for both active and terminal states so that
      // agentResults can be rehydrated after navigating away and back.
      writeStoredExecution({ executionId: nextExecutionId, workflowId: workflowIdToPersist, status: nextStatus });
    } else {
      clearStoredExecution();
    }

    if (snapshot.workflowDef) {
      setWorkflowDef(snapshot.workflowDef);
      return { executionId: nextExecutionId, status: nextStatus };
    }

    const workflowIdToLoad = snapshot.workflowId ?? currentState.workflowDef?.id ?? null;
    if (!workflowIdToLoad) {
      return { executionId: nextExecutionId, status: nextStatus };
    }

    const existingWorkflow = currentState.workflowDef;
    if (existingWorkflow?.id === workflowIdToLoad) {
      return { executionId: nextExecutionId, status: nextStatus };
    }

    try {
      const workflowResponse = await apiGet(`/api/v1/workflows/${workflowIdToLoad}`);
      setWorkflowDef(workflowResponse?.workflow ?? workflowResponse);
    } catch {
      // Leave the current canvas state intact; runtime snapshot is still applied above.
    }

    return { executionId: nextExecutionId, status: nextStatus };
  }, [setWorkflowDef]);

  const reconcileClosedExecution = useCallback(async (executionId) => {
    if (!executionId) return;

    try {
      const status = await apiGet(`/api/v1/swarm/${executionId}/status`);
      await applyExecutionSnapshot(status);
      // Keep stored execution for terminal states so agentResults can be
      // rehydrated after navigating away and back (BUG-V8-2 fix).
      return;
    } catch {
      const currentState = useSwarmStore.getState();
      if (currentState.activeExecutionId !== executionId) return;

      const workflowId = currentState.workflowDef?.id ?? readStoredExecution()?.workflowId ?? null;
      if (workflowId) {
        try {
          const historyResponse = await apiGet(`/api/v1/swarm/history/${workflowId}/${executionId}`);
          const terminalExecution = historyResponse?.execution ?? historyResponse;
          if (terminalExecution?.status) {
            useSwarmStore.setState((state) => ({
              activeExecutionId: null,
              executionStatus: terminalExecution.status,
              wsConnected: false,
              runtimeBlocker: null,
              runtimeProvider: null,
              providerStrategy: null,
              lastFallback: null,
              agentStates: Object.keys(state.agentStates ?? {}).length > 0
                ? state.agentStates
                : state.agentStates,
            }));
            return;
          }
        } catch {
          // Fall through to stale-state cleanup below.
        }
      }

      const fallbackStatus = Object.values(currentState.agentStates ?? {}).some(
        (state) => state?.status === 'error' || state?.status === 'failed'
      )
        ? 'failed'
        : Object.values(currentState.agentStates ?? {}).length > 0
        && Object.values(currentState.agentStates ?? {}).every(
          (state) => ['done', 'completed', 'idle'].includes(state?.status)
        )
          ? 'completed'
          : 'stopped';

      useSwarmStore.setState({
        activeExecutionId: null,
        executionStatus: fallbackStatus,
        wsConnected: false,
        runtimeBlocker: null,
        runtimeProvider: null,
        providerStrategy: null,
        lastFallback: null,
      });
      clearStoredExecution();
    }
  }, [applyExecutionSnapshot]);

  const restorePersistedExecution = useCallback(async () => {
    if (wsRef.current) return;

    const stored = readStoredExecution();
    if (!stored?.executionId) {
      const currentState = useSwarmStore.getState();
      const hasStaleExecutionState = Boolean(
        currentState.activeExecutionId ||
        currentState.executionStatus !== 'idle' ||
        Object.keys(currentState.agentStates ?? {}).length > 0 ||
        Object.keys(currentState.edgeCounters ?? {}).length > 0 ||
        currentState.interAgentFeed?.length > 0
      );
      if (hasStaleExecutionState) {
        clearExecutionState();
      }
      return;
    }

    let status;
    try {
      const res = await fetch(`/api/v1/swarm/${stored.executionId}/status`);
      if (!res.ok) {
        // 404 means the execution no longer exists on the server — clear stale ID.
        clearStoredExecution();
        clearExecutionState();
        return;
      }
      status = await res.json();
    } catch {
      // Network error — clear stale state to avoid perpetual retries.
      clearStoredExecution();
      clearExecutionState();
      return;
    }

    const snapshot = {
      ...status,
      workflowId: status.workflowId ?? stored.workflowId ?? null,
    };
    const hydrated = await applyExecutionSnapshot(snapshot);

    if (['stopped', 'completed', 'failed'].includes(hydrated.status)) {
      // Rehydrate agentResults so red dots and output panels survive navigation
      try {
        const resultsResp = await fetch(`/api/v1/swarm/executions/${stored.executionId}/results`);
        if (resultsResp.ok) {
          const resultsData = await resultsResp.json();
          if (resultsData?.agentOutputs) {
            useSwarmStore.getState().hydrateAgentResults(resultsData.agentOutputs);
          }
        }
      } catch {
        // Silent — output panel just won't have data
      }
      return;
    }

    connectWs(stored.executionId);
  }, [applyExecutionSnapshot, clearExecutionState]);

  // Connect WS for a running execution
  const connectWs = useCallback((executionId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/swarm?executionId=${executionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (wsRef.current === ws) {
        setWsConnected(true);
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setWsConnected(false);
        void reconcileClosedExecution(executionId);
      }
    };
    ws.onerror = () => {
      if (wsRef.current === ws) {
        setWsConnected(false);
      }
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'agent_tool_use':
          getPendingStreamJsonTurn(msg.nodeId).toolUse.push({
            toolName: msg.toolName ?? 'unknown',
            toolUseId: msg.toolUseId ?? '',
            partialArgs: '',
          });
          updateAgentState(msg.nodeId, {
            currentTool: {
              toolName: msg.toolName,
              toolUseId: msg.toolUseId,
              partialArgs: '',
            },
          });
          break;
        case 'agent_tool_delta': {
          const currentTool = useSwarmStore.getState().agentStates[msg.nodeId]?.currentTool;
          const pendingTurn = getPendingStreamJsonTurn(msg.nodeId);
          const toolUseId = msg.toolUseId ?? currentTool?.toolUseId ?? '';
          const toolName = currentTool?.toolName ?? 'unknown';
          let toolIndex = -1;
          for (let i = pendingTurn.toolUse.length - 1; i >= 0; i -= 1) {
            const tool = pendingTurn.toolUse[i];
            if (tool.toolUseId === toolUseId || (!toolUseId && tool.toolName === toolName)) {
              toolIndex = i;
              break;
            }
          }
          if (toolIndex >= 0) {
            pendingTurn.toolUse[toolIndex] = {
              ...pendingTurn.toolUse[toolIndex],
              partialArgs: `${pendingTurn.toolUse[toolIndex].partialArgs ?? ''}${msg.partialJson ?? ''}`,
            };
          } else {
            pendingTurn.toolUse.push({
              toolName,
              toolUseId,
              partialArgs: msg.partialJson ?? '',
            });
          }
          updateAgentState(msg.nodeId, {
            currentTool: {
              toolName: currentTool?.toolName ?? 'unknown',
              toolUseId: toolUseId,
              partialArgs: `${currentTool?.partialArgs ?? ''}${msg.partialJson ?? ''}`,
            },
          });
          break;
        }
        case 'agent_thinking':
          if (msg.active) {
            getPendingStreamJsonTurn(msg.nodeId).sawThinking = true;
          }
          updateAgentState(msg.nodeId, { isThinking: Boolean(msg.active) });
          break;
        case 'agent_cost': {
          const previousTotal = useSwarmStore.getState().agentStates[msg.nodeId]?.totalCost ?? {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
          };

          updateAgentState(msg.nodeId, {
            turnCost: {
              inputTokens: msg.inputTokens ?? 0,
              outputTokens: msg.outputTokens ?? 0,
              cacheReadTokens: msg.cacheReadTokens ?? 0,
              cacheWriteTokens: msg.cacheWriteTokens ?? 0,
              costUsd: msg.costUsd ?? 0,
              durationMs: msg.durationMs ?? 0,
            },
            totalCost: {
              inputTokens: previousTotal.inputTokens + (msg.inputTokens ?? 0),
              outputTokens: previousTotal.outputTokens + (msg.outputTokens ?? 0),
              cacheReadTokens: (previousTotal.cacheReadTokens ?? 0) + (msg.cacheReadTokens ?? 0),
              cacheWriteTokens: (previousTotal.cacheWriteTokens ?? 0) + (msg.cacheWriteTokens ?? 0),
              costUsd: previousTotal.costUsd + (msg.costUsd ?? 0),
            },
          });
          getPendingStreamJsonTurn(msg.nodeId).cost = {
            inputTokens: msg.inputTokens ?? 0,
            outputTokens: msg.outputTokens ?? 0,
            cacheReadTokens: msg.cacheReadTokens ?? 0,
            cacheWriteTokens: msg.cacheWriteTokens ?? 0,
            costUsd: msg.costUsd ?? 0,
            durationMs: msg.durationMs ?? 0,
          };
          flushPendingStreamJsonTurn(msg.nodeId);
          break;
        }
        case 'agent_status':
          updateAgentState(msg.nodeId, {
            status: msg.status,
            ...(Object.prototype.hasOwnProperty.call(msg, 'spawnMode')
              ? { spawnMode: msg.spawnMode }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(msg, 'runtimeProvider')
              ? { runtimeProvider: msg.runtimeProvider }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(msg, 'runtimeBlocker')
              ? { runtimeBlocker: msg.runtimeBlocker }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(msg, 'sessionId') ? { sessionId: msg.sessionId } : {}),
            ...(Object.prototype.hasOwnProperty.call(msg, 'lastOutputSnippet')
              ? { lastOutputSnippet: msg.lastOutputSnippet }
              : {}),
            ...(['done', 'idle'].includes(msg.status)
              ? { currentTool: null, isThinking: false }
              : {}),
          });
          if (
            (msg.spawnMode === 'stream-json' || useSwarmStore.getState().agentStates[msg.nodeId]?.spawnMode === 'stream-json')
            && ['done', 'idle', 'error', 'failed'].includes(msg.status)
          ) {
            flushPendingStreamJsonTurn(msg.nodeId);
          }
          break;
        case 'handoff_started': {
          updateEdgeCounter(msg.edgeId, msg.counter);
          addFeedEvent({ ...msg, timestamp: Date.now() });
          const sourceAgent = useSwarmStore.getState().agentStates[msg.sourceNodeId];
          const currentHandoffCount = sourceAgent?.handoffCount ?? 0;
          updateAgentState(msg.sourceNodeId, { handoffCount: currentHandoffCount + 1 });
          // Track handoff payload in agentResults if present
          if (msg.sourceNodeId && msg.payload) {
            useSwarmStore.getState().setAgentHandoffPayload(msg.sourceNodeId, msg.targetNodeId, msg.payload);
          }
          break;
        }
        case 'handoff_completed':
          addFeedEvent({ ...msg, timestamp: Date.now() });
          break;
        case 'execution_status': {
          // Clear previous agentResults when a new execution starts running
          if (msg.status === 'running') {
            const currentExecId = useSwarmStore.getState().activeExecutionId;
            const incomingExecId = msg.executionId ?? currentExecId;
            if (incomingExecId !== currentExecId) {
              useSwarmStore.getState().clearAgentResults();
            }
          }
          void applyExecutionSnapshot(msg).then(({ status }) => {
            if (['stopped', 'completed', 'failed'].includes(status) && wsRef.current === ws) {
              // Delay WS close to allow trailing chat_message events to arrive.
              // The ChatExtractor may flush final messages after execution_status
              // is broadcast, and closing immediately loses them.
              setTimeout(() => {
                if (wsRef.current === ws) ws.close();
              }, 3000);
            }
            // Hydrate agentResults from persisted data on terminal states.
            // Delay the fetch to give ChatExtractor time to flush final messages
            // (echo gate timeout + silence timeout can deliver output after the
            // execution_status:completed event).
            if (['completed', 'stopped', 'failed'].includes(status)) {
              const execId = msg.executionId || useSwarmStore.getState().activeExecutionId;
              if (execId) {
                const fetchResults = () => {
                  fetch(`/api/v1/swarm/executions/${execId}/results`)
                    .then((resp) => {
                      if (resp.ok) return resp.json();
                      return null;
                    })
                    .then((data) => {
                      if (data?.agentOutputs) {
                        useSwarmStore.getState().hydrateAgentResults(data.agentOutputs);
                      }
                      // Hydrate chat messages from server-stored data (dedup by timestamp+nodeId)
                      if (data?.chatMessages && Array.isArray(data.chatMessages)) {
                        const store = useSwarmStore.getState();
                        const existing = new Set(
                          store.chatMessages.map(m => `${m.nodeId}:${m.timestamp}`)
                        );
                        // Track latest assistant message per nodeId for snippet update
                        const latestAssistantByNode = new Map();
                        for (const cm of data.chatMessages) {
                          const key = `${cm.nodeId}:${cm.timestamp}`;
                          if (!existing.has(key)) {
                            store.addChatMessage(cm);
                            existing.add(key);
                          }
                          // Track latest assistant message for node snippet hydration
                          if ((cm.role === 'assistant' || !cm.role) && cm.nodeId && cm.text) {
                            latestAssistantByNode.set(cm.nodeId, cm.text);
                          }
                        }
                        // Update node snippets with clean chat text from REST data
                        // (fixes garbled snippets when WS chat_message arrived after close)
                        for (const [nodeId, text] of latestAssistantByNode) {
                          updateAgentState(nodeId, { lastChatSnippet: text });
                        }
                      }
                    })
                    .catch(() => {
                      // Silently skip — WS-accumulated data is still available
                    });
                };
                // First immediate fetch for fast terminal states
                fetchResults();
                // Delayed fetches to capture late ChatExtractor flushes.
                // Echo gate timeout (7s) + silence timeout (5s) = ~12s max
                // after execution start before all chat messages are emitted.
                setTimeout(fetchResults, 5000);
                setTimeout(fetchResults, 12000);
              }
            }
          });
          break;
        }
        case 'budget_update':
          updateBudget(msg.estimatedTokensUsed, msg.limitTokens);
          break;
        case 'circuit_breaker':
          addFeedEvent({ ...msg, timestamp: Date.now() });
          break;
        case 'hitl_required':
          addInboxItem(msg);
          // Inject HITL request as a special chat message so it appears inline
          addChatMessage({
            nodeId: msg.nodeId,
            role: 'hitl',
            text: (msg.item?.message || msg.item?.reason || msg.message || 'Approval required'),
            timestamp: msg.item?.timestamp || Date.now(),
            hitlItemId: msg.item?.id,
            hitlType: msg.item?.type || 'user_requested',
          });
          break;
        case 'hitl_resolved':
          resolveInboxItem(msg.itemId);
          break;
        case 'runtime_provider_switch':
          useSwarmStore.setState((state) => ({
            runtimeProvider: msg.toProvider ?? state.runtimeProvider,
            lastFallback: {
              fromProvider: msg.fromProvider ?? null,
              toProvider: msg.toProvider ?? null,
              reason: msg.reason ?? null,
              nodeId: msg.nodeId ?? null,
              detectedAt: Date.now(),
            },
          }));
          addFeedEvent({ ...msg, timestamp: Date.now() });
          break;
        case 'trigger_fired': {
          const tfId = msg.triggerId ?? msg.nodeId;
          const prevTf = useSwarmStore.getState().triggerStates[tfId] ?? {};
          updateTriggerState(tfId, {
            fired: true,
            status: 'fired',
            lastFiredAt: msg.firedAt ?? msg.timestamp ?? Date.now(),
            fireCount: (prevTf.fireCount ?? 0) + 1,
          });
          break;
        }
        case 'trigger_status':
          updateTriggerState(msg.triggerId ?? msg.nodeId, { status: msg.status });
          break;
        case 'rss_item': {
          const prevRss = useSwarmStore.getState().triggerStates[msg.nodeId] ?? {};
          updateTriggerState(msg.nodeId, {
            fired: true,
            status: 'fired',
            lastFiredAt: Date.now(),
            fireCount: (prevRss.fireCount ?? 0) + 1,
            lastItem: msg.guid ?? null,
          });
          addFeedEvent({ ...msg, timestamp: Date.now() });
          break;
        }
        case 'chat_message': {
          const runtimeState = useSwarmStore.getState().agentStates[msg.nodeId];
          const isStreamJsonMessage = (msg.role === 'assistant' || !msg.role)
            && runtimeState?.spawnMode === 'stream-json';
          addChatMessage({
            nodeId: msg.nodeId,
            role: msg.role ?? 'assistant',
            text: msg.text,
            timestamp: msg.timestamp ?? Date.now(),
            ...(isStreamJsonMessage ? { spawnMode: 'stream-json' } : {}),
          });
          // Feed assistant messages into agentResults store + update node snippet
          // with clean chat text (Option B: replaces noisy raw PTY snippets)
          if ((msg.role === 'assistant' || (!msg.role)) && msg.nodeId && msg.text) {
            useSwarmStore.getState().appendAgentChatText(msg.nodeId, msg.text);
            updateAgentState(msg.nodeId, { lastChatSnippet: msg.text });
          }
          break;
        }
        default:
          break;
      }
    };

    wsRef.current = ws;
  }, [setWsConnected, updateAgentState, updateEdgeCounter, addFeedEvent, addChatMessage, setExecution, updateBudget, addInboxItem, resolveInboxItem, updateTriggerState, applyExecutionSnapshot, reconcileClosedExecution, getPendingStreamJsonTurn, flushPendingStreamJsonTurn]);

  // Start execution
  const startExecution = useCallback(async (projectId, projectPath, runtimeProvider = 'auto', runtimeModels = null, overrideWorkflowId = null) => {
    const effectiveId = overrideWorkflowId || workflowId;
    if (!effectiveId) throw new Error('No workflow selected');
    wsRef.current?.close();
    wsRef.current = null;
    pendingStreamJsonTurnsRef.current = {};
    clearExecutionState();
    const body = { projectId, projectPath, runtimeProvider };
    if (runtimeModels && typeof runtimeModels === 'object') {
      body.runtimeModels = runtimeModels;
    }
    const data = await apiPost(`/api/v1/swarm/${effectiveId}/start`, body);
    const { executionId } = data;
    setExecution(executionId, data.status ?? 'running');
    await applyExecutionSnapshot({ ...data, executionId, workflowId: effectiveId });
    connectWs(executionId);
    return executionId;
  }, [workflowId, setExecution, connectWs, applyExecutionSnapshot, clearExecutionState]);

  // Stop execution
  const stopExecution = useCallback(async (executionId) => {
    setExecution(executionId, 'stopping');
    await apiDelete(`/api/v1/swarm/${executionId}`);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const status = await apiGet(`/api/v1/swarm/${executionId}/status`).catch(() => null);
      if (status) {
        await applyExecutionSnapshot(status);
      } else {
        setExecution(executionId, 'stopped');
      }
    }
  }, [setExecution, applyExecutionSnapshot]);

  // Close WS when workflowId changes (new workflow generated while one was running)
  // and on unmount — BUG-TOOLBAR-2
  useEffect(() => {
    void restorePersistedExecution();
  }, [restorePersistedExecution]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [workflowId]);

  return { startExecution, stopExecution, connectWs };
}
