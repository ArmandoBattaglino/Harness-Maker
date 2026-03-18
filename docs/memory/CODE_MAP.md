# CODE_MAP — Claude Code Visual Manager
_Last updated: 2026-03-18 — after Task #9: Job Mode API + Task #10: Job Mode UI + Task #11: Projects View UI by backend-dev + frontend-dev_

## Entry Points
- `server/index.js` — Express server bootstrap, binds to 127.0.0.1:PORT, WebSocket server
- `client/src/main.jsx` — React app entry point

## Module Index

### Server Modules
| File | Key Exports | Purpose |
|------|-------------|---------|
| server/index.js | (main) | Full bootstrap: binary discovery, config load, stale PID cleanup, middleware, routes, static SPA, error handler, 127.0.0.1 binding, SIGTERM/SIGINT |
| server/services/ConfigStore.js | ConfigStore | Manages %APPDATA%\ClaudeCodeManager\config.json — projects CRUD, settings, write-file-atomic |
| server/services/ProcessRegistry.js | ProcessRegistry | Tracks active PIDs in active_pids.json, cleanupStale() on startup |
| server/services/BinaryDiscovery.js | discoverClaudeBinary | 4-step Claude binary lookup: env var → PATH → %LOCALAPPDATA% → fatal error |
| server/services/FileManager.js | FileManager (class), fileManager (singleton) | Atomic file I/O with path-traversal protection for all entity writes |
| server/services/index.js | (barrel) | Re-exports ConfigStore, ProcessRegistry, discoverClaudeBinary |
| server/services/RingBuffer.js | RingBuffer | Fixed 100KB circular buffer for PTY output; push() with wrap-around, toBuffer() for replay |
| server/services/SessionManager.js | sessionManager (singleton) | Sole PTY owner: createSession, attachClient, detachClient, writeInput, resizePty, killSession, idle sweeper |
| server/utils/frontmatter.js | parseFrontmatter, serializeFrontmatter, filePathToId | YAML frontmatter parse/serialize; stable hex ID from file path |
| server/middleware/security.js | securityMiddleware | helmet + CSP (script-src: self, style-src: self+unsafe-inline) |
| server/middleware/csrf.js | csrfMiddleware | 403 on POST/PUT/PATCH/DELETE without X-Requested-With: ClaudeCodeManager |
| server/middleware/pathValidation.js | validateProjectPath, validateClaudePath, ApiError | Path traversal prevention, ApiError class |
| server/routes/projects.js | projectsRouter | GET/POST/DELETE /api/v1/projects — project CRUD, scaffold .claude/ on creation |
| server/routes/sessions.js | sessionsRouter | GET/POST/DELETE /api/v1/sessions — session CRUD |
| server/routes/agents.js | agentsRouter | GET/POST/PUT/DELETE /api/v1/agents — agent .md CRUD for user + project scope |
| server/routes/skills.js | skillsRouter | GET/POST/PUT/DELETE /api/v1/skills — skill CRUD (modern SKILL.md + legacy commands/*.md) |
| server/routes/claudemd.js | claudemdRouter | GET /api/v1/claudemd, PUT /user, PUT /project — CLAUDE.md read/write |
| server/services/JobRunner.js | JobRunner (class), jobRunner (singleton) | One-shot Claude job executor: spawns claude -p, streams JSON output line-by-line to SSE clients, cancelAll on shutdown |
| server/routes/jobs.js | jobsRouter | POST/GET/DELETE /api/v1/jobs, GET /api/v1/jobs/:id/stream (SSE) — job lifecycle REST + streaming |
| server/ws/terminalHandler.js | setupTerminalWebSocket | WebSocket handler: sessionId from URL query, attach/detach client, route input/resize messages |

### Client Modules
| File | Key Exports | Purpose |
|------|-------------|---------|
| client/src/App.jsx | default App | Root React component (stub) |
| client/src/main.jsx | (entry) | ReactDOM.createRoot bootstrap |
| client/src/store/AppContext.jsx | AppContext, useAppState | Global React context: activeProjectId, projects list |
| client/src/hooks/useApi.js | apiGet, apiPost, apiPut, apiDelete, apiDeleteWithBody | Fetch wrappers with CSRF header injection and error normalization |
| client/src/components/Sidebar.jsx | default Sidebar | Project list, navigation, AddProjectModal trigger |
| client/src/components/AddProjectModal.jsx | default AddProjectModal | Modal for adding new projects |
| client/src/views/TerminalView.jsx | default TerminalView | xterm.js terminal, WebSocket reconnect, ResizeObserver |
| client/src/views/EntitiesView.jsx | default EntitiesView | Tab container for Agents / Skills / CLAUDE.md tabs |
| client/src/components/AgentEditor.jsx | default AgentEditor, AgentForm (internal) | Agent list + create/edit/delete UI; calls /api/v1/agents |
| client/src/components/SkillEditor.jsx | default SkillEditor, SkillForm (internal) | Skill list + create/edit/delete UI; calls /api/v1/skills |
| client/src/components/ClaudeMdEditor.jsx | default ClaudeMdEditor, ClaudeMdPanel (internal) | Dual-panel CLAUDE.md editor (user + project); calls /api/v1/claudemd |
| client/src/hooks/useJob.js | default useJob | Custom hook: manages full job lifecycle (POST → SSE → result/cancel/reset), exposes status, streamEvents, result, error |
| client/src/components/JobPanel.jsx | default JobPanel, StreamLog, MarkdownResult, AdvancedOptions (internals) | Job Mode UI: prompt textarea, SSE stream log, react-markdown result, cancel/copy/reset actions |
| client/src/views/JobView.jsx | default JobView | View wrapper: reads activeProjectId from AppContext, renders JobPanel for selected project |
| client/src/views/ProjectsView.jsx | default ProjectsView, StatusBadge, ConfirmDialog, formatDate (internals) | Full project list table with session status, Open Terminal action, Register/Delete with confirmation modal |

## Build Artifacts
- `server/public/` — Vite build output (served as static files by Express)

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
- **Last modified:** 2026-03-18 in Task #7 by backend-dev

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

### `server/index.js` :: `startup()`
- **Purpose:** Full server bootstrap — binary discovery, config load, stale PID cleanup, Express setup, middleware, route mounting, WebSocket, HTTP bind.
- **Called by:** entry point (module level)
- **Calls:** discoverClaudeBinary, ConfigStore.load, ProcessRegistry.cleanupStale, securityMiddleware, csrfMiddleware, projectsRouter, sessionsRouter, agentsRouter, skillsRouter, claudemdRouter, jobsRouter, setupTerminalWebSocket
- **Inputs:** none (reads env: PORT, IDLE_TIMEOUT_MINUTES, CLAUDE_BINARY_PATH)
- **Output:** Promise\<void\>
- **Side effects:** HTTP server listening on 127.0.0.1:PORT, WebSocket server, SIGTERM/SIGINT handlers; sets jobRunner.claudeBin after binary discovery
- **Last modified:** 2026-03-18 in Task #9 by backend-dev (added jobsRouter mount, jobRunner.claudeBin assignment, jobRunner.cancelAll() in shutdown)

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
- **Purpose:** Validate request, look up project, call jobRunner.startJob. Returns 201 with jobId on success.
- **Called by:** client/src/hooks/useJob.js::startJob (via apiPost)
- **Calls:** ConfigStore.getProjects, jobRunner.startJob
- **Inputs:** body `{ projectId, prompt, allowedTools?, maxTurns? }`
- **Output:** 201 JSON `{ jobId, projectId, createdAt }` | 400/404/500 errors
- **Side effects:** spawns child process (via jobRunner.startJob)
- **Last modified:** 2026-03-18 in Task #9 by backend-dev

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

### `client/src/views/ProjectsView.jsx` :: `ProjectsView()`
- **Purpose:** Full projects management view. Loads project list on mount via GET /api/v1/projects, dispatches SET_PROJECTS to AppContext. Shows table with Name / Path / Status (StatusBadge) / Created / Actions columns. Actions: Open Terminal (SET_ACTIVE_PROJECT + SET_VIEW 'terminal'), Delete (shows ConfirmDialog). Refreshes after modal close.
- **Called by:** App.jsx (route/view rendering — when view === 'projects')
- **Calls:** apiGet (loadProjects), apiDelete (handleDeleteConfirm), useAppState, useAppDispatch, AddProjectModal, StatusBadge, ConfirmDialog
- **Inputs:** none (reads context)
- **Output:** JSX — header + project table + modals
- **Side effects:** HTTP GET on mount, HTTP DELETE on confirm; dispatches SET_PROJECTS, REMOVE_PROJECT, SET_ACTIVE_PROJECT, SET_VIEW to AppContext
- **Last modified:** 2026-03-18 in Task #11 by frontend-dev

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

## Previously Documented Modules (unchanged in Tasks #7-#8)

### `server/services/ConfigStore.js` :: `ConfigStore`
- See prior entries. Unchanged.

### `server/services/RingBuffer.js` :: `RingBuffer`
- See prior entries. Unchanged.

### `server/services/SessionManager.js` :: `sessionManager`
- See prior entries. Unchanged.

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
- react-markdown applied in `.markdown-result` CSS scope (index.css) for consistent Markdown typography

## Removed Functions
| Function | File | Removed in | Reason |
|----------|------|------------|--------|
| (none yet) | | | |
