// server/routes/inbox.js
// HITL inbox — approve/reject agent decisions requiring human input.
//
// GET  /api/v1/swarm/:executionId/inbox               → 200 { items }
// POST /api/v1/swarm/:executionId/inbox/:itemId/approve → 200 { ok: true }
// POST /api/v1/swarm/:executionId/inbox/:itemId/reject  → 200 { ok: true }

import { Router } from 'express';
import { validateResumeText } from '../middleware/hitlValidation.js';

/**
 * Factory function — returns an Express router with HITL inbox endpoints.
 *
 * @param {import('../services/SwarmEngine.js').default} swarmEngine
 * @returns {Router}
 */
export default function inboxRoutes(swarmEngine) {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/:executionId/inbox
  // Returns the list of pending HITL items for the given execution.
  // → 200 { items: [] }
  // → 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/inbox', (req, res) => {
    try {
      const { executionId } = req.params;
      const status = swarmEngine.getStatus(executionId);
      if (!status) return res.status(404).json({ error: 'Execution not found' });

      const execution = swarmEngine._executions.get(executionId);
      const items = execution?.inboxItems ?? [];
      return res.json({ items });
    } catch (err) {
      console.error(`[inbox] GET /:executionId/inbox error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/inbox/:itemId/approve
  // Body: { resumeText?: string }
  // Removes the inbox item, writes resumeText to the agent's PTY session,
  // sets agent status back to 'running', and broadcasts hitl_resolved.
  // → 200 { ok: true }
  // → 400 if resumeText exceeds 8KB (validateResumeText middleware)
  // → 404 if execution or item not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/inbox/:itemId/approve', validateResumeText, async (req, res) => {
    try {
      const { executionId, itemId } = req.params;
      const { resumeText } = req.body || {};

      const execution = swarmEngine._executions.get(executionId);
      if (!execution) return res.status(404).json({ error: 'Execution not found' });

      const itemIndex = execution.inboxItems.findIndex((i) => i.id === itemId);
      if (itemIndex === -1) return res.status(404).json({ error: 'Item not found' });

      const item = execution.inboxItems[itemIndex];
      execution.inboxItems.splice(itemIndex, 1);

      // Resume the paused agent PTY with resumeText if provided
      const agentState = execution.agentStates.get(item.nodeId);
      if (agentState?.sessionId && resumeText) {
        swarmEngine._sessionManager.writeInput(agentState.sessionId, resumeText + '\n');
      }

      // Unfreeze the agent
      if (agentState) agentState.status = 'running';

      // Broadcast resolution to WS subscribers
      if (swarmEngine._wsBroadcast) {
        swarmEngine._wsBroadcast(executionId, {
          type: 'hitl_resolved',
          itemId,
          nodeId: item.nodeId,
          decision: 'approved',
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error(`[inbox] POST /:executionId/inbox/:itemId/approve error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/inbox/:itemId/reject
  // Removes the inbox item and broadcasts hitl_resolved with decision 'rejected'.
  // Agent remains frozen — Task #70 will implement full unfreeze/cancel logic.
  // → 200 { ok: true }
  // → 404 if execution or item not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/inbox/:itemId/reject', async (req, res) => {
    try {
      const { executionId, itemId } = req.params;

      const execution = swarmEngine._executions.get(executionId);
      if (!execution) return res.status(404).json({ error: 'Execution not found' });

      const itemIndex = execution.inboxItems.findIndex((i) => i.id === itemId);
      if (itemIndex === -1) return res.status(404).json({ error: 'Item not found' });

      const item = execution.inboxItems[itemIndex];
      execution.inboxItems.splice(itemIndex, 1);

      // Broadcast resolution to WS subscribers
      if (swarmEngine._wsBroadcast) {
        swarmEngine._wsBroadcast(executionId, {
          type: 'hitl_resolved',
          itemId,
          nodeId: item.nodeId,
          decision: 'rejected',
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error(`[inbox] POST /:executionId/inbox/:itemId/reject error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
