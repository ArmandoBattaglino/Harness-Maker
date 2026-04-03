// server/services/SessionManager.js
// Sole owner of all PTY operations — runs on the main Node.js thread only.
// DEC-009: pty.onData handler is permanent, wired once at spawn, never removed.
// PTY lifetime is decoupled from WebSocket lifetime — PTY survives tab close.

import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';
import pty from 'node-pty';
import { RingBuffer } from './RingBuffer.js';
import { ProcessRegistry } from './ProcessRegistry.js';

// tree-kill is CommonJS only
const require = createRequire(import.meta.url);
const treeKill = require('tree-kill');

// WebSocket.OPEN = 1 (avoid importing ws just for the constant)
const WS_OPEN = 1;

// Idle timeout: kill session after N minutes of no activity
const IDLE_TIMEOUT_MS =
  (parseInt(process.env.IDLE_TIMEOUT_MINUTES ?? '30', 10) || 30) * 60 * 1000;

// Idle sweeper runs every 5 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// -------------------------------------------------------------------------
// SessionRecord shape (internal):
// {
//   sessionId: string,
//   projectId: string,
//   pty: IPty,
//   buffer: RingBuffer,
//   clients: Set<WebSocket>,
//   swarmListeners: Set<Function>,  // V3: secondary listeners for SwarmEngine (DEC-014)
//   pid: number,
//   status: 'active' | 'killed',
//   createdAt: Date,
//   lastActivityAt: Date,
// }
// -------------------------------------------------------------------------

function treeKillAsync(pid) {
  return new Promise((resolve) => {
    treeKill(pid, 'SIGKILL', () => {
      // Ignore errors — process may have already exited
      resolve();
    });
  });
}

export class SessionManager {
  #sessions = new Map(); // Map<sessionId, SessionRecord>
  #idleTimer = null;

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------
  async createSession(projectId, projectPath, binaryPath, launchProfile = {}) {
    const sessionId = uuidv4();
    const buffer = new RingBuffer(100 * 1024);
    const launchArgs = Array.isArray(launchProfile.args) ? [...launchProfile.args] : [];
    const runtimeProvider = launchProfile.provider ?? 'claude';
    const initialPrompt = typeof launchProfile.initialPrompt === 'string'
      ? launchProfile.initialPrompt.trim()
      : '';

    if (runtimeProvider === 'codex' && initialPrompt) {
      launchArgs.push(initialPrompt);
    }

    // Spawn PTY — all PTY operations must stay on main thread
    const ptyProcess = pty.spawn(binaryPath, launchArgs, {
      name: 'xterm-color',
      cwd: projectPath,
      env: process.env,
      cols: 80,
      rows: 24,
    });

    const session = {
      sessionId,
      projectId,
      pty: ptyProcess,
      buffer,
      clients: new Set(),
      swarmListeners: new Set(), // V3: secondary listeners for SwarmEngine (DEC-014)
      pid: ptyProcess.pid,
      status: 'active',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      binaryPath,
      runtimeProvider,
      launchArgs,
      bootstrapPrompt: launchProfile.bootstrapPrompt ?? null,
      initialPrompt: initialPrompt || null,
    };

    // Wire PERMANENT onData handler — NEVER removed (DEC-009, ConPTY deadlock prevention).
    // This drains the ConPTY output pipe unconditionally even when no client is connected.
    ptyProcess.onData((data) => {
      session.buffer.push(data);
      session.lastActivityAt = new Date();

      for (const ws of session.clients) {
        if (ws.readyState !== WS_OPEN) continue;
        // Backpressure: skip slow clients whose send buffer is too full.
        // ws.bufferedAmount is a browser-side API; on the server-side ws module,
        // the underlying socket's writable buffer size is checked instead.
        if (ws._socket && ws._socket.bufferSize > 256 * 1024) continue;
        ws.send(data, { binary: false });
      }

      // V3 swarm tap — non-destructive, DEC-014
      for (const listener of (session.swarmListeners || [])) {
        try { listener(data); } catch (_) {}
      }
    });

    // Wire onExit handler
    ptyProcess.onExit(() => {
      console.log(`[SessionManager] PTY exited — sessionId=${sessionId} pid=${session.pid}`);
      session.status = 'killed';
      // Only unregister if killSession has not already done so (prevents double-write to disk).
      if (!session._unregistered) {
        session._unregistered = true;
        ProcessRegistry.unregister(session.pid).catch((err) => {
          console.error(`[SessionManager] ProcessRegistry.unregister error: ${err.message}`);
        });
      }
    });

    // Register PID in ProcessRegistry before storing session
    await ProcessRegistry.register(session.pid, {
      sessionId,
      projectId,
      projectPath,
    });

    // Store in sessions map
    this.#sessions.set(sessionId, session);

    console.log(
      `[SessionManager] Session created — sessionId=${sessionId} pid=${session.pid} project=${projectId}`
    );

    // Start idle sweeper if not already running
    this.#startIdleSweeper();

    return session;
  }

