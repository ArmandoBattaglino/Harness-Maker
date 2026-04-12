// useSwarm.js — WebSocket hook for swarm execution control and live state updates.
import { useEffect, useRef, useCallback } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiGet, apiPost, apiDelete } from './useApi.js';
import { isStructuredSpawnMode } from '../utils/runtimeModes.js';
import { readStoredExecution, writeStoredExecution, clearStoredExecution } from '../utils/swarmExecutionStorage.js';
const STREAM_JSON_THINKING_PLACEHOLDER = 'Thinking block captured for this turn.';

function createPendingStreamJsonTurn() {
  return {
    toolUse: [],
    sawThinking: false,
    cost: null,
  };
}

function sameStructuredTurnId(leftTurnId, rightTurnId) {
  const normalizedLeft = leftTurnId ?? null;
  const normalizedRight = rightTurnId ?? null;
  if (normalizedLeft || normalizedRight) {
    return normalizedLeft === normalizedRight;
  }
  return true;
}

function shouldDropStructuredFragmentAfterCanonical(nodeState, msg) {
  if (!nodeState?.canonicalReceived) return false;
  const canonicalTurnId = nodeState.canonicalTurnId ?? null;
  const incomingTurnId = msg?.turnId ?? null;
  if (canonicalTurnId || incomingTurnId) {
    return canonicalTurnId === incomingTurnId;
  }
  return true;
}

function hasMessageableAgents(agentStates = {}) {
  return Object.values(agentStates ?? {}).some((state) => state?.acceptsMessages);
}

function getSnapshotSelectedRuntimeProvider(snapshot, fallbackProvider = 'auto') {
  const strategyMode = snapshot?.providerStrategy?.mode ?? null;
  const status = String(snapshot?.status ?? '').trim().toLowerCase();
  const isTerminalStatus = ['completed', 'stopped', 'failed'].includes(status);
  const runtimeProvider = snapshot?.runtimeProvider ?? snapshot?.activeProvider ?? null;

  if (['auto', 'claude', 'codex', 'gemini'].includes(strategyMode)) {
    if (
      strategyMode === 'auto'
      && isTerminalStatus
      && ['claude', 'codex', 'gemini'].includes(runtimeProvider)
    ) {
      return runtimeProvider;
    }
    return strategyMode;
  }

  if (['claude', 'codex', 'gemini'].includes(runtimeProvider)) {
    return runtimeProvider;
  }

  return fallbackProvider;
}

function buildLatestAssistantSnippetByNode(chatMessages = []) {
  if (!Array.isArray(chatMessages) || chatMessages.length === 0) {
    return {};
  }

  const latestSnippets = {};
  for (const message of chatMessages) {
    if (!message?.nodeId) continue;
    if (!(message.role === 'assistant' || !message.role)) continue;
    const text = String(message.text ?? '').trim();
    if (!text) continue;
    latestSnippets[message.nodeId] = text;
  }

  return latestSnippets;
}

function buildHydratedSnippetPatch(agentState, snippetText) {
  if (!snippetText) return {};
  if (isStructuredSpawnMode(agentState?.spawnMode)) {
    return {
      lastChatSnippet: snippetText,
      lastOutputSnippet: snippetText,
    };
  }
  return {
    lastChatSnippet: snippetText,
  };
}

function hydrateWorkflowRuntime(data) {
  if (!data?.workflowRun && !data?.workflowResult) return;
  useSwarmStore.setState({
    workflowRun: data.workflowRun ?? null,
    workflowResult: data.workflowResult ?? null,
  });
}

