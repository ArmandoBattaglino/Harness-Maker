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

## In Progress
_None._

## Blocked
_None._

## Pending

### Phase 3 — Job Mode
- [TASK-9] Job Mode API — JobRunner + SSE streaming (backend-dev)
- [TASK-10] Job Mode UI — JobPanel + react-markdown (frontend-dev)

### Phase 4 — Projects View + Polish
- [TASK-11] Projects View UI (frontend-dev)
- [TASK-12] Non-Functional Requirements polish — browser auto-open, NFR resilience, version check (backend-dev)

### Phase 5 — QA, Security, Docs
- [TASK-13] Full QA Test Suite — all 6 critical paths + unit tests (qa-tester)
- [TASK-14] Pre-Release Security Audit — all 10 SEC requirements (security)
- [TASK-15] Documentation — README + troubleshooting guide (documenter)

## Known Issues
- R-01 (RESOLVED): node-pty-prebuilt-multiarch not available — plain node-pty used instead
- R-02 (MITIGATED): ConPTY deadlock — permanent pty.onData handler enforced in SessionManager (never removed)
- R-03 (PENDING): Job mode process hang if child.stdin.end() not called — must enforce in Task #9 (JobRunner)
- NOTE: FileManager was NOT created in Task #5 as planned — RESOLVED in Task #7 (created server/services/FileManager.js).
