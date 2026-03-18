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
