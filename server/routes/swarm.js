// server/routes/swarm.js
// Execution control REST API for the V3 Swarm Orchestrator — Task #47.1
//
// POST   /api/v1/swarm/scaffold                   → 201 { workflowId, workflowDef }
// POST   /api/v1/swarm/:workflowId/start         → 201 { executionId, status }
// POST   /api/v1/swarm/:executionId/pause         → 200 { ok: true }
// POST   /api/v1/swarm/:executionId/resume        → 200 { ok: true }
// DELETE /api/v1/swarm/:executionId               → 204
// GET    /api/v1/swarm/:executionId/status        → 200 { executionId, status, agentStates, edgeCounters, budget }
// GET    /api/v1/swarm/:executionId/agent/:nodeId/output → 200 { output: string }
// POST   /api/v1/swarm/:executionId/broadcast     → 200 { sent: number }

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// generateWorkflowFromPrompt(prompt)
// Calls Claude API to produce a workflow definition JSON from a natural-language
// description. Strips accidental markdown fences and validates basic structure.
// Throws on Claude API failure, JSON parse error, or invalid structure.
// ---------------------------------------------------------------------------
async function generateWorkflowFromPrompt(prompt) {
  const client = new Anthropic(); // uses ANTHROPIC_API_KEY env var

  const systemPrompt = `You are a workflow designer. Given a user's description, generate a multi-agent workflow definition as JSON.

Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "name": "string (max 100 chars, alphanumeric + spaces + hyphens)",
  "description": "string (max 500 chars)",
  "nodes": [
    {
      "id": "string (unique, e.g. node-1)",
      "type": "agent",
      "data": {
        "label": "string",
        "systemPrompt": "string (the agent's role and instructions)",
        "isTriageNode": boolean
      },
      "position": { "x": number, "y": number }
    }
  ],
  "edges": [
    {
      "id": "string (unique, e.g. edge-1)",
      "source": "node-id",
      "target": "node-id",
      "type": "handoff"
    }
  ]
}

Rules:
- First node should have isTriageNode: true
- Nodes should be positioned in a logical flow (left to right or top to bottom)
- Position x/y should be spaced 200px apart
- Maximum 10 nodes, 15 edges
- Name must match /^[\\w\\s\\-.]+$/ (letters, numbers, spaces, hyphens, dots only)`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text;
  if (!text) throw new Error('No response from Claude');

  // Parse JSON — strip any accidental markdown fences
  const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  const wf = JSON.parse(clean);

  // Basic validation
  if (!wf.name || !Array.isArray(wf.nodes) || wf.nodes.length === 0) {
    throw new Error('Invalid workflow structure from Claude');
  }

  return wf;
}

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
  // POST /api/v1/swarm/scaffold
  // Body: { prompt: string, projectId?: string }
  // Calls Claude API to generate a workflow definition, saves to WorkflowStore.
  // → 201 { workflowId, workflowDef }
  // → 400 if prompt missing, empty, or > 2000 chars
  // → 503 if WorkflowStore unavailable
  // → 500 on Claude API failure or invalid response
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

    try {
      const workflowDef = await generateWorkflowFromPrompt(prompt.trim());

      // Attach projectId if provided
      if (projectId && typeof projectId === 'string') {
        workflowDef.projectId = projectId.trim();
      }

      const store = req.app.locals.workflowStore;
      if (!store) return res.status(503).json({ error: 'WorkflowStore unavailable' });

      const created = await store.create(workflowDef);
      return res.status(201).json({ workflowId: created.id, workflowDef: created });
    } catch (err) {
      console.error(`[swarm] POST /scaffold error: ${err.message}`);
      return res.status(500).json({ error: err.message });
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
  // Sends Ctrl-C to all running agent sessions and sets their status to 'paused'.
  // Calls swarmEngine.pauseExecution() to update state and broadcast WS events.
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

      // Update execution state to 'paused' and broadcast WS events (BUG-94 fix)
      swarmEngine.pauseExecution(executionId);

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/pause error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/resume
  // Resumes all paused agents by setting their status back to 'running'.
  // Calls swarmEngine.resumeExecution() to update state and broadcast WS events.
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

      // Resume execution — set paused agents to 'running' (BUG-95 fix)
      swarmEngine.resumeExecution(executionId);

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

  return router;
}
