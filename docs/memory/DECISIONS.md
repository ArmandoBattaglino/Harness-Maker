# Decision Log

## DEC-001: Use node-pty as the PTY library
**Date:** 2026-03-18 (revised 2026-03-24)
**Made by:** PRD (architect), revised after R-01 resolution
**Decision:** Use plain `node-pty` as the PTY library. Originally planned `node-pty-prebuilt-multiarch`, but it was unavailable — switched to `node-pty` during Task #3 implementation.
**Reasoning:** `node-pty-prebuilt-multiarch` was not available for the target Node.js version. Plain `node-pty` requires native compilation (MSVC Build Tools on Windows), but works reliably. See PROGRESS.md R-01 for resolution history.
**Alternatives rejected:** `node-pty-prebuilt-multiarch` — unavailable. `node-pty-prebuilt` — older fork, fewer targets.
**Revisit if:** A prebuilt alternative becomes available and stable for Node 20 LTS on Windows.
---

## DEC-002: Bind server to 127.0.0.1 only (not 0.0.0.0)
**Date:** 2026-03-18
**Made by:** PRD (security)
**Decision:** `server.listen(PORT, "127.0.0.1")` — host argument is mandatory and must never be omitted or set to `0.0.0.0`.
**Reasoning:** This is a single-user local app. Binding to loopback provides network isolation equivalent to authentication for the local-machine threat model. Binding to `0.0.0.0` would expose the app to the local network with no auth.
**Alternatives rejected:** `0.0.0.0` with authentication — rejected as over-engineering for a local tool.
**Revisit if:** A multi-user or remote-access mode is ever added (would require full auth redesign).
---

## DEC-003: Use SSE (Server-Sent Events) for job mode streaming, not WebSocket
**Date:** 2026-03-18
**Made by:** PRD (architect)
**Decision:** Job output is streamed via SSE at `GET /api/v1/jobs/:id/stream`, not over WebSocket.
**Reasoning:** Job mode is unidirectional (server → browser). SSE is simpler than WebSocket for this case: no upgrade handshake, native browser support via `EventSource`, and no need for a custom framing protocol. WebSocket is reserved for PTY (bidirectional) streaming.
**Alternatives rejected:** WebSocket for jobs — would work but adds unnecessary complexity for a unidirectional stream.
**Revisit if:** Jobs need to accept interactive input (would require WebSocket or SSE + a separate input endpoint).
---

## DEC-004: Ring buffer capped at 100 KB per session (fixed-capacity circular buffer)
**Date:** 2026-03-18
**Made by:** PRD (architect)
**Decision:** Each PTY session maintains a 100 KB fixed-capacity circular ring buffer. Overflow discards oldest bytes.
**Reasoning:** Prevents unbounded memory growth from long-running sessions. 100 KB is enough to replay meaningful terminal context on reconnect. With 5 concurrent sessions (NFR-06), total ring buffer overhead is at most 500 KB (NFR-07).
**Alternatives rejected:** Growable buffer — rejected due to memory risk. Smaller buffer — insufficient context for reconnect. No buffer — would lose all terminal history on tab close.
**Revisit if:** Users regularly report losing important output on reconnect (consider configurable buffer size in v1.1).
---

## DEC-005: Call child.stdin.end() immediately after every job spawn
**Date:** 2026-03-18
**Made by:** PRD (risk analysis)
**Decision:** `child.stdin.end()` must be called synchronously immediately after `child_process.spawn()` in `JobRunner`. This is a mandatory code pattern, not optional.
**Reasoning:** GitHub issue #7497 confirms that failing to close stdin causes the `claude` process to hang indefinitely waiting for input. This is a known bug in the Claude Code CLI. Closing stdin signals end-of-input and lets the process proceed.
**Alternatives rejected:** Leaving stdin open — causes permanent hang. Closing on a delay — race condition risk.
**Revisit if:** A future Claude Code version resolves #7497 (verify with integration test before removing).
---

