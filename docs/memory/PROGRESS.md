# Progress

## Completed

### Phase 0 — Foundation (DONE as of 2026-03-18)
- [TASK-1] docs/ARCHITECTURE.md produced by architect — 2026-03-18
  All 10 sections complete: component diagram, full API surface (all endpoints), WebSocket protocol
  spec, RingBuffer implementation spec, idle timeout sweeper spec, Claude binary discovery algorithm,
  YAML frontmatter parse/serialize pattern, React state management (Zustand), error handling matrix,
  startup and shutdown sequence. This is the reference document for all implementation agents.
- [TASK-2] Monorepo scaffold created by devops — 2026-03-18
  Full monorepo structure created. npm install successful in both server/ and client/. npm run build
  verified. GET /health returns 200 at http://127.0.0.1:3000.
  PACKAGE CORRECTIONS discovered:
    - node-pty (not node-pty-prebuilt-multiarch) — prebuilt-multiarch did not resolve; plain node-pty works.
    - write-file-atomic (not write-atomic) — write-atomic does not exist on npm; correct package is write-file-atomic.
  Both corrected packages are installed in server/node_modules. All subsequent agents must use these names.
- [TASK-3] Server Foundation (backend-dev) — COMPLETED 2026-03-18
  Added: server/services/ConfigStore.js, ProcessRegistry.js, BinaryDiscovery.js, services/index.js,
  server/middleware/security.js, csrf.js, pathValidation.js. server/index.js fully bootstrapped.
  Verified: GET /health → 200; CSRF guard active; 501 on unimplemented routes.
- [TASK-4] Project Management REST API (backend-dev) — COMPLETED 2026-03-18
  Added: server/routes/projects.js (projectsRouter). Mounted at /api/v1/projects in server/index.js.
  All endpoints verified: list, create (auto-scaffold), get (pathExists check), delete, manual scaffold.
  Scaffold creates: .claude/CLAUDE.md (if missing), .claude/agents/, .claude/commands/.
- [TASK-5] SessionManager PTY spawn + ring buffer + idle sweeper, WebSocket terminal handler (backend-dev) — COMPLETED 2026-03-18
  Added: server/services/RingBuffer.js (100KB circular buffer, toBuffer() replay), server/services/SessionManager.js
  (singleton PTY owner, permanent pty.onData, idle sweeper every 5 min / 30 min timeout, backpressure guard),
  server/routes/sessions.js (session CRUD, sanitized responses), server/ws/terminalHandler.js (WebSocket attach/detach,
  input/resize routing). Modified: server/index.js (WSS maxPayload 1MB, sessionManager.killAll() in shutdown).
  PTY survives browser tab close. tree-kill via createRequire (CJS). sessionManager.claudeBin set by index.js.
- [TASK-6] React Sidebar + TerminalView + xterm.js + resize (frontend-dev) — COMPLETED 2026-03-18
  Added: client/src/store/AppContext.jsx (global context: projects, sessions, activeProjectId, activeView),
  client/src/hooks/useSession.js (WebSocket lifecycle + reconnect logic), client/src/components/Terminal.jsx
  (xterm.js instance, FitAddon, ResizeObserver debounced 100ms, term.reset on session switch),
  client/src/components/Sidebar.jsx (project list, status indicators, Stop button, Add Project modal trigger),
  client/src/components/AddProjectModal.jsx (register + scaffold flows), client/src/views/TerminalView.jsx
  (Start Terminal button, session switching, ring buffer replay on reconnect). Build verified.
- [TASK-7] Entity Management API (backend-dev) — COMPLETED 2026-03-18
  Created: server/services/FileManager.js (path-validated atomic file I/O), server/utils/frontmatter.js (YAML
  parse/serialize helpers), server/routes/agents.js (CRUD /api/v1/agents), server/routes/skills.js (CRUD
  /api/v1/skills, 4 scan locations: modern+legacy x user+project), server/routes/claudemd.js (read/write
  CLAUDE.md user+project scope). Mounted all three routers in server/index.js. npm run build verified.

