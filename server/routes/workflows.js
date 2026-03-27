// server/routes/workflows.js
// CRUD REST API for workflow definitions — Task #44
// All mutating routes require X-Requested-With: ClaudeCodeManager (enforced globally by csrfMiddleware)

import { Router } from 'express';

import { ApiError } from '../middleware/pathValidation.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: get WorkflowStore from app.locals (set during startup in index.js)
// ---------------------------------------------------------------------------
function getStore(req) {
  const store = req.app.locals.workflowStore;
  if (!store) {
    throw new ApiError(503, 'Workflow service unavailable');
  }
  return store;
}

// ---------------------------------------------------------------------------
// GET /api/v1/workflows
// Returns all workflow definitions.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const store = getStore(req);
    const workflows = await store.list();
    res.json({ workflows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/workflows
// Body: WorkflowDefinition (without id/createdAt/updatedAt — server generates those)
// Returns 201 with the created workflow, or 400 on validation failure.
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const store = getStore(req);
    const data = req.body ?? {};

    let workflow;
    try {
      workflow = await store.create(data);
    } catch (err) {
      if (err.statusCode === 400) {
        // Validation error — extract structured details from the message
        const details = err.message.replace(/^Validation failed:\s*/, '').split('; ');
        return res.status(400).json({ error: 'Validation failed', details });
      }
      throw err;
    }

    return res.status(201).json({ workflow });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/workflows/:id
// Returns a single workflow by ID, or 404 if not found.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const store = getStore(req);
    const { id } = req.params;

    const workflow = await store.get(id);
    if (workflow === null) {
      return res.status(404).json({ error: 'Workflow not found', id });
    }

    return res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/workflows/:id
// Full update — replaces mutable fields.
// Returns 200 with the updated workflow, 404 if not found, 400 on validation failure.
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res, next) => {
  try {
    const store = getStore(req);
    const { id } = req.params;
    const data = req.body ?? {};

    let workflow;
    try {
      workflow = await store.update(id, data);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ error: 'Workflow not found', id });
      }
      if (err.statusCode === 400) {
        const details = err.message.replace(/^Validation failed:\s*/, '').split('; ');
        return res.status(400).json({ error: 'Validation failed', details });
      }
      throw err;
    }

    return res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/workflows/:id
// Returns 204 on success, 404 if not found.
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const store = getStore(req);
    const { id } = req.params;

    // Check existence before attempting delete
    const existing = await store.get(id);
    if (existing === null) {
      return res.status(404).json({ error: 'Workflow not found', id });
    }

    await store.delete(id);
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