## DEC-006: Use tree-kill for job cancellation, not child.kill()
**Date:** 2026-03-18
**Made by:** PRD (architect)
**Decision:** Job cancellation calls `tree-kill(child.pid)` rather than `child.kill()`.
**Reasoning:** On Windows, `child.kill()` only kills the direct child process. Claude Code spawns sub-processes. `tree-kill` walks the process tree and kills all descendants, preventing orphaned processes.
**Alternatives rejected:** `child.kill()` — leaves Claude sub-processes alive on Windows. `taskkill /F /T` via shell — would require `shell: true` which is forbidden (SEC-02).
**Revisit if:** A cross-platform process-tree kill utility that works better on Windows emerges.
---

## DEC-007: Config persistence in %APPDATA%\ClaudeCodeManager\config.json
**Date:** 2026-03-18
**Made by:** PRD (architect)
**Decision:** Application config (project registry, settings) is stored at `%APPDATA%\ClaudeCodeManager\config.json`. Fallback to `os.homedir()\.claudecodemanager\config.json` if APPDATA is unset.
**Reasoning:** `%APPDATA%` is the Windows-standard location for per-user application data. It survives OS updates, is excluded from most backup tools' exclusion lists, and is separate from the project repo. A JSON file is simpler than SQLite for the low write frequency of this app.
**Alternatives rejected:** SQLite — over-engineered for a simple project registry. Storing in project dir — config would be repo-specific, not shared across projects. In-memory only — config lost on restart.
**Revisit if:** Config size grows beyond what JSON handles cleanly (e.g., if job history is persisted in v1.1).
---

## DEC-008: CSRF protection via X-Requested-With header (not CSRF token)
**Date:** 2026-03-18
**Made by:** PRD (security)
**Decision:** All mutating endpoints (POST, PUT, PATCH, DELETE) require the header `X-Requested-With: ClaudeCodeManager`. The server returns 403 if absent. React client sends this header on all mutating fetch calls.
**Reasoning:** Since the app binds to localhost and has no cookies or session tokens, a traditional CSRF token is unnecessary. The `X-Requested-With` custom header cannot be set by cross-origin HTML forms (CORS simple request restriction), providing equivalent protection with far less complexity.
**Alternatives rejected:** CSRF tokens — adds token management complexity with no additional security benefit for a cookieless localhost app. No CSRF protection — rejected; a malicious local page could issue requests to localhost.
**Revisit if:** The app adds cookie-based sessions or is ever deployed beyond localhost.
---

## DEC-009: Permanent pty.onData handler (never removed, never paused)
**Date:** 2026-03-18
**Made by:** PRD (architect)
**Decision:** The `pty.onData` handler is wired once at PTY spawn and is never removed or conditioned on client count. It always writes to the ring buffer and broadcasts to all connected clients.
**Reasoning:** ConPTY on Windows will deadlock if its output pipe is not continuously drained. If the handler were removed when no clients are connected, the PTY output pipe would fill, blocking the PTY and eventually freezing the Claude process. The permanent handler keeps the pipe drained at all times.
**Alternatives rejected:** Pausing the handler when no clients are connected — causes ConPTY deadlock (R-02). Removing on last client disconnect — same deadlock risk.
**Revisit if:** node-pty changes its internal buffering model in a future version.
---

## DEC-010: node-pty-prebuilt-multiarch Windows build validation is Phase 0 blocker
**Date:** 2026-03-18
**Made by:** PRD (risk analysis)
**Decision:** Validating that `node-pty-prebuilt-multiarch` installs and runs correctly on the target Windows 11 + Node.js 20 LTS environment is the first task of Phase 0, blocking all other work.
**Reasoning:** If no prebuilt binary is available for the environment, the entire PTY architecture must be reconsidered. This risk (R-01, severity HIGH) must be resolved before any other code is written to avoid building on a broken foundation.
**Alternatives rejected:** Discovering this mid-Phase 1 — would invalidate all PTY code written so far.
**Revisit if:** Prebuilt binary is confirmed present (risk cleared; proceed with normal Phase 0 tasks).
---
