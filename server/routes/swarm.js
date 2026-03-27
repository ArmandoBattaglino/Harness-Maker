// server/routes/swarm.js
// Execution control REST API for the V3 Swarm Orchestrator — Task #47.1
//
// POST   /api/v1/swarm/:workflowId/start         → 201 { executionId, status }
// POST   /api/v1/swarm/:executionId/pause         → 200 { ok: true }
// POST   /api/v1/swarm/:executionId/resume        → 200 { ok: true }
// DELETE /api/v1/swarm/:executionId               → 204
// GET    /api/v1/swarm/:executionId/status        → 200 { executionId, status, agentStates, edgeCounters, budget }
// GET    /api/v1/swarm/:executionId/agent/:nodeId/output → 200 { output: string }
// POST   /api/v1/swarm/:executionId/broadcast     → 200 { sent: number }
// POST   /api/v1/swarm/:workflowId/scaffold       → 501 (stub, Task #47.2)

import { Router } from 'express';

/**
 * Factory function — returns an Express router with all swarm execution control endpoints.
 *
 * @param {import('../services/SwarmEngine.js').default} swarmEngine
 * @param {import('../services/SessionManager.js').SessionManager} sessionManager
 * @returns {Router}
 */
export default function swarmRoutes(swarmEngine, sessionManager) {
  const router = Router();

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
  // Sends Ctrl-C to all running agent sessions inline (SwarmEngine has no
  // pauseExecution method — Task #70 will add full HITL freeze).
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

      // Send Ctrl-C to every running agent session
      for (const [nodeId, state] of Object.entries(execution.agentStates)) {
        if (state.status === 'running' && state.sessionId) {
          sessionManager.writeInput(state.sessionId, '\x03');
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/pause error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/resume
  // No-op for now — full HITL resume implemented in Task #70.
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

      // No-op — full resume (HITL unfreeze) is implemented in Task #70
      return res.status(200).json({ ok: true });
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
      const { text, scope, mode } = req.body ?? {};

      const execution = swarmEngine.getStatus(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      if (typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required and must be a string' });
      }

      const broadcastMode = mode === 'hard' ? 'hard' : 'soft';

      // Collect target agent session IDs filtered by scope
      const targets = [];
      for (const [nodeId, state] of Object.entries(execution.agentStates)) {
        if (state.status !== 'running' || !state.sessionId) continue;

        // scope: 'all' → all running agents
        //        agentNodeId → exact node match
        //        departmentId → match by nodeId prefix or exact (best-effort for now)
        if (!scope || scope === 'all' || scope === nodeId) {
          targets.push(state.sessionId);
        }
      }

      // Send to each target
      for (const sessionId of targets) {
        if (broadcastMode === 'soft') {
          // Soft: append text + ESC marker + newline — agent reads and decides
          sessionManager.writeInput(sessionId, text + '\x1b\n');
        } else {
          // Hard: interrupt (Ctrl-C), wait 300ms, send text + ESC, wait 100ms, send newline
          // Fire-and-forget — no await
          sessionManager.writeInput(sessionId, '\x03');
          setTimeout(() => {
            sessionManager.writeInput(sessionId, text + '\x1b');
            setTimeout(() => {
              sessionManager.writeInput(sessionId, '\n');
            }, 100);
          }, 300);
        }
      }

      return res.status(200).json({ sent: targets.length });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/broadcast error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:workflowId/scaffold
  // Stub — full implementation in Task #47.2 / #59.
  // -------------------------------------------------------------------------
  router.post('/:workflowId/scaffold', (req, res) => {
    return res.status(501).json({ error: 'Not implemented — scaffold endpoint coming in Task #59' });
  });

  return router;
}
