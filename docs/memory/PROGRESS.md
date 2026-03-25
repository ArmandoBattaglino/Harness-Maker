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

## v1.1 Release Status
**v1.2 RELEASE READY — All 22 tasks COMPLETED as of 2026-03-24.**
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

## Phase 9 — Frontend Redesign (Stitch Design Export)
**Status: IN PROGRESS — 9 tasks planned (#23-#31), 1 completed.**
- [TASK-23] COMPLETED 2026-03-25 — Design System Foundation (Tailwind config, fonts, CSS, constants) — frontend-dev
- [TASK-24] PENDING — New Sidebar Navigation Component — frontend-dev — depends on #23
- [TASK-25] PENDING — Project Dashboard View (replaces ProjectsView) — frontend-dev — depends on #23, #24
- [TASK-26] PENDING — Live Terminal Hub View (replaces TerminalView) — frontend-dev — depends on #23, #24
- [TASK-27] PENDING — Orchestration Center / Job Runner View (replaces JobView) — frontend-dev — depends on #23, #24
- [TASK-28] PENDING — Context & Rules Editor View (new, replaces CLAUDE.md tab) — frontend-dev — depends on #23, #24
- [TASK-29] PENDING — Deployment Manager View (new, replaces Agents/Skills tabs) — frontend-dev — depends on #23, #24
- [TASK-30] PENDING — App Shell, Routing, View Integration — frontend-dev — depends on #25-#29
- [TASK-31] PENDING — Visual QA + Functional Regression Testing — qa-tester — depends on #30

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
