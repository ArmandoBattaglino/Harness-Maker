# Documentation Status
_Last updated: 2026-04-09 after V10.8 AREA CLOSED (#491–#495): visual regression baselines at 682px (normalizeHarnessLayout), Codex handoff harness stabilized (3 bug fixes), stale server guard (scripts/check-server-freshness.mjs + check:server-freshness npm scripts), TEST GATE #494 PASS, AREA CHECKPOINT #495 PASS. All areas V3.1–V10.8 CLOSED. Server: 501/501, client: 52/52, build: 507 modules. PROJECT COMPLETE._

## Release Status
**v9.0.0 — V9.0 Stream-JSON Agent Migration CLOSED for core semantics, display fidelity FIXED**
- QA inspection: FUNCTIONAL PASS on v9.0 core (tangible multi-agent output achieved — Writer produced correct Italian paragraph end-to-end)
- Display fidelity: FIXED — BUG-DL-TEXTDELTA-1 (#406) resolved text_delta concatenation corruption via two-layer fix: (1) separator changed from `'\n\n'` to `''`, (2) phase 2 adds canonical `resultText` from result event that replaces all streamed fragments; BUG-DL-01 is now closed
- Test suite: 501/501 passing (unit/integration; includes 6 new Codex SDK handoff tests)
- Build: 501 modules, 0 errors
- Tasks: numbering extends through #408.
- Open bugs: 0 (was 2)
  - ~~BUG-DL-01 (HIGH) — text_delta word splitting~~ FIXED in Task #406 (BUG-DL-TEXTDELTA-1): `appendAgentChatText` separator changed from `'\n\n'` to `''`; `lastChatSnippet` now accumulates instead of overwriting.
  - ~~BUG-DL-02 (LOW) — stale node state persists when a fresh workflow is loaded~~ FIXED in Task #407 (BUG-DL-STALE-STATE-1): `setWorkflowDef` auto-clears execution state via `buildClearedExecutionState()` when workflow ID changes and stale state exists.
  - ~~BUG-DL-03 (LOW) — per-turn cost footer disappears after Completed~~ FIXED in Task #408 (BUG-DL-COST-VANISH-1): removed `isStreamJson` gate from cost displays; `applyExecutionSnapshot` normalizes server flat cost fields to client nested `totalCost` format; AgentNode reads both `totalCost.costUsd` and `totalCostUsd`.
- V9.0 status: PRD v6.0 written, research complete, architect analysis done (DEC-027/028/029), stream-json migration CLOSED through #393 PASS for core flow, debugger-loop follow-up #394-#396 CLOSED, handoff provider bug #397 COMPLETED, AUTO routing bug #398 COMPLETED. Deterministic stream-json/PTY E2E coverage lives in `server/tests/e2e/stream-json-e2e.test.js`. A second debugger-loop wave (Phase 1 complete this session) re-opens UI presentation fidelity — semantics are correct but the rendered output is not.

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

## Fixed Bugs (post-v3.0.0 — latest additions)

| ID | Severity | Description | Task | Status |
|----|----------|-------------|------|--------|
| BUG-DONE-TOKEN-REPLAY-1 | LOW | `sanitizeReplayOutput()` did not filter done-token recovery prompts injected when agent finishes without emitting __DONE__ — 3 patterns added to REPLAY_NOISE_LINE_PATTERNS | #233 | FIXED 2026-04-06 |
| BUG-SWARM-UI-1 | LOW | Duplicate workflow names in saved workflows dropdown — name-based deduplication + date suffix added to SwarmView.jsx | #242 | FIXED 2026-04-06 |
| BUG-DONE-BARE-1 | LOW | `DONE_RE` only matched `__DONE__` — bare `DONE` on its own line now also accepted by HandoffParser, eliminating unnecessary done reminder reinject | #254 | FIXED 2026-04-06 |
| BUG-HANDOFF-ROUTING-1 | HIGH | `_ensureAgentPty` did not pass `requestedProvider` to `_spawnAgent`, so handoff targets always spawned via PTY — Claude agents spawned after handoff got garbled ConPTY output instead of stream-json | #397 | FIXED 2026-04-08 |
| BUG-AUTO-ROUTING-1 | HIGH | `_spawnAgent` did not consult `execution.providerStrategy.activeProvider` when effectiveProvider was AUTO — all generated workflows (no explicit model on nodes) fell through to PTY instead of stream-json for Claude | #398 | FIXED 2026-04-08 |
| BUG-DL-TEXTDELTA-1 | HIGH | `appendAgentChatText` used `'\n\n'` separator between text_delta chunks, corrupting sub-word fragments; `lastChatSnippet` overwrote instead of accumulating | #406 | FIXED 2026-04-08 |
| BUG-DL-STALE-STATE-1 | LOW | Stale per-node execution state (agentStates, chatMessages, agentResults) persisted when switching workflows — `setWorkflowDef` now auto-clears via `buildClearedExecutionState()` when workflow ID changes | #407 | FIXED 2026-04-08 |
| BUG-DL-COST-VANISH-1 | LOW | Cost badge on agent node and cost footer in chat messages disappeared after execution Completed — removed `isStreamJson` gate from cost displays; `applyExecutionSnapshot` normalizes server flat cost to client nested `totalCost`; AgentNode reads dual format | #408 | FIXED 2026-04-08 |
| BUG-SNIPPET-INIT-1 | LOW | Agent card showed system prompt text for ~3s during startup — snippet update now gated by echo gate (`ignoreParserUntil`) in SwarmEngine.js tapFn | #255 | FIXED 2026-04-06 |
| BUG-WF-1 | LOW | Context menu on node/edge right-click showed wrong menu type (canvas menu instead of node/edge menu) — `event.stopPropagation()` missing in `handleNodeContextMenu` and `handleEdgeContextMenu` in SwarmCanvas.jsx | V5-bugfix | FIXED 2026-04-06 |
| BUG-WF-2 | LOW | Ctrl+S keyboard shortcut in SwarmView.jsx captured stale closure of `handleSave`/`handleRun` — added `handleSaveFnRef` and `handleRunFnRef` refs so `useEffect` keydown handler always calls the latest function | V5-bugfix | FIXED 2026-04-06 |
| BUG-DT-1 | LOW | Models settings popup in SwarmView.jsx toolbar did not close on click-outside — added `modelSettingsRef` (useRef) + `useEffect` mousedown listener that dismisses popup when clicking outside the ref container | ed6877a | FIXED 2026-04-09 |
| BUG-BLOCKER-UI-02 | LOW | Raw Gemini CLI Dingbat characters (U+2700–U+27BF) leaked into node card snippets; `provider_unavailable` blocker showed CLI banner noise instead of clean message; `pinnedDisplaySnippet` not cleared in `stopExecution` cleanup loop | #479 | FIXED 2026-04-09 |

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-04-09 | Test counts updated to 501/501 server + 52/52 client, 507 modules. Stale Server Guard subsection added (check:server-freshness scripts + env var table). |
| CLAUDE.md | UP_TO_DATE | 2026-04-08 | Updated with DEC-027/028/029 runtime constraints, `--tools` guidance, truthful blocker rule for Claude stream-json failures, and `write-file-atomic` correction. |
| docs/ARCHITECTURE.md | PARTIAL | 2026-04-09 | V5 component tree still deferred (12 components). Section 13.1 updated: ChatExtractor NOT used for Claude stream-json OR Codex SDK agents (BUG-CHAT-SERVER-02 double emission fix, Task #427). Section 13.4 step 10 updated: stream-json text_delta broadcasts chat_message directly, not via ChatExtractor. Remaining V9.0 components (#361-#393) listed as pending in 13.7. |
| docs/PRD.md | UP_TO_DATE | 2026-04-08 | Rewritten to v6.0: Stream-JSON Agent Migration. 12 component specs, 27 FRs, 7 SEC-SJ-* requirements. |
| docs/API.md | UP_TO_DATE | 2026-04-09 | WS event table updated: chat_message isCanonical documents server-side execution.chatMessages replacement and client-side canonicalReceived guard. GET /status response now includes chatMessages field with description. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-04-09 | Tech stack table updated: rehype-sanitize 6.x added for Markdown XSS prevention. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-04-08 | DEC-001 through DEC-029. DEC-027/028/029 added by architect for stream-json migration. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-04-08 | Updated by project-manager with V9.0 area entry. |
| docs/memory/CONTEXT.md | UP_TO_DATE | 2026-04-08 | Focus reflects V9.0 stream-json migration, dependency wave map, immediate next step. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-04-08 | Updated with the dedicated `server/tests/e2e/stream-json-e2e.test.js` harness entry for the V9.0 close-out wave. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No production code changed yet. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-04-08 | Includes debugger-loop fallback closure plus the V9.0 close-out entries for #389-#393. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-04-06 | V1 audit. V9.0 adds SEC-SJ-01 through SEC-SJ-07 in PRD -- no code changes yet. |
| docs/security-v3-audit.md | UP_TO_DATE | 2026-04-06 | MEDIUM-V3-01 marked FIXED (Task #234). No changes from V9.0 planning. |
| Inline comments | UP_TO_DATE | 2026-04-09 | Wave 6 LOW batch comments remain accurate. New test file server/tests/swarm-engine-codex-sdk.test.js uses describe/it blocks — no production function docstrings require changes. scripts/swarm-codex-handoff-e2e.mjs is debug-only with self-documenting intent. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. Deferred indefinitely. |
| docs/research_resume_after_kill.md | UP_TO_DATE | 2026-04-08 | NEW: Research on --resume behavior after process kill. Findings feed into FR-SJ-17/18. |
| docs/research_b_tools.md | UP_TO_DATE | 2026-04-08 | NEW: Research on --allowedTools vs --tools vs --disallowedTools. Critical finding: --allowedTools is NOT a security boundary (bug #12232). |
| docs/research_d_stream_events.md | UP_TO_DATE | 2026-04-08 | NEW: Research on stream-json event types and structure. |
| server/spike/stream-json-spike.mjs | UP_TO_DATE | 2026-04-08 | NEW: Standalone spike script for Task #354. Non-production validation. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- client/src/views/EntitiesView.jsx -- Still exists on disk but is no longer imported by App.jsx. Marked DEPRECATED in ARCHITECTURE.md component tree. Can be deleted in a future cleanup.
- docs/memory/CODE_MAP.md:TriggerNode entry -- Still contains "(stub)" notation from Task #53.3; Task #76 fully implemented TriggerNode with store subscription, fired animation, and timestamp display. Code-mapper should update the map entry.
- docs/ARCHITECTURE.md -- Section 13 updated through Task #359 (subsections 13.3-13.6). Remaining V9.0 components (#361-#393) will need entries as they are implemented.
- docs/ARCHITECTURE.md -- Section 13 still needs a final narrative sweep to replace the now-stale “remaining V9.0 components (#361-#393)” note after area closure.

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|-----------------|
| ARCHITECTURE.md V5 component tree (12 components) | LOW | Deferred since v5.0; no active development on those components |
| ARCHITECTURE.md Section 13 (V9.0 stream-json) | MEDIUM | Section 13.2-13.6 done (StreamJsonParser + spawner + result handler). Remaining components (#361-#393) need entries as implemented. |
| docs/ARCHITECTURE.md Section 13 closure sweep | MEDIUM | Runtime landed and V9.0 is closed, but the narrative note still describes #361-#393 as pending work |
| API.md V9.0 WS events | DONE | Resolved 2026-04-08: all V9.0 WS events documented including isCanonical chat_message |

## V10.8 Test Infrastructure Set — Tasks #491+#492+#493 (2026-04-09)

Three tasks completed. All changes are test infrastructure and tooling — no production server or client source modified.

| Task | Type | File(s) | Change Summary | Doc Impact |
|------|------|---------|----------------|------------|
| #491 | IMPROVEMENT | tests/visual/swarm/swarm-visual-regression.mjs, tests/visual/swarm/baselines/ | `normalizeHarnessLayout()` added; baselines regenerated at correct 682px viewport (replacing stale 1018px baselines) | None — internal harness helper |
| #492 | BUG FIX (×3) | tests/visual/swarm/swarm-codex-handoff-e2e.mjs, tests/visual/swarm/README.md | Codex handoff harness stabilized: 3 bug fixes; README updated with harness modes, preflight check notes, and sandbox fallback | tests/visual/swarm/README.md already up to date |
| #493 | NEW FEATURE | scripts/check-server-freshness.mjs (NEW), scripts/swarm-e2e-chat-check.mjs, scripts/swarm-visual-regression.mjs, package.json | Stale server guard added: new script + `check:server-freshness` / `check:server-freshness:warn` npm scripts; warnings integrated into swarm E2E harnesses | README.md updated — new "Stale Server Guard" subsection + env var table |

**Documentation impact:** README.md updated with test counts (501/501 server, 52/52 client, 507 modules), new Stale Server Guard subsection, and `check:server-freshness` / `check:server-freshness:warn` command reference. tests/visual/swarm/README.md was updated by the implementing agent in Task #492 — verified accurate.

## V10.8 AREA CLOSED — TEST GATE #494 PASS + AREA CHECKPOINT #495 PASS (2026-04-09)

Two verification tasks completed. No source code modified in either task.

| Task | Type | Verdict | Doc Impact |
|------|------|---------|------------|
| #494 | TEST GATE | PASS — 501/501 server, 52/52 client, 507 modules, freshness exit-2 confirmed, all 4 harness scripts syntax-valid, 6 baselines present | None — verification only |
| #495 | AREA CHECKPOINT | PASS — all 6 V10.8 tasks (#491–#496) confirmed COMPLETED | None — verification only |

**V10.8 is fully closed. All areas V3.1 through V10.8 are CLOSED. No active planned areas. PROJECT COMPLETE.**

**Documentation status:** README.md was already updated in the #491+#492+#493 wave. No further doc changes required for #494 or #495 — both are verification-only tasks with no new APIs, endpoints, components, or configuration.

---

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
| BUG-SWARM-UI-1 | LOW | client/src/views/SwarmView.jsx | Duplicate workflow names in dropdown — name-based dedup + date suffix | #242 | FIXED 2026-04-06 |

**Overall assessment:** AREA CLOSED. All 5 bugs fixed. TEST GATE #243 PASS confirmed fixes #238-#241. Task #242 fixed the deferred cosmetic bug (BUG-SWARM-UI-1). Zero remaining bugs.

**Documentation impact:** README.md rate limit updated 200->300. docs/TEST_RESULTS.md and docs/research_complete.md rate limit references updated. No API endpoint signature changes.

## Debugger Loop Phase 1 — Chat Stress Test (2026-04-09)

Deep code audit and browser E2E test of the entire chat system. **No code was modified.** 31 bugs catalogued (6 HIGH, 9 MEDIUM, 16 LOW) across server and client chat components. All documentation remains current since no source files changed.

**Files audited (read-only):**
- server/services/ChatExtractor.js, chatTextNormalization.js, SwarmEngine.js
- client/src/store/SwarmContext.jsx, hooks/useSwarm.js, canvas/ChatPanel.jsx, ChatMessage.jsx, HitlChatCard.jsx

**Key HIGH findings (not yet fixed):**
- Stream-json canonical result not stored in `execution.chatMessages`
- ChatExtractor buffer key collision across concurrent executions
- Client canonical-before-fragments race condition

**Documentation impact:** None. No code changed, so no docs are stale. When the Phase 2 bug-fix wave lands, all affected docs (ARCHITECTURE.md inline comments, API.md WS events, DOC_STATUS.md fixed-bugs table) will need updating at that time.

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

## Wave 4 — #202 PASS, #203 COMPLETED (no code change) (2026-04-06)

No source code modified. Two tasks completed, both verification/analysis only.

| Task | Type | Area | Verdict | Code Modified |
|------|------|------|---------|---------------|
| #202 | TEST GATE | V4.0.4 — BUG-PTY-REPLAY-CONTAMINATION-1 | PASS | No |
| #203 | BUG FIX (resolved) | V4.0.4 — BUG-RECOVERY-LABELING-1 | COMPLETED — already handled by existing pipeline | No |

**Task #203 details:** Recovery prompts and system-authored correction messages are already visually distinguished from agent output by the existing sanitization pipeline at three levels: SNIPPET_RECOVERY_LINE_PATTERNS (SwarmEngine.js), SNIPPET_NOISE_LINE_PATTERNS (SwarmEngine.js), and REPLAY_NOISE_LINE_PATTERNS (SessionManager.js). Recovery-only content produces a human-friendly "Runtime reminder" summary. No code change needed.

**Documentation impact:** None — no code changes, no API changes, no config changes. All existing docs remain accurate.

**Area status after Wave 4:** V4.0.2 CLOSED, V4.0.3 CLOSED, V4.3 CLOSED, V4.4 CLOSED, V4.5 CLOSED, V5.1 CLOSED, V5.2 CLOSED. Open area: V4.0.4 (#204 TEST GATE + #205 AREA CHECKPOINT remaining).

## Final Post-Fix Trio — Tasks #233, #242, #148 (2026-04-06)

Three tasks completed. Two modified source code, one was verification-only. All areas V3.1 through V5.2 are now CLOSED.

| Task | Type | Area | Verdict | Code Modified |
|------|------|------|---------|---------------|
| #233 | BUG FIX | V5.0 — Done-token recovery prompt noise | COMPLETED | Yes — server/services/SessionManager.js (3 patterns added to REPLAY_NOISE_LINE_PATTERNS) |
| #242 | BUG FIX | V5.2 — Duplicate workflow names | COMPLETED | Yes — client/src/views/SwarmView.jsx (name dedup + date suffix) |
| #148 | AREA CHECKPOINT | V3.4 — Swarm UX Deep Test | PASS (15/15, 3 skipped) | No — Puppeteer E2E verification only |

**Documentation impact:** No README, ARCHITECTURE, API, or PRD changes needed. Task #233 is internal filtering logic within an existing function. Task #242 is a UI bug fix with no new APIs or config. Task #148 is verification-only. Inline comments in both modified files are accurate.

## V6.0 Runtime Deep Test Bug Fixes — Tasks #245-#248 (2026-04-06)

Wave A (#245-#247, SwarmEngine.js) and Wave B (#248, PromptToFlowBar.jsx) completed. All changes are internal logic — no new endpoints, components, config, or env vars.

| Task | Type | File | Change Summary | Doc Impact |
|------|------|------|----------------|------------|
| #245 | BUG FIX | SwarmEngine.js | Collapse repeated "(thinking)" tokens in `_buildSemanticSnippet()` via regex replace; added `/(thinking)(thinking))*$/i` to SNIPPET_NOISE_LINE_PATTERNS | None — internal snippet filtering |
| #246 | BUG FIX | SwarmEngine.js | Added Codex auth prompt ANSI patterns to SNIPPET_NOISE_LINE_PATTERNS (`/codex auth/i`, `/openai api/i`, `/authentication required/i`, etc.) | None — internal snippet filtering |
| #247 | BUG FIX | SwarmEngine.js | Added `_snippetOverlapsPrompt()` method for word-level overlap detection (>60%); integrated into `_refreshAgentSnippet()` to filter Gemini system prompt echoes | None — internal snippet filtering |
| #248 | BUG FIX | PromptToFlowBar.jsx | Added `promptError` state + empty prompt inline validation with red border feedback before fetch | None — client-side UX guard, no API change |

**Documentation impact:** None. All changes are internal filtering logic and client validation. No README, ARCHITECTURE, API, or PRD updates needed. Inline comments in modified files are accurate and self-documenting. TEST GATES #249-#252 and AREA CHECKPOINT #253 are pending.

## V7.0 Swarm Terminal Deep Test Bug Fixes — Tasks #254-#255 (2026-04-06)

Two bug fixes completed. One required a minor ARCHITECTURE.md update (DONE token format). Both are internal logic changes with no new endpoints, components, config, or env vars.

| Task | Type | File | Change Summary | Doc Impact |
|------|------|------|----------------|------------|
| #254 | BUG FIX | HandoffParser.js | `DONE_RE` regex widened: now accepts bare `DONE` on its own line (with optional bullet prefix) in addition to `__DONE__` | ARCHITECTURE.md Section 11.4 updated — DONE token format now documents both variants |
| #255 | BUG FIX | SwarmEngine.js | Snippet update in `tapFn` gated by echo gate (`ignoreParserUntil`) — prevents system prompt text from appearing in agent card during startup | None — internal snippet filtering logic |

**Documentation impact:** docs/ARCHITECTURE.md Section 11.4 (Handoff Protocol) updated to reflect that both `__DONE__` and bare `DONE` are accepted. No README, API, or PRD changes needed. Inline comments in SwarmEngine.js (echo gate guard at line ~2125-2130) are accurate and self-documenting. TEST GATES #256-#257 and AREA CHECKPOINT #258 are pending.

## V5 Wave 1 — Swarm Editor Transition (2026-04-06)

Frontend-only changes. No new API endpoints, no env var changes, no backend changes. Four new files, four modified files.

| File | Type | Change Summary | Doc Impact |
|------|------|----------------|------------|
| client/src/hooks/useCanvasHistory.js | NEW | Undo/redo hook with 50-entry stack, structuredClone snapshots, version-bumped re-renders | None — no API, config, or architecture doc changes |
| client/src/utils/sanitizeWorkflow.js | NEW | Strips React Flow runtime fields (measured, width, height, selected, dragging, positionAbsolute) before save | None |
| client/src/utils/nodeIdGenerator.js | NEW | Generates node IDs matching ^[a-z][a-z0-9-]*$ using crypto.randomUUID() | None |
| client/src/canvas/ContextMenu.jsx | NEW | Right-click context menu component — canvas (add node, select all, paste), node (edit, duplicate, copy, delete), edge (delete) | ARCHITECTURE.md V5 component tree update deferred |
| client/src/canvas/SwarmCanvas.jsx | MODIFIED | Undo/redo, delete with cascade, context menu, dirty tracking, node drag history | None |
| client/src/canvas/AgentInspector.jsx | MODIFIED | Full edit panel: per-type config sections (AgentFields, DepartmentFields, TriggerFields), debounced field commits, collapsible sections, editable label | None |
| client/src/views/SwarmView.jsx | MODIFIED | Save button with sanitizeWorkflow, dirty indicator (*), inline name editing with validation, save feedback | None |
| client/src/hooks/useWorkflow.js | MODIFIED | Bug fix: update() unwraps {workflow} response envelope | None |

**Documentation impact:** No README, API, or PRD changes needed. ARCHITECTURE.md V5 component tree update deferred to batch (when more V5 waves complete). Inline comments in all new/modified files are accurate.

## V5 Wave 2 — NodePalette + WorkflowSettingsModal + Canvas Drop + Settings Button (2026-04-06)

Frontend-only changes. No new API endpoints, no env var changes, no backend changes. Two new files, two modified files.

| File | Type | Change Summary | Doc Impact |
|------|------|----------------|------------|
| client/src/canvas/NodePalette.jsx | NEW | Collapsible left sidebar with 4 draggable node type cards (Agent, Department, Webhook Trigger, RSS Trigger). HTML5 drag-and-drop via dataTransfer with `application/reactflow-type` and `application/reactflow-subtype`. FR-V5-25 through FR-V5-29. | ARCHITECTURE.md V5 component tree update deferred |
| client/src/canvas/WorkflowSettingsModal.jsx | NEW | Two-tab modal: Settings (execution mode radio, budget token presets + number input, circuit breaker threshold, default model grouped select) and Initial Context (dynamic key-value editor with add/delete rows). Escape closes, Apply commits. FR-V5-34/35/36. | ARCHITECTURE.md V5 component tree update deferred |
| client/src/canvas/SwarmCanvas.jsx | MODIFIED | Added onDragOver/onDrop handlers for NodePalette integration. Drop creates nodes at cursor position with generateNodeId and type-specific default data. NodePalette rendered as flex sibling of ReactFlow. | None |
| client/src/views/SwarmView.jsx | MODIFIED | Added gear Settings button in toolbar (disabled when no workflow loaded). WorkflowSettingsModal shown on click; Apply merges settings + initialContext into workflowDef and marks dirty. showSettings state added. | None |

**Documentation impact:** No README, API, or PRD changes needed. ARCHITECTURE.md V5 component tree update deferred to batch. Inline comments in all new/modified files are accurate (FR references, header comments).

## V5 Wave 3 — Validation + Shortcuts + Snap-to-Grid + Export/Import/Duplicate (2026-04-06)

Frontend-only changes. No new API endpoints, no env var changes, no backend changes. One new file, three modified files.

| File | Type | Change Summary | Doc Impact |
|------|------|----------------|------------|
| client/src/hooks/useCanvasValidation.js | NEW | Pre-run validation hook — 5 rules: no agent nodes, no triage node, empty system prompt (warning), invalid trigger config, disconnected nodes (warning). Returns `{ isValid, errors }`. FR-V5-44 through FR-V5-46. | ARCHITECTURE.md V5 component tree update deferred |
| client/src/canvas/nodes/AgentNode.jsx | MODIFIED | Added amber validation warning badge (circle with !) when system prompt is empty (FR-V5-45). Positioned at top-right corner. | None |
| client/src/canvas/SwarmCanvas.jsx | MODIFIED | Added `snapToGrid` and `snapGrid={[20, 20]}` props to ReactFlow (FR-V5-41). No other changes. | None |
| client/src/views/SwarmView.jsx | MODIFIED | Added: export as JSON (FR-V5-38), import from JSON file (FR-V5-39), duplicate workflow (FR-V5-37), keyboard shortcuts via stable refs (FR-V5-43: Ctrl+S save, Ctrl+Enter run), validation banner showing errors/warnings (FR-V5-44), run button gated by validation errors (FR-V5-46), `useCanvasValidation` integration, `fileInputRef` for import, `importError` state. | None |

**Documentation impact:** No README, API, or PRD changes needed. ARCHITECTURE.md V5 component tree update deferred to batch (useCanvasValidation.js added to deferred list). Inline comments in all new/modified files are accurate.

## V5 Wave 4 — Execution History + Templates + Version History (2026-04-06)

Full-stack changes. 6 new API endpoints, 2 new server stores, 3 new client panels, 6 modified files.

| File | Type | Change Summary | Doc Impact |
|------|------|----------------|------------|
| server/stores/ExecutionHistoryStore.js | NEW | Persists execution history per workflow to %APPDATA%/execution-history/<workflowId>.json. Max 100 entries, trimmed oldest. Path traversal prevention. Atomic writes. | API.md updated with 2 new endpoints |
| server/stores/TemplateStore.js | NEW | In-memory read-only store with 5 built-in templates: content-agency, code-review-chain, research-loop, customer-support-triage, data-pipeline. | API.md updated with 2 new endpoints |
| client/src/canvas/ExecutionHistory.jsx | NEW | Slide-in right panel showing past executions with status badges, relative time, duration, node count, expandable per-node snapshots. FR-V5-48. | ARCHITECTURE.md V5 component tree update deferred |
| client/src/canvas/TemplateGallery.jsx | NEW | Modal gallery with 2-column grid of template cards. "Use Template" instantiates via POST. FR-V5-51/52. | ARCHITECTURE.md V5 component tree update deferred |
| client/src/canvas/VersionHistory.jsx | NEW | Slide-out right panel with timeline UI, preview toggle, restore button. FR-V5-53/54/55. | ARCHITECTURE.md V5 component tree update deferred |
| server/services/WorkflowStore.js | MODIFIED | Added version history: _saveVersion() on update(), listVersions(), getVersion(), restoreVersion(). Max 50 versions per workflow. Versions stored in workflows/versions/<id>/. | API.md updated with 2 new endpoints |
| server/routes/swarm.js | MODIFIED | Added GET /history/:workflowId and GET /history/:workflowId/:executionId routes. Lazy-initialized ExecutionHistoryStore. | API.md updated |
| server/routes/workflows.js | MODIFIED | Added GET /templates, POST /templates/:templateId/instantiate, GET /:id/versions, POST /:id/versions/:timestamp/restore. TemplateStore instantiated at module level. | API.md updated |
| client/src/store/SwarmContext.jsx | MODIFIED | updateAgentState auto-tracks timestamps (started, done, error) for per-agent execution timing. | None |
| client/src/canvas/AgentInspector.jsx | MODIFIED | Added ExecutionInfo section with live timer: shows started time, running duration (auto-updates every second), and status. FR-V5-49/50. | None |
| client/src/views/SwarmView.jsx | MODIFIED | Added History, Templates, Versions toolbar buttons. Imports and renders ExecutionHistory, TemplateGallery, VersionHistory panels. showHistory/showTemplates/showVersions state. | None |

**Documentation impact:** README.md updated with 3 new features. API.md updated with 6 new endpoints (full request/response examples). ARCHITECTURE.md V5 component tree update deferred to batch (3 new components + 2 new stores added to deferred list). Inline comments in all new files are accurate with FR references and JSDoc.

## V5 Bugfix — Context Menu + Keyboard Shortcut Stale Closure (2026-04-06)

Frontend-only bugfixes. No new API endpoints, no env var changes, no backend changes, no new files. Two modified files.

| File | Type | Change Summary | Doc Impact |
|------|------|----------------|------------|
| client/src/canvas/SwarmCanvas.jsx | MODIFIED | Added `event.stopPropagation()` to `handleNodeContextMenu` and `handleEdgeContextMenu` — without it, right-clicking a node/edge also triggered the pane context menu handler, showing the wrong menu type (BUG-WF-1) | None |
| client/src/views/SwarmView.jsx | MODIFIED | Added `handleSaveFnRef` and `handleRunFnRef` refs. The `useEffect` keydown handler for Ctrl+S and Ctrl+Enter now calls `handleSaveFnRef.current?.()` and `handleRunFnRef.current?.()` instead of capturing `handleSave`/`handleRun` directly, preventing stale closure bugs where the shortcut used outdated state (BUG-WF-2) | None |

**Documentation impact:** None. Both fixes are internal event handling corrections with no new APIs, components, config, or env vars. Existing inline comments in SwarmView.jsx (FR-V5-43 refs at lines 117-124, 329-330) and SwarmCanvas.jsx (FR-V5-21 through FR-V5-24 refs at line 234) are accurate.

## Task #479 — BUG-BLOCKER-UI-02: Gemini Node Card Snippet Fix (2026-04-09)

Three surgical fixes in `server/services/SwarmEngine.js`. No new endpoints, components, config, or env vars.

| Fix | Location | Change | Doc Impact |
|-----|----------|--------|------------|
| Dingbat regex extension | `_normalizeSnippetLine()` | Leading-char strip regex now covers U+2700–U+27BF (Dingbat block) in addition to existing box-drawing and geometric shape ranges | None — internal snippet normalization |
| `provider_unavailable` clean message | `_handleRuntimeBlocker()` | When `blocker.type === 'provider_unavailable'`, `sanitizedExistingSnippet` is forced to `''` so the clean blocker message always wins; CLI banner noise (Gemini sign-in prompts, auth lines) can no longer bleed into the node card | None — internal blocker display logic |
| `pinnedDisplaySnippet` cleanup | `stopExecution()` | `state.pinnedDisplaySnippet = null` added to the agent-state cleanup loop, preventing a stale pinned snippet from appearing if the same node is reused after stop | None — internal state reset |

**Documentation impact:** No README, ARCHITECTURE, API, or PRD changes needed. All three changes are internal to private methods of `SwarmEngine.js`. Inline comments in `_handleRuntimeBlocker()` (lines 3829–3835) already explain the reasoning. Test suite: 501/501 passing, build: 507 modules clean.

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
| ~~docs/API.md V5 endpoints~~ | RESOLVED | V5 Wave 4 endpoints (execution history, templates, versions) documented in API.md on 2026-04-06. Agent discovery endpoint still pending future wave. |
| docs/ARCHITECTURE.md V5 components | Medium | V5 Waves 1-5 components implemented but not yet added to ARCHITECTURE.md component tree: ContextMenu.jsx, useCanvasHistory.js, sanitizeWorkflow.js, nodeIdGenerator.js, NodePalette.jsx, WorkflowSettingsModal.jsx, useCanvasValidation.js, ExecutionHistory.jsx, TemplateGallery.jsx, VersionHistory.jsx, ExecutionHistoryStore.js, TemplateStore.js, ChatExtractor.js, ChatPanel.jsx, ChatMessage.jsx, ConditionalNode.jsx, MergeNode.jsx, DelayNode.jsx, LoopNode.jsx, ErrorHandlerNode.jsx, SubWorkflowNode.jsx. All implemented; component tree diagram not yet updated. |
| ~~MEDIUM-V3-01 / BUG-API-1 (webhook CSRF mismatch)~~ | RESOLVED | Fixed in Task #234 (2026-04-06). CSRF_EXEMPT_PREFIXES array added to server/middleware/csrf.js. Security audit docs updated. |
| ~~BUG-PRD-1 through BUG-PRD-4 code fixes~~ | RESOLVED | All four bugs fixed in V3.1 wave (Tasks #124-#130). AREA CHECKPOINT #132 PASS confirmed. No remaining debt from this item. |

## POST-V5 FOLLOW-UP — AREA CLOSED (2026-04-07)

Task #330 (documentation and status truthfulness sync) completed. All stale claims fixed:

| Document | What was stale | What was fixed |
|----------|---------------|----------------|
| README.md | Version v3.0.0, 187/187 tests, 115 tasks | Updated to v5.0.0, 312/312 tests, 330 tasks (328 completed, 2 deferred), 498 modules. Added Unified Chat View, Advanced Flow Control Nodes, N8N-Style Editor features. Known Limitations section renamed to v5. |
| package.json | Version 3.0.0, description "187/187 tests, 115 tasks" | Version bumped to 5.0.0, description updated to current project summary |
| docs/memory/PROJECT.md | Last updated 2026-03-28, status said follow-up work active | Updated to 2026-04-07, all areas closed |
| docs/memory/CONTEXT.md | Focus said follow-up in progress, 2 tasks remaining | Updated to all areas closed, no remaining work |
| docs/memory/PROGRESS.md | No entry for POST-V5 area closure | Area closure entry prepended |
| docs/TASK_PLAN.md | Status header said 1 PENDING, POST-V5 IN PROGRESS | Updated to 0 PENDING, all areas closed, #330 COMPLETED |
| docs/memory/DOC_STATUS.md | README marked PARTIAL, release status said v3.0.0 187/187 | All updated to reflect v5.0.0, 312/312, all areas closed |

**Unified Chat View** documented for the first time in README features table:
- Server: `ChatExtractor.js` — noise-filters PTY output (40+ regex patterns for spinners, ANSI, CLI chrome, box drawing) and emits clean `chat_message` WS events with periodic 500ms flush
- Client: `ChatPanel.jsx` — conversation panel with per-agent filter dropdown; `ChatMessage.jsx` — role-styled message bubbles (assistant/system/user)
- Integration: `SwarmCanvas.jsx` Feed/Chat tab toggle in side panel; `SwarmContext.jsx` chatMessages/chatFilter/sidePanelMode state; `useSwarm.js` chat_message WS handler
