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
  agentResults: {},        // { [nodeId]: { finalText, handoffPayloads, viewed, updatedAt } }
  triggerStates: {},       // { [triggerId]: { fired, lastFiredAt, status } }
  edgeCounters: {},        // { [edgeId]: number }
  budget: { estimatedTokensUsed: 0, limitTokens: 0 },
  inboxItems: [],          // HITL pending approvals
  interAgentFeed: [],      // last 100 handoff events
  chatMessages: [],          // Unified chat view messages
  chatFilter: 'all',         // 'all' or specific nodeId
  sidePanelMode: 'chat',     // 'feed' | 'chat' — which panel is shown

  // Canvas navigation
  focusedDepartmentId: null,
  departmentStack: [],     // breadcrumb stack of department IDs

  // Selected node (for AgentInspector panel)
  selectedNodeId: null,
  sidePanelOpen: true,

  // PTY Explosion — node whose terminal is shown full-screen
  ptyExplosionNodeId: null,

  // Runtime provider selection (persisted across view navigation — BUG-RUNTIME-SELECT-PERSIST-1)
  selectedRuntimeProvider: 'auto',

  // Workflow definition (persisted across view navigation — BUG-SWARM-3)
  workflowDef: null,

  // WS connection state
  wsConnected: false,

  // Actions
  setExecution: (id, status) => set({ activeExecutionId: id, executionStatus: status }),

  updateAgentState: (nodeId, patch) => set((state) => {
    const prev = state.agentStates[nodeId] || {};
    const timestamps = { ...(prev.timestamps || {}) };

    // Auto-set timestamps based on status transitions
    if (patch.status) {
      if (patch.status === 'running' && !timestamps.started) {
        timestamps.started = new Date().toISOString();
      }
      if (patch.status === 'done' || patch.status === 'completed') {
        timestamps.done = new Date().toISOString();
      }
      if (patch.status === 'error') {
        timestamps.error = new Date().toISOString();
      }
    }

    return {
      agentStates: {
        ...state.agentStates,
        [nodeId]: { ...prev, ...patch, timestamps },
      },
    };
  }),

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

  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, msg].slice(-500)  // keep last 500
  })),

  setChatFilter: (filter) => set({ chatFilter: filter }),
  setSidePanelMode: (mode) => set({ sidePanelMode: mode }),
  setSidePanelOpen: (open) => set({ sidePanelOpen: open }),

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

  setSelectedRuntimeProvider: (providerOrFn) => set((state) => ({
    selectedRuntimeProvider: typeof providerOrFn === 'function'
      ? providerOrFn(state.selectedRuntimeProvider)
      : providerOrFn,
  })),
  setWorkflowDef: (def) => set({ workflowDef: def }),

  // --- agentResults actions ---

  appendAgentChatText: (nodeId, text) => set((state) => {
    const prev = state.agentResults[nodeId] || { finalText: '', handoffPayloads: [], viewed: false, updatedAt: null };
    const separator = prev.finalText ? '\n\n' : '';
    return {
      agentResults: {
        ...state.agentResults,
        [nodeId]: {
          ...prev,
          finalText: prev.finalText + separator + text,
          viewed: false,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  setAgentHandoffPayload: (nodeId, target, payload) => set((state) => {
    const prev = state.agentResults[nodeId] || { finalText: '', handoffPayloads: [], viewed: false, updatedAt: null };
    return {
      agentResults: {
        ...state.agentResults,
        [nodeId]: {
          ...prev,
          handoffPayloads: [...prev.handoffPayloads, { target, payload, timestamp: Date.now() }],
          updatedAt: Date.now(),
        },
      },
    };
  }),

  markAgentResultViewed: (nodeId) => set((state) => {
    const prev = state.agentResults[nodeId];
    if (!prev) return state;
    return {
      agentResults: {
        ...state.agentResults,
        [nodeId]: { ...prev, viewed: true },
      },
    };
  }),

  hydrateAgentResults: (agentOutputs) => set((state) => {
    const agentResults = {};
    for (const nodeId of Object.keys(agentOutputs)) {
      const ao = agentOutputs[nodeId];
      const existing = state.agentResults[nodeId];
      agentResults[nodeId] = {
        finalText: ao.finalText,
        handoffPayloads: ao.handoffPayloads || [],
        viewed: existing?.viewed ?? false,
        updatedAt: Date.now(),
      };
    }
    return { agentResults };
  }),

  clearAgentResults: () => set({ agentResults: {} }),

  clearExecutionState: () => set({
    activeExecutionId: null,
    executionStatus: 'idle',
    runtimeBlocker: null,
    runtimeProvider: null,
    providerStrategy: null,
    lastFallback: null,
    agentStates: {},
    agentResults: {},
    triggerStates: {},
    edgeCounters: {},
    budget: { estimatedTokensUsed: 0, limitTokens: 0 },
    inboxItems: [],
    interAgentFeed: [],
    chatMessages: [],
    chatFilter: 'all',
    sidePanelMode: 'chat',
    sidePanelOpen: true,
    focusedDepartmentId: null,
    departmentStack: [],
    selectedNodeId: null,
    ptyExplosionNodeId: null,
    wsConnected: false,
  }),

  reset: () => {
    // Clear persisted execution ID so navigation doesn't rehydrate stale results
    try { window.localStorage.removeItem('swarm-active-execution'); } catch { /* ignore */ }
    return set({
      activeExecutionId: null,
      executionStatus: 'idle',
      runtimeBlocker: null,
      runtimeProvider: null,
      providerStrategy: null,
      lastFallback: null,
      agentStates: {},
      agentResults: {},
      triggerStates: {},
      edgeCounters: {},
      budget: { estimatedTokensUsed: 0, limitTokens: 0 },
      inboxItems: [],
      interAgentFeed: [],
      chatMessages: [],
      chatFilter: 'all',
      sidePanelMode: 'chat',
      sidePanelOpen: true,
      focusedDepartmentId: null,
      departmentStack: [],
      selectedNodeId: null,
      ptyExplosionNodeId: null,
      wsConnected: false,
    });
  },
}));

// Thin context wrapper for App.jsx compatibility (optional — components can use useSwarmStore directly)
export { useSwarmStore };
export default useSwarmStore;
