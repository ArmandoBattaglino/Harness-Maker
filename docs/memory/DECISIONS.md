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

## DEC-018: Swarm runtime blockers must transition executions into an explicit blocked state
**Date:** 2026-04-02
**Made by:** architect/debugger follow-up on TASK #145 blocker analysis
**Decision:** Swarm executions may not remain in a generic `running` state when the backing AI CLI is blocked by interactive provider UI. The canonical contract now includes an explicit `blocked` execution/agent state plus structured `runtimeBlocker` metadata with blocker type and provider. The blocker taxonomy must cover both Claude and Codex interactive dead-ends, including Claude rate-limit UI, Codex trust/bootstrap prompts, Codex usage-limit/credit-exhaustion UI, and Codex prompt-rejection loops such as "Conversation interrupted - tell the model what to do differently."
**Reasoning:** TASK #145 proved that a healthy Swarm control plane can still fail at runtime because the AI provider enters an interactive blocker flow (`/rate-limit-options`, trust prompts, bootstrap questions, usage-limit purchase prompts, steering-prompt rejection loops) before any useful handoff output is produced. Treating that as ordinary `running` leaves the UI and QA with a false-positive live state and makes it impossible to distinguish prompt/handoff bugs from provider readiness issues.
**Alternatives rejected:** Keep `running` until timeout - misleading UX and impossible QA triage. Collapse all blockers into `failed` - loses actionable provider-specific recovery context. Implement provider fallback before blocker classification - too risky without first making blocked states observable.
**Revisit if:** Swarm gains full provider selection/fallback support and needs a richer provider lifecycle model than the current `blocked` + `runtimeBlocker` contract.
---

## DEC-019: Swarm runtime defaults to auto provider selection with Claude-first and Codex fallback
**Date:** 2026-04-02
**Made by:** backend-dev/frontend-dev during TASKS #151-#153
**Decision:** Swarm executions now accept an explicit runtime choice (`claude`, `codex`) or `auto`. The default UI/runtime mode is `auto`: start on Claude when available, but if the first agent hits a pre-work Claude rate-limit blocker, the execution may switch to Codex and surface `lastFallback` metadata plus provider state in the execution snapshot.
**Reasoning:** This keeps the existing Claude-first behavior for normal runs while removing the Claude-only bottleneck that blocked TASK #145 verification. It also gives the UI a stable contract (`runtimeProvider`, `activeProvider`, `providerStrategy`, `lastFallback`) instead of forcing it to infer provider behavior from PTY text.
**Alternatives rejected:** Codex-only default - unnecessary behavior change for existing users. Claude-only with no fallback - leaves Swarm vulnerable to provider usage-limit dead ends. Implicit provider switching with no surfaced metadata - too opaque for QA and users.
**Revisit if:** The product later adds per-workflow persisted runtime settings or more than two supported interactive AI providers.
---

## DEC-020: HandoffParser accepts plain JSON payloads as primary format, base64 as fallback
**Date:** 2026-04-03
**Agent:** debugger
**Task:** #145 — BUG-UX-HANDOFF-1
**Decision:** HandoffParser now tries to parse handoff token payloads as plain JSON first (`__HANDOFF__:target:{"key":"value"}`), falling back to base64-decoded JSON if plain JSON parsing fails. The system prompt instructs the AI to emit plain JSON, not base64.
**Reasoning:** LLMs cannot reliably produce base64-encoded text in their output. The original base64-only format caused silent handoff failures: the AI would emit `__HANDOFF__:target:{"summary":"..."}` which the parser's base64-only regex (`HANDOFF_WINDOW_RE`) silently rejected because `{`, `}`, `"` are not valid base64 characters. This was the primary root cause of the "first agent emits __DONE__ without handoff" bug.
**Alternatives rejected:** Making the AI produce base64 via stronger prompt instructions - unreliable, LLMs are not base64 encoders. Removing base64 support entirely - would break backward compatibility if any existing system produces base64 tokens.
**Revisit if:** A future handoff payload format is needed that cannot be expressed as flat JSON (e.g., binary data).
---

