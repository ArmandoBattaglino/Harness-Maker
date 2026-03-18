# CHANGELOG — Claude Code Visual Manager

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

