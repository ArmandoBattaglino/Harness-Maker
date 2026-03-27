# TASK_PLAN.md — Claude Code Visual Manager
**Project Manager:** claude-sonnet-4-6
**Created:** 2026-03-18
**PRD Version:** 1.0
**Status:** ACTIVE

---

## Overview

Claude Code Visual Manager is a locally-hosted web application (served on `localhost`) that provides a graphical user interface for the Claude Code CLI. It spawns Claude Code processes directly using the user's installed binary (no API key required). It delivers: (1) a live PTY terminal via xterm.js over WebSocket, (2) a job mode for background prompt execution with Markdown results, and (3) visual editors for agents, skills, CLAUDE.md files, and project registration. Multiple projects can run simultaneously, sessions survive browser closures, and the app starts with `npm start` on Windows 11.

**Tech Stack (decided in research phase):**
- Runtime: Node.js 20 LTS
- Server: Express 4.x + ws 8.x WebSocket
- PTY: node-pty (plain — prebuilt-multiarch was unavailable, see DEC-001)
- Process kill: tree-kill
- Config writes: write-file-atomic
- YAML: js-yaml 4.x
- UUIDs: uuid 9.x
- Security: helmet
- Frontend: React 18 + Vite 6.x + Tailwind CSS 3.x
- Terminal: xterm.js 5.x + xterm-addon-fit
- Markdown: react-markdown 9.x + remark-gfm

**Config storage:** `%APPDATA%\ClaudeCodeManager\config.json`

---

## Phase Map

| Phase | Tasks | Goal |
|-------|-------|------|
| Phase 0 | #1 (Architect) | System design and architecture document |
| Phase 0 | #2 (DevOps) | Monorepo scaffold + npm start |
| Phase 1 | #3 (Backend) | Foundation: ConfigStore, ProcessRegistry, security middleware, binary discovery |
| Phase 2 | #4 (Backend) | Project Management API |
| Phase 2 | #5 (Backend) | SessionManager + WebSocket terminal handler |
| Phase 2 | #6 (Frontend) | Sidebar + TerminalView (xterm.js) |
| Phase 3 | #7 (Backend) | Entity Management API (agents, skills, CLAUDE.md) |
| Phase 3 | #8 (Frontend) | Entity editors (AgentEditor, SkillEditor, ClaudeMdEditor) |
| Phase 4 | #9 (Backend) | Job Mode API (JobRunner + SSE streaming) |
| Phase 4 | #10 (Frontend) | Job Mode UI (JobPanel + react-markdown) |
| Phase 5 | #11 (Frontend) | Projects View UI |
| Phase 5 | #12 (Backend) | NFR Polish — rate limiter, version endpoint, browser open, startup logging |
| Phase 5 | #13 (QA) | Full test suite + 6 critical paths |
| Phase 5 | #14 (Security) | Pre-release security audit |
| Phase 5 | #15 (Documenter) | README + troubleshooting guide |
| Phase 6 | #16 (Backend) | Security hardening: replace exec() in openBrowser with shell:false spawn |
| Phase 6 | #17 (Backend) | Security hardening: validate allowedTools against character whitelist |
| Phase 6 | #18 (Backend) | Security hardening: validate PID range in ProcessRegistry before kill |
| Phase 7 | #19 (Backend) | v1.1: Fix JobRunner memory leak — evict completed/cancelled/error jobs from jobs Map |
| Phase 7 | #20 (Backend) | v1.1: Fix rate limiter memory leak — add TTL/cleanup to _rateLimitMap |
| Phase 7 | #21 (DevOps) | v1.1: Upgrade vite in client/ to patch MEDIUM-04 esbuild CVE |
| Phase 8 | #22 (Backend) | v1.2: Add GET /api/v1/jobs/:id route (BUG-22) |
| Phase 9 | #23 (Frontend) | Redesign: Design System Foundation — Tailwind config, fonts, CSS variables, shared utilities |
| Phase 9 | #24 (Frontend) | Redesign: New Sidebar Navigation Component |
| Phase 9 | #25 (Frontend) | Redesign: Project Dashboard View (replaces ProjectsView) |
| Phase 9 | #26 (Frontend) | Redesign: Live Terminal Hub View (replaces TerminalView) |
| Phase 9 | #27 (Frontend) | Redesign: Orchestration Center / Job Runner View (replaces JobView) |
| Phase 9 | #28 (Frontend) | Redesign: Context & Rules Editor View (replaces EntitiesView CLAUDE.md tab) |
| Phase 9 | #29 (Frontend) | Redesign: Deployment Manager View (replaces EntitiesView Agents/Skills tabs) |
| Phase 9 | #30 (Frontend) | Redesign: App Shell, Routing, and View Integration |
| Phase 9 | #31 (QA) | Redesign: Visual QA + Functional Regression Testing |

---

## Tasks

---

TASK #1: System Architecture Design
Agent: architect
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Context:
  Design the complete server-side and client-side architecture for Claude Code Visual Manager before any code is written.

  THE PRODUCT: A locally-hosted web app (localhost only, Windows 11 primary) that wraps the Claude Code CLI with a GUI. Two core interaction modes: (1) Live PTY terminal — xterm.js in the browser connects via WebSocket to a real node-pty process running `claude`; (2) Job mode — user submits a prompt, server spawns `claude -p <prompt> --output-format stream-json`, streams results via SSE, renders Markdown result. Additionally: visual CRUD editors for agents, skills, and CLAUDE.md files. Multiple projects with independent persistent Claude sessions.

  KEY ARCHITECTURAL CONSTRAINTS FROM RESEARCH:
  - node-pty is NOT thread-safe. All PTY operations must stay on the main Node.js thread. No worker threads.
  - PTY lifetime must be DECOUPLED from WebSocket lifetime. When a browser tab closes, the PTY stays alive. Only `pty.kill()` on explicit user action or idle timeout destroys a session.
  - ConPTY (Windows) REQUIRES a permanent output reader at all times. If the output pipe is not continuously drained, the child process blocks on its next write syscall. The `pty.onData` handler must be wired ONCE at spawn and NEVER removed, regardless of client count. The ring buffer absorbs output while no clients are connected.
  - Ring buffer: true fixed-capacity circular buffer, capped at 100 KB per session. On reconnect, replay the ring buffer before switching to live streaming.
  - Job mode stdin MUST be closed immediately after spawn (`child.stdin.end()`). GitHub issue #7497 confirms the process hangs indefinitely otherwise.
  - Use `node-pty-prebuilt-multiarch` (not plain `node-pty`) to avoid MSVC Build Tools requirement on user machines.
  - Use `tree-kill` for process termination (not `child.kill()`), because Claude spawns sub-processes.
  - Use `write-atomic` for ALL file writes (config, agents, skills, CLAUDE.md) to prevent corruption on crash.
  - Server binds EXCLUSIVELY to `127.0.0.1`. Never `0.0.0.0`.
  - No authentication required (single-user local machine).
  - All REST endpoints prefixed `/api/v1/`.
  - Session IDs and job IDs must be UUID v4 (use `uuid` npm package). Never sequential integers.
  - Config stored at `%APPDATA%\ClaudeCodeManager\config.json`.
  - Active PIDs tracked in `%APPDATA%\ClaudeCodeManager\active_pids.json` for stale cleanup on restart.

  REQUIRED SERVER-SIDE SERVICES (design boundaries):
  - `SessionManager` — sole owner of the `sessions Map<sessionId, SessionRecord>` and all node-pty operations. No other module calls `pty.spawn()` or `pty.kill()`.
  - `JobRunner` — sole owner of all `child_process.spawn` calls for job mode and the `jobs Map<jobId, JobRecord>`.
  - `FileManager` — sole owner of all filesystem reads/writes. All path validation lives here. No other module writes files directly.
  - `ConfigStore` — owns `%APPDATA%\ClaudeCodeManager\config.json`. Uses `write-atomic`.
  - `ProcessRegistry` — owns `active_pids.json`. Tracks PIDs for orphan cleanup.

  DATA MODELS TO DESIGN:
  - SessionRecord: `{ sessionId, projectId, pty: IPty, buffer: RingBuffer(100KB), clients: Set<WebSocket>, pid, status: "active"|"killed", createdAt, lastActivityAt }`
  - JobRecord: `{ jobId, projectId, prompt, allowedTools, maxTurns, child: ChildProcess, clients: Set<SseResponse>, status: "running"|"done"|"cancelled"|"error", result: string|null, createdAt, completedAt }`
  - Project: `{ id, name, path, createdAt }`
  - AppConfig: `{ version: "1", projects: Project[], settings: { port: number, idleTimeoutMinutes: number } }`

  WEBSOCKET PROTOCOL:
  - Terminal: `ws://127.0.0.1:<PORT>/ws?sessionId=<uuid>` — bidirectional. Client sends `{ type: "input", data: string }` and `{ type: "resize", cols: N, rows: N }`. Server sends raw PTY bytes.
  - Job streaming: SSE at `GET /api/v1/jobs/:id/stream` (unidirectional, simpler than WS for job mode).
  - Error close codes: 4004 = session not found, 4001 = unauthorized.

  FILE LAYOUT (from PRD):
  ```
  <repo-root>/
  ├── package.json              # Root scripts: start, dev, build
  ├── server/
  │   ├── index.js              # Express bootstrap, server.listen("127.0.0.1")
  │   ├── routes/
  │   │   ├── projects.js
  │   │   ├── sessions.js
  │   │   ├── jobs.js
  │   │   ├── agents.js
  │   │   ├── skills.js
  │   │   └── claudemd.js
  │   ├── services/
  │   │   ├── SessionManager.js
  │   │   ├── JobRunner.js
  │   │   ├── FileManager.js
  │   │   ├── ConfigStore.js
  │   │   └── ProcessRegistry.js
  │   ├── ws/
  │   │   ├── terminalHandler.js
  │   │   └── jobHandler.js
  │   └── middleware/
  │       ├── csrf.js
  │       ├── pathValidation.js
  │       └── security.js
  ├── client/
  │   ├── index.html
  │   ├── vite.config.js
  │   └── src/
  │       ├── main.jsx
  │       ├── App.jsx
  │       ├── views/
  │       │   ├── TerminalView.jsx
  │       │   ├── JobView.jsx
  │       │   ├── EntitiesView.jsx
  │       │   └── ProjectsView.jsx
  │       ├── components/
  │       │   ├── Sidebar.jsx
  │       │   ├── Terminal.jsx
  │       │   ├── JobPanel.jsx
  │       │   ├── AgentEditor.jsx
  │       │   ├── SkillEditor.jsx
  │       │   └── ClaudeMdEditor.jsx
  │       └── hooks/
  │           ├── useSession.js
  │           └── useJob.js
  ```

  SECURITY REQUIREMENTS TO DESIGN FOR:
  1. Bind to 127.0.0.1 only
  2. No `shell: true` in any child_process call
  3. Working directory path validation (no `..`, no null bytes, absolute path only)
  4. File write path validation (`path.resolve()` + prefix assertion)
  5. WebSocket maxPayload 1MB; backpressure at 256KB bufferedAmount
  6. CSRF: require `X-Requested-With: ClaudeCodeManager` on all mutating endpoints
  7. helmet() middleware (CSP `script-src 'self'`, X-Content-Type-Options, X-Frame-Options)
  8. No sensitive data in logs
  9. PTY cleanup on SIGTERM/SIGINT/exit + idle sweeper (5min interval, 30min default timeout)
  10. npm audit in CI

  OUTPUT EXPECTED:
  Produce a file at `C:\Users\arman\Downloads\Test workflows\docs\ARCHITECTURE.md` containing:
  1. Component diagram (ASCII or text)
  2. Full API surface (all endpoints with request/response shapes)
  3. WebSocket protocol specification (message types, flow diagrams)
  4. RingBuffer implementation specification (circular buffer, 100KB cap, overflow behavior)
  5. Idle timeout sweeper specification
  6. Claude binary discovery algorithm
  7. YAML frontmatter parse/serialize pattern (with Windows `\r\n` handling)
  8. React state management approach (what lives in global state vs local component state)
  9. Error handling matrix (what errors exist, where they are caught, what the user sees)
  10. Startup sequence (ordered steps from `npm start` to "ready")

Knowledge: none
Acceptance Criteria:
  - [ ] `docs/ARCHITECTURE.md` exists and is complete
  - [ ] All API endpoints documented with full request/response shapes
  - [ ] WebSocket message protocol fully specified
  - [ ] RingBuffer circular buffer design specified with 100KB cap
  - [ ] Service boundaries (SessionManager, JobRunner, FileManager, ConfigStore, ProcessRegistry) clearly delineated with ownership rules
  - [ ] Security requirements mapped to specific implementation points
  - [ ] React component hierarchy and state management approach documented
  - [ ] Startup sequence documented in order
Dependencies: none
---

