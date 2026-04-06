# Documentation Status
_Last updated: 2026-04-06 after Wave 3 — #200 PASS, #223 PASS (V4.5 CLOSED), #201 COMPLETED (SessionManager.js replay sanitization enhanced). V4.5 area fully closed. V4.0.4 progressing._

## Release Status
**v3.0.0 — RELEASED 2026-03-31**
- QA inspection: CLEAN at release — zero bugs found at release gate
- Test suite: 187/187 passing (confirmed post all patches including V3.1 wave)
- Tasks completed: 132/132 (Tasks #124-#132 V3.1 Swarm bug fix wave — all COMPLETED, AREA CHECKPOINT PASS)
- Open bugs: 0

## Fixed Bugs (v3.0.0 post-release patches)

| ID | Severity | Description | Task | Status |
|----|----------|-------------|------|--------|
| BUG-AUDIT-4 | MEDIUM | useInbox.js hook implemented but not mounted — SwarmView.jsx was not calling useInbox(activeExecutionId), so HITL inbox polling never started | #122 | FIXED 2026-03-31 |
| BUG-AUDIT-1 | CRITICAL | AgentInspector hidden in idle state — was gated behind showSidePanels; now always rendered (component has its own empty state) | #120 | FIXED 2026-03-31 |
| BUG-AUDIT-2 | CRITICAL | PtyExplosion not reachable from UI — "Open Terminal" button added to AgentInspector; calls setPtyExplosionNodeId when sessionId present | #121 | FIXED 2026-03-31 |
| BUG-AUDIT-3 | HIGH | PtyExplosion entry point missing — resolved alongside BUG-AUDIT-2 by wiring the button in AgentInspector | #121 | FIXED 2026-03-31 |
| BUG-SWARM-1 | HIGH | Swarm nodes invisible after generation — fitView not firing after node mount | #116 | FIXED 2026-03-31 |
| BUG-SWARM-2 | HIGH | Node style had `opacity: 0` + staggered animation — corrupted React Flow ResizeObserver bounding box | #116 | FIXED 2026-03-31 |
| BUG-SWARM-3 | MEDIUM | `workflowDef` lost on navigation — moved from local useState to Zustand (useSwarmStore) | #117 | FIXED 2026-03-31 |
| BUG-SWARM-4 | LOW | Missing null guard in `useSwarm.startExecution` — throws `Error('No workflow selected')` on undefined workflowId | #118 | FIXED 2026-03-31 |
| BUG-SESSION-1 / BUG-PRD-1 | HIGH | `agent_status` WS broadcast in SwarmEngine.js `_spawnAgentPty` and `_onHandoff` was missing `sessionId` field — AgentInspector "Open Terminal" button could never activate | #124 | FIXED 2026-04-02 |
| BUG-HANDOFF-1 / BUG-PRD-2 | MEDIUM | `_onHandoff()` emitted `handoff_started` but never `handoff_completed` — FR-V3-43 + PRD Section 11 require both events; `useSwarm.js` case was also missing | #126 | FIXED 2026-04-02 |
| BUG-TRIGGER-1 / BUG-PRD-3 | MEDIUM | `trigger_fired`, `trigger_status`, and `rss_item` WS events silently dropped — `useSwarm.js` switch had no cases; all three now handled with `updateTriggerState` + `addFeedEvent` | #128 | FIXED 2026-04-02 |
| BUG-INSPECTOR-1 / BUG-PRD-4 | LOW | `onUpdateNode` prop undefined in SwarmCanvas.jsx — `handleUpdateNode` useCallback defined and wired to AgentInspector; performs shallow merge on `node.data` via `setNodes` | #130 | FIXED 2026-04-02 |
| BUG-PTY-REPLAY-CONTAMINATION-1 | MEDIUM | `sanitizeReplayOutput()` only stripped ANSI control codes, not semantic noise (swarm protocol preamble, CLI chrome, stale prompts, corruption tails) — replay showed raw system prompts to users | #201 | FIXED 2026-04-06 |

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-04-06 | Rate limit updated 200->300 req/min per V5.2 Task #240. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-04-02 | PtyExplosion component tree entry still accurate. The `key=` prop is an internal React implementation detail, not an architectural change. |
| docs/PRD.md | UP_TO_DATE | 2026-04-02 | Section 11 spec unchanged by V5.0 fixes — snippet contract (`lastOutputSnippet` field name/type) is the same; only internal filtering logic improved. |
| docs/API.md | UP_TO_DATE | 2026-04-06 | No endpoint signature changes in V5.2. Malformed JSON 400, API 404 JSON, and rate limit 300 are internal behavior improvements — existing API docs remain accurate. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-28 | No stack/constraint changes in V5.0 fixes. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-04-03 | DEC-001 through DEC-026 — no new architectural decisions from V5.0 bug fixes. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-04-06 | V5.0 fix wave entry added: TASK #231 (snippet preamble noise) and TASK #232 (PTY Explosion wrong terminal) COMPLETED. TASK #233 still PENDING. |
| docs/memory/CONTEXT.md | UP_TO_DATE | 2026-04-06 | Focus updated to V5.0 Debugger Loop Deep Check status. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-04-06 | V5.0 Phase 1 deep test entry appended by documenter. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-04-06 | V1 audit. SEC-06 entry updated with webhook CSRF exemption note (Task #234). |
| docs/security-v3-audit.md | UP_TO_DATE | 2026-04-06 | MEDIUM-V3-01 marked FIXED (Task #234). Summary table updated. |
| Inline comments | UP_TO_DATE | 2026-04-06 | V5.0 fixes: SwarmEngine.js SNIPPET_NOISE_LINE_PATTERNS array is self-documenting. SessionManager.js REPLAY_NOISE_LINE_PATTERNS + sanitizeReplayOutput enhancement (Task #201) has clear inline group comments and JSDoc on stripAnsiForMatching. No stale comments. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. Deferred indefinitely. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- client/src/views/EntitiesView.jsx -- Still exists on disk but is no longer imported by App.jsx. Marked DEPRECATED in ARCHITECTURE.md component tree. Can be deleted in a future cleanup.
- docs/memory/CODE_MAP.md:TriggerNode entry -- Still contains "(stub)" notation from Task #53.3; Task #76 fully implemented TriggerNode with store subscription, fired animation, and timestamp display. Code-mapper should update the map entry.

## V3.1 Bug Fix Wave — ALL FIXED (2026-04-02)

All four BUG-PRD-* bugs identified by prd-writer's code audit have been fixed in AREA V3.1 (Tasks #124-#132). AREA CHECKPOINT #132 PASS confirmed all fixes work together.

| ID | Severity | Location | Description | Fixed in Task | Status |
|----|----------|----------|-------------|---------------|--------|
| BUG-PRD-1 / BUG-SESSION-1 | HIGH | SwarmEngine.js + useSwarm.js | `agent_status` WS event lacked `sessionId` field — AgentInspector "Open Terminal" button could never activate via WS alone | #124 | FIXED 2026-04-02 |
| BUG-PRD-2 / BUG-HANDOFF-1 | MEDIUM | SwarmEngine.js | `handoff_completed` event never emitted — `_onHandoff()` only emitted `handoff_started`; FR-V3-43 required both | #126 | FIXED 2026-04-02 |
| BUG-PRD-3 / BUG-TRIGGER-1 | MEDIUM | useSwarm.js (client) | `trigger_fired`, `trigger_status`, and `rss_item` WS events unhandled on client — switch statement had no cases for them | #128 | FIXED 2026-04-02 |
| BUG-PRD-4 / BUG-INSPECTOR-1 | LOW | SwarmCanvas.jsx | `onUpdateNode` prop was never defined in SwarmCanvas.jsx — `handleUpdateNode` useCallback added and passed to AgentInspector | #130 | FIXED 2026-04-02 |

## V5.1 Debugger Loop Full-App Deep Check — AREA CLOSED (2026-04-06)

Full-app deep E2E test covered all 10 server route files and all 7 client views. One actionable bug found and fixed; one known limitation deferred.

**Test health:** 12 server files, 312 tests, all pass. Client build: 480 modules, 0 errors.

| ID | Severity | Location | Description | Status |
|----|----------|----------|-------------|--------|
| BUG-API-1 | HIGH | server/middleware/csrf.js | Webhook endpoint blocked by global CSRF middleware — external callers received 403. Fixed: CSRF_EXEMPT_PREFIXES array exempts /api/v1/triggers/webhooks/ from CSRF validation. | FIXED 2026-04-06 (Task #234). TEST GATE #235 PASS. |
| BUG-UI-1 | LOW | ConPTY terminal buffer | Terminal prompt garble after view switch due to ConPTY buffer race. Known limitation per DEC-009 (ConPTY deadlock prevention). | DEFERRED — known/accepted per DEC-009 |

**Overall assessment:** AREA CLOSED. App is in healthy state. Zero remaining actionable bugs. BUG-UI-1 is a known Windows ConPTY limitation, not a code defect.

## V5.2 Debugger Loop Swarm Deep Check — AREA CLOSED (2026-04-06)

Phase 1 (deep E2E test) found 5 bugs. Phase 2 (bulk plan) created tasks #238-#244. Wave 1 (parallel fixes #238-#241) completed. TEST GATE #243 PASS. Area closed.

| ID | Severity | Location | Description | Fixed in Task | Status |
|----|----------|----------|-------------|---------------|--------|
| BUG-SWARM-API-1 | MEDIUM | server/index.js | Malformed JSON body returned 500 instead of 400 | #238 | FIXED 2026-04-06 |
| BUG-SWARM-UI-2 | MEDIUM | client/src/hooks/useSwarm.js | Stale execution ID caused 404 on page load — hydration now clears dead state | #239 | FIXED 2026-04-06 |
| BUG-SWARM-UI-3 | LOW | server/index.js | Rate limiter 200 req/min too strict for rapid view switching — raised to 300 | #240 | FIXED 2026-04-06 |
| BUG-SWARM-API-2 | LOW | server/index.js | Unmatched /api/* paths returned SPA HTML 200 — now returns JSON 404 | #241 | FIXED 2026-04-06 |
| BUG-SWARM-UI-1 | LOW | Swarm UI | Duplicate workflow names in dropdown — cosmetic | DEFERRED (#242) | DEFERRED |

**Overall assessment:** AREA CLOSED. TEST GATE #243 PASS confirmed all 4 fixes. Zero remaining actionable bugs. BUG-SWARM-UI-1 deferred as cosmetic.

**Documentation impact:** README.md rate limit updated 200->300. docs/TEST_RESULTS.md and docs/research_complete.md rate limit references updated. No API endpoint signature changes.

## Wave 1 Verification Sweep — 8 Gates PASS (2026-04-06)

No code modified. Eight verification tasks completed, all PASS. Summary:

| Task | Type | Area | Verdict |
|------|------|------|---------|
| #178 | TEST GATE | V4.0.2 — BUG-PTY-EXPLOSION-1 | PASS |
| #180 | TEST GATE | V4.0.2 — BUG-RINGBUFFER-ANSI-1 | PASS |
| #184 | TEST GATE | V4.0.2 — BUG-SNIPPET-PROTOCOL-1 | PASS |
| #186 | TEST GATE | V4.0.2 — BUG-FEED-ICON-1 | PASS |
| #198 | TEST GATE | V4.0.4 — BUG-SNIPPET-FIDELITY-1 | PASS |
| #213 | AREA CHECKPOINT | V4.3 E2E Deep Test Round 2 | PASS — V4.3 AREA CLOSED |
| #216 | TEST GATE | V4.4 — Snippet Fidelity | PASS |
| #218 | TASK | V4.5 — BUG-SNIPPET-CONPTY-SPACES | COMPLETED (known limitation accepted) |

**Documentation impact:** None — no code changes, no API changes, no config changes. All existing docs remain accurate.

## Wave 2 Verification Sweep — 4 Tasks PASS/COMPLETED (2026-04-06)

No source code modified. Four verification/gate tasks completed. V4.0.2 and V4.4 areas now fully closed.

| Task | Type | Area | Verdict |
|------|------|------|---------|
| #187 | AREA CHECKPOINT | V4.0.2 — Gemini E2E PTY/UI Bug Fixes | PASS — V4.0.2 AREA CLOSED |
| #217 | AREA CHECKPOINT | V4.4 — Snippet Fidelity Final Polish | PASS — V4.4 AREA CLOSED |
| #199 | TASK | V4.0.4 — BUG-TOKEN-FIDELITY-1 | COMPLETED (no code change needed — control tokens already preserved) |
| #222 | TEST GATE | V4.5 — Snippet Fidelity MVP Blockers | PASS — #223 AREA CHECKPOINT unblocked |

**Documentation impact:** None — no source code changes, no API changes, no config changes. All existing docs remain accurate.

**Area status after Wave 2:** V4.0.2 CLOSED, V4.0.3 CLOSED, V4.3 CLOSED, V4.4 CLOSED, V5.1 CLOSED, V5.2 CLOSED. Open areas: V4.0.4 (#200-#205 remaining), V4.5 (#223 AREA CHECKPOINT pending).

## Wave 3 — #200 PASS, #223 PASS (V4.5 CLOSED), #201 COMPLETED (2026-04-06)

Task #201 modified source code (SessionManager.js). Tasks #200 and #223 were verification-only (no code changes).

| Task | Type | Area | Verdict | Code Modified |
|------|------|------|---------|---------------|
| #200 | TEST GATE | V4.0.4 — BUG-TOKEN-FIDELITY-1 | PASS | No |
| #223 | AREA CHECKPOINT | V4.5 — Snippet Fidelity MVP Blockers | PASS — V4.5 AREA CLOSED | No |
| #201 | BUG FIX | V4.0.4 — BUG-PTY-REPLAY-CONTAMINATION-1 | COMPLETED | Yes — server/services/SessionManager.js |

**Task #201 details:** Enhanced `sanitizeReplayOutput()` in SessionManager.js with content-level filtering. Added `REPLAY_NOISE_LINE_PATTERNS` (30+ patterns for swarm protocol preamble, CLI chrome, stale prompts, agent role declarations), `stripAnsiForMatching()` helper, multi-line swarm protocol block stripping, and corruption tail detection (`REPLAY_CORRUPTION_TAIL_RE`, `REPLAY_REPEATED_CHAR_RE`). 312/312 tests pass. TEST GATE #202 is next.

**Documentation impact:** No README, ARCHITECTURE, or API doc changes needed. The enhancement is internal to an existing function — no new endpoints, no new components, no config changes. Inline comments in the modified file are accurate and self-documenting.

**Area status after Wave 3:** V4.0.2 CLOSED, V4.0.3 CLOSED, V4.3 CLOSED, V4.4 CLOSED, V4.5 CLOSED, V5.1 CLOSED, V5.2 CLOSED. Open area: V4.0.4 (#202-#205 remaining).

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/CONTRIBUTING.md | Low | Private tool at v3.0; no external contributors |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally |
| Delete EntitiesView.jsx dead code | Low | Kept for rollback safety; no functional impact |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn — deferred to v3.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path — deferred to v3.1 |
| Swarm execution state persistence | Medium | In-memory only in v3.0; restart clears all executions. Disk persistence planned for v3.1. |
| docs/memory/CODE_MAP.md TriggerNode "(stub)" notation | Low | Code-mapper should update the map entry — TriggerNode is now fully implemented (Task #76). |
| ~~MEDIUM-V3-01 / BUG-API-1 (webhook CSRF mismatch)~~ | RESOLVED | Fixed in Task #234 (2026-04-06). CSRF_EXEMPT_PREFIXES array added to server/middleware/csrf.js. Security audit docs updated. |
| ~~BUG-PRD-1 through BUG-PRD-4 code fixes~~ | RESOLVED | All four bugs fixed in V3.1 wave (Tasks #124-#130). AREA CHECKPOINT #132 PASS confirmed. No remaining debt from this item. |
