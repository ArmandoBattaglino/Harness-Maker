# CODE_MAP — Claude Code Visual Manager
_Last updated: 2026-03-27 — after Task #46.2 (SwarmEngine startExecution + _spawnAgentPty + HandoffParser tap) — mapped by code-mapper_

## Entry Points
- `server/index.js` — Express server bootstrap, binds to 127.0.0.1:PORT, WebSocket server
- `client/src/main.jsx` — React app entry point

## Module Index

### Server Modules
| File | Key Exports | Purpose |
|------|-------------|---------|
| server/index.js | (main) | Full bootstrap: binary discovery, config load, stale PID cleanup, middleware, routes, static SPA, error handler, 127.0.0.1 binding, SIGTERM/SIGINT, rate-limit stale sweep (BUG-07 fix) |
| server/services/ConfigStore.js | ConfigStore | Manages %APPDATA%\ClaudeCodeManager\config.json — projects CRUD, settings, write-file-atomic |
| server/services/ProcessRegistry.js | ProcessRegistry | Tracks active PIDs in active_pids.json, cleanupStale() on startup; isValidPid() guards register+cleanup against out-of-range values |
| server/services/BinaryDiscovery.js | discoverClaudeBinary | 4-step Claude binary lookup: env var → PATH → %LOCALAPPDATA% → fatal error |
| server/services/FileManager.js | FileManager (class), fileManager (singleton) | Atomic file I/O with path-traversal protection for all entity writes |
| server/services/index.js | (barrel) | Re-exports ConfigStore, ProcessRegistry, discoverClaudeBinary |
| server/services/RingBuffer.js | RingBuffer | Fixed 100KB circular buffer for PTY output; push() with wrap-around, toBuffer() for replay |
| server/services/SessionManager.js | sessionManager (singleton) | Sole PTY owner: createSession, attachClient, detachClient, writeInput, resizePty, killSession, idle sweeper |
| server/utils/frontmatter.js | parseFrontmatter, serializeFrontmatter, filePathToId | YAML frontmatter parse/serialize; stable hex ID from file path |
| server/middleware/security.js | securityMiddleware | helmet + CSP (script-src: self, style-src: self+unsafe-inline+fonts.googleapis.com, font-src: self+fonts.gstatic.com) |
| server/middleware/csrf.js | csrfMiddleware | 403 on POST/PUT/PATCH/DELETE without X-Requested-With: ClaudeCodeManager |
| server/middleware/pathValidation.js | validateProjectPath, validateClaudePath, ApiError | Path traversal prevention, ApiError class |
| server/routes/projects.js | projectsRouter | GET/POST/DELETE /api/v1/projects — project CRUD, scaffold .claude/ on creation |
| server/routes/sessions.js | sessionsRouter | GET/POST/DELETE /api/v1/sessions — session CRUD |
| server/routes/agents.js | agentsRouter | GET/POST/PUT/DELETE /api/v1/agents — agent .md CRUD for user + project scope |
| server/routes/skills.js | skillsRouter | GET/POST/PUT/DELETE /api/v1/skills — skill CRUD (modern SKILL.md + legacy commands/*.md) |
| server/routes/claudemd.js | claudemdRouter | GET /api/v1/claudemd, PUT /user, PUT /project — CLAUDE.md read/write |
| server/services/JobRunner.js | JobRunner (class), jobRunner (singleton) | One-shot Claude job executor: spawns claude -p, streams JSON output line-by-line to SSE clients, cancelAll on shutdown, TTL eviction of terminal jobs (BUG-06 fix) |
| server/routes/jobs.js | jobsRouter | POST/GET/DELETE /api/v1/jobs, GET /api/v1/jobs/:id (status+result), GET /api/v1/jobs/:id/stream (SSE) — job lifecycle REST + streaming |
| server/ws/terminalHandler.js | setupTerminalWebSocket | WebSocket handler: sessionId from URL query, attach/detach client, route input/resize messages |
| server/services/WorkflowStore.js | WorkflowStore (class) | CRUD + schema validation for workflow definitions; persists to %APPDATA%\ClaudeCodeManager\workflows\<id>.json via write-file-atomic; server-generated UUIDs; path-traversal guard on all reads/writes (Task #43) |
| server/services/HandoffParser.js | HandoffParser (class), default HandoffParser | Stateful rolling 4KB buffer extractor for ConPTY __HANDOFF__ and __DONE__ tokens; handles chunk-split across multiple PTY onData callbacks; ANSI escape stripping; JSON payload validation (Task #45, DEC-012) |
| server/services/SwarmEngine.js | SwarmEngine (class), default SwarmEngine | V3 swarm orchestrator — spawns agent PTY sessions, registers HandoffParser swarmListeners taps, routes handoff/done events, tracks per-node agent state and budget; in-memory only (never persisted) (Task #46, DEC-014) |

### Client Modules
| File | Key Exports | Purpose |
|------|-------------|---------|
| client/src/App.jsx | default App, MainContent (internal), AppLayout (internal) | Root React component: AppProvider wrapper, flex layout with Sidebar + MainContent view router (5 views: projects/terminal/jobs/context/deployments). Phase 9 rewrite Task #30. |
| client/src/main.jsx | (entry) | ReactDOM.createRoot bootstrap |
| client/src/store/AppContext.jsx | AppContext, useAppState | Global React context: activeProjectId, projects list |
| client/src/hooks/useApi.js | apiGet, apiPost, apiPut, apiDelete, apiDeleteWithBody | Fetch wrappers with CSRF header injection and error normalization |
| client/src/hooks/useSession.js | useSession | WebSocket hook for PTY terminal: manages WS lifecycle, reconnect logic, send+resize callbacks |
| client/src/components/Sidebar.jsx | default Sidebar, SidebarHeader, NavItem, SessionItem, SidebarFooter (internals) | Phase 9 redesign: imports NAV_ITEMS from constants.js, 5-view navigation, Active PTY Sessions list, New Local Session button, AddProjectModal trigger. Task #24 rewrite. |
| client/src/components/AddProjectModal.jsx | default AddProjectModal | Modal for adding new projects |
| client/src/views/TerminalView.jsx | default TerminalView, PtyHeader, StatusBarFooter, EmptyState (internals) | Phase 9 Live Terminal Hub: header bar (project name, path, kill button), Terminal.jsx embed, status bar footer (connection status, daemon info, placeholder tokens/latency). Task #26 rewrite. |
| client/src/views/EntitiesView.jsx | default EntitiesView | **DEAD FILE** — no longer imported by App.jsx (Phase 9). Replaced by ContextEditorView + DeploymentManagerView. QA advisory LOW finding. |
| client/src/components/AgentEditor.jsx | default AgentEditor, AgentForm (internal) | Agent list + create/edit/delete UI; calls /api/v1/agents |
| client/src/components/SkillEditor.jsx | default SkillEditor, SkillForm (internal) | Skill list + create/edit/delete UI; calls /api/v1/skills |
| client/src/components/ClaudeMdEditor.jsx | default ClaudeMdEditor, ClaudeMdPanel (internal) | Dual-panel CLAUDE.md editor (user + project); calls /api/v1/claudemd |
| client/src/hooks/useJob.js | default useJob | Custom hook: manages full job lifecycle (POST → SSE → result/cancel/reset), exposes status, streamEvents, result, error |
| client/src/components/JobPanel.jsx | default JobPanel, StreamLog, MarkdownResult, AdvancedOptions (internals) | Job Mode UI: prompt textarea, SSE stream log, react-markdown result, cancel/copy/reset actions |
| client/src/views/JobView.jsx | default JobView, JobCard, StreamLog, MarkdownOutput, PromptInput, CopyButton (internals) | Phase 9 Orchestration Center: three-pane layout (job queue left, control bar + output right), inline prompt input with advanced options, SSE stream log, Markdown result, background job polling. Task #27 rewrite. |
| client/src/views/ContextEditorView.jsx | default ContextEditorView, Header, Toast, RuleBlock (internals) | Phase 9 Context & Rules Editor: two-column layout (rule explorer left, CLAUDE.md output right), dual scope (project/user), rule parsing/editing, save/discard/copy, line count warning. Task #28 new file. |
| client/src/views/DeploymentManagerView.jsx | default DeploymentManagerView, AgentCard, SkillCard, AgentDetail, CreateAgentModal, ActiveProcessesTab, TabBar, FormSection, FormField, Toast (internals) | Phase 9 Deployment Manager: 3-tab layout (Profiles/Active Processes/Environment), master-detail agent editing, skill viewer, agent CRUD with modal, search filter. Task #29 new file. |
| client/src/lib/constants.js | NAV_ITEMS, STATUS_COLORS | Shared UI constants: sidebar navigation items (icon/label/view), status-to-Tailwind-class mapping for badges (Phase 9 design tokens) |
| client/src/views/ProjectsView.jsx | default ProjectsView, ConfirmDialog, CardMenu, StatusDot, ProjectCard, AddCard, ListRow (internals) | Phase 9 Project Dashboard: grid/list dual-view, search with "/" keyboard shortcut, project cards with status dots, delete confirmation modal, scaffold CTA banner. Task #25 rewrite. |

### Client Config & Styles
| File | Key Exports | Purpose |
|------|-------------|---------|
| client/tailwind.config.js | default config | Tailwind CSS config: Phase 9 design tokens — 20+ color tokens (primary #933df5, surface scale, semantic colors, code syntax), font families (Inter/Geist/JetBrains Mono), border radius scale. darkMode: 'class'. |
| client/index.html | (HTML entry) | SPA entry point: Google Fonts CDN links (Inter, JetBrains Mono, Material Symbols Outlined), dark class on html element. Last modified Task #23 (font imports added). |
| client/src/index.css | (global styles) | Base body styles (#000 bg, Inter font), utility classes (.glass-effect, .custom-scrollbar, .active-indicator, .terminal-text, .filled-icon, .terminal-line-border), .markdown-result scoped styles (headings, code, tables, blockquotes — purple theme), .md-* syntax highlighting helpers. Last modified Task #23 (Phase 9 redesign). |
| client/postcss.config.js | (PostCSS config) | PostCSS plugins: tailwindcss, autoprefixer |

## Test Infrastructure
| File | Framework | Modules Under Test | Test Count |
|------|-----------|--------------------|------------|
| server/vitest.config.js | Vitest v4.1.0 | (config) | — |
| server/tests/RingBuffer.test.js | Vitest | server/services/RingBuffer.js | 19 |
| server/tests/FileManager.test.js | Vitest | server/services/FileManager.js | 10 |
| server/tests/csrf.test.js | Vitest | server/middleware/csrf.js | 13 |
| server/tests/pathValidation.test.js | Vitest | server/middleware/pathValidation.js | 13 |
| server/tests/SessionManager.test.js | Vitest | server/services/SessionManager.js | 18 |
| server/tests/JobRunner.test.js | Vitest | server/services/JobRunner.js | 18 |
| server/tests/HandoffParser.test.js | Vitest | server/services/HandoffParser.js | 22 |

## Build Artifacts
- `server/public/` — Vite build output (served as static files by Express)

## Security + QA Artifacts
- `docs/SECURITY_AUDIT.md` — pre-release security audit (0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW)
- `docs/TEST_RESULTS.md` — test run results (110 tests, 0 failures, ~3.4s)
- `README.md` — public-facing project documentation

---

## Function Graph

### `server/services/FileManager.js` :: `FileManager.validatePath(filePath, allowedBase)`
- **Purpose:** Resolves filePath to absolute and asserts it is contained within allowedBase. Throws Error on path traversal.
- **Called by:** FileManager.readFile, FileManager.writeFile, FileManager.deleteFile, FileManager.listDirectory, FileManager.ensureDirectory
- **Calls:** path.resolve
- **Inputs:** filePath (string), allowedBase (string)
- **Output:** resolved absolute path (string)
- **Side effects:** none (throws on violation)
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/services/FileManager.js` :: `FileManager.readFile(filePath, allowedBase)`
- **Purpose:** Read file as UTF-8 text after path validation.
- **Called by:** routes/agents.js::readAgentsFromDir, routes/skills.js::readModernSkills, routes/skills.js::readLegacySkills
- **Calls:** FileManager.validatePath, fs.promises.readFile
- **Inputs:** filePath (string), allowedBase (string)
- **Output:** Promise\<string\>
- **Side effects:** filesystem read
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/services/FileManager.js` :: `FileManager.writeFile(filePath, content, allowedBase)`
- **Purpose:** Atomically write UTF-8 content to file (write-file-atomic), creating parent dirs if needed.
- **Called by:** routes/agents.js (POST, PUT handlers), routes/skills.js (POST, PUT handlers), routes/claudemd.js (PUT /user, PUT /project)
- **Calls:** FileManager.validatePath, fs.promises.mkdir, writeFileAtomic
- **Inputs:** filePath (string), content (string), allowedBase (string)
- **Output:** Promise\<void\>
- **Side effects:** atomic filesystem write
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/services/FileManager.js` :: `FileManager.deleteFile(filePath, allowedBase)`
- **Purpose:** Delete a single file after path validation.
- **Called by:** routes/agents.js (DELETE handler), routes/skills.js (DELETE legacy handler)
- **Calls:** FileManager.validatePath, fs.promises.unlink
- **Inputs:** filePath (string), allowedBase (string)
- **Output:** Promise\<void\>
- **Side effects:** filesystem deletion
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/services/FileManager.js` :: `FileManager.listDirectory(dirPath, allowedBase)`
- **Purpose:** List directory entries. Returns [] if directory does not exist (ENOENT suppressed).
- **Called by:** routes/agents.js::readAgentsFromDir, routes/skills.js::readModernSkills, routes/skills.js::readLegacySkills
- **Calls:** FileManager.validatePath, fs.promises.readdir
- **Inputs:** dirPath (string), allowedBase (string)
- **Output:** Promise\<string[]\>
- **Side effects:** filesystem read
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/services/FileManager.js` :: `FileManager.ensureDirectory(dirPath, allowedBase)`
- **Purpose:** Create directory and missing parents (mkdir -p).
- **Called by:** routes/skills.js (POST handler — creates skill dir before writing SKILL.md)
- **Calls:** FileManager.validatePath, fs.promises.mkdir
- **Inputs:** dirPath (string), allowedBase (string)
- **Output:** Promise\<void\>
- **Side effects:** filesystem write (directory creation)
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

---

### `server/utils/frontmatter.js` :: `parseFrontmatter(content)`
- **Purpose:** Parse YAML frontmatter block from markdown string. Returns {frontmatter, body}. Handles \r\n; treats malformed YAML as empty frontmatter.
- **Called by:** routes/agents.js::readAgentsFromDir, routes/skills.js::readModernSkills, routes/skills.js::readLegacySkills
- **Calls:** yaml.load (js-yaml)
- **Inputs:** content (string)
- **Output:** `{ frontmatter: object, body: string }`
- **Side effects:** none
- **Complexity note (BUG-14 fix):** yaml.load() can return a scalar (string, number, null) for trivial YAML blocks that don't contain key-value pairs. Added type guard: `parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)` — only accepts plain objects; falls back to `{}` for any other type. Without this guard, downstream code calling `frontmatter.name` etc. would throw if YAML parsed to a string.
- **Last modified:** 2026-03-18 in Debug Session (BUG-14) by debugger

### `server/utils/frontmatter.js` :: `serializeFrontmatter(frontmatter, body)`
- **Purpose:** Serialize frontmatter object + body back to `---\n<yaml>\n---\n<body>` string.
- **Called by:** routes/agents.js (POST, PUT handlers), routes/skills.js (POST, PUT handlers)
- **Calls:** yaml.dump (js-yaml)
- **Inputs:** frontmatter (object), body (string)
- **Output:** string
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/utils/frontmatter.js` :: `filePathToId(filePath)`
- **Purpose:** Derive stable 16-char hex ID from absolute file path (SHA-256 first 16 chars). Same path always yields same ID.
- **Called by:** routes/agents.js (list + write responses), routes/skills.js (list + write responses)
- **Calls:** crypto.createHash
- **Inputs:** filePath (string — absolute)
- **Output:** string (16 hex chars)
- **Side effects:** none
- **Complexity note:** ID is path-derived, not stored. PUT/DELETE routes require filePath in body because the ID alone cannot be reverse-hashed.
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

---

### `server/routes/agents.js` :: `findProject(projectId)` (internal)
- **Purpose:** Look up a project by ID from ConfigStore. Returns project object or null.
- **Called by:** agents GET handler, agents POST handler
- **Calls:** ConfigStore.getProjects
- **Inputs:** projectId (string | undefined)
- **Output:** project object | null
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/agents.js` :: `readAgentsFromDir(dir, allowedBase, scope)`
- **Purpose:** Scan directory for .md files, parse each as agent record with frontmatter + body. Returns [] on unreadable dir.
- **Called by:** GET /api/v1/agents handler (called twice: user scope + project scope in parallel)
- **Calls:** fileManager.listDirectory, fileManager.readFile, parseFrontmatter, filePathToId
- **Inputs:** dir (string), allowedBase (string), scope ('user'|'project')
- **Output:** Promise\<object[]\> — each: {id, name, scope, filePath, frontmatter, body}
- **Side effects:** filesystem reads
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/agents.js` :: `resolveAllowedBase(filePath)` (internal)
- **Purpose:** Map a given filePath to its allowed base: USER_AGENTS_DIR or a registered project's path. Throws ApiError(400) if outside all allowed dirs.
- **Called by:** PUT /api/v1/agents/:id handler, DELETE /api/v1/agents/:id handler
- **Calls:** path.resolve, ConfigStore.getProjects
- **Inputs:** filePath (string)
- **Output:** string (allowed base path)
- **Side effects:** throws ApiError(400) on traversal
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/agents.js` :: `GET /api/v1/agents`
- **Purpose:** List agents from user scope (~/.claude/agents) and optionally project scope. Runs both in parallel.
- **Called by:** client/src/components/AgentEditor.jsx::loadAgents
- **Calls:** findProject, readAgentsFromDir (x2 via Promise.all)
- **Inputs:** query.projectId (optional)
- **Output:** JSON `{ agents: [...] }` — combined user + project agents
- **Side effects:** filesystem reads
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/agents.js` :: `POST /api/v1/agents`
- **Purpose:** Create new agent .md file. Validates name regex ^[a-z][a-z0-9-]*$, scope, types. Merges name into frontmatter. Returns 409 if file already exists.
- **Called by:** client/src/components/AgentEditor.jsx::AgentForm::handleSubmit (create path)
- **Calls:** findProject, fileManager.writeFile, serializeFrontmatter, filePathToId
- **Inputs:** body `{ name, scope, projectId?, frontmatter, body }`
- **Output:** 201 JSON `{ agent }` | 400/409 error
- **Side effects:** creates .md file on disk
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/agents.js` :: `PUT /api/v1/agents/:id`
- **Purpose:** Update existing agent .md file atomically. Requires filePath in body (ID is not reverse-hashable).
- **Called by:** client/src/components/AgentEditor.jsx::AgentForm::handleSubmit (edit path)
- **Calls:** resolveAllowedBase, fileManager.writeFile, serializeFrontmatter, filePathToId
- **Inputs:** body `{ frontmatter, body, filePath }`
- **Output:** 200 JSON `{ agent }` | 400/404 error
- **Side effects:** overwrites .md file atomically
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/agents.js` :: `DELETE /api/v1/agents/:id`
- **Purpose:** Delete agent .md file. Accepts filePath from body or query string.
- **Called by:** client/src/components/AgentEditor.jsx::handleDeleteConfirm
- **Calls:** resolveAllowedBase, fileManager.deleteFile
- **Inputs:** body or query `{ filePath }`
- **Output:** 204 | 400/404 error
- **Side effects:** deletes file from disk
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

---

### `server/routes/skills.js` :: `readModernSkills(claudeDir, allowedBase, scope)`
- **Purpose:** Scan <claudeDir>/skills/ for subdirectories containing SKILL.md. Returns skill records with format:'modern'.
- **Called by:** GET /api/v1/skills handler (called for user + project scope in parallel)
- **Calls:** fileManager.listDirectory, fs.promises.stat, fileManager.readFile, parseFrontmatter, filePathToId
- **Inputs:** claudeDir (string), allowedBase (string), scope ('user'|'project')
- **Output:** Promise\<object[]\> — each: {id, name, scope, format:'modern', filePath, dirPath, frontmatter, body}
- **Side effects:** filesystem reads
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/skills.js` :: `readLegacySkills(claudeDir, allowedBase, scope)`
- **Purpose:** Scan <claudeDir>/commands/ for *.md files. Returns skill records with format:'legacy'.
- **Called by:** GET /api/v1/skills handler (called for user + project scope in parallel)
- **Calls:** fileManager.listDirectory, fileManager.readFile, parseFrontmatter, filePathToId
- **Inputs:** claudeDir (string), allowedBase (string), scope ('user'|'project')
- **Output:** Promise\<object[]\> — each: {id, name, scope, format:'legacy', filePath, dirPath:null, frontmatter, body}
- **Side effects:** filesystem reads
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/skills.js` :: `GET /api/v1/skills`
- **Purpose:** List skills from 4 sources in parallel: user modern, user legacy, project modern, project legacy.
- **Called by:** client/src/components/SkillEditor.jsx::loadSkills
- **Calls:** findProject, readModernSkills (x2), readLegacySkills (x2) via Promise.all
- **Inputs:** query.projectId (optional)
- **Output:** JSON `{ skills: [...] }`
- **Side effects:** filesystem reads
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/skills.js` :: `POST /api/v1/skills`
- **Purpose:** Create new skill directory + SKILL.md. Validates name ^[a-z0-9][a-z0-9-]*$ (max 64 chars). Returns 409 if exists.
- **Called by:** client/src/components/SkillEditor.jsx::SkillForm::handleSubmit (create path)
- **Calls:** findProject, fileManager.ensureDirectory, fileManager.writeFile, serializeFrontmatter, filePathToId
- **Inputs:** body `{ name, scope, projectId?, frontmatter, body }`
- **Output:** 201 JSON `{ skill }` | 400/409 error
- **Side effects:** creates skill directory + SKILL.md on disk
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/skills.js` :: `PUT /api/v1/skills/:id`
- **Purpose:** Update SKILL.md or legacy .md file atomically.
- **Called by:** client/src/components/SkillEditor.jsx::SkillForm::handleSubmit (edit path)
- **Calls:** resolveAllowedBase, fileManager.writeFile, serializeFrontmatter, filePathToId
- **Inputs:** body `{ frontmatter, body, filePath }`
- **Output:** 200 JSON `{ skill }` | 400/404 error
- **Side effects:** overwrites file atomically
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/skills.js` :: `DELETE /api/v1/skills/:id`
- **Purpose:** Delete entire skill directory (modern) or single .md file (legacy). Modern: fs.promises.rm recursive. Legacy: fileManager.deleteFile.
- **Called by:** client/src/components/SkillEditor.jsx::handleDeleteConfirm
- **Calls:** resolveAllowedBase, fs.promises.rm (modern) or fileManager.deleteFile (legacy)
- **Inputs:** body or query `{ dirPath }` (modern) or `{ filePath }` (legacy)
- **Output:** 204 | 400/404 error
- **Side effects:** deletes directory tree (modern) or file (legacy) from disk
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/skills.js` :: `resolveAllowedBase(targetPath)` (internal)
- **Purpose:** Map targetPath to its allowed base (USER_CLAUDE_DIR or registered project path). Throws ApiError(400) if outside all allowed locations.
- **Called by:** PUT /api/v1/skills/:id handler, DELETE /api/v1/skills/:id handler
- **Calls:** path.resolve, ConfigStore.getProjects
- **Inputs:** targetPath (string)
- **Output:** string (allowed base)
- **Side effects:** throws ApiError(400) on traversal
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

---

### `server/routes/claudemd.js` :: `safeRead(filePath)` (internal)
- **Purpose:** Read file as UTF-8; returns empty string on ENOENT instead of throwing.
- **Called by:** GET /api/v1/claudemd handler
- **Calls:** fs.promises.readFile
- **Inputs:** filePath (string)
- **Output:** Promise\<string\>
- **Side effects:** filesystem read
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/claudemd.js` :: `GET /api/v1/claudemd`
- **Purpose:** Return user and project CLAUDE.md content (both in one response). Uses safeRead — empty string if file absent.
- **Called by:** client/src/components/ClaudeMdEditor.jsx::loadContent
- **Calls:** findProject, safeRead (x2 via Promise.all)
- **Inputs:** query.projectId (optional)
- **Output:** JSON `{ userScope: {path, content}, projectScope: {path, content} }`
- **Side effects:** filesystem reads
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/claudemd.js` :: `PUT /api/v1/claudemd/user`
- **Purpose:** Write ~/.claude/CLAUDE.md atomically. Content validated as string.
- **Called by:** client/src/components/ClaudeMdEditor.jsx::handleSaveUser
- **Calls:** fileManager.writeFile
- **Inputs:** body `{ content: string }`
- **Output:** JSON `{ path, lineCount }` | 400 error
- **Side effects:** atomic file write to ~/.claude/CLAUDE.md
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

### `server/routes/claudemd.js` :: `PUT /api/v1/claudemd/project`
- **Purpose:** Write <project>/.claude/CLAUDE.md atomically. Requires projectId.
- **Called by:** client/src/components/ClaudeMdEditor.jsx::handleSaveProject
- **Calls:** findProject, fileManager.writeFile
- **Inputs:** body `{ content: string, projectId: string }`
- **Output:** JSON `{ path, lineCount }` | 400/404 error
- **Side effects:** atomic file write to project's .claude/CLAUDE.md
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

---

### `server/index.js` :: `openBrowser(url)`
- **Purpose:** Open the app URL in the system default browser after server starts. Skipped when NO_OPEN=1 (tests, CI, headless). Platform-branched: Windows uses `cmd.exe /c start "" <url>`, macOS uses `open`, Linux uses `xdg-open`. Always spawns with `{ shell: false }` — URL is passed as an array element, never interpolated into a shell string (SEC-02).
- **Called by:** startup() (inline, after server.listen resolves)
- **Calls:** spawn (child_process) with shell:false, detached:true, stdio:ignore; child.unref()
- **Inputs:** url (string — the server URL, e.g. http://127.0.0.1:3000)
- **Output:** void
- **Side effects:** spawns detached child process (cmd.exe / open / xdg-open); child is unref'd so it does not block process exit
- **Complexity note:** Windows: `start` is a cmd.exe built-in — must be invoked via `cmd.exe /c start "" <url>`. The empty string is a required title argument for `start`. Without it `start` misparses the URL as the window title.
- **Last modified:** 2026-03-18 in Task #16 by security (replaced exec() with spawn shell:false — MEDIUM-01 fix)

---

### `server/index.js` :: `startup()`
- **Purpose:** Full server bootstrap — binary discovery, config load, stale PID cleanup, Express setup, middleware, route mounting, WebSocket, HTTP bind.
- **Called by:** entry point (module level)
- **Calls:** discoverClaudeBinary, ConfigStore.load, ProcessRegistry.cleanupStale, securityMiddleware, csrfMiddleware, projectsRouter, sessionsRouter, agentsRouter, skillsRouter, claudemdRouter, jobsRouter, setupTerminalWebSocket, openBrowser
- **Inputs:** none (reads env: PORT, IDLE_TIMEOUT_MINUTES, CLAUDE_BINARY_PATH)
- **Output:** Promise\<void\>
- **Side effects:** HTTP server listening on 127.0.0.1:PORT, WebSocket server, SIGTERM/SIGINT handlers; sets jobRunner.claudeBin after binary discovery; calls openBrowser(url) unless NO_OPEN=1
- **Last modified:** 2026-03-18 in Task #16 by security (openBrowser refactored exec→spawn shell:false)

---

### `client/src/hooks/useApi.js` :: `apiGet(path)`
- **Purpose:** GET fetch wrapper, parses response JSON or throws normalized error.
- **Called by:** AgentEditor::loadAgents, SkillEditor::loadSkills, ClaudeMdEditor::loadContent
- **Calls:** fetch, handleResponse
- **Inputs:** path (string)
- **Output:** Promise\<any\> (parsed JSON)
- **Side effects:** HTTP request
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/hooks/useApi.js` :: `apiPost(path, body)`
- **Purpose:** POST fetch wrapper with CSRF header + JSON body.
- **Called by:** AgentEditor::AgentForm::handleSubmit, SkillEditor::SkillForm::handleSubmit
- **Calls:** fetch, handleResponse
- **Inputs:** path (string), body (any — serialized as JSON)
- **Output:** Promise\<any\>
- **Side effects:** HTTP request (mutating)
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/hooks/useApi.js` :: `apiPut(path, body)` (NEW in Task #8)
- **Purpose:** PUT fetch wrapper with CSRF header + JSON body.
- **Called by:** AgentEditor::AgentForm::handleSubmit (edit), SkillEditor::SkillForm::handleSubmit (edit), ClaudeMdEditor::handleSaveUser, ClaudeMdEditor::handleSaveProject
- **Calls:** fetch, handleResponse
- **Inputs:** path (string), body (any)
- **Output:** Promise\<any\>
- **Side effects:** HTTP request (mutating)
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/hooks/useApi.js` :: `apiDelete(path)`
- **Purpose:** DELETE fetch wrapper with CSRF header, no body.
- **Called by:** (not used by entity editors — they use apiDeleteWithBody instead)
- **Calls:** fetch, handleResponse
- **Inputs:** path (string)
- **Output:** Promise\<any\>
- **Side effects:** HTTP request (mutating)
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/hooks/useApi.js` :: `apiDeleteWithBody(path, body)` (NEW in Task #8)
- **Purpose:** DELETE fetch wrapper that sends JSON body (needed because agents/skills DELETE requires filePath/dirPath in body for security).
- **Called by:** AgentEditor::handleDeleteConfirm, SkillEditor::handleDeleteConfirm
- **Calls:** fetch, handleResponse
- **Inputs:** path (string), body (any)
- **Output:** Promise\<any\>
- **Side effects:** HTTP request (mutating)
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/hooks/useApi.js` :: `handleResponse(res)` (internal)
- **Purpose:** Normalize fetch response — returns JSON on success (null on 204), throws Error with server message on failure.
- **Called by:** apiGet, apiPost, apiPut, apiDelete, apiDeleteWithBody
- **Calls:** res.json
- **Inputs:** Response object
- **Output:** Promise\<any | null\>
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

---

### `client/src/views/EntitiesView.jsx` :: `EntitiesView()`
- **Purpose:** Tab container component for Agents / Skills / CLAUDE.md tabs. Reads activeProjectId from AppContext. Renders one editor at a time.
- **Called by:** App.jsx (route/view rendering)
- **Calls:** useAppState, AgentEditor, SkillEditor, ClaudeMdEditor
- **Inputs:** none (reads activeProjectId from context)
- **Output:** JSX — tab bar + active tab content
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

---

### `client/src/components/AgentEditor.jsx` :: `AgentEditor({ activeProjectId })`
- **Purpose:** Main agent management component. Three views: list (table), form (create/edit), confirm-delete dialog. Fetches from /api/v1/agents on mount and on activeProjectId change.
- **Called by:** EntitiesView (when activeTab === 'agents')
- **Calls:** apiGet (loadAgents), apiDeleteWithBody (handleDeleteConfirm), AgentForm
- **Inputs:** activeProjectId (string | null)
- **Output:** JSX (list/form/delete-dialog)
- **Side effects:** HTTP GET on mount, DELETE on confirm
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/components/AgentEditor.jsx` :: `AgentForm({ initial, onSave, onCancel, activeProjectId })` (internal)
- **Purpose:** Controlled form for agent create/edit. Validates name (regex) + description (required). Constructs frontmatter object from form fields. Calls POST (create) or PUT (edit).
- **Called by:** AgentEditor (form view branch)
- **Calls:** apiPost (create), apiPut (edit)
- **Inputs:** initial (form initial values including _isEdit flag), onSave/onCancel callbacks, activeProjectId
- **Output:** JSX form
- **Side effects:** HTTP POST or PUT on submit
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

---

### `client/src/components/SkillEditor.jsx` :: `SkillEditor({ activeProjectId })`
- **Purpose:** Main skill management component. List / form / confirm-delete views. Fetches from /api/v1/skills. Shows both modern and legacy skills with format badges.
- **Called by:** EntitiesView (when activeTab === 'skills')
- **Calls:** apiGet (loadSkills), apiDeleteWithBody (handleDeleteConfirm), SkillForm
- **Inputs:** activeProjectId (string | null)
- **Output:** JSX (list/form/delete-dialog)
- **Side effects:** HTTP GET on mount, DELETE on confirm
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/components/SkillEditor.jsx` :: `SkillForm({ initial, onSave, onCancel, activeProjectId })` (internal)
- **Purpose:** Controlled form for skill create/edit. Constructs SKILL.md frontmatter from form fields (argument-hint, disable-model-invocation, user-invocable, allowed-tools). Calls POST (create) or PUT (edit).
- **Called by:** SkillEditor (form view branch)
- **Calls:** apiPost (create), apiPut (edit)
- **Inputs:** initial (form values + _isEdit flag), callbacks, activeProjectId
- **Output:** JSX form
- **Side effects:** HTTP POST or PUT on submit
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

---

### `client/src/components/ClaudeMdEditor.jsx` :: `ClaudeMdEditor({ activeProjectId })`
- **Purpose:** Dual-panel CLAUDE.md editor. Loads both user and project CLAUDE.md content in one GET call. Saves each independently. Shows 300-line warning. Independent save state per panel.
- **Called by:** EntitiesView (when activeTab === 'claudemd')
- **Calls:** apiGet (loadContent), apiPut (handleSaveUser, handleSaveProject), ClaudeMdPanel
- **Inputs:** activeProjectId (string | null)
- **Output:** JSX (two ClaudeMdPanel side by side)
- **Side effects:** HTTP GET on mount, PUT on save button
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

### `client/src/components/ClaudeMdEditor.jsx` :: `ClaudeMdPanel({ label, filePath, content, onChange, onSave, saving, saveError })` (internal)
- **Purpose:** Single CLAUDE.md panel: textarea + line counter + 300-line warning + Save button. Disabled when filePath is null (no project selected for project panel).
- **Called by:** ClaudeMdEditor (rendered twice: user + project)
- **Calls:** none (pure presentational + callback)
- **Inputs:** label, filePath, content, onChange, onSave, saving, saveError
- **Output:** JSX panel
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #8 by frontend-dev

---

### `server/services/JobRunner.js` :: `JobRunner.startJob(projectId, projectPath, prompt, allowedTools, maxTurns)`
- **Purpose:** Spawn `claude -p <prompt> --output-format stream-json` as a child process. Wire readline on stdout to parse JSON lines. Forward each parsed event to all connected SSE clients. On close, finalize status and send done/cancelled terminal event. Returns summary object immediately (non-blocking).
- **Called by:** POST /api/v1/jobs handler (routes/jobs.js)
- **Calls:** spawn (child_process), child.stdin.end(), createInterface (readline), sendSse, closeAllClients, uuidv4
- **Inputs:** projectId (string), projectPath (string), prompt (string), allowedTools (string|undefined), maxTurns (number|undefined)
- **Output:** `{ jobId, projectId, createdAt }` (JobRecord summary — prompt intentionally excluded for SEC-08)
- **Side effects:** spawns child process; readline reads stdout; maintains job Map entry with clients Set; logs start/finish
- **Complexity note:** stdin.end() is called immediately after spawn — required to prevent `claude -p` from hanging waiting for input (GitHub issue #7497, DEC-005). lastResultEvent tracks the last stream-json event with a `result` field to capture final output.
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `JobRunner.cancelJob(jobId)`
- **Purpose:** Cancel a running job by sending SIGTERM to the full process tree via tree-kill. Sets status to 'cancelled' before kill so the close handler doesn't overwrite with 'error'. Sends cancelled SSE event and closes all client connections.
- **Called by:** DELETE /api/v1/jobs/:id handler (routes/jobs.js), JobRunner.cancelAll
- **Calls:** treeKill (tree-kill via createRequire), sendSse, closeAllClients
- **Inputs:** jobId (string)
- **Output:** boolean — false if job not found or not 'running'; true on success
- **Side effects:** SIGTERM to process tree; closes all SSE connections for the job
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `JobRunner.addSseClient(jobId, res)`
- **Purpose:** Attach an Express response as an SSE client for a job. Sets SSE headers. If job already finished, sends terminal event and closes immediately. If running, adds to clients Set and wires 'close' cleanup.
- **Called by:** GET /api/v1/jobs/:id/stream handler (routes/jobs.js)
- **Calls:** res.setHeader, sendSse, res.end, job.clients.add, res.on('close')
- **Inputs:** jobId (string), res (Express Response)
- **Output:** boolean — false if job not found
- **Side effects:** sets SSE response headers; keeps res open (streaming); registers disconnect cleanup
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `JobRunner.getJob(jobId)`
- **Purpose:** Return the full JobRecord (including child, clients, status) or undefined if not found.
- **Called by:** DELETE /api/v1/jobs/:id handler (to check status on failed cancel)
- **Calls:** Map.get
- **Inputs:** jobId (string)
- **Output:** JobRecord | undefined
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `JobRunner.listJobs()`
- **Purpose:** Return sanitized job summaries (jobId, projectId, status, createdAt, completedAt). Excludes prompt, result, child process, and clients (SEC-08 + security).
- **Called by:** GET /api/v1/jobs handler (routes/jobs.js)
- **Calls:** Array.from, Map.values
- **Inputs:** none
- **Output:** array of sanitized job summary objects
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `JobRunner.cancelAll()`
- **Purpose:** Cancel all currently running jobs. Used in SIGTERM/SIGINT shutdown handler in server/index.js.
- **Called by:** shutdown() in server/index.js
- **Calls:** JobRunner.cancelJob (for each running job)
- **Inputs:** none
- **Output:** void
- **Side effects:** SIGTERM to all running child processes; closes all SSE connections
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `sendSse(res, data)` (internal)
- **Purpose:** Write a single `data: <json>\n\n` SSE frame to a response.
- **Called by:** JobRunner.startJob (rl.on('line'), child.on('close')), JobRunner.cancelJob, JobRunner.addSseClient
- **Calls:** res.write, JSON.stringify
- **Inputs:** res (Express Response), data (any — serialized as JSON)
- **Output:** void
- **Side effects:** writes to HTTP response stream
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `closeAllClients(job)` (internal)
- **Purpose:** End all SSE response connections for a job and clear the clients Set.
- **Called by:** JobRunner.startJob (child.on('close')), JobRunner.cancelJob
- **Calls:** res.end (for each client)
- **Inputs:** job (JobRecord)
- **Output:** void
- **Side effects:** closes HTTP response streams; clears job.clients Set
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/services/JobRunner.js` :: `JobRunner._scheduleEviction(jobId)` (private)
- **Purpose:** Schedule TTL-based removal of a terminal-state job from the #jobs Map after 10 minutes. If SSE clients are still connected at eviction time, reschedules instead of deleting.
- **Called by:** JobRunner.startJob (child.on('close') handler, line 226)
- **Calls:** clearTimeout, setTimeout, this.#jobs.get, this.#jobs.delete, self (recursive reschedule)
- **Inputs:** jobId (string)
- **Output:** void
- **Side effects:** sets job._evictionTimer; eventually deletes job from #jobs Map
- **Last modified:** 2026-03-24 in Task #19 by backend-dev (BUG-06 fix)

### `server/index.js` :: rate-limit stale sweep (module-level setInterval)
- **Purpose:** Periodic cleanup of stale entries in _rateLimitMap. Every 60s, deletes entries where the rate limit window has expired (now > record.resetAt).
- **Called by:** (automatic — setInterval at module load, lines 93-101)
- **Calls:** _rateLimitMap.delete
- **Inputs:** none (reads _rateLimitMap, Date.now())
- **Output:** void
- **Side effects:** deletes expired IP entries from _rateLimitMap; timer.unref() prevents blocking process exit
- **Last modified:** 2026-03-24 in Task #20 by backend-dev (BUG-07 fix)

---

### `server/routes/jobs.js` :: `GET /api/v1/jobs`
- **Purpose:** List all jobs in sanitized form (no prompt, no result content). Useful for debugging/monitoring.
- **Called by:** (not currently called by client — bonus endpoint)
- **Calls:** jobRunner.listJobs
- **Inputs:** none
- **Output:** JSON `{ jobs: [...] }`
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/routes/jobs.js` :: `POST /api/v1/jobs`
- **Purpose:** Validate request, look up project, call jobRunner.startJob. Returns 201 with jobId on success. Validates allowedTools against a character-set whitelist before passing to the shell.
- **Called by:** client/src/hooks/useJob.js::startJob (via apiPost)
- **Calls:** ConfigStore.getProjects, jobRunner.startJob
- **Inputs:** body `{ projectId, prompt, allowedTools?, maxTurns? }`
- **Output:** 201 JSON `{ jobId, projectId, createdAt }` | 400/404/500 errors
- **Side effects:** spawns child process (via jobRunner.startJob)
- **Complexity note:** allowedTools validation (MEDIUM-02 fix): must be string, max 512 chars, must match `/^[a-zA-Z0-9_,\-]+$/`. Rejects any shell metacharacters or injection attempts before the value reaches `spawn()` args. Empty string is rejected by the regex (no match).
- **Last modified:** 2026-03-18 in Task #17 by security (MEDIUM-02 fix: added allowedTools character-set whitelist — was previously type-checked only)

### `server/routes/jobs.js` :: `GET /api/v1/jobs/:id/stream`
- **Purpose:** SSE endpoint. Disables Express/Node.js request and response timeouts. Delegates to jobRunner.addSseClient. Stays open until job finishes or client disconnects.
- **Called by:** client/src/hooks/useJob.js::startJob (via EventSource constructor, not apiGet)
- **Calls:** req.setTimeout(0), res.setTimeout(0), jobRunner.addSseClient
- **Inputs:** params.id (jobId)
- **Output:** SSE stream (open connection) | 404 JSON if job not found
- **Side effects:** keeps HTTP response open as streaming SSE connection
- **Complexity note:** res.end() is NOT called here if job is found — JobRunner owns the response lifetime.
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

### `server/routes/jobs.js` :: `DELETE /api/v1/jobs/:id`
- **Purpose:** Cancel a running job. Returns 204 on success, 404 if job not found, 409 if job exists but not cancellable (already done/error/cancelled).
- **Called by:** client/src/hooks/useJob.js::cancelJob (via apiDelete)
- **Calls:** jobRunner.cancelJob, jobRunner.getJob
- **Inputs:** params.id (jobId)
- **Output:** 204 | 404 | 409 errors
- **Side effects:** SIGTERM to process tree via jobRunner.cancelJob
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

---

### `client/src/hooks/useJob.js` :: `useJob(projectId)`
- **Purpose:** Custom React hook managing the full lifecycle of one job run. Exposes startJob, cancelJob, reset, and reactive state (status, streamEvents, result, error, jobId).
- **Called by:** JobPanel (client/src/components/JobPanel.jsx)
- **Calls:** apiPost (startJob), apiDelete (cancelJob), EventSource (browser native SSE), closeEventSource
- **Inputs:** projectId (string | null)
- **Output:** `{ startJob, cancelJob, reset, status, streamEvents, result, error, jobId }`
- **Side effects:** HTTP POST to start job; opens EventSource SSE connection; HTTP DELETE to cancel; clears EventSource on close
- **Complexity note:** jobIdRef is used alongside jobId state to allow cancelJob (useCallback) to access the current jobId without stale closure. status guard `if (status === 'running') return` in startJob prevents double-submission.
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/hooks/useJob.js` :: `startJob({ prompt, allowedTools, maxTurns })` (method of useJob)
- **Purpose:** POST to /api/v1/jobs, then open EventSource for the SSE stream. Parses each SSE message: 'done' finalizes result, 'cancelled' updates status, all others appended to streamEvents.
- **Called by:** JobPanel::handleRun
- **Calls:** apiPost, EventSource (browser), closeEventSource
- **Inputs:** `{ prompt, allowedTools, maxTurns }` (from JobPanel form state)
- **Output:** void (updates state via setters)
- **Side effects:** HTTP POST; opens persistent EventSource connection
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/hooks/useJob.js` :: `cancelJob()` (method of useJob)
- **Purpose:** Close the EventSource, then send DELETE /api/v1/jobs/:id. Sets status to 'cancelled'. Best-effort — swallows apiDelete errors.
- **Called by:** JobPanel::handleCancel
- **Calls:** closeEventSource, apiDelete
- **Inputs:** none (reads jobIdRef.current internally)
- **Output:** void
- **Side effects:** closes SSE connection; HTTP DELETE (best-effort)
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/hooks/useJob.js` :: `reset()` (method of useJob)
- **Purpose:** Reset all job state to idle. Closes any open EventSource. Clears jobIdRef.
- **Called by:** JobPanel::handleReset
- **Calls:** closeEventSource
- **Inputs:** none
- **Output:** void
- **Side effects:** closes SSE connection if open
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

---

### `client/src/components/JobPanel.jsx` :: `JobPanel({ projectId })`
- **Purpose:** Main Job Mode UI component. Four render modes based on status: idle/running (prompt form + StreamLog), done (MarkdownResult), cancelled (message + reset), error (error message + retry). Ctrl+Enter submits prompt.
- **Called by:** JobView (client/src/views/JobView.jsx)
- **Calls:** useJob, StreamLog, MarkdownResult, AdvancedOptions
- **Inputs:** projectId (string | null)
- **Output:** JSX (conditional render by status)
- **Side effects:** clipboard write on copy (navigator.clipboard); 2s timeout to reset copy label
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/components/JobPanel.jsx` :: `StreamLog({ events })` (internal)
- **Purpose:** Scrollable list of SSE stream events. Auto-scrolls to bottom on each new event. Renders event type label + extracted text content via renderEventContent(). Shows "Waiting for output..." placeholder when events is empty.
- **Called by:** JobPanel (idle/running render branch)
- **Calls:** renderEventContent, useEffect (scroll to bottomRef)
- **Inputs:** events (array of parsed SSE event objects)
- **Output:** JSX
- **Side effects:** DOM scroll on events change (scrollIntoView)
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/components/JobPanel.jsx` :: `renderEventContent(ev)` (internal)
- **Purpose:** Extract displayable text from a Claude stream-json event. Handles: assistant events (message.content array filtered to text blocks), result events, raw events, generic ev.content/ev.text fallback. Truncates at 200-300 chars.
- **Called by:** StreamLog
- **Calls:** none (pure function)
- **Inputs:** ev (parsed SSE event object)
- **Output:** string (truncated display text)
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/components/JobPanel.jsx` :: `MarkdownResult({ result, onCopy, copyLabel })` (internal)
- **Purpose:** Display the final job result as rendered Markdown using react-markdown + remark-gfm. Shows a Copy button that calls onCopy. Applied within `.markdown-result` CSS scope (index.css).
- **Called by:** JobPanel (done render branch)
- **Calls:** ReactMarkdown (react-markdown), remarkGfm (remark-gfm)
- **Inputs:** result (string — Markdown text), onCopy (function), copyLabel (string — button label)
- **Output:** JSX
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

### `client/src/components/JobPanel.jsx` :: `AdvancedOptions({ allowedTools, setAllowedTools, maxTurns, setMaxTurns, disabled })` (internal)
- **Purpose:** Collapsible panel for job configuration: allowedTools (text input, default 'all') and maxTurns (number input, 1-100, default 10). Toggle open/closed with arrow button.
- **Called by:** JobPanel (idle/running render branch)
- **Calls:** none (controlled inputs — pure presentational)
- **Inputs:** allowedTools, setAllowedTools, maxTurns, setMaxTurns (state from JobPanel), disabled (boolean — true while running)
- **Output:** JSX collapsible section
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

---

### `client/src/views/JobView.jsx` :: `JobView()`
- **Purpose:** View wrapper for Job Mode. Reads activeProjectId + projects from AppContext. Shows "Select a project" placeholder if no project is selected. Renders header with project name then JobPanel.
- **Called by:** App.jsx (route/view rendering — when view === 'job')
- **Calls:** useAppState, JobPanel
- **Inputs:** none (reads context)
- **Output:** JSX — header + JobPanel, or empty-state placeholder
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #10 by frontend-dev

---

### `client/src/components/AddProjectModal.jsx` :: `AddProjectModal({ onClose })`
- **Purpose:** Modal dialog for registering a new project. Collects name, absolute path, and scaffold checkbox. POSTs to /api/v1/projects and dispatches ADD_PROJECT on success. Calls onClose to dismiss.
- **Called by:** Sidebar (when "+" button clicked), ProjectsView (when "+ Register Project" clicked)
- **Calls:** apiPost, useAppDispatch
- **Inputs:** onClose (function — callback when modal should close)
- **Output:** JSX fixed-position modal overlay
- **Side effects:** HTTP POST to /api/v1/projects; dispatches ADD_PROJECT to AppContext
- **Complexity note (BUG-03 fix):** Was incorrectly POSTing to `/api/v1/projects/scaffold` (non-existent endpoint). Fixed to POST to `/api/v1/projects` — the same endpoint handles both registration and optional scaffold via the `scaffold: true` flag in the body. The `scaffold` checkbox value is sent as a boolean field in the request body, not as a separate route.
- **Last modified:** 2026-03-18 in Debug Session (BUG-03) by debugger

---

### `client/src/components/Sidebar.jsx` :: `Sidebar()`
- **Purpose:** Left navigation sidebar. Loads project list on mount, renders project buttons with session status dots, navigation items (Terminal/Jobs/Entities/Projects), and "+" button to open AddProjectModal.
- **Called by:** App.jsx (always rendered as left column)
- **Calls:** apiGet (on mount — GET /api/v1/projects), apiPost (handleProjectClick — POST /api/v1/sessions), useAppState, useAppDispatch, AddProjectModal
- **Inputs:** none (reads state from AppContext)
- **Output:** JSX sidebar with navigation + project list
- **Side effects:** HTTP GET on mount (dispatches SET_PROJECTS); HTTP POST per new session (dispatches SET_SESSION)
- **Complexity note (BUG-04 fix):** Was destructuring the API response as `data.project` (singular) after GET /api/v1/projects; the endpoint returns `{ projects: [...] }` (plural). Fixed to `data.projects ?? []`. (BUG-05 fix): handleProjectClick was destructuring `data.sessionId` from the POST /api/v1/sessions response; the endpoint returns `{ session: { sessionId, ... } }`. Fixed to `data.session`.
- **Last modified:** 2026-03-18 in Debug Session (BUG-04, BUG-05) by debugger

### `client/src/components/Sidebar.jsx` :: `handleProjectClick(project)` (internal)
- **Purpose:** Handle click on a project in the sidebar list. Dispatches SET_ACTIVE_PROJECT + SET_VIEW 'terminal'. If no existing session for the project, creates one via POST /api/v1/sessions and dispatches SET_SESSION.
- **Called by:** Sidebar (onClick of each project button)
- **Calls:** useAppDispatch, apiPost
- **Inputs:** project (object — { id, name, path })
- **Output:** void (async)
- **Side effects:** dispatches to AppContext; HTTP POST to /api/v1/sessions if no existing session
- **Last modified:** 2026-03-18 in Debug Session (BUG-05) by debugger

### `client/src/components/Sidebar.jsx` :: `handleNavClick(view)` (internal)
- **Purpose:** Dispatch SET_VIEW on nav item click.
- **Called by:** Sidebar nav buttons
- **Calls:** useAppDispatch
- **Inputs:** view (string)
- **Output:** void
- **Side effects:** dispatches SET_VIEW to AppContext
- **Last modified:** 2026-03-18 in Task #6 by frontend-dev

---

### `client/src/hooks/useSession.js` :: `useSession(sessionId, onData)`
- **Purpose:** Custom React hook that manages a WebSocket connection to the terminal server for a given session. Exposes `send` (input) and `resize` callbacks. Reconnects once on unexpected close (not code 1000/1001). Cleans up on unmount.
- **Called by:** client/src/components/Terminal.jsx
- **Calls:** WebSocket (browser native), JSON.stringify (send/resize), clearTimeout
- **Inputs:** sessionId (string | null | undefined), onData (function — called with each raw PTY data string)
- **Output:** `{ send, resize }` — stable callbacks
- **Side effects:** opens/closes WebSocket; retries once on unexpected disconnect with 1s delay
- **Complexity note (BUG-16 fix):** WS_BASE was previously hardcoded to `ws://127.0.0.1:3000`. Fixed to use `ws://127.0.0.1:${window.location.port || 3000}` so the WS connection adapts to whatever port the app is running on (configured by PORT env var). Without this fix, a server on a non-3000 port would connect WS to the wrong port.
- **Last modified:** 2026-03-18 in Debug Session (BUG-16) by debugger

### `client/src/hooks/useSession.js` :: `send(data)` (returned callback)
- **Purpose:** Send a keyboard input message to the server over the WebSocket. No-op if WS is not in OPEN state.
- **Called by:** client/src/components/Terminal.jsx (xterm.js onData handler)
- **Calls:** ws.send, JSON.stringify
- **Inputs:** data (string — raw keyboard input)
- **Output:** void
- **Side effects:** sends WS message `{ type: 'input', data }`
- **Last modified:** 2026-03-18 in Task #6 by frontend-dev

### `client/src/hooks/useSession.js` :: `resize(cols, rows)` (returned callback)
- **Purpose:** Send a terminal resize message to the server. No-op if WS not OPEN.
- **Called by:** client/src/components/Terminal.jsx (ResizeObserver / FitAddon callback)
- **Calls:** ws.send, JSON.stringify
- **Inputs:** cols (number), rows (number)
- **Output:** void
- **Side effects:** sends WS message `{ type: 'resize', cols, rows }`
- **Last modified:** 2026-03-18 in Task #6 by frontend-dev

---

### `client/src/views/ProjectsView.jsx` :: `ProjectsView()`
- **Purpose:** Full projects management view. Loads project list on mount via GET /api/v1/projects, dispatches SET_PROJECTS to AppContext. Shows table with Name / Path / Status (StatusBadge) / Created / Actions columns. Actions: Open Terminal (SET_ACTIVE_PROJECT + SET_VIEW 'terminal'), Delete (shows ConfirmDialog). Refreshes after modal close.
- **Called by:** App.jsx (route/view rendering — when view === 'projects')
- **Calls:** apiGet (loadProjects), apiDelete (handleDeleteConfirm), useAppState, useAppDispatch, AddProjectModal, StatusBadge, ConfirmDialog
- **Inputs:** none (reads context)
- **Output:** JSX — header + project table + modals
- **Side effects:** HTTP GET on mount, HTTP DELETE on confirm; dispatches SET_PROJECTS, REMOVE_PROJECT, SET_ACTIVE_PROJECT, SET_VIEW to AppContext
- **Complexity note (BUG-04 fix):** Was destructuring `data.project` (singular) from GET /api/v1/projects response. Fixed to `data.projects ?? []` to match actual endpoint response shape `{ projects: [...] }`.
- **Last modified:** 2026-03-18 in Debug Session (BUG-04) by debugger

### `client/src/views/ProjectsView.jsx` :: `StatusBadge({ active })` (internal)
- **Purpose:** Visual indicator — green "Active" badge if the project has an active session (sessions[project.id] truthy), grey "No session" otherwise.
- **Called by:** ProjectsView (one per table row)
- **Calls:** none (pure presentational)
- **Inputs:** active (boolean)
- **Output:** JSX span with inline dot indicator
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #11 by frontend-dev

### `client/src/views/ProjectsView.jsx` :: `ConfirmDialog({ projectName, onConfirm, onCancel, busy })` (internal)
- **Purpose:** Full-screen overlay modal for project deletion confirmation. Shows project name, warns "no files deleted — registry only". Disable buttons while busy.
- **Called by:** ProjectsView (when confirmTarget is not null)
- **Calls:** none (callbacks only)
- **Inputs:** projectName (string), onConfirm (function), onCancel (function), busy (boolean)
- **Output:** JSX fixed-position overlay
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #11 by frontend-dev

### `client/src/views/ProjectsView.jsx` :: `formatDate(iso)` (internal)
- **Purpose:** Format ISO date string to locale-friendly date (e.g., "Mar 18, 2026"). Returns "—" on null/invalid.
- **Called by:** ProjectsView (project.createdAt column)
- **Calls:** Date constructor, Date.toLocaleDateString
- **Inputs:** iso (string | null)
- **Output:** string
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #11 by frontend-dev

---

### `client/src/lib/constants.js` :: `NAV_ITEMS` (exported const)
- **Purpose:** Array of sidebar navigation items. Each object: `{ icon: string (Material Symbols name), label: string (display text), view: string (AppContext view identifier) }`. Defines the 5 Phase 9 views: projects, terminal, jobs, deployments, context.
- **Called by:** Currently Sidebar.jsx has its own local NAV_ITEMS (not yet importing this module). Will be imported by the new Sidebar in Task #24.
- **Calls:** none (static data)
- **Inputs:** N/A (constant)
- **Output:** Array of 5 nav item objects
- **Side effects:** none
- **Last modified:** 2026-03-25 in Task #23 by frontend-dev

### `client/src/lib/constants.js` :: `STATUS_COLORS` (exported const)
- **Purpose:** Maps status strings to Tailwind CSS class triplets `{ bg, text, dot }` for badge/indicator rendering. Covers 10 statuses: running, active, idle, done, completed, cancelled, error, failed, pending, queued. References Phase 9 custom color tokens (bg-success/10, text-primary, bg-error/10, etc.).
- **Called by:** Not yet imported. Will be used by Phase 9 view components (ProjectsView, JobView, etc.) to replace inline status color logic.
- **Calls:** none (static data)
- **Inputs:** N/A (constant)
- **Output:** Object with 10 status keys, each mapping to `{ bg, text, dot }` class strings
- **Side effects:** none
- **Complexity note:** Uses Tailwind opacity modifier syntax (e.g., `bg-success/10` = success color at 10% opacity). Requires the custom color tokens from tailwind.config.js to resolve correctly.
- **Last modified:** 2026-03-25 in Task #23 by frontend-dev

---

## Test Modules (Task #13 — qa-tester)

### `server/vitest.config.js` :: (config)
- **Purpose:** Vitest configuration for server-side tests. Sets pool to 'forks' (sequential) to avoid cross-test PTY interference, 10s per-test timeout, includes all `tests/**/*.test.js`.
- **Called by:** `npm test --prefix server` (or root `npm test`)
- **Calls:** vitest/config::defineConfig
- **Inputs:** none
- **Output:** Vitest config object
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

### `server/tests/RingBuffer.test.js` :: (test suite)
- **Purpose:** 19 unit tests for RingBuffer circular buffer. Covers: constructor validation (TypeError on bad capacity), happy-path push/retrieve (string + Buffer), wrap-around overflow (oldest bytes discarded), clear(), toBuffer() idempotency.
- **Tests:** `server/services/RingBuffer.js` — imports `{ RingBuffer }` directly (no mocks needed)
- **Called by:** vitest test runner
- **Calls:** RingBuffer (constructor), rb.push(), rb.toBuffer(), rb.clear(), rb.size, rb.capacity
- **Inputs:** N/A (test file)
- **Output:** 19 test results
- **Side effects:** none (in-memory only)
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

### `server/tests/FileManager.test.js` :: (test suite)
- **Purpose:** 10 unit tests for FileManager path validation and I/O. Uses real filesystem with per-test temp dir (fs.promises.mkdtemp). Covers: validatePath accept/reject (traversal detection, sibling dir attack, prefix-sharing attack), readFile (ENOENT, traversal), writeFile (atomic write, parent dir creation, overwrite, traversal), listDirectory (ENOENT returns []).
- **Tests:** `server/services/FileManager.js` — imports `{ FileManager }` directly; uses real fs with temp dirs
- **Called by:** vitest test runner
- **Calls:** FileManager (constructor), fm.validatePath(), fm.readFile(), fm.writeFile(), fm.listDirectory(), fs.promises.mkdtemp, fs.promises.rm (cleanup)
- **Inputs:** N/A (test file)
- **Output:** 10 test results
- **Side effects:** creates/deletes temp directories in os.tmpdir() during test run
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

### `server/tests/csrf.test.js` :: (test suite)
- **Purpose:** 13 unit tests for csrfMiddleware. Covers: safe methods (GET/HEAD/OPTIONS) always call next(); mutating methods (POST/PUT/PATCH/DELETE) require exact header `X-Requested-With: ClaudeCodeManager`; wrong value or empty string returns 403; WebSocket upgrade requests (GET + upgrade header) pass; response body on rejection is `{ error: 'CSRF validation failed' }`.
- **Tests:** `server/middleware/csrf.js` — imports `{ csrfMiddleware }` directly; uses mock req/res/next (no HTTP server needed)
- **Called by:** vitest test runner
- **Calls:** csrfMiddleware (with mock req/res/next), vi.fn (vitest mock)
- **Inputs:** N/A (test file)
- **Output:** 13 test results
- **Side effects:** none (no filesystem or network)
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

### `server/tests/pathValidation.test.js` :: (test suite)
- **Purpose:** 13 unit tests for validateProjectPath, validateClaudePath, and ApiError. Covers: validateProjectPath (valid path returns absolute, relative resolves, empty string/whitespace/non-string throws ApiError(400)), validateClaudePath (valid path in base, deeply nested, base itself, multi-base match, path traversal ../../, sibling prefix attack, outside all bases, empty bases array), ApiError (statusCode + message + instanceof Error).
- **Tests:** `server/middleware/pathValidation.js` — imports `{ validateProjectPath, validateClaudePath, ApiError }` directly
- **Called by:** vitest test runner
- **Calls:** validateProjectPath(), validateClaudePath(), ApiError constructor
- **Inputs:** N/A (test file)
- **Output:** 13 test results
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

### `server/tests/SessionManager.test.js` :: (test suite)
- **Purpose:** 18 unit tests for SessionManager. Uses vi.mock to stub node-pty (avoids real PTY creation), ProcessRegistry (avoids filesystem writes), and tree-kill (avoids real signal sending). Covers: createSession (shape + uniqueId + listSessions), getSession (unknown → undefined), listSessions (empty + multiple), attachClient (add to Set + ring buffer replay on attach), detachClient (remove from Set + session persists with status 'active'), writeInput (pty.write + lastActivityAt update, no-op on killed/unknown), killSession (removes from map + marks killed + closes ws clients + no-op on unknown), PTY persistence (buffer retained across detach/reattach), session switching (independent sessions per project).
- **Tests:** `server/services/SessionManager.js` — imports `{ SessionManager }` (class, not singleton) for test isolation
- **Called by:** vitest test runner
- **Calls:** SessionManager (constructor), manager.createSession/getSession/listSessions/attachClient/detachClient/writeInput/killSession/killAll; vi.mock for node-pty, ProcessRegistry, tree-kill
- **Inputs:** N/A (test file)
- **Output:** 18 test results
- **Side effects:** none (all I/O mocked)
- **Complexity note:** Imports `{ SessionManager }` class (not the `sessionManager` singleton) so each test can instantiate a fresh manager without cross-test state contamination. vi.mock is hoisted before import.
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

### `server/tests/JobRunner.test.js` :: (test suite)
- **Purpose:** 18 unit tests for JobRunner. Uses vi.hoisted + vi.mock to intercept child_process.spawn (returns mock child with PassThrough stdout/stderr, EventEmitter stdin with .end mock). Covers: startJob (throws if claudeBin unset, returns jobId+createdAt, stdin.end() called immediately — hang prevention DEC-005, shell:false enforced — SEC-02, job in listJobs with status 'running', status becomes 'done' on exit code 0, status becomes 'error' on non-zero exit), cancelJob (false for unknown/done, true for running, status stays 'cancelled' after non-zero exit — race condition prevention, sends `"type":"cancelled"` SSE event to connected clients), cancelAll (cancels all running, leaves done untouched), addSseClient (false for unknown, returns true + sets SSE headers for running, immediately sends done event + calls res.end if job already completed), listJobs (prompt absent from output — SEC-08, child/clients/result absent from output).
- **Tests:** `server/services/JobRunner.js` — imports `{ JobRunner }` class (not singleton); uses vi.hoisted for spawn mock
- **Called by:** vitest test runner
- **Calls:** JobRunner (constructor), runner.startJob/cancelJob/cancelAll/addSseClient/listJobs/getJob; spawnMock via vi.hoisted
- **Inputs:** N/A (test file)
- **Output:** 18 test results
- **Side effects:** none (spawn + tree-kill mocked)
- **Complexity note:** vi.hoisted() is required for the spawnMock ref because vi.mock factories are hoisted before variable declarations — a let/const at module top would be in TDZ when the factory runs. PassThrough is used for stdout/stderr because readline.createInterface requires .resume() which plain EventEmitter lacks.
- **Last modified:** 2026-03-18 in Task #13 by qa-tester

---

---

### `server/services/ProcessRegistry.js` :: `isValidPid(pid)` (internal)
- **Purpose:** Guard function — returns true only if pid is a positive integer in range [1, 65535]. Values outside this range (zero, negative, float, string, >65535) are rejected to prevent a tampered `active_pids.json` from triggering kill signals on arbitrary OS processes.
- **Called by:** ProcessRegistry.register, ProcessRegistry.cleanupStale
- **Calls:** typeof, Number.isInteger
- **Inputs:** pid (unknown — deliberately typed as unknown for defensive checking)
- **Output:** boolean
- **Side effects:** none
- **Complexity note:** MAX_PID = 65535 is a safe upper bound covering all realistic OS PID ranges (Linux/macOS typically 4194304 but 65535 is conservative and safe). The guard is applied both on write (register) and on read (cleanupStale) to handle any pre-existing corrupt file content.
- **Last modified:** 2026-03-18 in Task #18 by security (MEDIUM-03 fix: new function — added PID range guard)

### `server/services/ProcessRegistry.js` :: `register(pid, metadata)`
- **Purpose:** Add a PID + metadata to `active_pids.json`. Skips (with console.warn) if pid fails isValidPid — prevents registering PID 0, negative PIDs, or floats.
- **Called by:** server/services/SessionManager.js (after pty spawn), server/services/JobRunner.js (after child spawn)
- **Calls:** isValidPid, readRegistry, writeRegistry
- **Inputs:** pid (number), metadata (object — e.g. { type: 'session'|'job', projectId })
- **Output:** Promise\<void\>
- **Side effects:** atomic write to active_pids.json; console.warn on invalid PID
- **Last modified:** 2026-03-18 in Task #18 by security (added isValidPid guard — was previously unguarded)

### `server/services/ProcessRegistry.js` :: `unregister(pid)`
- **Purpose:** Remove a PID entry from `active_pids.json` on clean process exit.
- **Called by:** server/services/SessionManager.js (session kill), server/services/JobRunner.js (job finish)
- **Calls:** readRegistry, writeRegistry
- **Inputs:** pid (number)
- **Output:** Promise\<void\>
- **Side effects:** atomic write to active_pids.json
- **Last modified:** 2026-03-18 in Task #3 by backend-dev (original implementation)

### `server/services/ProcessRegistry.js` :: `cleanupStale()`
- **Purpose:** On startup (and shutdown), read active_pids.json, filter out any out-of-range PIDs (isValidPid guard), kill all valid alive PIDs via tree-kill SIGKILL, then clear the file. Ensures orphaned processes from a previous server run are cleaned up.
- **Called by:** server/index.js::startup() (Step 4), server/index.js::shutdown() (final step)
- **Calls:** readRegistry, isValidPid (filter), isProcessAlive, killProcess (tree-kill SIGKILL), writeRegistry
- **Inputs:** none
- **Output:** Promise\<void\>
- **Side effects:** SIGKILL to any alive PIDs in registry; overwrites active_pids.json with `{}`; console.warn for skipped out-of-range PIDs
- **Complexity note:** PIDs that fail isValidPid are skipped with a warning rather than killing — this is the MEDIUM-03 fix. Previously all values in the file (including potentially attacker-injected arbitrary integers) were passed to tree-kill.
- **Last modified:** 2026-03-18 in Task #18 by security (added isValidPid filter — was previously unguarded)

### `server/services/ProcessRegistry.js` :: `readRegistry()` (internal)
- **Purpose:** Synchronously read and JSON-parse active_pids.json. Returns `{}` on missing file, parse error, or if root is not a plain object.
- **Called by:** register, unregister, cleanupStale
- **Calls:** fs.readFileSync, JSON.parse
- **Inputs:** none (reads from path derived from ConfigStore.CONFIG_DIR)
- **Output:** object (pid string keys → metadata objects)
- **Side effects:** filesystem read
- **Last modified:** 2026-03-18 in Task #3 by backend-dev (original implementation)

### `server/services/ProcessRegistry.js` :: `writeRegistry(registry)` (internal)
- **Purpose:** Atomically write the registry object to active_pids.json (JSON, 2-space indented).
- **Called by:** register, unregister, cleanupStale
- **Calls:** writeFileAtomic
- **Inputs:** registry (object)
- **Output:** Promise\<void\>
- **Side effects:** atomic filesystem write
- **Last modified:** 2026-03-18 in Task #3 by backend-dev (original implementation)

### `server/services/ProcessRegistry.js` :: `killProcess(pid)` (internal)
- **Purpose:** Tree-kill a PID with SIGKILL, wrapped in a Promise. Ignores errors (process may already be dead).
- **Called by:** cleanupStale
- **Calls:** treeKill (tree-kill, loaded via createRequire)
- **Inputs:** pid (number — already validated by isValidPid before this is called)
- **Output:** Promise\<void\>
- **Side effects:** SIGKILL to process tree
- **Last modified:** 2026-03-18 in Task #3 by backend-dev (original implementation)

---

## Previously Documented Modules (unchanged in Tasks #7-#8)

### `server/services/ConfigStore.js` :: `ConfigStore`
- See prior entries. Unchanged.

### `server/services/RingBuffer.js` :: `RingBuffer`
- See prior entries. Unchanged.

### `server/services/SessionManager.js` :: `SessionManager.createSession(projectId, projectPath, claudeBinaryPath)`
- **Purpose:** Spawn a new PTY process running the Claude binary in the given project directory. Wire permanent onData + onExit handlers. Register PID in ProcessRegistry. Return session record.
- **Called by:** server/routes/sessions.js (POST /api/v1/sessions handler)
- **Calls:** pty.spawn, RingBuffer (constructor), uuidv4, ProcessRegistry.register, SessionManager.#startIdleSweeper
- **Inputs:** projectId (string), projectPath (string), claudeBinaryPath (string)
- **Output:** Promise\<SessionRecord\>
- **Side effects:** spawns PTY process; writes PID to active_pids.json via ProcessRegistry; starts idle sweeper if not running
- **Complexity note (BUG-02 fix):** onExit handler uses a `_unregistered` sentinel flag on the session record to prevent double-unregister. killSession() also sets `_unregistered = true` before calling ProcessRegistry.unregister. Without this guard, both the explicit killSession call and the natural onExit event would each call unregister, causing a race write to active_pids.json.
- **Last modified:** 2026-03-18 in Debug Session (BUG-02) by debugger

### `server/services/SessionManager.js` :: `SessionManager.attachClient(sessionId, ws)`
- **Purpose:** Add a WebSocket to a session's client set and immediately replay the ring buffer so the client catches up on all prior output.
- **Called by:** server/ws/terminalHandler.js::setupTerminalWebSocket (on WS connection)
- **Calls:** session.clients.add, session.buffer.toBuffer, ws.send
- **Inputs:** sessionId (string), ws (WebSocket)
- **Output:** void
- **Side effects:** replays buffered bytes to ws; logs attach event
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `SessionManager.detachClient(sessionId, ws)`
- **Purpose:** Remove a WebSocket from a session's client set. PTY stays alive (DEC-009 — user may reconnect).
- **Called by:** server/ws/terminalHandler.js::setupTerminalWebSocket (on WS close)
- **Calls:** session.clients.delete
- **Inputs:** sessionId (string), ws (WebSocket)
- **Output:** void
- **Side effects:** none — PTY NOT killed; logs detach event
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `SessionManager.writeInput(sessionId, data)`
- **Purpose:** Forward user keystrokes to the PTY process. No-op if session unknown or status is not 'active'.
- **Called by:** server/ws/terminalHandler.js (on WS 'input' message)
- **Calls:** session.pty.write
- **Inputs:** sessionId (string), data (string)
- **Output:** void
- **Side effects:** writes to PTY stdin; updates lastActivityAt
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `SessionManager.resizePty(sessionId, cols, rows)`
- **Purpose:** Resize PTY terminal dimensions. No-op on unknown or killed sessions. lastActivityAt is NOT updated (per architecture spec).
- **Called by:** server/ws/terminalHandler.js (on WS 'resize' message)
- **Calls:** session.pty.resize
- **Inputs:** sessionId (string), cols (number), rows (number)
- **Output:** void
- **Side effects:** PTY resize
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `SessionManager.killSession(sessionId)`
- **Purpose:** Kill PTY process tree, close all attached WebSocket clients, mark session as 'killed', unregister PID, remove from sessions map.
- **Called by:** server/routes/sessions.js (DELETE handler), SessionManager.killAll, SessionManager.#startIdleSweeper (idle timeout)
- **Calls:** treeKillAsync, ws.close (for each client), ProcessRegistry.unregister, SessionManager.#stopIdleSweeper
- **Inputs:** sessionId (string)
- **Output:** Promise\<void\>
- **Side effects:** SIGKILL to process tree; closes WS connections; writes to active_pids.json; removes from sessions Map; may stop idle sweeper
- **Complexity note (BUG-02 fix):** Uses `_unregistered` sentinel flag (same as in createSession onExit) to prevent double-unregister race between explicit killSession and the natural onExit handler firing after tree-kill.
- **Last modified:** 2026-03-18 in Debug Session (BUG-02) by debugger

### `server/services/SessionManager.js` :: `SessionManager.killAll()`
- **Purpose:** Kill all active sessions. Used in SIGTERM/SIGINT shutdown handlers. Calls killSession for each in parallel via Promise.allSettled.
- **Called by:** server/index.js::shutdown() handler
- **Calls:** SessionManager.killSession (for each session), Promise.allSettled, SessionManager.#stopIdleSweeper
- **Inputs:** none
- **Output:** Promise\<void\>
- **Side effects:** all sessions killed; idle sweeper stopped
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `SessionManager.getSession(sessionId)`
- **Purpose:** Return the SessionRecord for a given sessionId, or undefined if not found.
- **Called by:** server/ws/terminalHandler.js, server/routes/sessions.js
- **Calls:** Map.get
- **Inputs:** sessionId (string)
- **Output:** SessionRecord | undefined
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `SessionManager.listSessions()`
- **Purpose:** Return all session records as an array.
- **Called by:** server/routes/sessions.js (GET handler)
- **Calls:** Array.from, Map.values
- **Inputs:** none
- **Output:** SessionRecord[]
- **Side effects:** none
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `treeKillAsync(pid)` (internal)
- **Purpose:** Wrap tree-kill in a Promise. Resolves on callback regardless of error (process may already be dead).
- **Called by:** SessionManager.killSession
- **Calls:** treeKill (tree-kill, loaded via createRequire)
- **Inputs:** pid (number)
- **Output:** Promise\<void\>
- **Side effects:** SIGKILL to process tree
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/services/SessionManager.js` :: `onData handler` (permanent, wired in createSession)
- **Purpose:** Permanent PTY output drain — pushes all output to RingBuffer and forwards to connected clients. Never removed (DEC-009 — ConPTY deadlock prevention).
- **Called by:** node-pty (fires on every byte of PTY output)
- **Calls:** session.buffer.push, ws.send (for each client in session.clients)
- **Inputs:** data (string — raw PTY output)
- **Output:** void
- **Side effects:** writes to RingBuffer; sends to WebSocket clients
- **Complexity note (BUG-11 fix):** Backpressure guard: `if (ws.readyState !== WS_OPEN) continue` was added alongside the existing `ws._socket.bufferSize` check. Previously a client whose WS was in CLOSING/CLOSED state (readyState !== 1) could still reach the send path if _socket.bufferSize happened to be low. The readyState guard now comes first, preventing the send attempt on non-OPEN sockets.
- **Last modified:** 2026-03-18 in Debug Session (BUG-11) by debugger

### `server/services/SessionManager.js` :: `sessionManager` (singleton export)
- **Purpose:** Singleton instance of SessionManager exported for use by routes and WS handler.
- **Called by:** server/routes/sessions.js, server/ws/terminalHandler.js, server/index.js (shutdown)
- **Calls:** (singleton — see class methods above)
- **Inputs:** N/A
- **Output:** SessionManager instance
- **Side effects:** none (construction side effect: starts idle sweeper only once first session is created)
- **Last modified:** 2026-03-18 in Task #5 by backend-dev

### `server/ws/terminalHandler.js` :: `setupTerminalWebSocket(wss)`
- See prior entries. Unchanged.

---

## Key Behaviors
- POST /api/v1/projects auto-scaffolds .claude/, agents/, commands/ if they don't exist
- DELETE /api/v1/projects/:id removes from registry only — files on disk untouched
- Path validation via validateProjectPath() before any disk operation
- pty.onData is permanent — never removed (ConPTY deadlock prevention, DEC-009)
- PTY survives WebSocket close — user reconnects to same session
- Ring buffer replayed on reconnect before live streaming
- Idle sweeper: every 5 min, kills sessions inactive for 30 min (configurable)
- tree-kill used for process termination (CJS loaded via createRequire) — for both PTY sessions and jobs
- sessionManager.claudeBin and jobRunner.claudeBin both set by index.js after binary discovery
- Agent/skill IDs are SHA-256 derived from file path (first 16 hex chars) — deterministic, not stored
- PUT/DELETE for agents and skills require filePath in body (ID cannot be reverse-hashed to path)
- DELETE /api/v1/skills/:id uses `{ dirPath }` for modern skills (removes entire directory) and `{ filePath }` for legacy
- CLAUDE.md saves return lineCount; UI warns if > 300 lines
- Job Mode: `claude -p` spawned with `--output-format stream-json`; stdin.end() called immediately after spawn (DEC-005 / GitHub #7497)
- Job SSE stream: GET /api/v1/jobs/:id/stream — Express/Node timeouts disabled (req.setTimeout(0), res.setTimeout(0))
- Job prompt is NEVER logged (SEC-08) — neither in JobRunner nor in routes/jobs.js
- JobRunner.cancelAll() called in server shutdown handler — ensures all running jobs receive SIGTERM before server exit
- ProjectsView session status: sessions object from AppContext; badge shows "Active" if sessions[project.id] is truthy

- WorkflowStore persists workflows to %APPDATA%\ClaudeCodeManager\workflows\<uuid>.json; server generates UUIDs (never client-supplied); _resolveFilePath() guards all reads/writes against directory traversal (SEC-V3-06)
- HandoffParser: stateful 4KB rolling buffer; ANSI-stripped; __HANDOFF__:targetId:base64 tokens may span multiple PTY onData chunks; global regex constructed fresh per feed() call to avoid stale lastIndex; contextUpdate validated (max 50 keys, primitive values, string max 1024 chars) (SEC-V3-07)
- Test suite: 7 files, 132 tests total (110 + 22 new HandoffParser tests), all passing. Runner: Vitest v4.1.0 with `pool: 'forks'` (sequential) to prevent PTY cross-test interference
- SessionManager + JobRunner tests import the CLASS (not the singleton export) for per-test isolation
- Security audit result (original): NEEDS_ATTENTION — 0 CRITICAL, 0 HIGH, 3 MEDIUM (exec() in auto-open, allowedTools not whitelist-validated, PID file tampering), 2 LOW. Overall risk LOW for localhost single-user model
- MEDIUM-01 FIXED (Task #16): openBrowser() now uses spawn({shell:false}) — URL passed as array arg to cmd.exe/open/xdg-open, never shell-interpolated
- MEDIUM-02 FIXED (Task #17): POST /api/v1/jobs validates allowedTools against `/^[a-zA-Z0-9_,\-]+$/` (max 512 chars) before passing to spawn args
- MEDIUM-03 FIXED (Task #18): ProcessRegistry.cleanupStale() and register() now call isValidPid() — PIDs outside [1, 65535] are skipped with console.warn rather than passed to tree-kill
- BUG-02 FIXED (Debug Session): SessionManager double-unregister race — killSession() and onExit() both set `session._unregistered = true` before calling ProcessRegistry.unregister; whichever runs second is a no-op
- BUG-03 FIXED (Debug Session): AddProjectModal was POSTing to `/api/v1/projects/scaffold` (non-existent); fixed to `/api/v1/projects` with scaffold flag in body
- BUG-04 FIXED (Debug Session): Sidebar and ProjectsView were reading `data.project` (singular) from GET /api/v1/projects; fixed to `data.projects` (plural) to match actual response shape
- BUG-05 FIXED (Debug Session): Sidebar::handleProjectClick was reading `data.sessionId` from POST /api/v1/sessions; fixed to `data.session` to match actual response shape `{ session: { sessionId, ... } }`
- BUG-11 FIXED (Debug Session): SessionManager onData backpressure guard now checks `ws.readyState !== WS_OPEN` first before the bufferSize check — prevents send attempt on CLOSING/CLOSED WebSockets
- BUG-14 FIXED (Debug Session): frontmatter.js::parseFrontmatter now applies type guard on yaml.load() result — accepts only plain objects; scalar returns (string/number/null) fall back to `{}`
- BUG-16 FIXED (Debug Session): useSession WS_BASE was hardcoded to port 3000; fixed to use `window.location.port || 3000` so WS connects to actual server port

## Key Patterns
- ESM modules throughout (import/export)
- Server binds to 127.0.0.1 only
- Vite dev proxy: /api → http://127.0.0.1:3000, /ws → ws://127.0.0.1:3000
- All mutating HTTP requests from client include X-Requested-With: ClaudeCodeManager header (CSRF)
- All file writes use write-file-atomic (never fs.writeFile directly)
- Path traversal: FileManager.validatePath called on every read/write/delete
- resolveAllowedBase() in agents.js and skills.js: independent implementations, same pattern — checks USER dir then all registered project paths
- SSE pattern: server sets Content-Type text/event-stream + no-cache; client uses native EventSource (not apiGet); JobRunner owns response lifetime — routes/jobs.js does NOT call res.end() after addSseClient returns true
- useJob hook: jobIdRef mirrors jobId state to avoid stale closure in cancelJob useCallback; status guard prevents double job submission
- react-markdown applied in `.markdown-result` CSS scope (index.css) for consistent Markdown typography — heading colors updated to #933df5 (purple) in Task #23
- Phase 9 Design System (Task #23): primary=#933df5, background=#000, surface scale (0a0a0a/111111/141414/1a1a1a), fonts Inter+JetBrains Mono via Google Fonts CDN, Material Symbols Outlined icons, utility classes .glass-effect/.custom-scrollbar/.active-indicator
- client/src/lib/constants.js: NAV_ITEMS defines 5 views (projects/terminal/jobs/deployments/context); STATUS_COLORS maps 10 statuses to Tailwind class triplets. Imported by Sidebar.jsx (Task #24+).
- Phase 9 App.jsx: MainContent switch routes 5 views; AppLayout wraps Sidebar + MainContent in flex layout; default case falls back to ProjectsView
- Phase 9 Sidebar.jsx: imports NAV_ITEMS from constants.js (not local copy); shows Active PTY Sessions section with live session count; SidebarFooter shows "v1.2.0" hardcoded version
- Phase 9 ProjectsView.jsx: dual view mode (grid cards / list table); "/" keyboard shortcut focuses search input; search filters by name or path; CardMenu with outside-click dismiss via useRef+mousedown; delete is deregister-only (same as v1)
- Phase 9 TerminalView.jsx: wraps Terminal.jsx unchanged; PtyHeader shows project name/path/kill button; StatusBarFooter shows connection status + placeholder tokens/latency badges; handleKill dispatches REMOVE_SESSION after apiDelete
- Phase 9 JobView.jsx: three-pane (job queue left, control bar + output right); background jobs polled every 5s via setInterval; current in-memory job from useJob shown alongside server-fetched backgroundJobs; Ctrl+Enter keyboard shortcut to run; MarkdownOutput uses react-markdown+remarkGfm; StreamLog auto-scrolls via bottomRef.scrollIntoView
- Phase 9 ContextEditorView.jsx: two-column (Rule Explorer left, CLAUDE.md Output right); parseRules() splits on "## " headings into name+body; rulesToContent() serializes back; LINE_WARN_THRESHOLD=80, LINE_LIMIT=100 (different from v1 300-line warning); scope toggle project/user; renderHighlightedLine() does syntax highlighting in right pane
- Phase 9 DeploymentManagerView.jsx: 3 tabs (Profiles/Active Processes/Environment); Profiles tab = master-detail agent list + AgentDetail form; Environment tab = skill viewer (read-only display); CreateAgentModal validates name against ^[a-z][a-z0-9-]*$ (same as server-side); MODEL_OPTIONS hardcoded list of Claude model IDs
- Phase 9 QA result (Task #31): ALL 10 acceptance criteria PASS. 110/110 tests pass. Build clean (299 modules). 3 LOW advisory findings: dead EntitiesView.jsx, minimal ARIA, hardcoded hex colors in ContextEditorView.

## Phase 9 — Frontend Redesign (COMPLETED)

**Status:** ALL 9 tasks (#23-#31) COMPLETED as of 2026-03-26. QA PASSED (Task #31: 10/10 acceptance criteria, 110/110 tests, build clean).

### Summary of Changes
- 5 views completely rewritten, 2 new views created, App.jsx routing replaced
- Navigation: 4 views (terminal/jobs/entities/projects) replaced by 5 views (projects/terminal/jobs/context/deployments)
- Default landing view: 'projects' (was 'terminal')
- AppContext.jsx view type: `'projects' | 'terminal' | 'jobs' | 'deployments' | 'context'` (was: `'terminal' | 'jobs' | 'entities' | 'projects'`)
- EntitiesView.jsx is now DEAD CODE (not imported, not deleted)
- AgentEditor.jsx, SkillEditor.jsx, ClaudeMdEditor.jsx, JobPanel.jsx are now DEAD CODE (replaced by inline implementations in new views)
- Terminal.jsx, useSession.js, useApi.js, useJob.js: UNCHANGED (constraint respected)
- All server code: UNCHANGED (frontend-only phase)

### QA Advisory Findings (LOW severity)
1. EntitiesView.jsx is dead code — should be deleted in cleanup task
2. Minimal ARIA labels on interactive elements — accessibility improvement opportunity
3. Some hardcoded hex colors in ContextEditorView.jsx (#333333, #050505, etc.) instead of Tailwind tokens

### Design Exports (reference files, not in codebase)
| Export Directory | View | Status |
|------------------|------|--------|
| stitch/stitch/final_project_dashboard/ | Project Dashboard (ProjectsView.jsx) | DONE Task #25 |
| stitch/stitch/final_multi_agent_terminal_hub/ | Live Terminal Hub (TerminalView.jsx) | DONE Task #26 |
| stitch/stitch/final_orchestration_center/ | Orchestration Center (JobView.jsx) | DONE Task #27 |
| stitch/stitch/final_context_rules_editor/ | Context & Rules Editor (ContextEditorView.jsx) | DONE Task #28 |
| stitch/stitch/final_deployment_manager/ | Deployment Manager (DeploymentManagerView.jsx) | DONE Task #29 |

---

---

## WorkflowStore (Task #43)

### `server/services/WorkflowStore.js` :: `WorkflowStore.init()`
- **Purpose:** Create the `workflows/` subdirectory under configDir if it does not already exist.
- **Called by:** server/index.js startup sequence (after `new WorkflowStore(ConfigStore.CONFIG_DIR)`)
- **Calls:** fs.existsSync, fs.mkdirSync
- **Inputs:** none
- **Output:** Promise\<void\>
- **Side effects:** may create directory at `%APPDATA%\ClaudeCodeManager\workflows\`
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore.list()`
- **Purpose:** Return an array of all WorkflowDefinition objects from disk. Calls get() for each .json file — silently skips unreadable or malformed files.
- **Called by:** workflow routes (not yet implemented — reserved for routes/workflows.js)
- **Calls:** fs.existsSync, fs.readdirSync, WorkflowStore.get
- **Inputs:** none
- **Output:** Promise\<WorkflowDefinition[]\> — empty array if directory missing or empty
- **Side effects:** filesystem reads (one per .json file)
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore.get(id)`
- **Purpose:** Return a single WorkflowDefinition by ID, or null if not found, invalid, or parse error. Path-traversal safe via _resolveFilePath.
- **Called by:** WorkflowStore.list (internal), WorkflowStore.update (pre-check)
- **Calls:** WorkflowStore._resolveFilePath, fs.existsSync, fs.readFileSync, JSON.parse
- **Inputs:** id (string — UUID)
- **Output:** Promise\<WorkflowDefinition | null\>
- **Side effects:** filesystem read
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore.create(data)`
- **Purpose:** Validate schema, generate server-side UUID, set createdAt/updatedAt, atomically write to `<id>.json`. Returns created WorkflowDefinition. Server generates UUID — never trusts client-supplied IDs.
- **Called by:** workflow routes (not yet implemented — reserved for POST /api/v1/workflows)
- **Calls:** WorkflowStore.validate, randomUUID, WorkflowStore._writeWorkflow
- **Inputs:** data (object — `{ name, projectId, description?, nodes?, edges?, settings?, initialContext? }`)
- **Output:** Promise\<WorkflowDefinition\> — throws Error (statusCode=400) on validation failure
- **Side effects:** atomic write to workflows/<uuid>.json
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore.update(id, data)`
- **Purpose:** Load existing workflow (throws 404 if missing), validate new data, merge with existing fields, write atomically. Preserves id, createdAt; updates updatedAt.
- **Called by:** workflow routes (not yet implemented — reserved for PUT /api/v1/workflows/:id)
- **Calls:** WorkflowStore.get, WorkflowStore.validate, WorkflowStore._writeWorkflow
- **Inputs:** id (string), data (object — same shape as create)
- **Output:** Promise\<WorkflowDefinition\> — throws Error (statusCode=404 or 400)
- **Side effects:** atomic write overwrites existing .json file
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore.delete(id)`
- **Purpose:** Unlink the workflow JSON file. Returns true on success, false if not found or path invalid.
- **Called by:** workflow routes (not yet implemented — reserved for DELETE /api/v1/workflows/:id)
- **Calls:** WorkflowStore._resolveFilePath, fs.existsSync, fs.unlinkSync
- **Inputs:** id (string)
- **Output:** Promise\<boolean\>
- **Side effects:** deletes file from disk
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore.validate(data)`
- **Purpose:** Schema validation — returns `{ valid: boolean, errors: string[] }`. Never throws. Validates: name (required, max 100, NAME_REGEX `/^[\w\s\-.]+$/`), description (max 500), nodes (array, max 50, each node.id matches NODE_ID_REGEX `^[a-z][a-z0-9-]*$`, systemPrompt max 16384 chars).
- **Called by:** WorkflowStore.create, WorkflowStore.update
- **Calls:** none (pure validation)
- **Inputs:** data (unknown)
- **Output:** `{ valid: boolean, errors: string[] }`
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore._resolveFilePath(id)` (internal)
- **Purpose:** Resolve workflow ID to absolute file path; returns null if ID is blank, contains path separators (`/`, `\`), traversal sequences (`..`), or null bytes. Final path must start with `this._workflowsDir + path.sep` (SEC-V3-06 directory traversal prevention).
- **Called by:** WorkflowStore.get, WorkflowStore.delete, WorkflowStore._writeWorkflow
- **Calls:** path.resolve, String.includes
- **Inputs:** id (string)
- **Output:** string (absolute path) | null
- **Side effects:** none (throws nothing — returns null on any invalid input)
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

### `server/services/WorkflowStore.js` :: `WorkflowStore._writeWorkflow(workflow)` (internal)
- **Purpose:** Atomically write a workflow object as JSON (2-space indented) to `<id>.json`. Creates workflows directory if missing. Validates path before write.
- **Called by:** WorkflowStore.create, WorkflowStore.update
- **Calls:** fs.existsSync, fs.mkdirSync, WorkflowStore._resolveFilePath, writeFileAtomic, JSON.stringify
- **Inputs:** workflow (WorkflowDefinition — must have valid .id field)
- **Output:** Promise\<void\> — throws if _resolveFilePath returns null
- **Side effects:** atomic filesystem write; may create directory
- **Last modified:** 2026-03-27 in Task #43 by backend-dev

---

## HandoffParser (Task #45)

### `server/services/HandoffParser.js` :: `HandoffParser.feed(rawChunk)`
- **Purpose:** Accept a raw PTY onData chunk (may be partial), strip ANSI escape codes, append to rolling 4KB buffer, then scan for `__HANDOFF__:target:base64` and `__DONE__` tokens. Returns array of parsed events (empty if no tokens found yet). Clears buffer when tokens are found.
- **Called by:** SwarmEngine._spawnAgentPty (via tapFn closure registered on ptySession.swarmListeners — Task #46.2)
- **Calls:** String.replace (ANSI strip × 4), HandoffParser._validateContext, Buffer.from, JSON.parse, RegExp.exec, DONE_RE.test, console.warn
- **Inputs:** rawChunk (string — raw PTY output from node-pty onData)
- **Output:** `Array<{ type: 'handoff', targetId: string, contextUpdate: object } | { type: 'done' }>` — empty array when no tokens present
- **Side effects:** mutates `this._buf`; console.warn on malformed payload or schema violation
- **Complexity note:** Global regex with `g` flag retains `lastIndex` between calls — a new RegExp is constructed from `HANDOFF_RE.source` inside each `feed()` call to avoid stale `lastIndex` bugs. The module-level `HANDOFF_RE` is used only as a source template.
- **Last modified:** 2026-03-27 in Task #45 by backend-dev

### `server/services/HandoffParser.js` :: `HandoffParser._validateContext(obj)` (internal)
- **Purpose:** Validate that a decoded contextUpdate is a flat non-null non-array object with max 50 keys, each key a string, each value a primitive (string/number/boolean), string values max 1024 chars (SEC-V3-07).
- **Called by:** HandoffParser.feed (after base64+JSON decode of each HANDOFF token)
- **Calls:** typeof, Object.keys, Array.isArray
- **Inputs:** obj (unknown — decoded JSON from base64 payload)
- **Output:** boolean — true if valid, false otherwise
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #45 by backend-dev

### `server/services/HandoffParser.js` :: `HandoffParser.reset()`
- **Purpose:** Clear the rolling accumulator buffer. Called when a session is reset or on parser reuse.
- **Called by:** Not yet wired — reserved for session lifecycle management in SwarmEngine (future task)
- **Calls:** (assignment only)
- **Inputs:** none
- **Output:** void
- **Side effects:** clears `this._buf` to empty string
- **Last modified:** 2026-03-27 in Task #45 by backend-dev

---

## SwarmEngine (Task #46.2)

### `server/services/SwarmEngine.js` :: `SwarmEngine(sessionManager, workflowStore)`
- **Purpose:** Constructor. Stores references to SessionManager and WorkflowStore. Initializes empty _executions Map and null _wsBroadcast. _budgetTracker is undefined until a future task wires it in.
- **Called by:** server/index.js (future — not yet integrated at server startup as of Task #46.2)
- **Calls:** none (assignment only)
- **Inputs:** sessionManager (SessionManager singleton), workflowStore (WorkflowStore instance)
- **Output:** SwarmEngine instance
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev

### `server/services/SwarmEngine.js` :: `SwarmEngine.setWsBroadcast(fn)`
- **Purpose:** Wire the WebSocket broadcast function (called by swarmHandler.js after WS channel setup). Stored as this._wsBroadcast for use by all methods that emit execution status events.
- **Called by:** swarmHandler.js (not yet implemented — future task)
- **Calls:** none (assignment only)
- **Inputs:** fn (Function — (executionId: string, event: object) => void)
- **Output:** void
- **Side effects:** sets this._wsBroadcast
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev

### `server/services/SwarmEngine.js` :: `SwarmEngine.startExecution(workflowId, projectId, projectPath)`
- **Purpose:** Start a new workflow execution. Loads workflow definition from WorkflowStore, creates an in-memory WorkflowExecution record, identifies the triage node (first node with isTriageNode===true or fallback to nodes[0]), then spawns a PTY session for that node. Returns executionId.
- **Called by:** (not yet wired to any route — swarm route to be implemented in a future task)
- **Calls:** WorkflowStore.get, uuidv4, SwarmEngine._spawnAgentPty
- **Inputs:** workflowId (string), projectId (string), projectPath (string)
- **Output:** Promise\<string\> — executionId (UUID)
- **Side effects:** creates execution record in this._executions; spawns PTY session; emits WS agent_status event via _spawnAgentPty
- **Complexity note:** The execution record is stored in _executions BEFORE _spawnAgentPty is called, so _spawnAgentPty can look it up during its own execution. Order matters.
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev

### `server/services/SwarmEngine.js` :: `SwarmEngine._spawnAgentPty(executionId, nodeId)`
- **Purpose:** Spawn an agent PTY session for a workflow node. Looks up the execution and node, builds handoffTargets from outgoing edges, calls _buildSystemPrompt (stub), creates a PTY session via SessionManager.createSession, writes the system prompt to the PTY, initializes agent state in agentStates Map, creates a tapFn closure that feeds PTY output to a HandoffParser instance, registers tapFn on ptySession.swarmListeners (DEC-014), and emits WS agent_status event.
- **Called by:** SwarmEngine.startExecution, SwarmEngine._ensureAgentPty
- **Calls:** SessionManager.createSession, SessionManager.writeInput, SessionManager.getSession, HandoffParser (constructor), HandoffParser.feed, SwarmEngine._buildSystemPrompt, SwarmEngine._onHandoff, SwarmEngine._onDone, this._wsBroadcast
- **Inputs:** executionId (string), nodeId (string)
- **Output:** Promise\<void\>
- **Side effects:** creates PTY session; writes to PTY stdin; adds entry to execution.agentStates; registers tapFn on ptySession.swarmListeners Set; emits WS event
- **Complexity note:** tapFn is a closure capturing executionId, nodeId, parser instance, and execution reference. It: (1) tracks lastOutputSnippet (last 500 chars), (2) optionally calls _budgetTracker if wired (Task #49), (3) feeds chunks to HandoffParser and dispatches handoff/done events. tapFn is stored in agentStates so stopExecution can remove it from swarmListeners during cleanup.
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev

### `server/services/SwarmEngine.js` :: `SwarmEngine._ensureAgentPty(executionId, nodeId)`
- **Purpose:** Return the sessionId for a node's agent PTY if one is already active (status !== 'done'). If none exists or the existing one is done, spawn a new PTY and return its sessionId.
- **Called by:** (future handoff routing logic — not yet called as of Task #46.2)
- **Calls:** SwarmEngine._spawnAgentPty (conditional)
- **Inputs:** executionId (string), nodeId (string)
- **Output:** Promise\<string | undefined\> — sessionId of active or newly spawned PTY
- **Side effects:** may spawn PTY session (via _spawnAgentPty)
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev

### `server/services/SwarmEngine.js` :: `SwarmEngine._buildSystemPrompt(node, workflowContext, handoffTargets)` (stub)
- **Purpose:** Assemble the system prompt for an agent node — role, workflow context, valid handoff targets. Per OpenAI Swarm pattern. STUB: returns undefined as of Task #46.2; full implementation in Task #46.3.
- **Called by:** SwarmEngine._spawnAgentPty
- **Calls:** none (empty body — stub)
- **Inputs:** node (workflow node object), workflowContext (object), handoffTargets (string[])
- **Output:** undefined (stub — will return string in #46.3)
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (stub)

### `server/services/SwarmEngine.js` :: `SwarmEngine._startHeartbeat(executionId)` (stub)
- **Purpose:** Start a heartbeat timer to prevent idle sweeper from killing active workflow PTY sessions. STUB: empty body as of Task #46.2; full implementation in Task #46.3.
- **Called by:** (not yet called — will be called from startExecution in #46.3)
- **Calls:** none (empty body — stub)
- **Inputs:** executionId (string)
- **Output:** void
- **Side effects:** none (stub — will set execution.heartbeatTimer in #46.3)
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (stub)

### `server/services/SwarmEngine.js` :: `SwarmEngine._onHandoff(executionId, sourceNodeId, event)` (stub)
- **Purpose:** Handle a handoff event from the HandoffParser. Currently broadcasts a handoff_started WS event. Full routing (spawn target agent, edge counter tracking, context merge) deferred to Task #46.3 / #62.
- **Called by:** SwarmEngine._spawnAgentPty tapFn (via HandoffParser.feed returning evt.type === 'handoff')
- **Calls:** this._wsBroadcast
- **Inputs:** executionId (string), sourceNodeId (string), event ({ type: 'handoff', targetId: string, contextUpdate: object })
- **Output:** Promise\<void\>
- **Side effects:** emits WS event `{ type: 'handoff_started', sourceNodeId, targetNodeId, edgeId: null, counter: 0 }`
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (stub — full routing in #46.3/#62)

### `server/services/SwarmEngine.js` :: `SwarmEngine._onDone(executionId, nodeId)` (stub)
- **Purpose:** Handle a done event from the HandoffParser. Marks the agent state as 'done' in agentStates Map, then broadcasts an execution_status WS event. Full completion logic (all-done check, execution status update) deferred to Task #62.3.
- **Called by:** SwarmEngine._spawnAgentPty tapFn (via HandoffParser.feed returning evt.type === 'done')
- **Calls:** this._wsBroadcast
- **Inputs:** executionId (string), nodeId (string)
- **Output:** void
- **Side effects:** mutates execution.agentStates.get(nodeId).status to 'done'; emits WS event `{ type: 'execution_status', status: 'agent_done', nodeId }`
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (stub — full completion in #62.3)

### `server/services/SwarmEngine.js` :: `SwarmEngine.stopExecution(executionId)`
- **Purpose:** Stop a running workflow execution. Clears heartbeat timer, removes all swarm tap listeners from their respective PTY sessions (before killing), kills all agent PTY sessions via SessionManager.killSession, marks status 'stopped', and deletes the execution record.
- **Called by:** (not yet wired to any route — future task)
- **Calls:** clearInterval, SessionManager.getSession, ptySession.swarmListeners.delete, SessionManager.killSession
- **Inputs:** executionId (string)
- **Output:** Promise\<void\>
- **Side effects:** removes tapFn from swarmListeners Sets; kills all PTY sessions; removes execution from this._executions
- **Complexity note (DEC-014):** tapFn removal happens BEFORE killSession — ensures the listener cannot fire on any final PTY output flushed during the kill sequence.
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (updated: added tapFn removal loop before kill loop)

### `server/services/SwarmEngine.js` :: `SwarmEngine.getStatus(executionId)`
- **Purpose:** Return a serializable snapshot of an execution's status, agentStates, edgeCounters, and budget.
- **Called by:** (not yet wired to any route — future task)
- **Calls:** Object.fromEntries
- **Inputs:** executionId (string)
- **Output:** `{ executionId, workflowId, status, agentStates: object, edgeCounters: object, budget: object }` | null if not found
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev

---

## Removed / Dead Functions
| Function | File | Removed in | Reason |
|----------|------|------------|--------|
| EntitiesView() | client/src/views/EntitiesView.jsx | Task #30 (2026-03-26) | DEAD CODE — no longer imported by App.jsx. Replaced by ContextEditorView + DeploymentManagerView. File still on disk. |
| AgentEditor(), AgentForm() | client/src/components/AgentEditor.jsx | Task #29 (2026-03-26) | DEAD CODE — not imported by any Phase 9 view. Agent editing is now inline in DeploymentManagerView::AgentDetail. File still on disk. |
| SkillEditor(), SkillForm() | client/src/components/SkillEditor.jsx | Task #29 (2026-03-26) | DEAD CODE — not imported by any Phase 9 view. Skill viewing is now inline in DeploymentManagerView Environment tab. File still on disk. |
| ClaudeMdEditor(), ClaudeMdPanel() | client/src/components/ClaudeMdEditor.jsx | Task #28 (2026-03-26) | DEAD CODE — not imported by any Phase 9 view. CLAUDE.md editing is now in ContextEditorView. File still on disk. |
| JobPanel(), StreamLog(), MarkdownResult(), AdvancedOptions() | client/src/components/JobPanel.jsx | Task #27 (2026-03-26) | DEAD CODE — not imported by Phase 9 JobView. Job UI is now inline in JobView.jsx. File still on disk. |
| StatusBadge(), old ConfirmDialog(), old formatDate() | client/src/views/ProjectsView.jsx (v1) | Task #25 (2026-03-26) | REPLACED — old internals replaced by new Phase 9 internals (ProjectCard, CardMenu, StatusDot, ListRow, AddCard, timeAgo). |
