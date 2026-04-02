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

## DEC-011: Separate Zustand execution store from React Flow canvas state
**Date:** 2026-03-27
**Agent:** architect
**Task:** V3 Swarm Orchestrator — Technical Analysis
**Decision:** All live execution state (agent status, loop counters, handoff events, HITL queue, budget totals) lives in a Zustand store (`useExecutionStore`). React Flow canvas state (@xyflow/react) manages ONLY node positions, edges, and node definitions. The two stores never merge.
**Reasoning:** Research finding: merging canvas and execution state causes React Flow update conflicts during live execution. @xyflow/react v12 requires immutable node updates via `setNodes` — if execution state is embedded in node data and updates every tick, the canvas re-renders uncontrollably. Separation allows execution state to update at high frequency without touching the canvas store.
**Alternatives rejected:** Storing execution state in React Flow node.data — causes cascading re-renders and breaks drag/drop during live runs. Using a second useReducer — Zustand is better suited for fine-grained subscription (components subscribe only to the slice they need).
---

## DEC-012: HandoffParser uses stateful rolling byte accumulator
**Date:** 2026-03-27
**Agent:** architect
**Task:** V3 Swarm Orchestrator — Technical Analysis
**Decision:** HandoffParser maintains a rolling string accumulator per agent session. Each chunk from pty.onData is appended to the accumulator. The parser scans for `HANDOFF:<target>:<base64ctx>` and `DONE` patterns. Matched tokens are sliced out; unmatched tail is retained for the next chunk.
**Reasoning:** ConPTY on Windows delivers PTY stdout in arbitrary byte chunks (DEC-009 context). A `HANDOFF:` token can be split across two or more consecutive chunks. Line-by-line parsing via readline would silently drop split tokens. A stateful accumulator is the only reliable approach.
**Alternatives rejected:** readline interface — fails on split tokens. Regex on each chunk independently — same failure mode. Fixed-size look-back window — fragile, needs tuning per environment.
---

## DEC-013: WorkflowStore follows ConfigStore pattern exactly
**Date:** 2026-03-27
**Agent:** architect
**Task:** V3 Swarm Orchestrator — Technical Analysis
**Decision:** WorkflowStore persists workflow JSON files to `%APPDATA%\ClaudeCodeManager\workflows\<workflowId>.json` using write-file-atomic. API: load(), get(id), list(), save(workflow), delete(id). In-memory Map<id, WorkflowDefinition> as cache.
**Reasoning:** ConfigStore.js is already proven, audited (SEC-09), and follows atomic write discipline. Reusing the same pattern avoids inventing a new persistence layer. Separate files per workflow (not one big JSON) avoids a single-file write contention bottleneck when multiple workflows are saved simultaneously.
**Alternatives rejected:** SQLite — over-engineered, adds a native dep, no benefit at this scale. Single monolithic workflows.json — write contention, harder partial reads. In-memory only — workflows lost on restart.
---

## DEC-014: SwarmEngine attaches secondary onData listener via session swarmListeners Set
**Date:** 2026-03-27
**Agent:** architect
**Task:** V3 Swarm Orchestrator — Technical Analysis
**Decision:** The SessionManager session record gains an optional `swarmListeners: Set<Function>` field. The primary `pty.onData` handler iterates this set (if present) after writing to the ring buffer. SwarmEngine adds/removes its per-agent callback via `sessionManager.addSwarmListener(sessionId, fn)` / `removeSwarmListener(sessionId, fn)`.
**Reasoning:** DEC-009 mandates the primary onData handler is NEVER removed or replaced. SwarmEngine cannot wire its own onData because that would replace the existing handler in node-pty (only one onData handler is supported). The swarmListeners Set is called from inside the primary handler, so ConPTY pipe draining is never interrupted.
**Alternatives rejected:** Replacing the primary handler — forbidden by DEC-009. Polling the ring buffer on a timer — introduces latency and CPU overhead. EventEmitter on SessionManager — slightly cleaner but requires adding an EventEmitter dep or extending the class; the Set approach is minimal and explicit.
---

## DEC-015: Circuit breaker is per-edge, not per-node
**Date:** 2026-03-27
**Agent:** architect
**Task:** V3 Swarm Orchestrator — Technical Analysis
**Decision:** CircuitBreaker tracks handoff counts keyed by `<fromAgentId>:<toAgentId>` (edge identity), not by node. Default threshold: 10 crossings. On threshold breach, the execution is paused and the UI marks the edge as TRIPPED.
**Reasoning:** A loop is a property of an edge traversal pattern, not a single node. Keying by node would false-positive on a legitimately busy hub node that receives handoffs from many different sources. Keying by directed edge pair accurately identifies a repeating A→B→A cycle.
**Alternatives rejected:** Per-node counter — false positives on hub nodes. Global traversal counter — too coarse, fires on legitimate high-volume workflows. Time-window based rate limiting — complex, adds a clock dependency.
---

## DEC-016: Prompt-to-Flow uses existing JobRunner with one auto-retry
**Date:** 2026-03-27
**Agent:** architect
**Task:** V3 Swarm Orchestrator — Technical Analysis
**Decision:** The Prompt-to-Flow feature submits a structured generation prompt via the existing `jobRunner.startJob()`. The server parses the stream-json result event for a JSON block. If JSON.parse fails, one automatic retry is made with a stricter prompt (explicit JSON-only instruction). If the retry also fails, the endpoint returns HTTP 422 with a user-visible error.
**Reasoning:** JobRunner already handles spawn, stream-json parsing, SSE delivery, and process lifecycle. Reusing it avoids duplicating spawn logic. The auto-retry covers the most common failure mode (Claude wrapping JSON in markdown fences) without user intervention. Two attempts total keeps latency acceptable.
**Alternatives rejected:** Direct child_process.spawn — duplicates JobRunner, violates DRY. Unlimited retries — could hang the UI. Silent failure — bad UX, user doesn't know why the flow didn't generate.
---

## DEC-017: Swarm scaffold must degrade to a deterministic local workflow when providers are unavailable
**Date:** 2026-04-02
**Made by:** debugger / qa-tester runtime follow-up wave
**Decision:** If both configured scaffold providers fail with retryable or limit-style availability errors, 'POST /api/v1/swarm/scaffold' returns a deterministic local workflow instead of surfacing a generic failure.
**Reasoning:** Prompt-to-Flow is a primary onboarding path. In this repo's runtime environment, Claude and Codex providers can both be temporarily unavailable, which otherwise blocks the entire Swarm surface. A deterministic fallback preserves a runnable graph, keeps browser QA unblocked, and is safer than inventing partial provider-specific retry loops in the UI.
**Alternatives rejected:** Hard-fail with 500/503 - leaves Swarm unusable. Silent empty workflow - violates the product contract and gives the user no runnable graph.
**Revisit if:** Provider reliability improves enough that the local fallback is no longer needed, or if a richer local planner replaces the current deterministic template.
---
