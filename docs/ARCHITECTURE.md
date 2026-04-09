# Claude Code Visual Manager — Architecture Reference
**Version:** 5.0 (updated for V5 N8N-Style Visual Workflow Editor)
**Date:** 2026-04-06 (originally 2026-03-18; V3 in Section 11; V5 in Section 12)
**Status:** Locked — DEC-001 through DEC-026 are final. V3 architecture in Section 11. V5 architecture in Section 12.
**Audience:** Every agent assigned to this project. Read this before writing a single line of code.

---

## Table of Contents

1. [Component Diagram](#1-component-diagram)
2. [Full API Surface](#2-full-api-surface)
3. [WebSocket Protocol Specification](#3-websocket-protocol-specification)
4. [RingBuffer Implementation Spec](#4-ringbuffer-implementation-spec)
5. [Idle Timeout Sweeper Spec](#5-idle-timeout-sweeper-spec)
6. [Claude Binary Discovery Algorithm](#6-claude-binary-discovery-algorithm)
7. [YAML Frontmatter Pattern](#7-yaml-frontmatter-pattern)
8. [React State Management](#8-react-state-management)
9. [Error Handling Matrix](#9-error-handling-matrix)
10. [Startup Sequence](#10-startup-sequence)
11. [V3 Swarm Orchestrator Architecture](#11-v3-swarm-orchestrator-architecture)
12. [V5 N8N-Style Visual Workflow Editor Architecture](#12-v5-n8n-style-visual-workflow-editor-architecture)
13. [V9.0 Stream-JSON Agent Migration Architecture](#13-v90-stream-json-agent-migration-architecture)

---

## 1. Component Diagram

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Browser (localhost only)                          │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      React SPA (Vite build)                      │   │
│  │                                                                  │   │
│  │  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐│   │
│  │  │ProjectsView│ │ Terminal │ │ JobView  │ │Deployment │ │ Context  ││   │
│  │  │ (Dashboard)│ │  View    │ │          │ │ Manager   │ │ Editor   ││   │
│  │  │            │ │          │ │          │ │           │ │          ││   │
│  │  │ Cards      │ │ xterm.js │ │PromptForm│ │ Profiles  │ │ Rules    ││   │
│  │  │ Register   │ │ Terminal │ │ JobPanel │ │ Processes │ │ Preview  ││   │
│  │  │ Scaffold   │ │ FitAddon │ │ react-md │ │ Environ.  │ │ Sections ││   │
│  │  └─────┬──────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬────┘│   │
│  │        │              │            │              │             │     │   │
│  │  ┌─────▼──────────────▼────────────▼──────────────▼─────────────▼──┐ │   │
│  │  │           AppContext (useReducer + Context)                      │ │   │
│  │  │  activeProjectId · projects[] · sessions{} · view               │ │   │
│  │  │  agents[] · skills[] · claudeMd{}                               │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────────┐ │   │
│  │  │              Sidebar (Sidebar.jsx)                            │ │   │
│  │  │  6-item icon nav · project list · Material Symbols icons     │ │   │
│  │  │  views: projects | terminal | jobs | deployments | context | swarm │ │   │
│  │  └──────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   WebSocket ws://127.0.0.1:PORT/ws?sessionId=<uuid>  (PTY terminal)     │
│   EventSource GET /api/v1/jobs/:id/stream             (job streaming)    │
│   fetch() REST /api/v1/*                             (all mutations)     │
└──────────────────────────────────────────────────────────────────────────┘
                            │  loopback only
                            │  127.0.0.1:PORT
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Node.js Server Process                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    server/index.js (bootstrap)                  │    │
│  │  express() · helmet() · csrf middleware · static SPA serve      │    │
│  │  http.createServer() · ws.Server attach · listen(PORT,127.0.0.1)│    │
│  └──────────────────────┬──────────────────────────────────────────┘    │
│                         │                                                │
│         ┌───────────────┴──────────────────┐                            │
│         │                                  │                            │
│  ┌──────▼──────────┐             ┌─────────▼───────────────────────┐    │
│  │   Express Router│             │       ws.Server                 │    │
│  │                 │             │                                 │    │
│  │  /api/v1/       │             │  upgrade: /ws?sessionId=<uuid>  │    │
│  │  projects.js    │             │  → terminalHandler.js           │    │
│  │  sessions.js    │             │                                 │    │
│  │  jobs.js        │             └─────────────────────────────────┘    │
│  │  agents.js      │                                                    │
│  │  skills.js      │                                                    │
│  │  claudemd.js    │                                                    │
│  └──────┬──────────┘                                                    │
│         │  calls into services                                           │
│         ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         Services Layer                           │   │
│  │                                                                  │   │
│  │  ┌──────────────────┐  ┌──────────────┐  ┌────────────────────┐ │   │
│  │  │  SessionManager  │  │  JobRunner   │  │    FileManager     │ │   │
│  │  │                  │  │              │  │                    │ │   │
│  │  │ Map<id,Session>  │  │ Map<id,Job>  │  │ Path validation    │ │   │
│  │  │ node-pty ops     │  │ spawn+stdin  │  │ YAML parse/serial  │ │   │
│  │  │ RingBuffer/sess  │  │ SSE clients  │  │ write-atomic all   │ │   │
│  │  │ idle sweeper     │  │ tree-kill    │  │ agent/skill/md     │ │   │
│  │  │ MAIN THREAD ONLY │  │              │  │                    │ │   │
│  │  └────────┬─────────┘  └──────┬───────┘  └────────────────────┘ │   │
│  │           │                   │                                  │   │
│  │  ┌────────▼───────┐  ┌────────▼──────────────────────────────┐  │   │
│  │  │  ConfigStore   │  │          ProcessRegistry               │  │   │
│  │  │                │  │                                        │  │   │
│  │  │ config.json    │  │  active_pids.json                      │  │   │
│  │  │ %APPDATA%      │  │  append on PTY spawn                   │  │   │
│  │  │ write-atomic   │  │  remove on PTY kill                    │  │   │
│  │  │ project list   │  │  stale cleanup on startup              │  │   │
│  │  └────────────────┘  └────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────────┐
                │                           │
       ┌────────▼────────┐       ┌──────────▼──────────┐
       │  claude.exe      │       │    claude.exe         │
       │  (PTY session)   │       │    (job mode)         │
       │  node-pty/ConPTY │       │    child_process      │
       │  one per session │       │    stdin closed immed │
       │                  │       │    tree-kill on cancel│
       └──────────────────┘       └─────────────────────┘
```

### Service Dependency Graph

```
index.js
  ├── ConfigStore          (no deps — initializes first)
  ├── ProcessRegistry      (no deps — initializes second)
  ├── FileManager          (no deps — stateless utility)
  ├── SessionManager       (depends on: ConfigStore, ProcessRegistry)
  ├── JobRunner            (depends on: ConfigStore)
  └── Express routes
        ├── projects.js    → ConfigStore
        ├── sessions.js    → SessionManager, ConfigStore
        ├── jobs.js        → JobRunner, ConfigStore
        ├── agents.js      → FileManager, ConfigStore
        ├── skills.js      → FileManager, ConfigStore
        └── claudemd.js    → FileManager, ConfigStore
```

### React Component Tree

```
App.jsx
  ├── Sidebar.jsx                    [persistent left panel]
  │     ├── NAV_ITEMS (5 icon links: projects, terminal, jobs, deployments, context)
  │     ├── Project list (× n)
  │     └── AddProjectModal.jsx
  ├── ProjectsView.jsx               [view: projects — default landing]
  │     ├── Project cards (× n)
  │     ├── ConfirmDialog.jsx
  │     └── AddProjectModal.jsx
  ├── TerminalView.jsx                [view: terminal]
  │     └── Terminal.jsx             (xterm.js wrapper, one instance per session)
  ├── JobView.jsx                     [view: jobs]
  │     ├── JobPanel.jsx             (prompt form + submit)
  │     └── JobResult.jsx            (react-markdown render)
  ├── DeploymentManagerView.jsx       [view: deployments]
  │     ├── Profiles tab             (agent CRUD with YAML frontmatter)
  │     ├── Active Processes tab     (running sessions monitor)
  │     └── Environment tab          (skills CRUD, 4 scan locations)
  ├── ContextEditorView.jsx           [view: context]
  │     ├── Rule list / section editor (left pane)
  │     └── Syntax-highlighted preview (right pane)
  └── EntitiesView.jsx               [DEPRECATED — Phase 9; kept in codebase but unreachable]
```

> **Note (Phase 9, 2026-03-26):** EntitiesView.jsx still exists on disk but is no longer imported
> or routed to by App.jsx. Its functionality was split into DeploymentManagerView (agents + skills)
> and ContextEditorView (CLAUDE.md editing). It may be removed in a future cleanup.

---

## 2. Full API Surface

All endpoints are prefixed `/api/v1/`. All mutating endpoints (POST, PUT, PATCH, DELETE) require the header `X-Requested-With: ClaudeCodeManager` or receive `403 Forbidden`. All responses use `Content-Type: application/json` unless stated otherwise.

### Authentication

None. The app binds to `127.0.0.1` exclusively (DEC-002). CSRF protection is the only mitigation needed (DEC-008).

---

### Projects

#### `GET /api/v1/projects`

List all registered projects.

**Request:** No body.

**Response 200:**
```json
[
  {
    "id": "uuid-v4",
    "name": "my-app",
    "path": "C:\\Users\\arman\\projects\\my-app",
    "createdAt": "2026-03-18T10:00:00.000Z"
  }
]
```

**Error codes:** None beyond 500.

---

#### `POST /api/v1/projects`

Register an existing directory as a project.

**Request body:**
```json
{
  "name": "my-app",
  "path": "C:\\Users\\arman\\projects\\my-app"
}
```

**Validation:**
- `name`: required, non-empty string
- `path`: required, must be an absolute path, must point to an existing directory, must not contain `..` components or null bytes

**Response 201:**
```json
{
  "id": "uuid-v4",
  "name": "my-app",
  "path": "C:\\Users\\arman\\projects\\my-app",
  "createdAt": "2026-03-18T10:00:00.000Z"
}
```

**Error codes:**
- `400` — missing/invalid fields, path not absolute, path contains traversal
- `404` — path does not exist on the filesystem
- `409` — path already registered as a project

---

#### `POST /api/v1/projects/scaffold`

Create a new project directory with starter `.claude/` structure.

**Request body:**
```json
{
  "name": "new-project",
  "path": "C:\\Users\\arman\\projects\\new-project"
}
```

**Server actions (in order):**
1. Validate name and path (same rules as POST /projects)
2. `fs.mkdirSync(path, { recursive: true })`
3. `fs.mkdirSync(path/.claude, { recursive: true })`
4. Write starter `CLAUDE.md` to `path/.claude/CLAUDE.md` via write-atomic
5. Register project in ConfigStore
6. Return project record

**Starter CLAUDE.md template:**
```
# Project: <name>

## Stack
<!-- Describe your tech stack here -->

## Common Commands
<!-- List frequently used bash commands -->

## Coding Standards
<!-- Document project-specific conventions -->
```

**Response 201:** Same shape as `POST /api/v1/projects`.

**Error codes:**
- `400` — invalid name or path
- `409` — path already registered

---

#### `DELETE /api/v1/projects/:id`

Remove a project from the registry. Does NOT touch the filesystem.

**Response 204:** No body.

**Error codes:**
- `404` — project ID not found in registry

---

### Sessions

#### `GET /api/v1/sessions`

List all active PTY sessions.

**Response 200:**
```json
[
  {
    "sessionId": "uuid-v4",
    "projectId": "uuid-v4",
    "pid": 12345,
    "status": "active",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "lastActivityAt": "2026-03-18T10:05:00.000Z"
  }
]
```

---

#### `POST /api/v1/sessions`

Spawn a new PTY session for a project.

**Request body:**
```json
{
  "projectId": "uuid-v4"
}
```

**Server actions (in order):**
1. Validate projectId exists in ConfigStore
2. Validate `project.path` is an existing directory
3. Discover claude binary (see Section 6)
4. Spawn PTY: `pty.spawn(claudeBin, [], { name: "xterm-color", cols: 80, rows: 24, cwd: project.path, env: { ...process.env } })`
5. Construct `SessionRecord` (see Data Models)
6. Wire permanent `pty.onData` handler (DEC-009)
7. Register PID in ProcessRegistry
8. Store in `SessionManager.sessions` Map
9. Return session record

**Response 201:**
```json
{
  "sessionId": "uuid-v4",
  "projectId": "uuid-v4",
  "pid": 12345,
  "createdAt": "2026-03-18T10:00:00.000Z"
}
```

**Error codes:**
- `400` — missing projectId
- `404` — projectId not in registry
- `503` — claude binary not found (includes discovery error message)

---

#### `DELETE /api/v1/sessions/:id`

Kill a PTY session.

**Server actions (in order):**
1. Validate sessionId exists
2. Call `pty.kill()` on the session
3. Remove PID from ProcessRegistry
4. Close all connected WebSocket clients with code `1001` (Going Away)
5. Delete from `SessionManager.sessions` Map

**Response 204:** No body.

**Error codes:**
- `404` — session ID not found

---

### Jobs

#### `GET /api/v1/jobs`

List all in-memory jobs (running and completed since last restart).

**Response 200:**
```json
[
  {
    "jobId": "uuid-v4",
    "projectId": "uuid-v4",
    "prompt": "...",
    "status": "running",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "completedAt": null,
    "result": null
  }
]
```

`result` is populated with the Markdown string when `status` is `"done"`.

---

#### `POST /api/v1/jobs`

Spawn a new job.

**Request body:**
```json
{
  "projectId": "uuid-v4",
  "prompt": "Review auth.js for security issues",
  "allowedTools": "Read,Glob,Grep",
  "maxTurns": 10
}
```

**Field defaults:**
- `allowedTools`: `"all"` if omitted
- `maxTurns`: `10` if omitted

**Server actions (in order):**
1. Validate projectId exists; resolve `project.path`
2. Discover claude binary
3. Build argv: `["-p", prompt, "--output-format", "stream-json", "--tools", allowedTools, "--max-turns", String(maxTurns), "--no-session-persistence"]`
4. `child_process.spawn(claudeBin, argv, { cwd: project.path, stdio: ["pipe", "pipe", "pipe"] })` — NO `shell: true`
5. `child.stdin.end()` — IMMEDIATELY after spawn (DEC-005)
6. Construct `JobRecord` (see Data Models)
7. Wire `child.stdout` readline consumer
8. Store in `JobRunner.jobs` Map
9. Return job record

**Response 201:**
```json
{
  "jobId": "uuid-v4",
  "projectId": "uuid-v4",
  "createdAt": "2026-03-18T10:00:00.000Z"
}
```

**Error codes:**
- `400` — missing or invalid fields
- `404` — projectId not in registry
- `503` — claude binary not found

---

#### `GET /api/v1/jobs/:id`

Get the current state of a single job.

**Response 200:** Same shape as one element of `GET /api/v1/jobs`.

**Error codes:**
- `404` — job ID not found

---

#### `GET /api/v1/jobs/:id/stream`

SSE endpoint. Streams job output in real time. (DEC-003)

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**SSE event types emitted by server:**

| Event | Data shape | When |
|-------|-----------|------|
| `progress` | `{"type":"progress","raw": <json-line-string>}` | Each stdout line from claude |
| `done` | `{"type":"done","result": "<markdown-string>"}` | When child process exits with result |
| `error` | `{"type":"error","message": "<string>"}` | Child exits with non-zero code or stderr |
| `cancelled` | `{"type":"cancelled"}` | After DELETE /jobs/:id completes |

**SSE data format example:**
```
event: progress
data: {"type":"progress","raw":"{\"type\":\"assistant\",\"message\":{...}}"}

event: done
data: {"type":"done","result":"## Security Review\n\nFound 2 issues..."}
```

**Behavior if job already completed before client connects:** Server immediately emits the `done` or `error` event from the stored `JobRecord.result`, then closes the stream.

**Error codes:**
- `404` — job ID not found (returns JSON, not SSE)

---

#### `DELETE /api/v1/jobs/:id`

Cancel a running job.

**Server actions (in order):**
1. Validate jobId exists and status is `"running"`
2. `tree-kill(child.pid)` (DEC-006)
3. Set `job.status = "cancelled"`
4. Send `cancelled` SSE event to all connected clients
5. Close all SSE response streams for this job

**Response 204:** No body.

**Error codes:**
- `404` — job ID not found
- `409` — job is not in `"running"` status (already done/cancelled)

---

### Agents

All agent endpoints accept an optional query parameter `?projectId=<uuid>` to scope results to a specific project. Without it, user-scoped agents only are returned.

#### `GET /api/v1/agents?projectId=<uuid>`

Return all agent files for user scope and (if projectId given) project scope.

**Response 200:**
```json
[
  {
    "id": "sha1-of-filePath",
    "name": "code-reviewer",
    "scope": "user",
    "filePath": "C:\\Users\\arman\\.claude\\agents\\code-reviewer.md",
    "frontmatter": {
      "name": "code-reviewer",
      "description": "Reviews code for quality and best practices",
      "tools": "Read,Glob,Grep",
      "model": "sonnet"
    },
    "body": "You are a senior code reviewer..."
  }
]
```

**Error codes:** None beyond 500.

---

#### `POST /api/v1/agents`

Create a new agent file.

**Request body:**
```json
{
  "name": "my-agent",
  "scope": "user",
  "projectId": "uuid-v4",
  "frontmatter": {
    "description": "Does something useful",
    "tools": "Read,Write"
  },
  "body": "You are a helpful agent..."
}
```

**Validation:**
- `name`: must match `^[a-z][a-z0-9-]*$`
- `scope`: must be `"user"` or `"project"`
- `projectId`: required if scope is `"project"`
- `frontmatter.description`: required

**Server actions:**
1. Resolve target path: `~/.claude/agents/<name>.md` (user) or `<project>/.claude/agents/<name>.md` (project)
2. FileManager validates resolved path stays within expected base directory
3. Serialize: `---\n${yaml.dump(frontmatter)}---\n${body}`
4. Write with write-atomic

**Response 201:** Full agent record (same shape as GET item).

**Error codes:**
- `400` — name invalid, scope invalid, missing description
- `404` — projectId not found (for project scope)
- `409` — agent with this name already exists at this scope

---

#### `PUT /api/v1/agents/:id`

Update an existing agent.

**Request body:**
```json
{
  "frontmatter": { "description": "Updated description" },
  "body": "Updated agent body..."
}
```

**Server actions:**
1. Resolve agent by ID (SHA1 of filePath stored at creation)
2. Read current file to get existing frontmatter (merge, not replace)
3. Serialize and write atomically

**Response 200:** Updated agent record.

**Error codes:**
- `404` — agent ID not found

---

#### `DELETE /api/v1/agents/:id`

Delete an agent file.

**Response 204:** No body.

**Error codes:**
- `404` — agent ID not found

---

### Skills

Same scoping pattern as agents (`?projectId=<uuid>`). Skills use the new directory format (`skills/<name>/SKILL.md`) for creates; reads also check legacy `commands/` locations.

#### `GET /api/v1/skills?projectId=<uuid>`

Return all skill files (new format + legacy commands).

**Response 200:**
```json
[
  {
    "id": "sha1-of-filePath",
    "name": "fix-issue",
    "scope": "user",
    "filePath": "C:\\Users\\arman\\.claude\\skills\\fix-issue\\SKILL.md",
    "format": "skills",
    "frontmatter": {
      "description": "Fix a GitHub issue by number",
      "disable-model-invocation": true
    },
    "body": "Fix GitHub issue $ARGUMENTS..."
  }
]
```

`format` is `"skills"` or `"commands"` (legacy).

---

#### `POST /api/v1/skills`

Create a new skill.

**Request body:**
```json
{
  "name": "my-skill",
  "scope": "user",
  "projectId": "uuid-v4",
  "frontmatter": { "description": "Does something" },
  "body": "Skill body with $ARGUMENTS"
}
```

**Server actions:**
1. Resolve base: `~/.claude/skills/` or `<project>/.claude/skills/`
2. Create directory `<base>/<name>/`
3. Write `SKILL.md` with write-atomic

**Response 201:** Full skill record.

**Error codes:**
- `400` — invalid name (same regex as agents)
- `409` — skill directory already exists

---

#### `PUT /api/v1/skills/:id`

Update an existing skill's frontmatter and/or body.

**Request body:** Same shape as POST body minus `name` and `scope`.

**Response 200:** Updated skill record.

**Error codes:**
- `404` — skill not found

---

#### `DELETE /api/v1/skills/:id`

Delete the skill directory and all its contents.

**Response 204:** No body.

**Error codes:**
- `404` — skill not found

---

### CLAUDE.md

#### `GET /api/v1/claudemd?projectId=<uuid>`

Return both scopes of CLAUDE.md for a given project context.

**Response 200:**
```json
{
  "userScope": {
    "path": "C:\\Users\\arman\\.claude\\CLAUDE.md",
    "content": "# Global instructions...",
    "lineCount": 42,
    "exists": true
  },
  "projectScope": {
    "path": "C:\\Users\\arman\\projects\\my-app\\.claude\\CLAUDE.md",
    "content": "# Project instructions...",
    "lineCount": 18,
    "exists": true
  }
}
```

If a file does not exist, `content` is `""` and `exists` is `false`.

**Error codes:**
- `400` — missing projectId

---

#### `PUT /api/v1/claudemd/user`

Write user-scoped CLAUDE.md.

**Request body:**
```json
{
  "content": "# Global instructions..."
}
```

**Server actions:**
1. FileManager validates write target is within `os.homedir()/.claude/`
2. Write with write-atomic

**Response 200:**
```json
{ "path": "C:\\Users\\arman\\.claude\\CLAUDE.md", "lineCount": 42 }
```

**Error codes:**
- `400` — missing content

---

#### `PUT /api/v1/claudemd/project`

Write project-scoped CLAUDE.md.

**Request body:**
```json
{
  "projectId": "uuid-v4",
  "content": "# Project instructions..."
}
```

**Response 200:**
```json
{ "path": "C:\\Users\\arman\\projects\\my-app\\.claude\\CLAUDE.md", "lineCount": 18 }
```

**Error codes:**
- `400` — missing projectId or content
- `404` — projectId not found

---

## 3. WebSocket Protocol Specification

### Connection Endpoint

```
ws://127.0.0.1:<PORT>/ws?sessionId=<uuid-v4>
```

The WebSocket server is attached to the same `http.Server` instance as Express. The `upgrade` event is intercepted by `ws.Server` and routed to `server/ws/terminalHandler.js`.

### WebSocket Message Payload Cap

Maximum inbound message size: `1 MB` (`maxPayload: 1024 * 1024` on the `ws.Server`). Messages exceeding this are rejected and the connection is closed.

### Message Types

#### Client → Server

All client messages are JSON-encoded strings.

| Message type | Shape | Action |
|-------------|-------|--------|
| `input` | `{ "type": "input", "data": "<string>" }` | `session.pty.write(data)` |
| `resize` | `{ "type": "resize", "cols": <number>, "rows": <number> }` | `session.pty.resize(cols, rows)` |

No other message types are defined. Unknown types are silently ignored.

#### Server → Client

The server sends **raw binary PTY output bytes** (not JSON-wrapped). The xterm.js `Terminal.write()` method accepts these bytes directly. There is no envelope.

The only structured server-to-client messages are WebSocket close frames with specific codes (see below).

### WebSocket Close Codes

| Code | Meaning | Trigger |
|------|---------|---------|
| `1000` | Normal closure | Client called `ws.close()` (e.g., user switched projects) |
| `1001` | Going Away | Server killed the session (`DELETE /api/v1/sessions/:id`) |
| `4001` | Unauthorized | `X-Requested-With` header absent on the upgrade request |
| `4004` | Session Not Found | `sessionId` query param maps to no active session |

### Connection Lifecycle Flow

```
Client                              Server (terminalHandler.js)
  │                                          │
  │  GET /ws?sessionId=<uuid>                │
  │  Upgrade: websocket                      │
  │  X-Requested-With: ClaudeCodeManager    │
  ├─────────────────────────────────────────►│
  │                                          │  1. Validate header → else close(4001)
  │                                          │  2. Parse sessionId → else close(4004)
  │                                          │  3. session.clients.add(ws)
  │                                          │  4. session.lastActivityAt = now()
  │                                          │
  │◄─ [replay ring buffer bytes] ────────────│  5. ws.send(ringBuffer.toContiguousBuffer())
  │                                          │     (synchronous, before any live data)
  │                                          │
  │◄─ [live PTY bytes stream] ───────────────│  6. pty.onData fires → ws.send(data)
  │                                          │     (permanent handler, DEC-009)
  │                                          │
  │  { type:"input", data:"ls\r" }           │
  ├─────────────────────────────────────────►│  7. session.pty.write(data)
  │                                          │     session.lastActivityAt = now()
  │◄─ [PTY output bytes] ────────────────────│
  │                                          │
  │  { type:"resize", cols:120, rows:40 }    │
  ├─────────────────────────────────────────►│  8. session.pty.resize(120, 40)
  │                                          │
  │  ws.close() [tab close or project switch]│
  ├─────────────────────────────────────────►│  9. session.clients.delete(ws)
  │                                          │     PTY remains alive (DEC-009)
  │                                          │     Ring buffer continues filling
  │                                          │
  │  [later: reconnect with same sessionId] │
  │  GET /ws?sessionId=<same-uuid>           │
  ├─────────────────────────────────────────►│  10. Repeat steps 1-6 with new ws socket
  │◄─ [ring buffer replay then live] ────────│      ring buffer contains missed output
```

### Backpressure Handling

Before each `ws.send(data)` in the `pty.onData` handler, check the underlying socket's write buffer. On the server-side `ws` module, `ws.bufferedAmount` is not available (that is a browser WebSocket API). Instead, check `ws._socket.bufferSize`. If it exceeds `262144` (256 KB), skip sending to that specific client. The ring buffer still receives the data — the client will resync on its next reconnect via ring buffer replay.

This check is per-client. Slow clients do not block fast clients or the PTY.

### Session Switching Flow (React client)

```
User clicks Project B in sidebar
          │
          ▼
useSession hook: currentWs.close()         ← close WebSocket A (PTY A stays alive on server)
          │
          ▼
terminal.clear(); terminal.reset()         ← clear xterm.js canvas
          │
          ▼
Zustand: setActiveProjectId(projectB.id)
          │
          ▼
Check if session exists for Project B?
    ├── YES: connect ws to existing sessionId B
    └── NO: POST /api/v1/sessions { projectId: B.id }
             └── receive sessionId B
                 └── connect ws to sessionId B
          │
          ▼
WebSocket B connects → server replays ring buffer B
          │
          ▼
Ring buffer bytes written to terminal → live streaming resumes
```

---

## 4. RingBuffer Implementation Spec

### Purpose

Each `SessionRecord` contains one `RingBuffer` instance. It serves two functions:
1. Absorbs PTY output continuously (DEC-009 — pipe must always be drained)
2. Provides a replay snapshot to new WebSocket clients on reconnect

### Design: True Fixed-Capacity Circular Buffer

```
Buffer internal state:
  buffer: Buffer(MAX_BYTES)   ← pre-allocated, never grows
  writePos: number            ← index of next byte to write (mod MAX_BYTES)
  totalWritten: number        ← monotonic counter of bytes ever written
  MAX_BYTES: 102400           ← 100 × 1024 = 100 KB (DEC-004)
```

### Overflow Behavior

When `totalWritten > MAX_BYTES`, the buffer is full. New bytes overwrite the oldest bytes at `writePos`. The consumer reads the oldest-to-newest sequence by starting at `(writePos) % MAX_BYTES` for the oldest byte.

Overflow is silent — oldest terminal history is lost without error. This is correct behavior (terminal scrollback is a UX concern, not a data-integrity concern).

### Push Algorithm

```
push(data: Buffer | string):
  bytes = Buffer.from(data)
  for i in 0..bytes.length-1:
    buffer[writePos % MAX_BYTES] = bytes[i]
    writePos = (writePos + 1) % MAX_BYTES
    totalWritten++
```

Note: when `totalWritten >= MAX_BYTES`, incrementing `writePos` wraps around and overwrites the oldest byte. `writePos` is always maintained modulo `MAX_BYTES`, so the modulo on the left-hand side is redundant but kept for clarity.

Actual implementation should use a typed approach with bulk `Buffer.copy` for performance rather than byte-by-byte, using `Math.min` to split writes at the wrap boundary:

```
push(data: Buffer):
  remaining = data.length
  offset = 0
  while remaining > 0:
    spaceToEnd = MAX_BYTES - writePos
    chunkLen = Math.min(remaining, spaceToEnd)
    data.copy(buffer, writePos, offset, offset + chunkLen)
    writePos = (writePos + chunkLen) % MAX_BYTES
    totalWritten += chunkLen
    offset += chunkLen
    remaining -= chunkLen
```

### `toContiguousBuffer()` — Replay Algorithm

Returns a single `Buffer` of `min(totalWritten, MAX_BYTES)` bytes in correct chronological order (oldest first).

```
toContiguousBuffer(): Buffer
  filled = min(totalWritten, MAX_BYTES)
  if filled === 0: return Buffer.alloc(0)

  out = Buffer.alloc(filled)

  if totalWritten <= MAX_BYTES:
    // Buffer not yet full — data starts at index 0, ends at writePos
    buffer.copy(out, 0, 0, writePos)
  else:
    // Buffer is full — oldest byte is at writePos, wraps around
    startIdx = writePos  // oldest byte
    part1Len = MAX_BYTES - startIdx
    buffer.copy(out, 0, startIdx, MAX_BYTES)       // from startIdx to end
    buffer.copy(out, part1Len, 0, startIdx)        // from start to startIdx
  return out
```

### Memory Budget

- Per session: `102400` bytes (100 KB) pre-allocated at PTY spawn
- 5 concurrent sessions: `512000` bytes (500 KB total) — well within NFR-07

The buffer is pre-allocated with `Buffer.allocUnsafe(MAX_BYTES)` (not `alloc` — no need to zero-fill, PTY output will overwrite all bytes before any replay reads them for new sessions, and for old sessions `totalWritten` tracks valid extent).

### Class Interface

```javascript
class RingBuffer {
  constructor(maxBytes = 102400)
  push(data: Buffer | string): void
  toContiguousBuffer(): Buffer
  get bytesWritten(): number   // totalWritten (monotonic)
  get size(): number           // min(totalWritten, maxBytes)
  clear(): void                // reset for session reuse (not used in v1)
}
```

---

## 5. Idle Timeout Sweeper Spec

### Purpose

Prevent unbounded accumulation of zombie PTY sessions from abandoned browser tabs. Sessions with no connected clients and no PTY output for longer than the idle threshold are automatically killed.

### Configuration

| Parameter | Source | Default |
|-----------|--------|---------|
| `idleTimeoutMinutes` | `IDLE_TIMEOUT_MINUTES` env var or `AppConfig.settings.idleTimeoutMinutes` | `30` |
| Sweep interval | Hardcoded | 5 minutes (`300000` ms) |

Resolution order: env var takes precedence over config file value. Config file value takes precedence over the hardcoded default.

### Implementation

The sweeper runs as a `setInterval` inside `SessionManager`. It starts at the end of `SessionManager.initialize()`.

```
SWEEPER LOGIC (runs every 5 minutes):

  now = Date.now()
  idleThresholdMs = idleTimeoutMinutes * 60 * 1000

  for each [sessionId, session] in sessions:
    if session.clients.size > 0:
      continue  ← skip: client is connected, session is active

    idleMs = now - session.lastActivityAt.getTime()
    if idleMs < idleThresholdMs:
      continue  ← skip: idle but within threshold

    // Session is eligible for cleanup
    log.info(`Idle timeout: killing session ${sessionId} (idle ${idleMs}ms)`)
    pty.kill()
    ProcessRegistry.remove(session.pid)
    sessions.delete(sessionId)
```

### `lastActivityAt` Update Points

`lastActivityAt` must be updated (set to `new Date()`) in the following places:

1. Inside `pty.onData` handler — any PTY output (Claude is writing)
2. Inside WebSocket `message` handler for `input` type — user is typing
3. On WebSocket `connection` for the session — client reconnected

`lastActivityAt` is NOT updated on `resize` messages (resize is a client-driven layout event, not activity).

### Cleanup Sequence

When the sweeper (or any code path) kills a session:
1. `session.pty.kill()` — send SIGTERM to the ConPTY (triggers SIGTERM in claude.exe)
2. `ProcessRegistry.remove(session.pid)` — removes PID from `active_pids.json` via write-atomic
3. `sessions.delete(sessionId)` — removes from the in-memory Map
4. (Sweeper only) Any remaining WebSocket clients in `session.clients` are closed with code `1001`

Note: the sweeper checks `session.clients.size > 0` first, so step 4 only applies in the edge case where a client connects between the check and the kill (race condition acceptable — the client will receive a `1001` close and can handle it in the UI).

---

## 6. Claude Binary Discovery Algorithm

### Purpose

Locate the `claude` executable before any PTY spawn or job spawn. The discovery result is cached after first successful resolution to avoid repeated filesystem lookups.

### Algorithm (ordered, first match wins)

```
FUNCTION discoverClaudeBinary(): string | Error

  STEP 1 — Environment variable override
    if process.env.CLAUDE_BIN is set and non-empty:
      path = process.env.CLAUDE_BIN
      if isExecutableFile(path):
        return path
      else:
        throw Error("CLAUDE_BIN is set but '${path}' is not an executable file")
      // If CLAUDE_BIN is set, do NOT fall through to other steps.
      // A misconfigured explicit override should fail loudly.

  STEP 2 — PATH lookup (cross-platform)
    try:
      path = which.sync("claude")   // use 'which' npm package
      return path
    catch:
      pass  // not on PATH, continue

  STEP 3 — Windows known install location
    localAppData = process.env.LOCALAPPDATA
    if localAppData:
      candidate = path.join(localAppData, "AnthropicClaude", "claude.exe")
      if isExecutableFile(candidate):
        return candidate

  STEP 4 — Failure
    throw Error(
      "Claude binary not found. Ensure 'claude' is on your PATH, " +
      "or set the CLAUDE_BIN environment variable to the full path."
    )

HELPER isExecutableFile(p: string): boolean
  try:
    stat = fs.statSync(p)
    return stat.isFile()
    // On Windows, executability is determined by extension (.exe), not mode bits.
    // fs.statSync succeeding and isFile() is sufficient.
  catch:
    return false
```

### Caching

The resolved binary path is stored in a module-level variable in `server/services/SessionManager.js` (and separately in `JobRunner.js` — each service caches independently). Cache is populated on first call to `discoverClaudeBinary()` and never invalidated during a server run.

### Startup Validation

During server startup (see Section 10), after the binary is discovered, the server runs:

```
child_process.execFileSync(claudeBin, ["--version"])
```

If this throws, the server logs the error and exits with code `1`. The `--version` output is logged at `INFO` level.

`execFileSync` is used here (not `spawn`) because: (a) this is a one-shot synchronous check at startup, and (b) `--version` output is small and cannot overflow the `execFileSync` buffer.

---

## 7. YAML Frontmatter Pattern

### Overview

Agent files and skill files use YAML frontmatter embedded in Markdown. The `js-yaml` 4.x library handles all parse and serialize operations. No other YAML library is used.

### File Structure

```
---
<yaml-content>
---

<markdown-body>
```

The delimiter is exactly `---` on its own line. There must be a newline after the opening `---` and a newline before the closing `---`.

### Parse Algorithm

```javascript
function parseMarkdownWithFrontmatter(content) {
  // Match both \n and \r\n line endings (Windows CRLF tolerance)
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m);
  if (!match) {
    // No frontmatter — treat entire content as body
    return { frontmatter: {}, body: content };
  }

  let frontmatter = {};
  try {
    const parsed = yaml.load(match[1]);
    // yaml.load can return any scalar type (string, number, null) for trivial
    // YAML blocks. Only accept plain objects; fall back to {} for everything else.
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed;
    }
  } catch {
    // Malformed YAML — treat as empty frontmatter, preserve body
    frontmatter = {};
  }

  return { frontmatter, body: match[2] };
}
```

**Implementation notes:**
- A single regex replaces the line-split + loop approach. This handles `\r\n` inline without a pre-normalization step.
- `yaml.load` is called without a schema option (default CORE schema behavior). The result type is explicitly guarded — if YAML parses to a scalar (e.g., a bare number or string), the frontmatter falls back to `{}` rather than propagating a non-object into downstream code.
- Malformed YAML throws inside `yaml.load` — that is caught and treated as empty frontmatter, so the body is always preserved.

### Serialize Algorithm

```javascript
function serializeMarkdownWithFrontmatter(frontmatter, body) {
  const yamlStr = yaml.dump(frontmatter, {
    indent: 2,
    lineWidth: -1,      // never wrap long strings
    noCompatMode: true, // use YAML 1.2 booleans (true/false not yes/no)
    quotingType: '"',   // double-quote strings that need quoting
  });

  // Always use LF line endings in output (write-atomic writes bytes as-is)
  return `---\n${yamlStr}---\n\n${body}`;
}
```

### Windows CRLF Handling

- **On read:** Always normalize CRLF to LF (`replace(/\r\n/g, '\n')`) before parsing.
- **On write:** Always write with LF-only line endings. `write-atomic` writes the string as bytes without altering newlines. Do not introduce CRLF at the serialization step.
- **Rationale:** Claude Code parses agent and skill files on Windows and handles LF correctly. Introducing CRLF in the output would risk double-conversion issues.

### Agent Frontmatter Validation

Performed after `yaml.load()`, before writing to disk.

| Field | Rule |
|-------|------|
| `name` | Required. Must match `^[a-z][a-z0-9-]*$`. Max 64 chars. |
| `description` | Required. Non-empty string. |
| `tools` | Optional. If present, must be a string (comma-separated tool names). |
| `disallowedTools` | Optional. String. |
| `model` | Optional. If present, must be one of: `"sonnet"`, `"opus"`, `"haiku"`, `"inherit"`, or a full model ID string matching `/^claude-/`. |
| `permissionMode` | Optional. Must be one of: `"default"`, `"acceptEdits"`, `"dontAsk"`, `"bypassPermissions"`, `"plan"`. |
| `maxTurns` | Optional. Must be a positive integer. |
| `background` | Optional. Must be boolean. |
| `isolation` | Optional. If present, must be `"worktree"`. |

Unrecognized fields are passed through without error (forward compatibility).

### Skill Frontmatter Validation

| Field | Rule |
|-------|------|
| `name` | Optional. If present, must match `^[a-z][a-z0-9-]*$`. Max 64 chars. |
| `description` | Recommended. No format constraint — logged as warning if absent. |
| `argument-hint` | Optional. String. |
| `disable-model-invocation` | Optional. Boolean. |
| `user-invocable` | Optional. Boolean. |
| `allowed-tools` | Optional. String. |
| `model` | Optional. Same rules as agent `model` field. |
| `context` | Optional. If present, must be `"fork"`. |

### Argument Placeholder Preservation

Skill bodies may contain `$ARGUMENTS`, `$ARGUMENTS[N]`, or `$N` placeholders. These are plain text in the Markdown body — they are NOT parsed or transformed by `FileManager`. The body is stored and returned verbatim.

When the UI edits only frontmatter (not the body), the server must ensure the body from the original file is used unchanged for the write. The API contract (PUT /api/v1/skills/:id) always requires the client to send the full body; the server never modifies the body during a PUT.

---

## 8. React State Management

### Principle

Global state (Zustand) holds only data that is shared across multiple components or that must survive component unmounting (e.g., navigating away from a view). Everything that is local to a single component and does not need to be accessed elsewhere lives in local `useState`.

### Global Store (AppContext with useReducer)

**Store file:** `client/src/store/AppContext.jsx`

> **Note (Phase 9):** The original architecture specified Zustand. The actual implementation uses
> React Context + useReducer (AppProvider / useAppState / useAppDispatch). The state shape and
> actions listed below remain accurate; only the mechanism differs.

```javascript
// Shape of the Zustand store
{
  // Project registry (fetched from GET /api/v1/projects on mount)
  projects: Project[],
  activeProjectId: string | null,

  // Session registry (fetched from GET /api/v1/sessions on mount)
  // Key: projectId (one session per project in v1)
  sessions: Record<projectId, SessionRecord>,
  // SessionRecord: { sessionId, pid, status, createdAt }
  // The WebSocket and xterm.js Terminal instances are NOT in Zustand —
  // they live in the Terminal component's ref/state (see below)

  // Job list (accumulated in memory for the browser session lifetime)
  jobs: JobRecord[],
  // JobRecord: { jobId, projectId, prompt, status, result, createdAt }

  // Entity lists (fetched when DeploymentManagerView or ContextEditorView mounts, or when projectId changes)
  agents: AgentRecord[],
  skills: SkillRecord[],
  claudeMd: { userScope: ClaudeMdRecord, projectScope: ClaudeMdRecord } | null,

  // Actions
  setProjects: (projects: Project[]) => void,
  addProject: (project: Project) => void,
  removeProject: (id: string) => void,
  setActiveProjectId: (id: string | null) => void,

  setSession: (projectId: string, session: SessionRecord) => void,
  removeSession: (projectId: string) => void,

  addJob: (job: JobRecord) => void,
  updateJob: (jobId: string, patch: Partial<JobRecord>) => void,

  setAgents: (agents: AgentRecord[]) => void,
  setSkills: (skills: SkillRecord[]) => void,
  setClaudeMd: (data: ClaudeMdData) => void,
}
```

### What Lives in Global State vs Local State

| Data | Location | Reason |
|------|----------|--------|
| `projects[]` | Global (Context) | Needed by Sidebar and ProjectsView simultaneously |
| `activeProjectId` | Global (Context) | Needed by Sidebar, TerminalView, JobView, DeploymentManagerView, ContextEditorView |
| `sessions{}` | Global (Context, metadata only) | Session status shown in Sidebar |
| WebSocket instance (`ws`) | `Terminal.jsx` ref (`useRef`) | WebSocket is a side-effect object, not serializable; local to the Terminal component |
| xterm.js `Terminal` instance | `Terminal.jsx` ref | Same — not serializable, owns DOM canvas |
| `fitAddon` | `Terminal.jsx` ref | Bound to Terminal instance |
| `jobs[]` | Global (Context) | Job list persists across view navigations |
| SSE `EventSource` | `useJob.js` hook / `JobView.jsx` local ref | Scoped to the component that opened it |
| Job streaming partial output | `JobView.jsx` local state | Transient UI state; not needed elsewhere |
| `agents[]`, `skills[]` | Global (Context) | DeploymentManagerView Profiles and Environment tabs read from the same list |
| Agent/skill edit form state | `DeploymentManagerView.jsx` local state | Scoped to DeploymentManagerView |
| `claudeMd` | Global (Context) | Accessed by ContextEditorView |
| CLAUDE.md editor content and rules | `ContextEditorView.jsx` local state | Scoped to the editor; includes parsed rule sections |
| Line count warning flag | Computed from local state | Derived, no global relevance |

### Custom Hooks

#### `useSession(projectId)`

`client/src/hooks/useSession.js`

Manages the WebSocket connection lifecycle for a given project's terminal session.

```
Responsibilities:
- On mount (or projectId change):
    1. Read sessionId from Zustand sessions[projectId]
    2. If no session: POST /api/v1/sessions → store in Zustand → connect WS
    3. If session exists: connect WS directly
- Expose: { ws, isConnected, error }
- On unmount: ws.close() (NOT pty.kill — the PTY stays alive)
- Exposes sendInput(data) and sendResize(cols, rows) helper functions
```

#### `useJob(jobId)`

`client/src/hooks/useJob.js`

Manages the SSE stream for a running job.

```
Responsibilities:
- Opens EventSource at GET /api/v1/jobs/:jobId/stream
- On 'progress' event: accumulate partial output in local component state
- On 'done' event: call Zustand updateJob(jobId, { status: 'done', result })
- On 'error' event: call Zustand updateJob(jobId, { status: 'error' })
- On 'cancelled' event: call Zustand updateJob(jobId, { status: 'cancelled' })
- On unmount: eventSource.close()
- Expose: { partialOutput, isDone }
```

### Session Switching Flow (Zustand + Terminal Component)

```
1. User clicks Project B in Sidebar
   → Sidebar calls setActiveProjectId(projectB.id)

2. TerminalView re-renders with new activeProjectId
   → useSession(projectB.id) detects projectId changed
   → Calls ws.close() on old WebSocket (ref.current.ws)
   → terminalRef.current.clear(); terminalRef.current.reset()

3. useSession checks Zustand: sessions[projectB.id]?
   → If no session: POST /api/v1/sessions
   → Receive { sessionId }
   → setSession(projectB.id, { sessionId, ... })

4. useSession opens new WebSocket(ws://127.0.0.1:PORT/ws?sessionId=sessionIdB)
   → Server replays ring buffer → terminal.write(replayBytes)
   → Live PTY output begins

5. Sidebar updates active highlight via activeProjectId selector
```

---

## 9. Error Handling Matrix

### Conventions

- **`log.*`** means the server-side logger (structured JSON log, no sensitive data per SEC-08)
- **UI toast** means a non-blocking notification shown for 5 seconds
- **UI error banner** means a persistent banner that stays until dismissed or resolved

### Server-Side Errors

| Error | Where caught | HTTP response | Log level | Notes |
|-------|-------------|---------------|-----------|-------|
| Claude binary not found | `discoverClaudeBinary()` in service | `503 { error: "claude binary not found", hint: "..." }` | ERROR | Logged at startup and at each spawn attempt |
| PTY spawn failure (node-pty throws) | `SessionManager.createSession()` | `500 { error: "PTY spawn failed", detail: err.message }` | ERROR | PID never registered; no cleanup needed |
| node-pty prebuilt binary missing | Module load in `index.js` | Server exits with code 1 | FATAL | DEC-010: must be caught before any PTY code runs |
| Project path not found | `POST /api/v1/projects` validation | `404 { error: "path does not exist" }` | WARN | |
| Path traversal attempt | `FileManager.validatePath()` | `400 { error: "invalid path" }` | WARN | Do NOT reveal the resolved path in the error |
| YAML parse error | `FileManager.parseAgent()` | `400 { error: "YAML parse error", detail: err.message }` | WARN | |
| write-atomic failure | Any file write | `500 { error: "write failed" }` | ERROR | |
| Job spawn failure | `JobRunner.createJob()` | `500 { error: "job spawn failed" }` | ERROR | |
| Job process exits non-zero | `child.on('close')` handler | SSE: `event: error` with message | WARN | |
| Missing CSRF header | `csrf.js` middleware | `403 { error: "forbidden" }` | WARN | No additional detail — do not hint at the header name in the response body |
| WebSocket sessionId not found | `terminalHandler.js` | WS close code `4004` | INFO | |
| WebSocket auth failure | `terminalHandler.js` | WS close code `4001` | WARN | |
| ConfigStore read error | `ConfigStore.load()` at startup | Server exits with code 1 | FATAL | Config is corrupt or unreadable |
| Config JSON parse error | `ConfigStore.load()` | Server exits with code 1 | FATAL | Instruct user to delete or fix config.json |
| Idle timeout kill failure | `SessionManager` sweeper | Logged, session still removed from Map | ERROR | pty.kill() threw — orphan risk; ProcessRegistry still cleans up |
| ProcessRegistry write failure | `ProcessRegistry.append()` / `remove()` | Non-fatal: session still created | WARN | Risk: stale PID not tracked for orphan cleanup |
| tree-kill failure on cancel | `JobRunner.cancelJob()` | `500 { error: "cancel failed" }` | ERROR | Job marked cancelled anyway; process may be orphaned |

### Client-Side Errors

| Error | Where caught | User sees |
|-------|-------------|-----------|
| WebSocket close code `4004` | `useSession` hook `ws.onclose` | UI error banner: "Session not found. Click to start a new session." |
| WebSocket close code `4001` | `useSession` hook `ws.onclose` | UI error banner: "Connection rejected. Please reload the page." |
| WebSocket close code `1001` | `useSession` hook `ws.onclose` | UI toast: "Session ended by server." |
| WebSocket connection refused | `useSession` hook `ws.onerror` | UI error banner: "Cannot connect to server. Is the server running?" |
| fetch() network error | All `fetch` calls | UI toast: "Network error. Please check your connection." |
| `POST /api/v1/sessions` 503 | `useSession` | UI error banner: "Claude not found. " + server hint message |
| `POST /api/v1/jobs` 503 | `JobPanel` | UI error banner: same as above |
| SSE `error` event | `useJob` hook | JobResult shows: red banner with error message |
| SSE connection lost | `useJob` `EventSource.onerror` | JobPanel shows: "Connection to job stream lost. Result may be available if job completed." |
| Agent/skill save 400 | `AgentEditor`, `SkillEditor` | Inline form validation error below the failing field |
| Agent/skill save 500 | `AgentEditor`, `SkillEditor` | UI toast: "Save failed: " + server error message |
| CLAUDE.md save failure | `ClaudeMdEditor` | UI toast: "Save failed." |
| Project register 404 | `ProjectsView` | Inline: "Path does not exist on the filesystem." |
| Project register 409 | `ProjectsView` | Inline: "This path is already registered." |

### Agent Save Warning (Not an Error)

After any successful `POST /api/v1/agents` or `PUT /api/v1/agents/:id`, the UI must show a **persistent yellow banner** (not a toast): "Restart the Claude session for agent changes to take effect." This banner stays visible until the user dismisses it or navigates away.

---

## 10. Startup Sequence

### Command

```
npm start
```

The root `package.json` `"start"` script:
1. Runs `vite build` in `client/` to produce the production bundle in `client/dist/`
2. Starts `node server/index.js`
3. Opens `http://127.0.0.1:PORT` in the default browser (via the `open` npm package)

For development: `npm run dev` runs Vite dev server (HMR) and `nodemon server/index.js` in parallel.

### Ordered Startup Steps

```
STEP 0 — Module imports and global error handlers
  - Register process.on('uncaughtException') → log + exit(1)
  - Register process.on('unhandledRejection') → log + exit(1)
  - These must be the first two lines of index.js

STEP 1 — Validate node-pty prebuilt binary (DEC-010 BLOCKER)
  try:
    const pty = require('node-pty-prebuilt-multiarch')
    pty.spawn  // verify the module exports are present
  catch err:
    console.error("FATAL: node-pty-prebuilt-multiarch failed to load:", err.message)
    console.error("Solution: run 'npm install' again, or check Node.js version compatibility.")
    process.exit(1)

STEP 2 — Discover Provider Binaries
  claudeBin = discoverClaudeBinary()
  // throws on failure → uncaughtException handler exits with code 1
  geminiBin = discoverGeminiBinary() // Optional, gracefully degrades

STEP 3 — Validate Provider Binaries (version check)
  versionOutput = execFileSync(claudeBin, ["--version"])
  log.info("claude binary:", claudeBin)
  log.info("claude version:", versionOutput.toString().trim())
  if (geminiBin) {
    geminiVersionOutput = execFileSync(geminiBin, ["--version"])
    log.info("gemini binary:", geminiBin)
    log.info("gemini version:", geminiVersionOutput.toString().trim())
  }

STEP 4 — Initialize ConfigStore
  ConfigStore.load()
  // Reads %APPDATA%\ClaudeCodeManager\config.json
  // Creates with defaults if absent: { version:"1", projects:[], settings:{} }
  // Throws and exits on JSON parse error

STEP 5 — Initialize ProcessRegistry (stale PID cleanup)
  stalePids = ProcessRegistry.loadAndClear()
  // Reads active_pids.json (if exists), collects all PIDs, deletes the file
  for pid in stalePids:
    try: tree-kill(pid)
    catch: log.warn("Could not kill stale PID", pid)
  log.info("Stale PID cleanup:", stalePids.length, "PIDs processed")

STEP 6 — Initialize Services
  SessionManager.initialize()  // starts idle sweeper setInterval
  JobRunner.initialize()       // no-op in v1, placeholder for future

STEP 7 — Build Express app
  app = express()
  app.use(helmet({ ... }))     // CSP, X-Frame-Options, X-Content-Type-Options
  app.use(express.json())
  app.use(csrf.middleware)     // reject mutating requests without X-Requested-With
  app.use('/api/v1/projects',  projectsRouter)
  app.use('/api/v1/sessions',  sessionsRouter)
  app.use('/api/v1/jobs',      jobsRouter)
  app.use('/api/v1/agents',    agentsRouter)
  app.use('/api/v1/skills',    skillsRouter)
  app.use('/api/v1/claudemd',  claudemdRouter)
  app.use(express.static(path.join(__dirname, '../client/dist')))
  app.get('*', (req, res) => res.sendFile('index.html', { root: 'client/dist' }))

STEP 8 — Attach WebSocket server
  httpServer = http.createServer(app)
  wss = new WebSocketServer({ server: httpServer, maxPayload: 1024 * 1024 })
  wss.on('connection', terminalHandler)

STEP 9 — Register signal handlers
  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT',  gracefulShutdown)
  process.on('exit',    gracefulShutdown)

STEP 10 — Start listening
  PORT = parseInt(process.env.PORT) || 3000
  httpServer.listen(PORT, '127.0.0.1', () => {
    log.info("Server ready at http://127.0.0.1:" + PORT)
  })

STEP 11 — Open browser (after listen callback fires)
  open("http://127.0.0.1:" + PORT)
  // Uses 'open' npm package — cross-platform, no shell:true
```

### Graceful Shutdown Sequence

```
gracefulShutdown():
  if alreadyShuttingDown: return   // guard against double-call (SIGINT + exit)
  alreadyShuttingDown = true

  log.info("Shutting down...")

  // 1. Kill all active PTY sessions
  for each [sessionId, session] in SessionManager.sessions:
    session.pty.kill()
    log.info("Killed PTY session:", sessionId)

  // 2. Kill all running jobs
  for each [jobId, job] in JobRunner.jobs:
    if job.status === "running":
      tree-kill(job.child.pid)
      log.info("Killed job:", jobId)

  // 3. Clear ProcessRegistry
  ProcessRegistry.clear()   // deletes active_pids.json

  // 4. Close HTTP server (stops accepting new connections)
  httpServer.close()

  log.info("Shutdown complete")
```

### "Ready" Definition

The application is fully ready when `httpServer.listen` callback fires and:
- ConfigStore is loaded (projects available)
- ProcessRegistry is clean (stale PIDs killed)
- SessionManager idle sweeper is running
- Express routes are wired
- WebSocket server is attached
- The browser has been opened

No sessions or jobs are created at startup. Sessions are created on-demand when the user selects a project.

---

## Appendix A: Data Models (Reference)

### SessionRecord

```typescript
interface SessionRecord {
  sessionId: string;          // UUID v4
  projectId: string;          // UUID v4
  pty: IPty;                  // node-pty-prebuilt-multiarch IPty instance
  buffer: RingBuffer;         // 100 KB fixed circular buffer
  clients: Set<WebSocket>;    // currently connected WS clients (0..n)
  pid: number;                // OS process ID of the claude.exe PTY
  status: "active" | "killed";
  createdAt: Date;
  lastActivityAt: Date;       // updated on onData, on input message, on reconnect
}
```

### JobRecord

```typescript
interface JobRecord {
  jobId: string;              // UUID v4
  projectId: string;          // UUID v4
  prompt: string;
  allowedTools: string;       // "all" or comma-separated tool names
  maxTurns: number;
  child: ChildProcess;        // child_process.spawn result
  clients: Set<Response>;     // SSE res objects (Express Response)
  status: "running" | "done" | "cancelled" | "error";
  result: string | null;      // Markdown string when done, null otherwise
  createdAt: Date;
  completedAt: Date | null;
}
```

### Project

```typescript
interface Project {
  id: string;                 // UUID v4
  name: string;
  path: string;               // absolute Windows path
  createdAt: string;          // ISO 8601
}
```

### AppConfig

```typescript
interface AppConfig {
  version: "1";
  projects: Project[];
  settings: {
    port?: number;             // default: 3000
    idleTimeoutMinutes?: number; // default: 30
  };
}
```

---

## Appendix B: File Paths Reference

| What | Path |
|------|------|
| App config | `%APPDATA%\ClaudeCodeManager\config.json` |
| Active PIDs | `%APPDATA%\ClaudeCodeManager\active_pids.json` |
| User agents | `%USERPROFILE%\.claude\agents\<name>.md` |
| User skills | `%USERPROFILE%\.claude\skills\<name>\SKILL.md` |
| Legacy user skills | `%USERPROFILE%\.claude\commands\<name>.md` |
| User CLAUDE.md | `%USERPROFILE%\.claude\CLAUDE.md` |
| Project agents | `<project>\.claude\agents\<name>.md` |
| Project skills | `<project>\.claude\skills\<name>\SKILL.md` |
| Project CLAUDE.md | `<project>\.claude\CLAUDE.md` |
| Claude install (fallback) | `%LOCALAPPDATA%\AnthropicClaude\claude.exe` |

All paths using `%USERPROFILE%` resolve via `os.homedir()` in Node.js.
All paths using `%APPDATA%` resolve via `process.env.APPDATA || path.join(os.homedir(), '.claudecodemanager')`.

---

## Appendix C: Security Requirements Checklist

All 10 items must be verified before v1 release.

| # | Requirement | Implementation location |
|---|------------|------------------------|
| SEC-01 | Bind to 127.0.0.1 only | `server/index.js` — `httpServer.listen(PORT, '127.0.0.1')` |
| SEC-02 | No `shell: true` anywhere | `SessionManager.js`, `JobRunner.js` — all spawns use array argv |
| SEC-03 | Working directory path validation | `server/routes/sessions.js` — validate before spawn |
| SEC-04 | File write path validation | `server/services/FileManager.js` — `validatePath()` on every write |
| SEC-05 | WebSocket message size cap | `ws.Server({ maxPayload: 1024 * 1024 })` in `index.js` |
| SEC-06 | CSRF header on mutating endpoints | `server/middleware/csrf.js` |
| SEC-07 | helmet security headers | `app.use(helmet(...))` in `index.js` |
| SEC-08 | No sensitive data in logs | Code review: no prompt content, no file content in log calls |
| SEC-09 | PTY process lifecycle management (signal handlers + idle timeout) | `index.js` signal handlers + `SessionManager` sweeper |
| SEC-10 | `npm audit --audit-level=high` passes | Pre-release CI step |

---

## 11. V3 Swarm Orchestrator Architecture

_Added: 2026-03-28 (Task #82). Covers all V3 components shipped in v3.0.0._

### 11.1 System Diagram

```
Browser (localhost only)
┌─────────────────────────────────────────────────────────────────────────┐
│  React SPA                                                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  SwarmView.jsx  (view: swarm — 6th sidebar nav item)             │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  PromptToFlowBar.jsx                                    │     │   │
│  │  │  POST /api/v1/swarm/scaffold → workflowDef              │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  SwarmCanvas.jsx  (@xyflow/react ReactFlow)             │     │   │
│  │  │                                                         │     │   │
│  │  │  BreadcrumbBar.jsx  (dept drill-down nav)               │     │   │
│  │  │  AgentNode.jsx  (type: "agent")                         │     │   │
│  │  │  DepartmentNode.jsx (type: "department")                │     │   │
│  │  │  TriggerNode.jsx   (type: "trigger")                    │     │   │
│  │  │  HandoffEdge.jsx   (type: "handoff", animated)          │     │   │
│  │  │  AgentInspector.jsx (right-side panel)                  │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  BroadcastBar.jsx (text → all running agents)           │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │  SwarmContext.jsx  (Zustand v4 — useSwarmStore)         │     │   │
│  │  │  Slices: activeExecutionId · executionStatus            │     │   │
│  │  │          agentStates · edgeCounters · budget            │     │   │
│  │  │          inboxItems · interAgentFeed                    │     │   │
│  │  │          focusedDepartmentId · departmentStack          │     │   │
│  │  │          selectedNodeId · wsConnected                   │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  WS  ws://127.0.0.1:PORT/ws/swarm?executionId=<uuid>                    │
│  REST fetch() /api/v1/swarm/* /api/v1/workflows/*                       │
└─────────────────────────────────────────────────────────────────────────┘
                        │ loopback only 127.0.0.1:PORT
                        ▼
Node.js Server Process
┌─────────────────────────────────────────────────────────────────────────┐
│  server/index.js                                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Express Router — V3 routes                                     │    │
│  │  /api/v1/workflows  → workflows.js (CRUD)                       │    │
│  │  /api/v1/swarm      → swarm.js    (scaffold + execution ctrl)   │    │
│  │  /api/v1/swarm      → inbox.js    (HITL approve/reject)         │    │
│  │  /api/v1/triggers   → triggers.js (webhook receiver + list)     │    │
│  └──────────────┬──────────────────────────────────────────────────┘    │
│                 │                                                        │
│  ┌──────────────▼──────────────────────────────────────────────────┐    │
│  │  wssSwarm  (ws.Server — /ws/swarm path)                        │    │
│  │  → swarmHandler.js: handleSwarmConnection, broadcast()          │    │
│  └──────────────┬──────────────────────────────────────────────────┘    │
│                 │                                                        │
│  ┌──────────────▼──────────────────────────────────────────────────┐    │
│  │  V3 Services Layer                                              │    │
│  │                                                                 │    │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐   │    │
│  │  │ SwarmEngine  │  │ WorkflowStore │  │  TriggerManager    │   │    │
│  │  │              │  │               │  │                    │   │    │
│  │  │ startExecution│  │ CRUD on disk  │  │ Webhook dispatch   │   │    │
│  │  │ stopExecution │  │ write-atomic  │  │ RSS polling        │   │    │
│  │  │ pauseExecution│  │ %APPDATA%\   │  │ SSRF guard (isSafe │   │    │
│  │  │ resumeExectn │  │ workflows\   │  │  Url)              │   │    │
│  │  │ getStatus    │  │ <id>.json    │  └────────────────────┘   │    │
│  │  │ _onHandoff   │  └───────────────┘                          │    │
│  │  │ _onDone      │                                             │    │
│  │  │ _spawnAgentPty│  ┌───────────────┐  ┌────────────────────┐   │    │
│  │  │ _spawnAgent  │  │ HandoffParser │  │  CircuitBreaker    │   │    │
│  │  │  StreamJson  │  │               │  │                    │   │    │
│  │  │ _persistHist │  │ Stateful accum│  │ Per-edge counter   │   │    │
│  │  │ _buildSysPromt│  │ HANDOFF/DONE  │  │ Advisory (no stop) │   │    │
│  │  │ _startHrtbeat │  │ token extract  │  └────────────────────┘   │    │
│  │  └──────┬───────┘  └───────────────┘                            │    │
│  │         │                                                        │    │
│  │         │          ┌─────────────────┐  ┌────────────────────┐   │    │
│  │         │          │StreamJsonParser │  │  BudgetTracker     │   │    │
│  │         │          │                 │  │                    │   │    │
│  │         │          │ NDJSON line →   │  │ Char-count estimate│   │    │
│  │         │          │ typed event     │  │ Advisory (no stop) │   │    │
│  │         │          │ (DEC-027/029)   │  └────────────────────┘   │    │
│  │         │          └─────────────────┘                           │    │
│  │         ▼                                                         │    │
│  │  SessionManager (shared with V1 PTY terminal)                    │    │
│  │  swarmListeners Set on session record (DEC-014)                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Per-agent Claude processes                                             │
│  PTY path (Codex/Gemini):            stream-json path (Claude, DEC-027):│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ claude.exe   │  │ codex/gemini │  │ claude.exe   │  ...             │
│  │ (agent A)    │  │ (agent B)    │  │ (agent C)    │                  │
│  │ node-pty/    │  │ node-pty/    │  │ child_process│                  │
│  │ ConPTY       │  │ ConPTY       │  │ .spawn       │                  │
│  │ → HandoffParser  → HandoffParser  │ → StreamJson- │                  │
│  │                                   │   Parser      │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 WebSocket Swarm Channel Events

All events are JSON objects sent over `ws://127.0.0.1:PORT/ws/swarm?executionId=<uuid>`.

#### Server → Client Events

| Event `type` | Payload fields | Description |
|---|---|---|
| `execution_status` | `executionId`, `status` ('running'\|'stopped'\|'done'), `agentStates` | Full execution state snapshot. Sent on connect and on status change. |
| `agent_status` | `executionId`, `nodeId`, `status`, `sessionId` | Single agent's status changed (idle / running / paused / done / error). `sessionId` is required for AgentInspector "Open Terminal" activation. Fixed Task #124 (BUG-SESSION-1). |
| `handoff_started` | `executionId`, `sourceNodeId`, `targetNodeId`, `edgeId`, `counter` | A HANDOFF token was parsed; target agent is being spawned or reused (PTY for Codex/Gemini, stream-json for Claude). |
| `handoff_completed` | `executionId`, `sourceNodeId`, `targetNodeId` | Target agent has been spawned/reused and is running. Emitted at end of `_onHandoff()` per FR-V3-43. Added Task #126 (BUG-HANDOFF-1). |
| `circuit_breaker` | `executionId`, `edgeId`, `counter` | Edge crossing threshold reached (advisory — execution continues). |
| `budget_update` | `executionId`, `estimatedTokensUsed`, `limitTokens` | Token budget estimate updated for the execution. |
| `hitl_required` | `executionId`, `nodeId`, `itemId`, `question` | Agent requested human approval; item added to inbox. |
| `hitl_resolved` | `executionId`, `itemId`, `nodeId`, `decision` ('approved'\|'rejected') | HITL item resolved via approve/reject endpoint. |
| `trigger_fired` | `executionId`, `triggerId` (or `nodeId`), `firedAt` | A trigger condition was met. Client updates `triggerStates[triggerId]` (fired, fireCount). Added Task #128 (BUG-TRIGGER-1). |
| `trigger_status` | `executionId`, `triggerId` (or `nodeId`), `status` | Trigger polling or webhook listener status changed. Added Task #128 (BUG-TRIGGER-1). |
| `rss_item` | `executionId`, `nodeId`, `guid?`, `url`, `title`, `link`, `pubDate` | RSS poller found a new item. Client updates `triggerStates[nodeId]` and feed. Added Task #128 (BUG-TRIGGER-1). |

#### Client → Server Messages

No client-to-server messages on the swarm channel. The swarm WS channel is server-push only. Control commands (start, stop, broadcast, approve, reject) use the REST API.

### 11.3 WorkflowDefinition Schema

```json
{
  "id": "uuid-v4",
  "name": "string (max 100 chars — /^[\\w\\s\\-.]+$/)",
  "description": "string (max 500 chars)",
  "projectId": "string (optional — links workflow to a registered project)",
  "settings": {
    "circuitBreakerThreshold": 10
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "agent",
      "data": {
        "label": "Triage Agent",
        "systemPrompt": "You are the triage agent...",
        "isTriageNode": true
      },
      "position": { "x": 0, "y": 0 }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "type": "handoff"
    }
  ],
  "createdAt": "2026-03-28T00:00:00.000Z",
  "updatedAt": "2026-03-28T00:00:00.000Z"
}
```

**Node types:** `"agent"` (executes Claude Code), `"department"` (group container — no PTY), `"trigger"` (webhook or RSS source — no PTY), `"conditional"` (V5 — diamond router, no PTY), `"merge"` (V5 — hexagonal join, no PTY), `"delay"` (V5 — timer, no PTY), `"loop"` (V5 — iteration tracker, no PTY), `"errorHandler"` (V5 — error watcher, no PTY), `"subWorkflow"` (V5 — nested workflow reference, no PTY).

**Edge types:** `"handoff"` (only type currently defined). Handoff edges are directional: `source` → `target`.

**Workflow persistence:** One JSON file per workflow at `%APPDATA%\ClaudeCodeManager\workflows\<id>.json` (DEC-013).

### 11.4 Handoff Protocol

Each Claude agent is injected with a SWARM PROTOCOL block in its system prompt by `SwarmEngine._buildSystemPrompt()`. The block instructs the agent to:
- Output `HANDOFF:<targetNodeId>:<base64-encoded JSON context update>` when delegating work.
- Output `__DONE__` (or bare `DONE` on its own line) when the task is complete.

`HandoffParser` maintains a per-session rolling string accumulator. When `pty.onData` fires, the chunk is appended and scanned for these tokens. Because ConPTY delivers output in arbitrary byte chunks, a token can be split across chunks — the accumulator retains the unmatched tail for the next chunk (DEC-012).

### 11.5 HITL (Human-in-the-Loop) Flow

```
Agent PTY outputs "HITL:<question>" token
        ↓
HandoffParser emits hitl event
        ↓
SwarmEngine receives event
  → creates inboxItem { id, nodeId, question, createdAt }
  → appends to execution.inboxItems
  → sets agent status = 'paused'
  → broadcasts hitl_required WS event
        ↓
Browser HITL drawer opens (toggle button in SwarmView toolbar)
  → drawer has a labeled header ("HITL Approvals") and an explicit close (✕) button
  → pending item shows agent name, type badge, timestamp, and message
        ↓
User clicks Approve (optional resumeText) or Reject
  → If no active executionId: error is surfaced inline on the card (never a silent no-op)
  → POST /api/v1/swarm/:executionId/inbox/:itemId/approve|reject
        ↓
inbox.js handler:
  → removes item from inboxItems
  → (approve) writes resumeText to agent PTY, sets status = 'running'
  → broadcasts hitl_resolved WS event
```

### 11.6 Key V3 Decisions

| Decision | Summary |
|----------|---------|
| DEC-011 | Execution state (Zustand) and canvas state (@xyflow/react) are strictly separated — never merged. Merging causes cascade re-renders during live execution. |
| DEC-012 | HandoffParser uses a stateful rolling byte accumulator. ConPTY chunks tokens arbitrarily; line-by-line parsing silently drops split tokens. |
| DEC-013 | WorkflowStore writes one JSON file per workflow to `%APPDATA%\ClaudeCodeManager\workflows\`. Follows ConfigStore pattern exactly. |
| DEC-014 | SwarmEngine attaches a secondary `swarmListeners` Set to each session record. Primary `pty.onData` handler (DEC-009) is never replaced. |
| DEC-015 | Circuit breaker is per-edge (not per-node) to avoid false positives on legitimate hub nodes. |
| DEC-016 | Prompt-to-Flow spawns the `claude` binary with `-p <prompt> --output-format json --max-turns 1 --no-session-persistence --tools none` — same pattern as JobRunner. No Anthropic SDK or API key required. `swarmRoutes` accepts `claudeBin` as its third parameter (passed from server/index.js). The scaffold endpoint validates the JSON output and saves via WorkflowStore. (Updated 2026-03-31: was Anthropic SDK + claude-haiku-4-5-20251001.; updated 2026-04-08 to use the modern tools flag.) |

### 11.7 V3 Security Requirements

| # | Requirement | Implementation |
|---|------------|---------------|
| SEC-V3-01 | Webhook body size cap: 32 KB | `express.json({ limit: '32kb' })` in triggers.js |
| SEC-V3-02 | Workflow schema validation before save | WorkflowStore.create() / update() validation layer |
| SEC-V3-03 | SSRF prevention on RSS URLs | `server/utils/ssrfGuard.js` — blocks private IPs, loopback, link-local |
| SEC-V3-04 | Webhook rate limit: 10 req/min per IP | `webhookRateLimit()` middleware in triggers.js |
| SEC-V3-05 | HITL resume text cap: 8 KB | `validateResumeText` middleware in inbox.js |
| SEC-V3-06 | HandoffParser oversized payload rejection | HandoffParser rejects base64 payloads > 64 KB |
| SEC-V3-07 | Webhook always returns 200 to external caller | Prevents information leakage about workflow structure |

### 11.8 V3 Service Dependency Graph

```
server/index.js
  ├── WorkflowStore         (no deps — initializes after ConfigStore)
  ├── CircuitBreaker        (no deps — pure service, stateless per call)
  ├── BudgetTracker         (no deps — in-memory per execution)
  ├── TriggerManager        (depends on: WorkflowStore, ssrfGuard, SwarmEngine)
  ├── ExecutionHistoryStore  (no deps — file-persisted per workflow, injected into SwarmEngine)
  ├── SwarmEngine           (depends on: SessionManager, WorkflowStore, CircuitBreaker, BudgetTracker, ExecutionHistoryStore [setter-injected])
  │     ├── HandoffParser   (instantiated per agent session inside SwarmEngine)
  │     └── _persistExecutionHistory  (called on terminal states: completed/stopped/failed)
  ├── swarmHandler.js       (depends on: SwarmEngine — broadcast() wired via setWsBroadcast)
  └── Express V3 routes
        ├── workflows.js    → WorkflowStore
        ├── swarm.js        → SwarmEngine, WorkflowStore
        ├── inbox.js        → SwarmEngine
        └── triggers.js     → TriggerManager

```

### 11.9 V3 React Component Tree (Swarm view additions)

```
App.jsx
  └── SwarmView.jsx                     [view: swarm — 6th nav item]
        ├── PromptToFlowBar.jsx         (prompt → scaffold → workflowDef)
        ├── ReactFlowProvider           (@xyflow/react required wrapper)
        │     └── SwarmCanvas.jsx       (main React Flow canvas)
        │           ├── BreadcrumbBar.jsx
        │           ├── AgentNode.jsx   (nodeType: "agent")
        │           ├── DepartmentNode.jsx (nodeType: "department")
        │           ├── TriggerNode.jsx (nodeType: "trigger")
        │           ├── HandoffEdge.jsx (edgeType: "handoff")
        │           ├── AgentInspector.jsx (right panel, w-64 fixed)
        │           └── InterAgentFeed.jsx (right sidebar, w-56 shrink-0;
        │                                   fixed width prevents canvas collapse)
        ├── HitlInbox.jsx               (approval drawer; rendered inline in
        │                                SwarmView when inboxOpen=true; header
        │                                + close button added in QA pass #104–111)
        ├── BroadcastBar.jsx            (self-hides when not running)
        └── PtyExplosion.jsx            (full-screen PTY overlay; Escape key closes)

Toolbar controls (SwarmView):
  Run     — visible only when: status=idle AND workflowDef loaded AND activeProjectId set
            (gated by activeProjectId — shows runError banner if project not selected)
  Pause   — visible when status=running
  Resume  — visible when status=paused
  Stop    — visible when status=running OR paused (was missing for paused state prior to QA pass)
  Reset   — visible when status=stopped
  HITL    — always visible; badge shows pending approval count; stopPropagation prevents
            inadvertent canvas click-through

Hooks (V3):
  useSwarm.js         — WS lifecycle + start/stop execution REST calls.
                        agentStates is accessed via useSwarmStore.getState() inside
                        the WS onmessage handler (not as a top-level selector) to
                        prevent excessive reconnects on every agent state change.
  useHandoff.js       — edgeCounter delta detection; useRecentHandoffs set
  useWorkflow.js      — useWorkflow(id) + useWorkflowList() REST wrappers

Store (V3):
  client/src/store/SwarmContext.jsx  — useSwarmStore (Zustand v4)
```

---

## 12. V5 N8N-Style Visual Workflow Editor Architecture

_Added: 2026-04-06. Covers all V5 components shipped across Waves 1-5 (81 FRs, Tasks #259-#300+)._

### 12.1 V5 System Diagram (Canvas Layer)

```
SwarmView.jsx (view: swarm)
│
├── PromptToFlowBar.jsx          (V3 — prompt → scaffold)
├── WorkflowSettingsModal.jsx    (V5-W1 — name, description, initial context editor)
├── ReactFlowProvider
│     └── SwarmCanvas.jsx        (V3 base + V5 enhancements)
│           │
│           ├── NodePalette.jsx  (V5-W2 — draggable sidebar with 10 node types)
│           ├── ContextMenu.jsx  (V5-W1 — right-click canvas/node/edge menu)
│           │
│           ├── Node Types (registered in nodeTypes constant):
│           │     ├── AgentNode.jsx       (V3 — "agent", spawns PTY)
│           │     ├── DepartmentNode.jsx  (V3 — "department", group container)
│           │     ├── TriggerNode.jsx     (V3 — "trigger", webhook/RSS)
│           │     ├── ConditionalNode.jsx (V5-W5 — "conditional", diamond router)
│           │     ├── MergeNode.jsx       (V5-W5 — "merge", hexagonal join)
│           │     ├── DelayNode.jsx       (V5-W5 — "delay", timer)
│           │     ├── LoopNode.jsx        (V5-W5 — "loop", iteration tracker)
│           │     ├── ErrorHandlerNode.jsx(V5-W5 — "errorHandler", error watcher)
│           │     └── SubWorkflowNode.jsx (V5-W5 — "subWorkflow", nested ref)
│           │
│           ├── Edge Types:
│           │     └── HandoffEdge.jsx     (V3 — "handoff", animated)
│           │
│           ├── AgentInspector.jsx  (V3 base + V5-W5 flow-control field components)
│           │     ├── ConditionalFields  (rules editor with per-rule target selection)
│           │     ├── MergeFields        (wait mode: all / any / N radio selector)
│           │     ├── DelayFields        (seconds slider 1-3600)
│           │     ├── LoopFields         (max iterations + exit condition)
│           │     ├── ErrorHandlerFields (watched nodes checkbox list)
│           │     └── SubWorkflowFields  (workflow ID selector)
│           │
│           └── InterAgentFeed.jsx (V3 — event log sidebar)
│
├── ExecutionHistory.jsx    (V5-W4 — past execution browser)
├── TemplateGallery.jsx     (V5-W4 — 5 built-in workflow templates)
├── VersionHistory.jsx      (V5-W4 — workflow version browser + restore)
├── HitlInbox.jsx           (V3 — approval drawer)
├── BroadcastBar.jsx        (V3 — broadcast to all agents)
└── PtyExplosion.jsx        (V3 — full-screen PTY overlay)

Hooks (V5 additions):
  useCanvasHistory.js    (V5-W1 — undo/redo for canvas operations)
  useCanvasValidation.js (V5-W3 — 5 validation rules, error/warning severity)

Utils (V5 additions):
  sanitizeWorkflow.js    (V5-W1 — strips transient state before persist)
  nodeIdGenerator.js     (V5-W1 — generateNodeId() with type prefix)

Stores (V5 additions, server):
  ExecutionHistoryStore.js (V5-W4 — %APPDATA%\ClaudeCodeManager\execution-history\)
  TemplateStore.js         (V5-W4 — in-memory, 5 hardcoded templates)
  WorkflowStore.js         (V3 base + V5-W4 version history: saves snapshot before overwrite)
```

### 12.2 V5 Node Types — Flow Control

All six flow-control node types are registered in `SwarmCanvas.jsx` via the `nodeTypes` constant. They are pure routing/control nodes that never spawn a PTY. `SwarmEngine.js` identifies them via the `FLOW_CONTROL_NODE_TYPES` Set and dispatches to `_activateFlowControlNode()` instead of `_spawnAgentPty()`.

| Node Type | Component | Shape | Color | Handles | Engine Handler |
|-----------|-----------|-------|-------|---------|----------------|
| `conditional` | ConditionalNode.jsx | Diamond (45deg rotated square) | Amber | 1 target (top), N source (bottom, one per rule + default) | `_handleConditionalNode` — evaluates rules against workflow context, routes to first match or default |
| `merge` | MergeNode.jsx | Hexagon (CSS clip-path) | Cyan | 3 target (left), 1 source (right) | `_handleMergeNode` — tracks incoming edges, forwards when convergence threshold met (all/any/N) |
| `delay` | DelayNode.jsx | Rounded rectangle | Orange | 1 target (top), 1 source (bottom) | `_handleDelayNode` — setTimeout for `data.delaySeconds`, forwards on completion |
| `loop` | LoopNode.jsx | Rounded rectangle | Violet | 1 target (top), 2 source (bottom=loop, right=exit) | `_handleLoopNode` — tracks iteration count, routes to loop or exit edges based on max/condition |
| `errorHandler` | ErrorHandlerNode.jsx | Rounded rectangle | Red | 0 target, 1 source (bottom) | `_handleErrorHandlerNode` — registers watchers on specified nodes, triggers on error |
| `subWorkflow` | SubWorkflowNode.jsx | Double-bordered rectangle | Gray | 1 target (top), 1 source (bottom) | `_handleSubWorkflowNode` — loads referenced workflow, creates child execution |

### 12.3 V5 Engine State Maps

SwarmEngine tracks flow-control state via five Maps, all keyed by `${executionId}:${nodeId}`:

| Map | Purpose | Lifecycle |
|-----|---------|-----------|
| `_mergeStates` | `{ received: Set<sourceNodeId>, required: number }` — convergence tracker | Created on first activation, deleted after merge completes (allows re-trigger in loops) |
| `_loopStates` | `{ iteration: number, maxIterations: number }` — loop counter | Created on first activation, deleted when loop exits |
| `_delayTimers` | `setTimeout` handle — active delay timer | Created on activation, deleted on completion or execution stop. `handle.unref()` called so timers do not prevent Node.js exit. |
| `_errorWatchers` | `Map<watchedNodeId, Set<errorHandlerNodeId>>` keyed by executionId only | Created when errorHandler activates, persists for execution lifetime |
| `_subWorkflowExecutions` | Child `executionId` string | Created on sub-workflow launch, deleted on child completion |

### 12.4 V5 NodePalette

`NodePalette.jsx` provides a draggable sidebar with 10 node type cards (4 from V3 + 6 from V5 Wave 5). Each card is draggable via HTML5 drag-and-drop (`onDragStart` sets `application/reactflow` data). `SwarmCanvas.jsx` handles `onDrop` to create a new node at the drop position.

V5 Wave 5 palette entries:
| Type | Icon | Label | Description |
|------|------|-------|-------------|
| `conditional` | Diamond | Conditional | Route flow based on conditions |
| `merge` | Hexagon | Merge | Wait for multiple inputs |
| `delay` | Stopwatch | Delay | Pause flow for a set time |
| `loop` | Arrows | Loop | Repeat a sub-flow N times |
| `errorHandler` | Lightning | Error Handler | Catch errors from other nodes |
| `subWorkflow` | Package | Sub-Workflow | Nest another workflow |

### 12.5 V5 AgentInspector Field Components

`AgentInspector.jsx` renders type-specific configuration panels when a flow-control node is selected. Each field component receives `(node, onUpdateNode)` props and uses `useDebouncedField` for text inputs.

| Component | Node Type | Fields Exposed |
|-----------|-----------|----------------|
| `ConditionalFields` | `conditional` | Rules array (field, operator, value, targetNodeId per rule), default target |
| `MergeFields` | `merge` | Wait mode radio: all / any / custom count |
| `DelayFields` | `delay` | Delay seconds (number input, range 1-3600) |
| `LoopFields` | `loop` | Max iterations (number), exit condition (text) |
| `ErrorHandlerFields` | `errorHandler` | Watched nodes (checkbox list of all non-errorHandler nodes) |
| `SubWorkflowFields` | `subWorkflow` | Workflow ID (text input for referenced workflow) |

### 12.6 V5 Wave Summary

| Wave | Scope | Key Deliverables |
|------|-------|-----------------|
| Wave 1 | Canvas Foundation | Save/load, dirty tracking, inline name editing, context menu, delete with cascade, sanitizeWorkflow.js, nodeIdGenerator.js, WorkflowSettingsModal.jsx |
| Wave 2 | Node Palette + Settings | NodePalette.jsx (4 V3 types), onDrop handler in SwarmCanvas, WorkflowSettingsModal integration |
| Wave 3 | Validation + Shortcuts | useCanvasValidation.js (5 rules), snap-to-grid (20px), Ctrl+S/Ctrl+Enter shortcuts, export/import JSON, duplicate workflow |
| Wave 4 | Execution Visibility | ExecutionHistoryStore.js, TemplateStore.js, ExecutionHistory.jsx, TemplateGallery.jsx, VersionHistory.jsx, 6 new API endpoints |
| Wave 5 | Advanced Flow Control | 6 new node types (conditional, merge, delay, loop, errorHandler, subWorkflow), 6 new NodePalette cards, 6 new AgentInspector field components, SwarmEngine flow-control dispatch + 5 state maps |

### 12.7 V5 Security Requirements

| # | Requirement | Implementation |
|---|------------|---------------|
| SEC-V5-01 | Workflow version count cap: 50 per workflow | WorkflowStore trims oldest versions on save |
| SEC-V5-02 | Execution history cap: 100 entries per workflow | ExecutionHistoryStore trims oldest entries |
| SEC-V5-03 | Template content is read-only | TemplateStore serves hardcoded templates, no write API |
| SEC-V5-04 | Sub-workflow recursion guard | SwarmEngine checks nesting depth before launching child execution |
| SEC-V5-05 | Delay timer ceiling: 3600 seconds | DelayFields enforces max=3600; engine enforces on activation |

---

## 13. V9.0 Stream-JSON Agent Migration Architecture

**Status:** IN PROGRESS (Task #357 StreamJsonParser COMPLETED; remaining tasks #358-#393 pending)
**Decisions:** DEC-027, DEC-028, DEC-029

### 13.1 Overview

V9.0 migrates Claude provider agents from PTY-based spawning (node-pty/ConPTY) to structured `child_process.spawn` with `--output-format stream-json`. Codex SDK agents use the `@openai/codex-sdk` structured runtime. Gemini agents continue using PTY. Both Claude stream-json and Codex SDK runtimes emit canonical `chat_message` events with `isCanonical: true` at turn completion, which the client uses to replace all prior text_delta fragments with the authoritative assembled text. ChatExtractor is NOT used for Codex SDK agents (structured agents broadcast chat_message directly via WS). This eliminates ConPTY artifact handling (120+ noise regexes, echo gates, ANSI stripping, HandoffParser accumulator) for Claude agents and provides structured cost/usage data.

### 13.2 StreamJsonParser (Task #357)

**File:** `server/services/StreamJsonParser.js`
**Test:** `server/tests/StreamJsonParser.test.js`

Stateless NDJSON line parser that transforms raw Claude CLI `--output-format stream-json` lines into typed application events.

**Interface:**
```javascript
const parser = new StreamJsonParser();
const event = parser.parseLine(rawLine);
// event: { type: string, ...fields }
parser.reset(); // call between turns if reusing instance
```

**Event type mapping (CLI stream-json to application events):**

| CLI event | Application event type | Key fields |
|-----------|----------------------|------------|
| `stream_event` > `content_block_start` (text) | `text_start` | -- |
| `stream_event` > `content_block_start` (tool_use/server_tool_use) | `tool_start` | `toolName`, `toolUseId` |
| `stream_event` > `content_block_start` (thinking) | `thinking_start` | -- |
| `stream_event` > `content_block_delta` (text_delta) | `text_delta` | `text` |
| `stream_event` > `content_block_delta` (input_json_delta) | `tool_delta` | `partialJson` |
| `stream_event` > `content_block_delta` (thinking_delta) | `thinking` | `text` |
| `stream_event` > `content_block_stop` | `text_stop` / `tool_stop` / `thinking_stop` | Dispatched by tracked active block type |
| `stream_event` > `message_start` | `message_start` | -- |
| `stream_event` > `message_delta` | `message_delta` | `stopReason`, `usage.output` |
| `stream_event` > `message_stop` | `message_stop` | -- |
| `system` (subtype: api_retry) | `api_retry` | `attempt`, `delay`, `errorCode` |
| `system` (other) | `system` | `subtype` |
| `result` (DEC-029) | `result` | `sessionId`, `costUsd`, `durationMs`, `usage`, `isError`, `errorMessage` |
| `assistant` | `message` | `content` (array) |
| (unknown) | `unknown` | `rawType` |
| (empty/whitespace) | `ignore` | -- |
| (malformed/oversized) | `error` | `message` |

**Internal state:** Tracks `_activeBlockType` (`text` / `tool_use` / `thinking` / `null`) and `_activeToolUseId` to dispatch correct stop event types when `content_block_stop` arrives.

**Security:** 1 MB per-line cap (SEC-SJ-03). Never throws -- all errors return error-type events.

### 13.3 `_spawnAgent()` — Provider Router (Task #359)

**File:** `server/services/SwarmEngine.js`

Routes agent spawn calls to the correct spawner based on runtime provider. All call sites that previously called `_spawnAgentPty()` directly now go through `_spawnAgent()`, which resolves the effective provider and dispatches. As of the `_ensureAgentPty` handoff-routing fix, ALL spawn paths (startExecution, handoff via `_ensureAgentPty`, done-reinject, resume, and child-execution) pass `execution.providerStrategy.mode` as `requestedProvider`, ensuring handoff targets are routed to the correct spawner (stream-json for Claude, PTY for Codex/Gemini) rather than always defaulting to PTY:

- Claude provider (including `auto` default) → `_spawnAgentStreamJson()`
- All other providers (Codex, Gemini, etc.) → `_spawnAgentPty()`

```
_spawnAgent(executionId, nodeId, spawnOptions)
  │
  ├── isClaudeProvider? ──→ _spawnAgentStreamJson()
  │
  └── otherwise ──────────→ _spawnAgentPty()
```

Provider resolution: `spawnOptions.requestedProvider` → `spawnOptions.provider` → `execution.activeProvider` → normalize → if `auto` then `claude`.

### 13.4 `_spawnAgentStreamJson()` — Stream-JSON Spawner (Task #359)

**File:** `server/services/SwarmEngine.js`

Spawns a Claude agent using `child_process.spawn` with `--output-format stream-json`. One process per turn. Conversation continuity via `--session-id` (turn 0) / `--resume` (turn N+).

**Lifecycle (13 steps):**

1. Look up execution and node; compute handoff targets from outgoing edges
2. Resolve Claude binary path and model (workflow settings override or `DEFAULT_SWARM_CLAUDE_MODEL`)
3. Get or create stream-json session ID (`uuidv4()` on first turn); retrieve existing turn count
4. Build prompt via `_buildSystemPrompt()` or use `spawnOptions.reinjectPrompt` (done-reinject path)
5. Build args: `--output-format stream-json`, `--verbose`, `--dangerously-skip-permissions`, session/resume flag, `-p <prompt>`, `--model`, optional `--tools` (SEC-SJ-01: uses `--tools` not `--allowedTools`)
6. `spawn(claudeBin, args, { shell: false })` (SEC-02) + `child.stdin.end()` (DEC-005)
7. Initialize/update agent state object with `spawnMode: 'stream-json'`, cost accumulators, turn count, child ref
8. Broadcast `agent_status` WS event with `spawnMode: 'stream-json'`
9. Attach `readline` on `child.stdout`, pipe each line through `StreamJsonParser.parseLine()`
10. Dispatch parsed events: `text_delta` → accumulate + broadcast `chat_message`; `tool_start/delta/stop` → broadcast tool events; `thinking_start/stop` → broadcast thinking state; `api_retry` → broadcast retry status; `result` → call `_handleStreamJsonResult()`
11. Collect stderr (capped, never full-logged — SEC-08)
12. Handle `child.on('close')`: if no result event arrived, mark agent as error with `unexpected_exit` blocker
13. Post-result 30s safety timeout managed inside `_handleStreamJsonResult()`

**WS events emitted during a turn:**

| Event type | When |
|------------|------|
| `agent_status` | On spawn (step 8), on retry, on error |
| `chat_message` | Each `text_delta` — role `assistant`, incremental text. On `result` event, a corrective `chat_message` with `isCanonical: true` replaces all streamed fragments with the authoritative text (fixes token-boundary spacing). |
| `agent_tool_use` | `tool_start` — includes `toolName`, `toolUseId` |
| `agent_tool_delta` | `tool_delta` — partial JSON for tool input |
| `agent_thinking` | `thinking_start` (active=true), `thinking_stop`/`text_start` (active=false) |

**Agent state shape (stream-json specific fields):**

| Field | Type | Purpose |
|-------|------|---------|
| `streamJsonSessionId` | string | Claude session ID for `--resume` continuity |
| `spawnMode` | `'stream-json'` | Distinguishes from PTY agents |
| `sessionId` | `null` | No PTY session (DEC-028) |
| `turnCount` | number | Incremented each result event |
| `totalCostUsd` | number | Accumulated cost across turns |
| `totalInputTokens` | number | Accumulated input tokens |
| `totalOutputTokens` | number | Accumulated output tokens |
| `_streamJsonChild` | ChildProcess\|null | Active child process ref (cleaned on close) |
| `_streamJsonAccumulatedText` | string | Rolling text for handoff/done token scanning |
| `doNotSpawnNextTurn` | boolean | Graceful stop flag (FR-SJ-16) |

### 13.5 `_handleStreamJsonResult()` — Turn Result Handler (Task #359)

**File:** `server/services/SwarmEngine.js`

Processes the `result` event emitted at the end of each Claude CLI turn. Responsible for cost extraction, canonical text replacement, handoff/done token scanning, and turn lifecycle management.

**Steps:**

1. Increment `state.turnCount`
2. Extract cost/usage from result event (`inputTokens`, `outputTokens`, `costUsd`, `durationMs`); accumulate into agent state totals; broadcast `agent_cost` WS event
3. Store `resultEvt.sessionId` into `state.streamJsonSessionId` for future `--resume` calls
4. If `resultEvt.isError`, set `state.needsRepair = true`
4b. If `resultEvt.resultText` is present, replace `_streamJsonAccumulatedText` with the canonical result text. Broadcast a corrective `chat_message` WS event with `isCanonical: true` so the client replaces all streamed `text_delta` fragments with the correctly assembled text (fixes token-boundary spacing where tokenizer splits produce artifacts like "con su ma t or e" instead of "consumatore"). Also replace all prior assistant chat entries for this nodeId in `execution.chatMessages` with a single canonical message (capped at 500 entries) so that REST hydration via `GET /status` does not re-inject stale text_delta fragments.
5. Scan `_streamJsonAccumulatedText` using `HandoffParser.feed()` for `__HANDOFF__` / `__DONE__` tokens — reuses the same token patterns as the PTY path
6. Route: if handoff found → `_onHandoff()`; if done found or no token → `_onDone()` (implicit done per DEC-029)
7. If `doNotSpawnNextTurn` is set, mark agent done immediately (graceful stop)
8. Schedule 30s post-result timeout: `tree-kill` the child if it hasn't exited (constant `STREAM_JSON_POST_RESULT_TIMEOUT_MS`)
9. Reset `_streamJsonAccumulatedText` for the next turn

**`agent_cost` WS event fields:**

```json
{
  "type": "agent_cost",
  "nodeId": "<nodeId>",
  "inputTokens": 1234,
  "outputTokens": 567,
  "costUsd": 0.0042,
  "durationMs": 8500,
  "totalInputTokens": 5678,
  "totalOutputTokens": 2345,
  "totalCostUsd": 0.0180
}
```

### 13.6 Modifications to `_onDone()` and `stopExecution()` (Task #359)

**`_onDone()` — stream-json reinject path:**

When a stream-json agent emits `__DONE__` but has downstream handoff targets, `_onDone()` now handles the reinject loop for stream-json agents differently from PTY agents:
- PTY agents: writes reinject prompt to existing PTY stdin
- Stream-json agents: spawns a new `_spawnAgentStreamJson()` call with `{ reinjectPrompt }`, which uses `--resume` to continue the same session

The `doneReinjectCount` guard and forced-handoff fallback (`MAX_DONE_REINJECT_ATTEMPTS`) apply identically to both paths.

**`stopExecution()` — stream-json cleanup:**

Added a cleanup block that iterates `execution.agentStates` and, for any agent with `spawnMode === 'stream-json'` and a live `_streamJsonChild`, calls `treeKill(child.pid, 'SIGTERM')` to terminate the process. The child ref is nulled before kill to prevent double-kill.

### 13.7 Remaining V9.0 Components (pending)

| Component | Task | Status |
|-----------|------|--------|
| Stream-json event dispatcher | #361 | PENDING |
| Agent lifecycle (stop/reset) | #363 | PENDING |
| Tool config (`--tools` flag) | #365 | COMPLETED |
| Zustand store (spawnMode, cost) | #368 | PENDING |
| `useSwarm` WS hook updates | #370 | PENDING |
| UI components (chat, cost, tool) | #372-#382 | PENDING |
| `agent_status.spawnMode` field | #380 | PENDING |
| Cleanup + E2E + docs | #384-#393 | PENDING |