- [TASK-8] Entity Management UI (frontend-dev) — COMPLETED 2026-03-18
  EntitiesView with 3 tabs: AgentEditor (full CRUD + restart banner), SkillEditor (full CRUD + toast), ClaudeMdEditor (dual-panel + live line count + 300-line warning). Build clean.

- [TASK-9] Job Mode API (backend-dev) — COMPLETED 2026-03-18
  Created: server/services/JobRunner.js (spawn claude -p, readline stdout SSE forwarding, tree-kill cancellation, cancelAll() for shutdown), server/routes/jobs.js (POST/GET stream/DELETE/GET list). Mounted in server/index.js. child.stdin.end() enforced (DEC-005). shell: false (SEC-02). Prompt never logged (SEC-08). Build verified.

- [TASK-10] Job Mode UI (frontend-dev) — COMPLETED 2026-03-18
  Created: useJob hook (startJob POST+EventSource, cancelJob DELETE, reset), JobPanel (5 render states: idle/running/done/cancelled/error, StreamLog, MarkdownResult with react-markdown+remark-gfm, AdvancedOptions, Copy button), JobView updated from stub. Markdown prose styles added to index.css. Build clean.

- [TASK-11] Projects View UI (frontend-dev) — COMPLETED 2026-03-18
  Replaced ProjectsView stub with full implementation: table of all projects (Name, Path, Status badge, Created date, Actions), "Register Project" button opens AddProjectModal, "Open Terminal" dispatches SET_ACTIVE_PROJECT + SET_VIEW:terminal, "Delete" shows ConfirmDialog then calls DELETE /api/v1/projects/:id + REMOVE_PROJECT dispatch. Fetches on mount and after modal close. Build clean (304 modules).
