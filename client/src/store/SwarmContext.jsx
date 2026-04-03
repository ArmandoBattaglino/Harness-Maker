import { create } from 'zustand';

const useSwarmStore = create((set, get) => ({
  // Execution state
  activeExecutionId: null,
  executionStatus: 'idle', // 'idle' | 'running' | 'paused' | 'blocked' | 'stopping' | 'stopped' | 'failed' | 'completed'
  runtimeBlocker: null,
  runtimeProvider: null,
  providerStrategy: null,
  lastFallback: null,
  agentStates: {},         // { [nodeId]: { status, lastOutputSnippet, handoffCount } }
  triggerStates: {},       // { [triggerId]: { fired, lastFiredAt, status } }
  edgeCounters: {},        // { [edgeId]: number }
  budget: { estimatedTokensUsed: 0, limitTokens: 0 },
  inboxItems: [],          // HITL pending approvals
  interAgentFeed: [],      // last 100 handoff events

  // Canvas navigation
  focusedDepartmentId: null,
  departmentStack: [],     // breadcrumb stack of department IDs

  // Selected node (for AgentInspector panel)
  selectedNodeId: null,

  // PTY Explosion — node whose terminal is shown full-screen
  ptyExplosionNodeId: null,

  // Workflow definition (persisted across view navigation — BUG-SWARM-3)
  workflowDef: null,

  // WS connection state
  wsConnected: false,

  // Actions
  setExecution: (id, status) => set({ activeExecutionId: id, executionStatus: status }),

  updateAgentState: (nodeId, patch) => set((state) => ({
    agentStates: { ...state.agentStates, [nodeId]: { ...state.agentStates[nodeId], ...patch } }
  })),

  updateTriggerState: (triggerId, patch) => set((state) => ({
    triggerStates: { ...state.triggerStates, [triggerId]: { ...state.triggerStates[triggerId], ...patch } }
  })),

  updateEdgeCounter: (edgeId, count) => set((state) => ({
    edgeCounters: { ...state.edgeCounters, [edgeId]: count }
  })),

  updateBudget: (used, limit) => set({ budget: { estimatedTokensUsed: used, limitTokens: limit } }),

  addInboxItem: (item) => set((state) => ({ inboxItems: [...state.inboxItems, item] })),

  resolveInboxItem: (itemId) => set((state) => ({
    inboxItems: state.inboxItems.filter((i) => i?.id !== itemId)
  })),

  addFeedEvent: (event) => set((state) => ({
    interAgentFeed: [...state.interAgentFeed, event].slice(-100)  // keep last 100
  })),

  setFocusedDepartment: (id) => set((state) => {
    // Avoid pushing duplicate if id is already the last item on the stack
    const lastId = state.departmentStack[state.departmentStack.length - 1];
    const shouldPush = id && lastId !== id;
    return {
      focusedDepartmentId: id,
      departmentStack: shouldPush ? [...state.departmentStack, id] : state.departmentStack,
    };
  }),

  navigateBreadcrumb: (index) => set((state) => {
    const newStack = state.departmentStack.slice(0, index);
    return {
      departmentStack: newStack,
      focusedDepartmentId: newStack.length > 0 ? newStack[newStack.length - 1] : null,
    };
  }),

  setPaused: () => set({ executionStatus: 'paused' }),
  setResumed: () => set({ executionStatus: 'running' }),

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setPtyExplosionNodeId: (id) => set({ ptyExplosionNodeId: id }),
  setWsConnected: (b) => set({ wsConnected: b }),

  setWorkflowDef: (def) => set({ workflowDef: def }),

  reset: () => set({
    activeExecutionId: null,
    executionStatus: 'idle',
    runtimeBlocker: null,
    runtimeProvider: null,
    providerStrategy: null,
    lastFallback: null,
    agentStates: {},
    triggerStates: {},
    edgeCounters: {},
    budget: { estimatedTokensUsed: 0, limitTokens: 0 },
    inboxItems: [],
    interAgentFeed: [],
    focusedDepartmentId: null,
    departmentStack: [],
    selectedNodeId: null,
    ptyExplosionNodeId: null,
    wsConnected: false,
    workflowDef: null,
  }),
}));

// Thin context wrapper for App.jsx compatibility (optional — components can use useSwarmStore directly)
export { useSwarmStore };
export default useSwarmStore;
