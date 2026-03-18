// server/services/JobRunner.js
// Manages one-shot Claude job executions: spawns `claude -p`, streams JSON output via SSE.
//
// DEC-003: SSE (not WebSocket) for job output — unidirectional, no upgrade handshake.
// DEC-005: child.stdin.end() called immediately after spawn (GitHub #7497 hang prevention).
// DEC-006: tree-kill for cancellation — kills full process tree on Windows.
// SEC-08:  Prompt content is NEVER logged.
// SEC-02:  shell: false always.

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';

// tree-kill is CommonJS only — use createRequire to import it
const require = createRequire(import.meta.url);
const treeKill = require('tree-kill');

// ---------------------------------------------------------------------------
// Helper: write a single SSE data frame to a response
// ---------------------------------------------------------------------------
function sendSse(res, data) {
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

// ---------------------------------------------------------------------------
// Helper: close all SSE client connections for a job
// ---------------------------------------------------------------------------
function closeAllClients(job) {
  for (const res of job.clients) {
    try {
      res.end();
    } catch {
      // Client already gone — ignore
    }
  }
  job.clients.clear();
}

// ---------------------------------------------------------------------------
// JobRunner class
// ---------------------------------------------------------------------------
export class JobRunner {
  // Map<jobId, JobRecord>
  #jobs = new Map();

  // Set by server/index.js after binary discovery (same pattern as SessionManager)
  claudeBin = null;

  // -------------------------------------------------------------------------
  // startJob
  // Spawns `claude -p <prompt> --output-format stream-json ...` and wires up
  // stdout readline + close handlers. Returns summary object immediately.
  // -------------------------------------------------------------------------
  startJob(projectId, projectPath, prompt, allowedTools, maxTurns) {
    if (!this.claudeBin) {
      throw new Error('claudeBin not set — call jobRunner.claudeBin = claudeBin after binary discovery');
    }

    const jobId = uuidv4();

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--allowedTools', allowedTools ?? 'all',
      '--max-turns', String(maxTurns ?? 10),
      '--no-session-persistence',
    ];

    const child = spawn(this.claudeBin, args, {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // SEC-02: never shell: true
    });

    // CRITICAL: close stdin immediately after spawn.
    // Without this, the Claude process waits indefinitely for input.
    // Fix for GitHub issue #7497.
    child.stdin.end();

    const job = {
      jobId,
      projectId,
      prompt,           // kept in-memory for completeness; NEVER logged (SEC-08)
      allowedTools: allowedTools ?? 'all',
      maxTurns: maxTurns ?? 10,
      child,
      clients: new Set(),
      status: 'running',
      result: null,
      createdAt: new Date(),
      completedAt: null,
    };

    this.#jobs.set(jobId, job);

    // -----------------------------------------------------------------------
    // Read stdout line-by-line via readline.
    // Each line is expected to be a stream-json event from Claude.
    // -----------------------------------------------------------------------
    let lastResultEvent = null;

    const rl = createInterface({ input: child.stdout });

    rl.on('line', (line) => {
      if (!line.trim()) return; // skip blank lines

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        // NFR-16: malformed lines must not crash the server — forward as raw
        parsed = { type: 'raw', data: line };
      }

      // Track the last event that carries a `result` field for final extraction
      if (parsed && parsed.result !== undefined) {
        lastResultEvent = parsed;
      }

      // Forward the parsed event to all currently connected SSE clients
      for (const res of job.clients) {
        try {
          sendSse(res, parsed);
        } catch {
          // Client disconnected mid-stream — cleanup handled by res.on('close')
        }
      }
    });

    // -----------------------------------------------------------------------
    // Stderr: log warnings only — do NOT forward to clients, do NOT log prompt
    // -----------------------------------------------------------------------
    child.stderr.on('data', (data) => {
      // Log truncated stderr for diagnostics; never include prompt content (SEC-08)
      const text = data.toString().trim();
      if (text) {
        console.warn(`[JobRunner] stderr jobId=${jobId} — ${text.slice(0, 200)}`);
      }
    });

    // -----------------------------------------------------------------------
    // Process exit handler
    // -----------------------------------------------------------------------
    child.on('close', (code) => {
      // Only update if not already cancelled
      if (job.status === 'running') {
        job.status = code === 0 ? 'done' : 'error';
      }

      job.completedAt = new Date();

      // Extract final result from the last stream-json event that had a result field
      if (lastResultEvent !== null && lastResultEvent.result !== undefined) {
        job.result = lastResultEvent.result;
      }

      console.log(
        `[JobRunner] Job finished — jobId=${jobId} status=${job.status} exitCode=${code}`
      );

      // Send the terminal done/cancelled event to all connected SSE clients
      const finalEvent =
        job.status === 'cancelled'
          ? { type: 'cancelled' }
          : { type: 'done', result: job.result, exitCode: code };

      for (const res of job.clients) {
        try {
          sendSse(res, finalEvent);
        } catch {
          // Client gone — ignore
        }
      }

      // Close all SSE connections — job is finished
      closeAllClients(job);
    });

    console.log(`[JobRunner] Job started — jobId=${jobId} projectId=${projectId}`);
    // NOTE: prompt intentionally not logged (SEC-08)

    return { jobId, projectId, createdAt: job.createdAt };
  }

  // -------------------------------------------------------------------------
  // cancelJob
  // Sends SIGTERM to the full process tree via tree-kill.
  // Returns false if job not found or not in running state.
  // -------------------------------------------------------------------------
  cancelJob(jobId) {
    const job = this.#jobs.get(jobId);
    if (!job) return false;
    if (job.status !== 'running') return false;

    // Mark cancelled before tree-kill to prevent the close handler from
    // overwriting status with 'error' if the process exits non-zero.
    job.status = 'cancelled';

    // DEC-006: tree-kill walks the process tree — required on Windows
    treeKill(job.child.pid, 'SIGTERM', (err) => {
      if (err) {
        // Process may have already exited on its own — not an error condition
        console.warn(`[JobRunner] tree-kill warning jobId=${jobId}: ${err.message}`);
      }
    });

    // Send cancelled event to all connected SSE clients
    for (const res of job.clients) {
      try {
        sendSse(res, { type: 'cancelled' });
      } catch {
        // Client already gone
      }
    }

    // Close all SSE connections
    closeAllClients(job);

    console.log(`[JobRunner] Job cancelled — jobId=${jobId}`);
    return true;
  }

  // -------------------------------------------------------------------------
  // addSseClient
  // Attach an Express response object as an SSE client for a job.
  // Returns false if job not found.
  // -------------------------------------------------------------------------
  addSseClient(jobId, res) {
    const job = this.#jobs.get(jobId);
    if (!job) return false;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // If job already finished, send the terminal event immediately and close
    if (job.status !== 'running') {
      const finalEvent =
        job.status === 'cancelled'
          ? { type: 'cancelled' }
          : { type: 'done', result: job.result, exitCode: null };
      sendSse(res, finalEvent);
      res.end();
      return true;
    }

    // Job still running — add client and wire disconnect cleanup
    job.clients.add(res);

    res.on('close', () => {
      job.clients.delete(res);
    });

    return true;
  }

  // -------------------------------------------------------------------------
  // getJob
  // Returns the JobRecord or undefined.
  // -------------------------------------------------------------------------
  getJob(jobId) {
    return this.#jobs.get(jobId);
  }

  // -------------------------------------------------------------------------
  // listJobs
  // Returns all jobs — sanitized (no prompt, no result, no child, no clients).
  // -------------------------------------------------------------------------
  listJobs() {
    return Array.from(this.#jobs.values()).map((job) => ({
      jobId: job.jobId,
      projectId: job.projectId,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }));
  }

  // -------------------------------------------------------------------------
  // cancelAll
  // Cancel all running jobs — used in SIGTERM/SIGINT shutdown handler.
  // -------------------------------------------------------------------------
  cancelAll() {
    for (const [jobId, job] of this.#jobs) {
      if (job.status === 'running') {
        this.cancelJob(jobId);
      }
    }
  }
}

// Singleton — the entire server shares one JobRunner instance
export const jobRunner = new JobRunner();
