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
    // 1. Load workflow definition from store
    const wf = await this._workflowStore.get(workflowId);
    if (!wf) throw new Error('Workflow not found');

    // 2. Build execution record
    const executionId = uuidv4();
    const execution = {
      executionId,
      workflowId,
      workflowDef: wf,
      projectId,
      projectPath,
      status: 'running',
      agentStates: new Map(),
      edgeCounters: new Map(),
      workflowContext: {},
      heartbeatTimer: null,
      inboxItems: [],
    };

    // 3. Store BEFORE spawning (so _spawnAgentPty can look it up)
    this._executions.set(executionId, execution);

    // 4. Find triage node: first node with isTriageNode === true, else first node
    const triageNode = wf.nodes.find((n) => n.data && n.data.isTriageNode === true) || wf.nodes[0];

    // 5. Spawn triage agent PTY
    await this._spawnAgentPty(executionId, triageNode.id);

    // 6. Start heartbeat to keep agent PTYs alive
    this._startHeartbeat(executionId);

    return executionId;
  }

  /**
   * Spawn an agent PTY session for a specific node in the workflow.
   * Implemented in Task #46.2.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<void>}
   */
  async _spawnAgentPty(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const node = execution.workflowDef.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in workflow`);

    // Build handoff targets from outgoing edges
    const handoffTargets = execution.workflowDef.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);

    // Build system prompt (stub in #46.3 — returns empty string or placeholder)
    const systemPrompt = this._buildSystemPrompt(node, execution.workflowContext, handoffTargets);

    // Spawn PTY session via SessionManager
    const claudeBin = this._sessionManager.claudeBin;
    if (!claudeBin) throw new Error('claudeBin not set on SessionManager');
    const session = await this._sessionManager.createSession(
      execution.projectId,
      execution.projectPath,
      claudeBin
    );
    const sessionId = session.sessionId;

    // Write system prompt to the PTY (if available)
    if (systemPrompt) {
      this._sessionManager.writeInput(sessionId, systemPrompt + '\n');
    }

    // Set up HandoffParser tap on the PTY output
    const parser = new HandoffParser();

    // Initialize agent state BEFORE registering tap (tap references it)
    execution.agentStates.set(nodeId, {
      sessionId,
      tapFn: null,         // set below after tapFn is defined
      status: 'running',
      handoffCount: 0,
      lastOutputSnippet: '',
    });

    const tapFn = (chunk) => {
      // Update lastOutputSnippet (last 500 chars)
      const state = execution.agentStates.get(nodeId);
      if (state) {
        state.lastOutputSnippet = (state.lastOutputSnippet + chunk).slice(-500);
      }

      // Budget tracking (if budgetTracker attached later — #49)
      if (this._budgetTracker) {
        this._budgetTracker.track(sessionId, chunk);
        const limit = execution.workflowDef.settings?.budgetTokens || 0;
        if (limit > 0) {
          const result = this._budgetTracker.checkBudget(executionId, limit);
          if (result.exceeded && this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'budget_update',
              estimatedTokensUsed: result.estimatedUsed,
              limitTokens: limit,
            });
          }
        }
      }

      // Parse handoff / done tokens from PTY output
      const events = parser.feed(chunk);
      for (const evt of events) {
        if (evt.type === 'handoff') this._onHandoff(executionId, nodeId, evt);
        if (evt.type === 'done') this._onDone(executionId, nodeId);
      }
    };

    // Store tapFn in agent state for cleanup on stop
    execution.agentStates.get(nodeId).tapFn = tapFn;

    // Register tap on swarmListeners (DEC-014)
    const ptySession = this._sessionManager.getSession(sessionId);
    if (ptySession) {
      ptySession.swarmListeners.add(tapFn);
    }

    // Emit WS status update
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, { type: 'agent_status', nodeId, status: 'running' });
    }
  }

  /**
   * Ensure an agent PTY exists for a node, reusing an active one if available.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<string>} sessionId of the active or newly spawned PTY
   */
  async _ensureAgentPty(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (execution) {
      const existing = execution.agentStates.get(nodeId);
      if (existing && existing.status !== 'done') {
        return existing.sessionId;
      }
    }
    await this._spawnAgentPty(executionId, nodeId);
    const state = this._executions.get(executionId)?.agentStates.get(nodeId);
    return state?.sessionId;
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
    const lines = [];

    // Agent's own system prompt / role instructions
    const agentPrompt = (node.data && node.data.systemPrompt) || '';
    lines.push(agentPrompt);
    lines.push('');
    lines.push('--- SWARM PROTOCOL (mandatory — never skip) ---');

    // Workflow context section — omit entirely if empty
    const contextKeys = Object.keys(workflowContext);
    if (contextKeys.length > 0) {
      lines.push('Current workflow context:');
      for (const key of contextKeys) {
        lines.push(`${key}: ${workflowContext[key]}`);
      }
      lines.push('');
    }

    // Handoff instructions — vary based on whether targets exist
    if (handoffTargets.length > 0) {
      lines.push('When your task is complete and must pass to another agent, output EXACTLY as last line:');
      lines.push('__HANDOFF__:<targetId>:<base64_json_context_update>');
      lines.push('');
      lines.push(`Valid target IDs: ${handoffTargets.join(', ')}`);
      lines.push('Context update format: {"key": "value", ...} — flat dict only, max 50 keys, values max 1024 chars');
      lines.push('');
      lines.push('When fully done (no further handoff needed):');
      lines.push('__DONE__');
    } else {
      lines.push('When fully done:');
      lines.push('__DONE__');
    }

    lines.push('');
    lines.push('Do NOT output the handoff or done token mid-response. Only as the very LAST line.');
    lines.push('--- END PROTOCOL ---');

    return lines.join('\n');
  }

  /**
   * Start the heartbeat timer for an execution.
   * Prevents idle sweeper from killing agent PTYs during active workflows.
   * Implemented in Task #46.3.
   * @param {string} executionId
   */
  _startHeartbeat(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    execution.heartbeatTimer = setInterval(() => {
      const exec = this._executions.get(executionId);
      if (!exec) return;

      for (const [nodeId, state] of exec.agentStates) {
        if (state.status === 'running') {
          this._sessionManager.writeInput(state.sessionId, '');
        }
      }
    }, 300000); // 5 minutes

    // Allow Node.js to exit even if heartbeat timer is active
    if (execution.heartbeatTimer.unref) {
      execution.heartbeatTimer.unref();
    }
  }

  /**
   * Handle a handoff event from one agent to another.
   * Stub for Task #46.3 / #62 — broadcasts WS event, full routing implemented later.
   * @param {string} executionId
   * @param {string} sourceNodeId
   * @param {object} event - { type: 'handoff', targetId, contextUpdate }
   */
  async _onHandoff(executionId, sourceNodeId, event) {
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'handoff_started',
        sourceNodeId,
        targetNodeId: event.targetId,
        edgeId: null,
        counter: 0,
      });
    }
  }

  /**
   * Handle a done event from an agent.
   * Stub for Task #62.3 — broadcasts WS event.
   * @param {string} executionId
   * @param {string} nodeId
   */
  _onDone(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (execution) {
      const state = execution.agentStates.get(nodeId);
      if (state) state.status = 'done';
    }
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'execution_status',
        status: 'agent_done',
        nodeId,
      });
    }
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

    // Remove swarm tap listeners BEFORE killing sessions
    for (const [nodeId, state] of execution.agentStates) {
      if (state.sessionId && state.tapFn) {
        const session = this._sessionManager.getSession(state.sessionId);
        if (session) {
          session.swarmListeners.delete(state.tapFn);
        }
      }
    }

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
   * Pause all running agents in a workflow execution.
   * Sets each running agent's status to 'paused' and broadcasts the change.
   * Added in Task #67.
   * @param {string} executionId
   */
  pauseExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    for (const [nodeId, state] of execution.agentStates) {
      if (state.status === 'running') {
        state.status = 'paused';
        if (this._wsBroadcast) {
          this._wsBroadcast(executionId, { type: 'agent_status', nodeId, status: 'paused' });
        }
      }
    }
  }

  /**
   * Resume all paused agents in a workflow execution.
   * Sets each paused agent's status back to 'running' and broadcasts the change.
   * Added in Task #67.
   * @param {string} executionId
   */
  resumeExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    for (const [nodeId, state] of execution.agentStates) {
      if (state.status === 'paused') {
        state.status = 'running';
        if (this._wsBroadcast) {
          this._wsBroadcast(executionId, { type: 'agent_status', nodeId, status: 'running' });
        }
      }
    }
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
