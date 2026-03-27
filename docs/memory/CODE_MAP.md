# CODE_MAP — Claude Code Visual Manager
_Last updated: 2026-03-27 — after Task #60 (PromptToFlowBar.jsx + staggered animation) — mapped by code-mapper_

## Entry Points
- `server/index.js` — Express server bootstrap, binds to 127.0.0.1:PORT, WebSocket server
- `client/src/main.jsx` — React app entry point

## Module Index

### Server Modules
| File | Key Exports | Purpose |
|------|-------------|---------|
| server/index.js | (main) | Full bootstrap: binary discovery, config load, stale PID cleanup, middleware, routes (incl. /api/v1/swarm), static SPA, error handler, 127.0.0.1 binding, two noServer WSS instances (wssTerminal + wssSwarm) routed by pathname, SwarmEngine instantiated + stored in app.locals, sessionManager stored in app.locals, swarmEngine.setWsBroadcast(broadcast) wired at startup, SIGTERM/SIGINT, rate-limit stale sweep (BUG-07 fix). Last modified Task #47.1 + #48.1 + #48.2. |
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
| server/services/SwarmEngine.js | SwarmEngine (class), default SwarmEngine | V3 swarm orchestrator — spawns agent PTY sessions, registers HandoffParser swarmListeners taps, routes handoff/done events, tracks per-node agent state and budget; in-memory only (never persisted) (Tasks #46, #46.3, DEC-014) |
| server/services/CircuitBreaker.js | CircuitBreaker (class), default CircuitBreaker | Advisory circuit breaker for handoff loops — check(edgeId, counter, threshold) returns boolean; never stops execution, caller emits WS advisory (FR-V3-17, Task #49) |
| server/services/BudgetTracker.js | BudgetTracker (class), default BudgetTracker | Soft budget tracker — accumulates char counts per session, estimates tokens (÷4), provides checkBudget advisory signal; never stops execution (FR-V3-18, Task #49) |
| server/routes/swarm.js | swarmRoutes (factory fn), generateWorkflowFromPrompt (module-private) | 7-endpoint REST API for swarm execution control: start, pause, resume, stop, status, agent output, broadcast. POST /scaffold fully implemented using @anthropic-ai/sdk (claude-haiku-4-5-20251001). Factory pattern: accepts swarmEngine + sessionManager at construction. (Tasks #47.1 + #59) |
| server/ws/swarmHandler.js | handleSwarmConnection (default), getSubscribers, broadcast | WebSocket connection handler for /ws/swarm path. Module-level _subscribers Map keyed by executionId → Set\<WebSocket\>. Sends initial execution_status snapshot on connect. broadcast() fans out JSON events to all OPEN connections for an executionId. (Tasks #48.1, #48.2) |
| server/utils/ssrfGuard.js | isSafeUrl | Synchronous SSRF prevention guard — rejects private/loopback IP literals and localhost in URLs before any outbound server fetch. Covers IPv4, IPv6 loopback, IPv4-mapped IPv6, link-local. Does NOT perform DNS lookup (sync-only design). (SEC-V3-03, Task #50) |
| server/middleware/webhookLimit.js | webhookLimit (default) | Express JSON body-parser capped at 32 KB. Apply before any route that ingests untrusted webhook payloads. Awaiting use in routes/triggers.js (Task #75). (SEC-V3-01, Task #50) |
| server/middleware/webhookRateLimit.js | webhookRateLimit (default) | Express middleware: 10 requests/minute/IP rate limiter for webhook endpoints. In-memory Map with periodic stale-entry sweep (mirrors server/index.js pattern). Returns HTTP 429 on excess. Awaiting use in routes/triggers.js (Task #75). (SEC-V3-04, Task #50) |
| server/middleware/hitlValidation.js | validateResumeText | Express middleware: rejects resumeText body field exceeding 8 KB (8192 chars) with HTTP 400. Awaiting use in routes/inbox.js (Task #68). (SEC-V3-05, Task #50) |
| server/tests/security-v3.test.js | (test suite) | 36-test Vitest suite covering SEC-V3-03 (isSafeUrl — 18 cases), SEC-V3-02+06 (WorkflowStore schema validation — 9 cases), SEC-V3-07 (HandoffParser oversized payload — 3 cases), SEC-V3-05 (validateResumeText — 5 cases). (Task #50) |

### Client Modules
| File | Key Exports | Purpose |
|------|-------------|---------|
| client/src/App.jsx | default App, MainContent (internal), AppLayout (internal) | Root React component: AppProvider wrapper, flex layout with Sidebar + MainContent view router (6 views: projects/terminal/jobs/context/deployments/swarm). Phase 9 rewrite Task #30; swarm case added Task #58. |
| client/src/main.jsx | (entry) | ReactDOM.createRoot bootstrap |
| client/src/store/AppContext.jsx | AppContext, useAppState | Global React context: activeProjectId, projects list |
| client/src/hooks/useApi.js | apiGet, apiPost, apiPut, apiDelete, apiDeleteWithBody | Fetch wrappers with CSRF header injection and error normalization |
| client/src/hooks/useWorkflow.js | useWorkflow (named), useWorkflowList (named) | CRUD React hooks for workflow definitions: useWorkflow(id) — fetch/update/remove single workflow; useWorkflowList() — fetch all + create. Both use apiGet/apiPost/apiPut/apiDelete from useApi.js. (Task #61) |
| client/src/hooks/useSession.js | useSession | WebSocket hook for PTY terminal: manages WS lifecycle, reconnect logic, send+resize callbacks |
| client/src/components/Sidebar.jsx | default Sidebar, SidebarHeader, NavItem, SessionItem, SidebarFooter (internals) | Phase 9 redesign: imports NAV_ITEMS from constants.js, 6-view navigation (swarm added Task #58), Active PTY Sessions list, New Local Session button, AddProjectModal trigger. Task #24 rewrite. |
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
| client/src/lib/constants.js | NAV_ITEMS, STATUS_COLORS | Shared UI constants: sidebar navigation items (icon/label/view — 6 items including swarm added Task #58), status-to-Tailwind-class mapping for badges (Phase 9 design tokens) |
| client/src/views/ProjectsView.jsx | default ProjectsView, ConfirmDialog, CardMenu, StatusDot, ProjectCard, AddCard, ListRow (internals) | Phase 9 Project Dashboard: grid/list dual-view, search with "/" keyboard shortcut, project cards with status dots, delete confirmation modal, scaffold CTA banner. Task #25 rewrite. |
| client/src/store/SwarmContext.jsx | useSwarmStore (default + named) | Zustand v4 store for V3 swarm execution state. Holds agentStates, edgeCounters, budget, inboxItems, interAgentFeed, departmentStack breadcrumb, selectedNodeId, wsConnected. Isolated from AppContext — no cross-imports. (Task #52) |
| client/src/canvas/nodes/AgentNode.jsx | default AgentNode | React Flow custom node type="agent". Subscribes to useSwarmStore(agentStates[id]). 5 status colors (idle/running/done/paused/error), target Handle top + source Handle bottom, lastOutputSnippet display (last 3 lines), handoffCount badge. (Task #53.1) |
| client/src/canvas/nodes/DepartmentNode.jsx | default DepartmentNode | React Flow group container node type="department". Subscribes to focusedDepartmentId + setFocusedDepartment from useSwarmStore. Click on header calls setFocusedDepartment(id). Sized by React Flow to contain child nodes. (Task #53.2) |
| client/src/canvas/nodes/TriggerNode.jsx | default TriggerNode | React Flow source-only node type="trigger". webhook/rss icon variants (triggerIcons map), purple theme, source Handle bottom only. Full implementation deferred to Task #76. (Task #53.3) |
| client/src/canvas/edges/HandoffEdge.jsx | default HandoffEdge | React Flow custom edge type="handoff". Animated dashed blue line when edgeCounters[id] > 0; grey static line when idle. Counter badge via EdgeLabelRenderer. (Task #54) |
| client/src/canvas/AgentInspector.jsx | default AgentInspector | Right-panel component for inspecting a selected canvas node. Reads selectedNodeId + agentStates from useSwarmStore. Shows label, type, status, handoffCount, systemPrompt, lastOutputSnippet. Close button calls setSelectedNode(null). (Task #55) |
| client/src/canvas/BreadcrumbBar.jsx | default BreadcrumbBar | Top-bar breadcrumb nav for drill-down into department nodes. Reads departmentStack + navigateBreadcrumb from useSwarmStore. Root crumb always visible; each depth level rendered as a clickable button. (Task #56) |
| client/src/canvas/SwarmCanvas.jsx | default SwarmCanvas | Root React Flow canvas for swarm visualization. Registers nodeTypes (agent, department, trigger) + edgeTypes (handoff). Manages nodes/edges state via useNodesState/useEdgesState. Drill-down filtering: computes visibleNodes/visibleEdges via focusedDepartmentId. onNodeClick→setSelectedNode; onPaneClick→setSelectedNode(null). Mounts BreadcrumbBar + AgentInspector. (Task #57.1) |
| client/src/canvas/PromptToFlowBar.jsx | default PromptToFlowBar | Natural-language prompt input bar. POSTs to /api/v1/swarm/scaffold, applies per-node staggered fadeIn animation to returned workflowDef, calls onWorkflowGenerated(workflowId, animatedDef) on success. (Task #60) |
| client/src/views/SwarmView.jsx | default SwarmView | Layout shell for the Swarm Orchestrator page. Toolbar shows title + executionStatus indicator + conditional Reset button. Mounts PromptToFlowBar (Task #60); workflowDef local state wired to onWorkflowGenerated → setWorkflowDef → SwarmCanvas prop. (Tasks #57.2, #60) |

### Client Config & Styles
| File | Key Exports | Purpose |
|------|-------------|---------|
| client/package.json | (config) | Client dependencies — now includes @xyflow/react@12.10.1 (React Flow v12 graph canvas) and zustand@4.5.7 (v4, not v5) alongside react@18.2, react-markdown, xterm, xterm-addon-fit. (Task #51) |
| client/tailwind.config.js | default config | Tailwind CSS config: Phase 9 design tokens — 20+ color tokens (primary #933df5, surface scale, semantic colors, code syntax), font families (Inter/Geist/JetBrains Mono), border radius scale. darkMode: 'class'. |
| client/index.html | (HTML entry) | SPA entry point: Google Fonts CDN links (Inter, JetBrains Mono, Material Symbols Outlined), dark class on html element. Last modified Task #23 (font imports added). |
| client/src/index.css | (global styles) | Base body styles (#000 bg, Inter font), utility classes (.glass-effect, .custom-scrollbar, .active-indicator, .terminal-text, .filled-icon, .terminal-line-border), .markdown-result scoped styles (headings, code, tables, blockquotes — purple theme), .md-* syntax highlighting helpers, @keyframes dashdraw (animated SVG dash offset for HandoffEdge), @keyframes fadeIn (opacity 0→1 for PromptToFlowBar staggered node entrance). Last modified Task #60 (@keyframes fadeIn added). |
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
| server/tests/security-v3.test.js | Vitest | server/utils/ssrfGuard.js, server/services/WorkflowStore.js, server/services/HandoffParser.js, server/middleware/hitlValidation.js | 36 |

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
- **Purpose:** Array of sidebar navigation items. Each object: `{ icon: string (Material Symbols name), label: string (display text), view: string (AppContext view identifier) }`. Defines 6 Phase 9 views: projects, terminal, jobs, deployments, context, swarm.
- **Called by:** Sidebar.jsx (imports and maps over array to render nav buttons — live since Task #24); App.jsx::MainContent switch case keys match these view strings.
- **Calls:** none (static data)
- **Inputs:** N/A (constant)
- **Output:** Array of 6 nav item objects
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #58 by frontend-dev (swarm item `{ icon: 'hub', label: 'Swarm', view: 'swarm' }` appended; previously 5 items since Task #23)

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
- Swarm REST API (Task #47.1): POST /api/v1/swarm/:workflowId/start → 201; POST /:id/pause (Ctrl-C to all running agents); POST /:id/resume (no-op stub); DELETE /:id (stopExecution); GET /:id/status; GET /:id/agent/:nodeId/output (ring buffer); POST /:id/broadcast (soft=ESC marker, hard=Ctrl-C+text fire-and-forget); POST /:id/scaffold (501 stub — Task #59)
- Swarm WS channel (Tasks #48.1 + #48.2): server.on('upgrade') routes /ws/swarm* to wssSwarm, all other paths to wssTerminal; handleSwarmConnection registers ws in module-level _subscribers Map keyed by executionId; sends execution_status snapshot on connect; empty Sets are eagerly deleted; getSubscribers() is called by broadcast(); broadcast() fans out JSON events to all OPEN connections for a given executionId; swarmEngine.setWsBroadcast(broadcast) called at startup in server/index.js so all SwarmEngine WS emissions go through the handler
- SwarmEngine + sessionManager stored in app.locals (Task #48.1); swarmRoutes factory accesses them via app.locals at mount time
- Test suite: 8 files, 168 tests total (132 + 36 new security-v3 tests), all passing. Runner: Vitest v4.1.0 with `pool: 'forks'` (sequential) to prevent PTY cross-test interference
- SSRF guard (SEC-V3-03): isSafeUrl() in server/utils/ssrfGuard.js — synchronous hostname check, covers IPv4/IPv6/IPv4-mapped/localhost; called by TriggerManager.js RSS polling (Task #75, not yet wired)
- Webhook body cap (SEC-V3-01): webhookLimit middleware (32 KB) in server/middleware/webhookLimit.js — for routes/triggers.js (Task #75, not yet wired)
- Webhook rate limit (SEC-V3-04): webhookRateLimit middleware (10/min/IP) in server/middleware/webhookRateLimit.js — for routes/triggers.js (Task #75, not yet wired)
- HITL payload cap (SEC-V3-05): validateResumeText middleware (8 KB) in server/middleware/hitlValidation.js — for routes/inbox.js (Task #68, not yet wired)
- SEC-V3-02+06: WorkflowStore already had correct schema validation (name max 100 chars, invalid chars, description max 500 chars, nodes max 50, systemPrompt max 16 KB) — confirmed by security-v3 tests; no changes required
- SEC-V3-07: HandoffParser already had correct oversized payload handling (4 KB buffer cap, contextUpdate validation: max 50 keys, string values max 1024 chars) — confirmed by security-v3 tests; no changes required
- Client dependencies updated (Task #51): @xyflow/react@12.10.1 (React Flow v12 canvas for workflow graph editor) and zustand@4.5.7 (v4, not v5 — v4 API used) added to client/package.json. Build: 299 modules, 0 errors.
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
- **Called by:** server/index.js::startup() — `swarmEngine.setWsBroadcast(broadcast)` called immediately after SwarmEngine is instantiated (Task #48.2)
- **Calls:** none (assignment only)
- **Inputs:** fn (Function — (executionId: string, event: object) => void)
- **Output:** void
- **Side effects:** sets this._wsBroadcast
- **Last modified:** 2026-03-27 in Task #48.2 by backend-dev (caller updated — was "future task", now wired from server/index.js)

### `server/services/SwarmEngine.js` :: `SwarmEngine.startExecution(workflowId, projectId, projectPath)`
- **Purpose:** Start a new workflow execution. Loads workflow definition from WorkflowStore, creates an in-memory WorkflowExecution record, identifies the triage node (first node with isTriageNode===true or fallback to nodes[0]), spawns a PTY session for that node, then starts the heartbeat timer.
- **Called by:** server/routes/swarm.js POST /:workflowId/start handler (Task #47.1)
- **Calls:** WorkflowStore.get, uuidv4, SwarmEngine._spawnAgentPty, SwarmEngine._startHeartbeat
- **Inputs:** workflowId (string), projectId (string), projectPath (string)
- **Output:** Promise\<string\> — executionId (UUID)
- **Side effects:** creates execution record in this._executions; spawns PTY session; starts heartbeat timer; emits WS agent_status event via _spawnAgentPty
- **Complexity note:** The execution record is stored in _executions BEFORE _spawnAgentPty is called, so _spawnAgentPty can look it up during its own execution. Order matters.
- **Last modified:** 2026-03-27 in Task #46.3 by backend-dev (added _startHeartbeat call)

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

### `server/services/SwarmEngine.js` :: `SwarmEngine._buildSystemPrompt(node, workflowContext, handoffTargets)`
- **Purpose:** Assemble the full system prompt for an agent node per OpenAI Swarm pattern. Sections: (1) node.data.systemPrompt, (2) SWARM PROTOCOL header, (3) workflowContext key/value pairs (omitted if empty), (4) handoff target instructions with __HANDOFF__:<targetId>:<b64json> format (omitted if no targets), (5) __DONE__ instruction, (6) constraint: token only as very last line.
- **Called by:** SwarmEngine._spawnAgentPty
- **Calls:** Object.keys (workflowContext), Array.join (handoffTargets)
- **Inputs:** node (workflow node object — reads node.data.systemPrompt), workflowContext (object — flat dict of shared context), handoffTargets (string[] — valid target node IDs from outgoing edges)
- **Output:** string — fully assembled system prompt (multi-line, joined with \n)
- **Side effects:** none
- **Complexity note:** Context section is conditionally omitted when workflowContext has zero keys. Handoff instruction block (with target IDs, b64json context update format, and 50-key/1024-char limits) is only included when handoffTargets.length > 0; otherwise only __DONE__ instruction is emitted.
- **Last modified:** 2026-03-27 in Task #46.3 by backend-dev (was stub in #46.2)

### `server/services/SwarmEngine.js` :: `SwarmEngine._startHeartbeat(executionId)`
- **Purpose:** Start a 5-minute setInterval that writes empty string to every running agent PTY session, preventing the SessionManager idle sweeper from killing them during an active workflow. Stores the timer handle on execution.heartbeatTimer. Calls timer.unref() so Node.js can exit cleanly if no other work is pending.
- **Called by:** SwarmEngine.startExecution (called immediately after triage agent PTY is spawned)
- **Calls:** setInterval, SessionManager.writeInput (every 5 min, per running agent), timer.unref
- **Inputs:** executionId (string)
- **Output:** void
- **Side effects:** sets execution.heartbeatTimer (NodeJS.Timer); periodic writeInput calls to all running PTY sessions every 300,000ms; timer is unref'd so it does not block process exit
- **Complexity note:** The interval iterates execution.agentStates and filters for status === 'running'. It re-fetches the execution each tick via _executions.get(executionId) and exits early if the execution has been removed (e.g., stopExecution cleared it). stopExecution calls clearInterval(execution.heartbeatTimer) to cancel.
- **Last modified:** 2026-03-27 in Task #46.3 by backend-dev (was stub in #46.2)

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
- **Called by:** server/routes/swarm.js DELETE /:executionId handler (Task #47.1)
- **Calls:** clearInterval, SessionManager.getSession, ptySession.swarmListeners.delete, SessionManager.killSession
- **Inputs:** executionId (string)
- **Output:** Promise\<void\>
- **Side effects:** removes tapFn from swarmListeners Sets; kills all PTY sessions; removes execution from this._executions
- **Complexity note (DEC-014):** tapFn removal happens BEFORE killSession — ensures the listener cannot fire on any final PTY output flushed during the kill sequence.
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (updated: added tapFn removal loop before kill loop)

### `server/services/SwarmEngine.js` :: `SwarmEngine.getStatus(executionId)`
- **Purpose:** Return a serializable snapshot of an execution's status, agentStates, edgeCounters, and budget.
- **Called by:** server/routes/swarm.js (pause, resume, status, agent-output, broadcast handlers), server/ws/swarmHandler.js::handleSwarmConnection (initial status on WS connect)
- **Calls:** Object.fromEntries
- **Inputs:** executionId (string)
- **Output:** `{ executionId, workflowId, status, agentStates: object, edgeCounters: object, budget: object }` | null if not found
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #46.2 by backend-dev (updated callers: Task #47.1 + #48.1)

---

### `server/services/CircuitBreaker.js` :: `CircuitBreaker.check(edgeId, counter, threshold)`
- **Purpose:** Advisory check — returns true if the handoff counter for a given edge has reached or exceeded the threshold. Does NOT stop execution; the caller is responsible for emitting a WS advisory event.
- **Called by:** (not yet wired — will be called from SwarmEngine handoff routing logic in a future task; FR-V3-17)
- **Calls:** none (single comparison — pure function)
- **Inputs:** edgeId (string — edge identifier, not currently used in check logic but included for future per-edge state), counter (number — current handoff count for this edge), threshold (number — default 10)
- **Output:** boolean — true if counter >= threshold
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

---

### `server/services/BudgetTracker.js` :: `BudgetTracker.estimate(charCount)`
- **Purpose:** Convert a raw character count to a rough token estimate using the heuristic 1 token ≈ 4 chars.
- **Called by:** BudgetTracker.getTotal
- **Calls:** Math.ceil
- **Inputs:** charCount (number)
- **Output:** number — estimated token count (Math.ceil(charCount / 4))
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

### `server/services/BudgetTracker.js` :: `BudgetTracker.track(sessionId, outputChunk)`
- **Purpose:** Accumulate character count for a session. Adds outputChunk.length to the running total stored in _sessionChars Map.
- **Called by:** SwarmEngine._spawnAgentPty tapFn (called on every PTY output chunk if this._budgetTracker is set)
- **Calls:** Map.get, Map.set
- **Inputs:** sessionId (string), outputChunk (string — raw PTY output chunk)
- **Output:** void
- **Side effects:** mutates this._sessionChars Map
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

### `server/services/BudgetTracker.js` :: `BudgetTracker.registerSession(executionId, sessionId)`
- **Purpose:** Associate a sessionId with an executionId so getTotal can sum across all sessions in an execution.
- **Called by:** (not yet wired — should be called from SwarmEngine._spawnAgentPty when _budgetTracker is set; future task)
- **Calls:** Map.has, Map.set, Set.add
- **Inputs:** executionId (string), sessionId (string)
- **Output:** void
- **Side effects:** mutates this._executionSessions Map
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

### `server/services/BudgetTracker.js` :: `BudgetTracker.getTotal(executionId)`
- **Purpose:** Sum character counts for all sessions belonging to an execution and convert to estimated tokens.
- **Called by:** BudgetTracker.checkBudget
- **Calls:** BudgetTracker.estimate, Map.get, Set iteration
- **Inputs:** executionId (string)
- **Output:** number — estimated total token count across all sessions in this execution
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

### `server/services/BudgetTracker.js` :: `BudgetTracker.checkBudget(executionId, limitTokens)`
- **Purpose:** Advisory check — returns whether estimated token usage has reached or exceeded the limit. Does NOT stop execution; caller (SwarmEngine tapFn) emits a budget_update WS event.
- **Called by:** SwarmEngine._spawnAgentPty tapFn (if this._budgetTracker is set and workflow has budgetTokens limit > 0)
- **Calls:** BudgetTracker.getTotal
- **Inputs:** executionId (string), limitTokens (number)
- **Output:** `{ exceeded: boolean, estimatedUsed: number }`
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

### `server/services/BudgetTracker.js` :: `BudgetTracker.clearExecution(executionId)`
- **Purpose:** Remove all tracking data for an execution and its sessions. Called on stopExecution to prevent memory leaks.
- **Called by:** (not yet wired to SwarmEngine.stopExecution — future task)
- **Calls:** Map.delete, Set iteration
- **Inputs:** executionId (string)
- **Output:** void
- **Side effects:** mutates this._sessionChars (removes entries for each session) and this._executionSessions (removes execution entry)
- **Last modified:** 2026-03-27 in Task #49 by backend-dev

---

---

## Swarm REST API (Task #47.1)

### `server/routes/swarm.js` :: `swarmRoutes(swarmEngine, sessionManager)`
- **Purpose:** Factory function — creates and returns an Express Router with all 7 swarm execution control endpoints (+ 1 stub). Accepts live swarmEngine and sessionManager instances at creation time so handlers close over them.
- **Called by:** server/index.js startup() (line: `app.use('/api/v1/swarm', swarmRoutes(app.locals.swarmEngine, app.locals.sessionManager))`)
- **Calls:** Router() (express), SwarmEngine.startExecution, SwarmEngine.getStatus, SwarmEngine.stopExecution, SessionManager.writeInput, SessionManager.getSession
- **Inputs:** swarmEngine (SwarmEngine instance), sessionManager (SessionManager singleton)
- **Output:** Express Router instance
- **Side effects:** none (factory — side effects happen per-request)
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `POST /:workflowId/start`
- **Purpose:** Start a new workflow execution. Validates projectId (non-empty string) and projectPath (non-empty string). Calls swarmEngine.startExecution. Returns 201 { executionId, status: 'running' }. Returns 400 on missing params, 404 if workflow not found ('Workflow not found' error from SwarmEngine).
- **Called by:** (external REST clients — UI or test harness; no client-side caller yet as of Task #47.1)
- **Calls:** swarmEngine.startExecution
- **Inputs:** params.workflowId (string), body.projectId (string), body.projectPath (string)
- **Output:** 201 `{ executionId, status: 'running' }` | 400/404/500
- **Side effects:** spawns agent PTY sessions via SwarmEngine.startExecution
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `POST /:executionId/pause`
- **Purpose:** Pause a running execution by sending Ctrl-C (\x03) to every agent session whose agentState.status === 'running'. Best-effort — no acknowledgment from agents. Full HITL freeze deferred to Task #70.
- **Called by:** (external REST clients)
- **Calls:** swarmEngine.getStatus, sessionManager.writeInput
- **Inputs:** params.executionId (string)
- **Output:** 200 `{ ok: true }` | 404/500
- **Side effects:** sends \x03 (Ctrl-C) to all running agent PTY stdinss
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `POST /:executionId/resume`
- **Purpose:** No-op endpoint stub. Returns 200 { ok: true } if execution exists, 404 if not. Full HITL unfreeze deferred to Task #70.
- **Called by:** (external REST clients)
- **Calls:** swarmEngine.getStatus
- **Inputs:** params.executionId (string)
- **Output:** 200 `{ ok: true }` | 404/500
- **Side effects:** none (no-op for now)
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `DELETE /:executionId`
- **Purpose:** Stop (terminate) a running execution. Delegates entirely to swarmEngine.stopExecution. Returns 204 on success (including if executionId was not found — stopExecution is a no-op for unknown IDs).
- **Called by:** (external REST clients)
- **Calls:** swarmEngine.stopExecution
- **Inputs:** params.executionId (string)
- **Output:** 204 | 500
- **Side effects:** kills all agent PTY sessions, clears heartbeat timer, removes execution record (via SwarmEngine.stopExecution)
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `GET /:executionId/status`
- **Purpose:** Return a status snapshot for a running execution. 404 if execution not found.
- **Called by:** (external REST clients)
- **Calls:** swarmEngine.getStatus
- **Inputs:** params.executionId (string)
- **Output:** 200 `{ executionId, status, agentStates, edgeCounters, budget }` | 404/500
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `GET /:executionId/agent/:nodeId/output`
- **Purpose:** Return the full ring buffer contents for a specific agent's PTY session. Resolves execution → agentState → sessionId → session.buffer. Returns 404 at each lookup step if not found.
- **Called by:** (external REST clients)
- **Calls:** swarmEngine.getStatus, sessionManager.getSession
- **Inputs:** params.executionId (string), params.nodeId (string)
- **Output:** 200 `{ output: string }` | 404/500
- **Side effects:** none (buffer read is non-destructive)
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `POST /:executionId/broadcast`
- **Purpose:** Send a text message to running agent sessions, filtered by scope. Scope 'all' or omitted targets all running agents; a specific nodeId targets exactly that node. Soft mode: text + ESC + newline. Hard mode: Ctrl-C → 300ms → text + ESC → 100ms → newline (fire-and-forget via setTimeout). Returns { sent: N } with count of targeted sessions.
- **Called by:** (external REST clients)
- **Calls:** swarmEngine.getStatus, sessionManager.writeInput, setTimeout (hard mode only)
- **Inputs:** params.executionId (string), body.text (string), body.scope ('all' | nodeId | undefined), body.mode ('soft' | 'hard', default 'soft')
- **Output:** 200 `{ sent: number }` | 400/404/500
- **Side effects:** writes to PTY stdin of targeted agent sessions; hard mode uses fire-and-forget setTimeout (no await)
- **Complexity note:** Hard mode timing uses two nested setTimeouts (300ms outer, 100ms inner) — these are not awaited, meaning the response returns before the second and third writes are sent. This is intentional (interrupt-and-redirect pattern).
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

### `server/routes/swarm.js` :: `POST /:workflowId/scaffold` (stub)
- **Purpose:** Stub endpoint — returns 501 Not Implemented. Full implementation deferred to Task #59.
- **Called by:** (external REST clients — not yet implemented)
- **Calls:** none
- **Inputs:** params.workflowId (string)
- **Output:** 501 `{ error: 'Not implemented — scaffold endpoint coming in Task #59' }`
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #47.1 by backend-dev

---

## Swarm WebSocket Handler (Task #48.1)

### `server/ws/swarmHandler.js` :: `handleSwarmConnection(ws, req, swarmEngine)` (default export)
- **Purpose:** Handle an incoming WebSocket connection on the /ws/swarm path. Parses executionId from URL query string; closes connection with error if missing. Adds ws to module-level _subscribers Set for the executionId. Registers close and error handlers that remove ws from the Set (and clean up empty Sets). Sends initial execution_status snapshot if execution exists, or an error message if not.
- **Called by:** server/index.js wssSwarm.on('connection') handler
- **Calls:** URL (browser API), getSubscribers, _subscribers.set/get/add/delete, ws.send, ws.close, swarmEngine.getStatus, JSON.stringify
- **Inputs:** ws (WebSocket), req (IncomingMessage), swarmEngine (SwarmEngine instance)
- **Output:** void
- **Side effects:** adds ws to _subscribers Map; on close/error removes ws and cleans up empty Set; sends initial JSON message to ws
- **Complexity note:** Empty Set is eagerly deleted from _subscribers to prevent memory accumulation across many short-lived connections. Sets are only stored while at least one subscriber exists for an executionId.
- **Last modified:** 2026-03-27 in Task #48.1 by backend-dev

### `server/ws/swarmHandler.js` :: `getSubscribers(executionId)` (named export)
- **Purpose:** Return the current subscriber Set for a given executionId. Returns an empty Set (transient, not stored) if no subscribers exist. Used by broadcast() to fan out WS events.
- **Called by:** server/ws/swarmHandler.js::broadcast (Task #48.2)
- **Calls:** _subscribers.get, Set constructor (empty fallback)
- **Inputs:** executionId (string)
- **Output:** Set\<WebSocket\>
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #48.1 by backend-dev

### `server/ws/swarmHandler.js` :: `broadcast(executionId, event)` (named export)
- **Purpose:** Send a JSON-serialized event to all open WebSocket connections subscribed to a given executionId. Connections whose readyState is not OPEN (1) are skipped silently — no error is thrown for closed or closing sockets.
- **Called by:** server/services/SwarmEngine.js — all methods that call this._wsBroadcast (wired via swarmEngine.setWsBroadcast(broadcast) in server/index.js::startup())
- **Calls:** getSubscribers, JSON.stringify, ws.send (per subscriber)
- **Inputs:** executionId (string), event (object — must be JSON-serializable)
- **Output:** void
- **Side effects:** sends WebSocket messages to all OPEN subscribers; non-OPEN connections silently skipped
- **Complexity note:** readyState === 1 check (WebSocket.OPEN) is used because the `ws` library does not export the WebSocket constant in ESM context without an import. The literal 1 is correct and stable per RFC 6455.
- **Last modified:** 2026-03-27 in Task #48.2 by backend-dev

### `server/ws/swarmHandler.js` :: `_subscribers` (module-level Map)
- **Purpose:** Module-level registry of active WebSocket subscribers per execution. Key: executionId (string) → Value: Set\<WebSocket\>. Entries are created on first connection for an executionId and deleted when the last subscriber disconnects. Never persisted.
- **Called by:** handleSwarmConnection (mutates), getSubscribers (reads)
- **Calls:** N/A (data structure)
- **Inputs:** N/A
- **Output:** N/A
- **Side effects:** mutated by handleSwarmConnection on connect/disconnect
- **Last modified:** 2026-03-27 in Task #48.1 by backend-dev

---

---

## V3 Security Layer (Task #50)

### `server/utils/ssrfGuard.js` :: `isSafeUrl(urlString)`
- **Purpose:** Synchronous SSRF prevention — returns true if the URL string is safe to fetch from the server (not a private/loopback/link-local address), false otherwise. Designed for RSS polling in TriggerManager.js. Operates on the hostname string only; no DNS resolution (intentional — keeps guard synchronous and side-effect free).
- **Called by:** server/tests/security-v3.test.js (test suite); future: TriggerManager.js RSS polling (Task #75)
- **Calls:** URL (built-in), `_isIPv4`, `_isPublicIPv4` (private helpers)
- **Inputs:** urlString (string)
- **Output:** boolean — true = safe to fetch, false = blocked
- **Side effects:** none
- **Complexity note:** Covers four address families: (1) pure IPv4 via `_isIPv4` + `_isPublicIPv4`, (2) IPv6 loopback (::1), (3) IPv4-mapped IPv6 in dotted form (::ffff:x.x.x.x), (4) IPv4-mapped IPv6 in hex word form (::ffff:xxxx:xxxx — the form Node.js normalizes to). Hostname "localhost" rejected by case-insensitive string match. Empty hostname rejected. Unparseable URLs rejected via try/catch on URL constructor. Non-IP hostnames (domains) are allowed — no DNS lookup performed.
- **Last modified:** 2026-03-27 in Task #50 by security (new file — SEC-V3-03)

### `server/utils/ssrfGuard.js` :: `_isIPv4(host)` (private)
- **Purpose:** Check if the string matches bare IPv4 dotted-decimal format.
- **Called by:** isSafeUrl
- **Calls:** RegExp.test
- **Inputs:** host (string)
- **Output:** boolean
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #50 by security

### `server/utils/ssrfGuard.js` :: `_isPublicIPv4(ip)` (private)
- **Purpose:** Return true if the IPv4 address is publicly routable — blocks: 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16. Returns false for malformed inputs.
- **Called by:** isSafeUrl (for pure IPv4 and IPv4-mapped IPv6 paths)
- **Calls:** String.split, Array.map(Number), Array.some
- **Inputs:** ip (string — dotted IPv4)
- **Output:** boolean
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #50 by security

---

### `server/middleware/webhookLimit.js` :: `webhookLimit` (default export)
- **Purpose:** Express JSON body-parser middleware capped at 32 KB. Apply before any route handler that receives untrusted webhook payloads. Prevents memory exhaustion via oversized payloads from external callers.
- **Called by:** future: server/routes/triggers.js webhook ingestion handler (Task #75). Currently imported only by tests.
- **Calls:** express.json({ limit: '32kb' }) (Express built-in)
- **Inputs:** Express (req, res, next) — standard middleware signature
- **Output:** calls next() or rejects with 413 Entity Too Large
- **Side effects:** may reject request with 413
- **Last modified:** 2026-03-27 in Task #50 by security (new file — SEC-V3-01)

---

### `server/middleware/webhookRateLimit.js` :: `webhookRateLimit(req, res, next)` (default export)
- **Purpose:** Express middleware limiting webhook endpoints to 10 requests per minute per IP (stricter than the global 200 req/min cap in server/index.js). Uses an in-memory Map with a periodic stale-entry sweep (mirrors server/index.js pattern, timer is unref'd for clean process exit). Returns HTTP 429 on excess.
- **Called by:** future: server/routes/triggers.js webhook ingestion handler (Task #75). Currently imported only by tests.
- **Calls:** Map.get/set/delete, Date.now, res.status(429).json, next
- **Inputs:** Express (req, res, next)
- **Output:** calls next() within limit, or returns 429 JSON error
- **Side effects:** mutates module-level `_webhookRateLimitMap`; module-load side effect: starts a setInterval sweep (unref'd)
- **Complexity note:** The `_sweepInterval` runs as soon as the module is imported. `_sweepInterval.unref()` prevents it from blocking process exit. Pattern mirrors the stale-sweep in server/index.js::startup().
- **Last modified:** 2026-03-27 in Task #50 by security (new file — SEC-V3-04)

---

### `server/middleware/hitlValidation.js` :: `validateResumeText(req, res, next)` (named export)
- **Purpose:** Express middleware that rejects requests where `req.body.resumeText` exceeds 8 KB (8192 chars). Returns HTTP 400 with `{ error: 'resumeText exceeds 8KB limit' }`. Calls next() if field is absent or within limit. Prevents large payload injection into running PTY sessions via the HITL approve/resume endpoint.
- **Called by:** future: server/routes/inbox.js POST /resume/:id handler (Task #68). Currently imported only by tests.
- **Calls:** res.status(400).json, next
- **Inputs:** Express (req, res, next)
- **Output:** calls next() or returns 400 JSON error
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #50 by security (new file — SEC-V3-05)

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

---

## SwarmContext ExecutionStore (Task #52)

### `client/src/store/SwarmContext.jsx` :: `useSwarmStore` (Zustand store — default + named export)
- **Purpose:** Zustand v4 global store for all V3 swarm execution state. Central source of truth for the canvas and inspector panels. Holds runtime-only state — never persisted to disk.
- **Called by:** AgentNode.jsx (agentStates[id]), DepartmentNode.jsx (setFocusedDepartment, focusedDepartmentId), TriggerNode.jsx (none — no subscription), HandoffEdge.jsx (edgeCounters[id]), AgentInspector.jsx (selectedNodeId, agentStates, setSelectedNode), BreadcrumbBar.jsx (departmentStack, navigateBreadcrumb), SwarmCanvas.jsx (focusedDepartmentId, setSelectedNode). All live as of Task #57.1.
- **Calls:** zustand::create (Zustand v4.5.7)
- **Inputs:** N/A (Zustand store — no constructor args)
- **Output:** hook returning state slice + actions
- **Side effects:** none (pure in-memory state; no API calls, no storage writes)
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `setExecution(id, status)`
- **Purpose:** Set the active execution ID and execution status atomically. Called on execution start/stop from WS event handlers.
- **Called by:** (not yet wired — future WS message handler for execution_status events)
- **Calls:** Zustand set
- **Inputs:** id (string | null), status ('idle' | 'running' | 'stopped')
- **Output:** void
- **Side effects:** updates activeExecutionId + executionStatus in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `updateAgentState(nodeId, patch)`
- **Purpose:** Merge a partial update into the agentStates entry for a specific node. Non-destructive — existing fields are preserved; only patch keys are overwritten.
- **Called by:** (not yet wired — future WS agent_update event handler)
- **Calls:** Zustand set with spread merge
- **Inputs:** nodeId (string), patch (object with subset of { status, lastOutputSnippet, handoffCount })
- **Output:** void
- **Side effects:** mutates agentStates[nodeId] in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `updateEdgeCounter(edgeId, count)`
- **Purpose:** Set the handoff counter for a specific edge. Used to drive animated edge labels on the canvas.
- **Called by:** (not yet wired — future WS edge_counter event handler)
- **Calls:** Zustand set with spread merge
- **Inputs:** edgeId (string), count (number)
- **Output:** void
- **Side effects:** mutates edgeCounters[edgeId] in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `updateBudget(used, limit)`
- **Purpose:** Update the budget tracker display state. Drives the BudgetBar component (when built).
- **Called by:** (not yet wired — future WS budget_update event handler)
- **Calls:** Zustand set
- **Inputs:** used (number — estimated tokens used), limit (number — token ceiling)
- **Output:** void
- **Side effects:** mutates budget object in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `addInboxItem(item)`
- **Purpose:** Append a Human-in-the-Loop approval item to the pending inboxItems list. Each item has an id and payload for the approval UI.
- **Called by:** (not yet wired — future WS hitl_pending event handler)
- **Calls:** Zustand set with array spread
- **Inputs:** item (object — HITL pending approval payload, must have id field)
- **Output:** void
- **Side effects:** appends to inboxItems array in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `resolveInboxItem(itemId)`
- **Purpose:** Remove a resolved HITL approval item from the inboxItems list. Called after user approves or rejects.
- **Called by:** (not yet wired — future HITL approve/reject UI action)
- **Calls:** Zustand set, Array.filter
- **Inputs:** itemId (string — id of the item to remove)
- **Output:** void
- **Side effects:** removes matching item from inboxItems in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `addFeedEvent(event)`
- **Purpose:** Append a handoff event to the inter-agent feed. Automatically trims to the last 100 events to prevent unbounded memory growth.
- **Called by:** (not yet wired — future WS handoff/feed event handler)
- **Calls:** Zustand set, Array.slice(-100)
- **Inputs:** event (object — handoff event: { fromNode, toNode, timestamp, payload })
- **Output:** void
- **Side effects:** appends to interAgentFeed, trims to 100 entries max
- **Complexity note:** .slice(-100) after spread means only the newest 100 events are retained — oldest are silently dropped. This is correct for an activity feed but callers must not assume all events are retained.
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `setFocusedDepartment(id)`
- **Purpose:** Navigate into a department node (drill-down). If id is non-null, pushes id onto departmentStack breadcrumb and sets focusedDepartmentId. If id is null, does not modify the stack (use navigateBreadcrumb to go up).
- **Called by:** client/src/canvas/nodes/DepartmentNode.jsx (onClick header — wired in Task #53.2)
- **Calls:** Zustand set with array spread
- **Inputs:** id (string | null — department node ID)
- **Output:** void
- **Side effects:** mutates focusedDepartmentId + departmentStack in store
- **Complexity note:** Null id does NOT clear the stack — only navigateBreadcrumb rewinds the stack. This asymmetry is intentional: setFocusedDepartment is for forward navigation; navigateBreadcrumb is for backward navigation via breadcrumb clicks.
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `navigateBreadcrumb(index)`
- **Purpose:** Rewind the department breadcrumb stack to a specific index. Slice to index (not index+1) so the clicked crumb becomes the new top. Sets focusedDepartmentId to the new top, or null if stack is now empty.
- **Called by:** client/src/canvas/BreadcrumbBar.jsx (Task #56 — wired to root button: index=0; and per-crumb buttons: index+1)
- **Calls:** Zustand set, Array.slice
- **Inputs:** index (number — the breadcrumb index to navigate to; 0 = root)
- **Output:** void
- **Side effects:** mutates departmentStack + focusedDepartmentId in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `setSelectedNode(id)`
- **Purpose:** Set the selected canvas node for the AgentInspector panel to render details for.
- **Called by:** client/src/canvas/AgentInspector.jsx (close button passes null — Task #55); future canvas node click handler (for non-null selection)
- **Calls:** Zustand set
- **Inputs:** id (string | null)
- **Output:** void
- **Side effects:** mutates selectedNodeId in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `setWsConnected(b)`
- **Purpose:** Track WebSocket connection health for the swarm WS channel. Drives connection status indicator in UI.
- **Called by:** (not yet wired — future WS open/close handlers)
- **Calls:** Zustand set
- **Inputs:** b (boolean)
- **Output:** void
- **Side effects:** mutates wsConnected in store
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

### `client/src/store/SwarmContext.jsx` :: `reset()`
- **Purpose:** Reset all execution state to initial values. Called on execution stop or when leaving the swarm canvas view.
- **Called by:** (not yet wired — future execution stop handler or view unmount cleanup)
- **Calls:** Zustand set
- **Inputs:** none
- **Output:** void
- **Side effects:** resets all 9 state fields to their initial values (null/idle/empty)
- **Last modified:** 2026-03-27 in Task #52 by frontend-dev

---

## React Flow Canvas Nodes (Tasks #53.1 + #53.2 + #53.3)

### `client/src/canvas/nodes/AgentNode.jsx` :: `AgentNode({ id, data, selected })`
- **Purpose:** Custom React Flow node for visualizing a single swarm agent. Reads live state from useSwarmStore to render status color, output snippet, and handoff count. Registered as nodeTypes["agent"] in the React Flow canvas.
- **Called by:** SwarmCanvas.jsx — registered in module-level nodeTypes map as nodeTypes.agent (Task #57.1)
- **Calls:** useSwarmStore (selector: s.agentStates[id]), Handle (from @xyflow/react), Position (from @xyflow/react)
- **Inputs:** id (string — React Flow node id), data (object — { label: string }), selected (boolean — React Flow selection state)
- **Output:** JSX — bordered card with status color, agent icon, label, status text, optional lastOutputSnippet, optional handoffCount badge; target Handle at top + source Handle at bottom
- **Side effects:** none (read-only store subscription + pure render)
- **Complexity note:** statusColors lookup uses `statusColors[status] || statusColors.idle` — unknown status values fall back to idle styling rather than throwing. `lastOutputSnippet.split('\n').slice(-3).join('\n')` trims to last 3 lines of output for the micro-log display.
- **Last modified:** 2026-03-27 in Task #53.1 by frontend-dev

### `client/src/canvas/nodes/DepartmentNode.jsx` :: `DepartmentNode({ id, data, selected })`
- **Purpose:** React Flow group container node for a department (a logical cluster of agent nodes). Subscribes to focusedDepartmentId + setFocusedDepartment from useSwarmStore. Clicking the header calls setFocusedDepartment(id) to drill-down. Child agent nodes use `{ extent: 'parent' }` in React Flow to be contained within this node. Registered as nodeTypes["department"].
- **Called by:** SwarmCanvas.jsx — registered in module-level nodeTypes map as nodeTypes.department (Task #57.1)
- **Calls:** useSwarmStore (selector: s.setFocusedDepartment), useSwarmStore (selector: s.focusedDepartmentId), setFocusedDepartment(id) on click
- **Inputs:** id (string — React Flow node id), data (object — { label: string, agentCount?: number }), selected (boolean)
- **Output:** JSX — full-width/height rounded container with clickable header (department label + optional agentCount badge), focused vs. unfocused border/bg styling
- **Side effects:** calls setFocusedDepartment(id) on header click — mutates focusedDepartmentId + departmentStack in SwarmStore
- **Complexity note:** Two separate useSwarmStore subscriptions (one for the action, one for focusedDepartmentId state) to avoid re-subscribing to the entire store on every render. React Flow resizes the container to its declared width/height — DepartmentNode renders full w-full h-full inside that box.
- **Last modified:** 2026-03-27 in Task #53.2 by frontend-dev

### `client/src/canvas/nodes/TriggerNode.jsx` :: `TriggerNode({ id, data, selected })`
- **Purpose:** React Flow source-only trigger node (webhook or RSS). Fires outward to agent nodes — has a source Handle at the bottom only (no target Handle, triggers only initiate edges). Purple visual theme. Full implementation (polling logic, URL config, activation) deferred to Task #76.
- **Called by:** SwarmCanvas.jsx — registered in module-level nodeTypes map as nodeTypes.trigger (Task #57.1)
- **Calls:** Handle (from @xyflow/react), Position (from @xyflow/react); triggerIcons lookup (module-level const map)
- **Inputs:** id (string — React Flow node id), data (object — { label: string, triggerType: 'webhook'|'rss'|string }), selected (boolean)
- **Output:** JSX — purple bordered card with trigger icon (webhook: 🔗, rss: 📡, fallback: ⚡), label, triggerType badge; source Handle at bottom only
- **Side effects:** none (stub — no store subscription, no polling)
- **Complexity note (stub):** triggerIcons is a module-level const map — adding new trigger types requires adding to the map and this file. Task #76 will add URL configuration, activation toggle, and polling integration.
- **Last modified:** 2026-03-27 in Task #53.3 by frontend-dev

---

## React Flow Canvas Edges + Inspector + Breadcrumb (Tasks #54 + #55 + #56)

### `client/src/canvas/edges/HandoffEdge.jsx` :: `HandoffEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd })`
- **Purpose:** Custom React Flow edge type="handoff". Reads edgeCounters[id] from useSwarmStore to determine active/idle state. Renders animated dashed blue line (when counter > 0) or static grey line (counter = 0). Shows a blue rounded counter badge via EdgeLabelRenderer when active. The @keyframes dashdraw animation in index.css drives the strokeDashoffset march.
- **Called by:** SwarmCanvas.jsx — registered in module-level edgeTypes map as edgeTypes.handoff (Task #57.1); also used as default edge type for new onConnect edges (`addEdge({ ...params, type: 'handoff' }, eds)`)
- **Calls:** useSwarmStore (selector: s.edgeCounters[id] ?? 0), getBezierPath (from @xyflow/react), BaseEdge (from @xyflow/react), EdgeLabelRenderer (from @xyflow/react)
- **Inputs:** id (string — React Flow edge id), sourceX/sourceY/targetX/targetY (numbers — endpoint coords), sourcePosition/targetPosition (Position enum from @xyflow/react), data (object — not used currently), markerEnd (string | undefined — arrow marker)
- **Output:** JSX fragment — BaseEdge path + optional EdgeLabelRenderer counter badge
- **Side effects:** none (read-only store subscription + pure render)
- **Complexity note:** Animation is CSS-driven via `animation: 'dashdraw 0.5s linear infinite'` applied inline, referencing the @keyframes dashdraw rule added to client/src/index.css. The counter badge is only mounted when isActive (counter > 0) — EdgeLabelRenderer is never rendered for idle edges.
- **Last modified:** 2026-03-27 in Task #54 by frontend-dev

---

### `client/src/canvas/AgentInspector.jsx` :: `AgentInspector({ nodes, onUpdateNode })`
- **Purpose:** Side panel that renders details for the currently selected canvas node. Reads selectedNodeId and agentStates[selectedNodeId] from useSwarmStore. Shows: node label, type badge, live status from Zustand (status string + handoffCount), system prompt (from node.data.systemPrompt, read-only), and last output snippet (from agentState.lastOutputSnippet). Close button calls setSelectedNode(null) to deselect. Returns an empty placeholder div when no node is selected.
- **Called by:** SwarmCanvas.jsx (Task #57.1 — first live caller; mounted as `<AgentInspector nodes={nodes} />` in the right panel)
- **Calls:** useSwarmStore (selector: s.selectedNodeId), useSwarmStore (selector: s.agentStates[selectedNodeId]), useSwarmStore (selector: s.setSelectedNode), nodes.find() (prop traversal)
- **Inputs:** nodes (array — React Flow node objects from parent canvas; used to find label, type, data.systemPrompt), onUpdateNode (function — passed as prop but not yet called; reserved for future edit operations)
- **Output:** JSX — w-64 right panel; empty placeholder if no selection; detail view with header, type badge, status block, system prompt block, last output block
- **Side effects:** calls setSelectedNode(null) on close button click — clears selectedNodeId in SwarmStore
- **Complexity note:** Three separate useSwarmStore selectors (selectedNodeId, agentState, setSelectedNode) rather than one broad selector — prevents unnecessary re-renders when unrelated store slices change. agentState data comes from Zustand (live runtime state); systemPrompt comes from node.data (static workflow definition). These are separate sources and may diverge.
- **Last modified:** 2026-03-27 in Task #55 by frontend-dev

---

### `client/src/canvas/BreadcrumbBar.jsx` :: `BreadcrumbBar({ nodes })`
- **Purpose:** Horizontal breadcrumb bar for swarm canvas drill-down navigation. Reads departmentStack (array of department node IDs) and navigateBreadcrumb from useSwarmStore. Renders a root "All Agents" button that calls navigateBreadcrumb(0), then one button per stack entry. The last entry is styled bold (current depth). Each crumb button calls navigateBreadcrumb(index + 1) where index is 0-based within the crumbs array. Node labels are resolved by looking up node IDs in the nodes prop; falls back to raw ID if node not found.
- **Called by:** SwarmCanvas.jsx (Task #57.1 — first live caller; mounted as `<BreadcrumbBar nodes={nodes} />` above the ReactFlow panel)
- **Calls:** useSwarmStore (selector: s.departmentStack), useSwarmStore (selector: s.navigateBreadcrumb), nodes.find() (per crumb, to resolve label), navigateBreadcrumb(0) on root click, navigateBreadcrumb(index + 1) on crumb click
- **Inputs:** nodes (array — React Flow node objects from parent canvas; used to resolve department labels from IDs in departmentStack)
- **Output:** JSX — horizontal flex bar with root button + separator "/" + per-depth crumb buttons; last crumb is white + font-medium
- **Side effects:** calls navigateBreadcrumb() on button clicks — mutates departmentStack + focusedDepartmentId in SwarmStore
- **Complexity note:** navigateBreadcrumb(0) = navigate to root (empty stack); navigateBreadcrumb(index + 1) navigates to depth index+1 in the stack. The root button always appears even when departmentStack is empty (flat canvas view). The crumb loop only renders entries from departmentStack — if it is empty, only the root button is shown.
- **Last modified:** 2026-03-27 in Task #56 by frontend-dev

---

## React Flow Canvas Container (Task #57.1)

### `client/src/canvas/SwarmCanvas.jsx` :: `SwarmCanvas({ workflowDef })`
- **Purpose:** Root canvas component for swarm workflow visualization. Initializes React Flow with workflowDef.nodes + workflowDef.edges, registers all custom node/edge types, applies drill-down filtering via focusedDepartmentId, wires user interaction (onNodeClick, onPaneClick, onConnect), and mounts BreadcrumbBar + AgentInspector into the layout.
- **Called by:** SwarmView.jsx (Task #57.2 — first live caller; mounted inside ReactFlowProvider with `workflowDef` prop)
- **Calls:** useSwarmStore (selector: s.focusedDepartmentId), useSwarmStore (selector: s.setSelectedNode), useNodesState (from @xyflow/react), useEdgesState (from @xyflow/react), useMemo (React — visibleNodes, visibleNodeIds, visibleEdges), useCallback (React — onConnect, onNodeClick, onPaneClick), addEdge (from @xyflow/react), ReactFlow + Background + Controls + MiniMap (from @xyflow/react), AgentNode, DepartmentNode, TriggerNode, HandoffEdge, AgentInspector, BreadcrumbBar
- **Inputs:** workflowDef (object — `{ nodes: ReactFlowNode[], edges: ReactFlowEdge[] }` or undefined; defaults to empty arrays)
- **Output:** JSX — flex column: BreadcrumbBar (top) + flex row: ReactFlow canvas (flex-1) + AgentInspector (right panel)
- **Side effects:** calls setSelectedNode(nodeId) on node click; calls setSelectedNode(null) on pane click; calls setEdges to append a new handoff edge on connect. No server I/O.
- **Complexity note (drill-down filtering):** Three separate useMemo computations — (1) visibleNodes filters nodes where `n.id === focusedDepartmentId || n.parentId === focusedDepartmentId` (or all nodes if focusedDepartmentId is null); (2) visibleNodeIds converts visibleNodes to a Set for O(1) edge lookup; (3) visibleEdges filters edges where both source and target are in visibleNodeIds. nodeTypes and edgeTypes objects are declared OUTSIDE the component (module-level consts) to prevent React Flow from re-registering on every render — this is a React Flow v12 requirement. workflowDef is treated as the initial state only; changes to workflowDef after mount are NOT reflected (useNodesState/useEdgesState take initialNodes/initialEdges).
- **Last modified:** 2026-03-27 in Task #57.1 by frontend-dev; "Called by" updated Task #57.2 (SwarmView now mounts it)

---

## Swarm View Shell (Task #57.2)

### `client/src/views/SwarmView.jsx` :: `SwarmView()`
- **Purpose:** Top-level page shell for the Swarm Orchestrator. Renders a fixed toolbar (title, executionStatus indicator, conditional Reset button), then PromptToFlowBar below the toolbar, then the full-height canvas area. Provides the ReactFlowProvider boundary required by @xyflow/react. Owns `workflowDef` local state; receives it from PromptToFlowBar.onWorkflowGenerated and passes it down to SwarmCanvas.
- **Called by:** App.jsx::MainContent (case 'swarm' — wired in Task #58)
- **Calls:** useSwarmStore (selector: s.executionStatus), useSwarmStore (selector: s.reset), useState (React — workflowDef local state), ReactFlowProvider (from @xyflow/react), PromptToFlowBar (client/src/canvas/PromptToFlowBar.jsx — Task #60), SwarmCanvas (client/src/canvas/SwarmCanvas.jsx)
- **Inputs:** none (no props)
- **Output:** JSX — flex-col full-height div: toolbar row (shrink-0) + PromptToFlowBar (shrink-0) + canvas area (flex-1, overflow-hidden) containing ReactFlowProvider > SwarmCanvas
- **Side effects:** calls SwarmStore.reset() when Reset button is clicked (clears execution state); no server I/O
- **Complexity note:** `statusColors` is a module-level const map (idle/running/stopped → Tailwind class string). `executionStatus === 'stopped'` is the sole gate for the Reset button. onWorkflowGenerated callback receives (workflowId, animatedDef) from PromptToFlowBar — SwarmView discards workflowId and stores only animatedDef in workflowDef local state, which flows into SwarmCanvas. ReactFlowProvider must wrap SwarmCanvas (not SwarmCanvas internally) because SwarmView is the intended boundary for the React Flow context.
- **Last modified:** 2026-03-27 in Task #60 by frontend-dev (PromptToFlowBar mounted; onWorkflowGenerated → setWorkflowDef wired; workflowDef prop now live to SwarmCanvas)

---

## App Root View Router (Task #58)

### `client/src/App.jsx` :: `MainContent()`
- **Purpose:** Internal component that reads `view` from AppContext and returns the appropriate view component. Switch covers 6 cases: projects → ProjectsView, terminal → TerminalView, jobs → JobView, context → ContextEditorView, deployments → DeploymentManagerView, swarm → SwarmView. Default falls back to ProjectsView.
- **Called by:** AppLayout (same file — rendered inside `<main>` flex container)
- **Calls:** useAppState (store/AppContext.jsx — reads view), ProjectsView, TerminalView, JobView, ContextEditorView, DeploymentManagerView, SwarmView
- **Inputs:** none (no props; reads view from context)
- **Output:** JSX — one of the 6 view components
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #58 by frontend-dev (swarm case added; previously 5 cases)

### `client/src/App.jsx` :: `AppLayout()`
- **Purpose:** Internal layout shell — flex row containing Sidebar (fixed 250px) and a `<main>` flex-1 region that renders MainContent.
- **Called by:** App (default export — same file, wraps in AppProvider)
- **Calls:** Sidebar, MainContent
- **Inputs:** none
- **Output:** JSX — full-screen flex row
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #30 by frontend-dev (unchanged in Task #58)

### `client/src/App.jsx` :: `App()`
- **Purpose:** Root exported component. Wraps AppLayout in AppProvider (context provider).
- **Called by:** client/src/main.jsx (ReactDOM.createRoot entry point)
- **Calls:** AppProvider, AppLayout
- **Inputs:** none
- **Output:** JSX — AppProvider > AppLayout tree
- **Side effects:** none
- **Last modified:** 2026-03-27 in Task #30 by frontend-dev (unchanged in Task #58)

---

## Sidebar Nav (Task #58 — NAV_ITEMS update)

### `client/src/lib/constants.js` :: `NAV_ITEMS` update note
- NAV_ITEMS expanded from 5 to 6 items in Task #58: added `{ icon: 'hub', label: 'Swarm', view: 'swarm' }` as the last entry.
- Full 6-item order: projects, terminal, jobs, deployments, context, swarm.
- Imported by: Sidebar.jsx (already live since Task #24), App.jsx's MainContent (switch keys match these view strings).
- **Last modified:** 2026-03-27 in Task #58 by frontend-dev (swarm item appended)

---

## POST /scaffold Full Implementation (Task #59)

### `server/routes/swarm.js` :: `generateWorkflowFromPrompt(prompt)`
- **Purpose:** Module-private async helper. Calls the Anthropic Claude API (claude-haiku-4-5-20251001, max_tokens 2048) with a system prompt that instructs Claude to return a multi-agent workflow definition as JSON. Strips any accidental markdown fences from the response. Validates that the returned JSON has a `name` field and at least one `nodes` entry. Returns the parsed workflow object.
- **Called by:** `swarmRoutes` → POST /scaffold handler (same file — line 114)
- **Calls:** `new Anthropic()` (reads ANTHROPIC_API_KEY from env), `client.messages.create(...)`, `JSON.parse()`
- **Inputs:** prompt (string — user natural-language description of the workflow, already trimmed and validated ≤ 2000 chars by caller)
- **Output:** Promise\<object\> — parsed workflow definition matching WorkflowStore schema: `{ name, description, nodes[], edges[] }`
- **Side effects:** outbound HTTPS call to api.anthropic.com; throws on network failure, non-200, JSON parse error, or invalid structure
- **Complexity note:** Two-step markdown fence strip: `text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()`. This handles Claude occasionally wrapping JSON in a code block despite the system prompt saying not to. The model used (claude-haiku-4-5-20251001) is hard-coded — if this model becomes unavailable the endpoint will always 500.
- **Last modified:** 2026-03-27 in Task #59 by backend-dev (replaces 501 scaffold stub)

### `server/routes/swarm.js` :: `POST /scaffold route handler` (inside `swarmRoutes()`)
- **Purpose:** Validates the incoming prompt body field (required, string, non-empty, ≤ 2000 chars), calls `generateWorkflowFromPrompt`, optionally attaches `projectId` to the returned workflow definition, saves to `WorkflowStore` via `req.app.locals.workflowStore.create()`, and returns 201 with `{ workflowId, workflowDef }`.
- **Called by:** Express router — POST /api/v1/swarm/scaffold (declared BEFORE /:workflowId/* routes to prevent param shadowing)
- **Calls:** `generateWorkflowFromPrompt(prompt)`, `req.app.locals.workflowStore.create(workflowDef)` → `WorkflowStore.create()`
- **Inputs:** `req.body.prompt` (string, required), `req.body.projectId` (string, optional)
- **Output:** HTTP 201 `{ workflowId: string, workflowDef: object }` | 400 if prompt invalid | 503 if WorkflowStore unavailable | 500 on Claude API or JSON error
- **Side effects:** creates a new workflow record in WorkflowStore (persisted to disk via write-file-atomic); makes outbound Anthropic API call
- **Complexity note:** Route MUST be declared before `/:workflowId/start` in the router — otherwise Express would match 'scaffold' as a `:workflowId` param. Comment in source code documents this ordering constraint.
- **Last modified:** 2026-03-27 in Task #59 by backend-dev (was 501 stub; now full impl)

---

## Workflow CRUD Hooks (Task #61)

### `client/src/hooks/useWorkflow.js` :: `useWorkflow(workflowId)`
- **Purpose:** React hook that manages the lifecycle of a single workflow definition. Fetches the workflow by ID on mount (and on workflowId change). Exposes `update(patch)` to PUT changes and `remove()` to DELETE the workflow. Returns `{ workflow, loading, error, refresh, update, remove }`.
- **Called by:** (no live callers yet — intended for SwarmView.jsx workflow selector, Task #61 follow-up wiring)
- **Calls:** `apiGet(\`/api/v1/workflows/${workflowId}\`)`, `apiPut(\`/api/v1/workflows/${workflowId}\`, patch)`, `apiDelete(\`/api/v1/workflows/${workflowId}\`)`, `useState` (workflow/loading/error), `useEffect` (triggers refresh on workflowId change), `useCallback` (refresh/update/remove memoized)
- **Inputs:** workflowId (string | undefined — if falsy, refresh and mutation calls are no-ops)
- **Output:** `{ workflow: object|null, loading: boolean, error: string|null, refresh: () => Promise<void>, update: (patch) => Promise<object>, remove: () => Promise<void> }`
- **Side effects:** GET /api/v1/workflows/:id on mount and on workflowId change; PUT on update(); DELETE on remove(); sets component state (loading/error/workflow)
- **Complexity note:** refresh is wrapped in useCallback with [workflowId] dep and passed to useEffect — this guarantees a new fetch fires whenever workflowId changes without lint-warning for missing deps. `update()` does NOT re-call refresh after PUT — it sets workflow directly from the server response (optimistic-free, server-truth approach).
- **Last modified:** 2026-03-27 in Task #61 by frontend-dev

### `client/src/hooks/useWorkflow.js` :: `useWorkflowList()`
- **Purpose:** React hook that fetches all workflow definitions and allows creating new ones. Fetches all workflows on mount. Exposes `create(workflowDef)` to POST a new workflow (appends to local list optimistically after server confirms). Returns `{ workflows, loading, error, refresh, create }`.
- **Called by:** (no live callers yet — intended for a future WorkflowSelectorModal or SwarmView workflow picker)
- **Calls:** `apiGet('/api/v1/workflows')`, `apiPost('/api/v1/workflows', workflowDef)`, `useState` (workflows/loading/error), `useEffect` (triggers refresh on mount), `useCallback` (refresh/create memoized)
- **Inputs:** none
- **Output:** `{ workflows: object[], loading: boolean, error: string|null, refresh: () => Promise<void>, create: (workflowDef) => Promise<object> }`
- **Side effects:** GET /api/v1/workflows on mount; POST /api/v1/workflows on create(); appends returned workflow to local workflows state via `setWorkflows(prev => [...prev, created])`
- **Complexity note:** create() appends the server-returned workflow object (not the local input) — the server assigns the UUID, so this is a server-truth append. The list is NOT re-fetched after create; the local append is sufficient for immediate UI update.
- **Last modified:** 2026-03-27 in Task #61 by frontend-dev

---

## Prompt-to-Flow Bar (Task #60)

### `client/src/canvas/PromptToFlowBar.jsx` :: `PromptToFlowBar({ onWorkflowGenerated })`
- **Purpose:** Natural-language prompt input bar that generates a multi-agent workflow via the scaffold endpoint. Renders a purple-accent text input + "Generate" button. On submit, POSTs the trimmed prompt to POST /api/v1/swarm/scaffold, extracts the returned workflowDef, applies staggered CSS fadeIn animation to every node (opacity: 0 → animation: fadeIn 0.3s ease forwards), and calls onWorkflowGenerated(workflowId, animatedDef). Supports Enter key (non-shifted) as submit shortcut. Displays inline error text on failure. Clears the prompt field on success.
- **Called by:** SwarmView.jsx (Task #60 — mounted between toolbar and canvas; onWorkflowGenerated callback wires to setWorkflowDef)
- **Calls:** fetch (native browser — POST /api/v1/swarm/scaffold with X-Requested-With CSRF header), useState (prompt, loading, error), useCallback (handleGenerate), onWorkflowGenerated (prop callback)
- **Inputs:** onWorkflowGenerated (function — called as onWorkflowGenerated(workflowId: string, animatedDef: object) on success; optional — guarded with `?.`)
- **Output:** JSX — flex-col div: input row (icon + text input + Generate button) + optional error line below
- **Side effects:** POST /api/v1/swarm/scaffold (creates a workflow record on the server via WorkflowStore); calls onWorkflowGenerated prop on success; sets prompt/loading/error React state
- **Complexity note:** Staggered animation: each node in workflowDef.nodes gets `style.animation = 'fadeIn 0.3s ease forwards ${i * 0.08}s'` where i is the index. This depends on @keyframes fadeIn declared in client/src/index.css. The SCAFFOLD_HEADERS constant (module-level) includes the CSRF header — mutating requests without this header would be rejected by server/middleware/csrf.js. handleGenerate is memoized via useCallback with [prompt, loading, onWorkflowGenerated] deps.
- **Last modified:** 2026-03-27 in Task #60 by frontend-dev

### `client/src/canvas/PromptToFlowBar.jsx` :: `handleGenerate()` (internal — via useCallback)
- **Purpose:** Async submit handler. Guards against empty prompt and concurrent submission (loading flag). Calls POST /api/v1/swarm/scaffold, decodes { workflowId, workflowDef }, applies per-node staggered animation transform, and calls onWorkflowGenerated. Sets error state on any fetch or HTTP failure.
- **Called by:** PromptToFlowBar — Generate button onClick; handleKeyDown (Enter key without Shift)
- **Calls:** fetch('/api/v1/swarm/scaffold', ...), res.json(), onWorkflowGenerated (prop), setLoading, setError, setPrompt
- **Inputs:** (no params — reads prompt, loading, onWorkflowGenerated from closure)
- **Output:** Promise\<void\>
- **Side effects:** server POST; React state updates (loading, error, prompt)
- **Last modified:** 2026-03-27 in Task #60 by frontend-dev

### `client/src/canvas/PromptToFlowBar.jsx` :: `handleKeyDown(e)` (internal)
- **Purpose:** Keyboard event handler for the prompt input. Calls handleGenerate() when Enter is pressed without Shift (Shift+Enter is reserved for multi-line expansion if ever implemented). Prevents the default form-submit behavior.
- **Called by:** PromptToFlowBar — input element's onKeyDown prop
- **Calls:** handleGenerate()
- **Inputs:** e (KeyboardEvent)
- **Output:** void
- **Side effects:** delegates to handleGenerate (see above)
- **Last modified:** 2026-03-27 in Task #60 by frontend-dev
