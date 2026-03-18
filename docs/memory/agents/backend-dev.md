---
## 2026-03-18 — Task #7: Entity Management API — Agents, Skills, CLAUDE.md
**Status:** COMPLETED
**Called by:** orchestrator (user via task assignment)

### Context when I started
Tasks #3-#6 were complete. The server had: ConfigStore, ProcessRegistry, BinaryDiscovery, SessionManager (PTY), middleware (csrf, security, pathValidation), and routes for /api/v1/projects and /api/v1/sessions. FileManager.js was planned for Task #5 but was never created — explicitly noted in PROGRESS.md as a gap Task #7 must fill. The package name for atomic writes is `write-file-atomic` (not `write-atomic`), confirmed from both server/package.json and node_modules directory listing.

### What I did
1. Read all memory files (PROJECT.md, DECISIONS.md, PROGRESS.md) and all relevant existing source files (server/index.js, ConfigStore.js, pathValidation.js, csrf.js, routes/projects.js, server/package.json).
2. Confirmed `write-file-atomic` is installed (not `write-atomic`).
3. Created `server/services/FileManager.js` — the missing prerequisite. Provides validatePath(), readFile(), writeFile(), deleteFile(), listDirectory(), ensureDirectory(). validatePath() checks path.resolve(filePath) starts with path.resolve(allowedBase) + path.sep (or equals base). writeFile() creates parent directories before writing atomically.
4. Created `server/utils/frontmatter.js` — shared utility with parseFrontmatter(), serializeFrontmatter(), filePathToId(). Handles \r\n (Windows) line endings in the frontmatter regex. Uses js-yaml for parse/serialize.
5. Created `server/routes/agents.js` — GET/POST/PUT/DELETE for .md agent files in ~/.claude/agents (user scope) and <project>/.claude/agents (project scope). Name validated against `^[a-z][a-z0-9-]*$`. PUT/DELETE require filePath in body. resolveAllowedBase() internal helper validates filePath is inside user or project directories.
6. Created `server/routes/skills.js` — GET/POST/PUT/DELETE. Scans 4 locations: user modern (skills/*/SKILL.md), user legacy (commands/*.md), project modern, project legacy. POST creates <base>/skills/<name>/SKILL.md directory structure. DELETE accepts dirPath (modern) or filePath (legacy). Name validated against `^[a-z0-9][a-z0-9-]*$` and max 64 chars.
7. Created `server/routes/claudemd.js` — GET (both scopes), PUT /user, PUT /project. GET returns empty string if file missing. Both PUTs go through FileManager.writeFile() with correct allowedBase. Returns lineCount in 200 response.
8. Updated `server/index.js` to import and mount the three new routers at /api/v1/agents, /api/v1/skills, /api/v1/claudemd.
9. Ran `npm run build` — clean build, no errors. Ran `node --check` on all 5 new files — all passed.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/services/FileManager.js | CREATED | Missing prerequisite from Task #5; centralised atomic I/O with path traversal protection |
| server/utils/frontmatter.js | CREATED | Shared YAML frontmatter parse/serialize + filePathToId() for agents, skills, claudemd routes |
| server/routes/agents.js | CREATED | CRUD for agent .md files; user scope (~/.claude/agents) and project scope |
| server/routes/skills.js | CREATED | CRUD for skill files; modern (skills/*/SKILL.md) and legacy (commands/*.md) formats |
| server/routes/claudemd.js | CREATED | Read/write CLAUDE.md for user and project scope |
| server/index.js | MODIFIED | Added imports and mounts for agentsRouter, skillsRouter, claudemdRouter |
| docs/TASK_PLAN.md | MODIFIED | Marked Task #7 Status: COMPLETED |

### Improvements delivered
- FileManager.js now exists; all entity routes use it consistently (no direct fs.writeFile calls for config files)
- All 3 entity API route files follow the same pattern as existing routes (ApiError, try/catch, next(err))
- YAML frontmatter parsed with js-yaml, not manual string parsing
- Path traversal blocked at FileManager.validatePath() AND at resolveAllowedBase() in routes
- Windows \r\n line endings handled in frontmatter regex
- All 4 skill scan locations implemented (user modern, user legacy, project modern, project legacy)
- Missing parent directories created automatically in FileManager.writeFile()
- Non-existent directories return [] not 404 in FileManager.listDirectory()
- Empty CLAUDE.md returns "" not error

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| FileManager missing | Not implemented in Task #5 despite being in spec | Created it in Task #7 as first step | FIXED |

### Decisions I made
- Shared frontmatter utils in server/utils/ rather than duplicating in each route file — keeps routes clean and consistent
- resolveAllowedBase() in both agents.js and skills.js: validates filePath against user dir AND all registered projects; throws ApiError(400) if no match — prevents writes to arbitrary paths even if FileManager.validatePath() were somehow bypassed
- DELETE /skills/:id accepts both dirPath (for modern skills, removes whole directory via fs.promises.rm) and filePath (for legacy, removes single file via fileManager.deleteFile) — the caller knows which format the skill uses
- listDirectory() returns [] on ENOENT instead of throwing — avoids 500 errors when agent/skill directories don't exist yet
- ensureDirectory() in FileManager creates parents; writeFile() also calls mkdir -p — belt-and-suspenders to handle both call paths

### What I learned
- write-file-atomic (v5) exports a default function, same as in ConfigStore.js — confirmed from existing usage pattern there
- node --input-type=module --check works for ESM syntax validation without needing to actually run the module (avoids import resolution errors)
- FileManager.validatePath() must check both resolved === base AND resolved.startsWith(base + sep) — the sep guard prevents "/foo/bar-evil" matching "/foo/bar"
- The task spec suggested `writeFileAtomic(resolved, content, { encoding: 'utf8' })` — the package accepts options object as third arg in v5

### State I'm leaving behind
All 5 new files are created and syntactically valid. npm run build passes. The entity management API is fully implemented and mounted:
- GET/POST/PUT/DELETE /api/v1/agents
- GET/POST/PUT/DELETE /api/v1/skills
- GET /api/v1/claudemd, PUT /api/v1/claudemd/user, PUT /api/v1/claudemd/project

No runtime testing was performed (no server start, no HTTP calls) — the server requires the Claude binary to start. Syntax and build verification passed.

### Handoff
Task #8 (frontend-dev) is the next task — it builds the AgentEditor, SkillEditor, ClaudeMdEditor React components that call these new endpoints. All endpoints are documented in the task spec. Key notes for frontend-dev:
- PUT and DELETE for agents/skills require `filePath` (and `dirPath` for modern skill delete) in the request body
- Entity IDs are SHA-256(filePath) hex slices — they are stable but cannot be reversed to a path, hence filePath must be sent back on mutations
- All mutating requests need `X-Requested-With: ClaudeCodeManager` header (existing CSRF middleware)
- Skills GET returns a `format` field: "modern" or "legacy" — frontend should use this to decide whether to send dirPath or filePath on delete
---
