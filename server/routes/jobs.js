// server/routes/jobs.js
// Job Mode REST API + SSE streaming — Task #9
//
// POST   /api/v1/jobs           (FR-22) — spawn claude -p, return jobId
// GET    /api/v1/jobs/:id/stream (FR-23) — SSE stream for job output
// DELETE /api/v1/jobs/:id       (FR-25) — cancel running job
// GET    /api/v1/jobs           (bonus) — list all jobs (sanitized)

import { Router } from 'express';
import { ApiError } from '../middleware/pathValidation.js';
import { ConfigStore } from '../services/ConfigStore.js';
import { jobRunner } from '../services/JobRunner.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/jobs
// Returns all jobs — excludes prompt and result content (SEC-08)
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const jobs = jobRunner.listJobs();
  res.json({ jobs });
});

// ---------------------------------------------------------------------------
// POST /api/v1/jobs  (FR-22)
// Body: { projectId, prompt, allowedTools?, maxTurns? }
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { projectId, prompt, allowedTools, maxTurns } = req.body ?? {};

    // Validate projectId
    if (typeof projectId !== 'string' || projectId.trim() === '') {
      throw new ApiError(400, 'projectId is required');
    }

    // Validate prompt — must be a non-empty string
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new ApiError(400, 'prompt is required and must be a non-empty string');
    }

    // Validate allowedTools if provided — MEDIUM-02 (security audit)
    // Character-set whitelist: only alphanumeric, underscore, comma, hyphen.
    // Max 512 chars to prevent unreasonably large inputs.
    if (allowedTools !== undefined) {
      if (typeof allowedTools !== 'string') {
        throw new ApiError(400, 'allowedTools must be a string');
      }
      if (allowedTools.length > 512) {
        throw new ApiError(400, 'Invalid allowedTools value');
      }
      if (!/^[a-zA-Z0-9_,\-]+$/.test(allowedTools)) {
        throw new ApiError(400, 'Invalid allowedTools value');
      }
    }

    // Validate maxTurns if provided
    if (maxTurns !== undefined) {
      const parsed = Number(maxTurns);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new ApiError(400, 'maxTurns must be an integer between 1 and 100');
      }
    }

    // Look up the project — 404 if not registered
    const projects = ConfigStore.getProjects();
    const project = projects.find((p) => p.id === projectId.trim());
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    // Ensure claudeBin is set (set by index.js at startup)
    if (!jobRunner.claudeBin) {
      throw new ApiError(500, 'Claude binary not configured');
    }

    let jobSummary;
    try {
      jobSummary = jobRunner.startJob(
        project.id,
        project.path,
        prompt,
        allowedTools,
        maxTurns !== undefined ? Number(maxTurns) : undefined
      );
    } catch (err) {
      console.error(`[jobs] startJob error: ${err.message}`);
      throw new ApiError(500, 'Failed to start job');
    }

    res.status(201).json(jobSummary);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/jobs/:id
// Returns current status and result of a single job (BUG-22 fix).
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const job = jobRunner.getJob(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Sanitize — never expose prompt content or child process ref (SEC-08)
  res.json({
    jobId: job.jobId,
    projectId: job.projectId,
    status: job.status,
    createdAt: job.createdAt,
    result: job.result ?? null,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/jobs/:id/stream  (FR-23)
// SSE endpoint — stays open until the job finishes or the client disconnects.
// Express timeout MUST be disabled for this route.
// ---------------------------------------------------------------------------
router.get('/:id/stream', (req, res) => {
  const { id } = req.params;

  // Disable Express/Node.js request and response timeouts for long-running SSE
  req.setTimeout(0);
  res.setTimeout(0);

  const found = jobRunner.addSseClient(id, res);
  if (!found) {
    // addSseClient returns false when the jobId is unknown
    res.status(404).json({ error: 'Job not found' });
  }
  // If found === true, res is now an open SSE stream — do NOT call res.end() here.
  // It will be closed by JobRunner when the job finishes or is cancelled.
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/jobs/:id  (FR-25)
// Cancel a running job — kills the full process tree via tree-kill.
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const cancelled = jobRunner.cancelJob(id);

    if (!cancelled) {
      // cancelJob returns false if job not found or already finished/cancelled
      const job = jobRunner.getJob(id);
      if (!job) {
        throw new ApiError(404, 'Job not found');
      }
      // Job exists but is not in a cancellable state
      throw new ApiError(409, `Job cannot be cancelled — current status: ${job.status}`);
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