- [TASK-12] Non-Functional Requirements Polish (backend-dev) — COMPLETED 2026-03-18
  Added to server/index.js: browser auto-open (exec, NO_OPEN guard), in-memory rate limiter (200 req/min on /api/v1/*), GET /api/v1/version endpoint (appVersion, nodeVersion, platform), improved /health (uptime, activeSessions, activeJobs), improved startup logging ([startup] prefixed with version, binary path, config dir). Build verified clean.

## In Progress
_None._

## Blocked
_None._

- [TASK-14] Pre-Release Security Audit (security) — COMPLETED 2026-03-18
  All 10 SEC requirements PASS. 3 MEDIUM findings (exec in openBrowser, allowedTools not whitelisted, PID file integrity), 2 LOW. 0 CRITICAL/HIGH. npm audit: 0 CVEs across 185 deps. Overall risk: LOW. docs/SECURITY_AUDIT.md produced.

- [TASK-13] Full QA Test Suite (qa-tester) — COMPLETED 2026-03-18
  110 tests pass (0 failures) across 6 test files. vitest v4.1.0 installed. All 6 PRD critical paths covered + unit tests for RingBuffer, FileManager, CSRF, pathValidation, SessionManager, JobRunner. `npm test` works from root and server directories. docs/TEST_RESULTS.md produced.

## Pending

### Phase 7 — v1.1 Maintenance Backlog (ALL INDEPENDENT, run in parallel)
- [TASK-19] v1.1 — Fix JobRunner memory leak — backend-dev — COMPLETED 2026-03-24
  BUG-06 FIXED: Added _scheduleEviction() method with 10-minute TTL setTimeout (.unref()).
  Jobs in terminal state (done/cancelled/error) are auto-evicted after 10 min. Safety check
  prevents eviction while SSE clients are still connected. Timer stored on job record for clearing.
  File: server/services/JobRunner.js. All 110 tests pass.
- [TASK-20] v1.1 — Fix rate limiter memory leak — backend-dev — COMPLETED 2026-03-24
  BUG-07 FIXED: Added setInterval sweep (every 60s, .unref()) that deletes _rateLimitMap entries
  where resetAt has passed. No behavioral change for active rate-limited IPs. File: server/index.js
- [TASK-21] v1.1 — Upgrade vite to patch esbuild CVE — devops — COMPLETED 2026-03-24
  MEDIUM-04 FIXED: Upgraded vite from 5.4.21 to 6.4.1 in client/package.json. esbuild CVE
  (GHSA-67mh-4wv8-2f99) resolved — npm audit returns 0 vulnerabilities. Build passes (301 modules).
  All 110 tests pass. @vitejs/plugin-react@4.7.0 compatible with vite 6. Files: client/package.json,
  client/package-lock.json.

### Phase 6 — Security Hardening (ALL COMPLETED 2026-03-18)
- [TASK-16] Security hardening — replace exec() in openBrowser with shell:false spawn (backend-dev) — COMPLETED 2026-03-18
  Fixed: server/index.js. openBrowser() now uses spawn with shell:false, detached:true, child.unref(). exec removed.
- [TASK-17] Security hardening — validate allowedTools against character whitelist (backend-dev) — COMPLETED 2026-03-18
  Fixed: server/routes/jobs.js. Added /^[a-zA-Z0-9_,\-]+$/ regex check + 512-char length cap, HTTP 400 on violation.
- [TASK-18] Security hardening — validate PID range in ProcessRegistry (backend-dev) — COMPLETED 2026-03-18
  Fixed: server/services/ProcessRegistry.js. isValidPid() helper (range 1–65535), cleanupStale() and register() both guarded.

## V3 Planning Status
**V3 PRD WRITTEN — 2026-03-27.** docs/PRD.md (version 3.0) complete. Ready for project-manager to build V3 TASK_PLAN and architect to design SwarmEngine. 6 open questions in PRD Section 11 need architect review before implementation.

## Release Status
**v2.0 RELEASE READY — ALL 31 tasks COMPLETED as of 2026-03-26.**
- v1 (18 tasks, Phase 0–6): COMPLETED 2026-03-18.
- v1.1 (3 tasks, Phase 7): COMPLETED 2026-03-24.
  - TASK-19: JobRunner memory leak fixed (TTL eviction, BUG-06)
  - TASK-20: Rate limiter memory leak fixed (stale sweep, BUG-07)
  - TASK-21: Vite 5.4→6.4.1 (esbuild CVE MEDIUM-04 resolved)
- v1.2 (1 task, Phase 8): COMPLETED 2026-03-24.
  - TASK-22: GET /api/v1/jobs/:id route added (BUG-22)
- QA regression: 110/110 tests pass, npm audit 0 vulnerabilities.
- Full E2E audit: 25 endpoints + 8 UI views tested, 0 bugs remaining.
- Ready for `git tag v1.2.0`.
- v2.0 (9 tasks, Phase 9): COMPLETED 2026-03-26.
  - TASK-23 through TASK-30: Full frontend redesign from Stitch design exports (Tailwind, 5 new views, sidebar, app shell)
  - TASK-31: Visual QA + Functional Regression — 110/110 tests pass, 299 modules build, 0 critical/high bugs
- QA regression (Phase 9): 110/110 tests pass, build clean (299 modules), 0 CRITICAL/HIGH findings.
- Ready for `git tag v2.0.0`.
- v2.1 (10 tasks, Phase 10): 9/10 COMPLETED 2026-03-26. TASK-41 (regression QA) pending.
  - TASK-32: CSP fix — Google Fonts unblocked (fontSrc + styleSrc updated in security.js)
  - TASK-33: JobRunner child.on('error') handler + stdin.end() try-catch
  - TASK-34: Sidebar creatingSessionRef race condition lock
  - TASK-35: ContextEditorView handleScopeSwitch confirmation guard
  - TASK-36: Terminal background #1a1a1a → #000000
  - TASK-37: Sidebar sessionError state with visible UI feedback
  - TASK-38: SidebarFooter dynamic version via /api/v1/version + settings icon de-interactivized
  - TASK-39: Logo container overflow-hidden
  - TASK-40: AddProjectModal mode prop (register/scaffold), ProjectCard focus-within accessibility
  - Build: 299 modules, 0 errors

## Phase 9 — Frontend Redesign (Stitch Design Export)
**Status: COMPLETED — All 9 tasks (#23-#31) done as of 2026-03-26.**
- [TASK-23] COMPLETED 2026-03-25 — Design System Foundation (Tailwind config, fonts, CSS, constants) — frontend-dev
- [TASK-24] COMPLETED 2026-03-25 — New Sidebar Navigation Component — frontend-dev — depends on #23
- [TASK-25] COMPLETED 2026-03-26 — Project Dashboard View (replaces ProjectsView) — frontend-dev
- [TASK-26] COMPLETED 2026-03-26 — Live Terminal Hub View (replaces TerminalView) — frontend-dev
- [TASK-27] COMPLETED 2026-03-26 — Orchestration Center / Job Runner View (replaces JobView) — frontend-dev
- [TASK-28] COMPLETED 2026-03-26 — Context & Rules Editor View (new, replaces CLAUDE.md tab) — frontend-dev
- [TASK-29] COMPLETED 2026-03-26 — Deployment Manager View (new, replaces Agents/Skills tabs) — frontend-dev
- [TASK-30] COMPLETED 2026-03-26 — App Shell, Routing, View Integration — frontend-dev
- [TASK-31] COMPLETED 2026-03-26 — Visual QA + Functional Regression Testing — qa-tester

## Known Issues
- R-01 (RESOLVED): node-pty-prebuilt-multiarch not available — plain node-pty used instead
- R-02 (MITIGATED): ConPTY deadlock — permanent pty.onData handler enforced in SessionManager (never removed)
- R-04 (FIXED 2026-03-18): AddProjectModal sent POST to nonexistent /api/v1/projects/scaffold — fixed to /api/v1/projects with scaffold in body (BUG-03)
- R-05 (FIXED 2026-03-18): projects/session API responses not destructured in Sidebar and ProjectsView — all .map() calls were crashing (BUG-04, BUG-05)
- R-06 (FIXED 2026-03-18): WS_BASE hardcoded to port 3000 — fixed to window.location.port (BUG-16)
- R-07 (FIXED 2026-03-18): ws.bufferedAmount undefined server-side (browser API) — backpressure guard was always false; fixed to ws._socket.bufferSize (BUG-11)
- R-08 (FIXED 2026-03-18): yaml.load() non-object return not guarded in parseFrontmatter (BUG-14)
- R-09 (FIXED 2026-03-18): Double ProcessRegistry.unregister per session kill (BUG-02)
- R-10 (FIXED 2026-03-24): JobRunner #jobs Map memory leak — completed jobs now auto-evicted after 10min TTL (BUG-06, TASK-19)
- R-11 (FIXED 2026-03-24): Rate limiter _rateLimitMap stale sweep added — 60s interval cleans expired entries (BUG-07, TASK-20)
- R-03 (RESOLVED): Job mode process hang if child.stdin.end() not called — enforced in Task #9 (JobRunner.js line after spawn)
- NOTE: FileManager was NOT created in Task #5 as planned — RESOLVED in Task #7 (created server/services/FileManager.js).

## V3 — Swarm Orchestrator (57 granular tasks after split — 2026-03-27 replan)
**Status: 8/57 COMPLETED — as of 2026-03-27. #47.1 and #48.1 IN_PROGRESS.**
**Note: Original 40 tasks (#43–#82). After model assignment + subtask split: 57 granular units.**
**7 original tasks split into subtasks: #46→3, #47→2, #48→2, #53→3, #57→2, #62→3, #71→2**
- V3 PRD complete: docs/PRD.md
- V3 research complete: docs/research_complete.md, research_a/b/c.md
- V3 task plan: docs/TASK_PLAN.md tasks #43–#82 (with subtasks .1/.2/.3)

### V3 Phase 1 — Backend Foundation
- [TASK-43] COMPLETED 2026-03-27 — WorkflowStore.js — 132/132 tests pass
- [TASK-44] COMPLETED 2026-03-27 — workflows.js CRUD routes (routes mounted, CRUD working)
- [TASK-45] COMPLETED 2026-03-27 — HandoffParser.js — 22 unit tests, 132/132 tests pass
- [TASK-46.1] COMPLETED 2026-03-27 — SwarmEngine — SessionManager patch + class skeleton, 132/132 tests pass
- [TASK-46.2] COMPLETED 2026-03-27 — SwarmEngine — startExecution + _spawnAgentPty + HandoffParser tap, 132/132 tests pass
- [TASK-46.3] COMPLETED 2026-03-27 — SwarmEngine — _buildSystemPrompt + _startHeartbeat, 132/132 tests pass
- [TASK-47.1] IN_PROGRESS — swarm.js — 7 execution control endpoints (launched 2026-03-27)
- [TASK-47.2] PENDING — swarm.js — scaffold endpoint stub (501)
- [TASK-48.1] COMPLETED 2026-03-27 — swarmHandler.js — channel routing + connection management; dual noServer WSS routing via server.on('upgrade'); 132/132 tests pass
- [TASK-48.2] PENDING — swarmHandler.js — broadcast() + WS event wiring
- [TASK-49] COMPLETED 2026-03-27 — CircuitBreaker.js + BudgetTracker.js — pure service classes, no I/O, no imports, 132/132 tests pass
- [TASK-50] PENDING — V3 Security Layer (SEC-V3-01 to SEC-V3-07)

### V3 Phase 2 — Canvas Static
- [TASK-51] PENDING — @xyflow/react + zustand install (devops)
- [TASK-52] PENDING — SwarmContext.jsx Zustand ExecutionStore
- [TASK-53.1] PENDING — AgentNode.jsx — agent canvas node
- [TASK-53.2] PENDING — DepartmentNode.jsx — group container node
- [TASK-53.3] PENDING — TriggerNode.jsx — webhook/RSS node stub
- [TASK-54] PENDING — HandoffEdge.jsx — animated edge + counter badge
- [TASK-55] PENDING — AgentInspector.jsx — node config panel
- [TASK-56] PENDING — BreadcrumbBar.jsx — drill-down nav
- [TASK-57.1] PENDING — SwarmCanvas.jsx — React Flow canvas + drill-down filtering
- [TASK-57.2] PENDING — SwarmView.jsx — layout shell + toolbar
- [TASK-58] PENDING — App.jsx + Sidebar swarm nav + ReactFlowProvider

### V3 Phase 3 — Prompt-to-Flow
- [TASK-59] PENDING — scaffold endpoint complete (replaces 47.2 stub)
- [TASK-60] PENDING — PromptToFlowBar.jsx + staggered animation
- [TASK-61] PENDING — useWorkflow.js CRUD hook

### V3 Phase 4 — Live Execution
- [TASK-62.1] PENDING — SwarmEngine _onHandoff: context merge + edge counter + PTY spawn
- [TASK-62.2] PENDING — SwarmEngine _onHandoff: context injection + agent status updates
- [TASK-62.3] PENDING — SwarmEngine _onDone + BudgetTracker + lastOutputSnippet
- [TASK-63] PENDING — useSwarm.js WS hook for execution control
- [TASK-64] PENDING — useHandoff.js edge animation hook
- [TASK-65] PENDING — AgentNode live updates — pulse + micro PTY log
- [TASK-66] PENDING — BroadcastBar.jsx + broadcast route
- [TASK-67] PENDING — SwarmEngine heartbeat — idle sweeper prevention

### V3 Phase 5 — HITL + PTY Explosion
- [TASK-68] PENDING — inbox.js HITL approve/reject API
- [TASK-69] PENDING — HitlInbox.jsx approval panel
- [TASK-70] PENDING — SwarmEngine freeze/unfreeze agent
- [TASK-71.1] PENDING — PTY Explosion overlay component
- [TASK-71.2] PENDING — PTY Explosion Escape key handler
- [TASK-72] PENDING — InterAgentFeed.jsx real-time handoff log
- [TASK-73] PENDING — useInbox.js HITL polling hook

### V3 Phase 6 — Trigger Nodes
- [TASK-74] PENDING — TriggerManager.js webhooks + RSS polling
- [TASK-75] PENDING — triggers.js routes
- [TASK-76] PENDING — TriggerNode.jsx full visual implementation

### V3 Phase 7 — QA + Security + Release
- [TASK-77] PENDING — HandoffParser unit tests (qa-tester)
- [TASK-78] PENDING — SwarmEngine integration tests (qa-tester)
- [TASK-79] PENDING — V3 Pre-Release Security Audit (security)
- [TASK-80] PENDING — V3 End-to-End Test (qa-tester, Puppeteer)
- [TASK-81] PENDING — Build verification + v3.0.0 git tag (devops)
- [TASK-82] PENDING — V3 Documentation update (documenter)