## DEC-021: _onDone reinject is bounded at 3 attempts with forced synthetic handoff
**Date:** 2026-04-03
**Agent:** debugger
**Task:** #145 — BUG-UX-HANDOFF-1
**Decision:** When a non-terminal agent emits `__DONE__` instead of `__HANDOFF__`, SwarmEngine reinjects a continuation prompt up to MAX_DONE_REINJECT_ATTEMPTS (3) times. After 3 failed attempts, a synthetic `_onHandoff` is triggered to the first downstream target, advancing the workflow automatically.
**Reasoning:** Without a limit, the _onDone → reinject → _onDone cycle would loop infinitely when the AI model consistently emits __DONE__ despite protocol instructions. The forced handoff ensures the workflow always advances, even if the current agent fails to produce a handoff token.
**Alternatives rejected:** Unlimited reinjects - causes infinite loop. Marking agent as failed/done - leaves downstream agents permanently idle. Higher limit (10+) - wastes provider tokens on an agent that won't cooperate.
**Revisit if:** A smarter reinject strategy is needed (e.g., escalating prompt firmness, or switching to a different provider mid-reinject).
---

## DEC-022: HandoffParser accepts terminal-rendered `HANDOFF:` alias when interactive CLI formatting strips underscores
**Date:** 2026-04-03
**Agent:** debugger
**Task:** #145 â€” BUG-UX-HANDOFF-1 live follow-up
**Decision:** HandoffParser now accepts both the canonical token prefix `__HANDOFF__:` and the rendered alias `HANDOFF:` for handoff detection.
**Reasoning:** A real Codex Swarm probe (`executionId=badef6de-2bb8-4259-8135-0df1e2f2db94`) showed the model attempting a downstream handoff, but the interactive terminal rendering surfaced the generated token as `HANDOFF:node-b:{...}` without underscores. Because the Swarm tap parses the rendered PTY byte stream rather than a raw model output channel, treating `HANDOFF:` as invalid would silently drop a genuine handoff intent even when the agent followed the protocol semantically.
**Alternatives rejected:** Keep only `__HANDOFF__:` - loses real handoff attempts under CLI rendering. Switch the protocol to a wholly new token immediately - larger cross-surface churn while the project still needs compatibility with existing tests/prompts. Accept arbitrary free-text "handoff" phrases - too ambiguous and unsafe for parser matching.
**Revisit if:** The runtime moves to a non-rendered model output channel, or if the project adopts a new token format that is guaranteed to survive interactive rendering verbatim.
---

## DEC-023: Swarm prompt examples stay templated with `<targetId>` so PTY redraws cannot create fake handoffs
**Date:** 2026-04-03
**Agent:** debugger
**Task:** #145 - BUG-UX-HANDOFF-1 live follow-up
**Decision:** SwarmEngine's initial handoff prompt and `_buildContinueAfterDonePrompt()` now keep the example token templated as `__HANDOFF__:<targetId>:{...}` and describe the real downstream node separately, instead of embedding a parser-consumable `__HANDOFF__:<realNodeId>:{...}` example directly in the prompt.
**Reasoning:** Live Codex probe `b3c645a8-4ba6-473f-96e7-c80050a5bc18` proved that ConPTY can replay old prompt text after the echo marker. When the prompt contained a real downstream target plus valid JSON example payload, the parser consumed the echoed example as a fake handoff and spawned node-b with the prompt's placeholder payload instead of real work. Keeping `<targetId>` in the token line preserves the exact token shape for the model while making echoed examples unparseable by HandoffParser.
**Alternatives rejected:** Keep the fully valid example and rely only on end-marker suppression - insufficient, because the PTY can redraw earlier prompt lines after the marker. Remove all examples entirely - regresses prompt clarity and risks reintroducing the original early-`__DONE__` failure mode.
**Revisit if:** The runtime gains access to a non-rendered model output channel, or if a safer way appears to show examples that cannot be replayed into the parser path.
---