export function useSwarm(workflowId) {
  const wsRef = useRef(null);
  const wsReconnectCountRef = useRef(0);
  const wsReconnectTimerRef = useRef(null);
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
  const hydratePackRuntime = useSwarmStore((s) => s.hydratePackRuntime);
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

    const currentSpawnMode = useSwarmStore.getState().agentStates[nodeId]?.spawnMode;
    const patch = {
      spawnMode: isStructuredSpawnMode(currentSpawnMode) ? currentSpawnMode : 'stream-json',
    };
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

    // After hardReset(), ignore all snapshots for the execution that was
    // explicitly cleared.  Without this guard, WS broadcasts arriving after
    // the DELETE responses would re-establish activeExecutionId and repopulate
    // chatMessages/agentStates.
    if (nextExecutionId && nextExecutionId === currentState._hardResetExecutionId) {
      return { executionId: null, status: 'idle' };
    }

    const nextStatus = snapshot.status ?? currentState.executionStatus ?? 'running';
    const sameExecution = Boolean(nextExecutionId) && nextExecutionId === currentState.activeExecutionId;
    const snapshotChatMessages = Array.isArray(snapshot.chatMessages) ? snapshot.chatMessages : null;
    const latestAssistantSnippets = buildLatestAssistantSnippetByNode(snapshotChatMessages);

    // Normalize server-serialized agentStates to match client format.
    // Server uses flat fields (totalCostUsd, totalInputTokens, totalOutputTokens)
    // while client WS handler accumulates under nested totalCost object.
    // Merge both so cost/token data survives reconciliation after completion.
    let normalizedAgentStates = snapshot.agentStates;
    if (normalizedAgentStates && typeof normalizedAgentStates === 'object') {
      const clientAgentStates = currentState.agentStates ?? {};
      normalizedAgentStates = { ...normalizedAgentStates };
      for (const [nodeId, serverState] of Object.entries(normalizedAgentStates)) {
        const clientState = clientAgentStates[nodeId];
        // If server provides flat cost fields but no nested totalCost, synthesize it
        if (serverState && !serverState.totalCost && (serverState.totalCostUsd > 0 || serverState.totalInputTokens > 0)) {
          normalizedAgentStates[nodeId] = {
            ...serverState,
            totalCost: {
              costUsd: serverState.totalCostUsd ?? 0,
              inputTokens: serverState.totalInputTokens ?? 0,
              outputTokens: serverState.totalOutputTokens ?? 0,
              cacheReadTokens: serverState.totalCachedInputTokens ?? 0,
              cacheWriteTokens: 0,
            },
          };
        }
        // Preserve client-accumulated totalCost if server didn't provide cost data
        if (clientState?.totalCost && !normalizedAgentStates[nodeId].totalCost) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            totalCost: clientState.totalCost,
          };
        }
        // Preserve client turnCost (latest turn token counts for context % bar)
        if (clientState?.turnCost && !normalizedAgentStates[nodeId].turnCost) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            turnCost: clientState.turnCost,
          };
        }
        // Preserve client lastChatSnippet if server doesn't provide it
        if (clientState?.lastChatSnippet && !normalizedAgentStates[nodeId].lastChatSnippet) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            lastChatSnippet: clientState.lastChatSnippet,
          };
        }
        if (clientState?.lastOutputSnippet && !normalizedAgentStates[nodeId].lastOutputSnippet) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            lastOutputSnippet: clientState.lastOutputSnippet,
          };
        }
        if (latestAssistantSnippets[nodeId]) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            ...buildHydratedSnippetPatch(
              normalizedAgentStates[nodeId],
              latestAssistantSnippets[nodeId]
            ),
          };
        }
        if (sameExecution && clientState?.canonicalReceived && !normalizedAgentStates[nodeId].canonicalReceived) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            canonicalReceived: clientState.canonicalReceived,
          };
        }
        if (sameExecution && clientState?.canonicalTurnId && !normalizedAgentStates[nodeId].canonicalTurnId) {
          normalizedAgentStates[nodeId] = {
            ...normalizedAgentStates[nodeId],
            canonicalTurnId: clientState.canonicalTurnId,
          };
        }
      }
    }

    const _clientChatLen = currentState.chatMessages?.length ?? 0;
    const _snapChatLen = snapshotChatMessages?.length ?? -1;
    const _willReplace = snapshotChatMessages && (!sameExecution || _snapChatLen >= _clientChatLen);
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
      selectedRuntimeProvider: getSnapshotSelectedRuntimeProvider(
        snapshot,
        currentState.selectedRuntimeProvider ?? 'auto'
      ),
      ...(normalizedAgentStates ? { agentStates: normalizedAgentStates } : {}),
      ...(snapshot.triggerStates ? { triggerStates: snapshot.triggerStates } : {}),
      ...(snapshot.edgeCounters ? { edgeCounters: snapshot.edgeCounters } : {}),
      ...(snapshot.budget ? { budget: snapshot.budget } : {}),
      ...(snapshot.inboxItems ? { inboxItems: snapshot.inboxItems } : {}),
      ...(snapshot.interAgentFeed ? { interAgentFeed: snapshot.interAgentFeed } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, 'workflowRun') ? { workflowRun: snapshot.workflowRun } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, 'workflowResult') ? { workflowResult: snapshot.workflowResult } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, 'packRun') ? { packRun: snapshot.packRun } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, 'packResult') ? { packResult: snapshot.packResult } : {}),
      // Only accept server chatMessages when they belong to the same active
      // execution and are at least as rich as what the client accumulated via
      // WS.  After a hardReset (activeExecutionId === null) a stale snapshot
      // must not re-populate cleared chat state.
      ...(snapshotChatMessages && sameExecution && snapshotChatMessages.length >= (currentState.chatMessages?.length ?? 0)
        ? { chatMessages: snapshotChatMessages }
        : {}),
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
      setWorkflowDef(snapshot.workflowDef, { preserveExecutionState: true });
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
      setWorkflowDef(workflowResponse?.workflow ?? workflowResponse, { preserveExecutionState: true });
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
      return;
    } catch {
      const currentState = useSwarmStore.getState();
      if (currentState.activeExecutionId !== executionId) return;

      // Preserve activeExecutionId for terminal states so the chat panel,
      // agent results, and messaging controls remain accessible even when
      // the server WS drops or becomes temporarily unreachable.
      const isAlreadyTerminal = ['completed', 'stopped', 'failed'].includes(currentState.executionStatus);
      const hasExistingChatData = (currentState.chatMessages?.length ?? 0) > 0
        || Object.keys(currentState.agentStates ?? {}).length > 0;

      const workflowId = currentState.workflowDef?.id ?? readStoredExecution()?.workflowId ?? null;
      if (workflowId) {
        try {
          const historyResponse = await apiGet(`/api/v1/swarm/history/${workflowId}/${executionId}`);
          const terminalExecution = historyResponse?.execution ?? historyResponse;
          if (terminalExecution?.status) {
            useSwarmStore.setState((state) => ({
              activeExecutionId: isAlreadyTerminal || hasExistingChatData ? executionId : null,
              executionStatus: terminalExecution.status,
              wsConnected: false,
              runtimeBlocker: null,
              runtimeProvider: state.runtimeProvider,
              providerStrategy: state.providerStrategy,
              lastFallback: state.lastFallback,
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

      if (isAlreadyTerminal || hasExistingChatData) {
        useSwarmStore.setState({
          executionStatus: fallbackStatus,
          wsConnected: false,
          runtimeBlocker: null,
        });
      } else {
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
          if (resultsData?.packRun || resultsData?.packResult) {
            hydratePackRuntime({
              packRun: resultsData.packRun,
              packResult: resultsData.packResult,
            });
          }
          hydrateWorkflowRuntime(resultsData);
        }
      } catch {
        // Silent — output panel just won't have data
      }
      if (hasMessageableAgents(status?.agentStates)) {
        connectWs(stored.executionId);
      }
      return;
    }

    connectWs(stored.executionId);
  }, [applyExecutionSnapshot, clearExecutionState, hydratePackRuntime]);

  // Connect WS for a running execution
  const connectWs = useCallback((executionId, { isReconnect = false } = {}) => {
    clearTimeout(wsReconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.close();
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/swarm?executionId=${executionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (wsRef.current === ws) {
        wsReconnectCountRef.current = 0;
        setWsConnected(true);
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setWsConnected(false);
        void reconcileClosedExecution(executionId).then(() => {
          const liveState = useSwarmStore.getState();
          if (
            !wsRef.current
            && liveState.activeExecutionId === executionId
            && ['completed', 'stopped'].includes(liveState.executionStatus)
            && hasMessageableAgents(liveState.agentStates)
          ) {
            const attempt = wsReconnectCountRef.current;
            const MAX_WS_RECONNECTS = 5;
            if (attempt >= MAX_WS_RECONNECTS) return;
            wsReconnectCountRef.current = attempt + 1;
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            wsReconnectTimerRef.current = setTimeout(() => {
              connectWs(executionId, { isReconnect: true });
            }, delay);
          }
        });
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
        case 'agent_status': {
          const effectiveSpawnMode = msg.spawnMode ?? useSwarmStore.getState().agentStates[msg.nodeId]?.spawnMode;
          const shouldResetCanonicalGuard =
            isStructuredSpawnMode(effectiveSpawnMode)
            && ['running', 'idle'].includes(msg.status);
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
            ...(shouldResetCanonicalGuard
              ? { canonicalReceived: false, canonicalTurnId: null }
              : {}),
            ...(['done', 'idle'].includes(msg.status)
              ? { currentTool: null, isThinking: false }
              : {}),
          });
          if (
            (isStructuredSpawnMode(msg.spawnMode) || isStructuredSpawnMode(useSwarmStore.getState().agentStates[msg.nodeId]?.spawnMode))
            && ['done', 'idle', 'error', 'failed'].includes(msg.status)
          ) {
            flushPendingStreamJsonTurn(msg.nodeId);
          }
          break;
        }
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
            const liveState = useSwarmStore.getState();
            const keepWsForMessaging = hasMessageableAgents(liveState.agentStates);
            if (['stopped', 'completed', 'failed'].includes(status) && wsRef.current === ws && !keepWsForMessaging) {
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
                      if (data?.packRun || data?.packResult) {
                        hydratePackRuntime({
                          packRun: data.packRun,
                          packResult: data.packResult,
                        });
                      }
                      hydrateWorkflowRuntime(data);
                      // Hydrate chat messages from server-stored data (dedup by timestamp+nodeId)
                      if (data?.chatMessages && Array.isArray(data.chatMessages)) {
                        const store = useSwarmStore.getState();
                        const agentStates = store.agentStates;
                        const existing = new Set(
                          store.chatMessages.map((m) => `${m.nodeId}:${m.turnId ?? ''}:${m.timestamp}`)
                        );
                        // Track latest assistant message per nodeId for snippet update
                        const latestAssistantByNode = new Map();
                        for (const cm of data.chatMessages) {
                          // Skip assistant messages only when the same canonical turn is
                          // already present live. Earlier turns from the same node must
                          // remain visible after hydration.
                          const liveState = cm.nodeId ? agentStates[cm.nodeId] : null;
                          const alreadyHaveCanonicalTurn =
                            (cm.role === 'assistant' || !cm.role)
                            && cm.nodeId
                            && liveState?.canonicalReceived
                            && (
                              (cm.turnId && sameStructuredTurnId(liveState.canonicalTurnId, cm.turnId))
                              || (!cm.turnId && !liveState.canonicalTurnId)
                            )
                            && store.chatMessages.some(
                              (message) =>
                                message?.nodeId === cm.nodeId
                                && (message.role === 'assistant' || !message.role)
                                && sameStructuredTurnId(message.turnId, cm.turnId)
                            );
                          if (alreadyHaveCanonicalTurn) {
                            continue;
                          }
                          const key = `${cm.nodeId}:${cm.turnId ?? ''}:${cm.timestamp}`;
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
                          updateAgentState(
                            nodeId,
                            buildHydratedSnippetPatch(agentStates[nodeId], text)
                          );
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
          addChatMessage({
            nodeId: msg.nodeId,
            role: 'hitl',
            text: (msg.item?.message || msg.item?.reason || msg.message || 'Approval required'),
            timestamp: msg.item?.timestamp || Date.now(),
            hitlItemId: msg.item?.id,
            hitlType: msg.item?.type || 'user_requested',
            hitlOptions: msg.item?.options || null,
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
          if (!msg.nodeId) break;
          const runtimeState = useSwarmStore.getState().agentStates[msg.nodeId];
          const isStructuredAssistantMessage = (msg.role === 'assistant' || !msg.role)
            && isStructuredSpawnMode(msg.spawnMode ?? runtimeState?.spawnMode);
          const messageTurnId = msg.turnId ?? null;

          if (msg.isCanonical) {
            // Guard: empty canonical text must not destroy existing messages (BUG-CHAT-CLIENT-15)
            if (!msg.text) {
              updateAgentState(msg.nodeId, { canonicalReceived: true, canonicalTurnId: messageTurnId });
              break;
            }
            // Mark canonical received BEFORE processing to block any trailing fragments
            // that arrive during the WS close delay (BUG-CHAT-CLIENT-1/3)
            updateAgentState(msg.nodeId, { canonicalReceived: true, canonicalTurnId: messageTurnId });
            // Canonical result text from Claude CLI: replace ALL streamed text_delta
            // fragment messages with a single message containing the correctly assembled
            // text.  Previously we only patched the last fragment, leaving earlier
            // fragments in the chatMessages array — the ChatPanel grouping then
            // concatenated stale fragments + canonical text, producing duplicated or
            // truncated output (BUG-CHAT-3).
            const currentSpawnMode = useSwarmStore.getState().agentStates[msg.nodeId]?.spawnMode;
            updateAgentState(
              msg.nodeId,
              buildHydratedSnippetPatch(
                { spawnMode: currentSpawnMode ?? msg.spawnMode ?? 'stream-json' },
                msg.text
              )
            );
            useSwarmStore.getState().replaceNodeChatMessages(
              msg.nodeId,
              {
                nodeId: msg.nodeId,
                role: 'assistant',
                text: msg.text,
                timestamp: msg.timestamp ?? Date.now(),
                spawnMode: currentSpawnMode ?? 'stream-json',
                ...(messageTurnId ? { turnId: messageTurnId } : {}),
              },
              (m) =>
                (m.role === 'assistant' || !m.role)
                && isStructuredSpawnMode(m.spawnMode)
                && (
                  sameStructuredTurnId(m.turnId, messageTurnId)
                  || (messageTurnId && !m.turnId && m.timestamp === msg.timestamp)
                ),
            );
            // Rebuild agentResults.finalText from ALL assistant chatMessages
            // for this node (not just the current turn's canonical text).
            // replaceAgentChatText previously replaced the entire finalText,
            // discarding prior turns in multi-turn agents.
            const updatedMessages = useSwarmStore.getState().chatMessages;
            const nodeAssistantTexts = updatedMessages
              .filter((m) => m.nodeId === msg.nodeId && (m.role === 'assistant' || !m.role) && m.text)
              .map((m) => m.text);
            const rebuiltText = nodeAssistantTexts.join('\n\n').trim();
            useSwarmStore.getState().replaceAgentChatText(msg.nodeId, rebuiltText || msg.text);
          } else {
            // Drop trailing text_delta fragments that arrive after canonical for structured
            // assistant messages — prevents duplicate/corrupted output (BUG-CHAT-CLIENT-1/3)
            const nodeState = useSwarmStore.getState().agentStates[msg.nodeId];
            if (
              (msg.role === 'assistant' || !msg.role)
              && shouldDropStructuredFragmentAfterCanonical(nodeState, msg)
            ) {
              break;
            }
            addChatMessage({
              nodeId: msg.nodeId,
              role: msg.role ?? 'assistant',
              text: msg.text,
              timestamp: msg.timestamp ?? Date.now(),
              ...(messageTurnId ? { turnId: messageTurnId } : {}),
              ...(isStructuredAssistantMessage
                ? { spawnMode: msg.spawnMode ?? runtimeState?.spawnMode ?? 'stream-json' }
                : {}),
            });
            // Feed assistant messages into agentResults store + update node snippet
            if ((msg.role === 'assistant' || (!msg.role)) && msg.nodeId && msg.text) {
              useSwarmStore.getState().appendAgentChatText(msg.nodeId, msg.text);
              const prevSnippet = useSwarmStore.getState().agentStates[msg.nodeId]?.lastChatSnippet || '';
              updateAgentState(msg.nodeId, { lastChatSnippet: prevSnippet + msg.text });
            }
          }
          break;
        }
        default:
          break;
      }
    };

    wsRef.current = ws;
  }, [setWsConnected, updateAgentState, updateEdgeCounter, addFeedEvent, addChatMessage, setExecution, updateBudget, addInboxItem, resolveInboxItem, updateTriggerState, applyExecutionSnapshot, reconcileClosedExecution, getPendingStreamJsonTurn, flushPendingStreamJsonTurn, hydratePackRuntime]);

  // Start execution
  const startExecution = useCallback(async (projectId, projectPath, runtimeProvider = 'auto', runtimeModels = null, overrideWorkflowId = null, workflowInput = {}) => {
    const effectiveId = overrideWorkflowId || workflowId;
    if (!effectiveId) throw new Error('No workflow selected');
    clearTimeout(wsReconnectTimerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    wsReconnectCountRef.current = 0;
    pendingStreamJsonTurnsRef.current = {};
    clearExecutionState();
    const body = { projectId, projectPath, runtimeProvider, workflowInput: workflowInput ?? {} };
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
      clearTimeout(wsReconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [workflowId]);

  return { startExecution, stopExecution, connectWs };
}