TASK #2: Monorepo Scaffold and Build System
Agent: devops
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  Set up the monorepo structure, package.json files, and build tooling so that `npm start` in the repo root builds the React SPA and starts the Express server, serving the SPA at `http://127.0.0.1:3000`.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  WHAT TO CREATE:
  1. Root `package.json` with:
     - `"start"` script: builds the client then starts the server (e.g., `npm run build --prefix client && node server/index.js`)
     - `"dev"` script: runs Vite dev server for client AND nodemon for server simultaneously
     - `"build"` script: builds the client only
     - All workspace dependencies listed

  2. `server/package.json` with dependencies:
     - express 4.x
     - ws 8.x
     - node-pty-prebuilt-multiarch (latest)
     - tree-kill (latest)
     - write-atomic (latest)
     - js-yaml 4.x
     - uuid 9.x
     - helmet (latest)
     - open (latest) — for auto-opening the browser on start
     - Dev deps: nodemon

  3. `client/package.json` with dependencies:
     - react 18
     - react-dom 18
     - vite 5.x
     - @vitejs/plugin-react (latest)
     - tailwindcss 3.x
     - postcss (latest)
     - autoprefixer (latest)
     - xterm 5.x
     - xterm-addon-fit (latest)
     - react-markdown 9.x
     - remark-gfm (latest)

  4. `client/vite.config.js`:
     - Plugin: `@vitejs/plugin-react`
     - Build output: `../server/public` (so Express can serve it as static files)
     - Dev server proxy: proxy `/api` and `/ws` to `http://127.0.0.1:3000`

  5. `client/tailwind.config.js` and `client/postcss.config.js`

  6. `client/index.html` — minimal HTML shell with `<div id="root">` and the Vite entry script

  7. `client/src/main.jsx` — minimal React root mount (`ReactDOM.createRoot`)

  8. `client/src/App.jsx` — placeholder that renders "Claude Code Visual Manager - Loading..."

  9. `server/index.js` — STUB ONLY (Task #3 implements the real content). Just enough to: listen on 127.0.0.1:3000, serve `server/public` as static, and respond with 200 to GET /health.

  10. `.gitignore` at the root: node_modules, server/public, .env, *.log

  IMPORTANT CONSTRAINTS:
  - The Vite build output directory must be `server/public` so Express can serve it.
  - The Vite dev proxy must forward `/api/*` and `/ws` to the backend port.
  - Do NOT use Create React App — use Vite only.
  - All package versions must be pinned to the versions listed (e.g., React 18, not 19).
  - The stub `server/index.js` must bind exclusively to `127.0.0.1` (not `0.0.0.0`).

  VERIFICATION:
  After creating all files, run `npm install` in both `server/` and `client/` and confirm no install errors. Then run `npm start` from the root and verify the health endpoint responds.

Knowledge: none
Acceptance Criteria:
  - [ ] Root `package.json` exists with `start`, `dev`, and `build` scripts
  - [ ] `server/package.json` and `client/package.json` exist with all listed dependencies
  - [ ] `client/vite.config.js` builds to `../server/public` and proxies `/api` and `/ws` to backend
  - [ ] `client/src/App.jsx` renders a placeholder without errors
  - [ ] `server/index.js` stub starts and listens on `127.0.0.1:3000`
  - [ ] `npm install` completes without errors in both subdirectories
  - [ ] `npm start` from root builds the client and starts the server without crashing
  - [ ] `GET http://127.0.0.1:3000/health` returns 200
Dependencies: none
---

TASK #3: Server Foundation — Security Middleware, ConfigStore, ProcessRegistry, Binary Discovery
Agent: backend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: COMPLETED
Context:
  Implement the foundational server-side infrastructure in `server/index.js` and the supporting services. This is Phase 0 of the PRD and must be done before any feature work.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`
  All file paths below are relative to this working directory.

  PACKAGE CORRECTIONS (verified during Task #2 scaffold):
  - Use `node-pty` NOT `node-pty-prebuilt-multiarch` — the prebuilt-multiarch package was not resolving correctly; plain `node-pty` installed successfully and is already present in `server/node_modules`.
  - Use `write-file-atomic` NOT `write-atomic` — `write-atomic` does not exist on npm; the correct package name is `write-file-atomic`. It is already installed in `server/node_modules`. Import it as `const writeFileAtomic = require('write-file-atomic')`.
  These corrections are ground truth. Do not attempt to require the old names.

  WHAT TO IMPLEMENT:

  1. `server/index.js` — Express app bootstrap:
     - Import and apply `helmet()` as the FIRST middleware
     - Apply the CSRF middleware (see item 4 below) BEFORE all API routes
     - Call `server.listen(PORT, "127.0.0.1")` — NEVER `0.0.0.0`
     - PORT defaults to 3000, configurable via `PORT` env var
     - Serve the built React SPA from `server/public` as static files
     - On startup: run ConfigStore.init(), ProcessRegistry.cleanupStale(), binary discovery
     - On startup: log `Claude Code Visual Manager running at http://127.0.0.1:<PORT>`
     - Open the browser automatically using the `open` npm package
     - Register `process.on('exit')`, `process.on('SIGTERM')`, `process.on('SIGINT')` handlers that iterate the sessions Map (imported from SessionManager) and call `pty.kill()` on every active PTY before exit
     - Use express.json() for request body parsing

  2. `server/services/ConfigStore.js`:
     - Config file location: `path.join(process.env.APPDATA || os.homedir(), 'ClaudeCodeManager', 'config.json')`
     - `init()`: if the config file does not exist, create directory and write default structure: `{ version: "1", projects: [], settings: { port: 3000, idleTimeoutMinutes: 30 } }`. Uses `write-atomic`.
     - `read()`: read and parse the JSON config file
     - `write(config)`: write the config atomically using `write-atomic`. This is the ONLY place write-atomic is called for the app config.
     - `getProjects()`: return `config.projects`
     - `addProject(project)`: push to `config.projects`, write
     - `removeProject(id)`: filter `config.projects`, write
     - `getSettings()`: return `config.settings`

  3. `server/services/ProcessRegistry.js`:
     - PID file location: `path.join(process.env.APPDATA || os.homedir(), 'ClaudeCodeManager', 'active_pids.json')`
     - `cleanupStale()`: on startup, read the PID file (if it exists), call `tree-kill(pid)` for each PID (ignore errors if already dead), then delete the file
     - `addPid(pid)`: read current PIDs, push the new PID, write atomically
     - `removePid(pid)`: read current PIDs, filter out the given PID, write atomically
     - `getAllPids()`: read and return the PID array (returns empty array if file does not exist)

  4. `server/middleware/csrf.js`:
     - Export an Express middleware function
     - On `POST`, `PUT`, `PATCH`, and `DELETE` requests: check for header `X-Requested-With: ClaudeCodeManager`
     - If the header is missing or has a different value: respond with HTTP 403 `{ error: "CSRF check failed" }`
     - GET and HEAD requests pass through without check

  5. `server/middleware/security.js`:
     - Export a function that takes the Express `app` and applies `helmet()` with a custom Content-Security-Policy: `{ directives: { scriptSrc: ["'self'"], defaultSrc: ["'self'"] } }`
     - Also assert on startup that the server is bound to 127.0.0.1 (log a warning if not)

  6. Claude binary discovery (in `server/index.js` or a separate `server/services/BinaryDiscovery.js`):
     - Strategy 1: `child_process.spawnSync("claude", ["--version"], { encoding: "utf8", shell: false })`
     - If strategy 1 fails (status non-zero or error), strategy 2: check `path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe')`
     - If neither works: `console.error("ERROR: claude binary not found. Install Claude Code and ensure it is on your PATH.")` then `process.exit(1)`
     - If found: log the version string. Store the resolved binary path as `CLAUDE_BIN` module-level constant.
     - NEVER use `shell: true` in the spawnSync call.

  SECURITY REQUIREMENTS for this task:
  - SEC-01: `server.listen(PORT, "127.0.0.1")` — no exceptions
  - SEC-06: CSRF middleware on all mutating endpoints
  - SEC-07: helmet() as first middleware
  - SEC-08: Never log API keys, OAuth tokens, full prompts, or full file content. Only log: session IDs, PIDs, exit codes, error messages.
  - SEC-09: Register SIGTERM/SIGINT/exit handlers (SessionManager not yet implemented — register the hooks now, the iteration of the sessions Map will be wired in Task #5)

  DO NOT IMPLEMENT in this task:
  - Any route handlers (those are Tasks #4-#9)
  - SessionManager or JobRunner (those are Tasks #5 and #9)
  - FileManager (that is Task #5)

Knowledge: none
Acceptance Criteria:
  - [ ] `server/index.js` binds to `127.0.0.1` only (verified by checking listen call)
  - [ ] `helmet()` is the first middleware applied
  - [ ] CSRF middleware rejects POST/PUT/PATCH/DELETE without `X-Requested-With: ClaudeCodeManager` header with HTTP 403
  - [ ] CSRF middleware passes GET requests without checking the header
  - [ ] `ConfigStore.init()` creates `config.json` with default structure if it does not exist
  - [ ] `ConfigStore.write()` uses `write-atomic`
  - [ ] `ProcessRegistry.cleanupStale()` reads `active_pids.json` on startup and kills stale PIDs
  - [ ] Binary discovery logs the Claude version on startup
  - [ ] Binary discovery calls `process.exit(1)` with a clear error message if `claude` is not found
  - [ ] `CLAUDE_BIN` constant is exported/accessible to other modules
  - [ ] SIGTERM, SIGINT, and exit handlers are registered
  - [ ] Server starts without errors after `npm start`
Dependencies: TASK #1 (architecture), TASK #2 (scaffold)
---

TASK #4: Project Management API
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  Implement the Project Management REST API endpoints. These are all CRUD operations on the project registry stored in `%APPDATA%\ClaudeCodeManager\config.json` via ConfigStore (implemented in Task #3).

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`
  File to create: `server/routes/projects.js`

  ENDPOINTS TO IMPLEMENT:

  **FR-05: POST /api/v1/projects**
  - Request body: `{ name: string, path: string }`
  - Validation:
    - `name` must be a non-empty string
    - `path` must be an absolute path (starts with a drive letter on Windows, e.g., `C:\` or `/`)
    - `path` must not contain `..` components or null bytes
    - `path` must point to an existing directory (`fs.accessSync(path, fs.constants.R_OK)`)
    - If any validation fails: return HTTP 400 with `{ error: "descriptive message" }`
  - On success: generate UUID v4 for the project ID, create project object `{ id, name, path, createdAt: new Date().toISOString() }`, call `ConfigStore.addProject(project)`, return HTTP 201 `{ id, name, path, createdAt }`

  **FR-07: GET /api/v1/projects**
  - No parameters
  - Return HTTP 200 with array of all projects from `ConfigStore.getProjects()`

  **FR-08: DELETE /api/v1/projects/:id**
  - Path param: `id` (UUID)
  - Find the project by ID in the config. If not found: return HTTP 404.
  - Call `ConfigStore.removeProject(id)`
  - Do NOT delete any files from the filesystem — only remove from the registry
  - Return HTTP 204

  **FR-06: POST /api/v1/projects/scaffold**
  - Request body: `{ name: string, path: string }`
  - Validation: same path validation as POST /api/v1/projects, but `path` directory is CREATED if it does not exist
  - Create the directory at `path` if it does not exist (`fs.mkdirSync(path, { recursive: true })`)
  - Create `<path>/.claude/` directory
  - Create `<path>/.claude/CLAUDE.md` with this starter template:
    ```markdown
    # Project: <name>

    ## Stack
    [Describe your tech stack here]

    ## Common Commands
    [Add your build, test, and lint commands here]

    ## Coding Standards
    [Add coding conventions here]

    ## Notes for Claude
    [Add any project-specific notes or constraints here]
    ```
  - Register the project in ConfigStore (same as POST /api/v1/projects)
  - Return HTTP 201 with the project record

  IMPORTANT:
  - All four endpoints require the `X-Requested-With: ClaudeCodeManager` header on mutating operations (POST, DELETE) — this is enforced by the CSRF middleware from Task #3, so no per-route check needed.
  - Mount this router in `server/index.js` at `/api/v1/projects`
  - Path validation in this task is for project registration. Deeper path validation for file writes lives in FileManager (Task #5).
  - Use `uuid` package (`import { v4 as uuidv4 } from 'uuid'`) for ID generation.

Knowledge: none
Acceptance Criteria:
  - [ ] `POST /api/v1/projects` with a valid existing directory path returns 201 and stores the project
  - [ ] `POST /api/v1/projects` with a relative path returns 400
  - [ ] `POST /api/v1/projects` with a path containing `..` returns 400
  - [ ] `POST /api/v1/projects` with a non-existent directory returns 400
  - [ ] `GET /api/v1/projects` returns all registered projects as an array
  - [ ] `DELETE /api/v1/projects/:id` removes the project from registry and returns 204
  - [ ] `DELETE /api/v1/projects/:id` on an unknown ID returns 404
  - [ ] `POST /api/v1/projects/scaffold` creates `.claude/` directory and starter `CLAUDE.md`
  - [ ] `POST /api/v1/projects/scaffold` registers the project and returns 201
  - [ ] All POST/DELETE endpoints without the CSRF header return 403
Dependencies: TASK #3
---

TASK #5: SessionManager, FileManager, and WebSocket Terminal Handler
Agent: backend-dev
Priority: HIGH
Difficulty: VERY HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Context:
  This is the most complex backend task. Implement the PTY session lifecycle management, the filesystem abstraction layer, and the WebSocket terminal handler. This covers PRD requirements FR-10 through FR-21 and FR-44 through FR-46.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  --- PART A: RingBuffer ---
  Create `server/services/RingBuffer.js`:
  - True circular buffer with FIXED capacity in bytes (not in lines)
  - Constructor: `new RingBuffer(capacityBytes)` — default 102400 (100 KB)
  - `push(data: string | Buffer)`: write bytes to the ring. If writing would exceed capacity, DISCARD the OLDEST bytes (circular overwrite) — do not grow the buffer.
  - `getAll()`: return all current contents as a single Buffer or string in order (oldest first)
  - `clear()`: reset the buffer
  - Implementation strategy: use a pre-allocated Buffer of `capacityBytes`. Track `writePos` and `length`. On push, write at `writePos`, wrap around if needed, advance `writePos`. On `getAll()`, reconstruct the ordered contents.

  --- PART B: SessionManager ---
  Create `server/services/SessionManager.js`:

  The sessions Map type: `Map<string, SessionRecord>` where:
  ```js
  SessionRecord = {
    sessionId: string,       // UUID v4
    projectId: string,
    pty: IPty,               // node-pty instance
    buffer: RingBuffer,      // 100KB fixed
    clients: Set<WebSocket>, // connected browser clients
    pid: number,
    status: "active" | "killed",
    createdAt: Date,
    lastActivityAt: Date
  }
  ```

  Methods to implement:

  `createSession(projectId, projectPath)`:
  - Validate projectPath: must be absolute, no `..`, no null bytes, must exist (`fs.accessSync`)
  - Spawn PTY: `pty.spawn(CLAUDE_BIN, [], { name: "xterm-color", cols: 80, rows: 24, cwd: projectPath, env: { ...process.env } })` — shell: false is implicit in node-pty
  - Wire the PERMANENT pty.onData handler IMMEDIATELY after spawn (before returning): `pty.onData((data) => { session.buffer.push(data); session.lastActivityAt = new Date(); session.clients.forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(data); }); })` — THIS HANDLER IS NEVER REMOVED OR PAUSED
  - Wire pty.onExit: update status to "killed", notify all clients `{ type: "session-exit", code }`, remove session from Map, remove PID from ProcessRegistry
  - Store session in sessions Map
  - Call `ProcessRegistry.addPid(pty.pid)`
  - Return the SessionRecord

  `getSession(sessionId)`: return the SessionRecord or undefined

  `getAllSessions()`: return array of all sessions with `{ sessionId, projectId, pid, status, createdAt, lastActivityAt }`

  `killSession(sessionId)`:
  - Get the session. If not found, return false.
  - Call `pty.kill()` — drain buffer first if possible (call `buffer.getAll()` to ensure data is read)
  - Update status to "killed"
  - Remove from Map
  - Call `ProcessRegistry.removePid(pid)`
  - Notify all connected clients with `{ type: "session-exit", code: 0 }`
  - Return true

  `addClient(sessionId, ws)`:
  - Get session, return false if not found or killed
  - Add `ws` to `session.clients`
  - Replay ring buffer: `ws.send(session.buffer.getAll())`
  - Return true

  `removeClient(sessionId, ws)`:
  - Get session, return early if not found
  - `session.clients.delete(ws)`
  - DO NOT KILL THE PTY

  Idle timeout sweeper (call from SessionManager constructor or init method):
  - `setInterval` every 5 minutes (300000 ms)
  - For each session in the Map where `status === "active"` AND `clients.size === 0` AND `(Date.now() - session.lastActivityAt.getTime()) > IDLE_TIMEOUT_MS`:
    - Call `killSession(sessionId)`
    - Log: `Session ${sessionId} killed due to idle timeout`
  - `IDLE_TIMEOUT_MS` defaults to 30 minutes (1800000 ms), configurable via `IDLE_TIMEOUT_MINUTES` env var

  --- PART C: Session REST Routes ---
  Create `server/routes/sessions.js`:

  `POST /api/v1/sessions` (FR-10):
  - Body: `{ projectId: string }`
  - Look up project by ID in ConfigStore. Return 404 if not found.
  - Call `SessionManager.createSession(projectId, project.path)`. Catch errors and return 500.
  - Return 201 `{ sessionId, projectId, createdAt }`

  `GET /api/v1/sessions` (FR-11):
  - Return 200 with array from `SessionManager.getAllSessions()`

  `DELETE /api/v1/sessions/:id` (FR-12):
  - Call `SessionManager.killSession(id)`. If false (not found): 404. If true: 204.

  --- PART D: WebSocket Terminal Handler ---
  Create `server/ws/terminalHandler.js`:

  This module exports a function `handleTerminalUpgrade(server, wss)` that attaches to the HTTP server's `upgrade` event. When the upgrade URL path is `/ws`:
  - Parse the `sessionId` from the URL query string
  - If no sessionId: close with code 4004 and reason "Session ID required"
  - Call `SessionManager.getSession(sessionId)`. If not found or killed: close with code 4004 and reason "Session not found"
  - Call `SessionManager.addClient(sessionId, ws)` — this replays the ring buffer
  - On `ws.message` event: parse JSON. Handle:
    - `{ type: "input", data: string }`: call `session.pty.write(data)`
    - `{ type: "resize", cols: number, rows: number }`: call `session.pty.resize(cols, rows)`
    - Unknown type: log warning and discard (do not crash — NFR-16)
  - Wrap all message parsing in try/catch. Malformed messages are logged as warnings and discarded.
  - On `ws.close` event: call `SessionManager.removeClient(sessionId, ws)`
  - WebSocket server config: `maxPayload: 1024 * 1024` (1 MB — SEC-05)
  - Backpressure: before `ws.send(data)` in the pty.onData handler, check `ws.bufferedAmount`. If > 262144 (256 KB), skip sending to that specific client (do not pause the ring buffer write).

  --- PART E: FileManager ---
  Create `server/services/FileManager.js`:
  Used for agent, skill, and CLAUDE.md file operations (Tasks #7+). Define now as a class with:
  - `validatePath(filePath, allowedBase)`: resolve the path using `path.resolve()`, assert it starts with `allowedBase`, throw an error if not
  - `readFile(filePath, allowedBase)`: validate path, return `fs.promises.readFile(filePath, 'utf8')`
  - `writeFile(filePath, content, allowedBase)`: validate path, write using `write-atomic`
  - `deleteFile(filePath, allowedBase)`: validate path, `fs.promises.unlink(filePath)`
  - `listDirectory(dirPath, allowedBase)`: validate path, `fs.promises.readdir(dirPath)`
  - `ensureDirectory(dirPath, allowedBase)`: validate path, `fs.promises.mkdir(dirPath, { recursive: true })`

  CRITICAL WINDOWS NOTES:
  - Use `process.env.APPDATA` for the ClaudeCodeManager config base
  - Use `os.homedir()` for `~/.claude/` paths (resolves to `C:\Users\<username>` on Windows)
  - YAML frontmatter regex must handle both `\n` and `\r\n`: `/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m`
  - When calling `pty.resize()`, always validate cols and rows are positive integers

  RISKS TO MITIGATE (from PRD):
  - R-02: The pty.onData handler is wired ONCE and NEVER removed — enforce this with a comment and do not add any conditional logic
  - R-05: Every spawn adds a PID to ProcessRegistry; every kill removes it
  - R-06: Drain ring buffer before pty.kill() (call `buffer.getAll()` before `pty.kill()`)

Knowledge: none
Acceptance Criteria:
  - [ ] `RingBuffer` correctly overwrites oldest bytes when capacity (100KB) is exceeded
  - [ ] `RingBuffer.getAll()` returns bytes in oldest-first order
  - [ ] `SessionManager.createSession()` spawns a PTY with `CLAUDE_BIN`, stores it in the sessions Map, and registers the PID
  - [ ] The `pty.onData` handler writes to the ring buffer AND broadcasts to all connected clients AND updates `lastActivityAt`
  - [ ] The `pty.onData` handler is never removed or paused (verified by code inspection)
  - [ ] `SessionManager.removeClient()` does NOT call `pty.kill()`
  - [ ] `SessionManager.killSession()` drains the ring buffer before calling `pty.kill()`
  - [ ] Idle sweeper runs every 5 minutes and kills sessions idle beyond the configured threshold
  - [ ] `POST /api/v1/sessions` returns 201 `{ sessionId, projectId, createdAt }`
  - [ ] `DELETE /api/v1/sessions/:id` kills the PTY and returns 204
  - [ ] WebSocket at `/ws?sessionId=<uuid>` replays the ring buffer on connection
  - [ ] WebSocket messages with type "input" write to the PTY
  - [ ] WebSocket messages with type "resize" call `pty.resize(cols, rows)`
  - [ ] WebSocket close removes the client from the session but leaves the PTY alive
  - [ ] Malformed WebSocket messages are logged and discarded without crashing
  - [ ] WebSocket server has `maxPayload: 1MB`
  - [ ] `FileManager.validatePath()` throws an error for paths outside the allowed base
  - [ ] Closing the WebSocket and reopening with the same sessionId replays the ring buffer correctly
Dependencies: TASK #3, TASK #4
---

TASK #6: React Frontend — Sidebar, TerminalView, and Session Switching
Agent: frontend-dev
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Context:
  Implement the React SPA shell, the project sidebar, and the xterm.js terminal view with session switching. This is the user-facing core of the application.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`
  All client code lives under `client/src/`.

  --- WHAT TO BUILD ---

  **1. App Shell (`client/src/App.jsx`)**
  - Layout: a sidebar on the left (~240px wide), a main content area on the right
  - The sidebar is always visible. The main area renders the active view.
  - Four views accessible from the top navigation: Terminal, Jobs, Entities, Projects
  - Global React state: `{ projects: [], sessions: Map, activeProjectId: null, activeView: "terminal" }`
  - On mount: fetch `GET /api/v1/projects` and `GET /api/v1/sessions` to populate state

  **2. Sidebar (`client/src/components/Sidebar.jsx`)**
  - List all registered projects from global state
  - Each project has: project name, a colored status indicator (green = active session, grey = no session), and a "Stop" button (visible only if a session is active)
  - The active project is highlighted (different background color)
  - Clicking a project: triggers session switching (see FR-21)
  - "Stop" button click: calls `DELETE /api/v1/sessions/:id` (with `X-Requested-With: ClaudeCodeManager` header), removes session from state
  - "Add Project" button at the bottom — opens the Projects view
  - Show the count of active sessions in the sidebar footer

  **3. Terminal Component (`client/src/components/Terminal.jsx`)**
  This is the most complex component. It wraps xterm.js and manages the WebSocket connection.

  Props: `{ sessionId, onSessionExit }`

  Behavior:
  - On mount: create `new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: "monospace" })`, create `new FitAddon()`, open the terminal in the container div ref, apply the fit addon
  - Open WebSocket: `new WebSocket("ws://127.0.0.1:<PORT>/ws?sessionId=" + sessionId)`
  - On `ws.onopen`: log connected
  - On `ws.onmessage`: `terminal.write(event.data)` (xterm.js handles the raw PTY bytes)
  - On `ws.onerror`: display error in terminal using `terminal.write("\r\nWebSocket error\r\n")`
  - On `ws.onclose`: if close code is 4004, display `"\r\nSession not found. Please create a new session.\r\n"`; if close code is 1000 (normal closure by user action), do nothing; otherwise display `"\r\nConnection lost. Attempting to reconnect...\r\n"`
  - Terminal input: `terminal.onData((data) => ws.send(JSON.stringify({ type: "input", data })))` — only when ws.readyState === WebSocket.OPEN
  - ResizeObserver on the container div: debounced 100ms, calls `fitAddon.fit()` then sends `ws.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }))` if ws is open
  - Server-sent `{ type: "session-exit", code }` message: display exit notice in terminal, call `onSessionExit()`
  - On component unmount: `ws.close()` (do NOT kill the PTY — just close the WebSocket)
  - PORT: read from `import.meta.env.VITE_PORT` with fallback to `window.location.port || "3000"`

  **4. TerminalView (`client/src/views/TerminalView.jsx`)**
  - If no active project is selected: show "Select a project from the sidebar"
  - If active project selected but no session exists: show a "Start Terminal" button
    - On click: `POST /api/v1/sessions` with `{ projectId }` and the CSRF header, get `sessionId`, store in state
  - If session exists: render the `<Terminal sessionId={sessionId} />` component
  - The terminal container must be `width: 100%, height: 100%` (fills the view)

  **5. Session Switching (FR-21)**
  When the user clicks a different project in the sidebar:
  - If the current Terminal component is mounted: its WebSocket is closed on unmount (`ws.close()`) — the PTY stays alive on the server
  - The xterm.js instance is cleared (`terminal.clear()` then `terminal.reset()`) during unmount
  - The new project's session (if it exists) is fetched; the Terminal component is mounted with the new `sessionId`
  - On mount, the new WebSocket connects, the server replays the ring buffer, and the terminal shows the previous output

  **6. Custom React hook `client/src/hooks/useSession.js`**
  Manages the session WebSocket lifecycle:
  - `useSession(sessionId)` → returns `{ ws, status: "connecting"|"open"|"closed"|"error" }`
  - Handles WebSocket creation, event wiring, and cleanup on unmount

  **7. CSRF Header Requirement**
  All fetch calls to mutating endpoints (POST, DELETE) must include:
  ```js
  headers: { "X-Requested-With": "ClaudeCodeManager", "Content-Type": "application/json" }
  ```
  Create a utility `client/src/utils/api.js` with helper functions:
  ```js
  export const apiPost = (url, body) => fetch(url, { method: "POST", headers: { "X-Requested-With": "ClaudeCodeManager", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  export const apiDelete = (url) => fetch(url, { method: "DELETE", headers: { "X-Requested-With": "ClaudeCodeManager" } });
  export const apiGet = (url) => fetch(url);
  ```

  **8. Error Handling**
  - All API fetch errors must show a user-visible error message (a toast or inline error banner), not silently fail
  - WebSocket close code 4004 must surface "Session not found" in the terminal and in a UI banner
  - Network errors on fetch must surface "Server unreachable" in a UI banner

  STYLING:
  - Use Tailwind CSS utility classes throughout
  - Dark background for the terminal area (match typical terminal look: `bg-black`)
  - Sidebar: `bg-gray-900 text-white`
  - Active project in sidebar: `bg-blue-700`
  - Use `h-screen flex` for the root layout to fill the full viewport

  xterm.js INITIALIZATION NOTES:
  - Import: `import { Terminal } from '@xterm/xterm'` and `import { FitAddon } from '@xterm/addon-fit'` (package names may be `xterm` and `xterm-addon-fit` depending on the installed version — use whichever is installed)
  - Call `terminal.open(divRef.current)` AFTER the div is in the DOM (in useEffect)
  - Always call `fitAddon.fit()` AFTER `terminal.open()` — not before
  - Do NOT share one Terminal instance across sessions without `terminal.reset()` first

Knowledge: none
Acceptance Criteria:
  - [ ] Sidebar lists all registered projects fetched from `GET /api/v1/projects`
  - [ ] Clicking a project in the sidebar makes it the active project (highlighted)
  - [ ] "Start Terminal" button in TerminalView calls `POST /api/v1/sessions` and renders the Terminal component
  - [ ] Terminal component creates an xterm.js instance and connects a WebSocket to `/ws?sessionId=<uuid>`
  - [ ] Terminal correctly displays PTY output (text appears in the xterm.js terminal)
  - [ ] Keyboard input in the terminal sends `{ type: "input", data }` WebSocket messages
  - [ ] ResizeObserver fires `fitAddon.fit()` then sends resize message, debounced 100ms
  - [ ] Switching projects closes the old WebSocket and opens a new one (verified: old PTY is not killed)
  - [ ] xterm.js terminal is cleared and reset when switching projects
  - [ ] Ring buffer replay appears in the terminal after switching back to a project
  - [ ] WebSocket close code 4004 shows "Session not found" message
  - [ ] All mutating fetch calls include the `X-Requested-With: ClaudeCodeManager` header
  - [ ] "Stop" button in sidebar calls `DELETE /api/v1/sessions/:id` and removes the session from UI state
Dependencies: TASK #5
---

TASK #7: Entity Management API — Agents, Skills, CLAUDE.md
Agent: backend-dev
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Context:
  Implement the REST API for reading, creating, editing, and deleting agent files, skill files, and CLAUDE.md files. This covers PRD requirements FR-28 through FR-40.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  --- CLAUDE CODE FILE FORMAT REFERENCE ---

  AGENT FILES:
  - User-scoped path: `path.join(os.homedir(), '.claude', 'agents', '<name>.md')`
  - Project-scoped path: `<projectPath>/.claude/agents/<name>.md`
  - Format: Markdown with YAML frontmatter block
  - Required frontmatter fields: `name` (must match `^[a-z][a-z0-9-]*$`), `description`
  - Optional fields: `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `isolation`
  - Body: the Markdown below the closing `---` is the agent's system prompt

  SKILL FILES:
  - User-scoped path: `path.join(os.homedir(), '.claude', 'skills', '<skillName>', 'SKILL.md')`
  - Project-scoped path: `<projectPath>/.claude/skills/<skillName>/SKILL.md`
  - Legacy paths (also read): `~/.claude/commands/<name>.md` and `<project>/.claude/commands/<name>.md`
  - Format: Markdown with YAML frontmatter block
  - Optional frontmatter fields: `name`, `description`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `context`, `agent`, `hooks`
  - The SKILL DIRECTORY NAME (not the `name` frontmatter field) determines the slash command name
  - Skills may contain `$ARGUMENTS` placeholder in the body — the body must not be modified when only frontmatter changes are made

  CLAUDE.MD FILES:
  - User-scoped: `path.join(os.homedir(), '.claude', 'CLAUDE.md')`
  - Project-scoped: `<projectPath>/.claude/CLAUDE.md`
  - Format: plain Markdown, no required structure
  - Recommended maximum: 300 lines

  YAML FRONTMATTER PARSING PATTERN (for agent and skill files):
  ```js
  const yaml = require('js-yaml');
  function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m);
    if (!match) return { frontmatter: {}, body: content };
    return {
      frontmatter: yaml.load(match[1]),
      body: match[2]
    };
  }
  function serializeFrontmatter(frontmatter, body) {
    return `---\n${yaml.dump(frontmatter)}---\n${body}`;
  }
  ```

  --- AGENT ROUTES (`server/routes/agents.js`) ---

  `GET /api/v1/agents?projectId=<id>` (FR-28):
  - Read all `.md` files from: `path.join(os.homedir(), '.claude', 'agents', '*.md')` (user scope) AND `<projectPath>/.claude/agents/*.md` (project scope)
  - Parse each file using `parseFrontmatter()`
  - Return array of `{ id: hash-of-filePath, name, scope: "user"|"project", filePath, frontmatter, body }`
  - Use `FileManager.listDirectory()` and `FileManager.readFile()` with appropriate allowed bases

  `POST /api/v1/agents` (FR-29):
  - Body: `{ name: string, scope: "user"|"project", projectId?: string, frontmatter: object, body: string }`
  - Validate `name` matches `^[a-z][a-z0-9-]*$`. Return 400 if not.
  - Determine file path based on scope
  - Serialize and write using `FileManager.writeFile()` with `write-atomic`
  - Return 201 with the agent record

  `PUT /api/v1/agents/:id` (FR-30):
  - Body: `{ frontmatter: object, body: string }`
  - Resolve the file path from the stored record (use the `id` → `filePath` mapping)
  - Parse existing file, merge new frontmatter and body, re-serialize
  - Write atomically
  - Return 200 with the updated agent record

  `DELETE /api/v1/agents/:id` (FR-31):
  - Resolve the file path from the stored record
  - Delete the file using `FileManager.deleteFile()`
  - Return 204

  --- SKILL ROUTES (`server/routes/skills.js`) ---

  `GET /api/v1/skills?projectId=<id>` (FR-33):
  - Scan: `~/.claude/skills/*/SKILL.md`, `<projectPath>/.claude/skills/*/SKILL.md`, `~/.claude/commands/*.md`, `<projectPath>/.claude/commands/*.md`
  - Parse each, return array of `{ id, name, scope, filePath, frontmatter, body }`
  - The `name` field defaults to the directory name if not in frontmatter

  `POST /api/v1/skills` (FR-34):
  - Body: `{ name: string, scope: "user"|"project", projectId?: string, frontmatter: object, body: string }`
  - Validate `name` matches `^[a-z0-9][a-z0-9-]*$` and length <= 64 chars
  - Create directory: `<base>/skills/<name>/`
  - Write `SKILL.md` into the directory
  - Return 201 with skill record

  `PUT /api/v1/skills/:id` (FR-35):
  - Body: `{ frontmatter: object, body: string }`
  - Parse existing SKILL.md, update frontmatter and body, re-serialize, write atomically
  - Return 200 with updated skill record

  `DELETE /api/v1/skills/:id` (FR-36):
  - Delete the entire skill directory (`fs.promises.rm(dirPath, { recursive: true, force: true })`)
  - Return 204

  --- CLAUDE.MD ROUTES (`server/routes/claudemd.js`) ---

  `GET /api/v1/claudemd?projectId=<id>` (FR-37):
  - Read user CLAUDE.md: `~/.claude/CLAUDE.md` (empty string if file does not exist)
  - Read project CLAUDE.md: `<projectPath>/.claude/CLAUDE.md` (empty string if file does not exist)
  - Return `{ userScope: { path: string, content: string }, projectScope: { path: string, content: string } }`

  `PUT /api/v1/claudemd/user` (FR-38):
  - Body: `{ content: string }`
  - Write to `~/.claude/CLAUDE.md` using `FileManager.writeFile()` with allowed base `os.homedir()/.claude/`
  - Return 200 `{ path, lineCount: content.split('\n').length }`

  `PUT /api/v1/claudemd/project` (FR-39):
  - Body: `{ content: string, projectId: string }`
  - Look up project path. Write to `<projectPath>/.claude/CLAUDE.md`
  - Return 200 `{ path, lineCount }`

  SECURITY REQUIREMENTS:
  - ALL file writes must go through `FileManager.writeFile()` which validates the path stays within the allowed base
  - Agent names must be validated against `^[a-z][a-z0-9-]*$` before any file is written
  - Skill names must be validated against `^[a-z0-9][a-z0-9-]*$` and length <= 64
  - Path traversal attempts (e.g., `name: "../../evil"`) must return 400 — FileManager.validatePath() handles this, but also validate at the route level
  - Never log the full content of agent/skill/CLAUDE.md files (SEC-08)

Knowledge: none
Acceptance Criteria:
  - [ ] `GET /api/v1/agents` returns agent files from both user-scoped and project-scoped paths, parsed correctly
  - [ ] `POST /api/v1/agents` creates the correct `.md` file in the right directory with valid YAML frontmatter
  - [ ] `POST /api/v1/agents` rejects names not matching `^[a-z][a-z0-9-]*$` with 400
  - [ ] `PUT /api/v1/agents/:id` updates the frontmatter and body atomically
  - [ ] `DELETE /api/v1/agents/:id` removes the file from disk
  - [ ] `GET /api/v1/skills` returns skills from all four scan locations (modern + legacy, user + project)
  - [ ] `POST /api/v1/skills` creates the `<name>/SKILL.md` directory structure
  - [ ] `DELETE /api/v1/skills/:id` removes the entire skill directory
  - [ ] `GET /api/v1/claudemd` returns both user and project CLAUDE.md content (empty string if file absent)
  - [ ] `PUT /api/v1/claudemd/user` writes atomically to `~/.claude/CLAUDE.md`
  - [ ] `PUT /api/v1/claudemd/project` writes atomically to `<projectPath>/.claude/CLAUDE.md`
  - [ ] Path traversal attempts in name fields return 400 and write no files
  - [ ] YAML frontmatter is parsed with `js-yaml`, not with manual string parsing
  - [ ] Windows `\r\n` line endings in frontmatter delimiters are handled correctly
Dependencies: TASK #5
---

TASK #8: Entity Management UI — AgentEditor, SkillEditor, ClaudeMdEditor
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: COMPLETED
Context:
  Implement the React UI for managing agents, skills, and CLAUDE.md files. This is the Entities view of the application, covering PRD requirements FR-28 through FR-40 on the frontend side.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`
  All client code lives under `client/src/`.

  --- ENTITIES VIEW LAYOUT (`client/src/views/EntitiesView.jsx`) ---
  Three tabs across the top: "Agents", "Skills", "CLAUDE.md"
  Each tab renders the corresponding editor/list component.
  The active project context is passed down from App state.

  --- AGENT EDITOR (`client/src/components/AgentEditor.jsx`) ---

  LIST VIEW:
  - Fetch `GET /api/v1/agents?projectId=<activeProjectId>` on mount
  - Display agents in a table/list showing: scope badge ("User" / "Project"), name, description, model
  - Each row has: "Edit" button and "Delete" button
  - "New Agent" button at the top right opens the create form

  CREATE/EDIT FORM:
  Fields to render (one input per known frontmatter field):
  - `name` (text input, required) — show validation hint: "lowercase letters and hyphens only"
  - `description` (textarea, required)
  - `tools` (text input, optional) — hint: "comma-separated, e.g. Read,Glob,Grep"
  - `disallowedTools` (text input, optional)
  - `model` (select: "inherit", "sonnet", "opus", "haiku", or custom text input)
  - `permissionMode` (select: "default", "acceptEdits", "dontAsk", "bypassPermissions", "plan")
  - `maxTurns` (number input, optional)
  - `background` (checkbox)
  - `isolation` (select: "", "worktree")
  - `memory` (select: "", "user", "project", "local")
  - Body (large textarea — the system prompt Markdown text below the frontmatter)
  - Scope selector: "User (global)" or "Project-scoped"

  ON SAVE:
  - If creating: `POST /api/v1/agents` with CSRF header
  - If editing: `PUT /api/v1/agents/:id` with CSRF header
  - After save: display a PERSISTENT yellow warning banner: "Restart the Claude session for this agent to take effect." (FR-32). This banner must not auto-dismiss.
  - Refresh the agent list

  ON DELETE:
  - Show a confirmation dialog: "Delete agent '<name>'? This cannot be undone."
  - `DELETE /api/v1/agents/:id` with CSRF header
  - Refresh the agent list

  --- SKILL EDITOR (`client/src/components/SkillEditor.jsx`) ---

  LIST VIEW:
  - Fetch `GET /api/v1/skills?projectId=<activeProjectId>`
  - Table showing: scope badge, name, description, argument-hint
  - "Edit" and "Delete" buttons per row
  - "New Skill" button

  CREATE/EDIT FORM:
  Fields:
  - `name` (text input, required) — this becomes the directory name and slash command name
  - `description` (textarea, recommended)
  - `argument-hint` (text input, optional) — hint: "e.g. [issue-number]"
  - `disable-model-invocation` (checkbox)
  - `user-invocable` (checkbox, default true)
  - `allowed-tools` (text input, optional)
  - `model` (text input, optional)
  - Body (large textarea) — the skill content with `$ARGUMENTS` placeholder support
  - Scope selector

  ON SAVE:
  - POST or PUT with CSRF header
  - NO restart warning for skills — skills are detected live. Show a success toast instead: "Skill saved. Changes take effect immediately."
  - Refresh skill list

  ON DELETE:
  - Confirmation dialog
  - `DELETE /api/v1/skills/:id` with CSRF header

  --- CLAUDE.MD EDITOR (`client/src/components/ClaudeMdEditor.jsx`) ---

  TWO PANELS SIDE BY SIDE (or stacked on narrow viewports):
  Left panel: "User CLAUDE.md" (global, applies to all projects)
  Right panel: "Project CLAUDE.md" (scoped to the active project)

  Each panel contains:
  - A label showing the file path
  - A large textarea (monospace font) for the Markdown content
  - A line count indicator: "X lines" in grey text
  - A YELLOW WARNING BANNER (visible when line count > 300): "Warning: CLAUDE.md exceeds 300 lines. Claude may not read all content due to context window limits." (FR-40)
  - A "Save" button

  ON LOAD:
  - `GET /api/v1/claudemd?projectId=<activeProjectId>`
  - Populate both textareas

  ON SAVE:
  - User scope: `PUT /api/v1/claudemd/user` with CSRF header
  - Project scope: `PUT /api/v1/claudemd/project` with CSRF header
  - Show success toast

  LINE COUNT TRACKING:
  - Compute `content.split('\n').length` on every textarea change (or debounce at 200ms)
  - Update the indicator live as the user types

  GENERAL UI NOTES:
  - All API calls use the `apiPost`, `apiDelete`, `apiGet` helpers from `client/src/utils/api.js` (created in Task #6)
  - Error responses from the API must display an error message to the user (inline banner or toast)
  - Loading states (while fetching) should show a spinner or "Loading..." text
  - Form validation: required fields show inline error messages if empty on submit attempt

Knowledge: none
Acceptance Criteria:
  - [ ] AgentEditor lists all agents from both user and project scope with scope badges
  - [ ] AgentEditor create form has all documented frontmatter fields
  - [ ] Saving an agent via the form calls the correct API endpoint with CSRF header
  - [ ] The "restart required" yellow banner appears after every agent save and does not auto-dismiss
  - [ ] Delete agent shows confirmation dialog before calling the API
  - [ ] SkillEditor lists all skills with scope badges
  - [ ] Saving a skill shows a success toast (no restart warning)
  - [ ] ClaudeMdEditor shows both user-scoped and project-scoped CLAUDE.md content
  - [ ] ClaudeMdEditor shows a live line count indicator
  - [ ] Yellow warning banner appears when CLAUDE.md exceeds 300 lines
  - [ ] All mutating fetch calls include `X-Requested-With: ClaudeCodeManager`
  - [ ] API errors surface as visible error messages (not silent failures)
Dependencies: TASK #7, TASK #6
---

TASK #9: Job Mode API — JobRunner and SSE Streaming
Agent: backend-dev
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Context:
  Implement the Job Mode backend: spawning `claude -p` in headless mode, streaming output via Server-Sent Events (SSE), and cancellation via tree-kill. This covers PRD requirements FR-22 through FR-25.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  --- JOBRUNNER SERVICE (`server/services/JobRunner.js`) ---

  The jobs Map type: `Map<string, JobRecord>` where:
  ```js
  JobRecord = {
    jobId: string,          // UUID v4
    projectId: string,
    prompt: string,
    allowedTools: string,
    maxTurns: number,
    child: ChildProcess,
    clients: Set<SseResponse>,  // SSE response objects
    status: "running" | "done" | "cancelled" | "error",
    result: string | null,  // Markdown result from final stream-json event
    createdAt: Date,
    completedAt: Date | null
  }
  ```

  `startJob(projectId, projectPath, prompt, allowedTools, maxTurns)`:
  - Validate projectPath: absolute, no `..`, no null bytes, exists
  - Spawn:
    ```js
    const child = child_process.spawn(CLAUDE_BIN, [
      "-p", prompt,
      "--output-format", "stream-json",
      "--allowedTools", allowedTools ?? "all",
      "--max-turns", String(maxTurns ?? 10),
      "--no-session-persistence"
    ], {
      cwd: projectPath,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false    // MANDATORY — SEC-02
    });
    child.stdin.end(); // CRITICAL: close stdin immediately — GitHub issue #7497
    ```
  - Generate UUID jobId
  - Store in jobs Map
  - Wire stdout reading using `readline.createInterface({ input: child.stdout })`:
    - For each line: try JSON.parse. On success: forward the parsed event to all clients via SSE.
    - On parse error: forward as a raw text event `{ type: "raw", data: line }`
    - Track the last event seen to extract `result` field on completion
  - Wire `child.stderr` to log warnings (not to clients — SEC-08: do not log full prompt content)
  - Wire `child.on('close', (code) => { ... })`:
    - Update job status to "done" (or "error" if code !== 0)
    - Set `completedAt`
    - Extract `result` from the last stream-json event that contained a `result` field
    - Send `{ type: "done", result: job.result, exitCode: code }` to all SSE clients
    - Close all SSE connections
  - Return `{ jobId, projectId, createdAt }`

  `cancelJob(jobId)`:
  - Get job. Return false if not found or not running.
  - Call `treeKill(child.pid, 'SIGTERM', (err) => { ... })`  — use `tree-kill` package
  - Update status to "cancelled"
  - Send `{ type: "cancelled" }` to all SSE clients
  - Close all SSE connections
  - Return true

  `addSseClient(jobId, res)`:
  - Get job. Return false if not found.
  - Set SSE headers on `res`: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - Add `res` to `job.clients`
  - If the job is already done/cancelled/error: send the final status event immediately and close the connection
  - Wire `res.on('close', () => job.clients.delete(res))` — client disconnect cleanup

  SSE event format:
  ```
  data: <JSON string>\n\n
  ```
  Helper: `sendSse(res, data) => res.write("data: " + JSON.stringify(data) + "\n\n")`

  --- JOB ROUTES (`server/routes/jobs.js`) ---

  `POST /api/v1/jobs` (FR-22):
  - Body: `{ projectId: string, prompt: string, allowedTools?: string, maxTurns?: number }`
  - Look up project in ConfigStore. 404 if not found.
  - Validate prompt is non-empty string. 400 if not.
  - Call `JobRunner.startJob(...)`. Catch errors → 500.
  - Return 201 `{ jobId, projectId, createdAt }`

  `GET /api/v1/jobs/:id/stream` (FR-23) — SSE endpoint:
  - Set SSE headers
  - Call `JobRunner.addSseClient(jobId, res)`. If false (job not found): return 404.
  - Do NOT close `res` — it stays open until the job completes or client disconnects
  - This endpoint does NOT have a response body timeout (disable Express's default timeout for this route)

  `DELETE /api/v1/jobs/:id` (FR-25):
  - Call `JobRunner.cancelJob(jobId)`. If false: 404. If true: 204.

  `GET /api/v1/jobs` (bonus, not in PRD but useful):
  - Return all jobs with `{ jobId, projectId, status, createdAt, completedAt }` (no prompt or result in the list — SEC-08)

  CRITICAL IMPLEMENTATION NOTES:
  - `child.stdin.end()` MUST be called immediately after spawn. This is the fix for GitHub issue #7497 (process hangs indefinitely otherwise). Add a code comment citing the issue.
  - Use `readline` module (built into Node.js) to read stdout line by line — do NOT buffer all stdout and parse at the end.
  - `tree-kill` is required for `cancelJob` — `child.kill()` alone does not kill Claude's sub-processes on Windows.
  - `shell: false` must be set (implicit by default in spawn, but be explicit — SEC-02).
  - Never log the prompt content (SEC-08).
  - Wrap all stream-json parsing in try/catch — malformed lines from Claude must not crash the server (NFR-16).

Knowledge: none
Acceptance Criteria:
  - [ ] `POST /api/v1/jobs` spawns a `claude -p` child process and returns 201 `{ jobId, projectId, createdAt }`
  - [ ] `child.stdin.end()` is called immediately after spawn (comment in code cites GitHub issue #7497)
  - [ ] `shell: false` is set on the spawn call
  - [ ] `GET /api/v1/jobs/:id/stream` opens an SSE stream and sends events as the job progresses
  - [ ] Each line from `child.stdout` is parsed as JSON and forwarded as an SSE event
  - [ ] On job completion, a `{ type: "done", result: string }` SSE event is sent
  - [ ] `DELETE /api/v1/jobs/:id` calls `tree-kill(child.pid)` and returns 204
  - [ ] After cancellation, the server accepts new job submissions without crashing
  - [ ] Malformed JSON lines from Claude stdout are handled gracefully without crashing
  - [ ] Prompt content is never logged (verify by code inspection)
  - [ ] SSE connection stays open until job completes or client disconnects
Dependencies: TASK #3, TASK #4
---

TASK #10: Job Mode UI — JobPanel and react-markdown Result Rendering
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: COMPLETED
Context:
  Implement the Job Mode frontend — a UI for submitting prompts to Claude in headless mode, watching streaming progress, cancelling jobs, and viewing formatted Markdown results. Covers PRD FR-26 and FR-27.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`
  All client code lives under `client/src/`.

  --- JOB VIEW (`client/src/views/JobView.jsx`) ---

  Layout: two columns or stacked:
  - Left/top: the job submission form (JobPanel)
  - Right/bottom: the job history list (past results from the current browser session)

  --- JOB PANEL (`client/src/components/JobPanel.jsx`) ---

  SUBMISSION FORM:
  - Prompt textarea (large, ~6 rows) — required field, placeholder: "Enter a prompt for Claude..."
  - Expandable "Advanced Options" section (collapsed by default):
    - "Allowed Tools" text input — default: "all", hint: "Comma-separated, e.g. Read,Bash,Edit or 'all'"
    - "Max Turns" number input — default: 10, min: 1, max: 100
  - "Run" button — disabled while a job is running, re-enabled when no active job
  - "Cancel" button — only visible while a job is running

  JOB SUBMISSION FLOW:
  1. User clicks "Run": call `POST /api/v1/jobs` with `{ projectId: activeProjectId, prompt, allowedTools, maxTurns }` + CSRF header
  2. Get `{ jobId }` from response
  3. Open EventSource: `new EventSource("/api/v1/jobs/" + jobId + "/stream")`
  4. Show streaming progress area below the form

  STREAMING PROGRESS DISPLAY:
  - While job is running: show a spinner + "Claude is working..."
  - Accumulate raw text from the SSE events into a scrollable `<pre>` or text area (show live output as it arrives — partial tokens from stream-json events)
  - When `{ type: "done", result }` is received: close the EventSource, hide the spinner, add the completed job to the history list, clear the streaming area
  - When `{ type: "cancelled" }` is received: close the EventSource, show "Job cancelled" message

  CANCELLATION:
  - "Cancel" button click: call `DELETE /api/v1/jobs/:jobId` with CSRF header
  - The SSE stream will receive `{ type: "cancelled" }` and close

  JOB HISTORY:
  - Maintain a list of completed jobs in React state (NOT persisted across page reload — FR-27 says "duration of browser session")
  - Each job entry shows:
    - Project name
    - First 100 chars of the prompt (truncated with "...")
    - Timestamp
    - Status badge (done / cancelled / error)
    - The full result rendered as Markdown (collapsed by default, expandable with a "View Result" toggle)

  MARKDOWN RESULT RENDERING:
  - Use `react-markdown` with `remark-gfm` plugin
  - NEVER use `dangerouslySetInnerHTML` for result rendering (R-08 XSS risk)
  - Apply Tailwind prose styles to the rendered Markdown:
    ```jsx
    import ReactMarkdown from 'react-markdown';
    import remarkGfm from 'remark-gfm';
    <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
      {result}
    </ReactMarkdown>
    ```
  - Code blocks should use monospace font and a slightly different background
  - Tables should render with borders and proper column alignment (remark-gfm handles this)

  CUSTOM HOOK (`client/src/hooks/useJob.js`):
  - `useJob(jobId)` → returns `{ status, events: [], result: string | null, cancel: () => void }`
  - Manages EventSource creation and cleanup
  - Accumulates streaming events
  - Calls `DELETE /api/v1/jobs/:id` on `cancel()`
  - Closes EventSource on unmount

  ERROR HANDLING:
  - If `POST /api/v1/jobs` returns non-200: show error banner "Failed to start job: <error message>"
  - If the EventSource connection fails: show error banner "Lost connection to job stream"
  - If the job ends with status "error": show error banner "Job failed" with the exit code

  ACTIVE PROJECT REQUIREMENT:
  - If no active project is selected: show "Select a project from the sidebar to run a job"
  - The "Run" button is disabled if no active project is selected

Knowledge: none
Acceptance Criteria:
  - [ ] Prompt textarea and "Run" button are present in the Job view
  - [ ] Clicking "Run" calls `POST /api/v1/jobs` with CSRF header and the prompt/tool/turns config
  - [ ] EventSource is opened for the returned `jobId` and streaming events display in the UI
  - [ ] Spinner and "Claude is working..." text are shown while the job is running
  - [ ] Completed job result is rendered using `react-markdown` with `remark-gfm`
  - [ ] Markdown tables and code blocks render correctly
  - [ ] "Cancel" button is visible during a running job and calls `DELETE /api/v1/jobs/:id` with CSRF header
  - [ ] The SSE stream closes after cancellation and the UI reflects the cancelled status
  - [ ] Completed jobs persist in the history list for the duration of the browser session
  - [ ] "View Result" toggle expands/collapses the Markdown result per job entry
  - [ ] No active project: "Run" button is disabled with an informational message
  - [ ] `dangerouslySetInnerHTML` is NOT used anywhere in result rendering
  - [ ] API errors surface as visible error banners
Dependencies: TASK #9, TASK #6
---

TASK #11: Projects View UI
Agent: frontend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  Implement the Projects view, which is where the user registers existing projects or scaffolds new ones.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`
  File to create: `client/src/views/ProjectsView.jsx`

  This view is accessible from the main navigation and shows the full project list with management options.

  --- WHAT TO BUILD ---

  PROJECTS TABLE:
  - Fetch `GET /api/v1/projects` on mount (same data as the sidebar, but in a table format here)
  - Table columns: Name, Path, Created Date, Active Session (yes/no), Actions
  - Actions column: "Remove" button (calls DELETE /api/v1/projects/:id)
  - "Remove" shows a confirmation: "Remove '<name>' from registry? This does not delete any files."

  REGISTER EXISTING PROJECT (modal or inline form):
  - Triggered by "Register Project" button
  - Fields:
    - Name (text input, required)
    - Directory Path (text input, required, hint: "Full path to the project directory, e.g. C:\Users\you\myproject")
  - Submit: `POST /api/v1/projects` with CSRF header
  - On success: close the form, refresh the projects list, show success toast

  SCAFFOLD NEW PROJECT (modal or inline form):
  - Triggered by "New Project" button
  - Fields:
    - Project Name (text input, required)
    - Directory Path (text input, required, hint: "Path where the new project will be created")
  - Submit: `POST /api/v1/projects/scaffold` with CSRF header
  - On success: show "Project scaffolded at <path>. `.claude/` and `CLAUDE.md` have been created.", close form, refresh list

  ERROR HANDLING:
  - 400 from the API (invalid path): show inline error below the path field
  - 404 from DELETE: show "Project not found" toast

  Use the `apiPost`, `apiDelete`, `apiGet` utilities from `client/src/utils/api.js`.
  All mutating calls include `X-Requested-With: ClaudeCodeManager` header.

Knowledge: none
Acceptance Criteria:
  - [ ] Projects table lists all registered projects with name, path, created date, and actions
  - [ ] "Remove" button shows confirmation before calling DELETE
  - [ ] "Register Project" form validates and calls `POST /api/v1/projects`
  - [ ] "New Project" form calls `POST /api/v1/projects/scaffold` and shows success message
  - [ ] API errors (400, 404) surface as user-visible messages
  - [ ] After any add/remove action, the project list refreshes
  - [ ] All mutating calls include the CSRF header
Dependencies: TASK #4, TASK #6
---

TASK #12: Non-Functional Requirements — Performance, Reliability, Startup Polish
Agent: backend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: COMPLETED
Context:
  Implement the non-functional requirements from PRD Section 9 that are not yet covered by previous tasks.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  WHAT TO IMPLEMENT:

  1. **NFR-13/14: npm start auto-browser-open and startup timing**
     - After `server.listen()` resolves, call `open("http://127.0.0.1:<PORT>")` using the `open` npm package
     - Log the startup message: `Claude Code Visual Manager running at http://127.0.0.1:<PORT>`
     - Verify the startup (from dependencies installed) takes under 5 seconds

  2. **NFR-15: Port logging**
     - Log the listening address and port clearly on startup

  3. **NFR-16: Malformed WebSocket message resilience**
     - Verify (and add if missing) that all WebSocket message handlers are wrapped in try/catch
     - Malformed messages log a WARNING (not an error) and are discarded without crashing the server

  4. **NFR-17: PTY unexpected exit handling**
     - In SessionManager, the `pty.onExit` handler must:
       - Set `session.status = "killed"`
       - Broadcast `{ type: "session-exit", code }` to all connected WebSocket clients
       - Remove the session from the Map
       - Call `ProcessRegistry.removePid(pid)`
       - Log: `PTY session ${sessionId} exited with code ${code}`
     - The server must NOT crash when a PTY exits unexpectedly

  5. **NFR-18: Write failure handling**
     - In `FileManager.writeFile()`, catch errors from `write-atomic` and throw an error with a descriptive message
     - In the route handlers for agents, skills, and CLAUDE.md, catch write errors and return HTTP 500 with `{ error: "Write failed: disk may be full" }`
     - The existing file must not be corrupted (write-atomic guarantees this — document the guarantee in a comment)

  6. **NFR-07: Ring buffer memory cap enforcement**
     - Add a check: if `SESSION_COUNT * 100KB > 50MB`, log a WARNING: "High memory usage: N active sessions"
     - This check runs in the idle sweeper loop

  7. **NFR-02: Session switching performance**
     - Verify the ring buffer `getAll()` method returns data fast enough for 100KB in under 500ms (it should be, since it's in-memory)
     - Add a comment noting the performance characteristic

  8. **FR-03: Version check startup warning**
     - After discovering the Claude binary and logging its version, parse the version string and compare to minimum version "1.0.0"
     - If below minimum: log a WARNING (not an error, do not exit): `WARNING: Claude Code version ${version} is below the minimum tested version 1.0.0. Some features may not work correctly.`

  9. **Session count in UI**
     - The `GET /api/v1/sessions` response should include a `total` field
     - The React sidebar footer should display "N active sessions" using this data

Knowledge: none
Acceptance Criteria:
  - [ ] `npm start` opens the browser automatically at the correct URL
  - [ ] Startup log message includes the full URL with port
  - [ ] Malformed WebSocket messages are caught, logged as warnings, and do not crash the server
  - [ ] PTY unexpected exit updates session status to "killed" and notifies connected clients
  - [ ] Write failures in FileManager return HTTP 500 without corrupting existing files
  - [ ] High session count (>5) logs a memory warning
  - [ ] Claude version below minimum logs a warning without exiting
  - [ ] Active session count is visible in the React sidebar footer
Dependencies: TASK #5, TASK #6
---

TASK #13: Full QA Test Suite — All 6 Critical Paths + Regression Tests
Agent: qa-tester
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Context:
  Write and execute a comprehensive test suite covering all 6 QA critical paths defined in the PRD, plus unit tests for the core services. This task runs AFTER all backend and frontend implementation tasks are complete.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  --- CRITICAL PATH TESTS (from PRD QA section) ---

  **Critical Path 1 — PTY Persistence:**
  1. Register a project
  2. Open the project terminal
  3. Run a command that takes ~5 seconds (e.g., type `ping 127.0.0.1 -n 5`)
  4. Close the browser tab (or navigate away from the terminal view) WHILE the command is running
  5. Wait 10 seconds
  6. Navigate back to the terminal view for the same project
  7. VERIFY: the command completed and its output is present after reconnect
  8. VERIFY: the PTY process did NOT die (check with `GET /api/v1/sessions`)

  **Critical Path 2 — Session Switching:**
  1. Register two projects (A and B)
  2. Open both terminal sessions
  3. Type text into terminal A — note the output
  4. Switch to terminal B — type different text
  5. Switch back to terminal A
  6. VERIFY: terminal A shows its own output (not terminal B's)
  7. VERIFY: both Claude processes are alive (`GET /api/v1/sessions` returns 2 sessions)
  8. VERIFY: the ring buffer replay correctly restores terminal A's output

  **Critical Path 3 — Job Mode Hang Prevention:**
  1. Select a project
  2. Submit a simple job prompt (e.g., "What is 2 + 2?")
  3. VERIFY: the SSE stream begins within 1 second
  4. VERIFY: the job completes (does not hang indefinitely)
  5. VERIFY: the result is rendered as Markdown in the UI
  6. VERIFY: the server accepts new job submissions after the first job completes
  7. VERIFY: `GET /api/v1/sessions` still responds correctly after the job (server is not frozen)

  **Critical Path 4 — Orphan Process Cleanup:**
  1. Start two PTY sessions
  2. Kill the Node.js server process with Ctrl+C
  3. Open Windows Task Manager
  4. VERIFY: no `claude.exe` or `conhost.exe` processes remain that were spawned by the app
  5. Restart the server
  6. VERIFY: server starts cleanly (stale PID cleanup runs, no errors about orphan processes)

  **Critical Path 5 — File Write Path Traversal:**
  1. Use `curl` or a REST client to send: `POST /api/v1/agents` with body `{ "name": "../../evil", "scope": "user", "frontmatter": {}, "body": "" }` and the CSRF header
  2. VERIFY: server returns HTTP 400
  3. VERIFY: no file was written outside the expected agents directory
  4. Also test with skill name containing path traversal: `POST /api/v1/skills` with `{ "name": "../../../evil" }`
  5. VERIFY: HTTP 400 and no file written

  **Critical Path 6 — Job Cancellation:**
  1. Submit a job with a complex, long-running prompt (e.g., "Write a 10,000 word essay on the history of computing")
  2. While the job is running, click "Cancel"
  3. VERIFY: `DELETE /api/v1/jobs/:id` returns 204
  4. Open Windows Task Manager immediately after cancellation
  5. VERIFY: the `claude.exe` child process and any sub-processes are terminated
  6. VERIFY: the server accepts a new job submission after cancellation (not stuck)

  --- UNIT TESTS ---

  Write unit tests for (using Node.js built-in `node:test` or Jest — choose one):

  **RingBuffer tests:**
  - `push` stores data and `getAll` returns it in order
  - `push` when data exceeds capacity drops the oldest bytes, not the newest
  - Multiple sequential pushes that cumulatively exceed capacity maintain correct order
  - `clear()` resets the buffer

  **SessionManager tests (with mocked node-pty):**
  - `createSession` stores a record in the Map
  - `removeClient` does NOT call `pty.kill()`
  - `killSession` removes the session from the Map
  - Idle sweeper calls `killSession` for sessions that have been idle longer than the threshold
  - Idle sweeper does NOT kill sessions that still have connected clients

  **FileManager tests:**
  - `validatePath` throws for paths outside the allowed base
  - `validatePath` throws for paths containing `..`
  - `validatePath` throws for paths containing null bytes
  - `validatePath` accepts valid paths within the allowed base

  **CSRF middleware tests:**
  - POST without `X-Requested-With` header returns 403
  - POST with correct `X-Requested-With: ClaudeCodeManager` header passes through
  - GET without `X-Requested-With` header passes through

  Create test files in `server/tests/` or use a `__tests__` convention. Write a `npm test` script in the root `package.json` that runs the test suite.

Knowledge: none
Acceptance Criteria:
  - [ ] All 6 critical paths are executed manually and pass
  - [ ] RingBuffer unit tests pass (all 4 test cases)
  - [ ] SessionManager unit tests pass (all 5 test cases with mocked PTY)
  - [ ] FileManager unit tests pass (all 4 path validation test cases)
  - [ ] CSRF middleware unit tests pass (all 3 test cases)
  - [ ] `npm test` runs the unit tests and reports results
  - [ ] Critical Path 4 (orphan cleanup) verified in Windows Task Manager
  - [ ] Critical Path 5 (path traversal) returns 400 and writes no files
  - [ ] Test results are documented in a file at `docs/TEST_RESULTS.md`
Dependencies: TASK #5, TASK #6, TASK #7, TASK #8, TASK #9, TASK #10, TASK #11, TASK #12
---

TASK #14: Pre-Release Security Audit
Agent: security
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: COMPLETED
Context:
  Perform a full security audit of the completed application before v1 release. All 10 security requirements from PRD Section 8 must be verified. This runs in parallel with TASK #13 and TASK #15.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  --- SECURITY CHECKLIST (all 10 items are mandatory) ---

  **SEC-01: Bind to 127.0.0.1 only**
  - Code audit: find every `server.listen()` call. Verify the second argument is `"127.0.0.1"` — NOT `"0.0.0.0"` and NOT omitted.
  - Runtime check: after `npm start`, run `netstat -an | findstr LISTENING` and confirm the application port appears only as `127.0.0.1:<PORT>`, not `0.0.0.0:<PORT>`.

  **SEC-02: No `shell: true` in any child_process call**
  - Search all files for `shell: true` or `shell:true` — there must be zero matches in spawn calls.
  - Search for every `spawn(` and `spawnSync(` call and verify arguments are arrays, not strings.
  - Document each spawn call site and its argument format.

  **SEC-03: Working directory path validation**
  - Send `POST /api/v1/projects` with `{ name: "test", path: "relative/path" }` — verify 400.
  - Send `POST /api/v1/projects` with `{ name: "test", path: "C:\\..\\Windows" }` — verify 400.
  - Send `POST /api/v1/projects` with `{ name: "test", path: "C:\\valid\\path\0evil" }` (null byte) — verify 400.
  - Send `POST /api/v1/sessions` with a valid projectId where the path was registered with a `..` component — verify the session spawn is rejected.

  **SEC-04: File write path validation**
  - Send `POST /api/v1/agents` with `{ name: "../../evil", scope: "user", ... }` — verify 400 and no file written.
  - Send `PUT /api/v1/claudemd/user` with `{ content: "x" }` but intercept and modify the path in the server request to something outside `~/.claude/` — verify rejection. (Test FileManager.validatePath directly in unit tests.)
  - Verify FileManager.validatePath uses `path.resolve()` — not string prefix matching — to prevent bypass.

  **SEC-05: WebSocket message size caps and backpressure**
  - Code audit: find the `WebSocketServer` constructor and verify `maxPayload: 1024 * 1024` is set.
  - Code audit: find the `pty.onData` broadcast loop and verify there is a `ws.bufferedAmount` check before sending.

  **SEC-06: CSRF protection**
  - Send `POST /api/v1/sessions` WITHOUT `X-Requested-With` header — verify HTTP 403.
  - Send `DELETE /api/v1/sessions/fake-id` WITHOUT `X-Requested-With` header — verify HTTP 403.
  - Send `GET /api/v1/projects` WITHOUT `X-Requested-With` header — verify pass-through (not 403).
  - Send `POST /api/v1/sessions` WITH `X-Requested-With: ClaudeCodeManager` — verify not 403.

  **SEC-07: Security headers via helmet**
  - Make a `GET /` request and inspect the response headers:
    - `X-Content-Type-Options: nosniff` must be present
    - `X-Frame-Options: DENY` must be present
    - `X-Powered-By` must be absent
    - `Content-Security-Policy` must be present and include `script-src 'self'`

  **SEC-08: No sensitive data in logs**
  - Submit a job with prompt "My API key is sk-ant-TESTKEY123456". After the job completes, scan all log output for "TESTKEY123456". Verify it does not appear.
  - Verify the server does not log the full content of any file read via the agents/skills/CLAUDE.md endpoints.
  - Code audit: search for `console.log` calls that might include `prompt`, `content`, `token`, or `key` variables.

  **SEC-09: PTY process lifecycle management**
  - Code audit: verify `process.on('exit')`, `process.on('SIGTERM')`, `process.on('SIGINT')` are all registered.
  - Code audit: verify each handler iterates the sessions Map and calls `pty.kill()`.
  - Test: start two sessions, send SIGTERM to the server process, verify no orphan processes in Task Manager.
  - Code audit: verify idle sweeper calls `pty.kill()` and removes sessions from the Map.

  **SEC-10: npm audit**
  - Run `npm audit --audit-level=high` in both `server/` and `client/` directories.
  - If any high or critical vulnerabilities are found: resolve them (update package versions or apply patches) before marking this task complete.
  - Document the audit results in `docs/SECURITY_AUDIT.md`.

  --- OUTPUT ---
  Write a full report to `docs/SECURITY_AUDIT.md` documenting:
  - Pass/fail status for each of the 10 requirements
  - Evidence (command output, code snippets, test results) for each check
  - Any vulnerabilities found and how they were resolved
  - The `npm audit` output

Knowledge: none
Acceptance Criteria:
  - [ ] SEC-01: netstat confirms app port bound to 127.0.0.1 only
  - [ ] SEC-02: zero `shell: true` occurrences in any spawn call; all arguments are arrays
  - [ ] SEC-03: relative path, `..` path, and null-byte path all return 400
  - [ ] SEC-04: path traversal in agent/skill name returns 400 and writes no file outside expected base
  - [ ] SEC-05: `maxPayload: 1MB` on WebSocketServer; `bufferedAmount` check in broadcast loop
  - [ ] SEC-06: POST without CSRF header returns 403; GET without header passes through
  - [ ] SEC-07: helmet headers present on all responses (X-Content-Type-Options, X-Frame-Options, CSP)
  - [ ] SEC-08: job prompt content does not appear in log output
  - [ ] SEC-09: SIGTERM kills all active PTY sessions (verified in Task Manager)
  - [ ] SEC-10: `npm audit --audit-level=high` reports zero high/critical vulnerabilities
  - [ ] `docs/SECURITY_AUDIT.md` exists with pass/fail evidence for all 10 items
Dependencies: TASK #5, TASK #7, TASK #9, TASK #12
---

TASK #15: Documentation — README, Architecture Summary, Troubleshooting
Agent: documenter
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  Write the user-facing README and supporting documentation for the Claude Code Visual Manager.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  --- WHAT TO WRITE ---

  **1. `README.md` (in the repo root)**

  Sections:
  - **Overview**: 2-3 sentence description of what the app does
  - **Prerequisites**:
    - Node.js 20 LTS (link to nodejs.org)
    - Claude Code CLI installed and on PATH (link to Claude Code docs)
    - Windows 11 23H2 or later (primary supported platform)
  - **Installation**:
    ```
    git clone <repo>
    cd <repo>
    npm install
    ```
  - **Usage**:
    ```
    npm start
    ```
    The browser will open automatically at `http://127.0.0.1:3000`.
  - **Features**: bullet list of all major features (terminal mode, job mode, agent editor, skill editor, CLAUDE.md editor, project management)
  - **Configuration**: `PORT` env var to change port, `IDLE_TIMEOUT_MINUTES` env var
  - **Troubleshooting**:
    - "claude not found on PATH": install Claude Code, add to PATH, or set `CLAUDE_BIN` env var
    - "node-pty build failure (MSVC error)": install MSVC Build Tools as a fallback; explain that `node-pty-prebuilt-multiarch` should handle most cases
    - "Sessions not surviving browser close": check if the server is still running (the server must stay running for sessions to persist)
    - "Cannot connect to http://127.0.0.1:3000": check that npm start completed without errors; check that port 3000 is not in use by another process
    - "conhost.exe or claude.exe still running after server stop": run the stale cleanup by restarting the server once; or kill manually in Task Manager
  - **Security note**: briefly explain why no authentication is needed (localhost-only, 127.0.0.1 binding)
  - **Known limitations** (v1): no auth, Windows-primary, no Git UI, no MCP editor
  - **Development** (for contributors): `npm run dev` for hot-reload, project structure overview

  **2. Update `docs/memory/PROJECT.md`**
  Fill in the project memory file with:
  - What it is: description
  - Tech stack table (copy from PRD)
  - Core goals (from PRD Goals section)
  - Key constraints (node-pty on main thread, 127.0.0.1 only, Windows 11 primary, no shell:true)

  **3. Update `docs/memory/PROGRESS.md`**
  Mark all completed tasks as done (once Task #13 and #14 confirm all tests pass).

Knowledge: none
Acceptance Criteria:
  - [ ] `README.md` exists in the repo root with all documented sections
  - [ ] Prerequisites section lists Node.js 20, Claude Code CLI, and Windows 11 23H2
  - [ ] Troubleshooting section covers all listed scenarios
  - [ ] `docs/memory/PROJECT.md` is updated with accurate tech stack and constraints
  - [ ] `docs/memory/PROGRESS.md` reflects the final project state
  - [ ] README is clear enough for a developer unfamiliar with the project to install and run it
Dependencies: TASK #13, TASK #14
---

TASK #16: Security Hardening — Replace exec() in openBrowser with shell:false spawn
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  The security audit (docs/SECURITY_AUDIT.md) identified MEDIUM-01: the `openBrowser()` function in
  `server/index.js` uses Node's `exec()` — which passes a string to the OS shell — instead of
  `spawn()` or `execFile()` with `shell: false`. While not exploitable today (PORT is always an
  integer and the URL is constructed from hardcoded strings), it deviates from the project's
  `shell: false` policy (SEC-02) and introduces a latent risk if the URL-construction logic
  ever changes to include user-controlled data.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  FILE TO MODIFY: `server/index.js`
  CURRENT CODE (approximate location: server/index.js lines 48–54):
  ```js
  function openBrowser(url) {
    const cmd = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, (err) => { if (err) console.error('[startup] Failed to open browser:', err.message); });
  }
  ```

  REQUIRED FIX (replace with spawn, shell: false):
  ```js
  function openBrowser(url) {
    let bin, args;
    if (process.platform === 'win32') {
      bin = 'cmd.exe'; args = ['/c', 'start', '', url];
    } else if (process.platform === 'darwin') {
      bin = 'open'; args = [url];
    } else {
      bin = 'xdg-open'; args = [url];
    }
    const child = spawn(bin, args, { shell: false, detached: true, stdio: 'ignore' });
    child.on('error', (err) => console.error('[startup] Failed to open browser:', err.message));
    child.unref();
  }
  ```
  Make sure to remove the `exec` import from `child_process` if it is no longer used elsewhere,
  or keep it only if it is used in other locations. Do NOT remove `spawn` — it is already imported
  and used in other parts of the file. Verify that `npm run build` still succeeds after the change.

  CONSTRAINT: `shell: false` must be explicit. Do not use `execFile` with a shell-expanded string.
  Do not introduce any new npm dependencies.

Acceptance Criteria:
  - [ ] `openBrowser()` in server/index.js uses `spawn` (or `execFile`) with `shell: false`
  - [ ] No shell string interpolation of the URL — URL is passed as a plain array argument
  - [ ] `exec` import removed from `child_process` destructure if no longer used elsewhere
  - [ ] `child.unref()` called so the detached process does not block server shutdown
  - [ ] `npm run build` passes with 0 errors
  - [ ] The change is consistent with the SEC-02 requirement already enforced everywhere else
Dependencies: TASK #14
---

TASK #17: Security Hardening — Validate allowedTools against character whitelist
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  The security audit (docs/SECURITY_AUDIT.md) identified MEDIUM-02: the `allowedTools` parameter
  received from the client in `server/routes/jobs.js` is only checked for type
  (`typeof allowedTools !== 'string'`). It is then passed as-is as a CLI argument to
  `spawn('claude', [..., '--allowedTools', allowedTools], { shell: false })` in JobRunner.js.

  While `shell: false` prevents shell injection, an adversarial or misconfigured client could
  pass a value like `"all"` or a comma-separated list with unexpected tool names, granting Claude
  access to powerful tools (e.g., bash execution, file deletion) that the application did not
  intend to permit.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  FILES TO MODIFY:
  - `server/routes/jobs.js` — where `allowedTools` is received and validated before being passed to JobRunner
  - Optionally also harden in `server/services/JobRunner.js` as a second layer

  CURRENT CODE (approximate — server/routes/jobs.js lines 44–45):
  ```js
  if (allowedTools !== undefined && typeof allowedTools !== 'string') {
    throw new ApiError(400, 'allowedTools must be a string');
  }
  ```

  REQUIRED FIX — add character-set and length validation immediately after the type check:
  ```js
  const ALLOWED_TOOLS_RE = /^[a-zA-Z0-9_,\-]+$/;
  if (allowedTools !== undefined) {
    if (typeof allowedTools !== 'string') {
      throw new ApiError(400, 'allowedTools must be a string');
    }
    if (!ALLOWED_TOOLS_RE.test(allowedTools) || allowedTools.length > 512) {
      throw new ApiError(400, 'allowedTools contains invalid characters or exceeds maximum length');
    }
  }
  ```

  This allows: letters, digits, underscore, comma (for comma-separated lists), hyphen.
  This rejects: spaces, semicolons, quotes, shell metacharacters, angle brackets, newlines.
  Length cap of 512 characters prevents oversized arguments.

  CONSTRAINT: Do not add any new npm dependencies. The fix must be pure input validation in existing
  route/service files. Do not modify any test files — the QA agent owns those. Run `npm run build`
  to verify the change compiles cleanly.

Acceptance Criteria:
  - [ ] `allowedTools` validated against `/^[a-zA-Z0-9_,\-]+$/` regex in server/routes/jobs.js
  - [ ] Length cap of 512 characters enforced with HTTP 400 on violation
  - [ ] HTTP 400 returned with a descriptive error message on validation failure
  - [ ] The existing type check (`typeof !== 'string'`) is preserved (not removed)
  - [ ] `npm run build` passes with 0 errors
  - [ ] No new npm dependencies introduced
Dependencies: TASK #14
---

TASK #18: Security Hardening — Validate PID range in ProcessRegistry before kill
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: COMPLETED
Context:
  The security audit (docs/SECURITY_AUDIT.md) identified MEDIUM-03: `server/services/ProcessRegistry.js`
  reads PID values from `%APPDATA%\ClaudeCodeManager\active_pids.json` at startup and passes them
  directly to `process.kill(pid, 0)` and `treeKill(pid, 'SIGKILL')` in `cleanupStale()`.

  The current guard at line 83 only checks `isNaN` — it does not validate that the PID is within
  a safe numeric range. On a shared machine or if the APPDATA directory has weak ACLs, a local
  actor could write arbitrary integers (e.g., PID 4 = Windows System process) into this file.
  On startup, `cleanupStale()` would then attempt to kill those PIDs — a denial-of-service risk.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows`

  FILE TO MODIFY: `server/services/ProcessRegistry.js`

  CURRENT CODE (approximate — lines 82–93):
  ```js
  cleanupStale() {
    for (const [sessionId, pid] of Object.entries(this._pids)) {
      if (isNaN(pid)) continue;
      try {
        process.kill(pid, 0);   // check if alive
        treeKillAsync(pid, 'SIGKILL').catch(() => {});
      } catch (_) { /* already gone */ }
    }
    this._pids = {};
    this._persist();
  }
  ```

  REQUIRED FIX — add a PID range guard (PIDs must be integers in the range 1–65535):
  ```js
  const MIN_PID = 1;
  const MAX_PID = 65535;  // safe heuristic; UV_MAXHOSTNAMELEN is not the right constant here

  cleanupStale() {
    for (const [sessionId, pid] of Object.entries(this._pids)) {
      const numPid = Number(pid);
      if (!Number.isInteger(numPid) || numPid < MIN_PID || numPid > MAX_PID) {
        console.warn(`[ProcessRegistry] Skipping out-of-range PID ${pid} for session ${sessionId}`);
        continue;
      }
      try {
        process.kill(numPid, 0);
        treeKillAsync(numPid, 'SIGKILL').catch(() => {});
      } catch (_) { /* already gone */ }
    }
    this._pids = {};
    this._persist();
  }
  ```

  Also apply the same range guard wherever PIDs are registered via `register(sessionId, pid)`:
  - In `register()`: validate that `pid` is an integer in the range 1–65535 before storing it.
    Log a warning and skip storage if the PID is out of range.

  CONSTRAINT: Do not add any new npm dependencies. Do not modify test files. Run `npm run build`
  to verify the change is clean. On Windows, `process.kill(pid, 0)` may throw for system-owned
  processes even with a valid PID — the existing try/catch already handles that.

Acceptance Criteria:
  - [ ] `cleanupStale()` in ProcessRegistry.js skips PIDs outside the range 1–65535
  - [ ] `register()` in ProcessRegistry.js validates PID range before storing
  - [ ] Out-of-range PIDs logged as warnings with `[ProcessRegistry]` prefix, not silently dropped
  - [ ] The existing `isNaN` / `Number.isInteger` check is preserved or superseded by the new guard
  - [ ] `npm run build` passes with 0 errors
  - [ ] No new npm dependencies introduced
Dependencies: TASK #14
---

TASK #19: v1.1 — Fix JobRunner Memory Leak (Evict Completed Jobs)
Agent: backend-dev
Priority: MEDIUM
Difficulty: EASY
Status: COMPLETED
Context:
  BUG-06 — JobRunner memory leak: the `jobs` Map in server/services/JobRunner.js accumulates
  completed, cancelled, and error entries indefinitely. Under sustained use (many prompts over time),
  this causes unbounded memory growth in the Node.js process.

  CURRENT BEHAVIOR (as of v1):
  - `JobRunner.js` maintains a `jobs = new Map()` that stores JobRecord objects keyed by jobId.
  - On job completion (done / cancelled / error), the job status is updated but the entry is NEVER
    removed from the Map.
  - The only cleanup path is `cancelAll()` called at server shutdown, which calls treeKill on
    running jobs but does not clear the Map itself.
  - The GET /api/v1/jobs/list endpoint reads all entries in the Map — as entries accumulate,
    this endpoint also returns stale entries from prior jobs forever.

  ROOT CAUSE:
  No eviction policy exists for terminal-state jobs. The Map is write-once, never pruned.

  RECOMMENDED FIX APPROACH:
  Add a TTL-based eviction: after a job reaches a terminal state (done / cancelled / error),
  schedule a `setTimeout` to delete it from the Map after a configurable retention window
  (e.g., 10 minutes = 600_000 ms). This keeps jobs queryable for a reasonable time after
  completion (so the UI can poll the result) while preventing unbounded accumulation.

  Example pattern (add inside the section where status is set to done/cancelled/error):
  ```js
  const JOB_RETENTION_MS = 10 * 60 * 1000; // 10 minutes
  // after setting job.status to terminal state:
  setTimeout(() => { this.jobs.delete(jobId); }, JOB_RETENTION_MS);
  ```

  CONSTRAINTS:
  - Do not remove jobs immediately on completion — the GET /api/v1/jobs/:id and SSE stream
    endpoints need the record to be readable until the client has consumed the result.
  - Do not add new npm dependencies.
  - Do not modify test files. The fix must work alongside existing tests.
  - Run `npm test` and `npm run build` to verify no regressions.

  FILE TO MODIFY: server/services/JobRunner.js
  RELATED: BUG-07 (rate limiter map leak, handled in TASK #20 separately)

Acceptance Criteria:
  - [ ] Completed, cancelled, and error jobs are automatically evicted from the jobs Map after
        a defined retention window (configurable constant, at least 5 minutes)
  - [ ] Jobs remain queryable via GET /api/v1/jobs/:id during the retention window
  - [ ] GET /api/v1/jobs/list does not return entries older than the retention window
  - [ ] `npm test` passes with 0 failures after the change
  - [ ] `npm run build` passes with 0 errors
  - [ ] No new npm dependencies introduced
Dependencies: none
---

TASK #20: v1.1 — Fix Rate Limiter Memory Leak (TTL Cleanup on _rateLimitMap)
Agent: backend-dev
Priority: MEDIUM
Difficulty: EASY
Status: COMPLETED
Context:
  BUG-07 — Rate limiter memory leak: the in-memory `_rateLimitMap` in server/index.js
  accumulates one entry per unique IP address and never removes them. Under normal localhost use
  this is negligible (a single IP), but any misconfigured network or penetration test scenario
  that sends requests from rotating IPs will grow the Map indefinitely.

  CURRENT BEHAVIOR (as of v1, in server/index.js):
  ```js
  const _rateLimitMap = new Map(); // <ip, { count, windowStart }>
  // On each request: look up IP, increment count, reset if window expired
  // Entries are NEVER deleted — once an IP is seen, its entry lives forever
  ```

  ROOT CAUSE:
  The sliding-window rate limiter updates entries but never prunes stale ones (entries where
  `windowStart` is more than 1 minute in the past and the window has not been re-entered).

  RECOMMENDED FIX APPROACH:
  Option A (preferred — minimal overhead): After resetting a window entry (`windowStart = now,
  count = 1`), also check if the previous window was idle (count stayed within limit the whole
  time). If the IP has not been seen in the current window, schedule a deletion or simply
  delete-on-reset. Alternatively, clear the entry when count resets and only re-add it when
  the IP sends the next request in a new window.

  Option B (simpler): Run a periodic sweep with `setInterval` (e.g., every 5 minutes) that
  deletes all entries whose `windowStart + windowMs < Date.now()` (i.e., stale idle entries).
  This is O(n) over the Map but runs infrequently.

  Example (Option B):
  ```js
  const RATE_LIMIT_SWEEP_MS = 5 * 60 * 1000; // every 5 minutes
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, rec] of _rateLimitMap) {
      if (rec.windowStart < cutoff) _rateLimitMap.delete(ip);
    }
  }, RATE_LIMIT_SWEEP_MS).unref();
  ```
  `.unref()` prevents the sweep interval from keeping the Node.js process alive during shutdown.

  CONSTRAINTS:
  - Do not add new npm dependencies (do not reach for express-rate-limit or similar).
  - Run `npm test` and `npm run build` to verify no regressions.
  - The fix must not change the observable rate-limiting behavior for legitimate requests.

  FILE TO MODIFY: server/index.js (the in-memory rate limiter section)
  RELATED: BUG-06 (JobRunner Map leak, handled in TASK #19 separately)

Acceptance Criteria:
  - [ ] `_rateLimitMap` entries for idle/expired IPs are eventually removed (TTL or sweep)
  - [ ] Rate limiting behavior for active IPs is unchanged
  - [ ] The sweep interval (if used) calls `.unref()` so it does not block process shutdown
  - [ ] `npm test` passes with 0 failures after the change
  - [ ] `npm run build` passes with 0 errors
  - [ ] No new npm dependencies introduced
Dependencies: none
---

TASK #21: v1.1 — Upgrade Vite to Patch MEDIUM-04 esbuild CVE
Agent: devops
Priority: MEDIUM
Difficulty: EASY
Status: COMPLETED
Context:
  MEDIUM-04 — esbuild CVE in client/ devDependencies: the security re-audit (2026-03-18) found
  that `client/node_modules` contains a version of esbuild (pulled in transitively by vite) with
  2 moderate npm audit findings. These are dev-only vulnerabilities — esbuild is not in the
  production bundle and is never shipped to a user — but they show up in `npm audit` for client/.

  CURRENT STATE:
  - `npm audit` run from `client/` returns 2 moderate findings related to esbuild
  - The server/ and root-level `npm audit` return 0 vulnerabilities
  - esbuild is a transitive dependency of vite (not directly listed in client/package.json)
  - The CVE affects only the build-time toolchain, not the running app

  RECOMMENDED FIX:
  Upgrade vite in client/package.json to the latest stable release in the vite 5.x line
  (or vite 6.x if available and stable). A vite upgrade typically pulls in a patched esbuild.

  Steps:
  1. Check the latest vite version: `npm view vite versions --json | tail -20`
  2. Update `client/package.json`: change `"vite": "^5.x.x"` to the latest stable version
  3. Run `npm install` in `client/`
  4. Run `npm run build` from the project root to confirm the build still passes
  5. Run `npm audit` from `client/` to confirm the esbuild findings are resolved
  6. If vite 6.x introduces breaking changes with the current vite.config.js, stay on vite 5.x
     latest patch instead

  CONSTRAINTS:
  - Do not upgrade React, xterm.js, or react-markdown as part of this task (scope creep risk)
  - Do not change vite.config.js unless a breaking change in the new vite version requires it
  - Run `npm test` after to confirm 0 regressions (vitest uses its own runner, not vite)
  - If the CVE is NOT resolved by the vite upgrade, document the residual finding and mark
    the task PARTIAL with a note explaining what remains

  FILE TO MODIFY: client/package.json (vite version bump), client/package-lock.json (regenerated)
  REFERENCE: Security re-audit 2026-03-18, ACTIVITY_LOG.md entry for security agent

Acceptance Criteria:
  - [ ] `npm audit` run from `client/` returns 0 moderate or higher findings (or documents why
        a residual finding cannot be fixed by a vite upgrade)
  - [ ] `npm run build` from project root passes with 0 errors after the upgrade
  - [ ] `npm test` passes with 0 failures after the upgrade
  - [ ] client/package.json vite version is updated to a patched release
  - [ ] No other direct dependencies in client/package.json are changed
Dependencies: none
---

TASK #23: Redesign — Design System Foundation (Tailwind Config, Fonts, CSS Variables, Shared Utilities)
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: opus
Status: COMPLETED
Context:
  This is the FIRST task in the Phase 9 frontend redesign. All subsequent redesign tasks depend on this one.

  THE GOAL: Establish the complete design system that ALL 5 Stitch screens share. The Stitch exports use a
  consistent design language that must be codified into the Tailwind config and global CSS before any
  component work begins.

  DESIGN SYSTEM EXTRACTED FROM ALL 5 STITCH SCREENS:

  COLOR PALETTE (from Stitch exports — these are the canonical values):
  - primary: #933df5 (purple accent — used in active states, buttons, highlights, borders)
    NOTE: Screen 1 (Terminal Hub) uses #a855f7 as primary, but the other 4 screens consistently use #933df5.
    Use #933df5 as the canonical primary and add #a855f7 as "primary-light" for terminal glow effects.
  - background-dark: #000000 (main body background — pure black)
  - surface: #0a0a0a to #111111 (card/panel backgrounds, sidebar)
  - surface-lighter / surface-raised: #141414 (elevated surfaces, hover states)
  - surface-hover: #1a1a1a (interactive hover backgrounds)
  - border-color: #1a1a1a to #222222 (borders between panels, cards)
  - border-hover: #444444 (border on hover)
  - text-main: #EAEAEA (primary text color)
  - text-muted: #888888 (secondary/label text)
  - text-dim: #555555 to #666666 (very muted labels, timestamps)
  - text-dimmer: #444444 (placeholder text, subtle UI)
  - terminal-bg: #000000 (terminal background)
  - success / green: #10B981 or #22c55e (online status, running indicators)
  - error / red: #E33A3A (failed states, delete actions)
  - warning / amber: #ffaa44 (warning banners)
  - accent / blue: #3291FF (links, info elements)
  - code-purple: #d2a8ff (code highlighting — variables, types)
  - code-green: #7ee787 (code highlighting — HTML tags)
  - code-red: #ff7b72 (code highlighting — keywords)
  - code-blue: #79c0ff (code highlighting — properties)
  - code-string: #a5d6ff (code highlighting — strings)

  TYPOGRAPHY:
  - Primary font: "Inter" (sans-serif) — used for all UI text across screens 2-5
  - Alternative: "Geist" (sans-serif) — used in screen 1 (Terminal Hub). Include both.
  - Monospace: "JetBrains Mono" — used for terminal text, code blocks, PID labels, file paths, timestamps
  - Base font size: 13px (text-[13px] is the root body size in the Terminal Hub screen)
  - Font weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)
  - Tracking: tight for headers, widest for tiny uppercase labels

  BORDER RADIUS (from Stitch tailwind configs):
  - DEFAULT: 0.25rem (4px) — standard elements
  - sm: 2px — small badges, tags
  - md: 4px — medium elements
  - lg: 0.5rem (8px) — cards, panels
  - xl: 0.75rem (12px) — large cards, modals
  - full: 9999px — pills, status dots

  SHARED UI PATTERNS (must be available as utility classes or components):
  - .glass-effect: backdrop-filter: blur(8-12px); background: rgba(10, 10, 10, 0.8) — used for floating headers
  - .custom-scrollbar: thin 4-6px scrollbar with #1a1a1a/#262626 thumb on transparent track
  - .active-indicator: box-shadow: 0 0 10px rgba(168, 85, 247, 0.4) — purple glow effect
  - Material Symbols Outlined icon font — ALL screens use Google Material Symbols (not Material Icons)
  - Status dots: consistent size-1.5 to size-2 rounded-full with color-coded backgrounds

  WHAT TO DO:
  1. Update client/tailwind.config.js with the full extended theme (colors, fontFamily, borderRadius)
     matching the Stitch exports. Add darkMode: "class".
  2. Update client/index.html to load the required Google Fonts:
     - Inter (400, 500, 600, 700)
     - Geist (400, 500, 600, 700)
     - JetBrains Mono (400, 500)
     - Material Symbols Outlined
  3. Rewrite client/src/index.css with:
     - Base body styles (bg #000000, text #EAEAEA, font-family Inter)
     - Custom scrollbar styles
     - Glass effect utility class
     - Active indicator utility class
     - Markdown result styles updated to match new color scheme (primary purple instead of green)
     - Terminal-specific text styles
  4. Create client/src/lib/constants.js with:
     - API_BASE, WS_BASE constants (preserve existing patterns from useApi.js)
     - NAV_ITEMS array with icon names (Material Symbols), labels, and view keys for the new 5-screen navigation
     - STATUS_COLORS object mapping status strings to color classes

  CURRENT STATE OF FILES TO MODIFY:
  - client/tailwind.config.js: minimal config, no custom colors (just content path)
  - client/index.html: no font imports, bare HTML shell
  - client/src/index.css: green-themed markdown styles, basic body/root styles
  - client/src/hooks/useApi.js: contains API_BASE constant — DO NOT modify this file, create a separate constants file

  CRITICAL: Do NOT modify any existing component files in this task. This is foundation-only.
  The old components will continue to work with the old styles until they are replaced in later tasks.

Acceptance Criteria:
  - [ ] client/tailwind.config.js has full color palette, fontFamily, borderRadius matching Stitch exports
  - [ ] client/index.html loads Inter, Geist, JetBrains Mono, and Material Symbols Outlined from Google Fonts
  - [ ] client/src/index.css has new base styles, scrollbar, glass-effect, active-indicator utilities
  - [ ] client/src/index.css markdown styles updated to purple/dark theme (not green)
  - [ ] client/src/lib/constants.js created with NAV_ITEMS, STATUS_COLORS
  - [ ] darkMode: "class" is set in tailwind.config.js
  - [ ] `npm run build` passes with 0 errors
  - [ ] Existing components still render (no breaking changes to old code)
Dependencies: none
---

TASK #24: Redesign — New Sidebar Navigation Component
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: opus
Status: COMPLETED
Context:
  Replace the current Sidebar.jsx with a completely new sidebar matching the Stitch designs. The sidebar
  design is consistent across ALL 5 Stitch screens with minor variations in which nav item is active.

  STITCH SIDEBAR DESIGN (composite from all 5 screens):

  STRUCTURE (top to bottom):
  1. HEADER SECTION (top, border-b border-[#1a1a1a]):
     - Logo: a small (size-7 to size-8) rounded square with purple gradient background containing
       a Material Symbols icon ("terminal" or "hub")
     - App name: "Claude Code" in bold 14px text, white
     - Subtitle: "Visual Manager" or "Local Environment" in 10-11px muted text, uppercase tracking-widest
     - Width: 240-260px (use 250px as standard)

  2. NAVIGATION LINKS (main section, flex-1):
     The NEW navigation has 5 views (not the current 4):
     - "Project Dashboard" — icon: dashboard — maps to view: 'projects'
     - "Live Terminal" — icon: terminal — maps to view: 'terminal'
     - "Job Runner" — icon: play_arrow or rocket_launch — maps to view: 'jobs'
     - "Deployments" — icon: memory — maps to view: 'deployments' (was "Entities" agents/skills tabs)
     - "Context Editor" — icon: description — maps to view: 'context' (was "Entities" CLAUDE.md tab)

     Active state: bg-surface-hover (#1a1a1a) with border border-border, icon turns primary (#933df5)
       with filled variant (font-variation-settings: 'FILL' 1), text becomes white
     Inactive state: text-text-muted (#888888), hover:bg-surface-hover, icons unfilled (FILL 0)
     All nav items: flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium

  3. OPTIONAL SECTIONS (varies by screen):
     - Screen 1 (Terminal Hub): Shows "Active PTY Sessions" list below nav — session cards with
       green status dot, session name, PID badge, project path. "New Local Session" button.
     - Screen 3 (Dashboard): Shows "Recent" section with recently visited project paths
     - Screen 5 (Deployment): Shows active agent indicator at bottom with running status

  4. FOOTER (bottom, border-t border-[#1a1a1a]):
     - System status indicator: green dot + "Active" / "System Online" text
     - Settings link: settings icon + "Preferences" or "Settings" text
     - Version number: small mono text like "v1.2.4"

  WHAT TO DO:
  1. Rewrite client/src/components/Sidebar.jsx entirely. The new component should:
     a. Use the NAV_ITEMS from lib/constants.js
     b. Render Material Symbols Outlined icons (use <span className="material-symbols-outlined">icon_name</span>)
     c. Support the active/inactive styling exactly as described above
     d. Include the header with logo, app name, subtitle
     e. Include a dynamic "Active PTY Sessions" section that shows sessions from AppContext
        (session name = project name, status dot = green if active, PID shown as small badge)
     f. Include "New Local Session" button (dashed border style)
     g. Include footer with status indicator and version number
     h. KEEP the project loading logic (apiGet('/api/v1/projects') on mount) — this is critical
     i. KEEP the handleProjectClick session creation logic — this is critical
     j. KEEP the AddProjectModal integration — still needed for project registration

  2. Update the view names in AppContext.jsx:
     - Add 'deployments' and 'context' to the view type
     - The existing 'entities' view will be removed (split into 'deployments' and 'context')
     - Update initialState.view from 'terminal' to 'projects' (dashboard is now the landing page)

  CURRENT SIDEBAR.JSX STATE:
  - 256px wide, bg #1a1a1a
  - Green (#4ade80) accent theme
  - Text icon characters (>, #, @, =) instead of Material Symbols
  - 4 nav items: Terminal, Jobs, Entities, Projects
  - Project list below nav with status dots
  - Simple + button for adding projects
  - No footer, no status indicator, no version display

  BACKEND API INTEGRATION (must be preserved):
  - apiGet('/api/v1/projects') — fetches project list on mount
  - apiPost('/api/v1/sessions', { projectId }) — creates PTY session on project click
  - dispatch SET_PROJECTS, SET_ACTIVE_PROJECT, SET_SESSION, SET_VIEW — all must still work
  - AddProjectModal onClose callback

Acceptance Criteria:
  - [ ] Sidebar matches Stitch design: 250px width, black/dark surface background, purple accent
  - [ ] 5 navigation items with Material Symbols icons and correct active/inactive states
  - [ ] Header shows logo icon + "Claude Code" + "Visual Manager" subtitle
  - [ ] Active PTY Sessions section shows current sessions with green dots and PID badges
  - [ ] Footer shows system status dot, settings link, and version number
  - [ ] Project loading and session creation still work (no API regressions)
  - [ ] AppContext.jsx updated with 'deployments' and 'context' views, default view changed to 'projects'
  - [ ] AddProjectModal still triggers from appropriate button
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #23
---

TASK #25: Redesign — Project Dashboard View (replaces ProjectsView)
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: opus
Status: COMPLETED
Context:
  Replace the current ProjectsView.jsx (a simple table) with the rich Project Dashboard from Stitch
  screen 3: final_project_dashboard.

  STITCH DESIGN — PROJECT DASHBOARD (screen 3):

  LAYOUT:
  - Full-width content area with max-w-7xl centering
  - Top header bar (h-[64px]): "Project Dashboard" title on left, global search bar in center,
    notification bell + user avatar on right
  - Scrollable main area below header

  HEADER BAR:
  - Left: "Project Dashboard" in text-lg font-semibold
  - Center: search input with search icon, placeholder "Search projects, paths, or active tasks...",
    keyboard shortcut "/" badge on right side, bg-[#0a0a0a] border border-border-color rounded-md
  - Right: notification bell icon button + user avatar (small circle with initials, border border-border-color)

  SECTION TITLE:
  - "Active Environments" in text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted
  - Subtitle: "You have N local projects being managed by Claude Code." in text-sm text-text-muted
  - Right side: "N TOTAL" badge + grid/list view toggle buttons (grid_view / list icons)

  PROJECT CARDS GRID:
  - grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6
  - Each card: bg-surface (#111111) border border-border-color rounded-xl p-6, h-[180px]
  - Card content:
    - Top: project name (text-base font-semibold) + three-dot menu (more_vert, visible on hover)
    - Below name: project path in text-[12px] text-text-muted font-mono truncate
    - Bottom (border-t): status indicator:
      - Active: animated ping dot (primary purple) + "N Active Agents" text
      - Idle: gray dot + "Idle" text
      - Failed: red dot + "N Failed Job" text in red
    - Far right of bottom: time ago text ("2h ago", "Just now")
  - Hover states: active projects hover:border-primary/50, idle hover:border-border-hover,
    failed hover:border-[#E33A3A]/40

  ADD PROJECT CARD:
  - bg-transparent border border-dashed border-border-color rounded-xl, h-[180px]
  - Center: circle icon container with "add" icon, "Register Existing Project" text below,
    "Link a local directory" subtitle
  - Hover: border-primary, bg-[#080808], icon scales up

  SCAFFOLD CTA BANNER (bottom of page):
  - mt-16, full-width card with rounded-2xl border
  - Left: rocket icon in primary/10 background circle + "Start a new project with AI?" heading + subtitle
  - Right: "Scaffold New Project" primary button

  WHAT TO DO:
  1. Rewrite client/src/views/ProjectsView.jsx entirely to match this design
  2. Replace the table layout with the card grid layout
  3. Implement the search bar (client-side filtering of projects by name/path is sufficient)
  4. Implement the grid/list view toggle (grid shows cards, list can show a simplified version)
  5. Each card must be clickable — clicking navigates to terminal view for that project
     (same as current handleOpenTerminal: dispatch SET_ACTIVE_PROJECT + SET_VIEW:terminal)
  6. Three-dot menu on each card: "Open Terminal", "Delete" options (same as current actions)
  7. "Register Existing Project" card opens AddProjectModal
  8. "Scaffold New Project" button opens AddProjectModal with scaffold mode
  9. The ConfirmDialog for deletion must still work (restyle to match new dark theme)

  BACKEND API (preserve all):
  - apiGet('/api/v1/projects') — project list
  - apiDelete('/api/v1/projects/:id') — project deletion
  - GET /api/v1/sessions — to determine which projects have active sessions (for card status)
  - dispatch SET_PROJECTS, REMOVE_PROJECT, SET_ACTIVE_PROJECT, SET_VIEW

  STATUS MAPPING:
  - Check sessions state from AppContext: if sessions[project.id] exists -> "Active"
  - If no session -> "Idle"
  - Future: check job status for "Failed" state (can be stubbed with idle for now)

Acceptance Criteria:
  - [ ] Card grid layout matching Stitch design (responsive columns, 180px height cards)
  - [ ] Each card shows project name, path, status indicator (active/idle), and time
  - [ ] Search bar filters projects by name or path
  - [ ] Grid/list view toggle works
  - [ ] "Register Existing Project" dashed card opens AddProjectModal
  - [ ] "Scaffold New Project" button opens AddProjectModal
  - [ ] Three-dot menu with "Open Terminal" and "Delete" actions
  - [ ] Delete confirmation dialog still works (restyled to match dark theme)
  - [ ] Header with search, title, notifications area
  - [ ] All existing API integrations preserved (project CRUD, session check)
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #23, TASK #24
---

TASK #26: Redesign — Live Terminal Hub View (replaces TerminalView)
Agent: frontend-dev
Priority: HIGH
Difficulty: HARD
Suggested Model: opus
Status: COMPLETED
Context:
  Replace the current TerminalView.jsx with the rich Terminal Hub from Stitch screen 1:
  final_multi_agent_terminal_hub. This is the most complex redesign task because the terminal
  (xterm.js) integration must be preserved exactly while the surrounding UI is completely rebuilt.

  STITCH DESIGN — TERMINAL HUB (screen 1):

  LAYOUT:
  - Full-height main area with flex-col
  - Top: PTY header bar (h-10, glass-effect with backdrop-filter blur)
  - Middle: terminal body (flex-1, scrollable, font-mono)
  - Bottom: status bar footer (h-9, bg-surface)

  PTY HEADER BAR (glass-effect):
  - Left side:
    - Terminal icon (material-symbols "terminal") in primary color
    - Session name in font-mono text-[11px] uppercase (e.g., "UI-REFACTOR-PRO")
    - Divider (h-3 w-px bg-border-color)
    - Folder icon + project path in font-mono text-[11px]
  - Right side:
    - Memory usage badge: "Memory" label + value in primary color (e.g., "1.2GB")
    - Action buttons: copy output, split pane (future), kill process (red hover)
    - Kill button: hover:bg-red-500/20, hover:text-red-400

  TERMINAL BODY:
  - Background: #000000 (terminal-bg)
  - This is where xterm.js renders — the actual Terminal component goes here
  - The Stitch mockup shows styled terminal output, but in reality this area is entirely
    owned by xterm.js — we just need to place the Terminal component in this space
  - Padding and max-width constraints should NOT apply to the xterm container
    (xterm needs full width/height for proper rendering)

  STATUS BAR FOOTER:
  - Left: connection status (green dot + "Connected" in bold uppercase), divider,
    daemon info ("Local Daemon (version)")
  - Right: token usage indicator (toll icon + "Tokens used" + count + progress bar),
    divider, latency indicator (timer icon + "Latency" + value)
  - Note: Token and latency values are aspirational — can show placeholder/static values for now
    since the backend doesn't provide these metrics yet

  WHAT TO DO:
  1. Rewrite client/src/views/TerminalView.jsx:
     a. New PTY header bar with glass-effect styling
     b. Terminal component placement (preserve the existing Terminal.jsx integration exactly)
     c. New status bar footer
     d. "No project selected" empty state should match new design (centered, muted text)
  2. The Terminal.jsx component itself should NOT be modified — it already handles xterm.js correctly
     (FitAddon, ResizeObserver, WebSocket lifecycle). Only its CONTAINER changes.
  3. The "kill process" button in the header should dispatch a session kill (can call
     apiDelete('/api/v1/sessions/:sessionId') — this endpoint exists)

  CRITICAL XTERM.JS CONSTRAINTS (from DEC-009, research_b.md):
  - Terminal.jsx creates ONE xterm.js Terminal instance per session — never reuse across sessions
  - The xterm container div must be allowed to fill its parent completely (flex-1 overflow-hidden)
  - Do NOT add padding or max-width to the xterm container — it breaks the fit addon
  - The WebSocket connection in useSession.js must not be disrupted by the view redesign
  - term.reset() is called on session switch — this behavior must be preserved

  BACKEND API INTEGRATION (preserve all):
  - useSession.js hook: WebSocket lifecycle, reconnect, ring buffer replay
  - Terminal.jsx: xterm.js instance, FitAddon, ResizeObserver
  - Session data from AppContext (sessions[activeProjectId])

Acceptance Criteria:
  - [ ] PTY header bar with glass-effect, session name, project path, memory badge, action buttons
  - [ ] Terminal (xterm.js) renders correctly and fills the available space
  - [ ] FitAddon and ResizeObserver still work (terminal resizes with window)
  - [ ] WebSocket connection and ring buffer replay still work on reconnect
  - [ ] Status bar footer with connection status, token placeholder, latency placeholder
  - [ ] Kill process button in header works (calls session delete API)
  - [ ] Empty state when no project is selected matches new design theme
  - [ ] No xterm.js regressions (single instance per session, proper cleanup)
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #23, TASK #24
---

TASK #27: Redesign — Orchestration Center / Job Runner View (replaces JobView)
Agent: frontend-dev
Priority: HIGH
Difficulty: HARD
Suggested Model: opus
Status: COMPLETED
Context:
  Replace the current JobView.jsx (simple header + JobPanel) with the rich Orchestration Center from
  Stitch screen 2: final_orchestration_center. This is a three-column layout with a job queue, process
  monitor, and rendered output.

  STITCH DESIGN — ORCHESTRATION CENTER (screen 2):

  LAYOUT: Three-pane horizontal split
  1. Left pane: Active Background Jobs list (w-[340px], border-r)
  2. Right pane: Process Monitor + Output (flex-1, split vertically)
     - Top: Control bar (h-16, process info)
     - Bottom: Output content area (flex-1, scrollable)

  LEFT PANE — JOB QUEUE (w-[340px]):
  - Header: "Active Background Jobs" title (text-[10px] uppercase tracking-[0.2em]) + refresh button
  - Job cards (divide-y):
    - Running job: bg-surface-raised/40, border-l-2 border-primary, highlighted
      - PID badge + job name tag (uppercase, primary colored border)
      - Duration timer (font-mono)
      - Agent name with animated pulse dot
      - Working directory path in mono
      - CPU/RAM usage grid (2-col, bg-black/40)
    - Idle/watching job: no left border highlight, muted colors
    - Completed job: green check icon, muted text

  RIGHT PANE — CONTROL BAR (h-16, bg-surface-dark):
  - Left: Worker PID, Status (with animated dot), Process Load (CPU/RAM + progress bar)
  - Right: "Attach Terminal" button (with ALT+A shortcut badge), "Kill Process" red button

  RIGHT PANE — OUTPUT CONTENT (flex-1, bg-[#030303]):
  - max-w-4xl mx-auto p-10 space-y-8
  - Markdown header area: agent role badge, title, command with copy button
  - Markdown content: prose-invert styling with proper code blocks
  - Code blocks: rounded-xl border, file name header, syntax-highlighted content
  - Active task status: spinner + "Worker #PID: Executing..." progress indicator
  - Action buttons: "Return to Terminal", "Review Changes", "Continue Execution"

  WHAT TO DO:
  1. Rewrite client/src/views/JobView.jsx entirely with the three-pane layout
  2. Create a new JobQueuePanel component (left pane) that:
     a. Lists all jobs from the API (GET /api/v1/jobs/list)
     b. Shows running/idle/completed states with appropriate styling
     c. Clicking a job selects it and shows its output in the right pane
  3. Create a new JobControlBar component (top of right pane) that:
     a. Shows selected job's PID, status, resource usage (placeholder values for CPU/RAM)
     b. "Kill Process" button calls DELETE /api/v1/jobs/:id
  4. Modify the existing JobPanel.jsx component or create a new JobOutput component that:
     a. Renders the SSE-streamed job output with proper markdown styling
     b. The prompt input area should be redesigned to match the new theme
     c. The markdown result area should use the new code block styling from Stitch
  5. The "no project selected" empty state should match the new design theme

  BACKEND API INTEGRATION (preserve all):
  - useJob.js hook: startJob (POST + EventSource SSE), cancelJob (DELETE), reset
  - GET /api/v1/jobs/list — for the job queue
  - GET /api/v1/jobs/:id — for individual job status
  - POST /api/v1/jobs — to start a new job
  - DELETE /api/v1/jobs/:id — to cancel a job
  - SSE stream at GET /api/v1/jobs/:id/stream

  CURRENT JOBVIEW + JOBPANEL STATE:
  - JobView.jsx: simple header showing "Job Mode / projectName" + JobPanel component
  - JobPanel.jsx: 5 render states (idle/running/done/cancelled/error), StreamLog component,
    MarkdownResult with react-markdown + remark-gfm, AdvancedOptions, Copy button
  - useJob.js: startJob (POST + EventSource), cancelJob (DELETE), reset function

Acceptance Criteria:
  - [ ] Three-pane layout: job queue (340px) | control bar + output area
  - [ ] Job queue lists all jobs with running/idle/completed visual states
  - [ ] Selecting a job shows its output in the right pane
  - [ ] Job creation (prompt submission) still works with SSE streaming
  - [ ] Job cancellation still works
  - [ ] Markdown rendering with code blocks matches Stitch design (dark theme, rounded borders)
  - [ ] Control bar shows job status, PID, and kill button
  - [ ] Empty state when no project selected matches new theme
  - [ ] All existing API hooks (useJob.js) preserved and functional
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #23, TASK #24
---

TASK #28: Redesign — Context & Rules Editor View (replaces EntitiesView CLAUDE.md tab)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: HARD
Suggested Model: opus
Status: COMPLETED
Context:
  Create a new Context Editor view matching Stitch screen 4: final_context_rules_editor. This replaces
  the ClaudeMdEditor tab from the old EntitiesView. The new design is a sophisticated split-pane editor
  with a visual rule builder on the left and a raw CLAUDE.md preview on the right.

  STITCH DESIGN — CONTEXT & RULES EDITOR (screen 4):

  LAYOUT: Two-column split (50/50)
  - Left: Rule Explorer (visual block editor)
  - Right: CLAUDE.md Output (raw markdown preview)
  - Top header with scope tabs and actions

  TOP HEADER (h-14, glass-header):
  - Left: magic wand icon (auto_fix_high) + "CLAUDE.md Rules" title
  - Tab switcher: "Project Rules" | "User Global" buttons in a pill container
    (bg-[#0f0f0f] p-1 rounded-lg border). Active tab has bg-[#1a1a1a] text-white
  - Right: "Live Sync" indicator (animated dot + text), divider, "Discard" + "Push Changes" buttons

  WARNING BANNER (conditional):
  - bg-[#221100] border-b border-[#442200]
  - Warning icon + "Context budget warning: CLAUDE.md is approaching 100 lines..."
  - Line count display: "82 / 100 Lines"
  - Show when CLAUDE.md content exceeds 80 lines (the 300-line warning from old ClaudeMdEditor
    should be replaced with this graduated warning)

  LEFT PANE — RULE EXPLORER (w-1/2):
  - Section header: "Rule Explorer" label + "N ACTIVE BLOCKS" count + sort button
  - Rule blocks (space-y-4):
    - Each rule: bg-[#0f0f0f] border border-[#1a1a1a] rounded-lg p-4
    - Header: drag handle (drag_indicator icon) + editable rule name input + scope dropdown
      (GLOBAL/Components/Hooks/tests) + close (delete) button
    - Body: textarea for rule content, font-mono, bg-[#050505] border
    - Hover: border-[#333333]
  - "Add Context Rule" button at bottom: dashed border, add_circle icon, hover:border-primary

  RIGHT PANE — CLAUDE.md OUTPUT (w-1/2):
  - Section header: "CLAUDE.md Output" label + copy button + expand button
  - Rendered markdown preview with syntax coloring:
    - Headings in primary (#933df5)
    - Code in blue (#3291FF)
    - Comments in gray italic
  - Footer: UTF-8, MARKDOWN, COL/LINE indicators

  WHAT TO DO:
  1. Create client/src/views/ContextEditorView.jsx as a new file
  2. This view reads/writes CLAUDE.md via the existing API:
     - GET /api/v1/claudemd?scope=project&projectId=X — read project CLAUDE.md
     - GET /api/v1/claudemd?scope=user — read user global CLAUDE.md
     - PUT /api/v1/claudemd — write CLAUDE.md content
  3. Implement the rule block parser:
     - Parse CLAUDE.md sections (## headers) into individual rule blocks
     - Each block becomes an editable card with name (from heading) and content (body text)
     - Scope detection: if a heading starts with a path-like pattern, mark it as path-specific
  4. Implement the live preview:
     - As rule blocks are edited, regenerate the CLAUDE.md content in real-time
     - Show in the right pane with syntax-colored markdown preview
  5. Implement the scope tabs:
     - "Project Rules" — loads/saves CLAUDE.md for the active project
     - "User Global" — loads/saves the user-level global CLAUDE.md
  6. Line count warning banner when content exceeds 80 lines
  7. "Push Changes" button saves via PUT /api/v1/claudemd
  8. "Discard" button reverts to last saved state

  CURRENT CLAUDEMDEDITOR STATE:
  - Dual-panel: left textarea for editing, right preview
  - Scope selector (project/user)
  - Live line count with 300-line warning
  - Save/Load via PUT/GET /api/v1/claudemd

Acceptance Criteria:
  - [ ] Split-pane layout: Rule Explorer (left) + CLAUDE.md Output (right)
  - [ ] Rule blocks are parsed from CLAUDE.md sections and rendered as editable cards
  - [ ] Each rule card has editable name, scope dropdown, content textarea, delete button
  - [ ] "Add Context Rule" button adds a new empty rule block
  - [ ] Right pane shows live preview of generated CLAUDE.md with syntax coloring
  - [ ] Scope tabs switch between project and user-global CLAUDE.md
  - [ ] Line count warning banner appears when content exceeds 80 lines
  - [ ] "Push Changes" saves via API, "Discard" reverts
  - [ ] View mapped to 'context' in the App router
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #23, TASK #24
---

TASK #29: Redesign — Deployment Manager View (replaces EntitiesView Agents/Skills tabs)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: HARD
Suggested Model: opus
Status: COMPLETED
Context:
  Create a new Deployment Manager view matching Stitch screen 5: final_deployment_manager. This replaces
  the AgentEditor and SkillEditor tabs from the old EntitiesView with a much richer master-detail layout.

  STITCH DESIGN — DEPLOYMENT MANAGER (screen 5):

  LAYOUT:
  - Top: tab bar with "Profiles" | "Active Processes" | "Environment" tabs + "Register Agent" button
  - Below: master-detail split
    - Left: profile/agent list (w-[340px])
    - Right: detail configuration form (flex-1)

  TOP TAB BAR (h-[52px]):
  - Tab buttons along bottom of bar with border-b-[2px] indicator
  - Active tab: border-primary, text-text-main, font-semibold
  - Inactive: border-transparent, text-text-muted
  - Right side: "Register Agent" button (bg-surface border border-border, small)

  LEFT MASTER LIST (w-[340px]):
  - Search input at top: filter profiles, bg-surface, font-mono
  - Agent cards (space-y-1):
    - Active agent: bg-surface, border border-border, left green bar (w-1 bg-success)
      - Icon (smart_toy) + name + "Running" badge (green, text-[9px])
      - PID and port info in text-xs text-text-muted
      - "Open Console" button overlay on hover
    - Idle agent: no bg, hover:bg-surface-hover, hover:border-border
      - Icon + name + "Idle" badge (gray)
      - "Launch session" overlay on hover

  RIGHT DETAIL PANE (flex-1):
  - Detail header (h-16): agent icon in primary/10 circle + agent name heading +
    instance info. Buttons: "Launch Session" (primary) + delete button
  - Scrollable form sections:
    1. PROFILE CONFIGURATION: Profile Identifier input + Binary Version input (2-col grid)
    2. RUNTIME PARAMETERS: Local Working Directory input + folder browse button,
       Resource Priority dropdown, Max Token Concurrency number input
    3. MODEL INTELLIGENCE: Base Model dropdown (claude-3-opus/sonnet/haiku),
       Sampling Temperature slider, Core Directives textarea
    4. MODULE HOOKS: Tag-like list of linked modules with close buttons, "Add Linkage" button
  - Sticky action bar at bottom: "Revert" ghost button + "Commit Changes" primary button

  WHAT TO DO:
  1. Create client/src/views/DeploymentManagerView.jsx as a new file
  2. Implement the master-detail layout with the three tabs
  3. "Profiles" tab (default): master list of agents with detail form
     - Left: agent list from GET /api/v1/agents?projectId=X
     - Right: selected agent detail form matching the Stitch design sections
     - The form fields map to agent YAML frontmatter:
       - name -> Profile Identifier
       - description -> part of Core Directives
       - allowedTools -> Module Hooks
       - model -> Base Model dropdown
     - Save: PUT /api/v1/agents/:name (with projectId)
     - Delete: DELETE /api/v1/agents/:name
     - Create: POST /api/v1/agents (from "Register Agent" button)
  4. "Active Processes" tab: show running sessions/jobs (future enhancement, can be a stub
     that shows a list of active PTY sessions from AppContext.sessions)
  5. "Environment" tab: show skills list from GET /api/v1/skills
     - Reuse similar master-detail pattern
     - Skills have: name, description, steps
  6. The "Launch Session" button should create a PTY session for the selected agent's project

  CURRENT AGENT/SKILL EDITOR STATE:
  - AgentEditor.jsx: list + form, CRUD via /api/v1/agents, YAML frontmatter editing
  - SkillEditor.jsx: list + form, CRUD via /api/v1/skills, YAML frontmatter editing
  - Both use plain form inputs, no master-detail layout

  BACKEND API (preserve all):
  - GET /api/v1/agents?projectId=X — list agents
  - GET /api/v1/agents/:name?projectId=X — get single agent
  - POST /api/v1/agents — create agent
  - PUT /api/v1/agents/:name — update agent
  - DELETE /api/v1/agents/:name — delete agent
  - GET /api/v1/skills?projectId=X — list skills
  - POST/PUT/DELETE for skills similarly

Acceptance Criteria:
  - [ ] Master-detail layout: agent list (340px) + detail form (flex-1)
  - [ ] Three tabs: Profiles, Active Processes, Environment
  - [ ] Agent list shows running/idle states with appropriate styling
  - [ ] Detail form has all 4 sections from Stitch: Profile, Runtime, Model, Hooks
  - [ ] Agent CRUD works: create, read, update, delete via existing API
  - [ ] Search/filter agents in the master list
  - [ ] "Register Agent" button opens creation flow
  - [ ] Sticky action bar with Revert and Commit Changes buttons
  - [ ] Skills accessible via "Environment" tab
  - [ ] View mapped to 'deployments' in the App router
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #23, TASK #24
---

TASK #30: Redesign — App Shell, Routing, and View Integration
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: sonnet
Status: COMPLETED
Context:
  Update the App.jsx shell to integrate all the new views and remove the old ones. This is the
  final wiring task that makes everything work together.

  WHAT TO DO:
  1. Update client/src/App.jsx:
     a. Import the new view components:
        - ProjectsView (redesigned in Task #25) for 'projects' view
        - TerminalView (redesigned in Task #26) for 'terminal' view
        - JobView (redesigned in Task #27) for 'jobs' view
        - ContextEditorView (new in Task #28) for 'context' view
        - DeploymentManagerView (new in Task #29) for 'deployments' view
     b. Update the MainContent switch statement to route all 5 views
     c. Remove the old EntitiesView import (it's been split into context + deployments)
     d. Update AppLayout styling:
        - Remove inline style={{ backgroundColor: '#111111' }}
        - Use className="flex h-screen w-screen overflow-hidden bg-background-dark text-text-main"
        - The html element should have class="dark" (add to index.html)
     e. The default view should be 'projects' (the dashboard)

  2. Update client/index.html:
     a. Add class="dark" to the <html> element
     b. Ensure all font links from Task #23 are present

  3. Clean up old files that are no longer used:
     a. client/src/views/EntitiesView.jsx — KEEP the file but mark as deprecated
        (it may be referenced by imports that haven't been updated)
     b. The old component files (AgentEditor.jsx, SkillEditor.jsx, ClaudeMdEditor.jsx)
        should be KEPT until the new views are confirmed working, then can be removed

  4. Verify the full flow:
     a. App loads -> shows Project Dashboard (default view)
     b. Click sidebar nav -> switches to correct view
     c. Click project card -> navigates to Terminal view with session
     d. All 5 views render without errors
     e. API calls in all views work correctly

  CURRENT APP.JSX STATE:
  - 4 views: terminal, jobs, entities, projects
  - Default view: terminal
  - Inline styles with bg #111111
  - Imports: Sidebar, TerminalView, JobView, EntitiesView, ProjectsView

Acceptance Criteria:
  - [ ] App.jsx routes to all 5 new views: projects, terminal, jobs, context, deployments
  - [ ] Default view is 'projects' (dashboard)
  - [ ] EntitiesView import removed, replaced by ContextEditorView and DeploymentManagerView
  - [ ] AppLayout uses Tailwind classes instead of inline styles
  - [ ] html element has class="dark" for Tailwind dark mode
  - [ ] Full navigation flow works: sidebar nav switches views, project cards navigate to terminal
  - [ ] No console errors on any view
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #25, TASK #26, TASK #27, TASK #28, TASK #29
---

TASK #31: Redesign — Visual QA + Functional Regression Testing
Agent: qa-tester
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: opus
Status: COMPLETED
Context:
  After all Phase 9 redesign tasks are complete, run a comprehensive QA pass to verify:
  1. Visual fidelity: each of the 5 views matches its corresponding Stitch screen design
  2. Functional regression: all existing features still work (project CRUD, terminal PTY,
     job execution, entity management, CLAUDE.md editing)
  3. No broken API calls or console errors

  STITCH REFERENCE SCREENSHOTS (for visual comparison):
  - Screen 1: C:\Users\arman\Downloads\Test workflows\stitch\stitch\final_multi_agent_terminal_hub\screen.png
  - Screen 2: C:\Users\arman\Downloads\Test workflows\stitch\stitch\final_orchestration_center\screen.png
  - Screen 3: C:\Users\arman\Downloads\Test workflows\stitch\stitch\final_project_dashboard\screen.png
  - Screen 4: C:\Users\arman\Downloads\Test workflows\stitch\stitch\final_context_rules_editor\screen.png
  - Screen 5: C:\Users\arman\Downloads\Test workflows\stitch\stitch\final_deployment_manager\screen.png

  TEST PLAN:
  1. Visual comparison: navigate to each view and compare against its Stitch screenshot
     - Check colors, spacing, typography, icon usage, layout proportions
     - Check hover states and active states
     - Check responsive behavior (sidebar collapse, card grid reflow)
  2. Project Dashboard: register a project, verify card appears, delete it, verify it disappears
  3. Terminal: select a project, verify PTY session starts, type commands, verify output
  4. Job Runner: submit a prompt, verify SSE streaming, verify markdown result rendering
  5. Context Editor: load CLAUDE.md, edit a rule, save, reload, verify persistence
  6. Deployment Manager: list agents, create one, edit it, delete it, verify CRUD
  7. Navigation: click through all 5 sidebar nav items, verify correct view loads
  8. Run existing test suite: `npm test` — all 110 tests should still pass

Acceptance Criteria:
  - [x] All 5 views visually match their Stitch screen designs (colors, layout, typography)
  - [x] Project CRUD works end-to-end (register, view, delete)
  - [x] PTY terminal works (session creation, command input, output display, reconnect)
  - [x] Job mode works (submit prompt, SSE stream, markdown result, cancel)
  - [x] CLAUDE.md editor works (load, edit, save for both project and user scope)
  - [x] Agent/skill CRUD works (list, create, update, delete)
  - [x] Sidebar navigation switches between all 5 views correctly
  - [x] No console errors on any view
  - [x] `npm test` passes with 110+ tests (0 failures)
  - [x] `npm run build` passes with 0 errors
Dependencies: TASK #30
---

TASK #32: Bug Fix — CSP Blocks Google Fonts (BUG-11, blocks BUG-13, BUG-15)
Agent: backend-dev
Priority: CRITICAL
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  The Content Security Policy defined in `server/middleware/security.js` sets
  `fontSrc: ["'self'"]`, which blocks the browser from loading any external font files.
  The application's `client/index.html` loads three font families from Google Fonts CDN:
  - Inter (UI font)
  - JetBrains Mono (terminal/code font)
  - Material Symbols Outlined (icon font)

  Because all three are served from `fonts.gstatic.com`, the CSP blocks them entirely.
  The Inter and JetBrains Mono fonts fall back to system sans-serif/monospace (a cosmetic
  regression), but Material Symbols Outlined has NO fallback — every `<span>` with class
  `material-symbols-outlined` renders its text content (the icon name) as literal plain text.
  This means: `dashboard`, `terminal`, `play_arrow`, `memory`, `description`, `search`,
  `settings`, `add`, `rocket_launch`, `notifications`, `grid_view`, `list`, `content_copy`,
  `vertical_split`, `close`, `bolt`, `toll`, `timer`, `drag_indicator`, `add_circle`,
  `auto_fix_high`, `smart_toy`, `extension`, `delete`, `save`, etc.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `server/middleware/security.js`

  CURRENT CODE (lines 9-18):
  ```js
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'ws://127.0.0.1:*'],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
    },
  },
  ```

  REQUIRED FIX — update two directives:
  ```js
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      connectSrc: ["'self'", 'ws://127.0.0.1:*'],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    },
  },
  ```

  EXPLANATION:
  - `styleSrc` must include `https://fonts.googleapis.com` because the CSS files that
    define the @font-face rules are served from that domain. Without this, the <link>
    tags in index.html are blocked.
  - `fontSrc` must include `https://fonts.gstatic.com` because the actual .woff2 font
    binary files are served from that domain.
  - This is the minimal, safe allowlist. We are NOT opening `*` or `data:` for fonts.
  - This does NOT violate SEC-07 (helmet headers requirement) — CSP is still enforced,
    just with the correct allowlist for fonts the app actually uses.

  VERIFICATION:
  1. `npm start` — open http://127.0.0.1:3000/ in Chrome
  2. Open DevTools → Console — VERIFY: zero CSP violation errors
  3. VERIFY: all Material Symbols icons render as graphical glyphs (not text)
  4. VERIFY: Inter font loads (compare letter shapes with system font)
  5. VERIFY: JetBrains Mono loads in the terminal and code areas
  6. `npm test` — all 110 tests pass
  7. `npm run build` — 0 errors

  NOTE: This fix also resolves BUG-13 (logo text overflow — caused by icon text rendering
  inside a small container) and BUG-15 (search bar showing "search" as text).

