// server/index.js
// Full server bootstrap for Claude Code Visual Manager.
// Startup sequence matches docs/ARCHITECTURE.md § 10.

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import express from 'express';
import { WebSocketServer } from 'ws';

import { discoverClaudeBinary, discoverCodexBinary } from './services/BinaryDiscovery.js';
import { ConfigStore } from './services/ConfigStore.js';
import { WorkflowStore } from './services/WorkflowStore.js';
import { ProcessRegistry } from './services/ProcessRegistry.js';
import SwarmEngine from './services/SwarmEngine.js';
import CircuitBreaker from './services/CircuitBreaker.js';
import BudgetTracker from './services/BudgetTracker.js';
import TriggerManager from './services/TriggerManager.js';
import { securityMiddleware } from './middleware/security.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { ApiError } from './middleware/pathValidation.js';
import projectsRouter from './routes/projects.js';
import sessionsRouter from './routes/sessions.js';
import agentsRouter from './routes/agents.js';
import skillsRouter from './routes/skills.js';
import claudemdRouter from './routes/claudemd.js';
import jobsRouter from './routes/jobs.js';
import workflowsRouter from './routes/workflows.js';
import swarmRoutes from './routes/swarm.js';
import inboxRoutes from './routes/inbox.js';
import triggersRouter from './routes/triggers.js';
import { sessionManager } from './services/SessionManager.js';
import { jobRunner } from './services/JobRunner.js';
import { setupTerminalWebSocket } from './ws/terminalHandler.js';
import handleSwarmConnection, { broadcast } from './ws/swarmHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Package version — read once at startup
// ---------------------------------------------------------------------------
const _pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const APP_VERSION = _pkg.version || '0.0.0';

// ---------------------------------------------------------------------------
// Auto-open browser helper
// Opens the given URL in the system default browser.
// Skipped when NO_OPEN=1 (tests, CI, headless servers).
// Uses spawn({ shell: false }) — URL is passed as an array argument, never
// interpolated into a shell string (SEC-02).
// ---------------------------------------------------------------------------
function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const platform = process.platform;
  let bin, args;
  if (platform === 'win32') {
    // 'start' is a cmd.exe built-in; invoke via cmd /c with an explicit title arg
    bin = 'cmd.exe';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    bin = 'open';
    args = [url];
  } else {
    bin = 'xdg-open';
    args = [url];
  }

  const child = spawn(bin, args, { shell: false, detached: true, stdio: 'ignore' });
  child.unref();
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (no external deps)
// maxRequests per windowMs per IP.  Localhost-only so this guards against
// runaway client loops, not external attackers.
// ---------------------------------------------------------------------------
const _rateLimitMap = new Map();
function rateLimit(maxRequests = 200, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const record = _rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;
    _rateLimitMap.set(ip, record);

    if (record.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    return next();
  };
}

// Periodic sweep of stale rate-limit entries to prevent memory leak (BUG-07).
// Entries whose window has expired are no longer needed — delete them.
const _rateLimitSweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of _rateLimitMap) {
    if (now > record.resetAt) {
      _rateLimitMap.delete(ip);
    }
  }
}, 60_000);
_rateLimitSweepInterval.unref();

// ---------------------------------------------------------------------------
// 1. Load env
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? '3000', 10);
// IDLE_TIMEOUT_MINUTES and CLAUDE_BIN are consumed by their respective modules

// ---------------------------------------------------------------------------
// 2–4. Startup sequence (async IIFE so we can await and handle fatal errors)
// ---------------------------------------------------------------------------
let claudeBin;
let codexBin = null;

