# Current Context
**Session date:** 2026-03-30
**Focus:** V3 Planning — Multi-Agent Swarm Orchestrator PRD written. Next: V3 task planning and architecture.

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- V3 PRD COMPLETE (docs/PRD.md, version 3.0, 2026-03-27). Ready for V3 task planning.
- V2 is RELEASE READY (31 tasks, all COMPLETED). TASK #41 (regression QA) still pending for Phase 10.
- Build status: 299 modules, 0 errors.

## Open Questions (V3 — for Architect)
1. Scaffold AI model: which model for POST /api/v1/swarm/scaffold?
2. Workflow-to-project binding: strict per-project or global?
3. Agent PTY CWD: inherit project path or separate configurable CWD?
4. RSS authentication: clear error or silent skip for auth-gated feeds?
5. Zustand version: v4 or v5? (breaking API change between them)
6. swarmListeners Set: needs non-destructive addition to SessionManager (V2 file) — architect must specify contract carefully to avoid breaking V2 tests.

## Notes for Architect
- Read PRD Section 11 (Open Questions) before designing SwarmEngine/SessionManager integration.
- The swarmListeners tap point (Q6) is the most critical V2↔V3 bridge — any change to SessionManager must not remove the permanent pty.onData handler (DEC-009).

## What Changed in Phase 10

### Backend (2 files modified)
- **security.js**: CSP `fontSrc` and `styleSrc` updated to allow Google Fonts CDN
- **JobRunner.js**: `child.on('error')` handler + `child.stdin.end()` try-catch

### Frontend (5 files modified)
- **Sidebar.jsx**: `creatingSessionRef` race lock, `sessionError` feedback, dynamic version via API, logo `overflow-hidden`, settings icon de-interactivized
- **Terminal.jsx**: Background color `#1a1a1a` → `#000000`
- **ContextEditorView.jsx**: `handleScopeSwitch` with `window.confirm` guard
- **ProjectsView.jsx**: `modalMode` state, `focus:opacity-100` on three-dot menu
- **AddProjectModal.jsx**: `mode` prop for differentiated titles (Register/Scaffold)

## V3 Security Assessment Notes (for prd-writer)
Security assessment completed 2026-03-27. Seven mandatory requirements must appear in the V3 PRD as SEC-V3-01 through SEC-V3-07:
1. Webhook body size cap (32 KB max), no raw body passthrough to PTY
2. WorkflowDefinition schema validation + systemPrompt size cap (16 KB) before any spawn
3. SSRF prevention on RSS/webhook URLs — private IP blocklist (127.x, 10.x, 172.16-31.x, 192.168.x, ::1)
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
## Update 2026-03-27 — V3 Phase 1 Backend Foundation COMPLETE

**Focus:** V3 Swarm Orchestrator — Phase 1 Backend Foundation ALL DONE (11/57 tasks).

**Completed (Phase 1 — all 11 tasks):**
#43, #44, #45, #46.1, #46.2, #46.3, #47.1, #47.2, #48.1, #48.2, #49 — 132/132 tests pass throughout.

**Phase 1 deliverables:**
- WorkflowStore.js (CRUD + persistence)
- workflows.js REST routes (mounted at /api/v1/workflows)
- HandoffParser.js (rolling 4KB accumulator)
- SwarmEngine.js (full: skeleton + startExecution + _spawnAgentPty + _buildSystemPrompt + _startHeartbeat)
- swarm.js REST routes (7 execution control endpoints + scaffold stub at /api/v1/swarm)
- swarmHandler.js (channel routing + connection management + broadcast() + WS event wiring)
- CircuitBreaker.js + BudgetTracker.js

**#53.1 + #53.2 + #53.3 COMPLETED — build passes.**

**Wave 2 COMPLETE (2026-03-27):**
- TASK #54 — HandoffEdge.jsx — COMPLETED
- TASK #55 — AgentInspector.jsx — COMPLETED
- TASK #56 — BreadcrumbBar.jsx — COMPLETED

