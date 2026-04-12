# Current Context
**Session date:** 2026-04-12
**Focus:** **VISUAL INPUT / OUTPUT BLOCKS - APPROVED PLAN DOCUMENTATION/REVIEW LANE.** The binding plan is `.omx/plans/prd-vio-20260412T121449Z.md` plus `.omx/plans/test-spec-vio-20260412T121449Z.md`. Worker-3 documented the current baseline and implementation guardrails in `docs/VISUAL_INPUT_OUTPUT_BLOCKS.md`.

**IMMEDIATE NEXT STEP:** Implementation lanes should add graph-derived effective contracts, Input/Output Extractor nodes, settings source-of-truth guards, run-scoped image assets, scoped prompt injection, extractor artifacts, and per-microwave gate evidence.

## Visual Input / Output Blocks Current Baseline (2026-04-12)

**Status:** APPROVED PLAN / DOCS REVIEW COMPLETE.

**Current baseline:** Root `inputContract` / `outputContract` workflow support exists and is verified from the previous workflow-as-heart wave. Visual `input` and `outputExtractor` node types are not yet implemented in this worktree.

**Key guardrails now documented:**
- Visual I/O nodes are the UX source of truth when present; root contracts are bridge/fallback.
- Input and Output Extractor nodes are non-executable graph nodes.
- `input -> agent` must not make the agent non-startable.
- Image fields require run-scoped asset metadata/reference, not raw base64 prompt injection.
- Extractor artifacts must use deterministic source policy and never silently fall back to unrelated aggregate final text.

---
# Current Context
**Session date:** 2026-04-12
**Focus:** **WORKFLOW AS HEART / PACK AS WRAPPER WAVE 1 - IMPLEMENTED/PASS.** Workflow now owns direct-run inputs, canonical outputs/artifacts, visible run I/O, and lightweight per-agent guidance while pack UI remains pack-authoritative for pack runs.

**IMMEDIATE NEXT STEP:** Ralph architect/deslop/final verification loop; no known failing automated test after server/client/build/Playwright verification.

## Workflow as Heart / Pack as Wrapper Wave 1 (2026-04-12)

**Status:** IMPLEMENTED / VERIFIED.

**Deliverables:**
- Workflow definitions persist `inputContract` and `outputContract` with legacy defaults.
- Direct workflow starts accept validated `workflowInput` and expose `workflowRun` / `workflowResult` through live status, results, and history.
- Swarm authoring gained an Interface tab, direct workflow run form, and visible workflow run I/O summary.
- Agent Inspector gained wave-1 guidance fields: `skillHints`, `contextSources`, `expectedOutput`.
- Runtime prompts include submitted workflow inputs, expected workflow outputs/artifacts, and agent guidance.
- Pack flows remain pack-authoritative; existing V17 pack smoke remains green.

**Verification:** server 667/667, client 93/93, client build 522 modules, workflow-heart Playwright PASS, V17 pack Playwright PASS, diagnostics 0 errors.

---# Current Context
**Session date:** 2026-04-11
**Focus:** **PACK BUILDER/RUNTIME IDENTITY + ARTIFACT VISIBILITY FOLLOW-UP - CLOSED/PASS.** Added explicit pack/workflow/execution handoff between Packs, Builder, and Swarm, plus readable artifact content in the pack run area.

**IMMEDIATE NEXT STEP:** Review/finalize the current branch state; no known pack builder drill-down or pack artifact visibility follow-up remains on `fixbug/check-and-fix-bugs`.

## Pack Builder / Runtime Identity + Artifact Visibility (2026-04-12)

**Status:** CLOSED / VERIFIED.

**Deliverables:**
- Pack Library now hands off explicit `packId` / `workflowId` / optional `executionId` when opening Builder.
- Pack Builder consumes one-shot navigation intent, preserves the intended pack, and writes execution context before drilling down into Swarm.
- Swarm consumes the drill-down intent, selects the intended workflow, and shows pack-origin drill-down context instead of silently defaulting.
- Pack Library now renders produced artifact content (markdown/text) with safe empty/fallback states instead of only `name + status`.

