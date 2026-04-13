// server/routes/swarm.js
// Execution control REST API for the V3 Swarm Orchestrator â€” Task #47.1
//
// POST   /api/v1/swarm/scaffold                   â†’ 201 { workflowId, workflowDef }
// POST   /api/v1/swarm/:workflowId/start         â†’ 201 { executionId, status }
// POST   /api/v1/swarm/:executionId/pause        â†’ 200 { ok: true }
// POST   /api/v1/swarm/:executionId/resume       â†’ 200 { ok: true }
// DELETE /api/v1/swarm/:executionId              â†’ 204
// GET    /api/v1/swarm/:executionId/status       â†’ 200 { executionId, status, agentStates, edgeCounters, budget }
// GET    /api/v1/swarm/:executionId/agent/:nodeId/output â†’ 200 { output: string }
// POST   /api/v1/swarm/:executionId/broadcast    â†’ 200 { sent: number }

import { Router } from 'express';
import { generateWorkflowFromPrompt } from '../services/ScaffoldGenerator.js';
import { getRuntimeCapabilitySnapshot } from '../services/SwarmEngine.js';
import {
  TERMINAL_EXECUTION_STATUSES,
  buildExecutionResultsPayload,
  buildLiveExecutionResults,
  getExecutionHistoryStore,
  lookupExecution,
} from '../services/ExecutionResultsService.js';

const STRUCTURED_AGENT_SPAWN_MODES = new Set(['stream-json', 'codex-sdk']);

function getAgentNodeById(workflowDef, nodeId) {
  return workflowDef?.nodes?.find((node) => node.id === nodeId && node.type === 'agent') ?? null;
}

function isAgentInDepartment(agentNode, departmentId) {
  if (!agentNode || !departmentId) return false;
  return agentNode.parentId === departmentId || agentNode.data?.parentDepartmentId === departmentId;
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
 * Factory function â€” returns an Express router with all swarm execution control endpoints.
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
  // Execution History Store â€” initialized lazily on first use
  // -------------------------------------------------------------------------
  function getHistoryStore(appLocals = null) {
    return getExecutionHistoryStore(appLocals);
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/history/:workflowId
  // Returns all execution history entries for a workflow.
  // â†’ 200 { executions: [...] }
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
  // â†’ 200 { execution: {...} }
  // â†’ 404 if entry not found
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
  // â†’ 201 { workflowId, workflowDef }
  // â†’ 400 if prompt missing, empty, or > 2000 chars
  // â†’ 503 if WorkflowStore or scaffold providers are unavailable
  // â†’ 500 on provider failure or invalid response
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
      return res.status(503).json({ error: 'No scaffold provider configured â€” restart the server' });
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
  // â†’ 201 { executionId, status, runtimeProvider, providerStrategy, lastFallback? }
  // â†’ 400 if projectId or projectPath missing
  // â†’ 404 if workflowId not found
  // -------------------------------------------------------------------------
  router.post('/:workflowId/start', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { projectId, projectPath, runtimeProvider, provider, runtimeModels, workflowInput, input } = req.body ?? {};

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
          ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, 'workflowInput')
            || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'input')
            ? { workflowInput: workflowInput ?? input ?? {} }
            : {}),
        });
      } catch (err) {
        if (err.message === 'Workflow not found') {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (err.statusCode) {
          return res.status(err.statusCode).json({
            error: err.message,
            code: err.code ?? null,
            ...(Array.isArray(err.details) ? { details: err.details } : {}),
          });
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
        ...(status?.workflowRun ? { workflowRun: status.workflowRun } : {}),
      });
    } catch (err) {
      console.error(`[swarm] POST /:workflowId/start error: ${err.message}`);
      return res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/pause
  // Canonical pause transition. SwarmEngine owns PTY interruption + status updates.
  // â†’ 200 { ok: true }
  // â†’ 404 if execution not found
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
  // â†’ 200 { ok: true }
  // â†’ 404 if execution not found
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
  // â†’ 204 (no content)
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
  // â†’ 200 { executionId, status, agentStates, edgeCounters, budget }
  // â†’ 404 if execution not found
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
  // â†’ 200 { output: string }
  // â†’ 404 if execution or agent not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/agent/:nodeId/output', async (req, res) => {
    try {
      const { executionId, nodeId } = req.params;
      const workflowIdHint = req.query.workflowId || null;
      let execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        const result = await lookupExecution(executionId, workflowIdHint, req.app.locals, swarmEngine);
        if (!result) {
          return res.status(404).json({ error: 'Execution not found' });
        }

        if (result.source === 'history') {
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

      const liveResults = buildLiveExecutionResults(execution, execution?.workflowDef?.name || '', swarmEngine);
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
  // Soft: text + ESC + newline. Hard: Ctrl-C â†’ wait 300ms â†’ text + ESC â†’ wait 100ms â†’ newline.
  // Fire-and-forget for hard mode delays (setTimeout, no await).
  // â†’ 200 { sent: number }
  // â†’ 404 if execution not found
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
  // UUID validation regex â€” shared by results and artifact endpoints
  // -------------------------------------------------------------------------
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/executions/:executionId/results
  // Returns execution results â€” agent outputs, aggregated artifact, and meta.
  // Looks up in live SwarmEngine first, then in persisted history.
  // Optional query param: ?workflowId= to speed up history lookup.
  // â†’ 200 { executionId, workflowName, status, agentOutputs, aggregatedArtifact, meta }
  // â†’ 400 if executionId is not a valid UUID
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/executions/:executionId/results', async (req, res) => {
    try {
      const { executionId } = req.params;

      if (!UUID_RE.test(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID format' });
      }

      const workflowIdHint = req.query.workflowId || null;
      const result = await lookupExecution(executionId, workflowIdHint, req.app.locals, swarmEngine);

      if (!result) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      return res.status(200).json(buildExecutionResultsPayload(result, swarmEngine));
    } catch (err) {
      console.error(`[swarm] GET /executions/:executionId/results error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/executions/:executionId/artifact.md
  // Downloads the aggregated artifact as a Markdown file.
  // Optional query param: ?workflowId= to speed up history lookup.
  // â†’ 200 text/markdown with Content-Disposition attachment
  // â†’ 400 if executionId is not a valid UUID
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/executions/:executionId/artifact.md', async (req, res) => {
    try {
      const { executionId } = req.params;

      if (!UUID_RE.test(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID format' });
      }

      const workflowIdHint = req.query.workflowId || null;
      const result = await lookupExecution(executionId, workflowIdHint, req.app.locals, swarmEngine);

      if (!result) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      // Determine artifact content
      let artifactContent = '';
      if (result.source === 'history') {
        artifactContent = result.data.aggregatedArtifact || '';
      } else if (TERMINAL_EXECUTION_STATUSES.has(result.data?.status)) {
        artifactContent = buildExecutionResultsPayload(result, swarmEngine)?.aggregatedArtifact || '';
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