## DEC-024: Hard Codex usage-limit output takes precedence over the softer `Approaching rate limits` chooser
**Date:** 2026-04-03
**Agent:** debugger
**Task:** #145 / #153 live follow-up
**Decision:** SwarmEngine only auto-dismisses the Codex `Approaching rate limits` menu when the chunk does not also contain a hard usage-limit stop (`You've hit your usage limit`, `purchase more credits`, `try again at`). If both appear together, the execution is classified as canonical `blocked`.
**Reasoning:** Probe `284de139-3fac-44f1-8b07-cf9356157f71` showed that the softer menu can arrive in the same rendered chunk as a hard limit message. Treating the chooser first left the workflow falsely `running` even though the provider had already stopped useful work. Probe `9a7c81ae-ec1d-4b3b-a7c5-7abd01c10a22` confirmed that preferring the hard blocker restores honest runtime state.
**Alternatives rejected:** Always treat `Approaching rate limits` as a blocker - too pessimistic when it is only a chooser and no hard stop is present. Always auto-dismiss the chooser first - hides real provider exhaustion and recreates ambiguous `running` state.
**Revisit if:** Codex changes the wording/structure of its rate-limit UI or introduces a supported non-interactive way to answer those menus.
---

## DEC-025: Echo marker timeout fallback for ignoreParserUntil gate
**Date:** 2026-04-03
**Agent:** debugger
**Task:** #145 — BUG-UX-HANDOFF-1 live follow-up (handoff chain completion)
**Decision:** When `_flushSwarmPrompt` sets `ignoreParserUntil` to wait for the echo marker (`--- END SWARM INPUT ---`), a 10-second fallback timer (`SWARM_ECHO_MARKER_TIMEOUT_MS`) now auto-clears the gate if the marker is never observed. If the marker arrives before the timeout, the timer is cancelled immediately (existing path).
**Reasoning:** Live E2E testing proved that the Claude interactive CLI does not echo pasted text through the PTY output stream. This left `ignoreParserUntil` permanently set on the target agent (node-b) after a handoff, blocking the parser from detecting `__DONE__` or subsequent `__HANDOFF__` tokens. The workflow would hang indefinitely in `running` status even though the AI agent had completed its work. Codex does echo the marker, so the existing path is preserved. The 10-second window is generous enough to capture any delayed echo while short enough to unblock the parser quickly.
**Alternatives rejected:** Remove the echo suppression entirely — would re-expose the fake-handoff bug from echoed prompt examples (DEC-023). Reduce the timeout below 5s — risks false-clearing when a slow Codex session has not yet echoed. Provider-conditional suppression (skip for Claude) — fragile, couples prompt injection to provider identity in a way that breaks if provider detection is wrong.
**Revisit if:** A future provider appears that echoes the marker with \>10s latency, or if Swarm gains a non-PTY output channel.
---

## DEC-026: Gemini CLI Harness Integration as Tertiary Provider
**Date:** 2026-04-04
**Agent:** backend-dev / frontend-dev
**Task:** #154-159 — V4.0
**Decision:** Gemini CLI (`@google/gemini-cli`) is integrated as a tertiary runtime provider (after Claude and Codex). The architecture natively supports an `auto` mode fallback chain: `claude` (primary) → `codex` (secondary) → `gemini` (tertiary).
**Reasoning:** Provider diversity mitigates single-provider outages or rate limits. During V3 testing, Claude hitting usage limits completely stalled workflows. While Codex added a fallback layer, adding Gemini ensures even higher reliability. The engine handles provider-specific interactive blockers identical to how it handles Claude and Codex blockers, formally observing blocked states and falling back automatically.
**Alternatives rejected:** Only relying on Claude and Codex.
**Revisit if:** Additional major providers need to be supported, prompting a refactor towards a broader generic provider plugin interface.
---

