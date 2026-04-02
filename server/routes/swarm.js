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
    if (state.status !== 'running' || !state.sessionId) continue;

    const agentNode = getAgentNodeById(execution.workflowDef, nodeId);
    if (!agentNode) continue;

    const matchesScope =
      normalizedScope === 'all'
      || (normalizedScope === 'agent' && nodeId === targetId)
      || (normalizedScope === 'department' && isAgentInDepartment(agentNode, targetId));

    if (!matchesScope) continue;

    targets.push({
      nodeId,
      sessionId: state.sessionId,
      label: agentNode.data?.label || nodeId,
    });
  }

  return targets;
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
  // Body: { projectId, projectPath }
  // → 201 { executionId, status: 'running' }
  // → 400 if projectId or projectPath missing
  // → 404 if workflowId not found
  // -------------------------------------------------------------------------
  router.post('/:workflowId/start', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { projectId, projectPath } = req.body ?? {};

      if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
        return res.status(400).json({ error: 'projectId is required' });
      }
      if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
        return res.status(400).json({ error: 'projectPath is required' });
      }

      let executionId;
      try {
        executionId = await swarmEngine.startExecution(workflowId, projectId.trim(), projectPath.trim());
      } catch (err) {
        if (err.message === 'Workflow not found') {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        throw err;
      }

      return res.status(201).json({ executionId, status: 'running' });
    } catch (err) {
      console.error(`[swarm] POST /:workflowId/start error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
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
  router.post('/:executionId/resume', (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      if (execution.status !== 'paused') {
        return res.status(409).json({ error: `Execution cannot be resumed from status '${execution.status}'` });
      }

      const nextStatus = swarmEngine.resumeExecution(executionId);

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
      const execution = swarmEngine.getStatus(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
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
  // → 200 { output: string }
  // → 404 if execution or agent not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/agent/:nodeId/output', (req, res) => {
    try {
      const { executionId, nodeId } = req.params;
      const execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      const agentState = execution.agentStates[nodeId];
      if (!agentState || !agentState.sessionId) {
        return res.status(404).json({ error: 'Agent not found in execution' });
      }

      const session = sessionManager.getSession(agentState.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Agent session not found' });
      }

      return res.status(200).json({ output: session.buffer.toString() });
    } catch (err) {
      console.error(`[swarm] GET /:executionId/agent/:nodeId/output error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/broadcast
  // Body: { text, scope: 'all' | departmentId | agentNodeId, mode: 'soft' | 'hard' }
  // Sends text to running agents filtered by scope.
  // Soft: text + ESC + newline. Hard: Ctrl-C → wait 300ms → text + ESC → wait 100ms → newline.
  // Fire-and-forget for hard mode delays (setTimeout, no await).
  // → 200 { sent: number }
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/broadcast', (req, res) => {
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

      for (const target of targets) {
        if (broadcastMode === 'soft') {
          sessionManager.writeInput(target.sessionId, text + '\x1b\n');
        } else {
          sessionManager.writeInput(target.sessionId, '\x03');
          setTimeout(() => {
            sessionManager.writeInput(target.sessionId, text + '\x1b');
            setTimeout(() => {
              sessionManager.writeInput(target.sessionId, '\n');
            }, 100);
          }, 300);
        }
      }

      return res.status(200).json({
        sent: targets.length,
        scope: scope ?? 'all',
        targetId: targetId ?? null,
        recipientNodeIds: targets.map((target) => target.nodeId),
      });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/broadcast error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
