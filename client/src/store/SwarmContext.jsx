import { create } from 'zustand';

/**
 * @typedef {Object} AgentTurnCost
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} costUsd
 * @property {number} durationMs
 */

/**
 * @typedef {Object} AgentTotalCost
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} costUsd
 */

/**
 * @typedef {Object} AgentCurrentTool
 * @property {string} toolName
 * @property {string} toolUseId
 * @property {string} partialArgs
 */

/**
 * Dynamic per-node runtime state stored in `agentStates[nodeId]`.
 *
 * Structured-runtime specific fields are added lazily through `updateAgentState`
 * when the corresponding WS events arrive; they are never pre-seeded in the
 * initial store state.
 *
 * @typedef {Object} SwarmAgentState
 * @property {string} [status]
 * @property {string} [lastOutputSnippet]
 * @property {number} [handoffCount]
 * @property {{ started?: string, done?: string, error?: string }} [timestamps]
 * @property {'stream-json' | 'codex-sdk' | 'pty'} [spawnMode]
 * @property {boolean} [isThinking]
 * @property {AgentCurrentTool | null} [currentTool]
 * @property {AgentTurnCost | null} [turnCost]
 * @property {AgentTotalCost | null} [totalCost]
 * @property {boolean} [canonicalReceived] - Set to true when a canonical chat_message arrives for this node; blocks trailing text_delta fragments from corrupting the final output
 * @property {string | null} [canonicalTurnId] - Structured turn identifier for the canonical message currently guarding trailing fragments
 */

const buildClearedExecutionState = () => ({
  activeExecutionId: null,
  _hardResetExecutionId: null,
  executionStatus: 'idle',
  runtimeBlocker: null,
  runtimeProvider: null,
  providerStrategy: null,
  lastFallback: null,
  // Replacing the entire map clears all dynamic per-agent fields, including
  // spawnMode/isThinking/currentTool/turnCost/totalCost.
  agentStates: {},
  agentResults: {},
  triggerStates: {},
  edgeCounters: {},
  budget: { estimatedTokensUsed: 0, limitTokens: 0 },
  inboxItems: [],
  resolvedHitlIds: [],
  interAgentFeed: [],
  chatMessages: [],
  workflowRun: null,
  workflowResult: null,
  packRun: null,
  packResult: null,
  chatFilter: 'all',
  sidePanelMode: 'chat',
  sidePanelOpen: true,
  focusedDepartmentId: null,
  departmentStack: [],
  selectedNodeId: null,
  expandedOutputNodeId: null,
  expandedValidationNodeId: null,
  agentValidationIssuesByNodeId: {},
  ptyExplosionNodeId: null,
  wsConnected: false,
});

