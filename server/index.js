// server/index.js
// Full server bootstrap for Claude Code Visual Manager.
// Startup sequence matches docs/ARCHITECTURE.md § 10.

import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';

import { discoverClaudeBinary } from './services/BinaryDiscovery.js';
import { ConfigStore } from './services/ConfigStore.js';
import { ProcessRegistry } from './services/ProcessRegistry.js';
import { securityMiddleware } from './middleware/security.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { ApiError } from './middleware/pathValidation.js';
import projectsRouter from './routes/projects.js';
import sessionsRouter from './routes/sessions.js';
import { sessionManager } from './services/SessionManager.js';
import { setupTerminalWebSocket } from './ws/terminalHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. Load env
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? '3000', 10);
// IDLE_TIMEOUT_MINUTES and CLAUDE_BIN are consumed by their respective modules

// ---------------------------------------------------------------------------
// 2–4. Startup sequence (async IIFE so we can await and handle fatal errors)
// ---------------------------------------------------------------------------
let claudeBin;

async function startup() {
  // Step 2: Discover claude binary — throws and we exit if not found
  try {
    claudeBin = await discoverClaudeBinary();
    console.log(`Claude CLI found at: ${claudeBin}`);
    // Make claudeBin available to SessionManager (via public property on singleton)
    sessionManager.claudeBin = claudeBin;
  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  // Step 3: Load config (creates defaults if file missing)
  try {
    await ConfigStore.load();
    console.log('ConfigStore loaded.');
  } catch (err) {
    console.error(`[FATAL] Failed to load config: ${err.message}`);
    process.exit(1);
  }

  // Step 4: Kill any orphaned processes from a previous run
  try {
    await ProcessRegistry.cleanupStale();
    console.log('ProcessRegistry: stale process cleanup complete.');
  } catch (err) {
    // Non-fatal — log and continue
    console.error(`[WARN] ProcessRegistry cleanup error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 5. Build Express app and apply middleware
  // -------------------------------------------------------------------------
  const app = express();

  // Security (Helmet + CSP)
  securityMiddleware(app);

  // Body parsing
  app.use(express.json());

  // CSRF protection
  app.use(csrfMiddleware);

  // -------------------------------------------------------------------------
  // 6. Routes
  // -------------------------------------------------------------------------

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '0.1.0', claudeBin });
  });

  // Project management routes
  app.use('/api/v1/projects', projectsRouter);

  // Session management routes
  app.use('/api/v1/sessions', sessionsRouter);

  // -------------------------------------------------------------------------
  // 7. Serve static client build
  // -------------------------------------------------------------------------
  app.use(express.static(join(__dirname, 'public')));

  // -------------------------------------------------------------------------
  // 8. SPA fallback — non-API routes return index.html
  // -------------------------------------------------------------------------
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  // -------------------------------------------------------------------------
  // 9. Global error handler
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
  // 10. Start HTTP server — MUST bind to 127.0.0.1 (DEC-002)
  // -------------------------------------------------------------------------
  const server = createServer(app);

  // WebSocket server — 1MB max payload to prevent memory exhaustion
  const wss = new WebSocketServer({ server, maxPayload: 1 * 1024 * 1024 });
  setupTerminalWebSocket(wss);

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Claude Code Visual Manager running at http://127.0.0.1:${PORT}`);
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
