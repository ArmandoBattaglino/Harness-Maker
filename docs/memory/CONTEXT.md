# Current Context
**Session date:** 2026-04-11
**Focus:** **V17.4 PACK BUILDER AUTHORING PLATFORM - CLOSED.** The app now has a routable guided Pack Builder that authors the pack-owned contract surfaces while keeping SwarmView as workflow drill-down. Server lifecycle rules block direct edits to published/deprecated/archived packs.

**IMMEDIATE NEXT STEP:** Start **V17.5 Pack Operator Product Surface**. Add pack library/detail/run views, generated run form, monitoring, debug drawer, restoration selectors, and explicit project-binding UX.

## Active Threads
- V17.5 Pack Operator Product Surface — PENDING (#654-#661), now explicitly includes project-binding UX
- V17.6 Pack Distribution & Installation — PENDING (#662-#669)
- V17.7 Pack Fixtures & Release Gates — PENDING (#670-#676)

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
**Focus:** **V12.0 FAN-IN WORKFLOW FIX — CLOSED.** V11.0 AGENT INTELLIGENCE REENGINEERING — CLOSED. V11.1 REPETITIVE HANDOFF LOOP DETECTION — CLOSED. All implementation committed to git on 2026-04-10. Baseline: **513/513** server tests; client build **507** modules.

**IMMEDIATE NEXT STEP:** Three active areas remain in `docs/TASK_PLAN.md`: V12.1 Canvas Node Overlap Fix (#536-#539, only checkpoint #539 PENDING), V11.4 Output Panel Rendering Parity (#540-#544, IN PROGRESS), V11.3 HITL Runtime Trigger (#521-#527, all PENDING), and V11.2 Cost & Token Detail Visibility (#517-#520, all PENDING). Close V12.1 first (run checkpoint), then pick from V11.2/V11.3/V11.4.

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
- V12.1 Canvas Node Overlap Fix — #536-#538 COMPLETED, #539 (area checkpoint) PENDING.
- V11.4 Output Panel Rendering Parity — IN PROGRESS (#540-#544).
- V11.3 HITL Runtime Trigger — PENDING (#521-#527, 7 tasks, none started).
- V11.2 Cost & Token Detail Visibility — PENDING (#517-#520, 4 tasks).
- Build status: 507 modules, 0 errors. Server: 513/513 tests.

## Open Questions (V3 â€” for Architect)
1. Scaffold AI model: which model for POST /api/v1/swarm/scaffold?
2. Workflow-to-project binding: strict per-project or global?
3. Agent PTY CWD: inherit project path or separate configurable CWD?
4. RSS authentication: clear error or silent skip for auth-gated feeds?
5. Zustand version: v4 or v5? (breaking API change between them)
6. swarmListeners Set: needs non-destructive addition to SessionManager (V2 file) â€” architect must specify contract carefully to avoid breaking V2 tests.

## Notes for Architect
- Read PRD Section 11 (Open Questions) before designing SwarmEngine/SessionManager integration.
- The swarmListeners tap point (Q6) is the most critical V2â†”V3 bridge â€” any change to SessionManager must not remove the permanent pty.onData handler (DEC-009).

## What Changed in Phase 10

### Backend (2 files modified)
- **security.js**: CSP `fontSrc` and `styleSrc` updated to allow Google Fonts CDN
- **JobRunner.js**: `child.on('error')` handler + `child.stdin.end()` try-catch

### Frontend (5 files modified)
- **Sidebar.jsx**: `creatingSessionRef` race lock, `sessionError` feedback, dynamic version via API, logo `overflow-hidden`, settings icon de-interactivized
- **Terminal.jsx**: Background color `#1a1a1a` â†’ `#000000`
- **ContextEditorView.jsx**: `handleScopeSwitch` with `window.confirm` guard
- **ProjectsView.jsx**: `modalMode` state, `focus:opacity-100` on three-dot menu
- **AddProjectModal.jsx**: `mode` prop for differentiated titles (Register/Scaffold)

## V3 Security Assessment Notes (for prd-writer)
Security assessment completed 2026-03-27. Seven mandatory requirements must appear in the V3 PRD as SEC-V3-01 through SEC-V3-07:
1. Webhook body size cap (32 KB max), no raw body passthrough to PTY
2. WorkflowDefinition schema validation + systemPrompt size cap (16 KB) before any spawn
3. SSRF prevention on RSS/webhook URLs â€” private IP blocklist (127.x, 10.x, 172.16-31.x, 192.168.x, ::1)
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
## Update 2026-03-27 â€” V3 Phase 1 Backend Foundation COMPLETE

**Focus:** V3 Swarm Orchestrator â€” Phase 1 Backend Foundation ALL DONE (11/57 tasks).

**Completed (Phase 1 â€” all 11 tasks):**
#43, #44, #45, #46.1, #46.2, #46.3, #47.1, #47.2, #48.1, #48.2, #49 â€” 132/132 tests pass throughout.

**Phase 1 deliverables:**
- WorkflowStore.js (CRUD + persistence)
- workflows.js REST routes (mounted at /api/v1/workflows)
- HandoffParser.js (rolling 4KB accumulator)
- SwarmEngine.js (full: skeleton + startExecution + _spawnAgentPty + _buildSystemPrompt + _startHeartbeat)
- swarm.js REST routes (7 execution control endpoints + scaffold stub at /api/v1/swarm)
- swarmHandler.js (channel routing + connection management + broadcast() + WS event wiring)
- CircuitBreaker.js + BudgetTracker.js

**#53.1 + #53.2 + #53.3 COMPLETED â€” build passes.**

**Wave 2 COMPLETE (2026-03-27):**
- TASK #54 â€” HandoffEdge.jsx â€” COMPLETED
- TASK #55 â€” AgentInspector.jsx â€” COMPLETED
- TASK #56 â€” BreadcrumbBar.jsx â€” COMPLETED

**#57.1 COMPLETED (concurrent agent, 2026-03-27):**
- TASK #57.1 â€” SwarmCanvas.jsx â€” COMPLETED (frontend-dev self-marked; PROGRESS.md at 27/57)

**Phase 2 (Canvas Static) â€” ALL COMPLETE (2026-03-27):**
- #51â€“#58 ALL COMPLETED. Build: 470 modules, 0 errors. 168/168 tests pass.

**Current wave â€” V3 Phase 3 Prompt-to-Flow (2026-03-27):**
- TASK #59 â€” POST /api/v1/swarm/scaffold â€” COMPLETED (2026-03-27)
  - generateWorkflowFromPrompt() implemented with @anthropic-ai/sdk (claude-haiku-4-5-20251001)
  - WorkflowStore.create() called on success; 168/168 tests pass
  - 201 on success, 422 on parse fail, 408 on 60s timeout; raw prompt never logged

- TASK #61 â€” useWorkflow.js â€” COMPLETED (2026-03-27)
  - client/src/hooks/useWorkflow.js created; useWorkflow(id) + useWorkflowList() exports
  - Uses apiGet/apiPut/apiDelete/apiPost wrappers with X-Requested-With header; build: 470 modules, 0 errors

**Phase 3 COMPLETE â€” Phase 4 (Live Execution) NOW ACTIVE (2026-03-27):**
- TASK #60 â€” PromptToFlowBar.jsx + staggered animation â€” COMPLETED (build: 471 modules)
- TASK #59 â€” scaffold endpoint â€” COMPLETED
- TASK #61 â€” useWorkflow.js â€” COMPLETED
- Phase 3 (Prompt-to-Flow) FULLY DONE. 33/57 V3 tasks complete.

**Current wave â€” V3 Phase 4 Live Execution (updated 2026-03-27):**

PHASE 4 COMPLETED (39/57 V3 tasks):
- TASK #62.1 â€” SwarmEngine _onHandoff steps 1â€“4 â€” COMPLETED (168/168 tests pass)
- TASK #63 â€” useSwarm.js WS hook â€” COMPLETED (build: 472 modules)
- TASK #64 â€” useHandoff.js edge animation hook â€” COMPLETED
- TASK #65 â€” AgentNode.jsx live updates â€” COMPLETED
- TASK #66 â€” BroadcastBar.jsx + broadcast route â€” COMPLETED (build: 472 modules)
- TASK #67 â€” SwarmEngine heartbeat idle sweeper prevention â€” COMPLETED (168 tests pass)

CURRENT WAVE â€” Phase 4 continuation + Phase 5 (2026-03-27):

Launching simultaneously (all deps met):
- TASK #62.2 â€” SwarmEngine _onHandoff steps 5â€“6: context injection + agent status â€” IN_PROGRESS
  - Agent: backend-dev, Model: claude-opus-4-6, Difficulty: HARD, Deps: #62.1 âœ“
  - File: server/services/SwarmEngine.js
  - Implement: _getHandoffTargets(), _onHandoff steps 5â€“6 (_buildSystemPrompt â†’ writeInput, source 'done' + target 'running', 3 WS events)
  - Also add helper _getHandoffTargets(workflowDef, nodeId): array of target node IDs from edges where source === nodeId
- TASK #68 â€” inbox.js HITL approve/reject API â€” IN_PROGRESS
  - Agent: backend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #46.3 âœ“ (corrected from #62.3)
  - File: server/routes/inbox.js â€” 4 endpoints: GET /inbox, GET /inbox/:executionId, POST /inbox/:itemId/approve, POST /inbox/:itemId/reject
  - ApproveInboxItem: validate resumeText â‰¤ 8192 chars, unfreeze edge if circuit_breaker, write to PTY
- TASK #70 â€” SwarmEngine freeze/unfreeze agent â€” IN_PROGRESS
  - Agent: backend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #62.1 âœ“
  - File: server/services/SwarmEngine.js â€” add freezeAgent(executionId, nodeId, reason) + unfreezeAgent(executionId, nodeId, resumeText)
  - HITL mode: on handoff create InboxItem + freeze source, don't spawn target until approved
- TASK #71.1 â€” PTY Explosion overlay â€” IN_PROGRESS
  - Agent: frontend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #58 âœ“ (#57.2+#63 both done)
  - File: client/src/views/SwarmView.jsx (modify) â€” add pty-explosion-overlay using existing Terminal.jsx
  - Add ptyExplosionNodeId/setPtyExplosionNodeId to SwarmStore if not present from #52
- TASK #72 â€” InterAgentFeed.jsx â€” IN_PROGRESS
  - Agent: frontend-dev, Model: claude-haiku-4-5, Difficulty: EASY, Deps: #52 âœ“ + #63 âœ“
  - File: client/src/panels/InterAgentFeed.jsx â€” scrolling log of [HH:MM:SS] AgentA â†’ AgentB events
  - Data from useSwarmStore(s => s.interAgentFeed), last 100 events, auto-scroll

NEXT AFTER CURRENT WAVE:
- #62.3 waits on #62.2 (SwarmEngine _onDone + BudgetTracker â€” backend-dev, sonnet)
- #69 waits on #68 (HitlInbox.jsx â€” frontend-dev, sonnet)
- #71.2 waits on #71.1 (PTY Explosion Escape key â€” frontend-dev, haiku)
- #65 still PENDING if not yet done â€” AgentNode.jsx live updates (frontend-dev, sonnet)

**Key context for #53.x agents:**
- SwarmContext.jsx is at client/src/store/SwarmContext.jsx â€” complete, exports useSwarmStore + SwarmProvider
- Use: `useSwarmStore(s => s.agentStates[nodeId])` pattern for per-node subscriptions (DEC-V3-04)
- ALL setNodes calls MUST use immutable spread: `{ ...node, data: { ...node.data } }` â€” React Flow v12
- NEVER mutate node objects in place
- Execution state (status, counters) MUST live in Zustand, NOT in node.data
- For DepartmentNode: parent nodes MUST appear BEFORE their children in the nodes array
- Build command: `cd client && npm run build` â€” must stay at 299+ modules, 0 errors
- File locations: client/src/canvas/nodes/AgentNode.jsx, DepartmentNode.jsx, TriggerNode.jsx

**Key context for #47.1 and #48.1 agents:**
- SwarmEngine.js is at server/services/SwarmEngine.js â€” complete, all methods implemented, 132 tests pass
- SessionManager.js has swarmListeners Set wired (DEC-014) â€” never touch the onData handler
- Look at server/routes/sessions.js and server/routes/jobs.js for Express router pattern
- server/ws/terminalHandler.js for WebSocket handler pattern (do NOT break it for #48.1)
- All mutating endpoints require CSRF header: X-Requested-With: ClaudeCodeManager
- CircuitBreaker.js + BudgetTracker.js exist in server/services/ â€” used by SwarmEngine internally

**V3 Key Decisions (for all agents):**
- DEC-V3-01: HandoffParser uses rolling 4KB byte accumulator (NOT line-by-line) â€” ConPTY splits tokens
- DEC-V3-02: PTY injection: soft=queue, hard=\x03+300ms+text+Escape+100ms+Enter (unreliable during tool calls)
- DEC-V3-03: SwarmEngine taps via session.swarmListeners Set â€” primary onData NEVER removed (DEC-009)
- DEC-V3-04: React Flow canvas state SEPARATE from Zustand ExecutionStore â€” never mix them
- DEC-V3-05: WorkflowContext = flat dict, shallow merge on each handoff (OpenAI Swarm pattern)
- Canvas always editable during execution (no lock)
- __DONE__ = soft notify only, workflow never auto-stops
- Budget = soft warn only, never stops
- HITL = human can chat at dept + agent level; PTY Explosion for direct terminal

**Blocking V3 start:** TASK #41 is COMPLETED. All V2 tasks done. V3 can begin immediately.

**First wave (Phase 1):** #43, #45 can run in parallel (WorkflowStore + HandoffParser have no deps on each other). #46 waits for #43+#45. #47 waits for #46. #48 waits for #46. #49 waits for #46.

