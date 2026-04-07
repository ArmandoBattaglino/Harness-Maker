# Documentation Status
_Last updated: 2026-04-07 after Task #327 (ExecutionHistoryStore wiring into SwarmEngine) and Task #329 (Unified Chat View E2E verification)._

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

## Fixed Bugs (post-v3.0.0 — latest additions)

| ID | Severity | Description | Task | Status |
|----|----------|-------------|------|--------|
| BUG-DONE-TOKEN-REPLAY-1 | LOW | `sanitizeReplayOutput()` did not filter done-token recovery prompts injected when agent finishes without emitting __DONE__ — 3 patterns added to REPLAY_NOISE_LINE_PATTERNS | #233 | FIXED 2026-04-06 |
| BUG-SWARM-UI-1 | LOW | Duplicate workflow names in saved workflows dropdown — name-based deduplication + date suffix added to SwarmView.jsx | #242 | FIXED 2026-04-06 |
| BUG-DONE-BARE-1 | LOW | `DONE_RE` only matched `__DONE__` — bare `DONE` on its own line now also accepted by HandoffParser, eliminating unnecessary done reminder reinject | #254 | FIXED 2026-04-06 |
| BUG-SNIPPET-INIT-1 | LOW | Agent card showed system prompt text for ~3s during startup — snippet update now gated by echo gate (`ignoreParserUntil`) in SwarmEngine.js tapFn | #255 | FIXED 2026-04-06 |
| BUG-WF-1 | LOW | Context menu on node/edge right-click showed wrong menu type (canvas menu instead of node/edge menu) — `event.stopPropagation()` missing in `handleNodeContextMenu` and `handleEdgeContextMenu` in SwarmCanvas.jsx | V5-bugfix | FIXED 2026-04-06 |
| BUG-WF-2 | LOW | Ctrl+S keyboard shortcut in SwarmView.jsx captured stale closure of `handleSave`/`handleRun` — added `handleSaveFnRef` and `handleRunFnRef` refs so `useEffect` keydown handler always calls the latest function | V5-bugfix | FIXED 2026-04-06 |

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | PARTIAL | 2026-04-07 | Feature list is broadly useful, but the top-level task/test counts are stale (`187/187`, `115 tasks`) and do not reflect the reopened follow-up area. |
| docs/ARCHITECTURE.md | PARTIAL | 2026-04-07 | Section 11.8 dependency graph updated: SwarmEngine now lists ExecutionHistoryStore as setter-injected dependency, _persistExecutionHistory method documented. V5 Wave 1-4 new UI components still deferred for batch update. |
| docs/PRD.md | UP_TO_DATE | 2026-04-06 | Version bumped to v5.0 with N8N-Style Visual Workflow Editor addendum (81 FRs, 5 waves, 6 new node types, 5 new SEC requirements). |
| docs/API.md | UP_TO_DATE | 2026-04-06 | V5 Wave 4 endpoints added: execution history (2), templates (2), versions (2). All 6 new endpoints documented with full request/response examples. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-04-07 | Implementation status corrected during PM audit to reflect that post-V5 follow-up work is open. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-04-03 | DEC-001 through DEC-026 — no new architectural decisions from V5.0 bug fixes. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-04-07 | PM updated with Task #327/#329 completion status. |
| docs/memory/CONTEXT.md | UP_TO_DATE | 2026-04-06 | Focus updated to reflect V5 Wave 4 completion. All areas CLOSED. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-04-07 | PM audit entry appended/prepended for follow-up reopening. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-04-06 | V1 audit. SEC-06 entry updated with webhook CSRF exemption note (Task #234). |
| docs/security-v3-audit.md | UP_TO_DATE | 2026-04-06 | MEDIUM-V3-01 marked FIXED (Task #234). Summary table updated. |
| Inline comments | UP_TO_DATE | 2026-04-07 | Task #327: SwarmEngine new methods have JSDoc (setExecutionHistoryStore, _persistExecutionHistory). All inline comments verified accurate. |
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
| BUG-SWARM-UI-1 | LOW | client/src/views/SwarmView.jsx | Duplicate workflow names in dropdown — name-based dedup + date suffix | #242 | FIXED 2026-04-06 |

**Overall assessment:** AREA CLOSED. All 5 bugs fixed. TEST GATE #243 PASS confirmed fixes #238-#241. Task #242 fixed the deferred cosmetic bug (BUG-SWARM-UI-1). Zero remaining bugs.

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
| docs/ARCHITECTURE.md V5 components | Medium | V5 Waves 1-4 components implemented but not yet added to ARCHITECTURE.md component tree: ContextMenu.jsx, useCanvasHistory.js, sanitizeWorkflow.js, nodeIdGenerator.js, NodePalette.jsx, WorkflowSettingsModal.jsx, useCanvasValidation.js, ExecutionHistory.jsx, TemplateGallery.jsx, VersionHistory.jsx, ExecutionHistoryStore.js, TemplateStore.js. Remaining unimplemented: EdgeInspector, WorkflowToolbar, new node types. Update component tree once full V5 is complete. |
| ~~MEDIUM-V3-01 / BUG-API-1 (webhook CSRF mismatch)~~ | RESOLVED | Fixed in Task #234 (2026-04-06). CSRF_EXEMPT_PREFIXES array added to server/middleware/csrf.js. Security audit docs updated. |
| ~~BUG-PRD-1 through BUG-PRD-4 code fixes~~ | RESOLVED | All four bugs fixed in V3.1 wave (Tasks #124-#130). AREA CHECKPOINT #132 PASS confirmed. No remaining debt from this item. |
