// server/routes/swarm.js
// Execution control REST API for the V3 Swarm Orchestrator — Task #47.1
//
// POST   /api/v1/swarm/scaffold                   → 201 { workflowId, workflowDef }
// POST   /api/v1/swarm/:workflowId/start         → 201 { executionId, status }
// POST   /api/v1/swarm/:executionId/pause        → 200 { ok: true }
// POST   /api/v1/swarm/:executionId/resume       → 200 { ok: true }
// DELETE /api/v1/swarm/:executionId              → 204
// GET    /api/v1/swarm/:executionId/status       → 200 { executionId, status, agentStates, edgeCounters, budget }
// GET    /api/v1/swarm/:executionId/agent/:nodeId/output → 200 { output: string }
// POST   /api/v1/swarm/:executionId/broadcast    → 200 { sent: number }

import { Router } from 'express';
import { generateWorkflowFromPrompt } from '../services/ScaffoldGenerator.js';
import { getRuntimeCapabilitySnapshot } from '../services/SwarmEngine.js';
import { buildWorkflowArtifact } from '../services/WorkflowArtifactBuilder.js';
import buildPackResult from '../services/PackResultBuilder.js';
import { ExecutionHistoryStore } from '../stores/ExecutionHistoryStore.js';
import { ConfigStore } from '../services/ConfigStore.js';

const TERMINAL_EXECUTION_STATUSES = new Set(['completed', 'stopped', 'failed']);
const STRUCTURED_AGENT_SPAWN_MODES = new Set(['stream-json', 'codex-sdk']);

function getAgentNodeById(workflowDef, nodeId) {
  return workflowDef?.nodes?.find((node) => node.id === nodeId && node.type === 'agent') ?? null;
}

function isAgentInDepartment(agentNode, departmentId) {
  if (!agentNode || !departmentId) return false;
  return agentNode.parentId === departmentId || agentNode.data?.parentDepartmentId === departmentId;
}

function normalizeAgentStates(agentStates) {
  if (agentStates instanceof Map) return agentStates;
  if (agentStates && typeof agentStates === 'object') {
    return new Map(Object.entries(agentStates));
  }
  return new Map();
}

function buildAgentOutputsFromExecution(execution, swarmEngine = null) {
  const agentOutputs = {};
  const groupedMessages = {};
  const chatMessages = Array.isArray(execution?.chatMessages) ? execution.chatMessages : [];

  for (const msg of chatMessages) {
    if (msg.role !== 'assistant' || !msg.nodeId) continue;
    if (!groupedMessages[msg.nodeId]) groupedMessages[msg.nodeId] = [];
    groupedMessages[msg.nodeId].push(msg);
  }

  const agentStates = normalizeAgentStates(execution?.agentStates);
  const nodeIds = new Set(Object.keys(groupedMessages));
  for (const [nodeId, state] of agentStates.entries()) {
    if (!nodeId) continue;
    if (state?.status && state.status !== 'idle') {
      nodeIds.add(nodeId);
    }
  }
  for (const node of execution?.workflowDef?.nodes ?? []) {
    if (node?.type !== 'agent' || !node.id) continue;
    const state = agentStates.get(node.id);
    if ((groupedMessages[node.id]?.length ?? 0) > 0 || (state?.status && state.status !== 'idle')) {
      nodeIds.add(node.id);
    }
  }

  for (const nodeId of nodeIds) {
    const messages = groupedMessages[nodeId] ?? [];
    const state = agentStates.get(nodeId);
    const nodeDef = execution?.workflowDef?.nodes?.find((node) => node.id === nodeId);
    const timestamps = messages
      .map((msg) => msg.timestamp)
      .filter(Boolean)
      .sort((a, b) => a - b);
    const finalText = typeof swarmEngine?._resolveAgentFinalText === 'function'
      ? swarmEngine._resolveAgentFinalText(execution, nodeId, messages, state)
      : messages
        .map((msg) => msg.text || msg.content || '')
        .filter(Boolean)
        .join('\n\n');

    if (!finalText && messages.length === 0 && !state) continue;

    agentOutputs[nodeId] = {
      label: nodeDef?.data?.label || nodeId,
      finalText,
      handoffPayloads: Array.isArray(state?.handoffPayloads) ? state.handoffPayloads : [],
      status: state?.status || 'unknown',
      provider: state?.runtimeProvider || state?.provider || null,
      messageCount: messages.length,
      firstMessageAt: timestamps[0] ? new Date(timestamps[0]).toISOString() : null,
      lastMessageAt: timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
    };
  }

  return agentOutputs;
}

