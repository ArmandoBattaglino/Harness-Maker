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

// Patterns for content lines that should be removed from replay because they are
// swarm protocol preamble, CLI chrome, stale foreign prompt text, or shell furniture.
// These operate on ANSI-stripped text so color codes don't interfere with matching.
const REPLAY_NOISE_LINE_PATTERNS = [
  // Swarm protocol preamble
  /^---\s*swarm protocol/i,
  /^---\s*end protocol/i,
  /^---\s*swarm input/i,
  /^---\s*end swarm input\s*---$/i,
  /^do not output the handoff or done token/i,
  /^do not stop at __done__/i,
  /^your very last line must be a valid handoff token/i,
  /^use [a-z0-9-]+ in place of <targetid>/i,
  /^use only flat json/i,
  /^output that final handoff token/i,
  /^replace the summary value/i,
  /^finish your work, then hand off to /i,
  // CLI chrome / shell furniture
  /^messages to be submitted after next tool call/i,
  /^type your message(?: or @path\/to\/file)?/i,
  /^\? for shortcuts/i,
  /^esc to interrupt/i,
  /^press esc or ctrl\+c to cancel/i,
  /^waiting for authentication/i,
  /^apply this change\?/i,
  /^allow once$/i,
  /^conversation interrupted\b/i,
  /^went wrong\? hit `\/feedback`/i,
  // Stale foreign prompt text
  /^explain this codebase/i,
  // Agent role / swarm preamble declarations
  /^you are (?:the |a )?(?:finder|route checker|formatter|triage|orchestrat)/i,
  /^you have an active task right now/i,
  /^current workflow context:/i,
  /^current task:/i,
  /^continue the workflow using the shared task context/i,
  /^\w+ runtime is active for this swarm agent/i,
  /^you are running inside the \w+ interactive cli/i,
  /^answer directly in terminal text and continue the swarm task/i,
  // Done-token recovery prompt (injected when agent finishes without emitting __DONE__)
  /^you have completed your work but did not emit the required done marker/i,
  /^please output exactly this on a new line/i,
  /^__DONE__$/,
];

// Matches trailing corruption: lines that are only repeated punctuation or single repeated chars.
const REPLAY_CORRUPTION_TAIL_RE = /^[,.;:|/\\<>\[\]()\-_=+*`~]{4,}$/;
const REPLAY_REPEATED_CHAR_RE = /^([A-Za-z])\1{3,}$/;

/**
 * Strip ANSI escape codes from a string for pattern-matching purposes.
 * This removes color/style codes but preserves the visible text.
 */
function stripAnsiForMatching(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[\d*[A-Za-z]/g, '');
}

function sanitizeReplayOutput(replayBuffer) {
  let replayStr = Buffer.isBuffer(replayBuffer)
    ? replayBuffer.toString('utf8')
    : String(replayBuffer ?? '');

  // Strip DEC private mode toggles (alternate screen, mouse mode, cursor visibility, etc.)
  replayStr = replayStr.replace(/\x1b\[\?\d+[hl]/g, '');
  // Strip cursor save/restore sequences commonly emitted by TUIs
  replayStr = replayStr.replace(/\x1b7|\x1b8|\x1b\[[su]/g, '');
  // Strip clear-screen and cursor-positioning controls that make replay render blank
  replayStr = replayStr.replace(/\x1b\[[0-9;]*[Hf]/g, '');
  replayStr = replayStr.replace(/\x1b\[[012]?J/g, '');
  replayStr = replayStr.replace(/\x1b\[[012]?K/g, '');
  replayStr = replayStr.replace(/\x1b\[\d*[AB]/g, '');

  // --- Content-level sanitization ---
  // Strip swarm protocol blocks (multi-line) before line-by-line filtering.
  replayStr = replayStr.replace(/----?\s*SWARM PROTOCOL[\s\S]*?----?\s*END PROTOCOL\s*----?/gi, '\n');
  replayStr = replayStr.replace(/----?\s*SWARM INPUT[\s\S]*?----?\s*END SWARM INPUT\s*----?/gi, '\n');

  // Line-by-line filtering: remove noise lines using ANSI-stripped text for matching.
  const lines = replayStr.split('\n');
  const filtered = [];
  for (const line of lines) {
    const clean = stripAnsiForMatching(line).trim();
    // Keep empty lines (preserve visual spacing)
    if (!clean) {
      filtered.push(line);
      continue;
    }
    // Skip noise lines
    if (REPLAY_NOISE_LINE_PATTERNS.some((p) => p.test(clean))) continue;
    // Skip corruption tails (only repeated punctuation or repeated chars)
    if (REPLAY_CORRUPTION_TAIL_RE.test(clean)) continue;
    if (REPLAY_REPEATED_CHAR_RE.test(clean)) continue;
    filtered.push(line);
  }

  // Trim leading/trailing blank lines that accumulate after filtering
  let start = 0;
  while (start < filtered.length && !stripAnsiForMatching(filtered[start]).trim()) start++;
  let end = filtered.length - 1;
  while (end > start && !stripAnsiForMatching(filtered[end]).trim()) end--;

  return filtered.slice(start, end + 1).join('\n');
}

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

  getSanitizedSessionOutput(sessionId) {
    const session = this.#sessions.get(sessionId);
    const replayBuffer = session?.buffer?.toBuffer?.();
    if (!replayBuffer) return '';
    return sanitizeReplayOutput(replayBuffer);
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

    // Replay buffered output so the client catches up on missed output.
    // Strip ANSI cursor-positioning and screen-clearing codes that TUI
    // frameworks (Gemini Ink) emit — these produce blank areas on replay.
    const replay = session.buffer.toBuffer();
    if (replay.length > 0) {
      try {
        ws.send(sanitizeReplayOutput(replay), { binary: false });
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