## DEC-027: Claude agents use stream-json spawn (process-per-turn) instead of PTY
**Date:** 2026-04-08
**Agent:** architect
**Task:** Stream-JSON Technical Analysis
**Decision:** Claude provider agents in SwarmEngine spawn via `child_process.spawn` with `--output-format stream-json --resume <session-id>` instead of node-pty. Each turn is a separate process. Codex/Gemini keep PTY.
**Reasoning:** Stream-json output is structured JSON, eliminating the entire ConPTY artifact handling pipeline (120+ noise regexes, echo gates, ANSI stripping, HandoffParser rolling accumulator, ChatExtractor, chatTextNormalization). Handoff/done tokens appear in clean text blocks. Rate limits are reported via structured `system.api_retry` events. Cost is reported via `result` events. The `--resume` flag provides full conversation continuity across turns without maintaining a long-lived PTY process.
**Alternatives rejected:** (1) Keep PTY for all providers -- wastes the stream-json structured output, keeps all ConPTY complexity. (2) Full migration (all providers to stream-json) -- Codex/Gemini CLIs don't support stream-json. (3) Persistent process with `--input-format stream-json` -- undocumented, risky. (4) Integrate into HandoffParser -- the two parsers share zero code; merging creates a god-class.
**Revisit if:** `--input-format stream-json` becomes documented and stable (would allow persistent process without PTY); Codex/Gemini add stream-json support.

## DEC-028: Stream-json agents bypass SessionManager entirely
**Date:** 2026-04-08
**Agent:** architect
**Task:** Stream-JSON Technical Analysis
**Decision:** Stream-json agents do not create PTY sessions via SessionManager. SwarmEngine manages the child process directly. No ring buffer, no replay, no terminal view for these agents.
**Reasoning:** SessionManager is built around node-pty lifecycle (permanent onData handler, ring buffer, swarmListeners Set, idle sweeper). Stream-json agents use child_process.spawn with structured stdout -- none of the PTY infrastructure applies. Creating a fake PTY session would add complexity without benefit.
**Alternatives rejected:** Creating a lightweight SessionManager session for stream-json agents -- adds unnecessary abstraction layer, the session would have no PTY, no ring buffer, and no terminal clients.
**Revisit if:** A need arises for terminal-style replay of stream-json agent output (unlikely given structured chat view).

## DEC-029: `result` event is canonical turn-completion signal for stream-json agents
**Date:** 2026-04-08
**Agent:** architect
**Task:** Stream-JSON Technical Analysis
**Decision:** When a Claude stream-json process emits a `result` event and exits, the turn is complete. If no `__HANDOFF__` or `__DONE__` was found in text blocks during the turn, treat as implicit `__DONE__`.
**Reasoning:** The `result` event is guaranteed to be the last substantive event before process exit. It contains session_id, cost, duration, and error status. Using it as the turn-completion signal is more reliable than detecting process exit alone (which could be a crash).
**Alternatives rejected:** Relying solely on process exit code -- doesn't distinguish clean completion from crash. Requiring explicit __DONE__ always -- agents may complete without emitting the token, and forced reinject wastes tokens.
**Revisit if:** Claude CLI changes the result event semantics.
---

