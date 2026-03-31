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

## 2026-03-27 — Task #46.2: SwarmEngine startExecution + _spawnAgentPty + HandoffParser tap
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — implement SwarmEngine core execution loop: startExecution, PTY spawn, HandoffParser integration via swarmListeners tap (DEC-014), stub handlers for handoff/done events

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/SwarmEngine.js | MODIFIED | Implemented startExecution, _spawnAgentPty, _ensureAgentPty, _onHandoff, _onDone; updated stopExecution to remove tapFn from swarmListeners before killSession; added stub bodies for _buildSystemPrompt and _startHeartbeat |

### Functions Added
- `SwarmEngine.startExecution(workflowId, projectId, projectPath)` in `server/services/SwarmEngine.js` — loads workflow, creates WorkflowExecution record, finds triage node, spawns its PTY; returns executionId
- `SwarmEngine._spawnAgentPty(executionId, nodeId)` in `server/services/SwarmEngine.js` — creates PTY session, writes system prompt, creates HandoffParser, registers tapFn on ptySession.swarmListeners, initializes agentStates entry, emits WS agent_status
- `SwarmEngine._ensureAgentPty(executionId, nodeId)` in `server/services/SwarmEngine.js` — reuse active PTY or spawn new; returns sessionId
- `SwarmEngine._onHandoff(executionId, sourceNodeId, event)` in `server/services/SwarmEngine.js` — stub: broadcasts WS handoff_started event; full routing deferred to #46.3/#62
- `SwarmEngine._onDone(executionId, nodeId)` in `server/services/SwarmEngine.js` — stub: marks agentStates entry as 'done', broadcasts WS execution_status event; full completion logic deferred to #62.3
- `SwarmEngine._buildSystemPrompt(node, workflowContext, handoffTargets)` in `server/services/SwarmEngine.js` — stub (empty body); full implementation in Task #46.3
- `SwarmEngine._startHeartbeat(executionId)` in `server/services/SwarmEngine.js` — stub (empty body); full implementation in Task #46.3
- `SwarmEngine.getStatus(executionId)` in `server/services/SwarmEngine.js` — return serializable snapshot of execution state

### Functions Modified
- `SwarmEngine.stopExecution(executionId)` in `server/services/SwarmEngine.js` — added tapFn removal loop (iterates agentStates, removes each tapFn from ptySession.swarmListeners before killSession loop); this prevents late PTY output from firing tap callbacks during shutdown

### Connection Changes
- SwarmEngine._spawnAgentPty → SessionManager.createSession (new dependency: PTY creation)
- SwarmEngine._spawnAgentPty → SessionManager.writeInput (new dependency: system prompt injection)
- SwarmEngine._spawnAgentPty → SessionManager.getSession (new dependency: access swarmListeners Set)
- SwarmEngine._spawnAgentPty → HandoffParser (new: one HandoffParser instance per agent PTY, wired via tapFn closure on ptySession.swarmListeners)
- SwarmEngine._spawnAgentPty tapFn → HandoffParser.feed (new: every PTY onData chunk is fed to HandoffParser)
- SwarmEngine._spawnAgentPty tapFn → SwarmEngine._onHandoff (new: triggered on handoff events from parser)
- SwarmEngine._spawnAgentPty tapFn → SwarmEngine._onDone (new: triggered on done events from parser)
- SwarmEngine.startExecution → WorkflowStore.get (new: loads workflow definition)
- SwarmEngine.stopExecution → SessionManager.getSession (new: tapFn cleanup before kill)
- SwarmEngine.stopExecution → SessionManager.killSession (existing pattern, now preceded by tapFn cleanup)
- HandoffParser.feed "Called by" updated: now wired via SwarmEngine._spawnAgentPty tapFn (was "not yet wired")