async function startup() {
  console.log(`[startup] Starting Claude Code Visual Manager v${APP_VERSION}`);

  // Step 2: Discover claude binary — throws and we exit if not found
  try {
    claudeBin = await discoverClaudeBinary();
    console.log(`[startup] Discovered claude binary: ${claudeBin}`);
    // Make claudeBin available to SessionManager and JobRunner (via public property on singletons)
    sessionManager.claudeBin = claudeBin;
    jobRunner.claudeBin = claudeBin;
  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  try {
    codexBin = await discoverCodexBinary();
    console.log(`[startup] Discovered codex binary for scaffold fallback: ${codexBin}`);
  } catch (err) {
    console.warn(`[startup] Codex scaffold fallback unavailable: ${err.message}`);
  }

  // Step 3: Load config (creates defaults if file missing)
  try {
    await ConfigStore.load();
    console.log(`[startup] Config store: ${ConfigStore.CONFIG_DIR}`);
  } catch (err) {
    console.error(`[FATAL] Failed to load config: ${err.message}`);
    process.exit(1);
  }

  // Step 4: Kill any orphaned processes from a previous run
  try {
    await ProcessRegistry.cleanupStale();
    console.log('[startup] ProcessRegistry: stale process cleanup complete.');
  } catch (err) {
    // Non-fatal — log and continue
    console.error(`[WARN] ProcessRegistry cleanup error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 5. Build Express app and apply middleware
  // -------------------------------------------------------------------------
  const app = express();

  // Initialize workflow store (creates workflows/ dir if missing)
  try {
    const workflowStore = new WorkflowStore(ConfigStore.CONFIG_DIR);
    await workflowStore.init();
    app.locals.workflowStore = workflowStore;
    console.log(`[startup] Workflow store: ${ConfigStore.CONFIG_DIR}/workflows`);
  } catch (err) {
    // Non-fatal — log and continue; workflows feature degrades gracefully
    console.error(`[WARN] WorkflowStore init error: ${err.message}`);
  }

  // Security (Helmet + CSP)
  securityMiddleware(app);

  // Body parsing
  app.use(express.json());

  // CSRF protection
  app.use(csrfMiddleware);

  // -------------------------------------------------------------------------
  // 6. Routes
  // -------------------------------------------------------------------------

  // Health check — includes uptime, session count, job count
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: APP_VERSION,
      uptime: process.uptime(),
      activeSessions: sessionManager.listSessions().length,
      activeJobs: jobRunner.listJobs?.().length ?? 0,
    });
  });

  // Rate limiting on all /api/v1/* routes (200 req/min — guards against runaway loops)
  app.use('/api/v1', rateLimit(200, 60000));

  // Version endpoint
  app.get('/api/v1/version', (req, res) => {
    res.json({
      appVersion: APP_VERSION,
      nodeVersion: process.version,
      platform: process.platform,
    });
  });

  // Project management routes
  app.use('/api/v1/projects', projectsRouter);

  // Session management routes
  app.use('/api/v1/sessions', sessionsRouter);

  // Entity management routes (agents, skills, CLAUDE.md)
  app.use('/api/v1/agents', agentsRouter);
  app.use('/api/v1/skills', skillsRouter);
  app.use('/api/v1/claudemd', claudemdRouter);

  // Job mode routes
  app.use('/api/v1/jobs', jobsRouter);

  // Workflow routes
  app.use('/api/v1/workflows', workflowsRouter);

  // -------------------------------------------------------------------------
  // 7. Instantiate SwarmEngine + mount swarm/inbox/trigger routes
  // SwarmEngine must be created before mounting its routes so the factory
  // functions receive a live instance, not undefined. (Task #80 fix)
  // -------------------------------------------------------------------------
  const workflowStore = app.locals.workflowStore;
  const circuitBreaker = new CircuitBreaker();
  const budgetTracker = new BudgetTracker();
  const swarmEngine = new SwarmEngine(sessionManager, workflowStore, circuitBreaker, budgetTracker);
  app.locals.swarmEngine = swarmEngine;
  app.locals.sessionManager = sessionManager;

  // Swarm execution control routes — mounted here so swarmEngine is already assigned
  app.use('/api/v1/swarm', swarmRoutes(swarmEngine, sessionManager, { claudeBin, codexBin }));

  // HITL inbox routes (approve/reject — separate router, same /api/v1/swarm prefix)
  app.use('/api/v1/swarm', inboxRoutes(swarmEngine));

  // Initialize TriggerManager (depends on swarmEngine)
  const triggerManager = new TriggerManager(swarmEngine);
  app.locals.triggerManager = triggerManager;

  // Give SwarmEngine a back-reference to TriggerManager so stopExecution()
  // can call cleanupExecution() and stop RSS pollers (Task #83 fix).
  swarmEngine.setTriggerManager(triggerManager);

  // Mount triggers router now that swarmEngine is available
  app.use('/api/v1/triggers', triggersRouter(triggerManager));

  // -------------------------------------------------------------------------
  // 8. Serve static client build
  // -------------------------------------------------------------------------
  app.use(express.static(join(__dirname, 'public')));

  // -------------------------------------------------------------------------
  // 9. SPA fallback — non-API routes return index.html
  // -------------------------------------------------------------------------
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  // -------------------------------------------------------------------------
  // 10. Global error handler
  // NEVER log req.body or response data (SEC-08)
  // -------------------------------------------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    // Unexpected error — log for debugging but never expose internals
    console.error(`[ERROR] ${req.method} ${req.path} —`, err.message);
    return res.status(500).json({ error: 'Internal server error' });
  });

  // -------------------------------------------------------------------------
  // 11. Start HTTP server — MUST bind to 127.0.0.1 (DEC-002)
  // -------------------------------------------------------------------------
  const server = createServer(app);

  // Wire WebSocket broadcast to SwarmEngine so execution events reach subscribers.
  swarmEngine.setWsBroadcast(broadcast);

  // WebSocket routing — two noServer WSS instances, routed by URL path.
  // /ws/swarm  → swarm execution updates (Task #48)
  // /ws/* (all other paths) → PTY terminal sessions
  const wssTerminal = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });
  const wssSwarm = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });

  setupTerminalWebSocket(wssTerminal);

  wssSwarm.on('connection', (ws, req) => {
    handleSwarmConnection(ws, req, swarmEngine);
  });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/ws/swarm')) {
      wssSwarm.handleUpgrade(req, socket, head, (ws) => {
        wssSwarm.emit('connection', ws, req);
      });
    } else {
      wssTerminal.handleUpgrade(req, socket, head, (ws) => {
        wssTerminal.emit('connection', ws, req);
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${PORT}`;
      console.log(`[startup] Server running at ${url}`);
      if (!process.env.NO_OPEN) {
        console.log('[startup] Opening browser...');
        openBrowser(url);
      }
      resolve();
    });
  });

  // -------------------------------------------------------------------------
  // 11. Graceful shutdown handlers
  // -------------------------------------------------------------------------
  async function shutdown(signal) {
    console.log(`\n[${signal}] Shutting down gracefully…`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed.');
    });

    // Cancel all running jobs (sends cancelled SSE event + closes connections)
    try {
      jobRunner.cancelAll();
    } catch (err) {
      console.error(`[WARN] JobRunner cancelAll error: ${err.message}`);
    }

    // Kill all active PTY sessions first (sends close to WebSocket clients)
    try {
      await sessionManager.killAll();
    } catch (err) {
      console.error(`[WARN] SessionManager killAll error: ${err.message}`);
    }

    // Kill any remaining orphaned processes from a previous run
    try {
      await ProcessRegistry.cleanupStale();
    } catch (err) {
      console.error(`[WARN] ProcessRegistry shutdown cleanup error: ${err.message}`);
    }

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startup();