## DEC-030: Operator messaging targets backend-authoritative "messageable" sessions, not only `running + sessionId`
**Date:** 2026-04-09
**Agent:** debugger / backend-dev / frontend-dev
**Task:** V10.5 persistent agent sessions + operator messaging
**Decision:** Swarm operator messaging now keys off a canonical per-agent capability contract exposed by SwarmEngine (`acceptsMessages` plus non-secret `messageTransport` metadata). PTY agents remain messageable when their swarm-owned session is persistent and reusable; structured agents remain messageable when their existing `streamJsonSessionId` or `codexThreadId` can continue the same conversation. Broadcast routing scopes workflow nodes first and defers final delivery eligibility to SwarmEngine rather than duplicating transport heuristics in routes or UI.
**Reasoning:** The previous `running + sessionId` gate falsely treated completed PTY agents and all structured runtimes as unreachable even when their conversation state was still resumable. That blocked the user from messaging reusable agents after completion, closed the client websocket too aggressively, and coupled route/UI behavior to PTY-specific implementation details. A backend-authoritative messageability contract keeps delivery truth in one place, preserves structured-runtime session reuse, and lets the client keep terminal-but-live executions interactive without exposing raw thread identifiers.
**Alternatives rejected:** Keep route/UI checks on `running + sessionId` -- breaks completed PTY reuse and all structured runtimes. Expose raw thread/session identifiers to the client -- unnecessary and leaks internal transport details. Treat all terminal executions as non-messageable -- conflicts with the persistent-session requirement and loses operator continuity.
**Revisit if:** Additional runtime providers need richer operator-delivery semantics than the current PTY vs structured split, or if session persistence becomes user-configurable per workflow/agent.
---
## DEC-031: Ralph execution syncs durable approved-plan decisions into human ledgers before and during implementation
**Date:** 2026-04-13
**Agent:** user / codex
**Task:** Ralph memory-governance hardening
**Decision:** When Ralph executes in this repository from an approved PRD / plan / test-spec, it must promote already-settled durable decisions into `docs/memory/DECISIONS.md` before implementation starts when those decisions materially affect architecture, contracts, runtime behavior, compatibility, security, source-of-truth boundaries, storage formats, or operator workflow. Ralph must also record any newly confirmed durable decisions during execution instead of leaving them trapped only in `.omx/plans/*`, chat history, or `ACTIVITY_LOG.md`.
**Reasoning:** Important decisions were at risk of remaining scattered across transient planning artifacts and execution notes. That makes future sessions re-litigate settled choices, weakens onboarding, and separates implementation from the rationale that should govern later modifications. Promoting durable decisions early keeps the canonical decision log aligned with the actual execution lane and reduces drift between plan, implementation, and memory.
**Alternatives rejected:** Keep durable decisions only in `.omx/plans/*` -- too easy for later implementation sessions to miss. Rely on `ACTIVITY_LOG.md` alone -- activity notes are chronological but are not a canonical decision register. Log every implementation detail as a decision -- creates noise and dilutes the value of the decision log.
**Revisit if:** The repository replaces `docs/memory/DECISIONS.md` with a different canonical decision system or adds robust automated extraction that can promote approved-plan decisions without manual reconciliation.
---
## DEC-032: Ralph reconciles DECISIONS.md only at the start and end of a complete cycle
**Date:** 2026-04-13
**Agent:** user / codex
**Task:** Ralph memory-governance hardening follow-up
**Decision:** In this repository, Ralph should reconcile `docs/memory/DECISIONS.md` only at the two boundary checkpoints of a complete Ralph cycle: (1) at startup, by promoting already-settled durable decisions from the approved plan before implementation begins; and (2) at final completion, by recording any durable decisions confirmed by the run. Mid-run implementation moments are not mandatory decision-log write points unless the user explicitly asks for immediate logging.
**Reasoning:** The earlier continuous-update rule made DECISIONS logging too eager for the intended workflow. Decision entries should stay deliberate and low-noise, while still preventing durable choices from being lost in transient plan artifacts or execution history. Restricting decision-log reconciliation to the start and end of a full Ralph cycle preserves the decision log as a canonical, intentional record instead of a live stream of implementation thought.
**Alternatives rejected:** Log durable decisions immediately whenever they arise mid-run -- captures decisions sooner but adds churn and encourages over-logging during execution. Keep decisions only at final completion -- risks losing already-approved plan decisions before implementation starts. Remove Ralph decision syncing entirely -- reintroduces drift between plan artifacts and the canonical decision log.
**Revisit if:** The team later wants real-time decision journaling during execution, or if Ralph begins running in very long-lived cycles where end-of-cycle reconciliation is too delayed for safe handoff.
---
## DEC-033: Ralph uses only three canonical human ledgers by default in this repository
**Date:** 2026-04-13
**Agent:** user / codex
**Task:** Ralph memory-governance finalization
**Decision:** For Ralph execution in this repository, the canonical human-ledger files are `docs/TASK_PLAN.md`, `docs/memory/ACTIVITY_LOG.md`, and `docs/memory/DECISIONS.md`. `docs/memory/PROGRESS.md` and `docs/memory/CONTEXT.md` are supporting summaries only and should not be auto-updated as part of normal Ralph execution unless the user explicitly asks for it or a stricter repository rule later requires it.
**Reasoning:** Updating too many memory surfaces creates duplication, drift, and contradictions across files that are meant to summarize the same execution. Restricting Ralph's mandatory human-ledger writes to three canonical files preserves a clear source of truth for plan, historical execution, and durable decisions while keeping optional summary files from becoming noisy mirrors of the same information.
**Alternatives rejected:** Keep auto-updating PROGRESS and CONTEXT alongside the canonical ledgers -- produces redundancy and stale summaries. Eliminate all human-ledger files in favor of `.omx/*` runtime memory -- loses a stable, reviewable human source of truth. Make ACTIVITY_LOG or TASK_PLAN optional -- weakens execution auditability.
**Revisit if:** The repository later replaces PROGRESS/CONTEXT with a lean canonical dashboard, or adopts a different explicit memory architecture that changes which files are authoritative.
---


