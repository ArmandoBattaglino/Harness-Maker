// server/services/SwarmEngine.js
// V3 Swarm Orchestrator — orchestration engine for multi-agent workflows.
// Manages workflow executions: spawns agent PTYs, routes handoffs, tracks budget.
// See DEC-014 for the swarmListeners tap design.

import { v4 as uuidv4 } from 'uuid';
import HandoffParser from './HandoffParser.js';

// ---------------------------------------------------------------------------
// WorkflowExecution shape (in-memory only, never persisted):
// {
//   executionId: string,
//   workflowId: string,
//   workflowDef: WorkflowDefinition,
//   status: 'running' | 'stopped',
//   agentStates: Map<nodeId, { sessionId, status, handoffCount, lastOutputSnippet }>,
//   edgeCounters: Map<edgeId, number>,
//   workflowContext: {},
//   heartbeatTimer: NodeJS.Timer | null,
//   inboxItems: []
// }
// ---------------------------------------------------------------------------

class SwarmEngine {
  /**
   * @param {import('./SessionManager.js').SessionManager} sessionManager
   * @param {import('./WorkflowStore.js').WorkflowStore} workflowStore
   */
  constructor(sessionManager, workflowStore) {
    this._sessionManager = sessionManager;
    this._workflowStore = workflowStore;
    this._executions = new Map();   // executionId -> WorkflowExecution
    this._wsBroadcast = null;       // function(executionId, event) — set by swarmHandler
  }

  /**
   * Set the WebSocket broadcast function.
   * Called by swarmHandler.js after wiring up the WS channel.
   * @param {Function} fn - (executionId: string, event: object) => void
   */
  setWsBroadcast(fn) {
    this._wsBroadcast = fn;
  }

  /**
   * Start a new workflow execution.
   * Implemented in Task #46.2.
   * @param {string} workflowId
   * @param {string} projectId
   * @param {string} projectPath
   * @returns {Promise<object>} execution status
   */
  async startExecution(workflowId, projectId, projectPath) {
    /* implementato in #46.2 */
  }

  /**
   * Spawn an agent PTY session for a specific node in the workflow.
   * Implemented in Task #46.2.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<void>}
   */
  async _spawnAgentPty(executionId, nodeId) {
    /* implementato in #46.2 */
  }

  /**
   * Build the system prompt for an agent node.
   * Assembles role, workflow context, and handoff targets per OpenAI Swarm pattern.
   * Implemented in Task #46.3.
   * @param {object} node - workflow node definition
   * @param {object} workflowContext - current shared context dict
   * @param {string[]} handoffTargets - list of valid target agent IDs
   * @returns {string} assembled system prompt
   */
  _buildSystemPrompt(node, workflowContext, handoffTargets) {
    /* implementato in #46.3 */
  }

  /**
   * Start the heartbeat timer for an execution.
   * Prevents idle sweeper from killing agent PTYs during active workflows.
   * Implemented in Task #46.3.
   * @param {string} executionId
   */
  _startHeartbeat(executionId) {
    /* implementato in #46.3 */
  }

  /**
   * Stop a running workflow execution.
   * Kills all agent PTY sessions and clears the execution record.
   * @param {string} executionId
   */
  async stopExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    // Stop heartbeat timer
    clearInterval(execution.heartbeatTimer);

    // Kill all agent PTY sessions
    for (const [nodeId, state] of execution.agentStates) {
      if (state.sessionId) {
        await this._sessionManager.killSession(state.sessionId);
      }
    }

    execution.status = 'stopped';
    this._executions.delete(executionId);
  }

  /**
   * Get the current status of a workflow execution.
   * @param {string} executionId
   * @returns {object|null} execution status or null if not found
   */
  getStatus(executionId) {
    const e = this._executions.get(executionId);
    if (!e) return null;

    return {
      executionId: e.executionId,
      workflowId: e.workflowId,
      status: e.status,
      agentStates: Object.fromEntries(e.agentStates),
      edgeCounters: Object.fromEntries(e.edgeCounters),
      budget: e.budget || { estimatedTokensUsed: 0, limitTokens: 0 },
    };
  }
}

export default SwarmEngine;