### Impact on Other Code
- SessionManager.swarmListeners Set (added in DEC-014 prep, Task prior to #46) is now actively used — tapFns registered and removed per SwarmEngine lifecycle
- HandoffParser is now consumed by SwarmEngine (no longer a standalone service) — callers of HandoffParser directly in tests are unaffected
- No breaking changes to existing endpoints or public function interfaces
- SwarmEngine is not yet integrated into server/index.js or any route — not callable via HTTP as of Task #46.2

---

## 2026-03-27 — Task #46.3: SwarmEngine._buildSystemPrompt + _startHeartbeat
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — implement the two stub methods left incomplete in Task #46.2: _buildSystemPrompt (OpenAI Swarm pattern prompt assembly) and _startHeartbeat (5-min keepalive timer); also wire _startHeartbeat into startExecution

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/SwarmEngine.js | MODIFIED | Implemented _buildSystemPrompt and _startHeartbeat (both were empty stubs); startExecution now calls _startHeartbeat after _spawnAgentPty |

### Functions Modified
- `SwarmEngine._buildSystemPrompt(node, workflowContext, handoffTargets)` in `server/services/SwarmEngine.js` — fully implemented from stub: assembles multi-section prompt with agent role, SWARM PROTOCOL header, conditional workflowContext block (omitted when empty), conditional handoff instruction block (omitted when no targets, includes __HANDOFF__ format + target IDs + context update constraints), and __DONE__ instruction; returns joined string
- `SwarmEngine._startHeartbeat(executionId)` in `server/services/SwarmEngine.js` — fully implemented from stub: creates 5-minute setInterval writing empty string to all running agent PTYs, stores timer on execution.heartbeatTimer, calls timer.unref() for clean process exit
- `SwarmEngine.startExecution(workflowId, projectId, projectPath)` in `server/services/SwarmEngine.js` — added call to _startHeartbeat(executionId) immediately after _spawnAgentPty returns; now also stores heartbeatTimer: null on the initial execution object

### Connection Changes
- SwarmEngine.startExecution → SwarmEngine._startHeartbeat (new call — wired from stub to live)
- SwarmEngine._startHeartbeat → SessionManager.writeInput (periodic — every 300,000ms per running agent)

### Impact on Other Code
- SwarmEngine.stopExecution already clears heartbeatTimer via clearInterval — no change needed there
- No callers affected outside SwarmEngine itself

---

## 2026-03-27 — Task #49: CircuitBreaker.js + BudgetTracker.js
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — create two advisory safety services for the swarm execution engine: CircuitBreaker (handoff loop detection) and BudgetTracker (token budget estimation); both advisory-only per FR-V3-17 and FR-V3-18

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/CircuitBreaker.js | ADDED | New file — single-method advisory circuit breaker |
| server/services/BudgetTracker.js | ADDED | New file — char-accumulating token budget tracker |

### Functions Added
- `CircuitBreaker.check(edgeId, counter, threshold)` in `server/services/CircuitBreaker.js` — returns boolean; true when counter >= threshold (default 10); advisory only — does not stop execution
- `BudgetTracker.estimate(charCount)` in `server/services/BudgetTracker.js` — Math.ceil(charCount / 4); heuristic 1 token ≈ 4 chars
- `BudgetTracker.track(sessionId, outputChunk)` in `server/services/BudgetTracker.js` — accumulates outputChunk.length in _sessionChars Map per sessionId
- `BudgetTracker.registerSession(executionId, sessionId)` in `server/services/BudgetTracker.js` — registers sessionId under executionId in _executionSessions Map for cross-session totaling
- `BudgetTracker.getTotal(executionId)` in `server/services/BudgetTracker.js` — sums chars for all sessions in execution, calls estimate(); returns token estimate
- `BudgetTracker.checkBudget(executionId, limitTokens)` in `server/services/BudgetTracker.js` — calls getTotal(), returns { exceeded: boolean, estimatedUsed: number }; advisory only
- `BudgetTracker.clearExecution(executionId)` in `server/services/BudgetTracker.js` — removes all _sessionChars and _executionSessions entries for this execution; meant to be called from SwarmEngine.stopExecution

### Connection Changes
- SwarmEngine._spawnAgentPty tapFn already has a conditional `if (this._budgetTracker)` block that calls BudgetTracker.track and BudgetTracker.checkBudget — this code path is now live once _budgetTracker is attached to SwarmEngine (wiring task pending)
- CircuitBreaker is not yet imported or wired to SwarmEngine; connection is pending a future handoff routing task
- BudgetTracker.registerSession is not yet called from _spawnAgentPty — pending wiring task

### Impact on Other Code
- Neither file is imported by any existing module — they are standalone services awaiting wiring into SwarmEngine
- SwarmEngine tapFn already guards all _budgetTracker calls with `if (this._budgetTracker)` — safe to wire without code changes to tapFn
- SwarmEngine.stopExecution should call BudgetTracker.clearExecution to prevent memory leaks — not yet wired

---

## 2026-03-27 — Task #47.1: server/routes/swarm.js — Swarm Execution Control REST API
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — implement 7 REST endpoints for swarm execution lifecycle control (start, pause, resume, stop, status, agent output, broadcast); factory pattern to accept swarmEngine + sessionManager

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/routes/swarm.js | ADDED | Factory fn swarmRoutes(swarmEngine, sessionManager) — 7 live endpoints + 1 stub (scaffold → 501) |
| server/index.js | MODIFIED | Added swarm routes import + mount at /api/v1/swarm using app.locals.swarmEngine + app.locals.sessionManager; sessionManager stored in app.locals |

### Functions Added
- `swarmRoutes(swarmEngine, sessionManager)` in `server/routes/swarm.js` — factory returning Express Router with all swarm endpoints
- `POST /:workflowId/start` in `server/routes/swarm.js` — validates projectId + projectPath, calls swarmEngine.startExecution → 201 { executionId, status }
- `POST /:executionId/pause` in `server/routes/swarm.js` — sends \x03 Ctrl-C to all running agent sessions via sessionManager.writeInput
- `POST /:executionId/resume` in `server/routes/swarm.js` — no-op stub; returns 200 { ok: true }; full HITL deferred to Task #70
- `DELETE /:executionId` in `server/routes/swarm.js` — calls swarmEngine.stopExecution → 204
- `GET /:executionId/status` in `server/routes/swarm.js` — calls swarmEngine.getStatus → 200 snapshot or 404
- `GET /:executionId/agent/:nodeId/output` in `server/routes/swarm.js` — resolves execution→agentState→session→buffer.toString() → 200 { output }
- `POST /:executionId/broadcast` in `server/routes/swarm.js` — scope-filtered text injection; soft (ESC marker) or hard (Ctrl-C + 300ms + text + 100ms + newline, fire-and-forget) mode
- `POST /:workflowId/scaffold` in `server/routes/swarm.js` — 501 stub; full implementation in Task #59

### Functions Modified
- `startup()` in `server/index.js` — now stores sessionManager in app.locals; mounts swarmRoutes; note: SwarmEngine instantiated AFTER route mount which means app.locals.swarmEngine is set after swarmRoutes is called — factory accesses it at request time (not at mount time). Potential ordering issue noted.

### Connection Changes
- server/index.js → server/routes/swarm.js (new import)
- server/routes/swarm.js → server/services/SwarmEngine.js (swarmEngine.startExecution, getStatus, stopExecution)
- server/routes/swarm.js → server/services/SessionManager.js (sessionManager.writeInput, getSession)
- SwarmEngine.startExecution now has a live caller (POST /:workflowId/start)
- SwarmEngine.stopExecution now has a live caller (DELETE /:executionId)
- SwarmEngine.getStatus now has live callers (pause, resume, status, agent-output, broadcast handlers)

### Impact on Other Code
- app.locals.swarmEngine is set AFTER `app.use('/api/v1/swarm', swarmRoutes(...))` is called in startup(). The factory closes over the reference at call time, not at request time. If swarmEngine is not yet on app.locals when routes are mounted, handlers will crash on first request. This ordering risk is present in the current code and should be verified.
- No breaking changes to existing endpoints

---

## 2026-03-27 — Task #48.1: server/ws/swarmHandler.js — Channel Routing + Connection Management
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — implement WebSocket handler for /ws/swarm path: subscriber registry per executionId, connection lifecycle, initial status snapshot on connect

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/ws/swarmHandler.js | ADDED | handleSwarmConnection (default export), getSubscribers (named export), module-level _subscribers Map |
| server/index.js | MODIFIED | Two noServer WSS instances (wssTerminal + wssSwarm, 1MB maxPayload each); server.on('upgrade') router (/ws/swarm* → wssSwarm, else → wssTerminal); SwarmEngine instantiated and stored in app.locals.swarmEngine; app.locals.sessionManager set |

### Functions Added
- `handleSwarmConnection(ws, req, swarmEngine)` in `server/ws/swarmHandler.js` — default export; registers ws in _subscribers, sends initial status snapshot, cleans up on close/error
- `getSubscribers(executionId)` in `server/ws/swarmHandler.js` — named export; returns current Set\<WebSocket\> for executionId, or empty Set; used by future broadcast implementation (Task #48.2)
- `_subscribers` Map in `server/ws/swarmHandler.js` — module-level state: executionId → Set\<WebSocket\>

### Functions Modified
- `startup()` in `server/index.js` — added wssTerminal + wssSwarm noServer WebSocket servers; server.on('upgrade') routes by pathname prefix; SwarmEngine instantiated with (sessionManager, workflowStore) and stored in app.locals; app.locals.sessionManager set; swarmRoutes mounted using app.locals references

### Connection Changes
- server/index.js → server/ws/swarmHandler.js (new import: handleSwarmConnection)
- server/index.js::wssSwarm → handleSwarmConnection (wires WSS connection event to handler)
- server/index.js::server.on('upgrade') routes WS upgrades: /ws/swarm* → wssSwarm; all others → wssTerminal
- handleSwarmConnection → swarmEngine.getStatus (reads initial snapshot on WS connect)
- SwarmEngine now instantiated in server/index.js (was not previously in startup sequence)
- app.locals.swarmEngine and app.locals.sessionManager now set — accessible to all route handlers

### Impact on Other Code
- setupTerminalWebSocket() called with wssTerminal (noServer instance) instead of a server-attached WSS — no behavioral change since setupTerminalWebSocket only binds .on('connection'); upgrade routing replaces the previous implicit handling
- getSubscribers() currently has no callers — it is the hook for Task #48.2 broadcast fan-out implementation
- SwarmEngine constructor runs after workflowStore init; if workflowStore init fails (non-fatal warn), swarmEngine is constructed with a null/undefined workflowStore — startExecution will throw 'Workflow not found' for all requests in that case

---

## 2026-03-27 — Task #47.2: server/routes/swarm.js — scaffold stub (POST /scaffold → 501)
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — confirm scaffold stub is present in swarm.js; no new code written — stub was already placed in Task #47.1

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| docs/TASK_PLAN.md | MODIFIED | Task #47.2 marked COMPLETED — scaffold stub confirmed already present from Task #47.1 |

### Functions Added
- none (scaffold stub was already present from Task #47.1 as `POST /:workflowId/scaffold` → 501)

### Functions Modified
- none

### Connection Changes
- none (no source code changed)

### Impact on Other Code
- none

---

## 2026-03-27 — Task #48.2: server/ws/swarmHandler.js — broadcast() + WS event wiring
**Agent:** backend-dev
**Triggered by:** V3 Phase 2 — add broadcast(executionId, event) named export to swarmHandler.js; wire SwarmEngine WS events to subscribers by calling swarmEngine.setWsBroadcast(broadcast) in server/index.js

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/ws/swarmHandler.js | MODIFIED | Added broadcast(executionId, event) named export — iterates subscribers Set, sends JSON to OPEN connections only (readyState === 1), skips non-OPEN connections silently |
| server/index.js | MODIFIED | Added broadcast to the named imports from swarmHandler.js; added swarmEngine.setWsBroadcast(broadcast) call immediately after SwarmEngine is instantiated |

### Functions Added
- `broadcast(executionId, event)` in `server/ws/swarmHandler.js` — fans out JSON event to all OPEN WebSocket subscribers for a given executionId; calls getSubscribers(); readyState === 1 guard prevents send() on closing/closed sockets

### Functions Modified
- `startup()` in `server/index.js` — now imports broadcast from swarmHandler.js and calls swarmEngine.setWsBroadcast(broadcast) to wire execution events to WS clients; `broadcast` is imported as a named export alongside the default handleSwarmConnection
- `SwarmEngine.setWsBroadcast(fn)` — caller updated: previously "not yet implemented — future task"; now called from server/index.js::startup()

### Connection Changes
- server/index.js → server/ws/swarmHandler.js::broadcast (new named import)
- server/index.js::startup() → swarmEngine.setWsBroadcast(broadcast) (new call — wires SwarmEngine emission path to WS subscribers)
- server/ws/swarmHandler.js::broadcast → getSubscribers (internal call — now getSubscribers has its first real caller)
- SwarmEngine._wsBroadcast is now set at startup — all methods that call this._wsBroadcast (e.g. _spawnAgentPty, _onHandoff, _onDone) will now deliver events to connected WS clients

### Impact on Other Code
- SwarmEngine._spawnAgentPty, _onHandoff, _onDone all call this._wsBroadcast — these were previously no-ops when _wsBroadcast was null; now they deliver live events to subscribers
- getSubscribers() now has its first real caller (broadcast) — was previously documented as "no callers" since Task #48.1
- broadcast() silently skips non-OPEN connections — callers do not need to handle partial-send errors

---

## 2026-03-27 — Task #50: V3 Security Layer (SEC-V3-01 through SEC-V3-07)
**Agent:** security
**Triggered by:** V3 Phase 1 security hardening — SSRF prevention for RSS polling, webhook body cap, webhook rate limiter, HITL payload cap, and confirmation that WorkflowStore + HandoffParser already implement their schema/buffer caps correctly

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/utils/ssrfGuard.js | ADDED | Synchronous SSRF prevention guard: isSafeUrl() blocks private/loopback/link-local IP literals and localhost. Covers IPv4, IPv6 loopback, IPv4-mapped IPv6 (dotted + hex-word forms). No DNS lookup (synchronous-only design). (SEC-V3-03) |
| server/middleware/webhookLimit.js | ADDED | Express JSON body-parser capped at 32 KB. For use in routes/triggers.js (Task #75). (SEC-V3-01) |
| server/middleware/webhookRateLimit.js | ADDED | Express middleware: 10 requests/minute/IP rate limiter for webhook routes. In-memory Map with periodic stale-sweep (unref'd). Returns HTTP 429 on excess. For use in routes/triggers.js (Task #75). (SEC-V3-04) |
| server/middleware/hitlValidation.js | ADDED | Express middleware: rejects resumeText body field exceeding 8 KB (8192 chars) with HTTP 400. For use in routes/inbox.js (Task #68). (SEC-V3-05) |
| server/tests/security-v3.test.js | ADDED | 36-test Vitest suite: 18 tests for isSafeUrl (SEC-V3-03), 9 tests for WorkflowStore schema validation (SEC-V3-02+06), 3 tests for HandoffParser oversized payload (SEC-V3-07), 5 tests for validateResumeText (SEC-V3-05). |
| server/services/WorkflowStore.js | VERIFIED (no changes) | Schema validation for name (max 100 chars, character whitelist), description (max 500 chars), nodes (max 50), systemPrompt (max 16 KB) was already correctly implemented. SEC-V3-02 + SEC-V3-06 confirmed by tests. |
| server/services/HandoffParser.js | VERIFIED (no changes) | 4 KB buffer cap and contextUpdate validation (max 50 keys, string values max 1024 chars) was already correctly implemented. SEC-V3-07 confirmed by tests. |

### Functions Added
- `isSafeUrl(urlString)` in `server/utils/ssrfGuard.js` — synchronous SSRF URL safety check; returns boolean; no DNS lookup (intentional)
- `_isIPv4(host)` in `server/utils/ssrfGuard.js` — private helper; detects bare IPv4 dotted-decimal strings
- `_isPublicIPv4(ip)` in `server/utils/ssrfGuard.js` — private helper; rejects RFC-1918/loopback/link-local IPv4 ranges
- `webhookLimit` in `server/middleware/webhookLimit.js` — default export; express.json({ limit: '32kb' }) instance
- `webhookRateLimit(req, res, next)` in `server/middleware/webhookRateLimit.js` — default export; 10 req/min/IP limiter with in-memory Map + unref'd sweep interval
- `validateResumeText(req, res, next)` in `server/middleware/hitlValidation.js` — named export; 8 KB resumeText cap; returns 400 on excess

### Functions Modified
- none

### Functions Removed
- none

### Connection Changes
- `server/utils/ssrfGuard.js::isSafeUrl` — future caller: TriggerManager.js RSS polling (Task #75). Currently no live callers (test-only).
- `server/middleware/webhookLimit.js::webhookLimit` — future caller: routes/triggers.js webhook handler (Task #75). Currently no live callers.
- `server/middleware/webhookRateLimit.js::webhookRateLimit` — future caller: routes/triggers.js webhook handler (Task #75). Currently no live callers.
- `server/middleware/hitlValidation.js::validateResumeText` — future caller: routes/inbox.js POST /resume/:id (Task #68). Currently no live callers.
- `server/tests/security-v3.test.js` imports: isSafeUrl from ssrfGuard.js, WorkflowStore from WorkflowStore.js, HandoffParser from HandoffParser.js, validateResumeText from hitlValidation.js

### Impact on Other Code
- Test total increases from 132 to 168 (36 new security-v3 tests). 168/168 pass.
- All 4 new security modules are middleware/utility stubs awaiting wiring — no existing route is affected.
- SEC-V3-02/06 and SEC-V3-07 verified: WorkflowStore and HandoffParser have no code changes; tests confirm existing behavior is already correct.

---

## 2026-03-27 — Task #51: @xyflow/react + zustand install
**Agent:** devops
**Triggered by:** V3 Phase 3 pre-requisite — install React Flow v12 (graph canvas library) and Zustand v4 (state management) in the client before workflow canvas implementation tasks begin

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/package.json | MODIFIED | Added `@xyflow/react: ^12.10.1` and `zustand: ^4.5.7` to dependencies |
| client/package-lock.json | MODIFIED | Lock file updated with resolved versions @xyflow/react@12.10.1, zustand@4.5.7, and all transitive dependencies |

### Functions Added
- none (dependency install only — no source code added)

### Functions Modified
- none

### Functions Removed
- none

### Connection Changes
- `@xyflow/react@12.10.1` is now available for import in all client source files. Primary intended consumer: future workflow canvas view components (V3 Phase 3, Tasks #52+).
- `zustand@4.5.7` (v4, not v5) is now available for import in all client source files. Note: v4 API (`create`, `useStore`) not v5 API. Primary intended consumer: workflow execution store.
- No existing client code imports either library yet — they are installed but unused until canvas tasks begin.

### Impact on Other Code
- Build verified: 299 modules, 0 errors after install. 132 server tests pass (client has no test suite).
- zustand version pinned to v4.5.7 (not v5) — future tasks must use v4 API. BREAKING if someone accidentally uses v5 `create` import path.
- @xyflow/react@12.10.1 is the React 18-compatible React Flow v12 package (the old package was `reactflow`; this is the v12 rename). Future canvas components must import from `@xyflow/react` not `reactflow`.

---

## 2026-03-27 — Task #52: client/src/store/SwarmContext.jsx — Zustand ExecutionStore
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — create Zustand v4 store for all swarm execution state consumed by canvas + inspector panel components

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/store/SwarmContext.jsx | ADDED | useSwarmStore Zustand v4 store: 9 state fields + 12 action methods; isolated from AppContext |

### Functions Added
- `useSwarmStore` in `client/src/store/SwarmContext.jsx` — Zustand create() store; dual export (default + named)
- `setExecution(id, status)` — set activeExecutionId + executionStatus atomically
- `updateAgentState(nodeId, patch)` — non-destructive partial merge into agentStates[nodeId]
- `updateEdgeCounter(edgeId, count)` — set edge handoff counter for canvas animation
- `updateBudget(used, limit)` — update budget display state (estimatedTokensUsed + limitTokens)
- `addInboxItem(item)` — append HITL approval item to inboxItems list
- `resolveInboxItem(itemId)` — remove resolved HITL item by id
- `addFeedEvent(event)` — append handoff event, trimmed to last 100 (slice(-100))
- `setFocusedDepartment(id)` — forward-navigate into a department; pushes id to departmentStack
- `navigateBreadcrumb(index)` — rewind breadcrumb stack to index; sets focusedDepartmentId to new top
- `setSelectedNode(id)` — set selectedNodeId for AgentInspector panel
- `setWsConnected(b)` — track swarm WS connection health
- `reset()` — restore all 9 state fields to initial values

### Functions Modified
- none

### Connection Changes
- client/src/store/SwarmContext.jsx created with no callers yet — awaiting Task #53.x (AgentNode, DepartmentNode, TriggerNode) and canvas/WS event handler wiring
- No imports from AppContext.jsx or App.jsx — fully isolated Zustand store

### Impact on Other Code
- All future swarm canvas components (AgentNode, DepartmentNode, TriggerNode, AgentInspector, BudgetBar, breadcrumb nav) should import `useSwarmStore` from `client/src/store/SwarmContext.jsx`
- No existing code is affected — this is a new module with no callers

---

## 2026-03-27 — Tasks #53.1 + #53.2 + #53.3: AgentNode, DepartmentNode, TriggerNode — React Flow Canvas Nodes
**Agent:** frontend-dev (three parallel subtasks)
**Triggered by:** V3 Phase 3 client — implement the three custom React Flow node types needed by the workflow canvas: agent visualization node (with live swarm state), department group container node, and trigger source stub

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/nodes/AgentNode.jsx | ADDED | Custom React Flow node type="agent"; subscribes to useSwarmStore(agentStates[id]); 5 status colors; target Handle top + source Handle bottom; lastOutputSnippet (last 3 lines); handoffCount badge |
| client/src/canvas/nodes/DepartmentNode.jsx | ADDED | React Flow group container node type="department"; subscribes to focusedDepartmentId + setFocusedDepartment from useSwarmStore; click header → setFocusedDepartment(id) |
| client/src/canvas/nodes/TriggerNode.jsx | ADDED | React Flow source-only node stub type="trigger"; webhook/rss icon variants; purple theme; source Handle bottom only; full implementation deferred to Task #76 |

### Functions Added
- `AgentNode({ id, data, selected })` in `client/src/canvas/nodes/AgentNode.jsx` — live-state agent card with 5 status colors, output snippet, handoff count badge; subscribes useSwarmStore(s => s.agentStates[id])
- `DepartmentNode({ id, data, selected })` in `client/src/canvas/nodes/DepartmentNode.jsx` — group container with clickable header; calls setFocusedDepartment(id) from useSwarmStore on click; focused/unfocused border styling
- `TriggerNode({ id, data, selected })` in `client/src/canvas/nodes/TriggerNode.jsx` — purple trigger stub; source Handle only; triggerIcons const map (webhook/rss/fallback); full impl Task #76

### Functions Modified
- `setFocusedDepartment(id)` in `client/src/store/SwarmContext.jsx` — "Called by" updated: was "not yet wired", now called by DepartmentNode.jsx header onClick (Task #53.2)

### Connection Changes
- client/src/canvas/nodes/AgentNode.jsx → client/src/store/SwarmContext.jsx::useSwarmStore (new live caller — reads agentStates[id])
- client/src/canvas/nodes/DepartmentNode.jsx → client/src/store/SwarmContext.jsx::useSwarmStore (new live caller — reads focusedDepartmentId + setFocusedDepartment)
- client/src/canvas/nodes/DepartmentNode.jsx → client/src/store/SwarmContext.jsx::setFocusedDepartment (first live caller — triggered by header click)
- client/src/canvas/nodes/TriggerNode.jsx — no store subscription (stub)
- All three nodes import Handle + Position from @xyflow/react (already installed in Task #51)
- None of the three nodes are yet registered in a nodeTypes map — pending WorkflowCanvas.jsx canvas container component

### Impact on Other Code
- useSwarmStore.setFocusedDepartment now has its first live caller (DepartmentNode) — the "Called by" field in CODE_MAP.md has been updated
- Three new files introduce the client/src/canvas/nodes/ directory (new subdirectory — did not previously exist)
- TriggerNode is a stub — Task #76 must add: URL config field, activation toggle, polling service integration, and likely additional store state
- All three nodes await registration in a nodeTypes map inside a WorkflowCanvas wrapper component (future task)

---

## 2026-03-27 — Tasks #54 + #55 + #56: HandoffEdge, AgentInspector, BreadcrumbBar — Canvas Visual Layer
**Agent:** frontend-dev (three parallel tasks)
**Triggered by:** V3 Phase 3 client — implement the custom edge type, inspector side panel, and breadcrumb navigation bar that complete the canvas visual layer alongside the three node types from Tasks #53.1-#53.3

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/edges/HandoffEdge.jsx | ADDED | Custom React Flow edge type="handoff"; reads edgeCounters[id] from useSwarmStore; animated dashed blue line when counter > 0; grey static line when idle; counter badge via EdgeLabelRenderer |
| client/src/canvas/AgentInspector.jsx | ADDED | Right-panel node inspector; reads selectedNodeId + agentStates from useSwarmStore; shows label, type, status, handoffCount, systemPrompt, lastOutputSnippet; close button calls setSelectedNode(null) |
| client/src/canvas/BreadcrumbBar.jsx | ADDED | Top-bar breadcrumb nav; reads departmentStack + navigateBreadcrumb from useSwarmStore; root crumb always shown; per-depth buttons call navigateBreadcrumb(index+1) |
| client/src/index.css | MODIFIED | Added @keyframes dashdraw — SVG strokeDashoffset animation referenced by HandoffEdge inline style |

### Functions Added
- `HandoffEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd })` in `client/src/canvas/edges/HandoffEdge.jsx` — animated custom edge; counter badge via EdgeLabelRenderer; uses getBezierPath + BaseEdge from @xyflow/react
- `AgentInspector({ nodes, onUpdateNode })` in `client/src/canvas/AgentInspector.jsx` — inspector panel for selected node; three useSwarmStore selectors; close → setSelectedNode(null)
- `BreadcrumbBar({ nodes })` in `client/src/canvas/BreadcrumbBar.jsx` — breadcrumb nav; root button → navigateBreadcrumb(0); per-crumb → navigateBreadcrumb(index+1); labels resolved from nodes prop

### Functions Modified
- `navigateBreadcrumb(index)` in `client/src/store/SwarmContext.jsx` — "Called by" updated: first live caller is BreadcrumbBar.jsx (Task #56)
- `setSelectedNode(id)` in `client/src/store/SwarmContext.jsx` — "Called by" updated: AgentInspector close button calls setSelectedNode(null) (Task #55); non-null selection still pending canvas onClick

### Connection Changes
- client/src/canvas/edges/HandoffEdge.jsx → useSwarmStore (reads edgeCounters[id]) — new caller
- client/src/canvas/AgentInspector.jsx → useSwarmStore (reads selectedNodeId, agentStates, setSelectedNode) — new caller
- client/src/canvas/AgentInspector.jsx → SwarmStore::setSelectedNode — first live caller (null deselection)
- client/src/canvas/BreadcrumbBar.jsx → useSwarmStore (reads departmentStack, navigateBreadcrumb) — new caller
- client/src/canvas/BreadcrumbBar.jsx → SwarmStore::navigateBreadcrumb — first live caller
- client/src/index.css @keyframes dashdraw → consumed by HandoffEdge.jsx inline style animation property

### Impact on Other Code
- HandoffEdge, AgentInspector, BreadcrumbBar are created but not yet wired into a parent WorkflowCanvas.jsx. The canvas wrapper must: register HandoffEdge in edgeTypes["handoff"], embed AgentInspector with nodes prop, embed BreadcrumbBar with nodes prop.
- client/src/canvas/ directory now has three groupings: nodes/ (AgentNode, DepartmentNode, TriggerNode), edges/ (HandoffEdge), and canvas root (AgentInspector, BreadcrumbBar).
- useSwarmStore.navigateBreadcrumb has its first live caller — the breadcrumb back-navigation path is now exercisable.
- useSwarmStore.setSelectedNode deselect path (null) is now wired; the selection path (non-null) remains pending.

---

---
## 2026-03-27 — Task #57.1: SwarmCanvas.jsx — React Flow Canvas + Drill-Down Filtering
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — implement the root canvas container that wires all previously-built canvas primitives (AgentNode, DepartmentNode, TriggerNode, HandoffEdge, AgentInspector, BreadcrumbBar) into a single React Flow canvas with drill-down filtering

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/SwarmCanvas.jsx | ADDED | Root React Flow canvas component; nodeTypes (agent/department/trigger) + edgeTypes (handoff) registered as module-level consts; useNodesState/useEdgesState from workflowDef prop; drill-down filtering via focusedDepartmentId (3 useMemo); onNodeClick→setSelectedNode; onPaneClick→setSelectedNode(null); BreadcrumbBar + AgentInspector mounted |

### Functions Added
- `SwarmCanvas({ workflowDef })` in `client/src/canvas/SwarmCanvas.jsx` — root React Flow canvas; manages nodes/edges state; applies drill-down filter; wires user interaction; mounts BreadcrumbBar + AgentInspector

### Functions Modified
- `AgentNode` "Called by" in CODE_MAP.md — updated from "no callers" to SwarmCanvas.jsx (nodeTypes.agent)
- `DepartmentNode` "Called by" in CODE_MAP.md — updated from "no callers" to SwarmCanvas.jsx (nodeTypes.department)
- `TriggerNode` "Called by" in CODE_MAP.md — updated from "no callers" to SwarmCanvas.jsx (nodeTypes.trigger)
- `HandoffEdge` "Called by" in CODE_MAP.md — updated from "no callers" to SwarmCanvas.jsx (edgeTypes.handoff + onConnect default)
- `AgentInspector` "Called by" in CODE_MAP.md — updated from "no callers" to SwarmCanvas.jsx (first live mount)
- `BreadcrumbBar` "Called by" in CODE_MAP.md — updated from "no callers" to SwarmCanvas.jsx (first live mount)
- `useSwarmStore` "Called by" in CODE_MAP.md — updated to list all active callers as of Task #57.1

### Functions Removed
- None

### Connection Changes
- SwarmCanvas.jsx → AgentNode (first registration as nodeTypes.agent)
- SwarmCanvas.jsx → DepartmentNode (first registration as nodeTypes.department)
- SwarmCanvas.jsx → TriggerNode (first registration as nodeTypes.trigger)
- SwarmCanvas.jsx → HandoffEdge (first registration as edgeTypes.handoff; also default type for onConnect new edges)
- SwarmCanvas.jsx → AgentInspector (first live mount)
- SwarmCanvas.jsx → BreadcrumbBar (first live mount)
- SwarmCanvas.jsx → useSwarmStore (reads focusedDepartmentId, setSelectedNode)
- DepartmentNode.setFocusedDepartment → SwarmStore.focusedDepartmentId → SwarmCanvas visibleNodes filter: complete click-to-filter loop now wired

### Impact on Other Code
- All six canvas primitives now have their first live parent — "no callers" warnings are resolved.
- SwarmCanvas itself still has no caller — needs embedding in a WorkflowView/SwarmView page and a workflowDef prop from API/store.
- workflowDef is consumed as initial state only (useNodesState/useEdgesState take initialValues). Changes after mount are NOT reactive — parent must unmount/remount to update the graph from a new workflowDef.
- useSwarmStore.setSelectedNode selection path (non-null) is now wired via onNodeClick — previously only the deselect (null) path was exercisable.

---

## 2026-03-27 — Task #57.2: SwarmView.jsx — Layout Shell + Toolbar
**Agent:** frontend-dev
**Triggered by:** Create the top-level page shell for the Swarm Orchestrator — toolbar with execution status + reset, ReactFlowProvider boundary, SwarmCanvas embed.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/views/SwarmView.jsx | ADDED | New page-level shell component for the swarm orchestrator view |

### Functions Added
- `SwarmView()` in `client/src/views/SwarmView.jsx` — top-level layout shell: toolbar (title + executionStatus indicator + conditional Reset button) + ReactFlowProvider wrapping SwarmCanvas. Owns workflowDef local state (null; to be wired in Task #61).
- `statusColors` (module-level const) in `client/src/views/SwarmView.jsx` — map of execution status strings to Tailwind class strings (idle: text-gray-400, running: text-blue-400 animate-pulse, stopped: text-red-400).

### Functions Modified
- `SwarmCanvas({ workflowDef })` in `client/src/canvas/SwarmCanvas.jsx` — "Called by" updated: SwarmView.jsx is now the first live caller (no code change to SwarmCanvas itself).

### Functions Removed
- None

### Connection Changes
- SwarmView.jsx → SwarmCanvas.jsx (first live mounting; passes workflowDef prop, currently null)
- SwarmView.jsx → useSwarmStore (reads executionStatus + reset)
- ReactFlowProvider boundary now owned by SwarmView (not SwarmCanvas) — SwarmCanvas is no longer responsible for the provider

### Impact on Other Code
- SwarmCanvas "no callers yet" warning is resolved — SwarmView is now its parent.
- SwarmView itself has no caller yet — needs to be registered in App.jsx view router (Task #61).
- workflowDef remains null until Task #61 wires it to the workflow API/store; SwarmCanvas will render an empty graph until then.
- Reset button only appears when executionStatus === 'stopped'; it calls SwarmStore.reset() which resets executionStatus to 'idle' — meaning the button immediately disappears after click.

---

## 2026-03-27 — Task #59: server/routes/swarm.js — POST /scaffold Full Implementation
**Agent:** backend-dev
**Triggered by:** Replace the 501 scaffold stub in swarm.js with a full Anthropic Claude API call that generates a workflow definition from a natural-language prompt and saves it to WorkflowStore.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/routes/swarm.js | MODIFIED | Scaffold stub (501) replaced with full implementation: new `generateWorkflowFromPrompt(prompt)` module-private helper using @anthropic-ai/sdk (claude-haiku-4-5-20251001); POST /scaffold handler with 400/503/500 guards; saves to WorkflowStore via req.app.locals.workflowStore.create() |
| server/package.json | MODIFIED | Added `@anthropic-ai/sdk` to dependencies |

### Functions Added
- `generateWorkflowFromPrompt(prompt)` in `server/routes/swarm.js` — module-private async fn; calls Anthropic API with multi-agent workflow design system prompt; strips markdown fences; validates structure; throws on failure. Model: claude-haiku-4-5-20251001, max_tokens: 2048.

### Functions Modified
- `POST /scaffold route handler` in `server/routes/swarm.js` — was a 501 stub; now fully implemented with prompt validation (required, string, ≤ 2000 chars), generateWorkflowFromPrompt call, optional projectId attachment, WorkflowStore.create() persistence, 201 response with workflowId + workflowDef. Route declared BEFORE /:workflowId/* to prevent param shadowing.

### Functions Removed
- None (501 stub body replaced in-place — same route, new implementation)

### Connection Changes
- `server/routes/swarm.js` → `@anthropic-ai/sdk` (new import; Anthropic client instantiated inside generateWorkflowFromPrompt, reads ANTHROPIC_API_KEY from env)
- `POST /scaffold handler` → `generateWorkflowFromPrompt` (new internal call)
- `POST /scaffold handler` → `req.app.locals.workflowStore.create()` → `WorkflowStore.create()` (new call path — scaffold now persists generated workflow)
- `generateWorkflowFromPrompt` → outbound HTTPS to api.anthropic.com (new external dependency for this route)

### Impact on Other Code
- WorkflowStore.create() is now called from a second site (previously only from routes/workflows.js); no changes to WorkflowStore itself
- ANTHROPIC_API_KEY must be set in the server environment — if absent, Anthropic SDK will throw on instantiation and the endpoint will always 500
- Route ordering inside swarmRoutes() is now critical: /scaffold must remain the first route declaration

---

## 2026-03-27 — Task #61: client/src/hooks/useWorkflow.js — CRUD Hook
**Agent:** frontend-dev
**Triggered by:** Implement React hooks for workflow CRUD so SwarmView (and future workflow selector UI) can fetch, create, update, and delete workflow definitions via the /api/v1/workflows REST API.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/hooks/useWorkflow.js | ADDED | Two named-export hooks: useWorkflow(id) for single-workflow CRUD; useWorkflowList() for list fetch + create |

### Functions Added
- `useWorkflow(workflowId)` in `client/src/hooks/useWorkflow.js` — manages single workflow; auto-fetches on mount/id-change; exposes refresh, update(patch), remove(); returns { workflow, loading, error, refresh, update, remove }
- `useWorkflowList()` in `client/src/hooks/useWorkflow.js` — fetches all workflows on mount; exposes refresh, create(workflowDef); returns { workflows, loading, error, refresh, create }

### Functions Modified
- None

### Functions Removed
- None

### Connection Changes
- `useWorkflow` → `apiGet` from `client/src/hooks/useApi.js` (GET /api/v1/workflows/:id)
- `useWorkflow` → `apiPut` from `client/src/hooks/useApi.js` (PUT /api/v1/workflows/:id)
- `useWorkflow` → `apiDelete` from `client/src/hooks/useApi.js` (DELETE /api/v1/workflows/:id)
- `useWorkflowList` → `apiGet` from `client/src/hooks/useApi.js` (GET /api/v1/workflows)
- `useWorkflowList` → `apiPost` from `client/src/hooks/useApi.js` (POST /api/v1/workflows)
- No live callers yet for either export — awaiting SwarmView.jsx wiring (workflowDef local state currently null)

### Impact on Other Code
- SwarmView.jsx owns `workflowDef` as local state (currently null); useWorkflow/useWorkflowList are the intended source for this state — wiring is the next step
- useApi.js apiGet/apiPost/apiPut/apiDelete now have an additional consumer — no changes to useApi.js itself needed
- No new dependencies: hooks use only react + existing useApi.js wrappers

---

## 2026-03-27 — Task #60: PromptToFlowBar.jsx + staggered animation — Phase 3 Prompt-to-Flow COMPLETE
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — implement the natural-language prompt input bar that calls POST /api/v1/swarm/scaffold and wires the generated workflowDef (with staggered node entrance animation) into SwarmView → SwarmCanvas.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/PromptToFlowBar.jsx | ADDED | New component: prompt text input + Generate button, POSTs to /api/v1/swarm/scaffold, applies staggered fadeIn animation to each node, calls onWorkflowGenerated(workflowId, animatedDef) |
| client/src/index.css | MODIFIED | @keyframes fadeIn added (opacity: 0→1, transform: translateY(6px)→0) — drives PromptToFlowBar node entrance animation |
| client/src/views/SwarmView.jsx | MODIFIED | Imported PromptToFlowBar; mounted between toolbar and canvas; onWorkflowGenerated callback wires workflowId+animatedDef → setWorkflowDef → SwarmCanvas prop |

### Functions Added
- `PromptToFlowBar({ onWorkflowGenerated })` in `client/src/canvas/PromptToFlowBar.jsx` — prompt input bar with Generate button; POSTs to scaffold endpoint; applies per-node staggered CSS animation to workflowDef.nodes before calling onWorkflowGenerated
- `handleGenerate()` (useCallback internal) in `client/src/canvas/PromptToFlowBar.jsx` — async fetch to /api/v1/swarm/scaffold; decodes { workflowId, workflowDef }; applies animation transform; calls prop callback; sets loading/error state
- `handleKeyDown(e)` (internal) in `client/src/canvas/PromptToFlowBar.jsx` — Enter (no Shift) → handleGenerate()

### Functions Modified
- `SwarmView()` in `client/src/views/SwarmView.jsx` — added PromptToFlowBar mount; onWorkflowGenerated callback captures animatedDef into workflowDef local state; workflowDef prop to SwarmCanvas is now live (was always null before Task #60)

### Functions Removed
- None

### Connection Changes
- `SwarmView` → `PromptToFlowBar` (new import + render; onWorkflowGenerated callback created inline)
- `PromptToFlowBar.handleGenerate` → `POST /api/v1/swarm/scaffold` (new outbound fetch from client)
- `PromptToFlowBar.handleGenerate` → `onWorkflowGenerated` prop callback → `SwarmView.setWorkflowDef` → `SwarmCanvas.workflowDef` prop (full data flow now live end-to-end)
- `@keyframes fadeIn` in `client/src/index.css` → consumed by `PromptToFlowBar.handleGenerate` inline style injection per node

### Impact on Other Code
- `SwarmCanvas.workflowDef` prop: previously always received null from SwarmView; now receives an animated workflow definition after scaffold succeeds. SwarmCanvas treats workflowDef as initialNodes/initialEdges only (useNodesState/useEdgesState) — re-generating via PromptToFlowBar will NOT update the canvas after first mount. This is a known limitation: full live reload of workflowDef requires a SwarmCanvas key reset or state reinit (future task).
- Build: 471 modules, 0 errors (unchanged from prior builds — no new npm dependencies added).
- Phase 3 (Prompt-to-Flow) is fully complete as of Task #60.

---

## 2026-03-27 — Task #58: App.jsx + Sidebar swarm nav + ReactFlowProvider
**Agent:** frontend-dev
**Triggered by:** Wire SwarmView into the App.jsx view router and add the Swarm nav item to the sidebar so users can navigate to the Swarm Orchestrator page.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/App.jsx | MODIFIED | Imported SwarmView; added `case 'swarm': return <SwarmView />` to MainContent switch — 6th view case |
| client/src/lib/constants.js | MODIFIED | Appended `{ icon: 'hub', label: 'Swarm', view: 'swarm' }` to NAV_ITEMS array (5 → 6 items) |

### Functions Added
- None (no new functions — modifications to existing routing logic and static constant)

### Functions Modified
- `MainContent()` in `client/src/App.jsx` — swarm case added to switch; now routes 6 views instead of 5
- `NAV_ITEMS` in `client/src/lib/constants.js` — 6th nav item appended (`hub` icon, "Swarm" label, view='swarm')

### Functions Removed
- None

### Connection Changes
- App.jsx::MainContent → SwarmView (new live render path; case 'swarm' now active)
- SwarmView "no live caller" warning resolved — App.jsx is now its parent
- Sidebar NAV_ITEMS loop automatically renders the new Swarm item (no Sidebar.jsx code change needed — it already iterates NAV_ITEMS)
- ReactFlowProvider boundary is owned by SwarmView (not App.jsx or SwarmCanvas) — SwarmCanvas receives the provider from its parent

### Impact on Other Code
- Sidebar.jsx: no code change needed; NAV_ITEMS import already live since Task #24 — new 6th item renders automatically
- Build grew from 299 to 470 modules: @xyflow/react + zustand tree-shaken in for the first time via SwarmView → SwarmCanvas dependency chain
- 168/168 tests pass — routing change does not affect server tests
- workflowDef remains null until Task #61 wires SwarmView to the workflow API/store; canvas renders empty graph until then

---

## 2026-03-27 — Task #63: client/src/hooks/useSwarm.js — WS Hook
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — implement the WebSocket hook that connects to /ws/swarm and dispatches live swarm execution events to the Zustand store, plus startExecution/stopExecution REST actions.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/hooks/useSwarm.js | ADDED | New named-export hook: useSwarm(workflowId) — manages WS lifecycle, dispatches 6 message types to SwarmStore, exposes connectWs/startExecution/stopExecution |

### Functions Added
- `useSwarm(workflowId)` in `client/src/hooks/useSwarm.js` — hook shell; owns wsRef; exposes 3 callbacks; cleans up WS on unmount
- `connectWs(executionId)` in `client/src/hooks/useSwarm.js` — opens WebSocket to /ws/swarm?executionId=X; dispatches agent_status, handoff_started, execution_status, budget_update, circuit_breaker, hitl_required messages to SwarmStore
- `startExecution(projectId, projectPath)` in `client/src/hooks/useSwarm.js` — POSTs to /api/v1/swarm/:workflowId/start, calls connectWs, sets store to running, returns executionId
- `stopExecution(executionId)` in `client/src/hooks/useSwarm.js` — DELETEs /api/v1/swarm/:executionId, closes WS, sets store to stopped/null

### Functions Modified
- None

### Functions Removed
- None

### Connection Changes
- `useSwarm.connectWs` → `useSwarmStore::setWsConnected` (onopen/onclose/onerror — first live callers)
- `useSwarm.connectWs` → `useSwarmStore::updateAgentState` (agent_status, handoff_started — first live callers from WS path)
- `useSwarm.connectWs` → `useSwarmStore::updateEdgeCounter` (handoff_started — first live caller)
- `useSwarm.connectWs` → `useSwarmStore::addFeedEvent` (handoff_started, circuit_breaker — first live callers)
- `useSwarm.connectWs` → `useSwarmStore::setExecution` (execution_status — first live WS caller; already called in startExecution/stopExecution paths)
- `useSwarm.connectWs` → `useSwarmStore::updateBudget` (budget_update — first live caller)
- `useSwarm.connectWs` → `useSwarmStore::addInboxItem` (hitl_required — first live caller)
- `useSwarm.startExecution` → `apiPost` from `useApi.js` (POST /api/v1/swarm/:workflowId/start)
- `useSwarm.stopExecution` → `apiDelete` from `useApi.js` (DELETE /api/v1/swarm/:executionId)

### Impact on Other Code
- All 7 previously "not yet wired" SwarmStore actions now have live callers — the WS → store → canvas rendering pipeline is complete end-to-end once useSwarm is mounted
- No live callers for useSwarm itself yet — needs mounting in SwarmView.jsx (future task, likely alongside a Run/Stop toolbar button)

---

## 2026-03-27 — Task #66: client/src/canvas/BroadcastBar.jsx + SwarmView mount
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — implement broadcast text bar for sending messages to all running agent PTYs; mount it in SwarmView below the canvas.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/BroadcastBar.jsx | ADDED | New component: broadcast text input + soft/hard mode selector + Send button; reads activeExecutionId + executionStatus from SwarmStore; self-hides when not running |
| client/src/views/SwarmView.jsx | MODIFIED | Imported BroadcastBar; mounted as last child of the flex-col layout (below canvas area) |

### Functions Added
- `BroadcastBar()` in `client/src/canvas/BroadcastBar.jsx` — default export; renders null when executionStatus !== 'running'; POST /api/v1/swarm/:executionId/broadcast with text + scope + mode
- `handleSend()` (internal async) in `client/src/canvas/BroadcastBar.jsx` — guards against empty/inactive/concurrent; POSTs broadcast; shows "Sent to N agents" confirmation for 3s
- `handleKeyDown(e)` (internal) in `client/src/canvas/BroadcastBar.jsx` — Enter without Shift → handleSend()

### Functions Modified
- `SwarmView()` in `client/src/views/SwarmView.jsx` — added BroadcastBar import + mount; layout now: toolbar → PromptToFlowBar → canvas → BroadcastBar

### Functions Removed
- None

### Connection Changes
- `SwarmView` → `BroadcastBar` (new import + render; BroadcastBar always mounted, self-hides)
- `BroadcastBar.handleSend` → `POST /api/v1/swarm/:executionId/broadcast` (direct fetch — uses native browser fetch with CSRF header, not apiPost)
- `BroadcastBar` → `useSwarmStore::activeExecutionId` (new selector)
- `BroadcastBar` → `useSwarmStore::executionStatus` (new selector)

### Impact on Other Code
- POST /api/v1/swarm/:executionId/broadcast — previously only callable from test harness; now has a UI client
- BroadcastBar uses native fetch (not apiPost from useApi.js) — if CSRF header requirements change, both fetch sites must be updated
- BroadcastBar renders null when not running — no DOM impact on idle canvas view

---

## 2026-03-27 — Task #67: server/services/SwarmEngine.js — heartbeat verified + pauseExecution/resumeExecution
**Agent:** backend-dev
**Triggered by:** V3 Phase 3 server — verify heartbeat timer correctness and add pauseExecution/resumeExecution methods to SwarmEngine for HITL freeze/unfreeze support (Task #70 prerequisite).

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/SwarmEngine.js | MODIFIED | Added pauseExecution(executionId) and resumeExecution(executionId) methods; _startHeartbeat verified correct (5min interval, .unref(), clearInterval on stop) |

### Functions Added
- `SwarmEngine.pauseExecution(executionId)` in `server/services/SwarmEngine.js` — sets all running agents to 'paused', broadcasts agent_status WS event per agent; no PTY interrupt sent (logical state only)
- `SwarmEngine.resumeExecution(executionId)` in `server/services/SwarmEngine.js` — sets all paused agents back to 'running', broadcasts agent_status WS event per agent

### Functions Modified
- `SwarmEngine._startHeartbeat(executionId)` — no code changes; heartbeat logic confirmed correct: 300000ms interval, timer.unref() called, clearInterval(execution.heartbeatTimer) in stopExecution. Last modified annotation updated to reflect Task #67 verification.

### Functions Removed
- None

### Connection Changes
- `SwarmEngine.pauseExecution` → `this._wsBroadcast` (emits agent_status 'paused' per agent — same broadcast path as _spawnAgentPty and _onDone)
- `SwarmEngine.resumeExecution` → `this._wsBroadcast` (emits agent_status 'running' per agent)
- No REST callers yet — POST /:executionId/pause route still uses inline Ctrl-C via getStatus; pauseExecution/resumeExecution are available for Task #70 HITL freeze wiring

### Impact on Other Code
- `POST /:executionId/pause` in swarm.js: comment in source says "SwarmEngine has no pauseExecution method — Task #70 will add full HITL freeze". This comment is now stale — pauseExecution exists. The route's inline Ctrl-C behavior is still correct but the comment should be updated when Task #70 wires pauseExecution.
- `POST /:executionId/resume` in swarm.js: currently a no-op stub — resumeExecution is now available and can replace the stub body in Task #70.
- Client-side AgentNode.jsx: already handles 'paused' status with its own color (statusColors map covers idle/running/done/paused/error) — WS events from pauseExecution will immediately update the canvas color when useSwarm is mounted.

---

## 2026-03-27 — Task #62.1: SwarmEngine._onHandoff full implementation + constructor CircuitBreaker/BudgetTracker params + server/index.js wiring
**Agent:** backend-dev (verified complete by prior session; recorded by code-mapper)
**Triggered by:** V3 Phase 2 — complete the _onHandoff stub with full handoff routing: context merge, edge counter, circuit breaker advisory, handoffCount tracking, WS broadcast, _ensureAgentPty call; wire CircuitBreaker + BudgetTracker into SwarmEngine constructor via server/index.js

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| server/services/SwarmEngine.js | MODIFIED | _onHandoff: full implementation replacing stub — context merge, edge counter, circuit breaker check, handoffCount increment, WS handoff_started broadcast, _ensureAgentPty call; constructor: added circuitBreaker + budgetTracker optional params (default null) stored as this._circuitBreaker + this._budgetTracker |
| server/index.js | MODIFIED | Added CircuitBreaker + BudgetTracker imports; instantiated circuitBreaker + budgetTracker before SwarmEngine; passed both to SwarmEngine constructor call |

### Functions Modified
- `SwarmEngine.constructor(sessionManager, workflowStore, circuitBreaker, budgetTracker)` in `server/services/SwarmEngine.js` — added circuitBreaker (default null) and budgetTracker (default null) as optional third and fourth parameters; stored as this._circuitBreaker and this._budgetTracker
- `SwarmEngine._onHandoff(executionId, sourceNodeId, event)` in `server/services/SwarmEngine.js` — full implementation replacing stub: (1) Object.assign context merge, (2) edge ID resolution (workflow edges lookup with fallback), (3) edgeCounters increment, (4) CircuitBreaker.check advisory with WS circuit_breaker event, (5) sourceState.handoffCount increment, (6) WS handoff_started broadcast with edgeId + counter, (7) _ensureAgentPty(executionId, targetId) call
- `startup()` in `server/index.js` — now imports CircuitBreaker + BudgetTracker; instantiates both before SwarmEngine; passes both to SwarmEngine constructor

### Connection Changes
- server/index.js → server/services/CircuitBreaker.js (new import — was never imported before Task #62.1)
- server/index.js → server/services/BudgetTracker.js (new import — was never imported before Task #62.1)
- SwarmEngine._onHandoff → CircuitBreaker.check (new live call — was "pending wiring task" in Task #49)
- SwarmEngine._onHandoff → SwarmEngine._ensureAgentPty (new call — _ensureAgentPty was orphaned; now has its first live caller)
- SwarmEngine._onHandoff → execution.edgeCounters (now actively updated — was never written before Task #62.1)
- SwarmEngine._onHandoff → execution.workflowContext (now actively merged — was never written before Task #62.1)

### Impact on Other Code
- CircuitBreaker.check "Called by" annotation updated — was "not yet wired"; now called from _onHandoff on every handoff event
- SwarmEngine._ensureAgentPty "Called by" annotation updated — was "future routing logic"; now called from _onHandoff
- execution.edgeCounters is now actively populated — getStatus() serializes it via Object.fromEntries; client receives live edge counter data via GET /:executionId/status and WS updates
- BudgetTracker is now instantiated and passed to SwarmEngine — the existing `if (this._budgetTracker)` guard in _spawnAgentPty tapFn is now live; track() and checkBudget() are called on every PTY output chunk
- BudgetTracker.registerSession is still not called from _spawnAgentPty — getTotal() will return 0 for all executions until that wiring is added (deferred)

---

## 2026-03-27 — Task #64: client/src/hooks/useHandoff.js — Edge Animation Hook
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — create a callback-based hook (useHandoff) and a recent-set hook (useRecentHandoffs) for components that need to react programmatically to handoff counter increases rather than reading edgeCounters directly.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/hooks/useHandoff.js | ADDED | Two named-export hooks: useHandoff(callback) — fires callback(edgeId, counter) on each increment; useRecentHandoffs(durationMs) — returns Set of recently-active edgeIds with auto-expire |

### Functions Added
- `useHandoff(onHandoff)` in `client/src/hooks/useHandoff.js` — side-effect-only hook; calls onHandoff(edgeId, newCounter) per edgeCounter increase; uses ref diff against previous snapshot
- `useRecentHandoffs(durationMs)` in `client/src/hooks/useHandoff.js` — returns stable Set ref of recently-active edgeIds; auto-removes each edgeId after durationMs via setTimeout; default 2000ms

### Functions Modified
- None

### Functions Removed
- None

### Connection Changes
- `useHandoff` → `useSwarmStore` (selector: s.edgeCounters) — new subscriber to edge counter state
- `useRecentHandoffs` → `useSwarmStore` (selector: s.edgeCounters) — new subscriber to edge counter state
- No live callers yet for either export

### Impact on Other Code
- HandoffEdge.jsx currently reads edgeCounters directly from useSwarmStore — useHandoff/useRecentHandoffs offer an alternative API for components that need callback-style notification rather than inline rendering logic
- Callers of useHandoff must memoize the onHandoff callback (useCallback) to avoid spurious effect re-runs; this is a stable contract requirement for the hook

---

## 2026-03-27 — Task #65: client/src/canvas/nodes/AgentNode.jsx — Pulse + Micro PTY Log
**Agent:** frontend-dev
**Triggered by:** V3 Phase 3 client — enhance AgentNode's lastOutputSnippet display from a bare text line to a scrollable bg-black/40 container with green monospace pre, last 4 lines (was 3), and a blinking cursor when running.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/nodes/AgentNode.jsx | MODIFIED | lastOutputSnippet display enhanced: scrollable bg-black/40 container (max-h-16, overflow-y-auto), green monospace pre, last 4 lines (was 3), blinking ▋ cursor via animate-pulse when status === 'running' |

### Functions Added
- None

### Functions Modified
- `AgentNode({ id, data, selected })` in `client/src/canvas/nodes/AgentNode.jsx` — lastOutputSnippet block upgraded: added bg-black/40 wrapper div (max-h-16, overflow-y-auto, rounded, p-1.5), pre tag with text-green-300 font-mono styling, slice changed from -3 to -4 lines, blinking ▋ cursor span (animate-pulse) appended inside pre when status === 'running'

### Functions Removed
- None

### Connection Changes
- None (internal rendering change only — no new store subscriptions, no new imports)

### Impact on Other Code
- AgentNode is consumed only by SwarmCanvas.jsx via nodeTypes.agent registration — no other callers; rendering change is purely cosmetic and backwards-compatible
- The blinking cursor uses Tailwind `animate-pulse` class (already in the project via statusColors for the running border) — no new CSS dependencies

---

## 2026-03-28 — Tasks #73–#82: V3 Trigger System, HITL Inbox Hook, Integration Tests, Security Audit, Build Verification, Docs
**Agent:** frontend-dev (73, 76), backend-dev (74, 75, 80), qa-tester (77, 78), security (79), devops (81), documenter (82)
**Triggered by:** V3 final wave — complete trigger system (webhook + RSS), HITL inbox hook, SwarmEngine integration tests, security audit sign-off, E2E build verification and v3.0.0 tag, documentation update

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/hooks/useInbox.js | ADDED | HITL inbox polling + approve/reject hook |
| server/services/TriggerManager.js | ADDED | Webhook registration + RSS polling trigger service; SSRF guard applied; integrates with SwarmEngine |
| server/routes/triggers.js | ADDED | Express Router factory: POST /webhooks/:path (rate-limited, 32 KB cap, no CSRF) + GET / (list triggers) |
| client/src/canvas/nodes/TriggerNode.jsx | MODIFIED | Full implementation replacing Task #53.3 stub — subscribes to triggerStates[id] in useSwarmStore; fired animation; webhook/RSS URL label display; last-fired timestamp |
| client/src/store/SwarmContext.jsx | MODIFIED | updateTriggerState() action now has a live subscriber (TriggerNode); setPtyExplosionNodeId added in Task #71.2 |
| client/src/index.css | MODIFIED | @keyframes triggerFiredPulse added for TriggerNode fired animation |
| server/tests/HandoffParser.test.js | VERIFIED | Confirmed existing — 0 code changes; tests pass |
| server/tests/swarm-engine.test.js | ADDED | 13-test integration suite for SwarmEngine (lifecycle, handoff, circuit breaker, budget, heartbeat, HITL, DEC-009) |
| docs/security-v3-audit.md | ADDED | Security audit report for V3 — SEC-V3-01 through SEC-V3-07 status; pre-release sign-off |
| server/index.js | MODIFIED | Route init order bugfix: swarmEngine instantiated BEFORE route mounting; TriggerManager + triggersRouter wired |
| README.md | MODIFIED | Updated for V3: trigger system, HITL, swarm orchestrator |
| docs/ARCHITECTURE.md | MODIFIED/ADDED | V3 architecture documentation |
| docs/API.md | MODIFIED/ADDED | V3 API reference |
| docs/memory/PROJECT.md | MODIFIED | Updated version + V3 feature list |

### Functions Added
- `useInbox(executionId)` in `client/src/hooks/useInbox.js` — HITL polling + approve/reject; polling fallback when WS disconnected
- `loadInbox()` (internal) in `client/src/hooks/useInbox.js` — fetches /api/v1/swarm/:id/inbox; directly mutates useSwarmStore.getState().inboxItems
- `approve(itemId, resumeText)` (returned callback) in `client/src/hooks/useInbox.js` — POSTs approve + calls resolveInboxItem
- `reject(itemId)` (returned callback) in `client/src/hooks/useInbox.js` — POSTs reject + calls resolveInboxItem
- `TriggerManager` class in `server/services/TriggerManager.js` — webhook registry + RSS polling engine; SSRF guard
- `TriggerManager.registerWebhook(path, workflowId, targetNodeId)` — register path→workflow mapping
- `TriggerManager.unregisterWebhook(path)` — remove path registration
- `TriggerManager.handleWebhook(path, payload)` — dispatch incoming webhook → startExecution
- `TriggerManager.createRssTrigger(nodeId, rssUrl, workflowId, pollIntervalMs, executionId)` — SSRF-guarded RSS poller with seed-on-first-poll
- `TriggerManager._pollRss(nodeId, seedOnly)` — outbound fetch + XML parse + new-item detection
- `TriggerManager._fireTrigger(nodeId, workflowId, executionId, item)` — start execution or broadcast rss_item WS event
- `TriggerManager.removeTrigger(nodeId)` — clear RSS poller for nodeId
- `TriggerManager.cleanupExecution(executionId)` — clear all RSS pollers for a finished execution
- `TriggerManager.listTriggers()` — serialize webhooks + rssPollers for GET /api/v1/triggers
- `_extractItems(xml)` (module-private) in `TriggerManager.js` — RSS/Atom XML item parser
- `_extractTag(fragment, tag)` (module-private) in `TriggerManager.js` — extract tag text content
- `_itemGuid(fragment)` (module-private) in `TriggerManager.js` — derive stable item ID
- `triggersRouter(triggerManager)` in `server/routes/triggers.js` — Express Router factory
- `webhookRateLimit(maxRequests, windowMs)` (module-private) in `server/routes/triggers.js` — 10 req/min/IP middleware

### Functions Modified
- `TriggerNode({ id, data, selected })` in `client/src/canvas/nodes/TriggerNode.jsx` — FULLY IMPLEMENTED (was stub in Task #53.3); now subscribes to useSwarmStore(s.triggerStates[id]); fired animation + timestamp display
- `startup()` in `server/index.js` — BUGFIX: swarmEngine instantiated before route mounting; added TriggerManager instantiation + triggersRouter mount at /api/v1/triggers
- `updateTriggerState(triggerId, patch)` in `client/src/store/SwarmContext.jsx` — "Called by" updated: TriggerNode now subscribes to triggerStates[id]; action existed since Task #52

### Functions Removed
- None

### Connection Changes
- `useInbox` → `useSwarmStore::inboxItems` (new subscriber via filter selector)
- `useInbox` → `useSwarmStore::wsConnected` (polling fallback gated on this)
- `useInbox` → `useSwarmStore::resolveInboxItem` (called on approve/reject success)
- `useInbox.approve/reject` → `GET/POST /api/v1/swarm/:id/inbox` (new REST consumers)
- `TriggerManager` → `ssrfGuard.isSafeUrl` (SEC-V3-03 — now has first live caller in production code)
- `TriggerManager.handleWebhook` → `swarmEngine.startExecution` (new live call path)
- `TriggerManager._fireTrigger` → `swarmEngine._wsBroadcast` (new live call for rss_item events)
- `triggersRouter POST /webhooks/:path` → `TriggerManager.handleWebhook` (first caller)
- `triggersRouter GET /` → `TriggerManager.listTriggers` (first caller)
- `server/index.js` → `TriggerManager` (new import + instantiation)
- `server/index.js` → `triggersRouter` (new import + mount at /api/v1/triggers)
- `TriggerNode` → `useSwarmStore::triggerStates` (new subscription — was no subscription in stub)

### Impact on Other Code
- `ssrfGuard.isSafeUrl` — previous CHANGELOG noted "future caller: TriggerManager.js"; now live
- `server/middleware/webhookLimit.js` and `server/middleware/webhookRateLimit.js` (stubs from Task #50) — NOT used in routes/triggers.js; the router inlines equivalent logic. The middleware stubs remain on disk but are still test-only.
- `SwarmEngine.stopExecution` — should call `triggerManager.cleanupExecution(executionId)` but this wiring is not yet in source; RSS pollers for stopped executions may linger until next removal.
- `TriggerManager.cleanupExecution` has no live caller yet — documented as intended for SwarmEngine.stopExecution.
- Build verification (Task #81): all server tests pass; v3.0.0 git tag applied.
- Security audit (Task #79): SEC-V3-01 through SEC-V3-07 all confirmed PASS in docs/security-v3-audit.md.

---

## 2026-03-28 — Tasks #84–#99: Debug Loop Wave

**Agent:** debugger + backend-dev + frontend-dev
**Triggered by:** Systematic debug pass across swarm frontend and backend — 16 bug fixes across 8 files.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/hooks/useInbox.js | MODIFIED | BUG-84: Zustand mutation fix (setState not direct mutation); BUG-85: normalizeInboxItem shape normalization added |
| client/src/store/SwarmContext.jsx | MODIFIED | BUG-86: resolveInboxItem i?.id optional chain; BUG-87: setFocusedDepartment dedup guard for departmentStack |
| client/src/hooks/useSwarm.js | MODIFIED | BUG-88: handoffCount increment in handoff_started WS handler; BUG-90: granular useSwarmStore selectors |
| client/src/canvas/nodes/TriggerNode.jsx | MODIFIED | BUG-91: animation keyed on fireCount counter rather than status string — repeated firings now retrigger animation |
| client/src/canvas/SwarmCanvas.jsx | MODIFIED | BUG-89: useEffect added to sync workflowDef prop changes into React Flow nodes/edges state after mount |
| server/services/SwarmEngine.js | MODIFIED | BUG-93: budgetTracker.clearExecution wired to stopExecution; BUG-94/95: pauseExecution/resumeExecution now live-called from routes; BUG-96: getExecution() public method added; BUG-98: getStatus() reads real budget from budgetTracker |
| server/services/TriggerManager.js | MODIFIED | BUG-97: cleanupExecution now also removes null-executionId (workflow-level) pollers; caller wired from stopExecution |
| server/routes/inbox.js | MODIFIED | BUG-96: now uses swarmEngine.getExecution() public API instead of direct _executions access |
| server/routes/swarm.js | MODIFIED | BUG-94: POST /pause now calls swarmEngine.pauseExecution(); BUG-95: POST /resume now calls swarmEngine.resumeExecution() |
| server/routes/triggers.js | MODIFIED | BUG-99: express.raw({ limit: '32kb' }) for webhook body — enforces 32KB cap before JSON parse |

### Functions Added
- `normalizeInboxItem(item)` in `client/src/hooks/useInbox.js` — normalizes REST/WS inbox item shape to `{ id, type, agentId, status, payload }` (BUG-85 fix)
- `SwarmEngine.getExecution(executionId)` in `server/services/SwarmEngine.js` — public accessor for live execution object; prevents private _executions field access from routes (BUG-96 fix)

### Functions Modified
- `useInbox(executionId)` in `client/src/hooks/useInbox.js` — Zustand mutation via setState (not direct mutation); added normalizeInboxItem pipeline in selector and loadInbox
- `loadInbox()` in `client/src/hooks/useInbox.js` — now calls `useSwarmStore.setState({ inboxItems })` instead of direct getState() mutation
- `resolveInboxItem(itemId)` in `client/src/store/SwarmContext.jsx` — filter now uses `i?.id` optional chain guard
- `setFocusedDepartment(id)` in `client/src/store/SwarmContext.jsx` — dedup guard: only pushes to stack if id !== last stack entry
- `connectWs(executionId)` in `client/src/hooks/useSwarm.js` — handoff_started now increments handoffCount from agentStates snapshot
- `useSwarm(workflowId)` in `client/src/hooks/useSwarm.js` — granular store selectors (one per slice)
- `TriggerNode({ id, data, selected })` in `client/src/canvas/nodes/TriggerNode.jsx` — animation gated on fireCount counter (not status string)
- `SwarmCanvas({ workflowDef })` in `client/src/canvas/SwarmCanvas.jsx` — useEffect added for workflowDef prop sync
- `SwarmEngine.stopExecution(executionId)` in `server/services/SwarmEngine.js` — added budgetTracker.clearExecution() + triggerManager.cleanupExecution() calls
- `SwarmEngine.getStatus(executionId)` in `server/services/SwarmEngine.js` — budget now sourced from budgetTracker.getTotal(); was returning undefined e.budget
- `SwarmEngine.pauseExecution(executionId)` in `server/services/SwarmEngine.js` — now called from routes/swarm.js POST /pause (was uncalled)
- `SwarmEngine.resumeExecution(executionId)` in `server/services/SwarmEngine.js` — now called from routes/swarm.js POST /resume (was uncalled)
- `TriggerManager.cleanupExecution(executionId)` in `server/services/TriggerManager.js` — also removes null-executionId pollers; now wired from stopExecution
- `POST /:executionId/pause` in `server/routes/swarm.js` — calls swarmEngine.pauseExecution() after Ctrl-C delivery
- `POST /:executionId/resume` in `server/routes/swarm.js` — calls swarmEngine.resumeExecution() (was pure no-op stub)
- `POST /webhooks/:path` in `server/routes/triggers.js` — body parser changed from express.json to express.raw({ limit: '32kb' })
- `inboxRoutes(swarmEngine)` in `server/routes/inbox.js` — uses swarmEngine.getExecution() instead of private _executions access
- `BudgetTracker.clearExecution(executionId)` in `server/services/BudgetTracker.js` — now has live caller (stopExecution)

### Functions Removed
- None

### Connection Changes
- `SwarmEngine.stopExecution` → `TriggerManager.cleanupExecution` (new — BUG-97 fix)
- `SwarmEngine.stopExecution` → `BudgetTracker.clearExecution` (new — BUG-93 fix)
- `server/routes/swarm.js POST /pause` → `SwarmEngine.pauseExecution` (new — BUG-94 fix)
- `server/routes/swarm.js POST /resume` → `SwarmEngine.resumeExecution` (new — BUG-95 fix)
- `server/routes/inbox.js` → `SwarmEngine.getExecution` (new — replaces direct _executions access — BUG-96 fix)
- `SwarmEngine.getStatus` → `BudgetTracker.getTotal` (new — BUG-98 fix)
- `useInbox.loadInbox` → `useSwarmStore.setState` (path corrected — was direct mutation)
- `TriggerNode` → `triggerStates[id].fireCount` (new — replaces status string gating)
- `SwarmCanvas` → `workflowDef prop` via useEffect (new reactive dep — BUG-89 fix)
- `useSwarm.connectWs` → `agentStates[sourceNodeId].handoffCount` (new read for increment — BUG-88 fix)

### Impact on Other Code
- `SwarmEngine._executions` — no longer accessed directly from routes (inbox.js); only SwarmEngine internal methods may access it
- `server/middleware/webhookLimit.js` and `server/middleware/webhookRateLimit.js` — still not used (routes/triggers.js inlines equivalent logic); these middleware stubs remain test-only
- `BudgetTracker.registerSession` — already wired since Task #62.3; confirmed correct
- All previous "not yet wired" notes for stopExecution cleanup calls are now resolved

---
## 2026-03-28 — Debug Loop Closure + Final QA Gate
**Agent:** qa-tester (verification), code-mapper (documentation)
**Triggered by:** Final QA verification pass confirming all 16 post-release bugs fixed and zero regressions

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| docs/memory/CHANGELOG.md | MODIFIED | Appended debug loop closure entry (this entry) |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended final closure activity log entry |

### Functions Added
- None

### Functions Modified
- None (all modifications were recorded in the Tasks #84–#99 entry above)

### Functions Removed
- None

### Connection Changes
- None (all connection changes were recorded in the Tasks #84–#99 entry above)

### Impact on Other Code
- None

### Debug Loop Summary
| Metric | Value |
|--------|-------|
| Bugs found (Tasks #84–#99) | 16 |
| Bugs fixed | 16 |
| Bugs remaining | 0 |
| Test suite result | 187/187 PASS |
| Client build result | 473 modules, 0 errors |
| QA verdict | CLEAN — zero remaining bugs |
| Release status | v3.0.0 RELEASE-READY |

### Bug Fix Index (Tasks #84–#99)
| Task | Bug ID | Location | Nature |
|------|--------|----------|--------|
| #84 | BUG-84 | useInbox.js | Direct Zustand store mutation bypassed reactivity |
| #85 | BUG-85 | useInbox.js | Filter failed on inconsistent inbox item shapes |
| #86 | BUG-86 | SwarmContext.jsx | resolveInboxItem filter used i.id without null guard |
| #87 | BUG-87 | SwarmContext.jsx | setFocusedDepartment pushed duplicate stack entries |
| #88 | BUG-88 | useSwarm.js | connectWs handoff_started incremented stale handoffCount |
| #89 | BUG-89 | useSwarm.js | Granular selectors caused stale closure reads |
| #90 | BUG-90 | TriggerNode.jsx | Animation gated on status string (missed fire events) |
| #91 | BUG-91 | SwarmCanvas.jsx | workflowDef prop changes not synced via useEffect |
| #92 | BUG-92 | useInbox.js | REST vs WS inbox items had incompatible field shapes |
| #93 | BUG-93 | SwarmEngine.js | stopExecution() missing budgetTracker.clearExecution() — memory leak |
| #94 | BUG-94 | routes/swarm.js | POST /pause never called swarmEngine.pauseExecution() — state not updated |
| #95 | BUG-95 | routes/swarm.js | POST /resume was a no-op stub — resumeExecution never called |
| #96 | BUG-96 | routes/inbox.js | Direct access to private SwarmEngine._executions field |
| #97 | BUG-97 | TriggerManager.js | cleanupExecution() leaked null-executionId workflow pollers |
| #98 | BUG-98 | SwarmEngine.js | getStatus() returned undefined budget (e.budget never set) |
| #99 | BUG-99 | routes/triggers.js | 32KB webhook body cap bypassed by global express.json middleware |

---

---

---
## 2026-03-29 — Analysis: Swarm UI Integration Gap Root Cause + Orchestration Pipeline Hardened
**Agent:** project-manager (analysis) + code-mapper (documentation)
**Triggered by:** Root cause investigation into why Swarm UI components were built but never wired into App.jsx routing across multiple task cycles — resulting in orphaned components that passed QA locally but were unreachable from the live app.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| ~/.claude/commands/create.md | MODIFIED | Added INTEGRATION RULE section — any new UI component task in /create pipeline must include a paired "wire into App.jsx" sub-task |
| ~/.claude/agents/project-manager.md | MODIFIED | Added INTEGRATION RULE section — project-manager must plan explicit integration tasks alongside feature tasks; must audit for orphaned components at session start |

### Functions Added
- None (global config files — no code functions)

### Functions Modified
- None

### Functions Removed
- None

### Connection Changes
- `/create` pipeline → now mandates that any frontend component task generates a paired integration sub-task in the same planning wave
- `project-manager` session-start protocol → now includes an orphaned-component audit step before proposing the next task

### Impact on Other Code
- All future task plans generated by project-manager will include explicit integration checkpoints — frontend-dev and App.jsx routing will be co-planned rather than treated as separate sequential concerns
- Existing codebase unaffected — this is a process change only; no project files were modified

---

---
## 2026-03-31 — Tasks #104-#110: QA Bug-Fix Pass + v3.0.0 Version Bump
**Agent:** frontend-dev (Tasks #104-#109), devops/release (Task #110)
**Triggered by:** Final QA pass before v3.0.0 release — 6 UI bugs found during visual regression testing of SwarmView, InterAgentFeed, HitlInbox, and useSwarm hook.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/canvas/InterAgentFeed.jsx | MODIFIED | Empty-state div now has `w-56 shrink-0` — prevents React Flow canvas from collapsing horizontally when feed is empty |
| client/src/views/SwarmView.jsx | MODIFIED | Stop button visible when paused; Run gated by activeProjectId; HITL drawer gets header+close; HITL badge uses stopPropagation; runError state added |
| client/src/panels/HitlInbox.jsx | MODIFIED | InboxItem handleApproveConfirm + handleReject call setError() on null executionId/itemId instead of silent return |
| client/src/hooks/useSwarm.js | MODIFIED | Removed agentStates top-level Zustand subscription; uses useSwarmStore.getState() inside handoff_started handler |
| package.json | MODIFIED | version: "0.1.0" → "3.0.0" |

### Functions Added
- None

### Functions Modified
- `InterAgentFeed()` in `client/src/canvas/InterAgentFeed.jsx` — empty-state branch: outer div classes changed from (implicit auto-width) to `flex flex-col h-full bg-gray-900 border-l border-gray-700 w-56 shrink-0`
- `SwarmView()` in `client/src/views/SwarmView.jsx` — Stop button condition: `executionStatus === 'running'` → `executionStatus === 'running' || executionStatus === 'paused'`; Run button condition: added `&& activeProjectId` gate; `runError` state added (`useState('')`); HITL inbox drawer now has header row (title span + close button); HITL badge button adds `e.stopPropagation()`
- `handleRun()` in `client/src/views/SwarmView.jsx` (internal) — guard added: if `!activeProjectId` → `setRunError('Select a project first before running a workflow.')` and early return; clears runError at top of happy path
- `InboxItem({ inboxEntry, executionId, onResolved })` in `client/src/panels/HitlInbox.jsx` — `handleApproveConfirm`: null check now calls `setError('No active execution — cannot approve/reject.')` instead of bare `return`; `handleReject`: same fix
- `useSwarm(workflowId)` in `client/src/hooks/useSwarm.js` — removed `const agentStates = useSwarmStore((s) => s.agentStates)` top-level selector; handoff_started handler now reads: `const sourceAgent = useSwarmStore.getState().agentStates[msg.sourceNodeId]`
- `connectWs(executionId)` in `client/src/hooks/useSwarm.js` — handoff_started case updated: agentStates now sourced from `useSwarmStore.getState()` (imperative read) instead of stale closure over the removed selector

### Functions Removed
- None

### Connection Changes
- `SwarmView` → `useAppState` — now also reads `projects` list (to derive `projectPath` from `activeProjectId`) in addition to `activeProjectId`
- `SwarmView` → `apiPost` — now imports `apiPost` from `hooks/useApi.js` for pause/resume calls (was called indirectly only through useSwarm)
- `useSwarm.connectWs` — no longer has `agentStates` as a dependency in the `useCallback` dep array (removed from closure chain)

### Impact on Other Code
- SwarmView toolbar now has 5 possible button states: idle+workflow+project (Run), running (Pause + Stop), paused (Resume + Stop), stopped (Reset), idle without project (no Run). All are mutually exclusive.
- `runError` banner appears beneath the toolbar and above PromptToFlowBar — any component absolutely positioned relative to SwarmView should account for this additional conditional row
- HitlInbox InboxItem now has visible error feedback in the card when executionId is null — callers that render HitlInbox without an active execution will see this error on any approve/reject attempt. This is correct behavior; was previously a silent no-op that confused users.
- useSwarm no longer causes re-renders of its consumer on agent state changes — only on the specific store slices it subscribes to (setExecution, updateAgentState, etc. actions). This is a performance improvement with no behavioral change.

---
---
## 2026-03-31 — Task #41: Post-Fix Regression QA
**Agent:** qa-tester (inline — npm test)
**Triggered by:** Regression suite run after Tasks #32–#40 Phase 10 bug fixes. Also correcting stale PENDING status for Tasks #32–#40 in TASK_PLAN.md (completed in a prior session).

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| docs/TASK_PLAN.md | MODIFIED | Task #41 status updated PENDING → COMPLETED |
| docs/memory/CODE_MAP.md | MODIFIED | Test coverage snapshot appended (187/187 tests, v3.0.0) |

### Functions Added
- none

### Functions Modified
- none

### Functions Removed
- none

### Connection Changes
- none — test-only run; no source or test file modifications

### Impact on Other Code
- Establishes 187-test / 9-file / 5.16s baseline for v3.0.0. All future PRs must maintain 187/187 pass rate.
- Tasks #32–#40 status retroactively corrected in TASK_PLAN.md; no code impact.

---

## 2026-03-31 — v3.0.0 RELEASE

**Agent:** qa-tester (final inspection) + code-mapper (documentation)
**Triggered by:** Final QA inspection pass confirming zero bugs — formal v3.0.0 release declaration.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| docs/memory/CHANGELOG.md | MODIFIED | Appended v3.0.0 release entry (this entry) |

### Functions Added
- None

### Functions Modified
- None

### Functions Removed
- None

### Connection Changes
- None — release declaration only; no source modifications

### Impact on Other Code
- None

### Release Summary
| Metric | Value |
|--------|-------|
| Version | v3.0.0 |
| Release date | 2026-03-31 |
| Total tasks completed | 115 / 115 |
| Test suite result | 187 / 187 PASS |
| Client build | 473 modules, 866.72 kB, 0 errors |
| QA inspection | CLEAN — zero bugs found |
| Security audit | SEC-V3-01 through SEC-V3-07 all PASS |
| Open bugs | 0 |
| Swarm Orchestrator | Fully functional (PromptToFlowBar → SwarmEngine → HITL → TriggerManager) |

---

## 2026-03-31 — Tasks #114 + #115: Fix BUG-TOOLBAR-2 + BUG-TOOLBAR-3
**Agent:** frontend-dev (debugger)
**Triggered by:** Two race-condition bugs in the swarm toolbar: (1) switching workflows while a WS was live left a stale socket open; (2) clicking Stop + Pause/Resume simultaneously could POST to /api/v1/swarm/null/pause or /null/resume.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/hooks/useSwarm.js | MODIFIED | Cleanup useEffect dependency array changed from `[]` to `[workflowId]`. Also sets `wsRef.current = null` in cleanup. |
| client/src/views/SwarmView.jsx | MODIFIED | `handlePause` and `handleResume` each gained an early `if (!activeExecutionId) return` guard at the top of the function body. |

### Functions Added
- none

### Functions Modified
- `useSwarm(workflowId)` in `client/src/hooks/useSwarm.js` — BUG-TOOLBAR-2: cleanup useEffect dependency was `[]` (fired only on unmount). Changed to `[workflowId]` so React runs the cleanup — closing the live WS and nulling wsRef — whenever the workflowId prop changes. This prevents a stale WS from the previous workflow from remaining open after a new workflow is generated.
- `handlePause()` in `client/src/views/SwarmView.jsx` — BUG-TOOLBAR-3: added `if (!activeExecutionId) return` early exit. Prevents a POST to `/api/v1/swarm/null/pause` when Stop resolves (setting activeExecutionId = null) while Pause is still in-flight.
- `handleResume()` in `client/src/views/SwarmView.jsx` — BUG-TOOLBAR-3: added `if (!activeExecutionId) return` early exit. Same race condition guard as handlePause.

### Functions Removed
- none

### Connection Changes
- `useSwarm` cleanup lifecycle: previously disconnected only on component unmount. Now also disconnects on `workflowId` change — closes the WS before SwarmView re-calls `useSwarm` with the new id.

### Impact on Other Code
- `SwarmView.jsx` callers of `handlePause`/`handleResume` (Pause and Resume toolbar buttons) now silently no-op if `activeExecutionId` is null — this is safe since the buttons are only rendered when `executionStatus === 'running'` or `=== 'paused'`, meaning the race window is narrow and the guard only fires in the edge case.
- 187/187 tests pass. Build clean.

---

## 2026-03-31 — QA Swarm Inspection (post-v3.0.0)
**Agent:** qa-tester
**Triggered by:** Manual QA inspection of the Swarm section after v3.0.0 release — no code changes; 4 bugs catalogued for next fix wave.

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| client/src/views/SwarmView.jsx | INSPECTED (no change) | BUG-SWARM-1 (fitView broken after workflow generation) and BUG-SWARM-3 (workflowDef in local useState — lost on navigation) discovered |
| client/src/canvas/PromptToFlowBar.jsx | INSPECTED (no change) | BUG-SWARM-2 discovered: opacity:0 injected into React Flow node style corrupts ResizeObserver |
| client/src/canvas/SwarmCanvas.jsx | INSPECTED (no change) | Context file for BUG-SWARM-1 and BUG-SWARM-2 |
| client/src/hooks/useSwarm.js | INSPECTED (no change) | BUG-SWARM-4 discovered: startExecution has no null guard on workflowId (line 66) |
| client/src/panels/HitlInbox.jsx | INSPECTED (no change) | No new bugs — all existing fixes (Task #108) verified correct |

### Functions Added
- None

### Functions Modified
- None

### Functions Removed
- None

### Connection Changes
- None (inspection only — no source modifications)

### Impact on Other Code
- BUG-SWARM-2 (`opacity:0` in node style) is the root cause of BUG-SWARM-1 (fitView failure): `opacity:0` blocks React Flow's ResizeObserver from measuring node dimensions, so the viewport fit calculation fires before nodes have nonzero dimensions — fixing SWARM-2 likely resolves SWARM-1 as well
- BUG-SWARM-3 (`workflowDef` in local `useState`) means every navigation away from SwarmView destroys the generated workflow and the canvas — connecting `workflowDef` to a persistent store (e.g. `useSwarmStore`) would fix this
- BUG-SWARM-4 (no null guard on `workflowId` in `useSwarm.startExecution`) means `apiPost('/api/v1/swarm/undefined/start', ...)` can be sent if `workflowDef` is null when the Run button is activated — toolbar `disabled` guard is present but a race is theoretically possible

### Bug Registry
| Bug ID | File | Location | Nature | Status |
|--------|------|----------|--------|--------|
| BUG-SWARM-2 | PromptToFlowBar.jsx | handleGenerate — animatedDef node style (line ~42) | `opacity: 0` injected into React Flow node style corrupts ResizeObserver measurement — root cause of BUG-SWARM-1 | OPEN |
| BUG-SWARM-1 | SwarmCanvas.jsx | `fitView` prop on `<ReactFlow>` | fitView does not trigger correctly after scaffold generates nodes — canvas stays at initial viewport because node dimensions are 0 when fitView fires | OPEN |
| BUG-SWARM-3 | SwarmView.jsx | `const [workflowDef, setWorkflowDef] = useState(null)` line 34 | workflowDef held in local useState — destroyed on component unmount / tab navigation | OPEN |
| BUG-SWARM-4 | useSwarm.js | `startExecution` line 66 — template literal `${workflowId}` | workflowId can be undefined if workflowDef has not been generated — no explicit null guard before the apiPost call | OPEN |

---