**Verification:**
- Targeted client navigation/artifact suites: **20/20 PASS**.
- Targeted Playwright smoke: **PASS**, covering Builder -> Library -> Launch plus artifact visibility and pack-origin builder context.
- Client build: **PASS**.
- Runtime diagnostics on touched files: **0 errors** (`tsc skipped: no tsconfig found` caveat).

## Pack Verification Drift + PackLibrary State Boundary (2026-04-11)

**Status:** CLOSED / VERIFIED.

**Deliverables:**
- The marketing-video deep/stress suite now uses current pack-start constraints (`ConfigStore.getProjects()` registration) and execution-backed fixture evaluation instead of synthetic result payloads.
- Added a targeted pack/version mismatch contract-edge test in `server/tests/pack-routes.test.js`.
- `PackLibraryView` now clears only pack-local launch state on pack change and scopes monitor/debug hydration to the selected pack instead of leaking another pack's runtime details.
- The Playwright follow-up smoke now exercises **Pack Builder -> save pack -> Pack Library -> launch -> output** with deterministic output/token verification.

**Verification:**
- Targeted server pack suites: **58/58 PASS**.
- Targeted client pack suites: **30/30 PASS**.
- Client build: **PASS**.
- Targeted Playwright smoke: **PASS**.
- Runtime diagnostics on touched files: **0 errors** (`tsc skipped: no tsconfig found` caveat).
## V17.8.1 Code Review Follow-up (2026-04-11)

**Status:** CLOSED / VERIFIED.

**Deliverables:**
- Closed the post-`fd40908` HIGH finding by invalidating fixture `lastResult` on `PackStore.update()` and requiring publish-time freshness/provenance against the current pack (`source`, `packId`, `packVersion`, valid `ranAt >= pack.updatedAt`, non-empty passed assertions).
- Hardened `saveFixtureResult()` so runner results require a result object, force `source: fixture-runner`, and receive server-side `ranAt` when missing.
- `importBundle()` now records rollback failure metadata when compensating workflow deletion returns `false` or throws, while preserving the original import error.
- PackLibrary clears stale launch errors when the selected pack changes.

**Verification:**
- Targeted server pack suites: **44/44 PASS**.
- Targeted PackLibrary suite: **4/4 PASS**.
- Full server suite: **647/647 PASS**.
- Full client suite: **77/77 PASS**.
- Client build: **520 modules PASS**, no Vite chunk-size warning.
- Targeted Playwright smoke: **PASS** (`npm run test:playwright:v17-review-followup`).
- `git diff --check`: **PASS**.
- Runtime diagnostics: **0 errors** on changed runtime files (`tsc skipped: no tsconfig found` caveat). Architect verification: **APPROVED**. Code review verification: **APPROVE**.

---

## V17.8 Code Review Fixes (2026-04-11)

**Status:** CLOSED / VERIFIED.

**Deliverables:**
- Pack import now rolls back a newly-created workflow if pack creation/validation fails after workflow import.
- Fixture assertions are type-specific and fail closed (`statusEquals`, `outputIncludes`, `artifactExists`), including persisted malformed assertions during runner/publish flows, missing artifact selector wildcard regressions, and forged/stale `lastResult` publish bypasses.
- PackLibrary launch failures show inline operator errors, prevent duplicate start clicks while launching, and clear stale pack runtime hydration on failed start.
- `PackStore.saveInstall()` rejects invalid/traversal install IDs with structured `400` before writing.
- Pack delete semantics are explicit: hard delete local pack definition, version snapshots, and fixtures while preserving install provenance records.
- Pack versions/publish routes now preserve known `statusCode` errors.
- Removed the temporary Vite `chunkSizeWarningLimit`; build remains warning-free.

