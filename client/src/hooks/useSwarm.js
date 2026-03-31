// useSwarm.js — WebSocket hook for swarm execution control and live state updates.
import { useEffect, useRef, useCallback } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiPost, apiDelete } from './useApi.js';

export function useSwarm(workflowId) {
  const wsRef = useRef(null);
  const setExecution = useSwarmStore((s) => s.setExecution);
  const updateAgentState = useSwarmStore((s) => s.updateAgentState);
  const updateEdgeCounter = useSwarmStore((s) => s.updateEdgeCounter);
  const updateBudget = useSwarmStore((s) => s.updateBudget);
  const addInboxItem = useSwarmStore((s) => s.addInboxItem);
  const addFeedEvent = useSwarmStore((s) => s.addFeedEvent);
  const setWsConnected = useSwarmStore((s) => s.setWsConnected);
  // Connect WS for a running execution
  const connectWs = useCallback((executionId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/swarm?executionId=${executionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'agent_status':
          updateAgentState(msg.nodeId, { status: msg.status });
          break;
        case 'handoff_started': {
          updateEdgeCounter(msg.edgeId, msg.counter);
          addFeedEvent({ ...msg, timestamp: Date.now() });
          const sourceAgent = useSwarmStore.getState().agentStates[msg.sourceNodeId];
          const currentHandoffCount = sourceAgent?.handoffCount ?? 0;
          updateAgentState(msg.sourceNodeId, { handoffCount: currentHandoffCount + 1 });
          break;
        }
        case 'execution_status':
          setExecution(msg.executionId ?? null, msg.status ?? 'running');
          break;
        case 'budget_update':
          updateBudget(msg.estimatedTokensUsed, msg.limitTokens);
          break;
        case 'circuit_breaker':
          addFeedEvent({ ...msg, timestamp: Date.now() });
          break;
        case 'hitl_required':
          addInboxItem(msg);
          break;
        default:
          break;
      }
    };

    wsRef.current = ws;
  }, [setWsConnected, updateAgentState, updateEdgeCounter, addFeedEvent, setExecution, updateBudget, addInboxItem]);

  // Start execution
  const startExecution = useCallback(async (projectId, projectPath) => {
    const data = await apiPost(`/api/v1/swarm/${workflowId}/start`, { projectId, projectPath });
    const { executionId } = data;
    setExecution(executionId, 'running');
    connectWs(executionId);
    return executionId;
  }, [workflowId, setExecution, connectWs]);

  // Stop execution
  const stopExecution = useCallback(async (executionId) => {
    await apiDelete(`/api/v1/swarm/${executionId}`);
    setExecution(null, 'stopped');
    wsRef.current?.close();
  }, [setExecution]);

  // Close WS when workflowId changes (new workflow generated while one was running)
  // and on unmount — BUG-TOOLBAR-2
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [workflowId]);

  return { startExecution, stopExecution, connectWs };
}