## DEC-034: Progressive harness builder uses schema-first compiled contracts
**Date:** 2026-04-14
**Made by:** Ralph from approved Progressive Harness Builder PRD
**Decision:** The progressive harness builder will preserve WorkflowDefinition, AgentDefinition, Harness/PackDefinition, and CompiledExecutionContract as distinct layers, with runtime execution using a derived compiled contract rather than duplicating authoring truth across UI surfaces.
**Reasoning:** The approved PRD explicitly rejected collapsing workflow, agent, pack, and runtime state into one persistence blob. A schema-first compiled boundary prevents source-of-truth drift while supporting both guided semantic editing and technical deep editing.
**Alternatives rejected:** Swarm UX-first consolidation without shared model/resolver ? risks hidden duplicate ownership. Pack-led long-term primary authoring ? conflicts with Swarm as the desired shell. Parallel persistence/domain ownership ? creates drift.
**Revisit if:** A future architecture removes PackBuilder or replaces Swarm with a different primary shell after explicit parity gates pass.
---


## DEC-035: PackBuilder remains authoritative until explicit Swarm parity gates pass
**Date:** 2026-04-14
**Made by:** Ralph from approved Progressive Harness Builder PRD
**Decision:** PackBuilder must remain the authoritative harness/pack authoring surface for pack-owned behavior until Swarm parity checkpoints prove equivalent authoring and runtime behavior and a separate retirement/deprecation gate is explicitly approved.
**Reasoning:** The plan requires Swarm to become the primary shell without silently reassigning domain authority. Coexistence avoids breaking existing pack-authoritative flows while Swarm gains progressive harness-building capabilities.
**Alternatives rejected:** Immediate PackBuilder retirement ? too aggressive and unverified. Silent authority transfer to Swarm UI ? confusing and unsafe for existing packs.
**Revisit if:** Swarm passes side-by-side parity fixtures, pack/workflow equivalence tests, Playwright parity smoke, and the user explicitly approves PackBuilder retirement or reduction.
---


## DEC-036: Provider and predictability controls must surface structured incompatibilities
**Date:** 2026-04-14
**Made by:** Ralph from approved Progressive Harness Builder PRD
**Decision:** Provider/runtime/tool capability mismatches and unsupported predictability controls must be surfaced as structured incompatibilities or degraded-support notes in compiled previews and UI, not silently accepted as if all providers enforce all controls.
**Reasoning:** The product needs trustworthy harness configuration. Advisory-only or provider-specific controls can remain available, but users must see what is enforced, advisory, unsupported, or degraded before runtime.
**Alternatives rejected:** Hide provider differences ? produces false predictability. Hard-fail every advisory control ? would unnecessarily break useful workflows. Provider-specific UI forks ? increases maintenance and source-of-truth drift.
**Revisit if:** Runtime providers converge on a shared enforceable capability API or the app adopts a stricter provider support policy.
---