**Verification:**
- Targeted server pack suites: **38/38 PASS**.
- Targeted PackLibrary suite: **3/3 PASS**.
- Full server suite: **641/641 PASS**.
- Full client suite: **76/76 PASS**.
- Client build: **520 modules PASS**, no Vite chunk-size warning.
- Targeted Playwright smoke: **PASS** (`npm run test:playwright:v17-review-followup`).
- `git diff --check`: **PASS**.

---

## Active Threads

## V17 Contract Notes
- The four product-critical authoring surfaces are:
  1. input schema
  2. knowledge/context injection
  3. prompt/behavior rules
  4. output schema + artifacts
- Pack/harness is authoritative for those four surfaces plus lifecycle/distribution.
- Workflow remains authoritative for graph topology/orchestration and advanced technical drill-down.
- Runtime precedence is explicit: project binding -> input validation -> workflow base context -> pack knowledge overlays -> pack behavior rules -> swarm execution -> output/artifact validation.

---
# Current Context
**Session date:** 2026-04-10
**Focus:** **V17.8.1 CODE REVIEW FOLLOW-UP - CLOSED/PASS.** Closed the post-`fd40908` review findings: stale fixture publish evidence after pack updates, import rollback delete failure visibility, PackLibrary selected-pack error reset, and `saveFixtureResult()` source hardening.

**IMMEDIATE NEXT STEP:** No V17.8.1 code follow-up remains after Lore commit/push; branch is ready for review/merge.

**V9.1 dependency wave map:**
  Wave 9.1: #400 (SDK contract spike) -> #401 (adapter foundation) -> #402 (SwarmEngine codex-sdk runtime) -> #403 (backend TEST GATE) + #404 (frontend contract) IN PARALLEL -> #405 (AREA CHECKPOINT)

