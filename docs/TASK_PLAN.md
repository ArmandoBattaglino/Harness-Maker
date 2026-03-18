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
- PTY: node-pty-prebuilt-multiarch (prebuilt binaries, avoids MSVC requirement)
- Process kill: tree-kill
- Config writes: write-atomic
- YAML: js-yaml 4.x
- UUIDs: uuid 9.x
- Security: helmet
- Frontend: React 18 + Vite 5.x + Tailwind CSS 3.x
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
| Phase 5 | #11 (QA) | Full test suite + 6 critical paths |
| Phase 5 | #12 (Security) | Pre-release security audit |
| Phase 5 | #13 (Documenter) | README + troubleshooting guide |

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
Status: PENDING
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
Status: PENDING
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
Status: PENDING
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

---

## Task Status Summary

| # | Task | Agent | Priority | Difficulty | Status |
|---|------|-------|----------|------------|--------|
| 1 | System Architecture Design | architect | HIGH | HARD | PENDING |
| 2 | Monorepo Scaffold and Build System | devops | HIGH | EASY | PENDING |
| 3 | Server Foundation | backend-dev | HIGH | MEDIUM | PENDING |
| 4 | Project Management API | backend-dev | HIGH | EASY | PENDING |
| 5 | SessionManager + WebSocket Terminal Handler | backend-dev | HIGH | VERY HARD | PENDING |
| 6 | React Frontend — Sidebar + TerminalView | frontend-dev | HIGH | HARD | PENDING |
| 7 | Entity Management API | backend-dev | HIGH | HARD | PENDING |
| 8 | Entity Management UI | frontend-dev | HIGH | MEDIUM | PENDING |
| 9 | Job Mode API | backend-dev | HIGH | HARD | PENDING |
| 10 | Job Mode UI | frontend-dev | HIGH | MEDIUM | PENDING |
| 11 | Projects View UI | frontend-dev | MEDIUM | EASY | PENDING |
| 12 | NFRs — Performance + Reliability + Polish | backend-dev | MEDIUM | MEDIUM | COMPLETED |
| 13 | Full QA Test Suite | qa-tester | HIGH | HARD | PENDING |
| 14 | Pre-Release Security Audit | security | HIGH | MEDIUM | PENDING |
| 15 | Documentation | documenter | MEDIUM | EASY | PENDING |

---

_Last updated: 2026-03-18 by project-manager_
