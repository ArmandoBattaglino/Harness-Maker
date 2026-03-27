# Current Context
**Session date:** 2026-03-27
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

**Current wave — V3 Phase 3 Prompt-to-Flow (launched 2026-03-27, running in parallel):**
- TASK #59 — POST /api/v1/swarm/scaffold — full scaffold endpoint (backend-dev, claude-sonnet-4-6, MEDIUM) — IN_PROGRESS
  - Replaces 501 stub in server/routes/swarm.js (from #47.2)
  - Receives { prompt, projectId, projectPath }; validates prompt max 2000 chars, projectId UUID
  - Calls jobRunner.startJob() → waits for completion (promise+emitter, NOT polling loop)
  - Extracts JSON: markdown fence first, then bare JSON
  - WorkflowStore.validate() before WorkflowStore.create()
  - 201 on success, 422 on parse fail, 408 on 60s timeout
  - SEC-08 equivalent: never log raw prompt or Claude output in errors
  - See server/routes/jobs.js for JobRunner pattern, server/routes/swarm.js for existing router

- TASK #61 — useWorkflow.js — CRUD hook — COMPLETED (frontend-dev self-marked, 2026-03-27)
  - client/src/hooks/useWorkflow.js created; useWorkflow(id) + useWorkflowList() exports
  - Uses apiGet/apiPut/apiDelete wrappers with X-Requested-With header

**After #59 completes (only remaining blocker for #60):**
- TASK #60 — PromptToFlowBar.jsx (depends on #57.1 DONE + #59 IN_PROGRESS) — frontend-dev, claude-sonnet-4-6, MEDIUM
  - Floating input bar overlaid on React Flow canvas; staggered 80ms node animation on scaffold success
  - Waits on #59 completing before it can call the real scaffold endpoint

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