const useSwarmStore = create((set, get) => ({
  // Execution state
  activeExecutionId: null,
  executionStatus: 'idle', // 'idle' | 'running' | 'paused' | 'blocked' | 'stopping' | 'stopped' | 'failed' | 'completed'
  runtimeBlocker: null,
  runtimeProvider: null,
  providerStrategy: null,
  lastFallback: null,
  /** @type {Record<string, SwarmAgentState>} */
  agentStates: {},
  agentResults: {},        // { [nodeId]: { finalText, outputEntries?, handoffPayloads, viewed, updatedAt } }
  triggerStates: {},       // { [triggerId]: { fired, lastFiredAt, status } }
  edgeCounters: {},        // { [edgeId]: number }
  budget: { estimatedTokensUsed: 0, limitTokens: 0 },
  inboxItems: [],          // HITL pending approvals
  resolvedHitlIds: [],     // IDs of resolved HITL items (survives component remount)
  interAgentFeed: [],      // last 100 handoff events
  chatMessages: [],          // Unified chat view messages
  workflowRun: null,          // workflow-direct run inputs/contracts from status/results hydration
  workflowResult: null,       // workflow-native canonical outputs/artifacts from status/results hydration
  packRun: null,             // additive pack runtime metadata for pack-launched executions
  packResult: null,          // pack-shaped outputs/artifacts from status/results hydration
  chatFilter: 'all',         // 'all' or specific nodeId
  sidePanelMode: 'chat',     // 'feed' | 'chat' — which panel is shown

  // Canvas navigation
  focusedDepartmentId: null,
  departmentStack: [],     // breadcrumb stack of department IDs

  // Selected node (for AgentInspector panel)
  selectedNodeId: null,
  sidePanelOpen: true,

  // Expanded output card — which agent's floating output card is open on canvas
  expandedOutputNodeId: null,

  // Expanded validation card — which agent's floating validation card is open on canvas
  expandedValidationNodeId: null,

  // Agent-scoped validation issues keyed by nodeId for local node UI
  agentValidationIssuesByNodeId: {},

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

  addInboxItem: (item) => set((state) => ({
    inboxItems: [...state.inboxItems, item],
    // Auto-open chat panel when HITL arrives
    sidePanelOpen: true,
    sidePanelMode: 'chat',
  })),

  resolveInboxItem: (itemId) => set((state) => ({
    inboxItems: state.inboxItems.filter((i) => {
      const id = i?.item?.id ?? i?.id;
      return id !== itemId;
    }),
    // Track resolved IDs so HitlChatCard can show "resolved" even after remount
    resolvedHitlIds: [...(state.resolvedHitlIds || []), itemId],
  })),

  addFeedEvent: (event) => set((state) => ({
    interAgentFeed: [...state.interAgentFeed, event].slice(-100)  // keep last 100
  })),

  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, msg].slice(-500)  // keep last 500
  })),

  patchLatestChatMessage: (nodeId, patch, predicate = null) => set((state) => {
    const nextMessages = [...state.chatMessages];
    for (let i = nextMessages.length - 1; i >= 0; i -= 1) {
      const message = nextMessages[i];
      if (message?.nodeId !== nodeId) continue;
      if (typeof predicate === 'function' && !predicate(message)) continue;
      nextMessages[i] = { ...message, ...patch };
      return { chatMessages: nextMessages };
    }
    return state;
  }),

  /** Replace ALL matching assistant chat messages for a nodeId with a single canonical message.
   *  Used when a canonical result arrives to collapse all text_delta fragments into one clean message. */
  replaceNodeChatMessages: (nodeId, canonicalMsg, predicate = null) => set((state) => {
    // Guard: empty canonical text must not destroy existing messages (BUG-CHAT-CLIENT-15)
    if (!canonicalMsg?.text) return state;
    let firstMatchTimestamp = null;
    const filtered = state.chatMessages.filter((m) => {
      if (m.nodeId !== nodeId) return true;
      if (typeof predicate === 'function' && !predicate(m)) return true;
      // Remember the timestamp of the first matching message for ordering
      if (firstMatchTimestamp === null) firstMatchTimestamp = m.timestamp;
      return false; // remove this message
    });
    // Insert the canonical message where the first fragment was
    const insertIdx = filtered.findIndex(
      (m) => m.timestamp && firstMatchTimestamp && m.timestamp > firstMatchTimestamp
    );
    if (insertIdx >= 0) {
      filtered.splice(insertIdx, 0, canonicalMsg);
    } else {
      filtered.push(canonicalMsg);
    }
    return { chatMessages: filtered };
  }),

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
  setExpandedOutputNodeId: (id) => set((state) => ({
    expandedOutputNodeId: state.expandedOutputNodeId === id ? null : id,
    expandedValidationNodeId: state.expandedOutputNodeId === id ? state.expandedValidationNodeId : null,
  })),
  setExpandedValidationNodeId: (id) => set((state) => ({
    expandedValidationNodeId: state.expandedValidationNodeId === id ? null : id,
    expandedOutputNodeId: state.expandedValidationNodeId === id ? state.expandedOutputNodeId : null,
  })),
  setAgentValidationIssuesByNodeId: (issuesByNodeId) => set({
    agentValidationIssuesByNodeId: issuesByNodeId || {},
  }),
  setPtyExplosionNodeId: (id) => set({ ptyExplosionNodeId: id }),
  setWsConnected: (b) => set({ wsConnected: b }),

  setSelectedRuntimeProvider: (providerOrFn) => set((state) => ({
    selectedRuntimeProvider: typeof providerOrFn === 'function'
      ? providerOrFn(state.selectedRuntimeProvider)
      : providerOrFn,
  })),
  setWorkflowDef: (def, options = {}) => set((state) => {
    const preserveExecutionState = Boolean(options?.preserveExecutionState);
    const prevId = state.workflowDef?.id;
    const nextId = def?.id;
    const isSameWorkflow = prevId && nextId && prevId === nextId;
    // When switching to a DIFFERENT workflow (or from null to a new one while
    // execution state exists), clear all per-node runtime state so stale
    // status / chat / results from the previous execution don't bleed through.
    const hasStaleState = state.activeExecutionId !== null
      || state.executionStatus !== 'idle'
      || Object.keys(state.agentStates).length > 0;
    if (!preserveExecutionState && !isSameWorkflow && hasStaleState) {
      return { ...buildClearedExecutionState(), workflowDef: def };
    }
    return { workflowDef: def };
  }),

  // --- agentResults actions ---

  appendAgentChatText: (nodeId, text) => set((state) => {
    const prev = state.agentResults[nodeId] || { finalText: '', outputEntries: [], handoffPayloads: [], viewed: false, updatedAt: null };
    const separator = '';
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

  replaceAgentChatText: (nodeId, text) => set((state) => {
    const prev = state.agentResults[nodeId] || { finalText: '', outputEntries: [], handoffPayloads: [], viewed: false, updatedAt: null };
    return {
      agentResults: {
        ...state.agentResults,
        [nodeId]: {
          ...prev,
          finalText: text,
          viewed: false,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  setAgentHandoffPayload: (nodeId, target, payload) => set((state) => {
    const prev = state.agentResults[nodeId] || { finalText: '', outputEntries: [], handoffPayloads: [], viewed: false, updatedAt: null };
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
      const serverText = String(ao.finalText ?? '').trim();
      const clientText = String(existing?.finalText ?? '').trim();
      // Keep the client-accumulated finalText when it is substantially longer
      // than the server's version. The server's _resolveAgentFinalText scoring
      // can pick a truncated snippet; the WS canonical handler has the full text.
      const keepClientText = clientText.length > 0
        && serverText.length > 0
        && clientText.length > serverText.length * 2;
      agentResults[nodeId] = {
        finalText: keepClientText ? clientText : (serverText || clientText),
        outputEntries: Array.isArray(ao.outputEntries)
          ? ao.outputEntries.map((entry) => ({ ...entry }))
          : (existing?.outputEntries ?? []),
        handoffPayloads: ao.handoffPayloads || [],
        viewed: existing?.viewed ?? false,
        updatedAt: Date.now(),
      };
    }
    return { agentResults };
  }),

  hydratePackRuntime: ({ packRun, packResult }) => set((state) => ({
    packRun: packRun === undefined ? state.packRun : packRun,
    packResult: packResult === undefined ? state.packResult : packResult,
  })),

  clearAgentResults: () => set({ agentResults: {} }),

  clearExecutionState: () => set(buildClearedExecutionState()),

  reset: () => {
    // Clear persisted execution ID so navigation doesn't rehydrate stale results
    try { window.localStorage.removeItem('swarm-active-execution'); } catch { /* ignore */ }
    // Preserve chat history and feed so the user can review the conversation
    // after the execution ends.  Only clearExecutionState (called when a NEW
    // execution starts) should wipe chatMessages.
    const prev = get();
    return set({
      ...buildClearedExecutionState(),
      chatMessages: prev.chatMessages,
      interAgentFeed: prev.interAgentFeed,
      chatFilter: prev.chatFilter,
      sidePanelMode: prev.chatMessages.length > 0 ? 'chat' : prev.sidePanelMode,
    });
  },

  hardReset: () => {
    const prevExecId = get().activeExecutionId;
    try { window.localStorage.removeItem('swarm-active-execution'); } catch { /* ignore */ }
    return set({
      ...buildClearedExecutionState(),
      _hardResetExecutionId: prevExecId,
    });
  },
}));

// Thin context wrapper for App.jsx compatibility (optional — components can use useSwarmStore directly)
export { useSwarmStore };
export default useSwarmStore;