Knowledge: none
Acceptance Criteria:
  - [ ] `fontSrc` includes `https://fonts.gstatic.com` in security.js
  - [ ] `styleSrc` includes `https://fonts.googleapis.com` in security.js
  - [ ] Zero CSP violation errors in Chrome DevTools Console
  - [ ] All Material Symbols icons render as graphical icons across all 5 views
  - [ ] Inter and JetBrains Mono fonts load correctly
  - [ ] `npm test` passes with 110 tests (0 failures)
  - [ ] `npm run build` passes with 0 errors
  - [ ] No other CSP directives are loosened (defaultSrc, scriptSrc, connectSrc unchanged)
Dependencies: none
---

TASK #33: Bug Fix — JobRunner Missing child.on('error') Handler (BUG-08)
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  In `server/services/JobRunner.js`, the `startJob()` method spawns a child process via
  `spawn(this.claudeBin, args, { shell: false })` at line 116. The code wires up handlers
  for `child.stdout` (via readline), `child.stderr.on('data')`, and `child.on('close')`,
  but it does NOT attach a `child.on('error')` handler.

  If the claude binary cannot be executed (e.g., file not found, permissions error, or
  corrupted executable), Node.js emits an `'error'` event on the ChildProcess object.
  Without a handler, this becomes an unhandled error that can crash the entire server
  process. Additionally, the `child.stdin.end()` call at line 125 (called immediately
  after spawn) may throw synchronously if the stream is already destroyed.

  Even in non-crash scenarios, the job will be left in `status: 'running'` permanently
  because the `'close'` event may never fire after a spawn error — creating a ghost job
  that cannot be cancelled and leaks memory.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `server/services/JobRunner.js`

  REQUIRED FIX — add `child.on('error')` handler immediately after the `child.stdin.end()`
  call (around line 126):
  ```js
  child.stdin.end();

  // Handle spawn errors (binary not found, permissions, etc.)
  // Without this handler, a spawn failure becomes an unhandled exception
  // that crashes the server process.
  child.on('error', (err) => {
    console.error(`[JobRunner] Spawn error jobId=${jobId}: ${err.message}`);
    // NOTE: prompt is intentionally NOT logged (SEC-08)

    if (job.status === 'running') {
      job.status = 'error';
      job.completedAt = new Date();

      // Notify all connected SSE clients of the failure
      for (const res of job.clients) {
        try {
          sendSse(res, { type: 'done', result: null, exitCode: null, error: err.message });
        } catch {
          // Client gone — ignore
        }
      }
      closeAllClients(job);

      // Schedule eviction so the error job is cleaned up (BUG-06 pattern)
      this._scheduleEviction(jobId);
    }
  });
  ```

  ALSO: wrap `child.stdin.end()` in a try-catch to prevent a synchronous throw if the
  stream is already destroyed:
  ```js
  try {
    child.stdin.end();
  } catch {
    // stdin may already be destroyed if spawn failed synchronously
  }
  ```

  CONSTRAINTS:
  - Do not change the `shell: false` spawn option (SEC-02).
  - Do not log the prompt content (SEC-08).
  - Do not add new npm dependencies.
  - `npm test` and `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] `child.on('error')` handler attached in JobRunner.startJob()
  - [ ] Error handler sets job.status to 'error' and job.completedAt
  - [ ] Error handler sends a terminal SSE event to all connected clients
  - [ ] Error handler calls closeAllClients() and schedules eviction
  - [ ] `child.stdin.end()` wrapped in try-catch
  - [ ] Prompt content is NOT logged in the error handler (SEC-08)
  - [ ] `npm test` passes with 0 failures
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #34: Bug Fix — Sidebar Duplicate Session Race Condition (BUG-10)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  In `client/src/components/Sidebar.jsx`, the `handleProjectClick(project)` function
  checks `if (!state.sessions[project.id])` and then calls `apiPost('/api/v1/sessions')`.
  Because the API call is asynchronous and does not update `state.sessions` until the
  response returns (via the `SET_SESSION` dispatch), a rapid double-click on the same
  project card will pass the guard twice — both clicks see `state.sessions[project.id]`
  as falsy — and two session creation requests hit the server, spawning two PTY processes
  for the same project.

  This creates orphan PTY sessions: one is stored in AppContext.sessions, the other is
  alive on the server but unreachable from the UI, consuming resources until the idle
  sweeper kills it.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `client/src/components/Sidebar.jsx`

  RECOMMENDED FIX — add a `creatingSession` ref to block concurrent creation:
  ```jsx
  const creatingSessionRef = useRef(false);

  async function handleProjectClick(project) {
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: project.id });
    dispatch({ type: 'SET_VIEW', payload: 'terminal' });

    if (!state.sessions[project.id] && !creatingSessionRef.current) {
      creatingSessionRef.current = true;
      try {
        const data = await apiPost('/api/v1/sessions', { projectId: project.id });
        dispatch({
          type: 'SET_SESSION',
          payload: { projectId: project.id, session: data.session },
        });
      } catch (err) {
        console.error('Failed to create session:', err.message);
      } finally {
        creatingSessionRef.current = false;
      }
    }
  }
  ```

  Using a `useRef` instead of `useState` avoids unnecessary re-renders and works correctly
  across async boundaries (refs are mutable and always reflect the latest value).

  NOTE: The `useRef` import is already present in the file (used by AddProjectModal or
  can be added to the existing import from 'react').

  CONSTRAINTS:
  - Do NOT modify `Terminal.jsx` or `useSession.js` (these are off-limits per Phase 9 rules).
  - Do not add new npm dependencies.
  - `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] Rapid double-click on a project card creates only ONE session (not two)
  - [ ] `creatingSessionRef` blocks concurrent apiPost calls for session creation
  - [ ] The ref is reset in the `finally` block (even on error)
  - [ ] Existing session reuse logic (`if (!state.sessions[project.id])`) still works
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #35: Bug Fix — ContextEditorView Unsaved Changes Data Loss (BUG-09)
Agent: frontend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  In `client/src/views/ContextEditorView.jsx`, the scope tabs ("Project Rules" / "User
  Global") call `onScopeChange(newScope)` which updates the `scope` state variable. This
  triggers the `loadContent` useCallback (which depends on `[activeProjectId, scope]`),
  which in turn triggers the `useEffect` at line 182–184 that fires `loadContent()`.

  The `loadContent` function overwrites `content`, `originalContent`, and `rules` with
  fresh data from the API — silently discarding any unsaved edits the user has made.

  SCENARIO:
  1. User is on "Project Rules" tab, editing a rule body
  2. User clicks "User Global" tab before clicking "Push Changes"
  3. The loadContent effect fires, all edits are lost with no confirmation

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `client/src/views/ContextEditorView.jsx`

  RECOMMENDED FIX — add a confirmation guard when switching scope:
  In the `Header` component, the `onScopeChange` callbacks should be intercepted:
  ```jsx
  function handleScopeSwitch(newScope) {
    if (newScope === scope) return; // already on this tab
    if (hasChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them and switch tabs?'
      );
      if (!confirmed) return;
    }
    setScope(newScope);
  }
  ```

  Then pass `handleScopeSwitch` as the `onScopeChange` prop to `<Header>` instead of
  the raw `setScope`.

  ALTERNATIVE: If the team prefers a non-blocking approach, the "Discard" button can
  be auto-triggered before the scope switch, or a custom modal can be used instead of
  `window.confirm`. The minimum viable fix is the `window.confirm` approach.

  CONSTRAINTS:
  - Do not modify any backend files.
  - Do not add new npm dependencies.
  - `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] Switching scope tabs when `hasChanges === true` shows a confirmation dialog
  - [ ] Clicking "Cancel" on the dialog keeps the user on the current tab (no data loss)
  - [ ] Clicking "OK" on the dialog switches tabs and loads the new scope data
  - [ ] Switching tabs when `hasChanges === false` does NOT show the dialog (no-op guard)
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #36: Bug Fix — Terminal Background Color Mismatch (BUG-17)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  The `Terminal.jsx` component (client/src/components/Terminal.jsx) sets the xterm.js
  terminal background color to `#1a1a1a` in two places:
  - Line 11: `TERM_OPTIONS.theme.background = '#1a1a1a'`
  - Line 110: inline style `backgroundColor: '#1a1a1a'`

  The Stitch design specification and `tailwind.config.js` define the terminal background
  as pure black (`terminal-bg: '#000000'`). The surrounding `TerminalView.jsx` container
  uses `bg-black` (which resolves to `#000000`). This creates a visible 2-tone effect:
  the xterm.js area is lighter (#1a1a1a) than the surrounding chrome (#000000).

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `client/src/components/Terminal.jsx`

  REQUIRED FIX:
  1. Line 11: Change `theme: { background: '#1a1a1a' }` → `theme: { background: '#000000' }`
  2. Line 110: Change `backgroundColor: '#1a1a1a'` → `backgroundColor: '#000000'`

  CONSTRAINT: This is the ONLY permitted modification to Terminal.jsx. Do not change
  any other terminal options (fontSize, fontFamily, cursorBlink). Do not refactor the
  component. The xterm.js instance lifecycle must remain untouched.

Knowledge: none
Acceptance Criteria:
  - [ ] xterm.js background is `#000000` (matches Tailwind `terminal-bg` token)
  - [ ] Terminal container inline style uses `#000000`
  - [ ] No 2-tone visual mismatch between xterm area and surrounding view
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #37: Bug Fix — Sidebar Error Feedback for Failed Session Creation (BUG-12, BUG-18)
Agent: frontend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  When a user clicks a project card in the sidebar, `handleProjectClick` calls
  `apiPost('/api/v1/sessions', { projectId })`. If this API call fails (e.g., the
  claude binary is not found on PATH, the project path doesn't exist, or the project
  directory is inaccessible), the catch block only does `console.error('Failed to
  create session:', err.message)`. The user sees:
  - No error message anywhere in the UI
  - The terminal view shows "DISCONNECTED" with no explanation
  - The "Active PTY Sessions" section stays at "0 Total"
  - No indication of what went wrong or how to fix it

  This is especially problematic because `claude` not being on PATH is a common
  first-run issue — the user has no way to know what's happening.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `client/src/components/Sidebar.jsx`

  RECOMMENDED FIX — add a visible error state:
  1. Add a `sessionError` state variable: `const [sessionError, setSessionError] = useState(null);`
  2. In the `catch` block of `handleProjectClick`, set it:
     ```js
     } catch (err) {
       console.error('Failed to create session:', err.message);
       setSessionError(err.message);
       // Auto-clear after 8 seconds
       setTimeout(() => setSessionError(null), 8000);
     }
     ```
  3. Render the error in the "Active PTY Sessions" section, below the loadError paragraph:
     ```jsx
     {sessionError && (
       <p className="px-4 pb-2 text-xs text-error">
         Session failed: {sessionError}
       </p>
     )}
     ```

  This gives the user immediate visibility into why the terminal is "DISCONNECTED" and
  what error the server returned (e.g., "claude binary not found", "ENOENT", "spawn error").

  CONSTRAINTS:
  - Do NOT modify Terminal.jsx or useSession.js.
  - Do not add new npm dependencies.
  - `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] When session creation fails, an error message appears in the sidebar
  - [ ] Error message shows the server's error text (e.g., "claude binary not found")
  - [ ] Error message auto-clears after a reasonable timeout (5-10 seconds)
  - [ ] Successful session creation does NOT show an error
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #38: Bug Fix — Sidebar Footer Hardcoded Version + Non-Functional Settings (BUG-19, BUG-20)
Agent: frontend-dev
Priority: LOW
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  Two minor issues in the `SidebarFooter` sub-component of `client/src/components/Sidebar.jsx`:

  **Issue 1 (BUG-20):** The version number is hardcoded as `v1.2.0` (line 209). It should
  dynamically read from the API so it stays in sync with `package.json`.

  **Issue 2 (BUG-19):** The "settings" icon/text has `cursor-pointer` and `hover:text-text-main`
  styles suggesting it's interactive, but there is no `onClick` handler — clicking it does
  nothing. This is misleading UX.

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `client/src/components/Sidebar.jsx`

  RECOMMENDED FIX FOR ISSUE 1:
  The backend already exposes `GET /api/v1/version` which returns `{ appVersion, nodeVersion,
  platform }`. Fetch the version on mount and display it:
  ```jsx
  const [appVersion, setAppVersion] = useState('...');
  useEffect(() => {
    apiGet('/api/v1/version')
      .then((data) => setAppVersion(data.appVersion ?? '0.0.0'))
      .catch(() => setAppVersion('err'));
  }, []);
  ```
  Then render `v{appVersion}` instead of `v1.2.0`.

  RECOMMENDED FIX FOR ISSUE 2:
  Option A (preferred): Remove `cursor-pointer` and hover styles from the settings span
  to make it look non-interactive (since no settings page exists yet). Keep the icon but
  style it as disabled/muted.
  Option B: Add a simple `onClick` handler that dispatches `SET_VIEW` to a 'settings' view
  — but this requires creating a SettingsView which is out of scope. Option A is preferred.

  CONSTRAINTS:
  - Do not add new npm dependencies.
  - `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] Version in sidebar footer is fetched from `/api/v1/version` API (not hardcoded)
  - [ ] Settings icon no longer looks clickable if no settings view exists, OR links to a
        meaningful action
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #39: Bug Fix — Sidebar Header Logo Overflow Guard (BUG-13)
Agent: frontend-dev
Priority: LOW
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Context:
  In `client/src/components/Sidebar.jsx`, the `SidebarHeader` sub-component renders a
  logo container (line 127):
  ```jsx
  <div className="size-7 rounded bg-gradient-to-br from-primary to-purple-800 flex items-center justify-center text-white shrink-0">
    <span className="material-symbols-outlined text-[16px]">terminal</span>
  </div>
  ```

  When Material Symbols fonts are NOT loaded (BUG-11), the word "terminal" renders as
  plain text (8 characters) inside a 28px × 28px container. The text overflows the box
  and overlaps with the adjacent "Claude Code" title.

  Even after BUG-11 (TASK #32) is fixed and icons render properly, there is no safety
  net if the font fails to load for any reason (e.g., offline mode, slow network).

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILE TO MODIFY: `client/src/components/Sidebar.jsx`

  REQUIRED FIX — add `overflow-hidden` to the logo container:
  ```jsx
  <div className="size-7 rounded bg-gradient-to-br from-primary to-purple-800 flex items-center justify-center text-white shrink-0 overflow-hidden">
  ```

  This ensures that even if the icon font fails, the fallback text is clipped to the
  container bounds and does not disrupt the layout.

  CONSTRAINTS:
  - Minimal change — only add a Tailwind class.
  - Do not add new npm dependencies.
  - `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] Logo container has `overflow-hidden` class
  - [ ] If icon font fails to load, fallback text is clipped (not overflowing)
  - [ ] When icon font loads correctly, icon renders normally within the container
  - [ ] `npm run build` passes with 0 errors
Dependencies: none
---

TASK #40: Bug Fix — Project Dashboard Accessibility & Modal Context (BUG-14, BUG-16, BUG-21)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Context:
  Three related UX/accessibility issues surfaced during the full QA pass:

  **Issue 1 (BUG-14):** In `ProjectsView.jsx`, both the "Register Existing Project" dashed
  card and the "Scaffold New Project" purple button at the bottom call `setShowModal(true)`,
  opening the same `AddProjectModal` with identical title, fields, and behavior. The
  "Scaffold New Project" CTA with its `rocket_launch` icon and persuasive copy creates an
  expectation of project scaffolding (templates, language selection), but delivers the same
  generic "Add Project" modal.

  FIX: Pass a `mode` prop to `AddProjectModal`:
  - `mode="register"` → title "Register Existing Project", current fields (name, path)
  - `mode="scaffold"` → title "Scaffold New Project", same fields for now but with a
    subtitle like "Scaffolding features coming soon" or with an additional "Template"
    dropdown as a placeholder. At minimum, differentiate the modal title.
  Add state: `const [modalMode, setModalMode] = useState(null);`
  "Register" sets `setModalMode('register')`, "Scaffold" sets `setModalMode('scaffold')`.

  **Issue 2 (BUG-16):** The three-dot menu (more_vert icon) on project cards is only
  revealed via mouse hover (CSS `opacity-0 group-hover:opacity-100`). Keyboard users
  cannot Tab-navigate to it or activate it.

  FIX: Keep the hover reveal for aesthetics, but add `focus-within:opacity-100` to the
  parent group so the button also becomes visible when focused via keyboard. Ensure the
  button element is focusable (`tabIndex={0}` if needed, though `<button>` is already
  focusable by default).

  **Issue 3 (BUG-21):** The "Register Agent" modal in `DeploymentManagerView.jsx` opens
  with a generic title and does not indicate whether the agent will be created at project
  or user scope based on the current context.

  FIX: If `activeProjectId` is set, default the scope toggle to "Project" and show the
  project name in the modal subtitle. If no project is selected, default to "User (global)".

  WORKING DIRECTORY: `C:\Users\arman\Downloads\Test workflows - Copia`

  FILES TO MODIFY:
  - `client/src/views/ProjectsView.jsx` (BUG-14 + BUG-16)
  - `client/src/components/AddProjectModal.jsx` (BUG-14 — accept `mode` prop)
  - `client/src/views/DeploymentManagerView.jsx` (BUG-21)

  CONSTRAINTS:
  - Do not modify backend files.
  - Do not add new npm dependencies.
  - `npm run build` must pass.

Knowledge: none
Acceptance Criteria:
  - [ ] "Register Existing Project" and "Scaffold New Project" open modals with different titles
  - [ ] AddProjectModal accepts a `mode` prop that controls the displayed title
  - [ ] Three-dot menu on project cards is reachable via keyboard Tab navigation
  - [ ] Three-dot menu becomes visible on focus (not only on hover)
  - [ ] "Register Agent" modal defaults scope based on current project context
  - [ ] `npm run build` passes with 0 errors
Dependencies: TASK #32
---

TASK #41: Phase 10 — Post-Fix Regression QA
Agent: qa-tester
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Context:
  After all Phase 10 bug fixes (Tasks #32-#40) are implemented, run a targeted regression
  test to verify:
  1. All 11 bugs (BUG-08 through BUG-21) identified in the QA Bug Report are resolved
  2. No new regressions were introduced by the fixes
  3. The existing 110-test suite still passes

  TEST PLAN:
  1. Start the server with `npm start` — verify clean startup with no errors
  2. Open http://127.0.0.1:3000/ in Chrome
  3. Open DevTools Console — VERIFY zero CSP violation errors (BUG-11 fix)
  4. VERIFY all Material Symbols icons render as graphical glyphs across all 5 views
  5. VERIFY Inter and JetBrains Mono fonts are loaded (inspect computed styles)
  6. VERIFY sidebar header logo icon does not overflow (BUG-13 fix)
  7. Navigate to Project Dashboard: VERIFY search bar icon renders correctly (BUG-15 fix)
  8. VERIFY "Register Existing Project" and "Scaffold" open modals with different titles (BUG-14 fix)
  9. VERIFY three-dot menu on cards is keyboard-accessible (BUG-16 fix)
  10. Rapid double-click a project card — VERIFY only one session is created (BUG-10 fix)
  11. If session creation fails — VERIFY error message appears in sidebar (BUG-12/18 fix)
  12. Navigate to Terminal View — VERIFY terminal background is #000000 (BUG-17 fix)
  13. Navigate to Context Editor — edit a rule, then switch scope tab — VERIFY confirmation
      dialog appears (BUG-09 fix)
  14. Navigate to Deployments — click "Register Agent" — VERIFY modal reflects scope (BUG-21 fix)
  15. Check sidebar footer — VERIFY version is dynamically fetched (BUG-20 fix)
  16. Check sidebar footer — VERIFY settings icon is not misleadingly interactive (BUG-19 fix)
  17. Run `npm test` — VERIFY all 110 tests pass with 0 failures
  18. Run `npm run build` — VERIFY 0 errors

  BUG REPORT REFERENCE: See `bug_report.md` in the project artifacts for the original
  detailed findings with screenshots and recordings.

Knowledge: none
Acceptance Criteria:
  - [ ] All 11 bugs (BUG-08 through BUG-21) verified as fixed
  - [ ] Zero CSP violation errors in Chrome DevTools Console
  - [ ] All Material Symbols icons render correctly in all 5 views
  - [ ] No new console errors introduced
  - [ ] Sidebar header, footer, and session section work correctly
  - [ ] Terminal background matches design spec
  - [ ] Context Editor unsaved-changes guard works
  - [ ] Modal context and accessibility fixes verified
  - [ ] `npm test` passes with 110+ tests (0 failures)
  - [ ] `npm run build` passes with 0 errors
  - [ ] Test results documented in `docs/TEST_RESULTS_PHASE10.md`
Dependencies: TASK #32, TASK #33, TASK #34, TASK #35, TASK #36, TASK #37, TASK #38, TASK #39, TASK #40
---

## Execution Order

### Parallel at start:
- TASK #1 (Architect — design)
- TASK #2 (DevOps — scaffold)

### After TASK #1 and TASK #2 complete:
- TASK #3 (Backend — foundation)

### After TASK #3 completes:
- TASK #4 (Backend — project API) [can run parallel with TASK #5 if architect is done]
- TASK #5 (Backend — SessionManager + WS) [depends on #3 and #4's data model]

### After TASK #4 and TASK #5 complete:
- TASK #6 (Frontend — terminal UI) [parallel]
- TASK #7 (Backend — entity APIs) [parallel]
- TASK #9 (Backend — job mode) [parallel]

### After TASK #6 completes:
- TASK #8 (Frontend — entity editors) [parallel with TASK #10]
- TASK #10 (Frontend — job UI) [parallel with TASK #8]
- TASK #11 (Frontend — projects view) [parallel with TASK #8 and #10]

### After TASK #7 completes:
- TASK #8 (Frontend — entity editors)

### After TASK #9 completes:
- TASK #10 (Frontend — job UI)

### After all feature tasks complete (#3-#11):
- TASK #12 (Backend — NFRs)

### Final phase (ALL in parallel after #12):
- TASK #13 (QA — full test suite)
- TASK #14 (Security — audit)
- TASK #15 (Docs — README)

### Phase 6 — Security hardening (unblocked, run in parallel after TASK #14):
- TASK #16 (Backend — replace exec() in openBrowser)
- TASK #17 (Backend — validate allowedTools)
- TASK #18 (Backend — validate PID range in ProcessRegistry)

### Phase 7 — v1.1 maintenance (all independent, run in parallel, no blocker):
- TASK #19 (Backend — fix JobRunner jobs Map memory leak)
- TASK #20 (Backend — fix rate limiter _rateLimitMap memory leak)
- TASK #21 (DevOps — upgrade vite to patch esbuild CVE)

### Phase 9 — Frontend Redesign (Stitch Design Implementation):

**Wave 1 — Foundation (no dependencies, start immediately):**
- TASK #23 (Frontend — Design system: Tailwind config, fonts, CSS, constants)

**Wave 2 — Sidebar + Views (all depend on #23, run in parallel):**
- TASK #24 (Frontend — New Sidebar navigation)
- TASK #25 (Frontend — Project Dashboard view) [also depends on #24]
- TASK #26 (Frontend — Live Terminal Hub view) [also depends on #24]
- TASK #27 (Frontend — Orchestration Center / Job Runner view) [also depends on #24]
- TASK #28 (Frontend — Context & Rules Editor view) [also depends on #24]
- TASK #29 (Frontend — Deployment Manager view) [also depends on #24]

Note: Tasks #25-#29 can run in parallel AFTER #24 completes, since they all need the
new sidebar/nav infrastructure. If a single frontend-dev agent is used, the recommended
serial order is: #24 -> #25 -> #26 -> #27 -> #28 -> #29

**Wave 3 — Integration (depends on ALL Wave 2 tasks):**
- TASK #30 (Frontend — App shell, routing, view integration)

**Wave 4 — QA (depends on #30):**
- TASK #31 (QA — Visual QA + functional regression testing)

### Phase 10 — Bug Hunt & Resolution (Current):

**Wave 1 — Backend fixes (no dependencies, run in parallel):**
- TASK #32 (Backend — Fix CSP to allow Google Fonts) [CRITICAL — unblocks all icon fixes]
- TASK #33 (Backend — Fix JobRunner spawn error handling)

**Wave 2 — Frontend fixes (all independent, run in parallel after #32):**
- TASK #34 (Frontend — Fix Sidebar duplicate session race condition)
- TASK #35 (Frontend — Fix ContextEditorView unsaved changes data loss)
- TASK #36 (Frontend — Fix Terminal background color mismatch)
- TASK #37 (Frontend — Fix Sidebar error feedback for failed sessions)
- TASK #38 (Frontend — Fix Sidebar footer hardcoded version + settings)
- TASK #39 (Frontend — Fix Sidebar header logo overflow guard)
- TASK #40 (Frontend — Fix Dashboard accessibility + modal context)

**Wave 3 — QA (depends on ALL Wave 1 + Wave 2 tasks):**
- TASK #41 (QA — Phase 10 post-fix regression testing)

---

## Task Status Summary

| # | Task | Agent | Priority | Difficulty | Status |
|---|------|-------|----------|------------|--------|
| 1 | System Architecture Design | architect | HIGH | HARD | COMPLETED |
| 2 | Monorepo Scaffold and Build System | devops | HIGH | EASY | COMPLETED |
| 3 | Server Foundation | backend-dev | HIGH | MEDIUM | COMPLETED |
| 4 | Project Management API | backend-dev | HIGH | EASY | COMPLETED |
| 5 | SessionManager + WebSocket Terminal Handler | backend-dev | HIGH | VERY HARD | COMPLETED |
| 6 | React Frontend — Sidebar + TerminalView | frontend-dev | HIGH | HARD | COMPLETED |
| 7 | Entity Management API | backend-dev | HIGH | HARD | COMPLETED |
| 8 | Entity Management UI | frontend-dev | HIGH | MEDIUM | COMPLETED |
| 9 | Job Mode API | backend-dev | HIGH | HARD | COMPLETED |
| 10 | Job Mode UI | frontend-dev | HIGH | MEDIUM | COMPLETED |
| 11 | Projects View UI | frontend-dev | MEDIUM | EASY | COMPLETED |
| 12 | NFRs — Performance + Reliability + Polish | backend-dev | MEDIUM | MEDIUM | COMPLETED |
| 13 | Full QA Test Suite | qa-tester | HIGH | HARD | COMPLETED |
| 14 | Pre-Release Security Audit | security | HIGH | MEDIUM | COMPLETED |
| 15 | Documentation | documenter | MEDIUM | EASY | COMPLETED |
| 16 | Security Hardening — replace exec() in openBrowser | backend-dev | HIGH | EASY | COMPLETED |
| 17 | Security Hardening — validate allowedTools whitelist | backend-dev | HIGH | EASY | COMPLETED |
| 18 | Security Hardening — validate PID range in ProcessRegistry | backend-dev | HIGH | EASY | COMPLETED |
| 19 | v1.1 — Fix JobRunner memory leak (evict completed jobs) | backend-dev | MEDIUM | EASY | COMPLETED |
| 20 | v1.1 — Fix rate limiter memory leak (TTL on _rateLimitMap) | backend-dev | MEDIUM | EASY | COMPLETED |
| 21 | v1.1 — Upgrade vite to patch esbuild CVE (MEDIUM-04) | devops | MEDIUM | EASY | COMPLETED |
| 22 | v1.2 — Add GET /api/v1/jobs/:id route (BUG-22) | backend-dev | HIGH | EASY | COMPLETED |
| 23 | Redesign — Design System Foundation (Tailwind, fonts, CSS) | frontend-dev | HIGH | MEDIUM | COMPLETED |
| 24 | Redesign — New Sidebar Navigation Component | frontend-dev | HIGH | MEDIUM | COMPLETED |
| 25 | Redesign — Project Dashboard View | frontend-dev | HIGH | MEDIUM | COMPLETED |
| 26 | Redesign — Live Terminal Hub View | frontend-dev | HIGH | HARD | COMPLETED |
| 27 | Redesign — Orchestration Center / Job Runner View | frontend-dev | HIGH | HARD | COMPLETED |
| 28 | Redesign — Context & Rules Editor View | frontend-dev | MEDIUM | HARD | COMPLETED |
| 29 | Redesign — Deployment Manager View | frontend-dev | MEDIUM | HARD | COMPLETED |
| 30 | Redesign — App Shell, Routing, View Integration | frontend-dev | HIGH | MEDIUM | COMPLETED |
| 31 | Redesign — Visual QA + Functional Regression Testing | qa-tester | HIGH | MEDIUM | COMPLETED |
| 32 | Bug Fix — CSP blocks Google Fonts (icons as text) | backend-dev | CRITICAL | EASY | COMPLETED |
| 33 | Bug Fix — JobRunner missing spawn error handler | backend-dev | HIGH | EASY | COMPLETED |
| 34 | Bug Fix — Sidebar duplicate session race condition | frontend-dev | MEDIUM | EASY | COMPLETED |
| 35 | Bug Fix — ContextEditorView unsaved changes loss | frontend-dev | HIGH | EASY | COMPLETED |
| 36 | Bug Fix — Terminal background color mismatch | frontend-dev | MEDIUM | EASY | COMPLETED |
| 37 | Bug Fix — Sidebar error feedback for failed sessions | frontend-dev | HIGH | EASY | COMPLETED |
| 38 | Bug Fix — Sidebar footer hardcoded version + settings | frontend-dev | LOW | EASY | COMPLETED |
| 39 | Bug Fix — Sidebar header logo overflow guard | frontend-dev | LOW | EASY | COMPLETED |
| 40 | Bug Fix — Dashboard accessibility + modal context | frontend-dev | MEDIUM | MEDIUM | COMPLETED |
| 41 | Phase 10 — Post-fix regression QA | qa-tester | HIGH | MEDIUM | COMPLETED |
| 42 | Terminal Bug Fix — Add session creation logic to ProjectsView | backend-dev | CRITICAL | EASY | COMPLETED |

---

_Last updated: 2026-03-26 by antigravity — Phase 10 + TASK 42 COMPLETE. All 42 tasks DONE. Ready for v2.1 release._

---

# V3 — Swarm Orchestrator
**PRD Version:** 3.0 · **Created:** 2026-03-27 · **Status:** ACTIVE
**Reference:** `docs/PRD.md` (V3), `docs/research_complete.md`, `docs/research_a/b/c.md`

All V3 tasks start at #43. Task #41 (already COMPLETED above) was the last V2 task.
Dependency: all V3 tasks implicitly require v2.1 (tasks #1-#42) to be complete.

## V3 Phase Map

| Phase | Tasks | Goal |
|-------|-------|------|
| V3 Phase 1 | #43–#50 | Backend Foundation — WorkflowStore, SwarmEngine skeleton, HandoffParser, routes, WS |
| V3 Phase 2 | #51–#58 | Canvas Static — @xyflow/react install, SwarmContext, nodes, edges, panels, routing |
| V3 Phase 3 | #59–#61 | Prompt-to-Flow — AI scaffold endpoint + animated canvas population |
| V3 Phase 4 | #62–#67 | Live Execution — SwarmEngine completion, handoff loop, animations, broadcast |
| V3 Phase 5 | #68–#73 | HITL + PTY Explosion — inbox, freeze/unfreeze, full-screen terminal |
| V3 Phase 6 | #74–#76 | Trigger Nodes — TriggerManager (webhook + RSS), TriggerNode UI |
| V3 Phase 7 | #77–#82 | QA + Security + Release — tests, audit, build verification, docs |

## V3 Execution Waves

```
WAVE 1 — Backend Foundation (Phase 1, sequential order within wave):
  #43 WorkflowStore.js  →  #44 workflows.js routes  →  #45 HandoffParser.js
  #46 SwarmEngine skeleton  →  #47 swarm.js routes  →  #48 swarmHandler.js (WS)
  #49 CircuitBreaker + BudgetTracker  →  #50 Security layer V3

WAVE 2 — Canvas Static (Phase 2, after Wave 1 Phase 1 complete):
  #51 deps install  →  #52 SwarmContext  →  #53 nodes  →  #54 HandoffEdge
  #55 AgentInspector  →  #56 BreadcrumbBar  →  #57 SwarmView+Canvas  →  #58 App routing

WAVE 3 — Prompt-to-Flow (Phase 3, after #47 + #57):
  #59 scaffold endpoint  →  #60 PromptToFlowBar  →  #61 staggered animation

WAVE 4 — Live Execution (Phase 4, after Wave 2 + Wave 3):
  #62 SwarmEngine complete  #63 useSwarm  #64 useHandoff  #65 AgentNode live
  #66 BroadcastBar + route  #67 heartbeat
  (all parallel after #62)

WAVE 5 — HITL + PTY Explosion (Phase 5, after Wave 4):
  #68 inbox route  #69 HitlInbox  #70 freeze/unfreeze  #71 PTY Explosion
  #72 InterAgentFeed  #73 useInbox
  (all parallel)

WAVE 6 — Triggers (Phase 6, after Wave 4):
  #74 TriggerManager  →  #75 triggers route  →  #76 TriggerNode UI

WAVE 7 — QA + Security + Release (Phase 7, after Wave 5 + Wave 6):
  #77 HandoffParser tests  #78 SwarmEngine tests  #79 Security audit
  #80 E2E V3  #81 build verify  #82 docs
  (parallel)
```

---

## V3 Tasks

---

TASK #43: WorkflowStore.js — Workflow JSON Persistence
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-sonnet-4-6
Status: COMPLETED
Dependencies: none (requires v2.1 complete — #42 done)
Context:
  Create `server/services/WorkflowStore.js` following the EXACT same pattern as the existing
  `server/services/ConfigStore.js`. WorkflowStore manages workflow definition JSON files persisted
  to `CONFIG_DIR/workflows/<id>.json` where CONFIG_DIR is `%APPDATA%\ClaudeCodeManager`.

  CRITICAL CONSTRAINTS (project-wide):
  - NEVER use `fs.writeFile` directly — always use `write-file-atomic`
  - ALWAYS validate paths with `path.resolve()` + assert prefix before any write
  - `shell: false` in any spawn (not applicable here but noted for pattern)
  - Workflow IDs must be server-generated UUIDs — NEVER client-supplied as primary key

  WHAT TO BUILD:
  A WorkflowStore class with these methods:
  - `async list()` → returns array of all WorkflowDefinition objects (read all JSON files in workflows/ dir)
  - `async get(id)` → returns single WorkflowDefinition or null
  - `async create(data)` → generates UUID, validates schema, writes JSON, returns created object
  - `async update(id, data)` → validates schema, atomic write, returns updated object
  - `async delete(id)` → unlinks file, returns boolean

  SCHEMA VALIDATION (FR-V3-03, SEC-V3-02, SEC-V3-06):
  Validate on every create/update:
  - `name`: required, max 100 chars, must match `/^[\w\s\-\.]+$/`
  - `description`: optional, max 500 chars
  - `nodes`: array, max 50 items
  - Each node `data.systemPrompt`: max 16384 chars (16 KB)
  - Each node `id`: must match `^[a-z][a-z0-9-]*$`
  - Return HTTP-ready { valid: false, errors: [] } object on failure

  WorkflowDefinition structure (FR-V3-04, FR-V3-05, FR-V3-06):
  ```js
  {
    id: "uuid",
    name: "string",
    projectId: "uuid",
    description: "string (optional)",
    nodes: [
      {
        id: "agent-slug",
        type: "agent" | "department" | "trigger",
        position: { x: number, y: number },
        style: { width: number, height: number },  // for department nodes
        data: {
          label: string,
          systemPrompt: string,          // agent nodes
          model: string,                 // agent nodes
          tools: string[],               // agent nodes
          isTriageNode: boolean,         // agent nodes
          maxTurns: number,              // agent nodes, default 20
          parentDepartmentId: string,    // agent nodes inside department
          triggerType: "webhook"|"rss",  // trigger nodes
          rssUrl: string,                // trigger nodes
          webhookPath: string,           // trigger nodes
          targetNodeId: string           // trigger nodes
        }
      }
    ],
    edges: [
      { id: "e-src-tgt", source: string, target: string, type: "handoff",
        data: { circuitBreakerThreshold: number | null } }
    ],
    settings: {
      mode: "hitl" | "auto",
      budgetTokens: number,
      circuitBreakerThreshold: number,
      defaultModel: string
    },
    initialContext: {},
    createdAt: ISO8601,
    updatedAt: ISO8601
  }
  ```

  Look at `server/services/ConfigStore.js` before writing — replicate its init() pattern,
  atomic write pattern, and error handling.

Acceptance criteria:
  - [ ] `WorkflowStore.create()` generates UUID, validates schema, writes to `workflows/<id>.json`
  - [ ] `WorkflowStore.get(id)` returns null for nonexistent IDs (no throw)
  - [ ] Schema validation rejects: name > 100 chars, node count > 50, systemPrompt > 16KB
  - [ ] All writes use `write-file-atomic`
  - [ ] Path validation prevents directory traversal
  - [ ] `WorkflowStore.list()` returns [] when workflows/ dir is empty

---

TASK #44: server/routes/workflows.js — CRUD API
Agent: backend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #43
Context:
  Create `server/routes/workflows.js` exposing the full CRUD API for workflows (FR-V3-02).
  Mount in `server/index.js` at `/api/v1/workflows`.

  ENDPOINTS:
  - `GET /api/v1/workflows` → 200 { workflows: WorkflowDefinition[] }
  - `POST /api/v1/workflows` → 201 { workflow: WorkflowDefinition } | 400 on validation fail
  - `GET /api/v1/workflows/:id` → 200 { workflow } | 404 if not found
  - `PUT /api/v1/workflows/:id` → 200 { workflow } | 404 | 400
  - `DELETE /api/v1/workflows/:id` → 204 | 404

  All mutating endpoints require `X-Requested-With: ClaudeCodeManager` header (existing CSRF check).
  Validation errors must return 400 with descriptive message (not generic "Bad Request").
  404 responses must include `{ error: "Workflow not found", id: <id> }`.

  Mount in server/index.js: `app.use('/api/v1/workflows', require('./routes/workflows'))` — look at
  how existing routes (projects.js, sessions.js) are mounted.

Acceptance criteria:
  - [ ] All 5 CRUD endpoints respond correctly
  - [ ] POST rejects invalid schema with 400 + error details
  - [ ] DELETE returns 204 (no body)
  - [ ] CSRF header enforced on POST/PUT/DELETE
  - [ ] Route mounted in server/index.js

---

TASK #45: HandoffParser.js — Stateful Rolling Buffer Token Extractor
Agent: backend-dev
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: COMPLETED
Dependencies: none (can run in parallel with #43-#44)
Context:
  Create `server/services/HandoffParser.js` — the most critical new service in V3.

  CRITICAL CONSTRAINT (from Research C + DEC-V3-01):
  ConPTY on Windows splits PTY output into ARBITRARY byte chunks. The token
  `__HANDOFF__:target-agent:base64payload` can arrive split across 2, 3, or more chunks.
  Line-by-line parsing WILL silently drop tokens. The ONLY correct approach is a stateful
  rolling byte accumulator.

  IMPLEMENTATION:
  ```js
  class HandoffParser {
    constructor() {
      this._buf = '';       // rolling string accumulator, max 4096 chars
    }

    // Feed a raw chunk from PTY onData
    // Returns array of parsed events: []  |  [{ type: 'handoff', targetId, contextUpdate }]  |  [{ type: 'done' }]
    feed(rawChunk) {
      // 1. Strip ANSI escape codes
      const clean = rawChunk
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // CSI sequences
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')  // OSC sequences
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      this._buf += clean;

      // 2. Enforce 4KB cap — keep newest bytes (SEC-V3-07)
      if (this._buf.length > 4096) {
        this._buf = this._buf.slice(this._buf.length - 4096);
      }

      const results = [];

      // 3. Extract __HANDOFF__ tokens
      const handoffRe = /__HANDOFF__:([a-z][a-z0-9-]*):((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)/g;
      let match;
      while ((match = handoffRe.exec(this._buf)) !== null) {
        try {
          const raw = Buffer.from(match[2], 'base64').toString('utf8');
          const ctx = JSON.parse(raw);
          // Schema validate contextUpdate (SEC-V3-07)
          if (this._validateContext(ctx)) {
            results.push({ type: 'handoff', targetId: match[1], contextUpdate: ctx });
          }
        } catch (_) { /* malformed — skip silently, log warning */ }
      }

      // 4. Extract __DONE__ token
      if (/__DONE__/.test(this._buf)) {
        results.push({ type: 'done' });
      }

      // 5. Clear matched region only if tokens found
      if (results.length > 0) {
        this._buf = '';
      }

      return results;
    }

    // contextUpdate validation: flat dict, string keys + values, max depth 1
    // max 50 keys, max value string length 1024 chars (SEC-V3-07)
    _validateContext(obj) {
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
      const keys = Object.keys(obj);
      if (keys.length > 50) return false;
      for (const k of keys) {
        if (typeof k !== 'string') return false;
        const v = obj[k];
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return false;
        if (typeof v === 'string' && v.length > 1024) return false;
      }
      return true;
    }

    reset() {
      this._buf = '';
    }
  }
  ```

  This class is PURE — no I/O, no side effects. Instantiate one HandoffParser per active agent PTY.
  Write unit tests for:
  - Token split across 2 chunks
  - Token split across 3 chunks
  - ANSI-polluted chunk
  - Oversized contextUpdate (should be rejected)
  - Malformed base64 (should not crash)
  - __DONE__ detection

Acceptance criteria:
  - [ ] `feed()` correctly detects __HANDOFF__ token split across 2+ chunks
  - [ ] `feed()` strips ANSI sequences before accumulating
  - [ ] 4KB cap enforced (oldest bytes dropped)
  - [ ] contextUpdate rejected if >50 keys or value >1024 chars
  - [ ] Malformed base64 or JSON does not throw — logged and skipped
  - [ ] `__DONE__` detected and returned as `{ type: 'done' }` event
  - [ ] Unit tests written for all edge cases above

---

---
Task: #46.1
Title: SwarmEngine.js — SessionManager swarmListeners Patch + Class Skeleton
Suggested Model: claude-opus-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: HIGH
Difficulty: HARD
Depends on: #43, #45
Status: PENDING
Context:
  First of three subtasks for SwarmEngine.js — the orchestration core of V3.
  This subtask adds the swarmListeners tap point to SessionManager and creates the
  SwarmEngine class skeleton with constructor, setWsBroadcast, stopExecution, and getStatus.

  CRITICAL CONSTRAINT — DEC-009 + DEC-014:
  SessionManager.js has a permanent pty.onData handler that MUST NEVER be removed or replaced
  (DEC-009, ConPTY deadlock prevention). The only safe way to add a secondary listener is via a
  Set that the existing handler iterates. Do NOT replace or modify the existing handler — only
  ADD the iteration of swarmListeners inside it.

  STEP 1 — Minimal patch to SessionManager.js:
  In `SessionManager.createSession()`, add ONE line to the session record:
  ```js
  session.swarmListeners = new Set();
  ```
  In the `pty.onData` handler (wherever the existing ring buffer write + WS broadcast happens),
  add AFTER the existing code (never before, never replacing):
  ```js
  // V3 swarm tap — non-destructive, DEC-014
  for (const listener of (session.swarmListeners || [])) {
    try { listener(chunk); } catch (_) {}
  }
  ```
  Wrap in try/catch so a failing swarm listener NEVER takes down the PTY pipeline.
  THE EXISTING onData HANDLER MUST NOT BE REMOVED OR REPLACED (DEC-009).

  STEP 2 — SwarmEngine class skeleton (server/services/SwarmEngine.js):
  ```js
  import { v4 as uuidv4 } from 'uuid';
  import HandoffParser from './HandoffParser.js';

  class SwarmEngine {
    constructor(sessionManager, workflowStore) {
      this._sessionManager = sessionManager;
      this._workflowStore = workflowStore;
      this._executions = new Map();   // executionId → WorkflowExecution
      this._wsBroadcast = null;
    }

    setWsBroadcast(fn) { this._wsBroadcast = fn; }

    async startExecution(workflowId, projectId, projectPath) { /* implemented in #46.2 */ }
    async _spawnAgentPty(executionId, nodeId) { /* implemented in #46.2 */ }
    _buildSystemPrompt(node, workflowContext, handoffTargets) { /* implemented in #46.3 */ }
    _startHeartbeat(executionId) { /* implemented in #46.3 */ }

    async stopExecution(executionId) {
      const execution = this._executions.get(executionId);
      if (!execution) return;
      clearInterval(execution.heartbeatTimer);
      for (const [nodeId, state] of execution.agentStates) {
        if (state.sessionId) {
          await this._sessionManager.killSession(state.sessionId);
        }
      }
      execution.status = 'stopped';
      this._executions.delete(executionId);
    }

    getStatus(executionId) {
      const e = this._executions.get(executionId);
      if (!e) return null;
      return {
        executionId: e.executionId,
        workflowId: e.workflowId,
        status: e.status,
        agentStates: Object.fromEntries(e.agentStates),
        edgeCounters: Object.fromEntries(e.edgeCounters),
        budget: e.budget || { estimatedTokensUsed: 0, limitTokens: 0 }
      };
    }
  }
  export default SwarmEngine;
  ```

  WorkflowExecution runtime state shape (never persisted):
  ```js
  {
    executionId: string,
    workflowId: string,
    workflowDef: WorkflowDefinition,
    status: 'running' | 'stopped',
    agentStates: Map<nodeId, { sessionId, status, handoffCount, lastOutputSnippet }>,
    edgeCounters: Map<edgeId, number>,
    workflowContext: {},
    heartbeatTimer: NodeJS.Timer | null,
    inboxItems: []
  }
  ```

Acceptance criteria:
  - [ ] SessionManager.js gets swarmListeners iteration INSIDE existing onData, not replacing it
  - [ ] DEC-009 preserved: existing ring buffer write and WS broadcast happen before and independently
  - [ ] Try/catch wraps each swarm listener call — a throwing listener never affects PTY
  - [ ] SwarmEngine class exported with constructor, setWsBroadcast, stopExecution, getStatus
  - [ ] 110 existing tests still pass after SessionManager.js patch

---

---
Task: #46.2
Title: SwarmEngine.js — startExecution + _spawnAgentPty + HandoffParser Tap
Suggested Model: claude-opus-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: HIGH
Difficulty: HARD
Depends on: #46.1
Status: PENDING
Context:
  Second of three subtasks for SwarmEngine.js.
  Implement `startExecution()` and `_spawnAgentPty()` in the class from #46.1.

  startExecution(workflowId, projectId, projectPath):
  1. Load workflow from WorkflowStore: `const wf = await this._workflowStore.get(workflowId)`
  2. If not found: throw Error('Workflow not found')
  3. Build executionId = uuidv4()
  4. Build WorkflowExecution object (see shape in #46.1)
  5. Find the triage node (node where data.isTriageNode === true, or first agent node)
  6. Spawn triage agent: `await this._spawnAgentPty(executionId, triageNode.id)`
  7. Store execution in this._executions Map
  8. Return executionId

  _spawnAgentPty(executionId, nodeId):
  1. Get execution: `const execution = this._executions.get(executionId)`
  2. Get node definition: `const node = execution.workflowDef.nodes.find(n => n.id === nodeId)`
  3. Build handoff targets list: edges where source === nodeId → target IDs
  4. Build system prompt string (calls _buildSystemPrompt from #46.3)
  5. Create session: `const sessionId = await this._sessionManager.createSession(projectId, projectPath)`
  6. Write system prompt to PTY stdin: `this._sessionManager.writeInput(sessionId, systemPrompt + '\n')`
  7. Create a HandoffParser instance for this agent
  8. Register swarm listener on the session's swarmListeners Set:
     ```js
     const session = this._sessionManager.getSession(sessionId);
     const tapFn = (chunk) => {
       const events = parser.feed(chunk);
       // Update lastOutputSnippet (last 500 chars)
       execution.agentStates.get(nodeId).lastOutputSnippet =
         (execution.agentStates.get(nodeId).lastOutputSnippet + chunk).slice(-500);
       for (const evt of events) {
         if (evt.type === 'handoff') this._onHandoff(executionId, nodeId, evt);
         if (evt.type === 'done') this._onDone(executionId, nodeId);
       }
     };
     session.swarmListeners.add(tapFn);
     ```
  9. Store sessionId + tapFn reference in agentStates for later removal:
     `execution.agentStates.set(nodeId, { sessionId, tapFn, status: 'running', handoffCount: 0, lastOutputSnippet: '' })`
  10. Emit WS: `{ type: 'agent_status', nodeId, status: 'running' }`

  _ensureAgentPty(executionId, nodeId):
  - Check if agentStates already has an active session for nodeId
  - If yes and status != 'done': return existing session (reuse)
  - If no or status=='done': spawn fresh PTY via _spawnAgentPty

  stopExecution must also remove swarm tap listeners:
  ```js
  // In stopExecution, before killSession:
  const session = this._sessionManager.getSession(state.sessionId);
  if (session && state.tapFn) session.swarmListeners.delete(state.tapFn);
  ```

Acceptance criteria:
  - [ ] startExecution() creates execution record and spawns triage agent PTY
  - [ ] _spawnAgentPty() registers HandoffParser tap on session.swarmListeners
  - [ ] lastOutputSnippet updated from tap callback (last 500 chars)
  - [ ] tapFn stored in agentStates for removal on stop
  - [ ] stopExecution() removes tapFn from swarmListeners before killing session
  - [ ] 110 existing tests still pass

---

---
Task: #46.3
Title: SwarmEngine.js — _buildSystemPrompt + _startHeartbeat
Suggested Model: claude-opus-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: HIGH
Difficulty: MEDIUM
Depends on: #46.2
Status: PENDING
Context:
  Third of three subtasks for SwarmEngine.js.
  Implement _buildSystemPrompt and _startHeartbeat in the class from #46.1.

  _buildSystemPrompt(node, workflowContext, handoffTargets):
  Assembles the system prompt following the OpenAI Swarm pattern (FR-V3-08, research_a.md):
  ```
  {node.data.systemPrompt}

  --- SWARM PROTOCOL (mandatory — never skip) ---
  Current workflow context:
  {each key}: {each value}
  ...

  When your task is complete and must pass to another agent, output EXACTLY as last line:
  __HANDOFF__:<targetId>:<base64_json_context_update>

  Valid target IDs: {handoffTargets.join(', ')}
  Context update format: {"key": "value", ...} — flat dict only, max 50 keys, values max 1024 chars

  When fully done (no further handoff needed):
  __DONE__

  Do NOT output the handoff or done token mid-response. Only as the very LAST line.
  --- END PROTOCOL ---
  ```

  If workflowContext is empty: omit the "Current workflow context:" section.
  If handoffTargets is empty: omit the Valid target IDs line, show __DONE__ only.

  _startHeartbeat(executionId):
  - Sets `execution.heartbeatTimer = setInterval(...)` every 5 minutes (300000ms)
  - On each tick: for every entry in execution.agentStates where status === 'running':
    `this._sessionManager.writeInput(state.sessionId, '')`
  - An empty string write resets the idle timer without sending visible input
  - Timer MUST be stored so stopExecution() can call clearInterval(execution.heartbeatTimer)
  - Call _startHeartbeat(executionId) at end of startExecution(), after triage agent spawned

  Also implement the _onHandoff and _onDone stubs (full impl in #62):
  ```js
  async _onHandoff(executionId, sourceNodeId, event) {
    // Placeholder — full impl in #62
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, { type: 'handoff_started',
        sourceNodeId, targetNodeId: event.targetId, edgeId: null, counter: 0 });
    }
  }
  _onDone(executionId, nodeId) {
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, { type: 'execution_status', status: 'agent_done', nodeId });
    }
  }
  ```

Acceptance criteria:
  - [ ] _buildSystemPrompt returns string with SWARM PROTOCOL block + valid target IDs
  - [ ] Context section omitted when workflowContext is empty
  - [ ] _startHeartbeat sets interval and stores timer on execution object
  - [ ] Heartbeat writes empty string to all 'running' agent sessions
  - [ ] stopExecution() clears the heartbeat timer (no leak)
  - [ ] 110 existing tests still pass

---

---
Task: #47.1
Title: server/routes/swarm.js — Execution Control Endpoints
Suggested Model: claude-sonnet-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: HIGH
Difficulty: MEDIUM
Depends on: #46.3
Status: PENDING
Context:
  First of two subtasks for swarm.js routes.
  Create `server/routes/swarm.js` and mount at `/api/v1/swarm` in server/index.js.
  Implement the 7 execution control and status endpoints (NOT the scaffold endpoint — that is #47.2).

  Look at server/routes/sessions.js and server/routes/jobs.js for the Express router pattern.
  All mutating endpoints require the CSRF header: X-Requested-With: ClaudeCodeManager.

  ENDPOINTS TO IMPLEMENT:
  - `POST /api/v1/swarm/:workflowId/start` → 201 { executionId, status: 'running' }
    Body: { projectId, projectPath } — validate both present
  - `POST /api/v1/swarm/:workflowId/pause` → 200 { ok: true }
    Calls swarmEngine.pauseExecution(executionId) — freeze all active agent PTYs (write \x03)
  - `POST /api/v1/swarm/:workflowId/resume` → 200 { ok: true }
    Calls swarmEngine.resumeExecution(executionId) — set agents back to 'running'
  - `DELETE /api/v1/swarm/:workflowId` → 204
    Calls swarmEngine.stopExecution(executionId) — kill all PTYs
  - `GET /api/v1/swarm/:workflowId/status` → 200 { executionId, status, agentStates, edgeCounters, budget }
    Calls swarmEngine.getStatus(executionId)
  - `GET /api/v1/swarm/:executionId/agent/:nodeId/output` → 200 { output: string }
    Reads agent's PTY ring buffer via sessionManager.getSession(sessionId).buffer.toString()
  - `POST /api/v1/swarm/:executionId/broadcast` → 200 { sent: N }
    Body: { text, scope: 'all' | departmentId | agentNodeId, mode: 'soft' | 'hard' }
    Broadcast implementation per research_c.md:
    - Soft: write text + '\x1b' + '\n' (Escape + Enter, no interrupt)
    - Hard: write '\x03' → wait 300ms → text → '\x1b' → wait 100ms → '\n'
    - Fire-and-forget per agent PTY — do NOT block waiting for acknowledgment

  INJECT swarmEngine into routes at init:
  In server/index.js: `import swarmRoutes from './routes/swarm.js'`
  Pass swarmEngine instance: `app.use('/api/v1/swarm', swarmRoutes(swarmEngine, sessionManager))`
  Pattern: export a factory function `(swarmEngine, sessionManager) => router`

Acceptance criteria:
  - [ ] All 7 endpoints respond with correct status codes
  - [ ] CSRF header required on POST/DELETE mutations
  - [ ] Route mounted in server/index.js with swarmEngine + sessionManager injected
  - [ ] start returns 404 when workflowId does not exist in WorkflowStore
  - [ ] status returns 404 when no execution is running for workflowId

---

---
Task: #47.2
Title: server/routes/swarm.js — Scaffold Endpoint (POST /api/v1/swarm/scaffold)
Suggested Model: claude-sonnet-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: MEDIUM
Difficulty: MEDIUM
Depends on: #47.1, #59
Status: PENDING
Context:
  Second of two subtasks for swarm.js routes.
  Add the scaffold endpoint to the router created in #47.1.
  This task is also superseded by the full implementation in #59 — #47.2 creates a stub that
  returns 501 Not Implemented, while #59 provides the complete implementation.

  STUB ENDPOINT (this task):
  `POST /api/v1/swarm/scaffold` → 501 { error: 'Not yet implemented — see task #59' }
  Body: { prompt, projectId, projectPath }
  Validate body present and prompt max 2000 chars. Return 400 on validation fail.

  This stub allows #57 (SwarmView) and #60 (PromptToFlowBar) to be built and tested
  against a real endpoint URL before #59 completes the implementation.

  The FINAL implementation in #59 will replace this stub with:
  1. Full JobRunner call to Claude API for workflow scaffold generation
  2. JSON extraction + WorkflowStore.create()
  3. 422 on parse failure, 408 on timeout
  See full spec in TASK #59.

Acceptance criteria:
  - [ ] POST /api/v1/swarm/scaffold exists and returns 501 (stub)
  - [ ] Validates prompt max 2000 chars → 400 on violation
  - [ ] CSRF header required
  - [ ] No raw prompt in logs or error responses

---

---
Task: #48.1
Title: swarmHandler.js — Channel Routing + Connection Management
Suggested Model: claude-sonnet-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: HIGH
Difficulty: MEDIUM
Depends on: #46.1
Status: PENDING
Context:
  First of two subtasks for swarmHandler.js.
  Create `server/ws/swarmHandler.js` and add channel=swarm routing to server/index.js.

  In `server/index.js`, find where `wss.on('connection', ...)` is handled and add routing:
  ```js
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'ws://localhost');
    const channel = url.searchParams.get('channel');
    if (channel === 'swarm') {
      swarmHandler.handleConnection(ws, url);
    } else {
      terminalHandler.handleConnection(ws, url, req);  // existing — do NOT touch
    }
  });
  ```

  swarmHandler.js — connection management:
  ```js
  const _clients = new Map();  // executionId → Set<WebSocket>

  function handleConnection(ws, url) {
    const executionId = url.searchParams.get('executionId');
    if (!executionId) {
      ws.close(4001, 'Missing executionId');
      return;
    }
    // Validate executionId exists — checked against swarmEngine._executions
    // If not found: ws.close(4004, 'Execution not found'); return;
    if (!_clients.has(executionId)) _clients.set(executionId, new Set());
    _clients.get(executionId).add(ws);
    ws.on('close', () => {
      const set = _clients.get(executionId);
      if (set) { set.delete(ws); if (set.size === 0) _clients.delete(executionId); }
    });
    // Send initial status snapshot
    const status = swarmEngine.getStatus(executionId);
    if (status) ws.send(JSON.stringify({ type: 'execution_status', ...status }));
  }
  ```

  Pass swarmEngine reference via factory: `export default (swarmEngine) => ({ handleConnection, broadcast })`

Acceptance criteria:
  - [ ] channel=swarm connections handled by swarmHandler (not terminalHandler)
  - [ ] Existing terminal WebSocket (no channel param) still handled by terminalHandler — zero regression
  - [ ] Missing executionId → close code 4001
  - [ ] Non-existent executionId → close code 4004
  - [ ] Client disconnection removes ws from _clients Set cleanly

---

---
Task: #48.2
Title: swarmHandler.js — broadcast() + WS Event Types
Suggested Model: claude-sonnet-4-6
Agent: backend-dev
Phase: V3 Phase 1 — Backend Foundation
Priority: HIGH
Difficulty: EASY
Depends on: #48.1
Status: PENDING
Context:
  Second of two subtasks for swarmHandler.js.
  Add the broadcast() function and wire it to SwarmEngine via setWsBroadcast().

  broadcast(executionId, event):
  ```js
  function broadcast(executionId, event) {
    const clients = _clients.get(executionId);
    if (!clients || clients.size === 0) return;
    const msg = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(msg); } catch (_) {}
      }
    }
  }
  ```

  WS event types that SwarmEngine broadcasts (all handled by broadcast()):
  - { type: "agent_status", nodeId, status, lastOutputSnippet }
  - { type: "handoff_started", sourceNodeId, targetNodeId, edgeId, counter }
  - { type: "handoff_completed", sourceNodeId, targetNodeId }
  - { type: "circuit_breaker", edgeId, counter, threshold }
  - { type: "inbox_item", item }
  - { type: "execution_status", status }
  - { type: "budget_update", estimatedTokensUsed, limitTokens }

  In server/index.js, after both swarmEngine and swarmHandler are initialized:
  `swarmEngine.setWsBroadcast((executionId, event) => swarmHandler.broadcast(executionId, event))`

Acceptance criteria:
  - [ ] broadcast() sends JSON to all OPEN clients for an executionId
  - [ ] Closed WS sockets silently skipped (no throw)
  - [ ] swarmEngine.setWsBroadcast() wired in server/index.js
  - [ ] SwarmEngine WS events arrive at connected browser clients during execution

---

TASK #49: CircuitBreaker.js + BudgetTracker.js
Agent: backend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #46.3
Context:
  Create two small pure services:

  CIRCUIT BREAKER (FR-V3-17):
  `server/services/CircuitBreaker.js`
  - `check(edgeId, counter, threshold)` → returns boolean `triggered`
  - When triggered: does NOT stop execution — emits advisory WS event only
  - Default threshold: 10 (configurable per workflow + per edge)
  - SwarmEngine calls this on every handoff: `circuitBreaker.check(edgeId, count, threshold)`
  - On trigger: SwarmEngine emits `{ type: 'circuit_breaker', edgeId, counter, threshold }`
  - Workflow NEVER stops due to circuit breaker — advisory only (user decision confirmed in PRD FR-V3-17)

  BUDGET TRACKER (FR-V3-18):
  `server/services/BudgetTracker.js`
  - `estimate(charCount)` → rough token estimate (1 token ≈ 4 chars)
  - `track(sessionId, outputChunk)` → accumulate char count for that session
  - `getTotal(executionId)` → total estimated tokens across all sessions
  - `checkBudget(executionId, limitTokens)` → returns { exceeded: boolean, estimatedUsed: number }
  - When exceeded: does NOT stop execution — emits soft WS event only (user decision confirmed in PRD FR-V3-18)
  - SwarmEngine emits `{ type: 'budget_update', estimatedTokensUsed, limitTokens }` when threshold crossed

Acceptance criteria:
  - [ ] CircuitBreaker.check() returns true when count >= threshold, false otherwise
  - [ ] BudgetTracker.estimate(4000) returns ~1000
  - [ ] Neither service stops execution — advisory emit only
  - [ ] Both are pure classes with no I/O

---

TASK #50: V3 Security Layer — SEC-V3-01 through SEC-V3-07
Agent: security
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #44, #47.1
Context:
  Implement all 7 mandatory V3 security requirements from the PRD (Appendix A).
  These are BLOCKING for any V3 release.

  SEC-V3-01: Webhook body size cap (32 KB)
  - In `server/routes/triggers.js` (created in #75): add `express.json({ limit: '32kb' })` middleware
  - Verify: POST 33KB body → 413 response

  SEC-V3-02: WorkflowDefinition schema validation
  - Already implemented in WorkflowStore.js (#43) — VERIFY it's working correctly
  - systemPrompt max 16KB, node count max 50, name whitelist, edge count max 200

  SEC-V3-03: SSRF prevention on RSS URLs (implement in TriggerManager #74 — pre-check here)
  - Create `server/utils/ssrfGuard.js` with a `isSafeUrl(urlString)` function
  - Block: 127.x, 10.x, 172.16.x-172.31.x, 192.168.x, ::1, localhost, 0.0.0.0
  - Use `dns.lookup()` to resolve hostname before allowing
  - Verify: `isSafeUrl('http://192.168.1.1/feed')` → false

  SEC-V3-04: Webhook rate limiter (separate from main)
  - In triggers route: 10 req/min per IP (not the main 200 req/min limit)
  - Reuse existing rate limiter middleware pattern from `server/middleware/`

  SEC-V3-05: HITL resume text size cap (8 KB)
  - In `server/routes/inbox.js` (#68): validate `body.resumeText` max 8192 chars → 400 if exceeded

  SEC-V3-06: Workflow name/description sanitization
  - Already in WorkflowStore.js (#43) schema validation — VERIFY character whitelist enforced

  SEC-V3-07: HandoffParser payload cap + contextUpdate validation
  - Already in HandoffParser.js (#45) — VERIFY 4KB cap and _validateContext() are correct
  - Add integration test: agent emits oversized handoff → HandoffParser drops it, engine doesn't crash

  Write a security test file `server/tests/security-v3.test.js` verifying each requirement.

Acceptance criteria:
  - [ ] POST 33KB to webhook endpoint → 413
  - [ ] `isSafeUrl('http://192.168.1.1')` → false; `isSafeUrl('http://example.com')` → true
  - [ ] Webhook rate limiter triggers at 11th request in 60s
  - [ ] Approve HITL with 9KB resumeText → 400
  - [ ] Oversized handoff payload dropped, engine not crashed
  - [ ] All 7 SEC-V3 requirements have passing tests

---

TASK #51: Client Dependencies — @xyflow/react + Zustand
Agent: devops
Priority: HIGH
Difficulty: TRIVIAL
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #48.2
Context:
  Install V3 frontend dependencies in `client/`:
  ```bash
  cd client && npm install @xyflow/react zustand
  ```
  - `@xyflow/react`: v12 (latest) — canvas library for swarm visualization
  - `zustand`: v4 (already in project? check package.json) — state management for ExecutionStore

  After install:
  1. Verify `client/package.json` has both dependencies
  2. Run `npm run build` from project root — verify build still passes (299+ modules, 0 errors)
  3. If build fails due to @xyflow/react peer deps, add `--legacy-peer-deps` or resolve conflict

  Note: Do NOT import @xyflow/react anywhere yet — just install it. Imports happen in #52-#57.

Acceptance criteria:
  - [ ] `client/package.json` contains `@xyflow/react` and `zustand`
  - [ ] `npm run build` completes without errors after install
  - [ ] No existing functionality broken (110 tests still pass)

---

TASK #52: SwarmContext.jsx — Zustand ExecutionStore
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #51
Context:
  Create `client/src/store/SwarmContext.jsx` — the Zustand-based execution state store for V3.
  This is COMPLETELY SEPARATE from the existing `AppContext.jsx` — do not modify AppContext.

  This store holds ONLY runtime swarm execution state. Canvas layout (positions, nodes array) stays
  in React Flow's internal state. Mixing them causes re-render storms on every agent tick.

  ZUSTAND STORE SHAPE:
  ```js
  {
    // Execution state
    activeExecutionId: null,
    executionStatus: 'idle' | 'running' | 'stopped',
    agentStates: {},          // { [nodeId]: { status, lastOutputSnippet, handoffCount } }
    edgeCounters: {},         // { [edgeId]: number }
    budget: { estimatedTokensUsed: 0, limitTokens: 0 },
    inboxItems: [],           // HITL pending approvals
    interAgentFeed: [],       // last 100 handoff events for InterAgentFeed panel

    // Canvas navigation
    focusedDepartmentId: null,
    departmentStack: [],       // breadcrumb stack of department IDs

    // Selected node (for AgentInspector panel)
    selectedNodeId: null,

    // WS connection state
    wsConnected: false,

    // Actions
    setExecution: (id, status) => ...,
    updateAgentState: (nodeId, patch) => ...,
    updateEdgeCounter: (edgeId, count) => ...,
    updateBudget: (used, limit) => ...,
    addInboxItem: (item) => ...,
    resolveInboxItem: (itemId) => ...,
    addFeedEvent: (event) => ...,

    setFocusedDepartment: (id) => ...,  // pushes to departmentStack
    navigateBreadcrumb: (index) => ..., // pops stack to that depth
    setSelectedNode: (id) => ...,
    setWsConnected: (b) => ...,
    reset: () => ...                    // clear all execution state
  }
  ```

  Export: `useSwarmStore` (Zustand hook) + `SwarmProvider` (thin context wrapper for App.jsx compatibility)
  AgentNode components subscribe like: `const agentState = useSwarmStore(s => s.agentStates[nodeId])`
  This pattern prevents global re-renders — only the subscribing component re-renders.

Acceptance criteria:
  - [ ] Store created with all state fields and actions above
  - [ ] `useSwarmStore(s => s.agentStates[nodeId])` returns only that agent's state
  - [ ] `setFocusedDepartment(id)` pushes id to departmentStack
  - [ ] `navigateBreadcrumb(0)` pops stack back to root (focusedDepartmentId = null)
  - [ ] Store is isolated from AppContext — no imports between them

---

---
Task: #53.1
Title: AgentNode.jsx — Custom React Flow Agent Node
Suggested Model: claude-opus-4-6
Agent: frontend-dev
Phase: V3 Phase 2 — Canvas Static
Priority: HIGH
Difficulty: MEDIUM
Depends on: #52
Status: PENDING
Context:
  Create `client/src/canvas/nodes/AgentNode.jsx` — the primary node type in the swarm canvas.

  CRITICAL REACT FLOW v12 RULES (from research_b.md):
  - ALL setNodes calls MUST use immutable spread: `{ ...node, data: { ...node.data } }`
  - NEVER mutate node objects in place — React Flow v12 breaks silently
  - Execution state (status, counters) MUST live in Zustand, NOT in node.data

  AgentNode.jsx (`type: "agent"`):
  - Shows: label, model badge (small pill), status indicator dot
  - Status colors: idle=gray (#6b7280), running=blue (#3b82f6) with pulse, done=green (#22c55e), frozen=orange (#f97316)
  - Subscribes: `const agentState = useSwarmStore(s => s.agentStates[data.id] || { status: 'idle' })`
  - onDoubleClick: `useSwarmStore.getState().setPtyExplosionNodeId(id)` (for PTY Explosion #71)
  - Wrapped in React.memo — never re-renders unless its own slice of store changes
  - Animated border when running: CSS @keyframes agentPulse with blue box-shadow glow
  - React Flow handles (source/target) visible on hover

  Export AgentNode as default. It will be registered in SwarmCanvas (#57.1) as `nodeTypes.agent`.

Acceptance criteria:
  - [ ] Correct status dot color for all 4 states (idle/running/done/frozen)
  - [ ] Blue pulsing border animation when status='running'
  - [ ] Subscribes ONLY to its own agentState slice (no global re-renders)
  - [ ] onDoubleClick sets ptyExplosionNodeId in SwarmStore
  - [ ] Wrapped in React.memo

---

---
Task: #53.2
Title: DepartmentNode.jsx — Group Container Node with Collapse/Expand
Suggested Model: claude-opus-4-6
Agent: frontend-dev
Phase: V3 Phase 2 — Canvas Static
Priority: HIGH
Difficulty: HARD
Depends on: #52
Status: PENDING
Context:
  Create `client/src/canvas/nodes/DepartmentNode.jsx`.
  This is the most complex canvas node — it acts as a group container for agent nodes.

  CRITICAL REACT FLOW v12 RULES:
  - Parent (department) nodes MUST appear BEFORE their children in the nodes array
  - DepartmentNode width/height MUST be set via `style: { width, height }` on the node object — NOT node fields
  - Use `setNodes` (not `updateNode`) for batch updates — updateNode has selection bug #5036

  DepartmentNode.jsx (`type: "department"`, renders as group container):
  - Style: semi-transparent dark background (rgba(17,24,39,0.6)), dashed border (#374151), label at top
  - Toggle button (▶ collapsed / ▼ expanded) in top-right corner
  - Collapse logic using useReactFlow():
    ```js
    const { getNodes, setNodes } = useReactFlow();
    const collapse = () => {
      const childIds = getNodes().filter(n => n.parentId === id).map(n => n.id);
      setNodes(nodes => nodes.map(n =>
        childIds.includes(n.id) ? { ...n, hidden: !data.collapsed } : n
      ));
      // Also update the department node's data.collapsed flag immutably:
      setNodes(nodes => nodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, collapsed: !data.collapsed } } : n
      ));
    };
    ```
  - Double-click: `useSwarmStore.getState().setFocusedDepartment(id)` → drill-down
  - Wrapped in React.memo

Acceptance criteria:
  - [ ] Collapse/expand correctly sets hidden=true/false on all child nodes
  - [ ] No node.data mutation — always immutable spread with setNodes
  - [ ] Double-click fires setFocusedDepartment
  - [ ] Semi-transparent background + dashed border style
  - [ ] Wrapped in React.memo

---

---
Task: #53.3
Title: TriggerNode.jsx — Webhook/RSS Trigger Node (stub)
Suggested Model: claude-sonnet-4-6
Agent: frontend-dev
Phase: V3 Phase 2 — Canvas Static
Priority: MEDIUM
Difficulty: EASY
Depends on: #52
Status: PENDING
Context:
  Create `client/src/canvas/nodes/TriggerNode.jsx` — the canvas node for webhook and RSS triggers.
  This is a stub implementation for Phase 2 canvas; full trigger state display is completed in #76.

  TriggerNode.jsx (`type: "trigger"`):
  - Shows: trigger type (data.triggerType === 'webhook' → chain-link icon, 'rss' → signal icon)
  - Shows: label (from data.label)
  - Shows: URL/path (data.webhookPath or data.rssUrl, truncated to 30 chars)
  - Status: read-only — shows "waiting" when no execution active
  - During execution: subscribes to trigger state from SwarmStore
  - No interactive controls — configured in AgentInspector (#55)
  - Wrapped in React.memo

  Note: Use text-based icons (W for webhook, R for RSS) as placeholder until icon library confirmed.
  Full fired/timestamp display completed in #76.

Acceptance criteria:
  - [ ] Webhook type shows different icon/label from RSS type
  - [ ] URL/path shown (truncated)
  - [ ] Read-only status display
  - [ ] Wrapped in React.memo

---

TASK #54: HandoffEdge.jsx — Animated Handoff Connection
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #52, #53.1
Context:
  Create `client/src/canvas/edges/HandoffEdge.jsx` — a custom React Flow edge that shows:
  - An animated "light pulse" traveling along the edge path when a handoff is in progress
  - A badge `[xN]` showing the handoff count for that edge
  - The badge turns orange when circuit breaker threshold is approached (>80%)

  IMPLEMENTATION:
  ```jsx
  // Uses React Flow's getBezierPath for the edge path
  import { getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

  const HandoffEdge = ({ id, sourceX, sourceY, targetX, targetY, ...props }) => {
    const counter = useSwarmStore(s => s.edgeCounters[id] || 0);
    const isAnimating = useSwarmStore(s => s.animatingEdges?.has(id));

    const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });

    return (
      <>
        <path id={id} className={`react-flow__edge-path ${isAnimating ? 'handoff-pulse' : ''}`} d={path} />
        {counter > 0 && (
          <EdgeLabelRenderer>
            <div style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
                 className={`edge-counter-badge ${counter > 8 ? 'edge-counter-warn' : ''}`}>
              x{counter}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  };
  ```

  CSS (add to SwarmView.css or global styles):
  ```css
  @keyframes handoff-pulse {
    0% { stroke-dashoffset: 100; opacity: 0.3; }
    50% { opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 0.3; }
  }
  .handoff-pulse { animation: handoff-pulse 0.8s ease-in-out; stroke-dasharray: 10 5; }
  .edge-counter-badge { background: #374151; color: #fff; border-radius: 4px; padding: 2px 6px; font-size: 11px; }
  .edge-counter-warn { background: #d97706; }
  ```

  Register as `edgeTypes={{ handoff: HandoffEdge }}` in SwarmCanvas.jsx.

Acceptance criteria:
  - [ ] HandoffEdge shows `[xN]` badge when counter > 0
  - [ ] Badge turns orange when counter > 8 (approaching default threshold of 10)
  - [ ] Pulse animation plays when edge is animating
  - [ ] Works correctly with React Flow v12 getBezierPath API

---

TASK #55: AgentInspector.jsx — Node Configuration Panel
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #52, #53.1
Context:
  Create `client/src/panels/AgentInspector.jsx` — the right-side panel that appears when
  a node is selected on the canvas.

  SECTIONS:
  1. Node identity: name (editable), type badge, ID (read-only)
  2. System prompt editor: multiline textarea, character counter (max 16KB)
  3. Model selector: dropdown with claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5
  4. Tools list: checkboxes for common tools (file_read, file_write, web_search, etc.)
  5. Settings: maxTurns (number input), isTriageNode (checkbox)
  6. "Load from existing agent" button: opens dropdown listing available `.claude/agents/` files
     for the current project — lets user import a pre-built agent's system prompt

  BEHAVIOR:
  - Panel appears when `selectedNodeId !== null` in SwarmStore
  - Changes are applied to the canvas via `updateNodeData(selectedNodeId, newData)` from `useReactFlow()`
  - "Save Workflow" button triggers `PUT /api/v1/workflows/:id` with the current canvas state
  - Unsaved changes shown with a dot indicator (similar to ContextEditorView)

  This panel must work both BEFORE execution (editing) and DURING execution (read-only for
  systemPrompt when agent is running, but model/tools still editable for next execution).

Acceptance criteria:
  - [ ] Panel shows when node is selected, hides when nothing is selected
  - [ ] System prompt changes update the node in React Flow canvas
  - [ ] Character counter shows remaining chars of 16KB limit
  - [ ] Model dropdown populated with 3 Claude models
  - [ ] "Load from existing agent" lists .claude/agents/ files from the project

---

TASK #56: BreadcrumbBar.jsx — Department Drill-Down Navigation
Agent: frontend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #52
Context:
  Create `client/src/canvas/overlays/BreadcrumbBar.jsx`.

  Shows the current navigation depth when inside a department drill-down:
  `Home > Marketing > Copywriting`

  Each segment is clickable and navigates to that depth via `navigateBreadcrumb(index)`.
  Clicking "Home" always returns to the top-level canvas.
  Hidden (returns null) when `departmentStack.length === 0`.

  Department names are resolved from the SwarmStore's workflow definition nodes.

  ```jsx
  const BreadcrumbBar = () => {
    const { departmentStack, navigateBreadcrumb } = useSwarmStore();
    if (!departmentStack.length) return null;
    return (
      <div className="breadcrumb-bar">
        <span onClick={() => navigateBreadcrumb(0)} className="breadcrumb-link">Home</span>
        {departmentStack.map((id, i) => (
          <>
            <span className="breadcrumb-sep"> › </span>
            <span key={id} onClick={() => navigateBreadcrumb(i + 1)} className="breadcrumb-link">
              {getDeptLabel(id)}
            </span>
          </>
        ))}
      </div>
    );
  };
  ```

Acceptance criteria:
  - [ ] Hidden when at top-level (departmentStack empty)
  - [ ] Shows correct labels for each drill-down level
  - [ ] Clicking a breadcrumb navigates correctly (pops stack to that depth)
  - [ ] "Home" click always returns to root

---

---
Task: #57.1
Title: SwarmCanvas.jsx — React Flow Canvas with Node/Edge Types + Drill-Down
Suggested Model: claude-opus-4-6
Agent: frontend-dev
Phase: V3 Phase 2 — Canvas Static
Priority: HIGH
Difficulty: HARD
Depends on: #52, #53.1, #53.2, #53.3, #54, #56
Status: PENDING
Context:
  Create `client/src/canvas/SwarmCanvas.jsx` — the React Flow canvas component.
  This is the inner canvas that SwarmView (#57.2) embeds. It does NOT include the toolbar or panels.

  CRITICAL REACT FLOW v12 RULES (from research_b.md):
  - Parent nodes (DepartmentNode) MUST appear BEFORE child nodes in the nodes array
  - Use ReactFlowProvider (added in #58) as an ancestor — never create a second ReactFlowProvider here
  - Canvas state (nodes/edges) lives in local useState, NOT in Zustand — DEC-011

  IMPLEMENTATION:
  ```jsx
  import { ReactFlow, Background, Controls, MiniMap, useReactFlow } from '@xyflow/react';
  import '@xyflow/react/dist/style.css';
  import { useMemo, useEffect } from 'react';
  import { useSwarmStore } from '../store/SwarmContext';
  import AgentNode from './nodes/AgentNode';
  import DepartmentNode from './nodes/DepartmentNode';
  import TriggerNode from './nodes/TriggerNode';
  import HandoffEdge from './edges/HandoffEdge';
  import BreadcrumbBar from './overlays/BreadcrumbBar';

  const nodeTypes = { agent: AgentNode, department: DepartmentNode, trigger: TriggerNode };
  const edgeTypes = { handoff: HandoffEdge };

  const SwarmCanvas = ({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick }) => {
    const focusedDept = useSwarmStore(s => s.focusedDepartmentId);
    const { fitView } = useReactFlow();

    // Matrioska drill-down filtering
    const displayedNodes = useMemo(() => {
      if (!focusedDept) return nodes;
      return nodes.filter(n => n.id === focusedDept || n.parentId === focusedDept);
    }, [nodes, focusedDept]);

    const displayedEdges = useMemo(() => {
      if (!focusedDept) return edges;
      const visibleIds = new Set(displayedNodes.map(n => n.id));
      return edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
    }, [edges, displayedNodes, focusedDept]);

    useEffect(() => {
      const t = setTimeout(() => fitView({ padding: 0.1 }), 50);
      return () => clearTimeout(t);
    }, [focusedDept]);

    return (
      <ReactFlow nodes={displayedNodes} edges={displayedEdges}
                 nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                 onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                 onConnect={onConnect} onNodeClick={onNodeClick}
                 fitView>
        <Background /><Controls /><MiniMap />
        <BreadcrumbBar />
        {/* PromptToFlowBar added in #60 */}
        {/* BroadcastBar added in #66 */}
      </ReactFlow>
    );
  };
  export default SwarmCanvas;
  ```

  Important: PromptToFlowBar and BroadcastBar are placeholders — add them when those tasks complete.
  Use React Flow's `onNodeClick` to update `selectedNodeId` in SwarmStore (for AgentInspector).

Acceptance criteria:
  - [ ] SwarmCanvas renders @xyflow/react with all 3 node types + HandoffEdge
  - [ ] Drill-down filtering: only nodes matching focusedDept or its children shown
  - [ ] Edges filtered to only show connections between visible nodes
  - [ ] fitView() called with 50ms delay when focusedDepartmentId changes
  - [ ] onNodeClick dispatches setSelectedNode to SwarmStore
  - [ ] npm run build passes after this task

---

---
Task: #57.2
Title: SwarmView.jsx — Main V3 Layout Shell + Toolbar
Suggested Model: claude-opus-4-6
Agent: frontend-dev
Phase: V3 Phase 2 — Canvas Static
Priority: HIGH
Difficulty: MEDIUM
Depends on: #57.1, #55
Status: PENDING
Context:
  Create `client/src/views/SwarmView.jsx` — the top-level view that wraps SwarmCanvas in a
  full application layout with toolbar, right panel, and bottom drawer.

  LAYOUT (CSS grid or flex):
  ```
  +-------------------------------------------+
  | Toolbar: [workflow name] [▶ Start] [⏸ Pause] [⏹ Stop] [status badge]  |
  +-------------------------------------------+
  | Canvas (flex-1)         | AgentInspector  |
  |                         | (320px, right)  |
  |                         |                 |
  +-------------------------------------------+
  | Bottom drawer: [Inbox tab] [Feed tab]      |
  | (collapsible, 200px when open)             |
  +-------------------------------------------+
  ```

  TOOLBAR:
  - Workflow name: from useWorkflow(workflowId).workflow.name — editable on click
  - Start button (▶): calls useSwarm().start(workflowId, projectId, projectPath)
  - Pause button (⏸): calls useSwarm().pause(workflowId)
  - Stop button (⏹): calls useSwarm().stop(workflowId)
  - Status badge: shows executionStatus from SwarmStore (idle/running/stopped)
  - Save button: calls useWorkflow().update() with current nodes/edges state

  CANVAS SECTION:
  - useState for nodes/edges (React Flow canonical pattern — NOT Zustand)
  - useNodesState() and useEdgesState() from @xyflow/react
  - Pass to SwarmCanvas: nodes, edges, onNodesChange, onEdgesChange, onConnect

  RIGHT PANEL:
  - Shows AgentInspector when selectedNodeId !== null in SwarmStore
  - Empty state: "Select a node to configure"

  BOTTOM DRAWER (tabs: Inbox | Feed):
  - Inbox tab: placeholder for HitlInbox (#69)
  - Feed tab: placeholder for InterAgentFeed (#72)
  - Collapsible — toggle button at bottom edge

  PTY EXPLOSION OVERLAY (from #71 — add placeholder):
  ```jsx
  const ptyExplosionNodeId = useSwarmStore(s => s.ptyExplosionNodeId);
  {ptyExplosionNodeId && <div className="pty-explosion-overlay">[Terminal placeholder #71]</div>}
  ```

  useSwarm hook is a stub at this point (full impl in #63) — pass empty start/stop/pause.

Acceptance criteria:
  - [ ] 3-section layout (toolbar + canvas + bottom drawer) renders without errors
  - [ ] Toolbar shows workflow name and Start/Pause/Stop buttons
  - [ ] Status badge reflects executionStatus from SwarmStore
  - [ ] Right panel shows/hides based on selectedNodeId
  - [ ] Bottom drawer tabs (Inbox/Feed) visible (can be empty placeholders)
  - [ ] npm run build passes after this task

---

TASK #58: App.jsx + Sidebar — Add Swarm Navigation
Agent: frontend-dev
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #57.2
Context:
  Wire SwarmView into the existing app navigation.

  In `client/src/App.jsx`:
  - Add `import SwarmView from './views/SwarmView'`
  - Add route case for `view === 'swarm'` → render `<SwarmView />`
  - Wrap app (or SwarmView specifically) with `<ReactFlowProvider>` from @xyflow/react

  In `client/src/components/Sidebar.jsx`:
  - Add swarm navigation item to the sidebar (icon: network/graph icon from existing icon set)
  - Label: "Swarm" or "Workflows"
  - Clicking sets `view = 'swarm'` in AppContext

  In `client/src/hooks/useWorkflow.js` (NEW):
  - `const { workflows, loading, createWorkflow, updateWorkflow, deleteWorkflow } = useWorkflow()`
  - CRUD operations via `/api/v1/workflows` endpoints
  - Used by SwarmView to load/save workflow state

Acceptance criteria:
  - [ ] Clicking swarm nav item in sidebar shows SwarmView
  - [ ] ReactFlowProvider wraps the swarm view (required by @xyflow/react)
  - [ ] useWorkflow hook exposes create/update/delete with correct API calls
  - [ ] Existing views (Terminal, Jobs, etc.) still work after routing change

---

TASK #59: POST /api/v1/swarm/scaffold — Prompt-to-Flow Backend
Agent: backend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #47.1, #47.2
Context:
  This task completes the scaffold endpoint in `server/routes/swarm.js` (stub in #47).
  The full implementation:

  1. Receive `{ prompt, projectId, projectPath }` in body
  2. Validate: prompt max 2000 chars, projectId is UUID
  3. Build scaffold system prompt (see #47 for template) — inject user prompt at end
  4. Call: `const jobId = await jobRunner.startJob(projectId, projectPath, scaffoldSystemPrompt, 'none', 1)`
  5. Wait for job completion: poll `jobRunner.getJob(jobId)` until status === 'done' (or 'error')
     Use a promise + event emitter pattern to avoid polling loop
  6. Extract JSON: try markdown fence pattern first, then bare JSON pattern
  7. Parse and validate via WorkflowStore.validate() (not create yet — validate first)
  8. On success: `await workflowStore.create(projectId, parsedWorkflow)` → return 201
  9. On any failure: return 422 `{ error: 'SCAFFOLD_PARSE_FAILED' }` — DO NOT include prompt or raw
     output in the error response (SEC-08 equivalent for V3)

  TIMEOUT: Add 60-second timeout. If job doesn't complete in 60s → cancel it → return 408.

Acceptance criteria:
  - [ ] Returns 201 with valid WorkflowDefinition on success
  - [ ] Returns 422 on unparseable JSON (not 500)
  - [ ] Returns 408 on 60s timeout
  - [ ] Raw prompt and raw Claude output never appear in error responses or logs
  - [ ] Workflow saved to disk via WorkflowStore.create()

---

TASK #60: PromptToFlowBar.jsx + Staggered Animation
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #57.1, #59
Context:
  Create `client/src/canvas/overlays/PromptToFlowBar.jsx`.

  A floating input bar at the bottom of the canvas (overlaid on React Flow):
  - Text input: "Describe your workflow..." placeholder
  - Submit button: "Generate ✨"
  - Loading state: shows "Scaffolding AI..." with spinner
  - Error state: brief toast "Could not generate workflow — try rephrasing"

  On submit:
  1. Show "Scaffolding AI..." animation
  2. POST to `/api/v1/swarm/scaffold` with `{ prompt, projectId, projectPath }`
  3. On success: animate nodes onto canvas with 80ms stagger per node (FR-V3-19):
     ```js
     const addNodesWithAnimation = async (nodes) => {
       for (let i = 0; i < nodes.length; i++) {
         await new Promise(r => setTimeout(r, 80));
         setNodes(prev => [...prev, { ...nodes[i], style: { ...nodes[i].style, opacity: 0 } }]);
         // fade-in via CSS transition
       }
     };
     ```
  4. On error: show toast for 3 seconds, canvas unchanged
  5. After successful scaffold: call fitView() to show all new nodes

Acceptance criteria:
  - [ ] Bar overlaid on canvas, not blocking canvas interaction
  - [ ] "Scaffolding AI..." shown during API call
  - [ ] Nodes appear one by one with 80ms delay
  - [ ] fitView() called after all nodes added
  - [ ] Error toast shown for 3s on 422/408, canvas unchanged

---

TASK #61: useWorkflow.js — Workflow CRUD Hook (consolidate)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #58
Context:
  Create/finalize `client/src/hooks/useWorkflow.js` (stub from #58).
  Full implementation with loading states, error handling, and cache.

  ```js
  const useWorkflow = (workflowId) => {
    const [workflow, setWorkflow] = useState(null);
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadAll = async () => { ... GET /api/v1/workflows };
    const load = async (id) => { ... GET /api/v1/workflows/:id };
    const create = async (data) => { ... POST /api/v1/workflows };
    const update = async (id, data) => { ... PUT /api/v1/workflows/:id };
    const remove = async (id) => { ... DELETE /api/v1/workflows/:id };

    return { workflow, workflows, loading, error, loadAll, load, create, update, remove };
  };
  ```

Acceptance criteria:
  - [ ] All 5 CRUD operations call the correct endpoints with X-Requested-With header
  - [ ] Loading state correctly reflects in-flight requests
  - [ ] Error state populated on API failures

---

---
Task: #62.1
Title: SwarmEngine.js — _onHandoff: Context Merge + Edge Counter + PTY Spawn
Suggested Model: claude-opus-4-6
Agent: backend-dev
Phase: V3 Phase 4 — Live Execution
Priority: HIGH
Difficulty: HARD
Depends on: #46.3, #49
Status: PENDING
Context:
  First of three subtasks completing the SwarmEngine handoff loop (from skeleton in #46.3).
  Replace the _onHandoff stub with the first half of the full implementation.

  IMPLEMENT _onHandoff steps 1-4 (context merge + target PTY spawn):

  Helper methods to add:
  - `_findEdgeId(workflowDef, sourceNodeId, targetNodeId)`:
    Find the edge object where source===sourceNodeId and target===targetNodeId.
    Return the edge.id string, or `<sourceNodeId>-<targetNodeId>` if no matching edge.
  - `_getThreshold(workflowDef, edgeId)`:
    Find edge by id, return edge.data.circuitBreakerThreshold ?? workflowDef.settings.circuitBreakerThreshold ?? 10

  _onHandoff steps to implement (steps 1-4):
  ```js
  async _onHandoff(executionId, sourceNodeId, { targetId, contextUpdate }) {
    const execution = this._executions.get(executionId);
    if (!execution || execution.status !== 'running') return;

    // STEP 1: Edge counter + circuit breaker check (advisory only, FR-V3-17)
    const edgeId = this._findEdgeId(execution.workflowDef, sourceNodeId, targetId);
    const count = (execution.edgeCounters.get(edgeId) || 0) + 1;
    execution.edgeCounters.set(edgeId, count);
    const threshold = this._getThreshold(execution.workflowDef, edgeId);
    if (this._circuitBreaker.check(edgeId, count, threshold)) {
      this._wsBroadcast(executionId, { type: 'circuit_breaker', edgeId, counter: count, threshold });
      // WORKFLOW CONTINUES — never stops on circuit breaker (FR-V3-17 confirmed)
    }

    // STEP 2: Shallow context merge (OpenAI Swarm context_variables pattern — DEC-V3-05)
    Object.assign(execution.workflowContext, contextUpdate);

    // STEP 3: Emit handoff_started WS event
    this._wsBroadcast(executionId, { type: 'handoff_started',
      sourceNodeId, targetNodeId: targetId, edgeId, counter: count });

    // STEP 4: Spawn or reuse target PTY
    await this._ensureAgentPty(executionId, targetId);
  }
  ```

  This task does NOT yet update agent statuses or write context to target PTY — that is #62.2.

Acceptance criteria:
  - [ ] _findEdgeId() returns correct edge ID from workflow definition
  - [ ] Edge counters increment correctly on each handoff
  - [ ] Circuit breaker emits WS event at threshold, workflow NOT stopped
  - [ ] workflowContext updated via Object.assign (shallow merge)
  - [ ] handoff_started WS event emitted before target spawn
  - [ ] 110 existing tests still pass

---

---
Task: #62.2
Title: SwarmEngine.js — _onHandoff: Context Injection + Agent Status Updates
Suggested Model: claude-opus-4-6
Agent: backend-dev
Phase: V3 Phase 4 — Live Execution
Priority: HIGH
Difficulty: HARD
Depends on: #62.1
Status: PENDING
Context:
  Second of three subtasks for SwarmEngine handoff loop.
  Complete _onHandoff steps 5-6: inject context into target PTY + update agent statuses.

  Continue _onHandoff after the target PTY is spawned (steps 5-6):
  ```js
    // STEP 5: Build updated system prompt and inject into target agent
    const targetNode = execution.workflowDef.nodes.find(n => n.id === targetId);
    if (!targetNode) {
      console.error(`[SwarmEngine] Unknown target node: ${targetId}`);
      return;
    }
    const handoffTargets = this._getHandoffTargets(execution.workflowDef, targetId);
    const systemPrompt = this._buildSystemPrompt(targetNode, execution.workflowContext, handoffTargets);
    const targetState = execution.agentStates.get(targetId);
    await this._sessionManager.writeInput(targetState.sessionId, systemPrompt + '\n');

    // STEP 6: Update agent statuses + emit WS events
    const sourceState = execution.agentStates.get(sourceNodeId);
    if (sourceState) sourceState.status = 'done';
    targetState.status = 'running';
    targetState.handoffCount = (targetState.handoffCount || 0) + 1;
    this._wsBroadcast(executionId, { type: 'agent_status', nodeId: sourceNodeId, status: 'done' });
    this._wsBroadcast(executionId, { type: 'agent_status', nodeId: targetId, status: 'running',
      lastOutputSnippet: targetState.lastOutputSnippet });
    this._wsBroadcast(executionId, { type: 'handoff_completed', sourceNodeId, targetNodeId: targetId });
  }
  ```

  Helper: `_getHandoffTargets(workflowDef, nodeId)`:
  Return array of target node IDs from edges where source === nodeId.

Acceptance criteria:
  - [ ] System prompt with updated context injected into target agent PTY via writeInput
  - [ ] Source agent status set to 'done', target status set to 'running'
  - [ ] handoffCount incremented on target agentState
  - [ ] Three WS events emitted: agent_status (source done), agent_status (target running), handoff_completed
  - [ ] Unknown targetId logs error and returns gracefully (no crash)
  - [ ] 110 existing tests still pass

---

---
Task: #62.3
Title: SwarmEngine.js — _onDone + BudgetTracker Integration + lastOutputSnippet
Suggested Model: claude-sonnet-4-6
Agent: backend-dev
Phase: V3 Phase 4 — Live Execution
Priority: HIGH
Difficulty: MEDIUM
Depends on: #62.2
Status: PENDING
Context:
  Third of three subtasks for SwarmEngine handoff loop.
  Implement _onDone, integrate BudgetTracker, and ensure lastOutputSnippet is correctly updated.

  _onDone(executionId, nodeId):
  ```js
  _onDone(executionId, nodeId) {
    // Soft notify only — NEVER stop execution on __DONE__ (user decision, FR-V3-11)
    const execution = this._executions.get(executionId);
    if (!execution) return;
    const state = execution.agentStates.get(nodeId);
    if (state) state.status = 'done';
    this._wsBroadcast(executionId, { type: 'execution_status', status: 'agent_done', nodeId });
    this._wsBroadcast(executionId, { type: 'agent_status', nodeId, status: 'done' });
  }
  ```

  BudgetTracker integration:
  - Pass circuitBreaker and budgetTracker instances into SwarmEngine constructor:
    `constructor(sessionManager, workflowStore, circuitBreaker, budgetTracker)`
  - In the swarm listener tap callback (in #46.2's tapFn), after updating lastOutputSnippet:
    ```js
    if (this._budgetTracker) {
      this._budgetTracker.track(state.sessionId, chunk);
      const limit = execution.workflowDef.settings?.budgetTokens || 0;
      if (limit > 0) {
        const { exceeded, estimatedUsed } = this._budgetTracker.checkBudget(executionId, limit);
        if (exceeded) {
          this._wsBroadcast(executionId, { type: 'budget_update', estimatedTokensUsed: estimatedUsed, limitTokens: limit });
        }
      }
    }
    ```

  lastOutputSnippet update (confirm from #46.2 — verify in tests):
  - The tap function appends each chunk and keeps only the last 500 chars
  - `state.lastOutputSnippet = (state.lastOutputSnippet + chunk).slice(-500)`
  - BudgetTracker.track() is called on every chunk (this is where char count accumulates)

  Update server/index.js to pass circuitBreaker and budgetTracker to SwarmEngine constructor.

Acceptance criteria:
  - [ ] _onDone emits execution_status and agent_status events, workflow NOT stopped
  - [ ] BudgetTracker.track() called on every PTY chunk
  - [ ] budget_update WS event emitted when budget exceeded (advisory only, never stops)
  - [ ] lastOutputSnippet limited to last 500 chars in tap callback
  - [ ] All 110+ existing tests still pass (including new ones from #77)

---

TASK #63: useSwarm.js — WebSocket Hook for Execution Control
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #57.2, #48.2
Context:
  Create `client/src/hooks/useSwarm.js`.

  Connects to `ws://127.0.0.1:<PORT>/ws?channel=swarm&executionId=<id>`
  and dispatches incoming WS events to SwarmStore.

  ```js
  const useSwarm = (executionId) => {
    const { updateAgentState, updateEdgeCounter, updateBudget, addInboxItem, addFeedEvent, setWsConnected } = useSwarmStore();
    const wsRef = useRef(null);

    useEffect(() => {
      if (!executionId) return;
      const ws = new WebSocket(`ws://127.0.0.1:${window.location.port}/ws?channel=swarm&executionId=${executionId}`);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        switch (event.type) {
          case 'agent_status': updateAgentState(event.nodeId, { status: event.status, lastOutputSnippet: event.lastOutputSnippet }); break;
          case 'handoff_started': updateEdgeCounter(event.edgeId, event.counter); addFeedEvent(event); break;
          case 'budget_update': updateBudget(event.estimatedTokensUsed, event.limitTokens); break;
          case 'inbox_item': addInboxItem(event.item); break;
          // ... etc
        }
      };
      return () => ws.close();
    }, [executionId]);

    // Execution control
    const start = (workflowId, projectId, projectPath) => fetch(`/api/v1/swarm/${workflowId}/start`, { method: 'POST', ... });
    const stop = (workflowId) => fetch(`/api/v1/swarm/${workflowId}`, { method: 'DELETE', ... });
    const pause = (workflowId) => fetch(`/api/v1/swarm/${workflowId}/pause`, { method: 'POST', ... });

    return { start, stop, pause };
  };
  ```

Acceptance criteria:
  - [ ] WS connects with correct channel=swarm query param
  - [ ] All WS event types dispatch to correct SwarmStore actions
  - [ ] WS disconnects cleanly on component unmount
  - [ ] start/stop/pause call correct API endpoints

---

TASK #64: useHandoff.js — Edge Animation Hook
Agent: frontend-dev
Priority: LOW
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #63
Context:
  Create `client/src/hooks/useHandoff.js`.

  When a `handoff_started` WS event arrives, briefly animate the corresponding edge
  by adding its ID to a `animatingEdges` Set in SwarmStore, then removing it after 800ms.

  ```js
  const useHandoff = () => {
    const addFeedEvent = useSwarmStore(s => s.addFeedEvent);
    // Subscribe to handoff_started events from useSwarm
    // When received: add edgeId to animatingEdges Set for 800ms
    // HandoffEdge.jsx subscribes to animatingEdges to trigger CSS animation
  };
  ```

  Add `animatingEdges: new Set()` to SwarmStore and an action `setEdgeAnimating(edgeId, bool)`.

Acceptance criteria:
  - [ ] Edge CSS pulse animation triggers on handoff_started event
  - [ ] Animation stops after 800ms
  - [ ] Multiple concurrent handoffs each animate their own edge independently

---

TASK #65: AgentNode.jsx Live Updates — Blinking Border + Micro PTY Log
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #63, #53.1
Context:
  Update AgentNode.jsx (from #53) to show live execution feedback:

  ANIMATED BORDER (status='running'):
  - CSS `@keyframes agentPulse { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.7); } 70% { box-shadow: 0 0 0 10px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }`
  - Applied when agentState.status === 'running'

  MICRO PTY LOG (last 500 chars of output):
  - Small scrollable text area inside the node, ~3 lines tall
  - Shows `agentState.lastOutputSnippet`
  - Font: monospace, 9px, dark background (#0a0a0a)
  - Only visible when status is 'running' or 'done'
  - Clicking the node opens PTY Explosion (full terminal)

  DOUBLE-CLICK → PTY EXPLOSION:
  In AgentNode.jsx `onDoubleClick`:
  - Set `ptyExplosionNodeId = nodeId` in SwarmStore
  - This triggers the PTY Explosion overlay in SwarmView.jsx (#71)

Acceptance criteria:
  - [ ] Animated border (blue glow) when status='running'
  - [ ] Last 500 chars of output shown in micro-log while running/done
  - [ ] Double-click sets ptyExplosionNodeId in SwarmStore

---

TASK #66: BroadcastBar.jsx + POST Broadcast Route
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #57.1, #47.1
Context:
  Create `client/src/canvas/overlays/BroadcastBar.jsx`.

  A floating bar at the top of the canvas (when execution is active):
  - Scope selector: "All agents" / specific department / specific agent
  - Message textarea (max 2000 chars)
  - Mode toggle: "Soft" (queue) / "Hard" (interrupt)
  - Send button

  On send:
  `POST /api/v1/swarm/${executionId}/broadcast`
  Body: `{ text, scope: 'all' | deptId | agentId, mode: 'soft' | 'hard' }`

  Show "Sending to N agents..." status, then clear textarea.

  Note from research_c.md: Hard broadcast sends Ctrl+C first, which is unreliable during tool
  execution. Show a warning tooltip on the Hard mode toggle explaining this.

Acceptance criteria:
  - [ ] Scope selector shows "All agents" + list of departments + list of agents
  - [ ] Hard mode shows warning tooltip about unreliable interruption
  - [ ] Broadcast POST sends correct scope and mode
  - [ ] Bar only visible when execution is active (executionStatus === 'running')

---

TASK #67: SwarmEngine Heartbeat — Prevent Idle Sweeper
Agent: backend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #62.3
Context:
  The existing SessionManager has an idle sweeper that kills PTY sessions after 30 minutes
  of inactivity (IDLE_TIMEOUT_MINUTES env var). Long-running swarm agents would be killed.

  Add heartbeat writes in SwarmEngine._startHeartbeat():
  - Every 5 minutes: `sessionManager.writeInput(sessionId, '')` for all active agent PTYs
  - Empty string write resets the idle timer without sending any visible input
  - The heartbeat timer must be cleared in stopExecution()

  This was already sketched in #46 skeleton — verify it's fully implemented and the timer
  is properly cleared to prevent memory leaks.

Acceptance criteria:
  - [ ] Heartbeat timer fires every 5 minutes per execution
  - [ ] Empty string writes to each active PTY session
  - [ ] Timer cleared when stopExecution() is called
  - [ ] Memory test: start + stop execution 10 times — no timer leaks

---

TASK #68: server/routes/inbox.js — HITL Approve/Reject API
Agent: backend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #62.3
Context:
  Create `server/routes/inbox.js` for Human-in-the-Loop workflow management.

  ENDPOINTS:
  - `GET /api/v1/inbox` → 200 { items: InboxItem[] } — all pending items across executions
  - `GET /api/v1/inbox/:executionId` → 200 { items: InboxItem[] } — items for one execution
  - `POST /api/v1/inbox/:itemId/approve` → 200
    Body: { resumeText?: string }  — resumeText max 8192 chars (SEC-V3-05)
  - `POST /api/v1/inbox/:itemId/reject` → 200
    Body: { reason?: string }

  InboxItem structure:
  ```js
  {
    id: "uuid",
    executionId: string,
    nodeId: string,
    type: "circuit_breaker" | "user_requested" | "budget_warning",
    message: string,
    createdAt: ISO8601,
    status: "pending" | "approved" | "rejected"
  }
  ```

  InboxItems are stored in `execution.inboxItems` array (runtime memory, not persisted).

  On approve: SwarmEngine.approveInboxItem(itemId, resumeText):
  - Validate resumeText max 8192 chars (SEC-V3-05)
  - If item.type === 'circuit_breaker': unfreeze the edge (reset counter to 0)
  - Write resumeText to the relevant agent PTY (using broadcast Escape+Enter pattern from research_c.md)
  - Emit WS `{ type: 'inbox_item', item: { ...item, status: 'approved' } }`

  On reject: mark item as rejected, emit WS update.

Acceptance criteria:
  - [ ] All 4 endpoints respond correctly
  - [ ] resumeText > 8192 chars → 400 (SEC-V3-05)
  - [ ] Approve unfreezes agent and writes resumeText to PTY
  - [ ] All inbox operations go through SwarmEngine (not direct PTY access)

---

TASK #69: HitlInbox.jsx — Approval Panel
Agent: frontend-dev
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #68, #52
Context:
  Create `client/src/panels/HitlInbox.jsx` — a panel (bottom drawer in SwarmView) showing
  pending HITL approval items.

  LIST VIEW (when items pending):
  - Each item shows: agent name, type badge (circuit_breaker / user_requested), message, timestamp
  - Two buttons: ✓ Approve and ✗ Reject
  - "Approve" opens a textarea for optional resumeText before confirming

  EMPTY STATE: "No pending approvals" with a checkmark icon

  On approve:
  `POST /api/v1/inbox/:itemId/approve` with `{ resumeText }`
  Then remove item from local list (optimistic update).

  On reject:
  `POST /api/v1/inbox/:itemId/reject`
  Then remove item from local list.

  Tab badge: show count of pending items on the "Inbox" tab label (e.g. "Inbox (3)").

Acceptance criteria:
  - [ ] Pending items listed with correct type badge and message
  - [ ] Approve with optional text sends correct payload
  - [ ] Rejected items immediately removed from list
  - [ ] Badge count shown on tab label

---

TASK #70: SwarmEngine HITL — Freeze/Unfreeze Agent
Agent: backend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #68, #62.3
Context:
  Add freeze/unfreeze capability to SwarmEngine for HITL workflows.

  FREEZE AGENT (`freezeAgent(executionId, nodeId, reason)`):
  - Send `\x03` (Ctrl+C) to the agent's PTY to interrupt it
  - Set agent status to 'frozen' in agentStates
  - Create InboxItem with type and message
  - Emit WS `{ type: 'agent_status', nodeId, status: 'frozen' }`

  UNFREEZE AGENT (`unfreezeAgent(executionId, nodeId, resumeText)`):
  - If resumeText: write to PTY using broadcast pattern (Escape + Enter)
  - Set agent status back to 'running'
  - Emit WS `{ type: 'agent_status', nodeId, status: 'running' }`

  In HITL mode (`workflow.settings.mode === 'hitl'`):
  - On each handoff, instead of immediately spawning the target agent:
    - Create an InboxItem for the handoff
    - Freeze the source agent
    - Wait for human approval before spawning target

Acceptance criteria:
  - [ ] Freeze sends \x03 and updates agent status to 'frozen'
  - [ ] Unfreeze writes resumeText (if provided) and sets status to 'running'
  - [ ] HITL mode creates InboxItem before each handoff (not auto-execute)
  - [ ] Auto mode executes handoffs without inbox pause

---

---
Task: #71.1
Title: PTY Explosion — Full-Screen Overlay Component
Suggested Model: claude-sonnet-4-6
Agent: frontend-dev
Phase: V3 Phase 5 — HITL + PTY Explosion
Priority: HIGH
Difficulty: MEDIUM
Depends on: #57.2, #63
Status: PENDING
Context:
  First of two subtasks for PTY Explosion.
  Implement the full-screen overlay that renders an existing agent's PTY session.

  IMPORTANT: Uses the EXISTING `Terminal.jsx` component COMPLETELY UNCHANGED.
  PTY Explosion only needs to pass the agent's sessionId to Terminal.jsx.
  Never create a new xterm.js instance per DEC-009 / existing Terminal contract.

  In SwarmView.jsx, add the overlay (see #57.2 placeholder):
  ```jsx
  import Terminal from '../components/Terminal';

  // Inside SwarmView render:
  const ptyExplosionNodeId = useSwarmStore(s => s.ptyExplosionNodeId);
  const ptyExplosionSessionId = useMemo(() => {
    if (!ptyExplosionNodeId || !execution) return null;
    return execution.agentStates.get(ptyExplosionNodeId)?.sessionId || null;
  }, [ptyExplosionNodeId, execution]);

  {ptyExplosionSessionId && (
    <div className="pty-explosion-overlay">
      <div className="pty-explosion-header">
        <span className="pty-explosion-title">Agent: {ptyExplosionNodeId}</span>
        <button
          className="pty-explosion-close"
          onClick={() => useSwarmStore.getState().setPtyExplosionNodeId(null)}
        >
          Close
        </button>
      </div>
      <Terminal sessionId={ptyExplosionSessionId} />
    </div>
  )}
  ```

  CSS (add to SwarmView.css or global):
  ```css
  .pty-explosion-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: #000; display: flex; flex-direction: column;
  }
  .pty-explosion-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 16px; background: #111; border-bottom: 1px solid #333;
  }
  .pty-explosion-title { color: #9ca3af; font-size: 13px; font-family: monospace; }
  .pty-explosion-close {
    background: #374151; color: #fff; border: none; border-radius: 4px;
    padding: 4px 12px; cursor: pointer; font-size: 12px;
  }
  ```

  Add `ptyExplosionNodeId: null` and `setPtyExplosionNodeId: (id) => set({ ptyExplosionNodeId: id })`
  to SwarmStore if not already present from #52.

Acceptance criteria:
  - [ ] Double-clicking an AgentNode opens the overlay (via setPtyExplosionNodeId in #53.1)
  - [ ] Overlay occupies full viewport at z-index 1000
  - [ ] Terminal.jsx used UNCHANGED — only sessionId passed differs
  - [ ] Close button calls setPtyExplosionNodeId(null)
  - [ ] Agent name shown in header bar

---

---
Task: #71.2
Title: PTY Explosion — Escape Key Handler
Suggested Model: claude-haiku-4-5
Agent: frontend-dev
Phase: V3 Phase 5 — HITL + PTY Explosion
Priority: MEDIUM
Difficulty: EASY
Depends on: #71.1
Status: PENDING
Context:
  Second of two subtasks for PTY Explosion.
  Add keyboard Escape handler to close the overlay without clicking the button.

  Inside SwarmView.jsx, add a useEffect that listens for Escape keypress:
  ```js
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && useSwarmStore.getState().ptyExplosionNodeId !== null) {
        e.preventDefault();
        useSwarmStore.getState().setPtyExplosionNodeId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  ```

  Note from research_c.md: Escape inside an xterm.js terminal normally sends an ESC character
  to the PTY. This handler must check that the overlay IS open before intercepting — when no
  overlay is active, Escape must pass through to xterm.js normally. The `e.preventDefault()`
  only fires when the overlay is open.

Acceptance criteria:
  - [ ] Pressing Escape while overlay is open closes it (sets ptyExplosionNodeId to null)
  - [ ] Pressing Escape when overlay is CLOSED does not intercept — passes to xterm.js
  - [ ] Event listener removed on component unmount (no leak)

---

TASK #72: InterAgentFeed.jsx — Real-Time Handoff Log
Agent: frontend-dev
Priority: LOW
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #63
Context:
  Create `client/src/panels/InterAgentFeed.jsx`.

  Shows a scrolling log of inter-agent handoff events in real-time.
  Each entry: `[HH:MM:SS] AgentA → AgentB: "summary text from context update"`

  Data from `useSwarmStore(s => s.interAgentFeed)` — last 100 events.
  Auto-scrolls to bottom on new entry.
  Empty state: "Waiting for agent handoffs..."

  Simple implementation — no complex UI needed.

Acceptance criteria:
  - [ ] New handoff events appear in real-time
  - [ ] Auto-scrolls to bottom
  - [ ] Shows max last 100 events (older ones drop off)
  - [ ] Timestamp, source, target, and summary shown per event

---

TASK #73: useInbox.js — HITL Polling Hook
Agent: frontend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #69, #63
Context:
  Create `client/src/hooks/useInbox.js`.

  Combines WS-based real-time updates (from useSwarm) with polling fallback.
  WS events already update SwarmStore via useSwarm (#63) — this hook adds:
  1. Initial load: `GET /api/v1/inbox/:executionId` on execution start
  2. Polling fallback: every 10s if WS disconnected
  3. Approve/reject actions

  ```js
  const useInbox = (executionId) => {
    const inboxItems = useSwarmStore(s => s.inboxItems.filter(i => i.status === 'pending'));
    const wsConnected = useSwarmStore(s => s.wsConnected);

    useEffect(() => {
      loadInbox(); // initial load
      if (!wsConnected) {
        const interval = setInterval(loadInbox, 10000);  // fallback polling
        return () => clearInterval(interval);
      }
    }, [executionId, wsConnected]);

    const approve = async (itemId, resumeText) => { ... };
    const reject = async (itemId) => { ... };

    return { inboxItems, approve, reject };
  };
  ```

Acceptance criteria:
  - [ ] Initial inbox items loaded on execution start
  - [ ] Polling activates when WS disconnected
  - [ ] Approve/reject call correct API endpoints

---

TASK #74: TriggerManager.js — Webhooks + RSS Polling
Agent: backend-dev
Priority: MEDIUM
Difficulty: HARD
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #46.3, #50
Context:
  Create `server/services/TriggerManager.js`.

  TWO TRIGGER TYPES:

  WEBHOOK TRIGGERS:
  - Register a dynamic webhook path: `POST /api/v1/triggers/webhooks/:path`
  - When a webhook fires, TriggerManager finds the workflow + trigger node with matching `webhookPath`
  - Calls `swarmEngine.startExecution(workflowId, projectId, projectPath)` or writes to a running
    execution's target agent PTY
  - Body size cap: 32KB (enforced in routes, SEC-V3-01)
  - Auth: trust local (no auth required — as per user decision + security postilla in PRD)

  RSS TRIGGERS:
  - On `createRssTrigger(nodeId, rssUrl, workflowId, pollIntervalMs = 300000)`:
    - Validate rssUrl with `ssrfGuard.isSafeUrl()` (SEC-V3-03) — reject private IPs
    - Set up `setInterval` to poll the RSS URL every pollIntervalMs
    - Track last seen item GUID to detect new items
    - On new item: call `swarmEngine.startExecution()` or inject into running execution
  - `removeTrigger(nodeId)`: clear the interval

  TRIGGER REGISTRY:
  ```js
  {
    webhooks: Map<path, { workflowId, targetNodeId }>,
    rssPollers: Map<nodeId, { intervalId, lastSeenGuid, config }>
  }
  ```

  Only register RSS pollers for workflows that are actually active (not all defined workflows).
  Start pollers when `swarmEngine.startExecution()` is called for workflows with trigger nodes.

Acceptance criteria:
  - [ ] Webhook with matching path calls swarmEngine or injects to running PTY
  - [ ] RSS poller fires on new item detection
  - [ ] SSRF guard blocks private IP RSS URLs (SEC-V3-03)
  - [ ] RSS intervals cleaned up on stopExecution()
  - [ ] 32KB webhook body cap enforced (SEC-V3-01)

---

TASK #75: server/routes/triggers.js — Trigger API
Agent: backend-dev
Priority: MEDIUM
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #74
Context:
  Create `server/routes/triggers.js` and mount at `/api/v1/triggers`.

  ENDPOINTS:
  - `POST /api/v1/triggers/webhooks/:path` — dynamic webhook receiver
    - `express.json({ limit: '32kb' })` (SEC-V3-01)
    - Separate rate limiter: 10 req/min per IP (SEC-V3-04)
    - Passes payload to TriggerManager
    - NOT CSRF-protected (external caller — exempt, per PRD appendix note)
    - Returns 200 { received: true } always (don't expose internal state)
  - `GET /api/v1/triggers` → 200 { triggers: [...] } — list active triggers

Acceptance criteria:
  - [ ] Webhook endpoint accepts POST from external callers (no CSRF required)
  - [ ] 32KB body limit enforced (SEC-V3-01)
  - [ ] Rate limiter: 11th request in 60s → 429 (SEC-V3-04)
  - [ ] Always returns 200 { received: true } regardless of internal state

---

TASK #76: TriggerNode.jsx — Visual Canvas Representation
Agent: frontend-dev
Priority: LOW
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #53.3
Context:
  Update TriggerNode.jsx (stub from #53) with full implementation:

  - Webhook node: shows 🔗 icon, path label, status (waiting/fired)
  - RSS node: shows 📡 icon, feed URL (truncated), last-fired timestamp
  - Both: subscribe to trigger state from SwarmStore

  When a trigger fires during execution:
  - Brief "Fired!" flash animation (green border pulse for 2 seconds)
  - Last-fired timestamp updated

  No interactive controls — triggers are configured in AgentInspector (#55).

Acceptance criteria:
  - [ ] Webhook and RSS nodes show correct icons and labels
  - [ ] "Fired!" animation on trigger activation
  - [ ] Last-fired timestamp displayed and updated

---

TASK #77: HandoffParser Unit Tests
Agent: qa-tester
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #45
Context:
  Write unit tests for HandoffParser.js in `server/tests/handoff-parser.test.js`.

  CRITICAL TEST CASES (ConPTY split scenarios from research_complete.md):

  1. Token split across 2 chunks:
     Feed 1: `"some output __HAN"`
     Feed 2: `"DOFF__:agent-b:eyJrZXkiOiJ2YWwiLCJrZXkyIjoidmFsMiJ9"`
     Expected: 1 handoff event returned after Feed 2

  2. Token split across 3 chunks:
     Feed 1: `"__HANDOFF__:agent"`
     Feed 2: `"-copywriter:eyJ"`
     Feed 3: `"rZXkiOiJ2YWwifQ=="`
     Expected: 1 handoff event returned after Feed 3

  3. ANSI-polluted chunk:
     Feed: `"\x1b[32m__HANDOFF__:agent-b:eyJrZXkiOiJ2YWwifQ==\x1b[0m"`
     Expected: 1 handoff event (ANSI stripped correctly)

  4. Oversized contextUpdate (>50 keys):
     Feed a handoff with 51-key JSON payload
     Expected: 0 events returned (rejected), no crash

  5. Malformed base64:
     Feed: `"__HANDOFF__:agent-b:!!!NOTBASE64!!!"`
     Expected: 0 events, no throw

  6. __DONE__ detection:
     Feed: `"task complete output __DONE__ end"`
     Expected: 1 done event

  7. 4KB buffer overflow:
     Feed 5KB of garbage bytes, then a valid handoff token
     Expected: 1 handoff event (buffer wraps correctly, token not lost)

  8. Multiple tokens in one chunk:
     Feed a chunk with 2 __HANDOFF__ tokens
     Expected: 2 handoff events

Acceptance criteria:
  - [ ] All 8 test cases pass
  - [ ] Tests run with existing test runner (Jest/Mocha pattern from existing tests)
  - [ ] No test uses external network or filesystem

---

TASK #78: SwarmEngine Integration Tests
Agent: qa-tester
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: PENDING
Dependencies: #62.3, #77
Context:
  Write integration tests for SwarmEngine in `server/tests/swarm-engine.test.js`.

  Mock SessionManager for these tests (do NOT spawn real PTY processes).

  TEST CASES:
  1. Execution lifecycle: startExecution → verify agentStates Map populated → stopExecution → verify Map cleared
  2. Handoff processing: simulate PTY output containing __HANDOFF__ token → verify workflowContext merged → verify target agent spawned
  3. Circuit breaker: simulate 10 handoffs on same edge → verify WS event emitted → verify execution NOT stopped
  4. Budget tracking: simulate large output chunks → verify budget_update WS event emitted at threshold
  5. Heartbeat: fake timer → verify writeInput called with '' every 5 minutes
  6. HITL mode: simulate handoff in hitl mode → verify InboxItem created, target NOT auto-spawned
  7. DEC-009 preservation: verify swarmListeners tap does not modify or remove existing onData handler

Acceptance criteria:
  - [ ] All 7 test cases pass
  - [ ] SessionManager fully mocked (no real PTY processes)
  - [ ] Existing 110 tests still pass after adding new tests
  - [ ] All integration tests run in under 10 seconds

---

TASK #79: V3 Pre-Release Security Audit
Agent: security
Priority: HIGH
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #50, #74, #75
Context:
  Full security audit of all V3 code. Focus on SEC-V3-01 through SEC-V3-07 plus any new attack
  surface introduced by the swarm architecture.

  MANDATORY CHECKS:
  - SEC-V3-01: 32KB webhook body cap enforced in triggers route
  - SEC-V3-02: WorkflowDefinition schema validation complete and tested
  - SEC-V3-03: SSRF guard blocks all private IP ranges for RSS URLs
  - SEC-V3-04: Webhook rate limiter at 10 req/min (separate from main 200/min)
  - SEC-V3-05: HITL resumeText capped at 8KB
  - SEC-V3-06: Workflow name/description whitelist enforced server-side
  - SEC-V3-07: HandoffParser 4KB cap + contextUpdate schema validation

  ADDITIONAL CHECKS:
  - No `shell: true` in any new spawn calls (SEC-02 project-wide)
  - No `fs.writeFile` direct calls — all writes through write-file-atomic
  - All path writes validated with `path.resolve()` + prefix assert
  - Scaffold endpoint does NOT log raw prompt or raw Claude output (SEC-08 equivalent)
  - WebSocket swarm channel validates executionId before accepting connection
  - WorkflowDefinition IDs are server-generated UUIDs (client cannot supply arbitrary IDs as primary key)

  Run `npm audit` — must show 0 new vulnerabilities.

Acceptance criteria:
  - [ ] All 7 SEC-V3-* requirements verified in code + tests
  - [ ] No shell:true in any new spawn
  - [ ] npm audit 0 vulnerabilities
  - [ ] Security report written to docs/security-v3-audit.md

---

TASK #80: V3 End-to-End Test
Agent: qa-tester
Priority: HIGH
Difficulty: HARD
Suggested Model: claude-opus-4-6
Status: PENDING
Dependencies: #71.2, #73, #76, #77, #78
Context:
  Full E2E test of the V3 Swarm Orchestrator using Puppeteer MCP.

  TEST FLOW:
  1. Start server (`npm start`)
  2. Navigate to http://127.0.0.1:3000
  3. Click "Swarm" in sidebar → SwarmView loads
  4. Type workflow description in PromptToFlowBar → click Generate
  5. Verify nodes appear on canvas with staggered animation
  6. Click an agent node → AgentInspector appears with correct fields
  7. Edit system prompt → verify change reflected in node
  8. Click ▶ Start → verify execution starts (status badge changes to "Running")
  9. Verify agent nodes show status color change
  10. Simulate handoff: watch for HandoffEdge badge `[x1]` to appear
  11. Open PTY Explosion: double-click agent node → full-screen terminal opens
  12. Close PTY Explosion: press Escape
  13. Open HITL Inbox → verify inbox panel visible
  14. Stop execution: click ⏹ Stop → verify all agents show idle status
  15. Verify 110 existing tests still pass: `npm test`

  Also verify V2 backward compatibility:
  - Terminal view still works
  - Job mode still works
  - Agent/Skill editors still work

Acceptance criteria:
  - [ ] All 15 E2E steps pass
  - [ ] V2 backward compatibility verified (all 3 existing modes work)
  - [ ] 110 existing tests pass

---

TASK #81: Build Verification + npm audit
Agent: devops
Priority: HIGH
Difficulty: EASY
Suggested Model: claude-haiku-4-5
Status: PENDING
Dependencies: #80
Context:
  Final build and security verification before V3 release tag.

  1. `npm run build` — must complete without errors
  2. Module count: expect 300+ modules (was 299 in V2; @xyflow/react adds ~50-100 modules)
  3. `npm audit` — must show 0 vulnerabilities
  4. Bundle size check: warn if Vite bundle > 3MB (log warning, don't fail)
  5. `npm test` — 110 existing tests must pass (V3 tests are additional)

  If build fails due to @xyflow/react:
  - Check for missing peer deps
  - Check for Vite config issues (may need to add @xyflow/react to optimizeDeps.include)

  Git tag: `git tag v3.0.0` after all checks pass.

Acceptance criteria:
  - [ ] `npm run build` completes without errors
  - [ ] `npm audit` shows 0 vulnerabilities
  - [ ] `npm test` passes (all 110+ tests)
  - [ ] `git tag v3.0.0` created

---

TASK #82: V3 Documentation Update
Agent: documenter
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: claude-sonnet-4-6
Status: PENDING
Dependencies: #81
Context:
  Update all project documentation to reflect V3 features.

  README.md updates:
  - Add V3 feature overview (Swarm Orchestrator, canvas, handoffs, HITL)
  - Update "What it does" section
  - Add "Swarm Workflow" quick start guide
  - Keep all V2 sections intact

  Create docs/ARCHITECTURE.md (new or update existing):
  - ASCII diagram of V3 system: canvas → SwarmEngine → SessionManager → PTY agents
  - WS event flow diagram
  - WorkflowDefinition schema diagram
  - Note all DEC-V3-* decisions

  Create docs/API.md (new):
  - All /api/v1/workflows endpoints (from #44)
  - All /api/v1/swarm endpoints (from #47)
  - All /api/v1/inbox endpoints (from #68)
  - All /api/v1/triggers endpoints (from #75)
  - WS events (channel=swarm)

  Update docs/memory/PROJECT.md:
  - Add V3 stack additions (@xyflow/react v12, Zustand v4)
  - Update version to 3.0
  - Add V3 constraints (DEC-V3-*)

Acceptance criteria:
  - [ ] README.md has V3 Swarm section
  - [ ] docs/ARCHITECTURE.md has V3 system diagram
  - [ ] docs/API.md documents all new V3 endpoints
  - [ ] docs/memory/PROJECT.md updated with V3 stack

---

## V3 Task Status Summary (Updated 2026-03-27 — Model Assignments + Subtask Split)

| # | Task | Agent | Priority | Model | Status |
|---|------|-------|----------|-------|--------|
| 43 | WorkflowStore.js | backend-dev | HIGH | claude-sonnet-4-6 | COMPLETED |
| 44 | workflows.js CRUD routes | backend-dev | HIGH | claude-sonnet-4-6 | COMPLETED |
| 45 | HandoffParser.js | backend-dev | HIGH | claude-opus-4-6 | COMPLETED |
| **46.1** | SwarmEngine — SessionManager patch + class skeleton | backend-dev | HIGH | claude-opus-4-6 | PENDING |
| **46.2** | SwarmEngine — startExecution + _spawnAgentPty + tap | backend-dev | HIGH | claude-opus-4-6 | PENDING |
| **46.3** | SwarmEngine — _buildSystemPrompt + _startHeartbeat | backend-dev | HIGH | claude-opus-4-6 | PENDING |
| **47.1** | swarm.js — execution control endpoints (7 routes) | backend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| **47.2** | swarm.js — scaffold endpoint stub (501) | backend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| **48.1** | swarmHandler.js — channel routing + connection mgmt | backend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| **48.2** | swarmHandler.js — broadcast() + WS event wiring | backend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| 49 | CircuitBreaker.js + BudgetTracker.js | backend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 50 | V3 Security Layer (SEC-V3-01 to SEC-V3-07) | security | HIGH | claude-sonnet-4-6 | PENDING |
| 51 | Client deps: @xyflow/react + zustand install | devops | HIGH | claude-haiku-4-5 | PENDING |
| 52 | SwarmContext.jsx — Zustand ExecutionStore | frontend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| **53.1** | AgentNode.jsx — agent canvas node | frontend-dev | HIGH | claude-opus-4-6 | PENDING |
| **53.2** | DepartmentNode.jsx — group container node | frontend-dev | HIGH | claude-opus-4-6 | PENDING |
| **53.3** | TriggerNode.jsx — webhook/RSS node stub | frontend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 54 | HandoffEdge.jsx — animated edge + counter badge | frontend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 55 | AgentInspector.jsx — node config panel | frontend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 56 | BreadcrumbBar.jsx — drill-down nav | frontend-dev | MEDIUM | claude-haiku-4-5 | PENDING |
| **57.1** | SwarmCanvas.jsx — React Flow canvas + drill-down | frontend-dev | HIGH | claude-opus-4-6 | PENDING |
| **57.2** | SwarmView.jsx — layout shell + toolbar | frontend-dev | HIGH | claude-opus-4-6 | PENDING |
| 58 | App.jsx + Sidebar — swarm nav + ReactFlowProvider | frontend-dev | HIGH | claude-haiku-4-5 | PENDING |
| 59 | scaffold endpoint complete (replaces 47.2 stub) | backend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 60 | PromptToFlowBar.jsx + staggered animation | frontend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 61 | useWorkflow.js — workflow CRUD hook | frontend-dev | MEDIUM | claude-haiku-4-5 | PENDING |
| **62.1** | SwarmEngine — _onHandoff: context merge + PTY spawn | backend-dev | HIGH | claude-opus-4-6 | PENDING |
| **62.2** | SwarmEngine — _onHandoff: context injection + status | backend-dev | HIGH | claude-opus-4-6 | PENDING |
| **62.3** | SwarmEngine — _onDone + BudgetTracker + snippets | backend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| 63 | useSwarm.js — WS hook for execution control | frontend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| 64 | useHandoff.js — edge animation hook | frontend-dev | LOW | claude-haiku-4-5 | PENDING |
| 65 | AgentNode live updates — pulse + micro PTY log | frontend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 66 | BroadcastBar.jsx + broadcast route | frontend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 67 | SwarmEngine heartbeat — idle sweeper prevention | backend-dev | MEDIUM | claude-haiku-4-5 | PENDING |
| 68 | inbox.js — HITL approve/reject API | backend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| 69 | HitlInbox.jsx — approval panel | frontend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| 70 | SwarmEngine HITL — freeze/unfreeze agent | backend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| **71.1** | PTY Explosion — full-screen overlay component | frontend-dev | HIGH | claude-sonnet-4-6 | PENDING |
| **71.2** | PTY Explosion — Escape key handler | frontend-dev | MEDIUM | claude-haiku-4-5 | PENDING |
| 72 | InterAgentFeed.jsx — real-time handoff log | frontend-dev | LOW | claude-haiku-4-5 | PENDING |
| 73 | useInbox.js — HITL polling hook | frontend-dev | MEDIUM | claude-haiku-4-5 | PENDING |
| 74 | TriggerManager.js — webhooks + RSS polling | backend-dev | MEDIUM | claude-sonnet-4-6 | PENDING |
| 75 | triggers.js routes — trigger API | backend-dev | MEDIUM | claude-haiku-4-5 | PENDING |
| 76 | TriggerNode.jsx — full visual implementation | frontend-dev | LOW | claude-haiku-4-5 | PENDING |
| 77 | HandoffParser unit tests | qa-tester | HIGH | claude-sonnet-4-6 | PENDING |
| 78 | SwarmEngine integration tests | qa-tester | HIGH | claude-opus-4-6 | PENDING |
| 79 | V3 Pre-Release Security Audit | security | HIGH | claude-sonnet-4-6 | PENDING |
| 80 | V3 End-to-End Test (Puppeteer) | qa-tester | HIGH | claude-opus-4-6 | PENDING |
| 81 | Build verification + v3.0.0 git tag | devops | HIGH | claude-haiku-4-5 | PENDING |
| 82 | V3 Documentation update | documenter | MEDIUM | claude-sonnet-4-6 | PENDING |

**Total V3 tasks (original #43–#82): 40**
**After subtask split: 57 tasks (40 originals → 17 split into subtasks + 3 completed = 57 granular units)**
**Breakdown: 3 COMPLETED (#43, #44, #45) + 54 PENDING subtasks and standalone tasks**

---

_Last updated: 2026-03-27 — Model assignments added + complex tasks split into subtasks. #46→3, #47→2, #48→2, #53→3, #57→2, #62→3, #71→2 subtasks. All 54 pending tasks have Suggested Model assigned._