function buildLiveExecutionResults(execution, workflowName = '', swarmEngine = null) {
  const agentOutputs = buildAgentOutputsFromExecution(execution, swarmEngine);
  const status = execution?.status || 'unknown';
  const startedAt = execution?.startedAt ?? execution?.budget?.startedAt ?? null;
  const endedAt = TERMINAL_EXECUTION_STATUSES.has(status)
    ? (execution?.endedAt ?? new Date().toISOString())
    : null;
  const durationMs = startedAt && endedAt
    ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
    : null;
  const normalizedWorkflowName = workflowName || execution?.workflowDef?.name || 'Workflow';

  const packRun = execution?.packMetadata ?? null;
  const packLike = buildPackLike(packRun);
  const aggregatedArtifact = TERMINAL_EXECUTION_STATUSES.has(status)
    ? buildWorkflowArtifact({
        workflowName: normalizedWorkflowName,
        workflowDescription: execution?.workflowDef?.description || '',
        executionId: execution?.executionId,
        status,
        startedAt,
        endedAt,
        durationMs,
        agentOutputs,
      })
    : '';

  return {
    executionId: execution?.executionId,
    workflowName: normalizedWorkflowName,
    status,
    agentOutputs,
    chatMessages: Array.isArray(execution?.chatMessages) ? execution.chatMessages : [],
    aggregatedArtifact,
    ...(packRun ? { packRun } : {}),
    ...(packLike ? { packResult: buildPackResult(packLike, execution, agentOutputs, aggregatedArtifact) } : {}),
    meta: {
      startedAt,
      endedAt,
      durationMs,
      nodesRun: normalizeAgentStates(execution?.agentStates).size,
    },
  };
}

function buildPackLike(packRun) {
  if (!packRun) return null;
  return {
    id: packRun.packId,
    packVersion: packRun.packVersion,
    visibleSteps: packRun.visibleSteps ?? [],
    outputSchema: packRun.outputSchema ?? {},
    artifactDefinitions: packRun.artifactDefinitions ?? [],
  };
}

export function resolveBroadcastNodeTargets(execution, scope, targetId) {
  const normalizedScope = scope === 'department' || scope === 'agent' ? scope : 'all';
  const targets = [];

  for (const [nodeId, state] of Object.entries(execution.agentStates ?? {})) {
    const agentNode = getAgentNodeById(execution.workflowDef, nodeId);
    if (!agentNode) continue;

    const matchesScope =
      normalizedScope === 'all'
      || (normalizedScope === 'agent' && nodeId === targetId)
      || (normalizedScope === 'department' && isAgentInDepartment(agentNode, targetId));

    if (!matchesScope) continue;

    targets.push({
      nodeId,
      sessionId: state?.sessionId ?? null,
      label: agentNode.data?.label || nodeId,
    });
  }

  return targets;
}

export function serializeSessionOutput(session) {
  if (!session?.buffer) return '';
  if (typeof session.buffer.toBuffer === 'function') {
    return session.buffer.toBuffer().toString('utf8');
  }
  return String(session.buffer);
}

/**
 * Factory function — returns an Express router with all swarm execution control endpoints.
 *
 * @param {import('../services/SwarmEngine.js').default} swarmEngine
 * @param {import('../services/SessionManager.js').SessionManager} sessionManager
 * @param {{ claudeBin?: string|null, codexBin?: string|null }} scaffoldProviders
 * @returns {Router}
 */