  // -------------------------------------------------------------------------
  // getSession
  // -------------------------------------------------------------------------
  getSession(sessionId) {
    return this.#sessions.get(sessionId);
  }

  // -------------------------------------------------------------------------
  // listSessions
  // -------------------------------------------------------------------------
  listSessions() {
    return Array.from(this.#sessions.values());
  }

  // -------------------------------------------------------------------------
  // attachClient
  // Add a WebSocket to a session and immediately replay the ring buffer.
  // -------------------------------------------------------------------------
  attachClient(sessionId, ws) {
    const session = this.#sessions.get(sessionId);
    if (!session) return;

    session.clients.add(ws);
    session.lastActivityAt = new Date();

    // Replay buffered output so the client catches up on missed output
    const replay = session.buffer.toBuffer();
    if (replay.length > 0) {
      try {
        ws.send(replay, { binary: false });
      } catch (err) {
        // Client may have closed between the check and send — log type only (SEC-08)
        console.error(`[SessionManager] Ring buffer replay send error: ${err.constructor.name}`);
      }
    }

    console.log(
      `[SessionManager] Client attached — sessionId=${sessionId} clients=${session.clients.size}`
    );
  }

  // -------------------------------------------------------------------------
  // detachClient
  // Remove a WebSocket from a session — PTY stays alive (DEC-009).
  // -------------------------------------------------------------------------
  detachClient(sessionId, ws) {
    const session = this.#sessions.get(sessionId);
    if (!session) return;

    session.clients.delete(ws);

    console.log(
      `[SessionManager] Client detached — sessionId=${sessionId} clients=${session.clients.size}`
    );
    // DO NOT kill the PTY — the user may reconnect
  }

  // -------------------------------------------------------------------------
  // writeInput
  // Send user keystrokes to the PTY process.
  // -------------------------------------------------------------------------
  writeInput(sessionId, data) {
    const session = this.#sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    session.pty.write(data);
    session.lastActivityAt = new Date();
  }

  // -------------------------------------------------------------------------
  // resizePty
  // Resize the PTY terminal dimensions.
  // lastActivityAt is NOT updated on resize (per architecture spec).
  // -------------------------------------------------------------------------
  resizePty(sessionId, cols, rows) {
    const session = this.#sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    session.pty.resize(cols, rows);
  }

  // -------------------------------------------------------------------------
  // killSession
  // -------------------------------------------------------------------------
  async killSession(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return;

    console.log(`[SessionManager] Killing session — sessionId=${sessionId} pid=${session.pid}`);

    // Kill the process tree
    await treeKillAsync(session.pid);

    // Close all attached WebSocket clients gracefully
    for (const ws of session.clients) {
      try {
        ws.close(1000, 'Session terminated');
      } catch {
        // Already closed — ignore
      }
    }
    session.clients.clear();

    session.status = 'killed';

    // Unregister from ProcessRegistry (guard against double-unregister with onExit handler)
    if (!session._unregistered) {
      session._unregistered = true;
      await ProcessRegistry.unregister(session.pid).catch((err) => {
        console.error(`[SessionManager] ProcessRegistry.unregister error: ${err.message}`);
      });
    }

    // Remove from sessions map
    this.#sessions.delete(sessionId);

    // Stop sweeper if no sessions remain
    if (this.#sessions.size === 0) {
      this.#stopIdleSweeper();
    }
  }

  // -------------------------------------------------------------------------
  // killAll
  // Kill all active sessions — used in SIGTERM/SIGINT handlers.
  // -------------------------------------------------------------------------
  async killAll() {
    const ids = Array.from(this.#sessions.keys());
    console.log(`[SessionManager] killAll — ${ids.length} session(s)`);

    await Promise.allSettled(ids.map((id) => this.killSession(id)));

    this.#stopIdleSweeper();
  }

  // -------------------------------------------------------------------------
  // #startIdleSweeper (private)
  // -------------------------------------------------------------------------
  #startIdleSweeper() {
    if (this.#idleTimer !== null) return; // already running

    this.#idleTimer = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, session] of this.#sessions) {
        if (session.status !== 'active') continue;

        const idleMs = now - session.lastActivityAt.getTime();
        if (idleMs > IDLE_TIMEOUT_MS) {
          console.log(
            `[SessionManager] Idle timeout — sessionId=${sessionId} idleMinutes=${Math.round(idleMs / 60000)}`
          );
          this.killSession(sessionId).catch((err) => {
            console.error(
              `[SessionManager] Idle kill error for sessionId=${sessionId}: ${err.message}`
            );
          });
        }
      }
    }, SWEEP_INTERVAL_MS);

    // Do not let the sweeper interval prevent process exit
    if (this.#idleTimer.unref) {
      this.#idleTimer.unref();
    }
  }

  // -------------------------------------------------------------------------
  // #stopIdleSweeper (private)
  // -------------------------------------------------------------------------
  #stopIdleSweeper() {
    if (this.#idleTimer !== null) {
      clearInterval(this.#idleTimer);
      this.#idleTimer = null;
    }
  }
}

// Singleton — the entire server shares one SessionManager instance
export const sessionManager = new SessionManager();