**#57.1 COMPLETED (concurrent agent, 2026-03-27):**
- TASK #57.1 — SwarmCanvas.jsx — COMPLETED (frontend-dev self-marked; PROGRESS.md at 27/57)

**Phase 2 (Canvas Static) — ALL COMPLETE (2026-03-27):**
- #51–#58 ALL COMPLETED. Build: 470 modules, 0 errors. 168/168 tests pass.

**Current wave — V3 Phase 3 Prompt-to-Flow (2026-03-27):**
- TASK #59 — POST /api/v1/swarm/scaffold — COMPLETED (2026-03-27)
  - generateWorkflowFromPrompt() implemented with @anthropic-ai/sdk (claude-haiku-4-5-20251001)
  - WorkflowStore.create() called on success; 168/168 tests pass
  - 201 on success, 422 on parse fail, 408 on 60s timeout; raw prompt never logged

- TASK #61 — useWorkflow.js — COMPLETED (2026-03-27)
  - client/src/hooks/useWorkflow.js created; useWorkflow(id) + useWorkflowList() exports
  - Uses apiGet/apiPut/apiDelete/apiPost wrappers with X-Requested-With header; build: 470 modules, 0 errors

**Phase 3 COMPLETE — Phase 4 (Live Execution) NOW ACTIVE (2026-03-27):**
- TASK #60 — PromptToFlowBar.jsx + staggered animation — COMPLETED (build: 471 modules)
- TASK #59 — scaffold endpoint — COMPLETED
- TASK #61 — useWorkflow.js — COMPLETED
- Phase 3 (Prompt-to-Flow) FULLY DONE. 33/57 V3 tasks complete.

**Current wave — V3 Phase 4 Live Execution (updated 2026-03-27):**

PHASE 4 COMPLETED (39/57 V3 tasks):
- TASK #62.1 — SwarmEngine _onHandoff steps 1–4 — COMPLETED (168/168 tests pass)
- TASK #63 — useSwarm.js WS hook — COMPLETED (build: 472 modules)
- TASK #64 — useHandoff.js edge animation hook — COMPLETED
- TASK #65 — AgentNode.jsx live updates — COMPLETED
- TASK #66 — BroadcastBar.jsx + broadcast route — COMPLETED (build: 472 modules)
- TASK #67 — SwarmEngine heartbeat idle sweeper prevention — COMPLETED (168 tests pass)

CURRENT WAVE — Phase 4 continuation + Phase 5 (2026-03-27):

Launching simultaneously (all deps met):
- TASK #62.2 — SwarmEngine _onHandoff steps 5–6: context injection + agent status — IN_PROGRESS
  - Agent: backend-dev, Model: claude-opus-4-6, Difficulty: HARD, Deps: #62.1 ✓
  - File: server/services/SwarmEngine.js
  - Implement: _getHandoffTargets(), _onHandoff steps 5–6 (_buildSystemPrompt → writeInput, source 'done' + target 'running', 3 WS events)
  - Also add helper _getHandoffTargets(workflowDef, nodeId): array of target node IDs from edges where source === nodeId
- TASK #68 — inbox.js HITL approve/reject API — IN_PROGRESS
  - Agent: backend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #46.3 ✓ (corrected from #62.3)
  - File: server/routes/inbox.js — 4 endpoints: GET /inbox, GET /inbox/:executionId, POST /inbox/:itemId/approve, POST /inbox/:itemId/reject
  - ApproveInboxItem: validate resumeText ≤ 8192 chars, unfreeze edge if circuit_breaker, write to PTY
- TASK #70 — SwarmEngine freeze/unfreeze agent — IN_PROGRESS
  - Agent: backend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #62.1 ✓
  - File: server/services/SwarmEngine.js — add freezeAgent(executionId, nodeId, reason) + unfreezeAgent(executionId, nodeId, resumeText)
  - HITL mode: on handoff create InboxItem + freeze source, don't spawn target until approved