export default function swarmRoutes(swarmEngine, sessionManager, scaffoldProviders = {}) {
  const router = Router();

  router.get('/runtime-capabilities', (_req, res) => {
    return res.status(200).json(getRuntimeCapabilitySnapshot(sessionManager));
  });

  // -------------------------------------------------------------------------
  // Execution History Store — initialized lazily on first use
  // -------------------------------------------------------------------------
  let _historyStore = null;
  function getHistoryStore(appLocals = null) {
    if (appLocals?.executionHistoryStore) {
      return appLocals.executionHistoryStore;
    }
    if (!_historyStore) {
      _historyStore = new ExecutionHistoryStore(ConfigStore.CONFIG_DIR);
      // Fire-and-forget init (creates directory if needed)
      _historyStore.init().catch((err) => {
        console.error(`[swarm] ExecutionHistoryStore init error: ${err.message}`);
      });
    }
    return _historyStore;
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/history/:workflowId
  // Returns all execution history entries for a workflow.
  // → 200 { executions: [...] }
  // -------------------------------------------------------------------------
  router.get('/history/:workflowId', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const store = getHistoryStore();
      const executions = await store.getHistory(workflowId);
      return res.status(200).json({ executions });
    } catch (err) {
      console.error(`[swarm] GET /history/:workflowId error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/history/:workflowId/:executionId
  // Returns a single execution history entry.
  // → 200 { execution: {...} }
  // → 404 if entry not found
  // -------------------------------------------------------------------------
  router.get('/history/:workflowId/:executionId', async (req, res) => {
    try {
      const { workflowId, executionId } = req.params;
      const store = getHistoryStore();
      const entry = await store.getEntry(workflowId, executionId);

      if (!entry) {
        return res.status(404).json({ error: 'Execution history entry not found' });
      }

      return res.status(200).json({ execution: entry });
    } catch (err) {
      console.error(`[swarm] GET /history/:workflowId/:executionId error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/scaffold
  // Body: { prompt: string, projectId?: string }
  // Calls the configured scaffold provider(s) to generate a workflow definition,
  // then saves it to WorkflowStore.
  // → 201 { workflowId, workflowDef }
  // → 400 if prompt missing, empty, or > 2000 chars
  // → 503 if WorkflowStore or scaffold providers are unavailable
  // → 500 on provider failure or invalid response
  // IMPORTANT: This literal route must be declared BEFORE /:workflowId/* routes
  //            so Express does not treat 'scaffold' as a workflowId param.
  // -------------------------------------------------------------------------
  router.post('/scaffold', async (req, res) => {
    const { prompt, projectId } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'prompt exceeds 2000 character limit' });
    }

    if (!scaffoldProviders.claudeBin && !scaffoldProviders.codexBin) {
      return res.status(503).json({ error: 'No scaffold provider configured — restart the server' });
    }

    try {
      const workflowDef = await generateWorkflowFromPrompt({
        prompt: prompt.trim(),
        claudeBin: scaffoldProviders.claudeBin,
        codexBin: scaffoldProviders.codexBin,
        geminiBin: scaffoldProviders.geminiBin,
      });

      if (projectId && typeof projectId === 'string') {
        workflowDef.projectId = projectId.trim();
      }

      const store = req.app.locals.workflowStore;
      if (!store) return res.status(503).json({ error: 'WorkflowStore unavailable' });

      const created = await store.create(workflowDef);
      return res.status(201).json({ workflowId: created.id, workflowDef: created });
    } catch (err) {
      console.error(`[swarm] POST /scaffold error: ${err.message}`);
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:workflowId/start
  // Body: { projectId, projectPath, runtimeProvider? }
  // → 201 { executionId, status, runtimeProvider, providerStrategy, lastFallback? }
  // → 400 if projectId or projectPath missing
  // → 404 if workflowId not found
  // -------------------------------------------------------------------------
  router.post('/:workflowId/start', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { projectId, projectPath, runtimeProvider, provider, runtimeModels } = req.body ?? {};

      if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
        return res.status(400).json({ error: 'projectId is required' });
      }
      if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
        return res.status(400).json({ error: 'projectPath is required' });
      }

      let executionId;
      try {
        executionId = await swarmEngine.startExecution(workflowId, projectId.trim(), projectPath.trim(), {
          runtimeProvider: runtimeProvider ?? provider,
          runtimeModels: runtimeModels && typeof runtimeModels === 'object' ? runtimeModels : undefined,
        });
      } catch (err) {
        if (err.message === 'Workflow not found') {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (err.statusCode) {
          return res.status(err.statusCode).json({ error: err.message, code: err.code ?? null });
        }
        throw err;
      }

      const status = swarmEngine.getStatus(executionId);
      return res.status(201).json({
        executionId,
        status: status?.status ?? 'running',
        runtimeProvider: status?.runtimeProvider ?? null,
        activeProvider: status?.activeProvider ?? null,
        providerStrategy: status?.providerStrategy ?? null,
        lastFallback: status?.lastFallback ?? null,
      });
    } catch (err) {
      console.error(`[swarm] POST /:workflowId/start error: ${err.message}`);
      return res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/pause
  // Canonical pause transition. SwarmEngine owns PTY interruption + status updates.
  // → 200 { ok: true }
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/pause', async (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      if (execution.status !== 'running') {
        return res.status(409).json({ error: `Execution cannot be paused from status '${execution.status}'` });
      }

      const nextStatus = swarmEngine.pauseExecution(executionId);

      return res.status(200).json({ ok: true, status: nextStatus?.status ?? 'paused' });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/pause error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/resume
  // Canonical resume transition. SwarmEngine owns PTY re-entry + status updates.
  // → 200 { ok: true }
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/resume', async (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      if (execution.status !== 'paused') {
        return res.status(409).json({ error: `Execution cannot be resumed from status '${execution.status}'` });
      }

      const nextStatus = await swarmEngine.resumeExecution(executionId);

      return res.status(200).json({ ok: true, status: nextStatus?.status ?? 'running' });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/resume error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/swarm/:executionId
  // → 204 (no content)
  // -------------------------------------------------------------------------
  router.delete('/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;
      const nodeId = typeof req.query?.nodeId === 'string' ? req.query.nodeId : null;
      const mode = typeof req.query?.mode === 'string' ? req.query.mode : 'forced';
      const execution = swarmEngine.getStatus(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      if (nodeId) {
        const agentState = execution.agentStates?.[nodeId];
        if (!agentState) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        if (!STRUCTURED_AGENT_SPAWN_MODES.has(agentState.spawnMode)) {
          return res.status(409).json({ error: 'Agent is not using a structured runtime mode' });
        }
        await swarmEngine.stopStreamJsonAgent(executionId, nodeId, mode);
        return res.status(204).end();
      }

      await swarmEngine.stopExecution(executionId);
      return res.status(204).end();
    } catch (err) {
      console.error(`[swarm] DELETE /:executionId error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/:executionId/status
  // → 200 { executionId, status, agentStates, edgeCounters, budget }
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/status', (req, res) => {
    try {
      const { executionId } = req.params;
      const status = swarmEngine.getStatus(executionId);

      if (!status) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      return res.status(200).json(status);
    } catch (err) {
      console.error(`[swarm] GET /:executionId/status error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/:executionId/agent/:nodeId/output
  // Returns the ring buffer contents for the agent's PTY session.
  // Falls back to persisted/live execution output when the PTY session no
  // longer exists, so completed/stopped nodes remain inspectable.
  // → 200 { output: string }
  // → 404 if execution or agent not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/agent/:nodeId/output', async (req, res) => {
    try {
      const { executionId, nodeId } = req.params;
      const workflowIdHint = req.query.workflowId || null;
      let execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        const result = await lookupExecution(executionId, workflowIdHint, req.app.locals);
        if (!result) {
          return res.status(404).json({ error: 'Execution not found' });
        }

        if (result.source === 'persisted') {
          const persistedOutput = result.data?.agentOutputs?.[nodeId]?.finalText || '';
          if (!persistedOutput) {
            return res.status(404).json({ error: 'Agent output not found' });
          }
          return res.status(200).json({ output: persistedOutput });
        }

        execution = result.data;
      }

      const agentState = execution.agentStates?.[nodeId];
      if (!agentState) {
        return res.status(404).json({ error: 'Agent not found in execution' });
      }

      if (agentState.sessionId) {
        const session = sessionManager.getSession(agentState.sessionId);
        if (session) {
          return res.status(200).json({ output: serializeSessionOutput(session) });
        }
      }

      const liveResults = buildLiveExecutionResults(
        execution,
        execution?.workflowDef?.name || '',
        swarmEngine
      );
      const fallbackOutput =
        liveResults.agentOutputs?.[nodeId]?.finalText
        || agentState.lastChatSnippet
        || agentState.lastOutputSnippet
        || '';

      if (!fallbackOutput) {
        return res.status(404).json({ error: 'Agent output not found' });
      }

      return res.status(200).json({ output: fallbackOutput });
    } catch (err) {
      console.error(`[swarm] GET /:executionId/agent/:nodeId/output error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/broadcast
  // Body: { text, scope: 'all' | departmentId | agentNodeId, mode: 'soft' | 'hard' }
  // Sends text to messageable agents filtered by scope.
  // Soft: text + ESC + newline. Hard: Ctrl-C → wait 300ms → text + ESC → wait 100ms → newline.
  // Fire-and-forget for hard mode delays (setTimeout, no await).
  // → 200 { sent: number }
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/broadcast', async (req, res) => {
    try {
      const { executionId } = req.params;
      const { text, scope, targetId, mode } = req.body ?? {};

      const execution = swarmEngine.getStatus(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      if (typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required and must be a string' });
      }

      if (scope && !['all', 'department', 'agent'].includes(scope)) {
        return res.status(400).json({ error: "scope must be 'all', 'department', or 'agent'" });
      }
      if ((scope === 'department' || scope === 'agent') && (!targetId || typeof targetId !== 'string')) {
        return res.status(400).json({ error: 'targetId is required for department and agent broadcasts' });
      }

      const broadcastMode = mode === 'hard' ? 'hard' : 'soft';
      const executionRecord = swarmEngine.getExecution(executionId);
      const targets = resolveBroadcastNodeTargets(
        {
          ...execution,
          workflowDef: executionRecord?.workflowDef ?? null,
        },
        scope,
        targetId
      );

      const deliveries = [];
      for (const target of targets) {
        const result = typeof swarmEngine.sendBroadcast === 'function'
          ? await swarmEngine.sendBroadcast(executionId, target.nodeId, text.trim(), { mode: broadcastMode })
          : null;

        if (!result?.sent) continue;

        deliveries.push({
          nodeId: target.nodeId,
          delivery: result.delivery ?? 'injected',
        });
      }

      // Emit user message to chat for each recipient
      for (const delivery of deliveries) {
        if (typeof swarmEngine.emitUserChatMessage === 'function') {
          swarmEngine.emitUserChatMessage(executionId, delivery.nodeId, text.trim());
        }
      }

      return res.status(200).json({
        sent: deliveries.length,
        scope: scope ?? 'all',
        targetId: targetId ?? null,
        recipientNodeIds: deliveries.map((target) => target.nodeId),
        deliveries,
      });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/broadcast error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // UUID validation regex — shared by results and artifact endpoints
  // -------------------------------------------------------------------------
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // -------------------------------------------------------------------------
  // Internal helper: look up an execution by ID, first in live SwarmEngine,
  // then in persisted ExecutionHistoryStore.
  // Returns { source: 'live'|'history', data: {...}, workflowName?: string } or null.
  // -------------------------------------------------------------------------
  async function lookupHistoryExecution(executionId, workflowIdHint, appLocals) {
    const store = getHistoryStore(appLocals);
    let entry = null;
    let workflowName = '';

    if (workflowIdHint) {
      entry = await store.getEntry(workflowIdHint, executionId);
      if (entry) {
        try {
          const wfStore = appLocals.workflowStore;
          if (wfStore) {
            const wf = await wfStore.get(workflowIdHint);
            workflowName = wf?.name || '';
          }
        } catch {
          // Ignore
        }
      }
    } else {
      const wfStore = appLocals.workflowStore;
      if (wfStore) {
        try {
          const workflows = await wfStore.list();
          for (const wf of workflows) {
            entry = await store.getEntry(wf.id, executionId);
            if (entry) {
              workflowName = wf.name || '';
              break;
            }
          }
        } catch {
          // Ignore scan errors
        }
      }
    }

    if (!entry) return null;
    return { data: entry, workflowName };
  }

  async function lookupExecution(executionId, workflowIdHint, appLocals) {
    // 1. Try live execution from SwarmEngine
    const liveStatus = swarmEngine.getStatus(executionId);
    if (liveStatus) {
      const liveExecution = typeof swarmEngine.getExecution === 'function'
        ? swarmEngine.getExecution(executionId)
        : null;
      const liveWorkflowId = workflowIdHint || liveStatus.workflowId || liveExecution?.workflowId || null;

      if (TERMINAL_EXECUTION_STATUSES.has(liveStatus.status)) {
        // Prefer live data when the execution object has chatMessages —
        // the persisted history may have been written before late
        // ChatExtractor flushes delivered final chat messages.
        const liveChatCount = Array.isArray(liveExecution?.chatMessages) ? liveExecution.chatMessages.length : 0;
        if (liveChatCount === 0) {
          const persisted = await lookupHistoryExecution(executionId, liveWorkflowId, appLocals);
          if (persisted) {
            return {
              source: 'history',
              data: persisted.data,
              workflowName: persisted.workflowName,
            };
          }
        }
      }

      // Resolve workflow name from workflowStore if possible
      let workflowName = liveExecution?.workflowDef?.name || '';
      try {
        const store = appLocals.workflowStore;
        if (store && liveWorkflowId) {
          const wf = await store.get(liveWorkflowId);
          workflowName = wf?.name || '';
        }
      } catch {
        // Ignore — name is best-effort
      }

      return {
        source: 'live',
        data: liveExecution ?? liveStatus,
        workflowName,
      };
    }

    // 2. Try persisted history
    const persisted = await lookupHistoryExecution(executionId, workflowIdHint, appLocals);
    if (!persisted) return null;

    return {
      source: 'history',
      data: persisted.data,
      workflowName: persisted.workflowName,
    };
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/executions/:executionId/results
  // Returns execution results — agent outputs, aggregated artifact, and meta.
  // Looks up in live SwarmEngine first, then in persisted history.
  // Optional query param: ?workflowId= to speed up history lookup.
  // → 200 { executionId, workflowName, status, agentOutputs, aggregatedArtifact, meta }
  // → 400 if executionId is not a valid UUID
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/executions/:executionId/results', async (req, res) => {
    try {
      const { executionId } = req.params;

      if (!UUID_RE.test(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID format' });
      }

      const workflowIdHint = req.query.workflowId || null;
      const result = await lookupExecution(executionId, workflowIdHint, req.app.locals);

      if (!result) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      if (result.source === 'live') {
        return res.status(200).json(buildLiveExecutionResults(result.data, result.workflowName, swarmEngine));
      }

      // Persisted history entry
      const entry = result.data;
      const packLike = buildPackLike(entry.packRun);
      return res.status(200).json({
        executionId: entry.executionId,
        workflowName: result.workflowName,
        status: entry.status,
        agentOutputs: entry.agentOutputs || {},
        aggregatedArtifact: entry.aggregatedArtifact || '',
        ...(entry.packRun ? { packRun: entry.packRun } : {}),
        ...(packLike ? { packResult: buildPackResult(packLike, entry, entry.agentOutputs || {}, entry.aggregatedArtifact || '') } : {}),
        meta: {
          startedAt: entry.startedAt ?? null,
          endedAt: entry.endedAt ?? null,
          durationMs: entry.durationMs ?? null,
          nodesRun: entry.nodesRun ?? 0,
        },
      });
    } catch (err) {
      console.error(`[swarm] GET /executions/:executionId/results error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/executions/:executionId/artifact.md
  // Downloads the aggregated artifact as a Markdown file.
  // Optional query param: ?workflowId= to speed up history lookup.
  // → 200 text/markdown with Content-Disposition attachment
  // → 400 if executionId is not a valid UUID
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/executions/:executionId/artifact.md', async (req, res) => {
    try {
      const { executionId } = req.params;

      if (!UUID_RE.test(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID format' });
      }

      const workflowIdHint = req.query.workflowId || null;
      const result = await lookupExecution(executionId, workflowIdHint, req.app.locals);

      if (!result) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      // Determine artifact content
      let artifactContent = '';
      if (result.source === 'history') {
        artifactContent = result.data.aggregatedArtifact || '';
      } else if (TERMINAL_EXECUTION_STATUSES.has(result.data?.status)) {
        artifactContent = buildLiveExecutionResults(result.data, result.workflowName, swarmEngine).aggregatedArtifact || '';
      }

      // Build safe filename
      const safeName = (result.workflowName || result.data?.workflowDef?.name || 'workflow')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 64) || 'workflow';
      const shortId = executionId.substring(0, 8);

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${shortId}.md"`);
      return res.send(artifactContent);
    } catch (err) {
      console.error(`[swarm] GET /executions/:executionId/artifact.md error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
