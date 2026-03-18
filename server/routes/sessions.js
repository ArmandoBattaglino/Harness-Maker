// server/routes/sessions.js
// REST API for session management.
//
// GET    /api/v1/sessions        → list all sessions (sanitized)
// POST   /api/v1/sessions        → create new session
// GET    /api/v1/sessions/:id    → get session info (sanitized)
// DELETE /api/v1/sessions/:id    → kill session

import { Router } from 'express';
import { ApiError } from '../middleware/pathValidation.js';
import { ConfigStore } from '../services/ConfigStore.js';
import { sessionManager } from '../services/SessionManager.js';

const router = Router();

// -------------------------------------------------------------------------
// Sanitize a SessionRecord for API responses.
// Strips non-serializable or internal fields: pty, buffer, clients.
// -------------------------------------------------------------------------
function sanitizeSession(session) {
  return {
    sessionId: session.sessionId,
    projectId: session.projectId,
    pid: session.pid,
    status: session.status,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    clientCount: session.clients.size,
  };
}

// -------------------------------------------------------------------------
// GET /api/v1/sessions
// -------------------------------------------------------------------------
router.get('/', (req, res) => {
  const sessions = sessionManager.listSessions().map(sanitizeSession);
  res.json({ sessions });
});

// -------------------------------------------------------------------------
// POST /api/v1/sessions
// Body: { projectId: string }
// -------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.body ?? {};

    if (typeof projectId !== 'string' || projectId.trim() === '') {
      throw new ApiError(400, 'projectId is required');
    }

    // Look up project from ConfigStore
    const projects = ConfigStore.getProjects();
    const project = projects.find((p) => p.id === projectId.trim());

    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    // claudeBin is exported from index.js and stored on the sessionManager
    // at startup. Retrieve it here.
    const claudeBinary = sessionManager.claudeBin;
    if (!claudeBinary) {
      // This should never happen if startup ran correctly
      throw new ApiError(500, 'Claude binary not configured');
    }

    const session = await sessionManager.createSession(
      project.id,
      project.path,
      claudeBinary
    );

    res.status(201).json({ session: sanitizeSession(session) });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------------
// GET /api/v1/sessions/:id
// -------------------------------------------------------------------------
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const session = sessionManager.getSession(id);

    if (!session) {
      throw new ApiError(404, 'Session not found');
    }

    res.json({ session: sanitizeSession(session) });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------------
// DELETE /api/v1/sessions/:id
// -------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = sessionManager.getSession(id);

    if (!session) {
      throw new ApiError(404, 'Session not found');
    }

    await sessionManager.killSession(id);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