- TASK #71.1 — PTY Explosion overlay — IN_PROGRESS
  - Agent: frontend-dev, Model: claude-sonnet-4-6, Difficulty: MEDIUM, Deps: #58 ✓ (#57.2+#63 both done)
  - File: client/src/views/SwarmView.jsx (modify) — add pty-explosion-overlay using existing Terminal.jsx
  - Add ptyExplosionNodeId/setPtyExplosionNodeId to SwarmStore if not present from #52
- TASK #72 — InterAgentFeed.jsx — IN_PROGRESS
  - Agent: frontend-dev, Model: claude-haiku-4-5, Difficulty: EASY, Deps: #52 ✓ + #63 ✓
  - File: client/src/panels/InterAgentFeed.jsx — scrolling log of [HH:MM:SS] AgentA → AgentB events
  - Data from useSwarmStore(s => s.interAgentFeed), last 100 events, auto-scroll

NEXT AFTER CURRENT WAVE:
- #62.3 waits on #62.2 (SwarmEngine _onDone + BudgetTracker — backend-dev, sonnet)
- #69 waits on #68 (HitlInbox.jsx — frontend-dev, sonnet)
- #71.2 waits on #71.1 (PTY Explosion Escape key — frontend-dev, haiku)
- #65 still PENDING if not yet done — AgentNode.jsx live updates (frontend-dev, sonnet)

**Key context for #53.x agents:**
- SwarmContext.jsx is at client/src/store/SwarmContext.jsx — complete, exports useSwarmStore + SwarmProvider
- Use: `useSwarmStore(s => s.agentStates[nodeId])` pattern for per-node subscriptions (DEC-V3-04)
- ALL setNodes calls MUST use immutable spread: `{ ...node, data: { ...node.data } }` — React Flow v12
- NEVER mutate node objects in place
- Execution state (status, counters) MUST live in Zustand, NOT in node.data
- For DepartmentNode: parent nodes MUST appear BEFORE their children in the nodes array
- Build command: `cd client && npm run build` — must stay at 299+ modules, 0 errors
- File locations: client/src/canvas/nodes/AgentNode.jsx, DepartmentNode.jsx, TriggerNode.jsx

**Key context for #47.1 and #48.1 agents:**
- SwarmEngine.js is at server/services/SwarmEngine.js — complete, all methods implemented, 132 tests pass
- SessionManager.js has swarmListeners Set wired (DEC-014) — never touch the onData handler
- Look at server/routes/sessions.js and server/routes/jobs.js for Express router pattern
- server/ws/terminalHandler.js for WebSocket handler pattern (do NOT break it for #48.1)
- All mutating endpoints require CSRF header: X-Requested-With: ClaudeCodeManager
- CircuitBreaker.js + BudgetTracker.js exist in server/services/ — used by SwarmEngine internally

**V3 Key Decisions (for all agents):**
- DEC-V3-01: HandoffParser uses rolling 4KB byte accumulator (NOT line-by-line) — ConPTY splits tokens
- DEC-V3-02: PTY injection: soft=queue, hard=\x03+300ms+text+Escape+100ms+Enter (unreliable during tool calls)
- DEC-V3-03: SwarmEngine taps via session.swarmListeners Set — primary onData NEVER removed (DEC-009)
- DEC-V3-04: React Flow canvas state SEPARATE from Zustand ExecutionStore — never mix them
- DEC-V3-05: WorkflowContext = flat dict, shallow merge on each handoff (OpenAI Swarm pattern)
- Canvas always editable during execution (no lock)
- __DONE__ = soft notify only, workflow never auto-stops
- Budget = soft warn only, never stops
- HITL = human can chat at dept + agent level; PTY Explosion for direct terminal

**Blocking V3 start:** TASK #41 is COMPLETED. All V2 tasks done. V3 can begin immediately.

**First wave (Phase 1):** #43, #45 can run in parallel (WorkflowStore + HandoffParser have no deps on each other). #46 waits for #43+#45. #47 waits for #46. #48 waits for #46. #49 waits for #46.
