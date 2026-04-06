// server/routes/workflows.js
// CRUD REST API for workflow definitions — Task #44
// All mutating routes require X-Requested-With: ClaudeCodeManager (enforced globally by csrfMiddleware)

import { Router } from 'express';

import { ApiError } from '../middleware/pathValidation.js';
import { TemplateStore } from '../stores/TemplateStore.js';

const router = Router();
const templateStore = new TemplateStore();

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
// GET /api/v1/workflows/templates
// Returns summary metadata for all built-in workflow templates.
// ---------------------------------------------------------------------------
router.get('/templates', (_req, res) => {
  const templates = templateStore.listTemplates();
  res.json({ templates });
});

// ---------------------------------------------------------------------------
// POST /api/v1/workflows/templates/:templateId/instantiate
// Creates a new workflow from a template using WorkflowStore.
// Returns 201 with the created WorkflowDefinition, or 404 if template not found.
// ---------------------------------------------------------------------------
router.post('/templates/:templateId/instantiate', async (req, res, next) => {
  try {
    const store = getStore(req);
    const { templateId } = req.params;

    const template = templateStore.getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found', templateId });
    }

    // Build a workflow definition from the template
    const workflowData = {
      name: template.name,
      description: template.description,
      nodes: JSON.parse(JSON.stringify(template.nodes)), // deep clone
      edges: JSON.parse(JSON.stringify(template.edges)),
      settings: JSON.parse(JSON.stringify(template.settings)),
    };

    const workflow = await store.create(workflowData);
    return res.status(201).json({ workflow });
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
// GET /api/v1/workflows/:id/versions
// Returns version history metadata for a workflow.
// ---------------------------------------------------------------------------
router.get('/:id/versions', async (req, res, next) => {
  try {
    const store = getStore(req);
    const { id } = req.params;

    const workflow = await store.get(id);
    if (workflow === null) {
      return res.status(404).json({ error: 'Workflow not found', id });
    }

    const versions = await store.listVersions(id);
    return res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/workflows/:id/versions/:timestamp/restore
// Restores a previous version as the current workflow.
// Returns the restored WorkflowDefinition.
// ---------------------------------------------------------------------------
router.post('/:id/versions/:timestamp/restore', async (req, res, next) => {
  try {
    const store = getStore(req);
    const { id, timestamp } = req.params;

    let restored;
    try {
      restored = await store.restoreVersion(id, timestamp);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }

    return res.json({ workflow: restored });
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