**Dependency wave map:**
  Wave 0: #354 (spike) -> #355 (gate) -> #356 (checkpoint)
  Wave 1: #357 (StreamJsonParser) -> #358 (gate)
  Wave 2: #359 (_spawnAgentStreamJson) -> #360 (gate)
  Wave 3: #361 (dispatcher) + #363 (lifecycle) IN PARALLEL -> #362 + #364 (gates)
  Wave 4: #365 (tool config) -> #366 (gate) -> #367 (area checkpoint)
  Wave 5: #368 (store) -> #369 (gate) -> #370 (useSwarm) -> #371 (gate) -> #372+#374+#376+#378+#382 IN PARALLEL -> gates -> #383 (checkpoint) - completed
  Wave 6: #380 (spawnMode) -> #381 (gate) - completed in parallel with Wave 5
  Wave 7: #384+#385+#386 IN PARALLEL -> #387 -> #388 (gate) - completed
  Wave 8: #389 (E2E) -> #390 (gate) -> #391 (docs) -> #392 (gate) -> #393 (final) - completed/closed
  Debugger-loop follow-up: #394 (fallback coherence bug) -> #395 (gate) -> #396 (checkpoint)

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- V12.1 Canvas Node Overlap Fix Ã¢â‚¬â€ #536-#538 COMPLETED, #539 (area checkpoint) PENDING.
- V11.4 Output Panel Rendering Parity Ã¢â‚¬â€ IN PROGRESS (#540-#544).
- V11.3 HITL Runtime Trigger Ã¢â‚¬â€ PENDING (#521-#527, 7 tasks, none started).
- V11.2 Cost & Token Detail Visibility Ã¢â‚¬â€ PENDING (#517-#520, 4 tasks).
- Build status: 507 modules, 0 errors. Server: 513/513 tests.

## Open Questions (V3 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â for Architect)
1. Scaffold AI model: which model for POST /api/v1/swarm/scaffold?
2. Workflow-to-project binding: strict per-project or global?
3. Agent PTY CWD: inherit project path or separate configurable CWD?
4. RSS authentication: clear error or silent skip for auth-gated feeds?
5. Zustand version: v4 or v5? (breaking API change between them)
6. swarmListeners Set: needs non-destructive addition to SessionManager (V2 file) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â architect must specify contract carefully to avoid breaking V2 tests.

## Notes for Architect
- Read PRD Section 11 (Open Questions) before designing SwarmEngine/SessionManager integration.
- The swarmListeners tap point (Q6) is the most critical V2ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬ÂV3 bridge ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â any change to SessionManager must not remove the permanent pty.onData handler (DEC-009).

## What Changed in Phase 10

### Backend (2 files modified)
- **security.js**: CSP `fontSrc` and `styleSrc` updated to allow Google Fonts CDN
- **JobRunner.js**: `child.on('error')` handler + `child.stdin.end()` try-catch

### Frontend (5 files modified)
- **Sidebar.jsx**: `creatingSessionRef` race lock, `sessionError` feedback, dynamic version via API, logo `overflow-hidden`, settings icon de-interactivized
- **Terminal.jsx**: Background color `#1a1a1a` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ `#000000`
- **ContextEditorView.jsx**: `handleScopeSwitch` with `window.confirm` guard
- **ProjectsView.jsx**: `modalMode` state, `focus:opacity-100` on three-dot menu
- **AddProjectModal.jsx**: `mode` prop for differentiated titles (Register/Scaffold)

## V3 Security Assessment Notes (for prd-writer)
Security assessment completed 2026-03-27. Seven mandatory requirements must appear in the V3 PRD as SEC-V3-01 through SEC-V3-07:
1. Webhook body size cap (32 KB max), no raw body passthrough to PTY
2. WorkflowDefinition schema validation + systemPrompt size cap (16 KB) before any spawn
3. SSRF prevention on RSS/webhook URLs ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â private IP blocklist (127.x, 10.x, 172.16-31.x, 192.168.x, ::1)
4. Stricter rate limiter on webhook endpoint (separate from main 200 req/min limiter)
5. HITL resume text size cap (8 KB max)
6. Workflow name/description length caps + character whitelist server-side
7. HandoffParser 4 KB flush buffer must never be passed to writeInput without sanitization

## Notes for TASK #41 (Regression QA)
- Verify all 11 bugs from bug_report.md are resolved
- Run `npm test` (110 tests should pass)
- Run `npm run build` (299 modules, 0 errors)
- Browser test: icons render as glyphs, terminal bg is black, scope switch prompts

---
## Update 2026-03-27 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â V3 Phase 1 Backend Foundation COMPLETE

**Focus:** **V17.8.1 CODE REVIEW FOLLOW-UP - CLOSED/PASS.** Closed the post-`fd40908` review findings: stale fixture publish evidence after pack updates, import rollback delete failure visibility, PackLibrary selected-pack error reset, and `saveFixtureResult()` source hardening.

**Completed (Phase 1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â all 11 tasks):**
#43, #44, #45, #46.1, #46.2, #46.3, #47.1, #47.2, #48.1, #48.2, #49 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 132/132 tests pass throughout.

**Phase 1 deliverables:**
- WorkflowStore.js (CRUD + persistence)
- workflows.js REST routes (mounted at /api/v1/workflows)
- HandoffParser.js (rolling 4KB accumulator)
- SwarmEngine.js (full: skeleton + startExecution + _spawnAgentPty + _buildSystemPrompt + _startHeartbeat)
- swarm.js REST routes (7 execution control endpoints + scaffold stub at /api/v1/swarm)
- swarmHandler.js (channel routing + connection management + broadcast() + WS event wiring)
- CircuitBreaker.js + BudgetTracker.js

**#53.1 + #53.2 + #53.3 COMPLETED ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â build passes.**

**Wave 2 COMPLETE (2026-03-27):**
- TASK #54 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â HandoffEdge.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED
- TASK #55 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â AgentInspector.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED
- TASK #56 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â BreadcrumbBar.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED

**#57.1 COMPLETED (concurrent agent, 2026-03-27):**
- TASK #57.1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SwarmCanvas.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (frontend-dev self-marked; PROGRESS.md at 27/57)

**Phase 2 (Canvas Static) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ALL COMPLETE (2026-03-27):**
- #51ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“#58 ALL COMPLETED. Build: 470 modules, 0 errors. 168/168 tests pass.

**Current wave ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â V3 Phase 3 Prompt-to-Flow (2026-03-27):**
- TASK #59 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â POST /api/v1/swarm/scaffold ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (2026-03-27)
  - generateWorkflowFromPrompt() implemented with @anthropic-ai/sdk (claude-haiku-4-5-20251001)
  - WorkflowStore.create() called on success; 168/168 tests pass
  - 201 on success, 422 on parse fail, 408 on 60s timeout; raw prompt never logged

- TASK #61 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â useWorkflow.js ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (2026-03-27)
  - client/src/hooks/useWorkflow.js created; useWorkflow(id) + useWorkflowList() exports
  - Uses apiGet/apiPut/apiDelete/apiPost wrappers with X-Requested-With header; build: 470 modules, 0 errors

**Phase 3 COMPLETE ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Phase 4 (Live Execution) NOW ACTIVE (2026-03-27):**
- TASK #60 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PromptToFlowBar.jsx + staggered animation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (build: 471 modules)
- TASK #59 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â scaffold endpoint ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED
- TASK #61 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â useWorkflow.js ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED
- Phase 3 (Prompt-to-Flow) FULLY DONE. 33/57 V3 tasks complete.

**Current wave ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â V3 Phase 4 Live Execution (updated 2026-03-27):**

PHASE 4 COMPLETED (39/57 V3 tasks):
- TASK #62.1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SwarmEngine _onHandoff steps 1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“4 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (168/168 tests pass)
- TASK #63 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â useSwarm.js WS hook ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (build: 472 modules)
- TASK #64 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â useHandoff.js edge animation hook ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED
- TASK #65 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â AgentNode.jsx live updates ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED
- TASK #66 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â BroadcastBar.jsx + broadcast route ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (build: 472 modules)
- TASK #67 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SwarmEngine heartbeat idle sweeper prevention ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â COMPLETED (168 tests pass)

CURRENT WAVE ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Phase 4 continuation + Phase 5 (2026-03-27):

Launching simultaneously (all deps met):
- TASK #62.2 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SwarmEngine _onHandoff steps 5ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“6: context injection + agent status ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â IN_PROGRESS
  - Agent: backend-dev, Model: claude-opus-4-6, Difficulty: HARD, Deps: #62.1 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“
  - File: server/services/SwarmEngine.js
  - Implement: _getHandoffTargets(), _onHandoff steps 5ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“6 (_buildSystemPrompt ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ writeInput, source 'done' + target 'running', 3 WS events)
  - Also add helper _getHandoffTargets(workflowDef, nodeId): array of target node IDs from edges where source === nodeId
- TASK #68 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â inbox.js HITL approve/reject API ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â IN_PROGRESS
  - Agent: backend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #46.3 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ (corrected from #62.3)
  - File: server/routes/inbox.js ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 4 endpoints: GET /inbox, GET /inbox/:executionId, POST /inbox/:itemId/approve, POST /inbox/:itemId/reject
  - ApproveInboxItem: validate resumeText ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¤ 8192 chars, unfreeze edge if circuit_breaker, write to PTY
- TASK #70 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SwarmEngine freeze/unfreeze agent ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â IN_PROGRESS
  - Agent: backend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #62.1 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“
  - File: server/services/SwarmEngine.js ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â add freezeAgent(executionId, nodeId, reason) + unfreezeAgent(executionId, nodeId, resumeText)
  - HITL mode: on handoff create InboxItem + freeze source, don't spawn target until approved
- TASK #71.1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PTY Explosion overlay ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â IN_PROGRESS
  - Agent: frontend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #58 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ (#57.2+#63 both done)
  - File: client/src/views/SwarmView.jsx (modify) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â add pty-explosion-overlay using existing Terminal.jsx
  - Add ptyExplosionNodeId/setPtyExplosionNodeId to SwarmStore if not present from #52
- TASK #72 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â InterAgentFeed.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â IN_PROGRESS
  - Agent: frontend-dev, Model: claude-haiku-4-5, Difficulty: EASY, Deps: #52 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ + #63 ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“
  - File: client/src/panels/InterAgentFeed.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â scrolling log of [HH:MM:SS] AgentA ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ AgentB events
  - Data from useSwarmStore(s => s.interAgentFeed), last 100 events, auto-scroll

NEXT AFTER CURRENT WAVE:
- #62.3 waits on #62.2 (SwarmEngine _onDone + BudgetTracker ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â backend-dev, sonnet)
- #69 waits on #68 (HitlInbox.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â frontend-dev, sonnet)
- #71.2 waits on #71.1 (PTY Explosion Escape key ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â frontend-dev, haiku)
- #65 still PENDING if not yet done ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â AgentNode.jsx live updates (frontend-dev, sonnet)

**Key context for #53.x agents:**
- SwarmContext.jsx is at client/src/store/SwarmContext.jsx ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â complete, exports useSwarmStore + SwarmProvider
- Use: `useSwarmStore(s => s.agentStates[nodeId])` pattern for per-node subscriptions (DEC-V3-04)
- ALL setNodes calls MUST use immutable spread: `{ ...node, data: { ...node.data } }` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â React Flow v12
- NEVER mutate node objects in place
- Execution state (status, counters) MUST live in Zustand, NOT in node.data
- For DepartmentNode: parent nodes MUST appear BEFORE their children in the nodes array
- Build command: `cd client && npm run build` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â must stay at 299+ modules, 0 errors
- File locations: client/src/canvas/nodes/AgentNode.jsx, DepartmentNode.jsx, TriggerNode.jsx

**Key context for #47.1 and #48.1 agents:**
- SwarmEngine.js is at server/services/SwarmEngine.js ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â complete, all methods implemented, 132 tests pass
- SessionManager.js has swarmListeners Set wired (DEC-014) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â never touch the onData handler
- Look at server/routes/sessions.js and server/routes/jobs.js for Express router pattern
- server/ws/terminalHandler.js for WebSocket handler pattern (do NOT break it for #48.1)
- All mutating endpoints require CSRF header: X-Requested-With: ClaudeCodeManager
- CircuitBreaker.js + BudgetTracker.js exist in server/services/ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â used by SwarmEngine internally

**V3 Key Decisions (for all agents):**
- DEC-V3-01: HandoffParser uses rolling 4KB byte accumulator (NOT line-by-line) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ConPTY splits tokens
- DEC-V3-02: PTY injection: soft=queue, hard=\x03+300ms+text+Escape+100ms+Enter (unreliable during tool calls)
- DEC-V3-03: SwarmEngine taps via session.swarmListeners Set ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â primary onData NEVER removed (DEC-009)
- DEC-V3-04: React Flow canvas state SEPARATE from Zustand ExecutionStore ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â never mix them
- DEC-V3-05: WorkflowContext = flat dict, shallow merge on each handoff (OpenAI Swarm pattern)
- Canvas always editable during execution (no lock)
- __DONE__ = soft notify only, workflow never auto-stops
- Budget = soft warn only, never stops
- HITL = human can chat at dept + agent level; PTY Explosion for direct terminal

**Blocking V3 start:** TASK #41 is COMPLETED. All V2 tasks done. V3 can begin immediately.

**First wave (Phase 1):** #43, #45 can run in parallel (WorkflowStore + HandoffParser have no deps on each other). #46 waits for #43+#45. #47 waits for #46. #48 waits for #46. #49 waits for #46.
