# CHANGELOG — Claude Code Visual Manager

## 2026-03-25

### [Task #23] Design System Foundation (Phase 9)
- Agent: frontend-dev
- Modified: client/tailwind.config.js, client/index.html, client/src/index.css
- Created: client/src/lib/constants.js

#### client/tailwind.config.js
- **Change type:** MODIFIED (full overhaul for Phase 9 design tokens)
- **What changed:** Replaced minimal Tailwind config with full Phase 9 design token system. Added 20+ custom colors (primary #933df5, 4-level surface scale, 4 border tokens, 4 text tokens, semantic colors, 6 code syntax colors), 3 font families (Inter/Geist/JetBrains Mono), custom border radius scale (sm/DEFAULT/md/lg/xl/full). Added `darkMode: 'class'`.
- **Why:** Design tokens extracted from all 5 Stitch design exports to establish consistent design system before building Phase 9 components.

#### client/index.html
- **Change type:** MODIFIED (font imports added)
- **What changed:** Added Google Fonts preconnect links and stylesheet imports for Inter (400-700), JetBrains Mono (400-500), and Material Symbols Outlined (variable weight+fill). Added `class="dark"` on `<html>` for Tailwind dark mode.
- **Why:** Phase 9 design system requires these fonts; CDN delivery chosen over bundling.

#### client/src/index.css
- **Change type:** MODIFIED (Phase 9 utility classes + markdown theme update)
- **What changed:** Added utility classes: `.custom-scrollbar` (6px dark scrollbar), `.glass-effect` (blur+semi-transparent bg), `.active-indicator` (purple glow box-shadow), `.terminal-text` (JetBrains Mono), `.terminal-line-border`, `.filled-icon` (Material Symbols FILL variation). Updated `.markdown-result` heading colors from green to purple (#933df5). Added `.md-heading`, `.md-code`, `.md-muted`, `.md-comment` syntax highlighting helpers for Context Editor.
- **Why:** Utility classes needed by Phase 9 components; markdown result theme must match new purple primary color.

#### client/src/lib/constants.js (NEW)
- **Change type:** CREATED
- **Exports:** `NAV_ITEMS` (array of 5 sidebar nav items with icon/label/view), `STATUS_COLORS` (object mapping 10 status strings to Tailwind class triplets {bg, text, dot})
- **Why:** Centralized design constants for Phase 9 — prevents hardcoded values across multiple components. NAV_ITEMS will be consumed by new Sidebar (Task #24). STATUS_COLORS will be used by all views that display status badges.
- **Note:** NAV_ITEMS is not yet imported by existing Sidebar.jsx (which has its own local copy). Task #24 will replace Sidebar and import from this module.

#### Functions Added
- `NAV_ITEMS` constant in `client/src/lib/constants.js` — 5 navigation items for Phase 9 sidebar
- `STATUS_COLORS` constant in `client/src/lib/constants.js` — 10-status badge color mapping using Phase 9 Tailwind tokens

#### Functions Modified
- None (config/style files only; no function signature changes)

#### Connection Changes
- client/src/lib/constants.js created but not yet imported — will be consumed starting Task #24 (Sidebar)
- tailwind.config.js new color tokens are referenced by STATUS_COLORS (e.g., bg-success/10, text-primary)

#### Impact on Other Code
- All existing components using hardcoded color values will be progressively migrated to Tailwind tokens in Tasks #24-#30
- `.markdown-result` heading colors changed from implicit green to explicit purple (#933df5) — affects JobPanel/MarkdownResult visual output immediately

---

### Phase 9 Planning — Frontend Redesign (Tasks #23-#31)
- Agent: project-manager (planning), code-mapper (documentation)
- No code modified — planning-only task
- 9 new tasks created (#23-#31) for complete frontend UI replacement based on 5 Stitch design exports
- Design exports at: stitch/stitch/ (5 screens: Project Dashboard, Terminal Hub, Orchestration Center, Context Editor, Deployment Manager)
- Task dependency chain: #23 (design system) -> #24 (sidebar) -> #25-#29 (5 views, parallel) -> #30 (app shell) -> #31 (QA)
- Navigation changes: 4 views -> 5 views; 'entities' split into 'context' + 'deployments'; default view changes from 'terminal' to 'projects'
- Design system changes: purple (#933df5) replaces green (#4ade80); pure black (#000000) background; Inter/Geist/JetBrains Mono fonts; Material Symbols icons
- Constraint: Terminal.jsx, useSession.js, useApi.js, useJob.js must NOT be modified; no server changes
- Files modified: docs/TASK_PLAN.md, docs/memory/PROGRESS.md, docs/memory/CONTEXT.md (all by project-manager)

---

## 2026-03-24

### [Task #22] v1.2 — Add GET /api/v1/jobs/:id Route (BUG-22)
- Agent: orchestrator (inline fix)
- Modified: server/routes/jobs.js
- Added: GET /:id route returning sanitized job status + result (SEC-08 compliant)
- BUG-22 FIXED: previously returned SPA HTML fallback instead of JSON 404

### [Task #19] v1.1 — Fix JobRunner Memory Leak
- Agent: backend-dev
- Modified: server/services/JobRunner.js
- Added: JOB_EVICTION_TTL_MS constant (10 min), _scheduleEviction(jobId) private method
- Behavior: terminal-state jobs (completed/cancelled/error) are evicted from #jobs Map after 10 min TTL; active SSE clients prevent eviction (reschedules)
- BUG-06 FIXED

### [Task #20] v1.1 — Fix Rate Limiter Memory Leak
- Agent: backend-dev
- Modified: server/index.js (lines 91-101)
- Added: setInterval sweep every 60s that deletes stale _rateLimitMap entries where window has expired
- Timer uses .unref() to not block process exit
- BUG-07 FIXED

### [Task #21] v1.1 — Upgrade Vite to Patch esbuild CVE
- Agent: devops
- Modified: client/package.json (vite ^5.1.0 → ^6.4.1), client/package-lock.json
- Resolved: GHSA-67mh-4wv8-2f99 (esbuild CVE, MEDIUM-04)
- npm audit: 0 vulnerabilities after upgrade
- Build verified: 301 modules, 2.06s

### v1.1 QA Regression Pass
- 110/110 tests pass, 0 failures, 3.87s
- npm audit client/: 0 vulnerabilities
- All 21 tasks COMPLETED

## 2026-03-18

### [Task #1] System Architecture Design
- Agent: architect
- Added: docs/ARCHITECTURE.md
- Covers: component diagram, full API surface, WebSocket protocol, RingBuffer spec, startup sequence, error handling matrix, React state management, YAML frontmatter pattern

### [Task #2] Monorepo Scaffold and Build System
- Agent: devops
- Added: root package.json, server/package.json, client/package.json, server/index.js (stub), client/vite.config.js, client/src/App.jsx, client/src/main.jsx, client/src/index.css, client/index.html, client/tailwind.config.js, client/postcss.config.js, .gitignore, .nvmrc
- Package corrections: node-pty (not node-pty-prebuilt-multiarch), write-file-atomic (not write-atomic)
- Verified: npm run build succeeds, GET /health returns 200 at http://127.0.0.1:3000

### [Task #3] Backend Foundation
- Agent: backend-dev
- Added: server/services/ConfigStore.js, ProcessRegistry.js, BinaryDiscovery.js, services/index.js
- Added: server/middleware/security.js, csrf.js, pathValidation.js
- Modified: server/index.js — full bootstrap replacing stub
- Key fact: Claude binary found at C:\Users\arman\.local\bin\claude.exe (auto-discovered via PATH)
- Verified: GET /health → 200 with claudeBin path; POST without CSRF header → 403; POST with header to unimplemented route → 501

### [Task #4] Project Management REST API
- Agent: backend-dev
- Added: server/routes/projects.js
- Modified: server/index.js (mounted projectsRouter at /api/v1/projects)
- All endpoints verified: list, create (with auto-scaffold), get (with pathExists check), delete, manual scaffold
- Scaffold creates: .claude/CLAUDE.md (if missing), .claude/agents/, .claude/commands/

### [Task #5] SessionManager + WebSocket Terminal Handler
- Agent: backend-dev
- Added: server/services/RingBuffer.js, SessionManager.js, routes/sessions.js, ws/terminalHandler.js
- Modified: server/index.js (WSS with maxPayload 1MB, sessionManager.killAll() in shutdown)
- RingBuffer: 100KB cap, split-write wrap-around, toBuffer() for replay
- SessionManager: permanent pty.onData, backpressure guard (skip ws if bufferedAmount > 256KB)
- PTY survives browser tab close — only killed by explicit user action or idle timeout
- node-pty imported as ESM default; tree-kill via createRequire (CJS)

---

### [Task #7] Entity Management API
- Agent: backend-dev
- Added: server/services/FileManager.js, server/utils/frontmatter.js, server/routes/agents.js, server/routes/skills.js, server/routes/claudemd.js
- Modified: server/index.js (added 3 router mounts: /api/v1/agents, /api/v1/skills, /api/v1/claudemd)

#### server/services/FileManager.js
- Centralized atomic file I/O service (singleton `fileManager` exported)
- All 5 methods (readFile, writeFile, deleteFile, listDirectory, ensureDirectory) call validatePath() first
- validatePath() enforces allowedBase containment — throws Error on traversal (path.resolve + startsWith check)
- writeFile uses write-file-atomic (never fs.writeFile) + mkdir -p for parent dirs
- listDirectory swallows ENOENT → returns [] (safe scan of potentially-missing dirs)

#### server/utils/frontmatter.js
- parseFrontmatter(content): regex handles both \n and \r\n; malformed YAML → empty frontmatter (never throws)
- serializeFrontmatter(frontmatter, body): yaml.dump with lineWidth:-1 (no wrapping)
- filePathToId(filePath): SHA-256 → first 16 hex chars; deterministic, not stored anywhere; PUT/DELETE must supply filePath in body

#### server/routes/agents.js
- GET /api/v1/agents?projectId=: parallel read of user (~/.claude/agents) + project scope
- POST /api/v1/agents: validates name ^[a-z][a-z0-9-]*$; 409 on duplicate file
- PUT /api/v1/agents/:id: requires filePath in body; resolveAllowedBase() validates path
- DELETE /api/v1/agents/:id: accepts filePath from body or query string
- resolveAllowedBase(): checks USER_AGENTS_DIR then all registered project paths — ApiError(400) if none match

#### server/routes/skills.js
- Supports two formats: modern (skills/<name>/SKILL.md) and legacy (commands/<name>.md)
- GET /api/v1/skills?projectId=: 4-way parallel scan (user+project × modern+legacy)
- POST /api/v1/skills: creates directory + SKILL.md; name regex ^[a-z0-9][a-z0-9-]*$ max 64
- DELETE: modern removes entire directory (fs.promises.rm recursive); legacy removes single file
- resolveAllowedBase(): checks USER_CLAUDE_DIR (not just agents subdir) then project paths

#### server/routes/claudemd.js
- GET /api/v1/claudemd: returns both user + project CLAUDE.md in one response; safeRead() → '' on ENOENT
- PUT /api/v1/claudemd/user: writes ~/.claude/CLAUDE.md via fileManager.writeFile
- PUT /api/v1/claudemd/project: requires projectId; writes <project>/.claude/CLAUDE.md

---

### [Task #8] Entity Management UI
- Agent: frontend-dev
- Added: client/src/hooks/useApi.js (apiPut + apiDeleteWithBody added to existing file), client/src/components/AgentEditor.jsx, client/src/components/SkillEditor.jsx, client/src/components/ClaudeMdEditor.jsx, client/src/views/EntitiesView.jsx

#### client/src/hooks/useApi.js (extended)
- apiPut(path, body): new export — PUT with CSRF header + JSON body
- apiDeleteWithBody(path, body): new export — DELETE with JSON body (needed for filePath/dirPath in agent/skill delete)
- handleResponse: 204 → null; non-ok → throws Error with server error message

#### client/src/views/EntitiesView.jsx
- Tab container: Agents | Skills | CLAUDE.md tabs
- Reads activeProjectId from AppContext (useAppState hook)
- Renders AgentEditor, SkillEditor, or ClaudeMdEditor based on activeTab state

#### client/src/components/AgentEditor.jsx
- Three-view component: list table → form (create/edit) → confirm-delete dialog
- AgentForm (internal): validates name regex client-side; constructs frontmatter from form; POST (create) or PUT (edit)
- Edit: name field disabled (filename is identity); all other fields editable
- Delete: sends filePath in body via apiDeleteWithBody
- Shows restart-required banner after any save (Claude must reload agents)

#### client/src/components/SkillEditor.jsx
- Same three-view structure as AgentEditor
- SkillForm maps camelCase form fields to YAML keys (argument-hint, disable-model-invocation, user-invocable, allowed-tools)
- Delete: sends { dirPath } for modern skills or { filePath } for legacy
- Toast notification on save (no restart required — skills take effect immediately)
- FormatBadge component distinguishes modern vs legacy visually

#### client/src/components/ClaudeMdEditor.jsx
- Dual-panel layout: user CLAUDE.md (left) + project CLAUDE.md (right) side by side
- ClaudeMdPanel (internal): textarea + line counter + 300-line warning + Save button
- Project panel is disabled/greyed when no project is selected
- handleSaveUser: PUT /api/v1/claudemd/user; handleSaveProject: PUT /api/v1/claudemd/project
- Both saves are independent — each has its own saving/saveError state

---

### [Task #9] Job Mode API — JobRunner and SSE Streaming
- Agent: backend-dev
- Added: server/services/JobRunner.js, server/routes/jobs.js
- Modified: server/index.js (import jobRunner, mount /api/v1/jobs, set jobRunner.claudeBin, call jobRunner.cancelAll in shutdown)

#### server/services/JobRunner.js
- JobRunner class with private `#jobs` Map; exported as singleton `jobRunner`
- `claudeBin` public property — set by server/index.js after binary discovery (same pattern as SessionManager)
- `startJob(projectId, projectPath, prompt, allowedTools, maxTurns)`: spawns `claude -p --output-format stream-json`; stdin.end() immediately (DEC-005, GitHub #7497 hang prevention); readline on stdout for JSON line parsing; forwards each event to all SSE clients; finalizes status on child close
- `cancelJob(jobId)`: sets status='cancelled' before tree-kill (prevents close handler overwriting with 'error'); tree-kill via CJS createRequire; sends cancelled SSE event; closes all client connections
- `addSseClient(jobId, res)`: sets SSE headers; if job finished — sends terminal event immediately and returns; if running — adds to clients Set, wires 'close' cleanup
- `listJobs()`: sanitized snapshot — excludes prompt, result, child, clients (SEC-08)
- `cancelAll()`: used in SIGTERM/SIGINT shutdown handler; iterates all running jobs
- Internal helpers: `sendSse(res, data)` (single SSE frame), `closeAllClients(job)` (iterates clients Set, calls res.end)
- Prompt is NEVER logged anywhere (SEC-08 compliance)

#### server/routes/jobs.js
- `POST /api/v1/jobs`: validates projectId (string non-empty), prompt (string non-empty), allowedTools (string if provided), maxTurns (integer 1-100 if provided); looks up project in ConfigStore; calls jobRunner.startJob; returns 201 `{ jobId, projectId, createdAt }`
- `GET /api/v1/jobs/:id/stream`: SSE endpoint; disables Express/Node timeouts (req.setTimeout(0), res.setTimeout(0)); delegates to jobRunner.addSseClient; does NOT call res.end() when found — JobRunner owns response lifetime
- `DELETE /api/v1/jobs/:id`: calls jobRunner.cancelJob; 204 on success; 404 if job not found; 409 if job not in cancellable state
- `GET /api/v1/jobs`: list all jobs (sanitized); bonus endpoint, not currently used by client UI

#### server/index.js changes
- Import: `jobRunner` from `./services/JobRunner.js`, `jobsRouter` from `./routes/jobs.js`
- After binary discovery: `jobRunner.claudeBin = claudeBin`
- Route mount: `app.use('/api/v1/jobs', jobsRouter)`
- Shutdown handler: `jobRunner.cancelAll()` called before `sessionManager.killAll()`

---

### [Task #10] Job Mode UI — JobPanel and react-markdown Result Rendering
- Agent: frontend-dev
- Added: client/src/hooks/useJob.js, client/src/components/JobPanel.jsx
- Modified: client/src/views/JobView.jsx (full implementation replacing stub), client/src/index.css (added .markdown-result styles)

#### client/src/hooks/useJob.js
- Custom hook `useJob(projectId)` — manages full job lifecycle
- State: status ('idle'|'running'|'done'|'cancelled'|'error'), streamEvents (array), result (string|null), error (string|null), jobId (string|null)
- Refs: esRef (EventSource), jobIdRef (current jobId — avoids stale closure in cancelJob)
- `startJob({ prompt, allowedTools, maxTurns })`: POST /api/v1/jobs → opens EventSource for SSE stream → parses 'done'/'cancelled'/other events
- `cancelJob()`: closes EventSource, DELETE /api/v1/jobs/:id (best-effort, swallows errors), sets status='cancelled'
- `reset()`: closes EventSource, resets all state to idle
- Guard: `if (status === 'running') return` in startJob prevents double-submission

#### client/src/components/JobPanel.jsx
- `JobPanel({ projectId })`: main export — 4 render modes: idle/running (prompt form + StreamLog), done (MarkdownResult), cancelled (message), error (error text)
- Ctrl+Enter or Cmd+Enter submits prompt (handleKeyDown)
- `StreamLog({ events })`: scrollable SSE event log; useEffect auto-scroll to bottomRef; shows "Waiting for output..." placeholder
- `renderEventContent(ev)`: extracts displayable text from stream-json events; handles assistant/result/raw event types; truncates at 200-300 chars
- `MarkdownResult({ result, onCopy, copyLabel })`: renders final result as Markdown via react-markdown + remark-gfm; Copy button writes to clipboard; within `.markdown-result` CSS scope
- `AdvancedOptions(...)`: collapsible panel with allowedTools (text) and maxTurns (number 1-100) inputs; disabled while job running

#### client/src/views/JobView.jsx
- Full implementation: reads activeProjectId + projects from AppContext; shows "Select a project" placeholder if none selected; renders header with project name + JobPanel

#### client/src/index.css
- Added `.markdown-result` scoped CSS: heading sizes (h1-h4), paragraph margin, list indent, inline code styling, code block dark background, blockquote border, table with striped rows, link color, hr style

---

### [Task #11] Projects View UI — Full Implementation
- Agent: frontend-dev
- Modified: client/src/views/ProjectsView.jsx (full implementation replacing stub)

#### client/src/views/ProjectsView.jsx
- `ProjectsView()`: loads projects via GET /api/v1/projects on mount; dispatches SET_PROJECTS to AppContext
- Project table columns: Name / Path (truncated with title tooltip) / Status (StatusBadge) / Created (formatDate) / Actions
- "Open Terminal" action: dispatches SET_ACTIVE_PROJECT + SET_VIEW 'terminal' — navigates to terminal for that project
- "Delete" action: shows ConfirmDialog modal; on confirm calls DELETE /api/v1/projects/:id; dispatches REMOVE_PROJECT
- "+ Register Project" button: shows AddProjectModal; on close re-fetches project list
- `StatusBadge({ active })`: green "Active" if sessions[project.id] truthy, grey "No session" otherwise; reads sessions from AppContext
- `ConfirmDialog({ projectName, onConfirm, onCancel, busy })`: fixed-position overlay; warns "no files deleted — registry only"; disables buttons while busy
- `formatDate(iso)`: locale date format; returns "—" on null/invalid input

---

### [Task #13] QA Test Suite
- Agent: qa-tester
- Added: server/tests/RingBuffer.test.js, server/tests/FileManager.test.js, server/tests/csrf.test.js, server/tests/pathValidation.test.js, server/tests/SessionManager.test.js, server/tests/JobRunner.test.js, server/vitest.config.js, docs/TEST_RESULTS.md

#### server/vitest.config.js
- New Vitest configuration: `environment: 'node'`, `pool: 'forks'` (sequential — prevents cross-test PTY interference), `testTimeout: 10000`, `include: ['tests/**/*.test.js']`, `reporters: ['verbose']`

#### server/tests/RingBuffer.test.js — 19 tests
- Tests: RingBuffer constructor (TypeError on zero/negative/float capacity), push string + Buffer, multiple pushes in order, empty push ignored, wrap-around overflow (oldest bytes discarded), single push larger than capacity (keeps last N bytes), multiple wrap-arounds, clear() (resets size + allows fresh write), toBuffer() idempotency
- Imports `{ RingBuffer }` from `../services/RingBuffer.js` — no mocks; all in-memory

#### server/tests/FileManager.test.js — 10 tests
- Tests: validatePath (accepts valid + nested + base itself, rejects `../../etc/passwd`, sibling dir prefix attack, absolute outside base, returns absolute path on success), readFile (existing file, ENOENT throws, traversal rejected), writeFile (atomic write, parent dirs created, overwrite, traversal rejected), listDirectory (lists files, [] on ENOENT)
- Uses real fs with per-test `os.tmpdir()` temp dir (mkdtemp + rm cleanup in afterEach)
- Imports `{ FileManager }` class directly (not singleton) for isolation

#### server/tests/csrf.test.js — 13 tests
- Tests: GET/HEAD/OPTIONS always pass (no header needed), POST/PUT/PATCH/DELETE require exact `X-Requested-With: ClaudeCodeManager`, wrong value → 403, empty string → 403, case-variant (`ClaudeCodemanager`) → 403, WebSocket upgrade (GET + upgrade header) passes, rejection body = `{ error: 'CSRF validation failed' }`
- Uses minimal mock req/res/next factory functions — no HTTP server instantiated

#### server/tests/pathValidation.test.js — 13 tests
- Tests: validateProjectPath (returns absolute, resolves relative, throws ApiError(400) for empty/whitespace/null/undefined/number), validateClaudePath (valid paths in single + multiple bases, traversal rejected, prefix-sharing sibling rejected, outside all bases → 400, empty bases array → 400), ApiError (statusCode, message, instanceof Error)
- Imports `{ validateProjectPath, validateClaudePath, ApiError }` directly

#### server/tests/SessionManager.test.js — 18 tests
- Tests: createSession shape + uniqueId + in listSessions, getSession unknown → undefined, listSessions (empty + multiple), attachClient (added to Set + buffer replay sent to ws.send), detachClient (removed from Set + session survives with status 'active' — core PTY persistence), writeInput (pty.write called + lastActivityAt updated, no-op on killed + unknown session), killSession (removed from map + status 'killed' + ws.close called + no-op on unknown), PTY tab-switch simulation (buffer retained across detach+reattach — ws2 receives replay), session switching (independent sessions per project)
- Mocks: `node-pty` (makeMockPty with _emit/_exit helpers), `ProcessRegistry` (register/unregister/cleanupStale as resolved vi.fn), `tree-kill` (calls callback immediately)
- Imports `{ SessionManager }` class (not `sessionManager` singleton)

#### server/tests/JobRunner.test.js — 18 tests
- Tests: startJob (throws if claudeBin unset, returns jobId+projectId+createdAt, stdin.end() called immediately — DEC-005 hang prevention, shell:false — SEC-02, job in listJobs status 'running', exit 0 → 'done' + completedAt, exit 1 → 'error'), cancelJob (false for unknown + already done, true for running, status stays 'cancelled' after SIGTERM exit — race prevention, sends `"type":"cancelled"` SSE event), cancelAll (all running → cancelled, done job unaffected), addSseClient (false for unknown, true + SSE headers for running, done job → immediately sends done event + res.end), listJobs (prompt absent — SEC-08, child/clients/result absent)
- Mocks: `child_process.spawn` via `vi.hoisted()` (PassThrough stdout/stderr, EventEmitter stdin with end mock), `tree-kill` (calls cb immediately)
- `vi.hoisted()` required because vi.mock factories hoist before variable declarations (TDZ issue)
- `PassThrough` used for stdout/stderr because readline.createInterface requires `.resume()` (not available on plain EventEmitter)

#### docs/TEST_RESULTS.md
- New document: records test runner config, total results (110 passed, 0 failed), per-suite breakdown with key behaviors verified

---

### [Task #14] Security Audit
- Agent: security
- Added: docs/SECURITY_AUDIT.md (no code files modified)

#### docs/SECURITY_AUDIT.md
- Pre-release audit of SEC-01 through SEC-10 and all route files
- **Verdict:** NEEDS_ATTENTION — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW
- All 10 SEC requirements: PASS (SEC-01 127.0.0.1 binding, SEC-02 shell:false, SEC-03 path traversal, SEC-04 write-atomic, SEC-05 WS payload cap, SEC-06 CSRF, SEC-07 Helmet CSP, SEC-08 no sensitive log, SEC-09 PTY cleanup, SEC-10 0 npm vulns)
- **MEDIUM-01:** `exec()` in browser auto-open helper (server/index.js) — deviates from shell:false policy; not exploitable today (URL is trusted) but latent risk
- **MEDIUM-02:** `allowedTools` param passed to `claude -p` is user-controlled; only type-checked (typeof string), not whitelist-validated
- **MEDIUM-03:** PIDs in `active_pids.json` (ProcessRegistry) deserialized without integrity check — tamper risk on shared machines
- **LOW-01/02:** informational findings
- Overall risk: LOW for single-user localhost threat model. MEDIUM findings should be addressed before release.

#### Connection Changes (security-relevant, no code modified)
- No function interfaces changed. Audit documents existing security properties of: server/index.js (SEC-01, SEC-02 note), server/middleware/csrf.js, server/middleware/pathValidation.js, server/services/FileManager.js, server/services/JobRunner.js, server/services/SessionManager.js, server/services/ProcessRegistry.js, server/middleware/security.js

---

### [Task #15] Documentation
- Agent: documenter
- Added/Modified: README.md (created/updated), docs/memory/DOC_STATUS.md, docs/memory/PROJECT.md (updated), docs/memory/PROGRESS.md (updated)

#### README.md
- Public-facing documentation: project overview, install+run instructions, feature list, architecture summary, API reference, environment variables table, tech stack, contributing notes

#### docs/memory/DOC_STATUS.md
- New file tracking documentation coverage status per module/feature

#### docs/memory/PROJECT.md
- Updated with latest project state, confirmed stack, constraints, known issues

#### docs/memory/PROGRESS.md
- Updated task completion status: Tasks #1-#15 reflected

#### Connection Changes
- No function interfaces changed. Documentation does not affect runtime behavior.

---

### [Task #16] Replace exec() with spawn({shell:false}) in openBrowser()
- Agent: security
- Modified: server/index.js

#### server/index.js :: openBrowser(url)
- **Change type:** MODIFIED (security fix — MEDIUM-01)
- **What changed:** Replaced `exec(\`start ${url}\`)` (or platform equivalent) with `spawn(bin, args, { shell: false, detached: true, stdio: 'ignore' })`. The URL is now passed as an element of the `args` array and is never interpolated into a shell string.
- **Why:** Security audit MEDIUM-01 identified that `exec()` passes the command as a shell string, meaning a malformed URL could inject shell metacharacters. The `spawn({ shell: false })` form passes arguments as an OS-level array — no shell expansion occurs.
- **Platform details:** Windows: `bin='cmd.exe'`, `args=['/c','start','',url]` — the empty string is a required title argument for `start`. macOS: `bin='open'`, `args=[url]`. Linux: `bin='xdg-open'`, `args=[url]`.

#### Functions Added
- `openBrowser(url)` in `server/index.js` — browser launch helper extracted as a named function (previously inline); uses spawn shell:false

#### Functions Modified
- `startup()` in `server/index.js` — now calls `openBrowser(url)` instead of inline exec; Last modified updated

#### Connection Changes
- startup() → openBrowser() (new internal call)

#### Impact on Other Code
- No callers outside server/index.js. NO_OPEN=1 env var still skips the browser open entirely.

---

### [Task #17] Add allowedTools whitelist validation in POST /api/v1/jobs
- Agent: security
- Modified: server/routes/jobs.js

#### server/routes/jobs.js :: POST /api/v1/jobs
- **Change type:** MODIFIED (security fix — MEDIUM-02)
- **What changed:** Added character-set whitelist validation for the `allowedTools` request body parameter before it is passed to `jobRunner.startJob()` (and ultimately to `spawn()` args). Validation rules: must be a string (already checked), max 512 chars (new), must match `/^[a-zA-Z0-9_,\-]+$/` (new). Returns HTTP 400 `{ error: 'Invalid allowedTools value' }` on violation.
- **Why:** Security audit MEDIUM-02 identified that `allowedTools` was only type-checked (`typeof string`) before being passed as a CLI argument. A user-controlled string containing shell metacharacters or path components could potentially influence CLI behavior.
- **Regex rationale:** Allows tool names (alphanumeric + underscore), lists (comma-separated), hyphenated names. Rejects spaces, semicolons, quotes, slashes, and all other shell-special characters.

#### Functions Modified
- `POST /api/v1/jobs` in `server/routes/jobs.js` — added allowedTools regex + length validation block; Last modified updated

#### Connection Changes
- None — same callers (useJob.js::startJob) and same callees (jobRunner.startJob). Interface unchanged; new validation raises 400 on previously-accepted malformed inputs.

#### Impact on Other Code
- **BREAKING for malformed inputs:** Clients sending `allowedTools` values containing spaces, slashes, or shell metacharacters will now receive HTTP 400 instead of having the value passed through. Well-formed values (e.g. `"all"`, `"Bash,Read,Write"`, `"computer-use"`) are unaffected.

---

### [Task #18] Add PID range guard in ProcessRegistry
- Agent: security
- Modified: server/services/ProcessRegistry.js

#### server/services/ProcessRegistry.js
- **Change type:** MODIFIED (security fix — MEDIUM-03)
- **What changed:** Added `isValidPid(pid)` guard function (range [1, 65535]) and applied it in both `register()` and `cleanupStale()`. In `register()`: if pid fails validation, log console.warn and return without writing to file. In `cleanupStale()`: filter out invalid PIDs with console.warn before passing to `killProcess()`.
- **Why:** Security audit MEDIUM-03 identified that `active_pids.json` is deserialized without integrity checks. On a shared machine or after file tampering, arbitrary integer values could reach `tree-kill` and send SIGKILL to unrelated OS processes (e.g. PID 1 = init/systemd).
- **Constants added:** `MIN_PID = 1`, `MAX_PID = 65535` (module-level, documented with rationale)

#### Functions Added
- `isValidPid(pid)` in `server/services/ProcessRegistry.js` — PID range guard: typeof number, isInteger, [1, 65535]

#### Functions Modified
- `register(pid, metadata)` in `server/services/ProcessRegistry.js` — added isValidPid guard at entry; console.warn on rejection; Last modified updated
- `cleanupStale()` in `server/services/ProcessRegistry.js` — added .filter(isValidPid) on PID list after Object.keys().map(Number); console.warn per skipped PID; Last modified updated

#### Connection Changes
- isValidPid() called by register() and cleanupStale() (new internal dependency)

#### Impact on Other Code
- register() callers (SessionManager, JobRunner): behavior unchanged for valid PIDs. For PIDs that are 0, negative, or > 65535, register() now silently skips (was: would write without validation). In practice child_process.spawn always returns valid PIDs, so this guard is defensive-only.
- cleanupStale() callers (startup, shutdown in index.js): behavior unchanged for normal files. Corrupt/tampered files now skip bad entries instead of passing them to tree-kill.

---

### [Debug & Security Audit] Bug Fixes — BUG-02, BUG-03, BUG-04, BUG-05, BUG-11, BUG-14, BUG-16
- Agent: debugger
- Modified: client/src/components/AddProjectModal.jsx, client/src/components/Sidebar.jsx, client/src/views/ProjectsView.jsx, client/src/hooks/useSession.js, server/services/SessionManager.js, server/utils/frontmatter.js

#### client/src/components/AddProjectModal.jsx (BUG-03)
- **Change type:** MODIFIED (bug fix)
- **What changed:** `handleSubmit` was POSTing to `/api/v1/projects/scaffold` (a non-existent endpoint). Fixed to POST to `/api/v1/projects` — the unified project creation endpoint that handles scaffolding via the `scaffold: boolean` field in the request body.
- **Root cause:** The endpoint was renamed/merged during Task #4 but the client component was not updated to match.

#### client/src/components/Sidebar.jsx (BUG-04 + BUG-05)

##### BUG-04: SET_PROJECTS payload destructuring
- **Change type:** MODIFIED (bug fix)
- **What changed:** The `useEffect` that loads projects on mount was reading `data.project` (singular) from the GET /api/v1/projects response. Fixed to `data.projects ?? []` (plural) to match the actual response shape `{ projects: [...] }`.
- **Root cause:** Typo/mismatch between expected and actual API response key name.

##### BUG-05: SET_SESSION payload destructuring
- **Change type:** MODIFIED (bug fix)
- **What changed:** `handleProjectClick` was dispatching `{ projectId: project.id, session: data.sessionId }` — incorrectly reading `data.sessionId` (the session ID string) from the POST /api/v1/sessions response. The actual response shape is `{ session: { sessionId, projectId, status, ... } }`. Fixed to `{ projectId: project.id, session: data.session }`.
- **Root cause:** Mismatch between expected flat response shape and actual nested response shape from sessions route.

#### client/src/views/ProjectsView.jsx (BUG-04)
- **Change type:** MODIFIED (bug fix)
- **What changed:** `loadProjects()` was reading `data.project` (singular) from the GET /api/v1/projects response. Fixed to `data.projects ?? []` for consistency with Sidebar fix.
- **Root cause:** Same as Sidebar BUG-04 — same API, same typo.

#### client/src/hooks/useSession.js (BUG-16)
- **Change type:** MODIFIED (bug fix)
- **What changed:** `WS_BASE` was hardcoded to `ws://127.0.0.1:3000`. Fixed to use `ws://127.0.0.1:${window.location.port || 3000}` so the WebSocket connection targets the actual running server port (controlled by PORT env var).
- **Root cause:** Port was hardcoded instead of dynamically derived from the page's own location.

#### server/services/SessionManager.js (BUG-02 + BUG-11)

##### BUG-02: Double unregister on PTY exit
- **Change type:** MODIFIED (bug fix)
- **What changed:** `killSession()` and the permanent `onExit` handler both called `ProcessRegistry.unregister(session.pid)` independently, causing a race condition: two concurrent writes to `active_pids.json`. Fixed by adding a `session._unregistered` sentinel flag. Both code paths set the flag before calling unregister; the second to run detects the flag already set and skips the call.
- **Root cause:** ProcessRegistry.unregister is async; the cleanup path was duplicated across two independent code paths (explicit kill + natural process exit) without coordination.

##### BUG-11: Backpressure guard on non-OPEN WebSockets
- **Change type:** MODIFIED (bug fix)
- **What changed:** The `onData` handler (permanent PTY output drain) was already guarding against slow clients via `ws._socket.bufferSize > 256KB`. Added a preceding guard: `if (ws.readyState !== WS_OPEN) continue`. Without this, a WebSocket in CLOSING state (readyState = 2) with a low buffer could still reach the `ws.send()` call, causing an error because send is invalid on non-OPEN sockets.
- **Root cause:** The backpressure guard covered the slow-client case but not the closing-socket case. The `ws.send()` call throws on non-OPEN sockets.

#### server/utils/frontmatter.js (BUG-14)
- **Change type:** MODIFIED (bug fix)
- **What changed:** `parseFrontmatter()` called `yaml.load()` and used the result as the frontmatter object. `yaml.load()` can return a scalar (string, number, `null`) for YAML blocks that are not key-value mappings (e.g. a YAML block containing only a string). Added type guard: only accept the result if `parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)`; otherwise fall back to `{}`.
- **Root cause:** `js-yaml`'s `yaml.load()` API does not guarantee an object return — it returns whatever the YAML represents. An agent/skill .md file with malformed or non-mapping YAML frontmatter would cause downstream code to crash when accessing properties like `frontmatter.name`.

#### Functions Added
- none

#### Functions Modified
- `handleSubmit` in `AddProjectModal.jsx` — endpoint corrected from /api/v1/projects/scaffold to /api/v1/projects
- `useEffect (loadProjects)` in `Sidebar.jsx` — data.project → data.projects
- `handleProjectClick` in `Sidebar.jsx` — data.sessionId → data.session
- `loadProjects()` in `ProjectsView.jsx` — data.project → data.projects
- `WS_BASE` in `useSession.js` — hardcoded port 3000 → dynamic window.location.port
- `onData handler` in `SessionManager.js` — added ws.readyState guard before ws.send
- `killSession()` in `SessionManager.js` — added _unregistered sentinel flag
- `onExit handler` in `SessionManager.js` — added _unregistered sentinel flag
- `parseFrontmatter()` in `frontmatter.js` — added type guard on yaml.load() result

#### Functions Removed
- none

#### Connection Changes
- AddProjectModal now calls POST /api/v1/projects (was calling POST /api/v1/projects/scaffold — non-existent)
- Sidebar::handleProjectClick now dispatches SET_SESSION with `data.session` object (was incorrectly passing `data.sessionId` string)

#### Impact on Other Code
- GET /api/v1/projects callers that were reading `data.project` (singular) in other parts of the codebase should be audited — only Sidebar and ProjectsView were found and fixed.
- SessionManager test suite (SessionManager.test.js): tests for killSession should be re-run to verify the _unregistered sentinel path; test file was not modified but behavior changed.
- frontmatter.js callers (agents.js, skills.js): now receive `{}` for malformed YAML frontmatter instead of potentially throwing downstream. Existing downstream code calling `frontmatter.name` etc. was already assuming an object; the fix makes this explicit.

---

## 2026-03-26

### [Tasks #24-#30] Phase 9 Frontend Redesign — All Views + App Shell
- Agent: frontend-dev (Tasks #24-#29), orchestrator (Task #30)
- Modified: client/src/App.jsx, client/src/components/Sidebar.jsx, client/src/views/ProjectsView.jsx, client/src/views/TerminalView.jsx, client/src/views/JobView.jsx
- Created: client/src/views/ContextEditorView.jsx, client/src/views/DeploymentManagerView.jsx

#### client/src/App.jsx (Task #30)
- **Change type:** MODIFIED (complete rewrite)
- **What changed:** Replaced single-component stub with three-component structure: App() wraps AppProvider, AppLayout() renders Sidebar + main area, MainContent() implements switch/case view router for 5 views (projects/terminal/jobs/context/deployments). Default case returns ProjectsView.
- **Why:** Phase 9 routing integration — App.jsx is now the single point of view routing, importing all 5 view components + Sidebar.

#### client/src/components/Sidebar.jsx (Task #24)
- **Change type:** MODIFIED (complete rewrite)
- **What changed:** Replaced v1 Sidebar with Phase 9 design. Now imports NAV_ITEMS from constants.js (was local array). Sub-components: SidebarHeader (branding), NavItem (icon+label per view), SessionItem (per active PTY session with PID badge), SidebarFooter (status dot + settings + version). Active PTY Sessions section shows live session count from AppContext.sessions.
- **Why:** Phase 9 navigation — 5 views instead of 4, design token compliance, active session visibility.

#### client/src/views/ProjectsView.jsx (Task #25)
- **Change type:** MODIFIED (complete rewrite)
- **What changed:** Replaced table-only view with dual-mode dashboard (grid cards + list table). New sub-components: StatusDot (animated ping for active), ProjectCard (card with context menu), CardMenu (outside-click dismiss), AddCard (dashed CTA), ListRow (table row). Search with "/" keyboard shortcut. timeAgo() replaces formatDate() for relative timestamps. Scaffold CTA banner at bottom.
- **Why:** Phase 9 Project Dashboard design matching Stitch export.

#### client/src/views/TerminalView.jsx (Task #26)
- **Change type:** MODIFIED (complete rewrite)
- **What changed:** Replaced minimal wrapper with three-part layout: PtyHeader (project name, path, memory badge, copy/split/kill buttons), Terminal.jsx embed (unchanged), StatusBarFooter (connection dot, daemon label, placeholder tokens/latency). handleKill() calls apiDelete + dispatches REMOVE_SESSION. EmptyState when no project selected.
- **Why:** Phase 9 Live Terminal Hub design. Terminal.jsx component is wrapped but not modified (DEC-009 constraint).

#### client/src/views/JobView.jsx (Task #27)
- **Change type:** MODIFIED (complete rewrite)
- **What changed:** Replaced simple JobPanel wrapper with three-pane Orchestration Center. Left pane: job queue with JobCard components (elapsed timer, status badges). Right pane: control bar (project/jobId/status) + output area. Output switches between PromptInput (idle), StreamLog (running), MarkdownOutput (done), error/cancelled states. Background jobs fetched from GET /api/v1/jobs every 5s via setInterval. In-memory job from useJob shown alongside. CopyButton for completed results. All sub-components inline (JobPanel.jsx no longer imported).
- **Why:** Phase 9 Orchestration Center design. JobPanel.jsx is now dead code.

#### client/src/views/ContextEditorView.jsx (Task #28 — NEW)
- **Change type:** CREATED
- **What changed:** New view for CLAUDE.md editing (replaces ClaudeMdEditor tab in old EntitiesView). Two-column layout: Rule Explorer (left) with editable RuleBlock components, CLAUDE.md Output (right) with syntax-highlighted line-numbered preview. Scope toggle (project/user). parseRules() splits content on "## " headings. Line count warning at threshold 80 (different from v1's 300). Save/discard/copy actions. Toast notifications.
- **API calls:** GET /api/v1/claudemd (load), PUT /api/v1/claudemd/project or /user (save)
- **Why:** Phase 9 Context & Rules Editor — replaces CLAUDE.md tab from EntitiesView. ClaudeMdEditor.jsx is now dead code.

#### client/src/views/DeploymentManagerView.jsx (Task #29 — NEW)
- **Change type:** CREATED
- **What changed:** New view for agents/skills management (replaces AgentEditor + SkillEditor tabs in old EntitiesView). 3-tab layout: Profiles (master-detail agent list + AgentDetail form with model selector, tools, body), Active Processes (shows live sessions from AppContext), Environment (skill viewer with read-only display). CreateAgentModal with name validation (^[a-z][a-z0-9-]*$). Search filter across agents/skills.
- **API calls:** GET/POST/PUT/DELETE /api/v1/agents, GET /api/v1/skills
- **Why:** Phase 9 Deployment Manager — replaces Agents/Skills tabs from EntitiesView. AgentEditor.jsx and SkillEditor.jsx are now dead code.

#### Functions Added
- `MainContent()` in App.jsx — 5-way view router switch
- `AppLayout()` in App.jsx — flex layout container (Sidebar + main)
- `SidebarHeader()` in Sidebar.jsx — branding header sub-component
- `NavItem({item, isActive, onClick})` in Sidebar.jsx — single nav button
- `SessionItem({projectId, session, projectName, isActive, onClick})` in Sidebar.jsx — PTY session list item
- `SidebarFooter()` in Sidebar.jsx — status + settings footer
- `timeAgo(iso)` in ProjectsView.jsx — relative time formatter
- `StatusDot({status})` in ProjectsView.jsx — animated status indicator
- `ProjectCard({project, status, onOpenTerminal, onDelete})` in ProjectsView.jsx — grid card
- `CardMenu({onOpenTerminal, onDelete, onClose})` in ProjectsView.jsx — context menu with outside-click dismiss
- `AddCard({onClick})` in ProjectsView.jsx — dashed CTA card
- `ListRow({project, status, onOpenTerminal, onDelete})` in ProjectsView.jsx — table row
- `PtyHeader({activeProject, session, sessionId, onKill})` in TerminalView.jsx — terminal header bar
- `StatusBarFooter({session})` in TerminalView.jsx — terminal status bar
- `EmptyState()` in TerminalView.jsx — no-project placeholder
- `JobCard({job, isSelected, onClick})` in JobView.jsx — job queue item with elapsed timer
- `StreamLog({events})` in JobView.jsx — SSE event log with auto-scroll
- `renderEventContent(ev)` in JobView.jsx — event content extractor
- `MarkdownOutput({result})` in JobView.jsx — react-markdown result renderer
- `PromptInput({onRun, onCancel, isRunning, canRun, prompt, setPrompt})` in JobView.jsx — inline prompt form
- `CopyButton({text})` in JobView.jsx — clipboard copy helper
- `formatDuration(startISO)` in JobView.jsx — HH:MM:SS formatter
- `statusLabel(status)` in JobView.jsx — status string formatter
- `ContextEditorView()` in ContextEditorView.jsx — main CLAUDE.md editor view
- `parseRules(content)` in ContextEditorView.jsx — split markdown into rule objects on "## " headings
- `rulesToContent(rules)` in ContextEditorView.jsx — serialize rules back to markdown
- `renderHighlightedLine(line, idx)` in ContextEditorView.jsx — syntax highlighting for preview pane
- `Header({scope, onScopeChange, ...})` in ContextEditorView.jsx — scope toggle + save/discard actions
- `Toast({message, type, onClose})` in ContextEditorView.jsx — auto-dismiss notification
- `RuleBlock({rule, index, ...})` in ContextEditorView.jsx — editable rule card
- `DeploymentManagerView()` in DeploymentManagerView.jsx — main deployment management view
- `AgentCard({agent, isSelected, onClick})` in DeploymentManagerView.jsx — agent list item
- `SkillCard({skill, isSelected, onClick})` in DeploymentManagerView.jsx — skill list item
- `AgentDetail({agent, activeProjectId, onSaved, onDeleted})` in DeploymentManagerView.jsx — agent edit form
- `CreateAgentModal({activeProjectId, onCreated, onClose})` in DeploymentManagerView.jsx — agent creation modal
- `ActiveProcessesTab()` in DeploymentManagerView.jsx — live process viewer
- `TabBar({activeTab, onTabChange, onRegister})` in DeploymentManagerView.jsx — tab navigation header
- `FormSection({title, children})` in DeploymentManagerView.jsx — form section wrapper
- `FormField({label, children})` in DeploymentManagerView.jsx — form field wrapper
- `Toast({message, type, onClose})` in DeploymentManagerView.jsx — auto-dismiss notification

#### Functions Removed (now dead code — files still on disk)
- `EntitiesView()` in EntitiesView.jsx — replaced by ContextEditorView + DeploymentManagerView
- `AgentEditor()`, `AgentForm()` in AgentEditor.jsx — replaced by DeploymentManagerView::AgentDetail
- `SkillEditor()`, `SkillForm()` in SkillEditor.jsx — replaced by DeploymentManagerView Environment tab
- `ClaudeMdEditor()`, `ClaudeMdPanel()` in ClaudeMdEditor.jsx — replaced by ContextEditorView
- `JobPanel()`, `StreamLog()`, `MarkdownResult()`, `AdvancedOptions()` in JobPanel.jsx — replaced by inline components in JobView.jsx
- `StatusBadge()`, old `ConfirmDialog()`, old `formatDate()` in old ProjectsView.jsx — replaced by Phase 9 internals

#### Connection Changes
- App.jsx now imports ContextEditorView and DeploymentManagerView (new dependencies)
- App.jsx no longer imports EntitiesView (removed dependency)
- Sidebar.jsx now imports NAV_ITEMS from constants.js (was local array; fulfills Task #23 design)
- JobView.jsx now imports apiGet, apiDelete from useApi.js (new — for background job polling/killing)
- JobView.jsx now imports ReactMarkdown, remarkGfm directly (was delegated to JobPanel.jsx)
- ContextEditorView.jsx calls /api/v1/claudemd endpoints (same as old ClaudeMdEditor)
- DeploymentManagerView.jsx calls /api/v1/agents and /api/v1/skills endpoints (same as old AgentEditor/SkillEditor)
- AppContext.jsx view type changed: 'entities' removed, 'context' and 'deployments' added

#### Impact on Other Code
- EntitiesView.jsx, AgentEditor.jsx, SkillEditor.jsx, ClaudeMdEditor.jsx, JobPanel.jsx are dead code — no runtime import. Should be cleaned up in a future task.
- ContextEditorView LINE_WARN_THRESHOLD changed from 300 (v1) to 80 — users will see warning earlier.
- DeploymentManagerView does not support skill editing (read-only view) — v1 SkillEditor supported full CRUD. This is a feature regression for skill write operations.

---

### [Task #31] Visual QA + Functional Regression Testing
- Agent: qa-tester
- No code modified — QA review task

#### Summary
Comprehensive QA pass on all Phase 9 frontend redesign work (Tasks #23-#30). Code review of all 7 new/modified view files, visual comparison against 5 Stitch design exports, routing/navigation verification, API integration audit, terminal safety check, and design system consistency review.

#### Results
- **Acceptance criteria:** 10/10 PASS
- **Test suite:** 110/110 tests pass (npm test)
- **Build:** 299 modules, 0 errors (npm run build)
- **Bugs found:** 0 CRITICAL, 0 HIGH, 0 MEDIUM
- **Advisory findings (LOW):** 3
  1. Dead EntitiesView.jsx file still on disk
  2. Minimal aria-label usage on interactive elements
  3. Some hardcoded hex colors in ContextEditorView.jsx instead of Tailwind tokens

#### Impact on Other Code
- No code changes. QA confirms Phase 9 is stable and ready for release.

---

### [Tasks #32-#40] Phase 10 — Bug Fix Execution
- Agent: antigravity
- Modified: server/middleware/security.js, server/services/JobRunner.js, client/src/components/Sidebar.jsx, client/src/components/Terminal.jsx, client/src/views/ContextEditorView.jsx, client/src/views/ProjectsView.jsx, client/src/components/AddProjectModal.jsx

#### Changes Summary
| Task | File | Bug | Fix |
|------|------|-----|-----|
| #32 | security.js | BUG-11 CSP blocks fonts | Added fonts.googleapis.com to styleSrc, fonts.gstatic.com to fontSrc |
| #33 | JobRunner.js | BUG-08 spawn crash | child.on('error') handler + stdin.end() try-catch |
| #34 | Sidebar.jsx | BUG-10 race condition | creatingSessionRef lock (useRef) |
| #35 | ContextEditorView.jsx | BUG-09 data loss | handleScopeSwitch with window.confirm guard |
| #36 | Terminal.jsx | BUG-17 bg mismatch | #1a1a1a → #000000 |
| #37 | Sidebar.jsx | BUG-18 no error feedback | sessionError state with 8s auto-clear message |
| #38 | Sidebar.jsx | BUG-19/20 footer | Dynamic version via /api/v1/version, settings icon de-interactivized |
| #39 | Sidebar.jsx | BUG-13 logo overflow | overflow-hidden on container |
| #40 | ProjectsView+AddProjectModal | BUG-14/16/21 | modalMode state, mode prop, focus:opacity-100 accessibility |

#### Functions Added
- `handleScopeSwitch(newScope)` in ContextEditorView.jsx
- `child.on('error')` handler in JobRunner.js

#### Functions Modified
- `startJob()`, `SidebarFooter()`, `SidebarHeader()`, `handleProjectClick()`, `AddProjectModal()`, `ProjectsView()`, `XTERM_OPTIONS`

#### Build: 299 modules, 0 errors

---

### [Task #42] Terminal Bug Fix
- Agent: antigravity
- Modified: client/src/views/ProjectsView.jsx

#### Changes Summary
- **Bug Fixed**: Clicking "Open Terminal" from a project card did not create a backend session.
- **Fix**: Updated `handleOpenTerminal` in `ProjectsView.jsx` to make a `POST /api/v1/sessions` request if no session exists for the project, setting the session in AppContext before navigating to the terminal view.
- **Build Result**: 6/6 test files passed, 299 modules successfully built with 0 errors.

---
## 2026-03-27 — Task #43: WorkflowStore.js

---
**Agent:** backend-dev
**Triggered by:** V3 Phase 1 — persist workflow definitions to disk (FR-V3-03, SEC-V3-02, SEC-V3-06)

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/WorkflowStore.js | ADDED | Full CRUD service for workflow JSON files; atomic writes; path-traversal guard; schema validation |
| server/index.js | MODIFIED | Import + instantiate WorkflowStore; call workflowStore.init() in startup sequence with try/catch warn |

### Functions Added
- `WorkflowStore.init()` in `server/services/WorkflowStore.js` — creates workflows/ directory on first run
- `WorkflowStore.list()` in `server/services/WorkflowStore.js` — returns all stored WorkflowDefinition objects
- `WorkflowStore.get(id)` in `server/services/WorkflowStore.js` — returns single WorkflowDefinition or null; path-safe
- `WorkflowStore.create(data)` in `server/services/WorkflowStore.js` — validates, generates UUID, atomic write
- `WorkflowStore.update(id, data)` in `server/services/WorkflowStore.js` — validates, merges, atomic write; throws 404 if not found
- `WorkflowStore.delete(id)` in `server/services/WorkflowStore.js` — unlinks file; returns boolean
- `WorkflowStore.validate(data)` in `server/services/WorkflowStore.js` — schema validation; never throws; returns `{valid, errors[]}`
- `WorkflowStore._resolveFilePath(id)` in `server/services/WorkflowStore.js` — path-traversal guard; returns null on invalid input
- `WorkflowStore._writeWorkflow(workflow)` in `server/services/WorkflowStore.js` — atomic write via write-file-atomic

### Functions Modified
- `startup()` in `server/index.js` — now instantiates WorkflowStore and calls workflowStore.init() (new dependency added)

### Connection Changes
- server/index.js → server/services/WorkflowStore.js (new import)
- WorkflowStore.create/update → WorkflowStore.validate (internal call chain)
- WorkflowStore.create/update → WorkflowStore._writeWorkflow (internal call chain)
- WorkflowStore._writeWorkflow → WorkflowStore._resolveFilePath (internal)
- WorkflowStore.get/delete → WorkflowStore._resolveFilePath (internal)
- WorkflowStore.list → WorkflowStore.get (internal)

### Impact on Other Code
- workflow routes (routes/workflows.js) do not yet exist — WorkflowStore is initialized but not yet called by any route handler
- No breaking changes to existing endpoints

---

## 2026-03-27 — Task #45: HandoffParser.js + Unit Tests

---
**Agent:** backend-dev
**Triggered by:** V3 Phase 1 — stateful rolling buffer extractor for ConPTY __HANDOFF__ / __DONE__ tokens spanning multiple PTY onData chunks (DEC-012, SEC-V3-07)

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/HandoffParser.js | ADDED | Pure class: stateful rolling 4KB buffer; ANSI strip; __HANDOFF__ + __DONE__ token extraction; contextUpdate validation |
| server/tests/HandoffParser.test.js | ADDED | 22 unit tests covering all 9 required scenarios + edge cases (malformed base64, schema violation, buffer cap, ANSI stripping, chunk-split tokens) |

### Functions Added
- `HandoffParser.feed(rawChunk)` in `server/services/HandoffParser.js` — main entry point; strips ANSI; accumulates buffer; extracts tokens; returns event array
- `HandoffParser._validateContext(obj)` in `server/services/HandoffParser.js` — validates contextUpdate: flat dict, max 50 keys, primitive values, string max 1024 chars
- `HandoffParser.reset()` in `server/services/HandoffParser.js` — clears accumulator buffer

### Connection Changes
- HandoffParser is not yet wired to any PTY onData handler — reserved for SwarmEngine (Task #46+)
- server/tests/HandoffParser.test.js imports `{ HandoffParser }` directly from services/HandoffParser.js

### Impact on Other Code
- Test count increases from 110 to 132 (22 new HandoffParser tests)
- No changes to any existing function interfaces

---
## 2026-03-27 — /create Pipeline — V3 Planning Complete (no code changes)
**Type:** PLANNING
**Files created:**
- `docs/PRD.md` — V3 Multi-Agent Swarm Orchestrator PRD (47 FR + 7 SEC requirements, 6 implementation phases, API routes, data schemas, user stories)
- `docs/research_complete.md` — Master research synthesis (OpenAI Swarm CLI adaptation, React Flow v12 group nodes, Claude CLI PTY injection patterns)
- `docs/research_a.md` — OpenAI Swarm framework research
- `docs/research_b.md` — React Flow v12 GroupNode / DepartmentNode research
- `docs/research_c.md` — Claude CLI PTY Live Injection research
**TASK_PLAN.md updated:** V3 tasks #43–#82 appended (40 tasks, 7 phases)
**CODE_MAP.md:** No update needed — no source code modified
**Breaking changes:** none
---
