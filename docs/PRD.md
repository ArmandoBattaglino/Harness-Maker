# PRD: Claude Code Visual Manager
**Version:** 1.0
**Date:** 2026-03-18
**Status:** Draft

---

## 1. Executive Summary

Claude Code Visual Manager is a locally-hosted web application (served on `localhost`) that provides a graphical user interface for the Claude Code CLI. It targets developers who already hold a Claude Code subscription and want a visual shell around the CLI without leaving their machine or setting up cloud infrastructure.

The application spawns Claude Code processes directly using the user's installed binary — no API key is required. It delivers two interaction modes in the same UI: a live PTY terminal (real-time bidirectional input/output via xterm.js over WebSocket) and a job mode (prompt submitted → Claude works in the background → formatted Markdown result displayed). It also provides visual editors for the Claude Code configuration surface: agents, skills, CLAUDE.md files, and project registration. Multiple projects can run simultaneously, each with its own persistent Claude process. Sessions survive browser tab closures and are terminated only on explicit user request.

The application is started with `npm start`, binds exclusively to `127.0.0.1`, requires no authentication (single-user, local machine), and targets Windows 11 as the primary platform.

---

## 2. Problem Statement & User Persona

### Problem Statement

Claude Code is a powerful CLI tool, but it exposes no graphical interface. Developers must:
- Work entirely in a terminal, with no project-switching sidebar or session management UI
- Hand-edit YAML frontmatter in agent and skill Markdown files with no schema assistance
- Lose terminal context whenever they switch projects or accidentally close a tab
- Manually kill and restart Claude processes to switch contexts
- Have no visibility into running sessions, their status, or their output history

These friction points slow down teams that use Claude Code heavily across multiple projects. Existing web UIs (ClaudeCodeUI, claude-code-webui, ClaudeX) provide partial solutions but do not combine live terminal emulation, persistent sessions, job mode, and entity management in a single local application.

### User Persona

**Primary user:** A software developer or AI engineer who:
- Has an active Claude Code subscription and the `claude` binary installed on Windows 11
- Works on multiple projects simultaneously
- Wants to switch between Claude sessions without losing terminal state
- Wants to submit background jobs (prompt → formatted result) without babysitting a terminal
- Wants a visual editor for agents, skills, and CLAUDE.md rather than editing raw files
- Is comfortable running `npm start` in a terminal but does not want to configure cloud services

**Usage environment:** Single user, local machine, no network access from outside the machine, no corporate auth required.

---

## 3. Goals & Non-Goals

### Goals

| Goal | Metric | Target |
|------|--------|--------|
| Live terminal access to Claude Code | PTY spawned and streaming via xterm.js | Session starts within 2 seconds of project selection |
| Session persistence across disconnects | PTY process survives browser tab close/reopen | Verified by reconnect test (see QA critical path 1) |
| Multi-project simultaneous sessions | N independent Claude processes running | At least 5 concurrent sessions without instability |
| Job mode background execution | Prompt submitted, result rendered as Markdown | Job starts within 1 second, result rendered on completion |
| Entity management | CRUD for agents, skills, CLAUDE.md | All file types read, edited, and saved correctly |
| Project registration and scaffolding | Register existing dirs or scaffold new ones | Both flows complete without manual filesystem steps |
| Clean process lifecycle | No orphaned processes after server shutdown | Zero `claude.exe` / `conhost.exe` leaks verified in Task Manager |
| Security baseline | All 10 mandatory security requirements satisfied | 100% of security checklist passes before v1 release |
| Simple startup | Single command launch | `npm start` brings up the full app in one step |

### Non-Goals (v1)

- Authentication or multi-user access
- Cloud deployment or remote access
- Git integration (commit, branch, diff UI)
- MCP server management UI (read-only display only — [ASSUMED: editing .mcp.json is out of scope for v1 due to complexity])
- Mobile or tablet browser support
- Electron or Tauri packaging
- Plugin or extension system
- Automated Claude Code CLI updates
- Session sharing or collaboration features

---

## 4. User Stories

### Project Management
- As a user, I want to register an existing local folder as a project so that Claude can be launched in that directory.
- As a user, I want to scaffold a new project directory so that `.claude/` and `CLAUDE.md` are created for me with a starter template.
- As a user, I want to see all registered projects in a sidebar so that I can switch between them with one click.
- As a user, I want to remove a project from the registry (without deleting files) so that I can keep the project list clean.

### Terminal Mode
- As a user, I want a live terminal in the browser that connects to a real Claude Code PTY process so that I can interact with Claude the same way I would in a native terminal.
- As a user, I want to close the browser tab and reopen it without losing my terminal session so that I don't lose work if my browser crashes.
- As a user, I want to switch between project terminals without killing either Claude process so that both contexts remain active simultaneously.
- As a user, I want the terminal to resize correctly when I resize my browser window so that line wrapping and cursor positioning remain accurate.
- As a user, I want to explicitly stop a Claude session from the UI so that I can free resources when a project is no longer needed.

### Job Mode
- As a user, I want to submit a text prompt to Claude and receive a formatted Markdown result when it finishes so that I can run background tasks without watching a terminal.
- As a user, I want to see streaming progress while a job is running so that I know the job has not stalled.
- As a user, I want to cancel a running job so that I can stop runaway or mistaken executions.
- As a user, I want job results to persist in the UI after completion so that I can review them without rerunning.
- As a user, I want to configure the allowed tools and max turns for a job before submitting so that I can control the job's scope.

### Agent Management
- As a user, I want to view all agents (project-scoped and user-scoped) in one list so that I can manage them without navigating the filesystem.
- As a user, I want to create a new agent by filling in a form so that I don't have to write YAML frontmatter by hand.
- As a user, I want to edit an existing agent's frontmatter fields and body so that I can update its behavior.
- As a user, I want to delete an agent file from the UI so that I don't have to use a file explorer.
- As a user, I want to see a warning after saving an agent that tells me to restart the session so that I know the change requires a restart to take effect.

### Skill Management
- As a user, I want to view all skills (project-scoped and user-scoped) so that I can manage them in one place.
- As a user, I want to create a new skill by filling in a form (name, description, body) so that I can add slash commands without editing raw files.
- As a user, I want to edit an existing skill's frontmatter and body so that I can update its behavior. Skill changes take effect live without a session restart.
- As a user, I want to delete a skill from the UI so that obsolete slash commands are removed.

### CLAUDE.md Management
- As a user, I want to view and edit the project-scoped CLAUDE.md (`<project>/.claude/CLAUDE.md`) so that I can control the project system prompt.
- As a user, I want to view and edit the user-scoped CLAUDE.md (`~/.claude/CLAUDE.md`) so that I can manage my global instructions.
- As a user, I want to see a line count warning when my CLAUDE.md exceeds 300 lines so that I stay within the recommended context budget.

### Application Lifecycle
- As a user, I want to start the application with `npm start` so that I don't need to configure anything before first use.
- As a user, I want the application to clean up all Claude processes when I stop the server so that no orphaned processes remain.
- As a user, I want idle sessions (no client connected, no recent output) to be automatically terminated after a configurable timeout (default 30 minutes) so that I don't accumulate stale processes.

---

## 5. Functional Requirements

### Must Have (MVP — Phases 0-3)

**Application Bootstrap**
- FR-01: The server must start with `npm start` and open the React SPA at `http://127.0.0.1:<PORT>` (default port: 3000, configurable via `PORT` environment variable).
- FR-02: The server must bind exclusively to `127.0.0.1`, never to `0.0.0.0`. Verified by `netstat -an | findstr LISTENING` showing only the loopback address.
- FR-03: On startup, the server must call `claude --version` and log the detected version. If the `claude` binary is not found on `PATH`, the server must emit a clear error message and exit with a non-zero code.
- FR-04: All REST endpoints must be prefixed with `/api/v1/`.

**Project Management**
- FR-05: `POST /api/v1/projects` must accept `{ name: string, path: string }`, validate that `path` is an absolute path to an existing directory, store the project in the config store, and return `{ id, name, path, createdAt }`.
- FR-06: `POST /api/v1/projects/scaffold` must accept `{ name: string, path: string }`, create the directory if it does not exist, create `<path>/.claude/` and `<path>/.claude/CLAUDE.md` with a starter template, register the project, and return the project record.
- FR-07: `GET /api/v1/projects` must return all registered projects as a JSON array.
- FR-08: `DELETE /api/v1/projects/:id` must remove the project from the registry without touching the filesystem.
- FR-09: The React sidebar must list all projects. Clicking a project opens its terminal view. The active project is visually highlighted.

**Session Management (Terminal Mode)**
- FR-10: `POST /api/v1/sessions` must accept `{ projectId: string }`, spawn a PTY via `pty.spawn("claude", [], { name: "xterm-color", cols: 80, rows: 24, cwd: project.path, env: { ...process.env } })`, assign a UUID session ID, store `{ pty, buffer: RingBuffer(100KB), clients: Set<WebSocket>, createdAt, lastActivityAt }` in the sessions Map, and return `{ sessionId, projectId, createdAt }`.
- FR-11: `GET /api/v1/sessions` must return all active sessions with their `{ sessionId, projectId, pid, status, createdAt, lastActivityAt }`.
- FR-12: `DELETE /api/v1/sessions/:id` must call `pty.kill()` on the session's PTY, remove it from the sessions Map, and return 204.
- FR-13: The WebSocket server must upgrade connections at `ws://127.0.0.1:<PORT>/ws?sessionId=<uuid>`. On connection: validate the sessionId exists (close with code 4004 if not), add the socket to `session.clients`, replay the ring buffer synchronously, then wire `pty.onData → ws.send` for live streaming.
- FR-14: On WebSocket message of type `{ type: "input", data: string }`, the server must call `session.pty.write(data)`.
- FR-15: On WebSocket message of type `{ type: "resize", cols: number, rows: number }`, the server must call `session.pty.resize(cols, rows)`.
- FR-16: On WebSocket `close`, the server must call `session.clients.delete(ws)` and nothing else. The PTY must remain alive.
- FR-17: A permanent `pty.onData` consumer must run from spawn to kill, writing output to the ring buffer and broadcasting to all connected clients. This handler must never be removed or paused based on client count.
- FR-18: The ring buffer must be a true fixed-capacity circular buffer capped at 100 KB per session. Overflow must discard the oldest bytes, not grow unboundedly.
- FR-19: An idle timeout sweeper must run every 5 minutes. Any session with zero connected clients and no `pty.onData` event in the past N minutes (configurable via `IDLE_TIMEOUT_MINUTES` env var, default 30) must have `pty.kill()` called and be removed from the sessions Map.
- FR-20: The React terminal view must instantiate one xterm.js `Terminal` per session. `xterm-addon-fit` must be used for viewport sizing. A `ResizeObserver` on the container div must call `fitAddon.fit()` and then send a `{ type: "resize", cols, rows }` WebSocket message, debounced to 100 ms.
- FR-21: On project tab switch in the React client, the current WebSocket must be closed (`ws.close()`), the xterm.js instance must be cleared (`terminal.clear()` then `terminal.reset()`), a new WebSocket must be opened with the target session's ID, and the ring buffer replay must be written into the terminal before live data.

**Job Mode**
- FR-22: `POST /api/v1/jobs` must accept `{ projectId: string, prompt: string, allowedTools?: string, maxTurns?: number }`. It must spawn `child_process.spawn("claude", ["-p", prompt, "--output-format", "stream-json", "--allowedTools", allowedTools ?? "all", "--max-turns", String(maxTurns ?? 10), "--no-session-persistence"], { cwd: project.path, stdio: ["pipe", "pipe", "pipe"] })`, call `child.stdin.end()` immediately, assign a UUID job ID, and return `{ jobId, projectId, createdAt }`.
- FR-23: Job output must be streamed to the browser via a WebSocket at `ws://127.0.0.1:<PORT>/ws/jobs?jobId=<uuid>` or via Server-Sent Events at `GET /api/v1/jobs/:id/stream`. [ASSUMED: SSE chosen for job streaming because it is simpler for unidirectional streaming and does not require upgrading the connection.]
- FR-24: Each line of `child.stdout` must be parsed as JSON and forwarded to the browser as a streaming event. On `child.on('close')`, the server must extract the `result` field from the final `stream-json` event and send a `{ type: "done", result: string }` event.
- FR-25: `DELETE /api/v1/jobs/:id` must call `tree-kill(child.pid)` and terminate all child processes spawned by Claude, then return 204.
- FR-26: The React job view must display a spinner and accumulate partial output while the job is running. On the `done` event, it must render the `result` field using `react-markdown` with the `remark-gfm` plugin (for table and code block support).
- FR-27: Completed job results must persist in React state for the duration of the browser session. The user must be able to scroll back through past job results.

**Agent Management**
- FR-28: `GET /api/v1/agents` must return all agent files found in both `~/.claude/agents/` (user-scoped) and `<project>/.claude/agents/` (project-scoped) for the current project context, parsed into `{ id, name, scope: "user"|"project", filePath, frontmatter, body }`.
- FR-29: `POST /api/v1/agents` must accept `{ name, scope, frontmatter, body }`, validate the name matches `^[a-z][a-z0-9-]*$`, write the file to the correct directory using `write-atomic`, and return the created agent record.
- FR-30: `PUT /api/v1/agents/:id` must accept `{ frontmatter, body }`, parse and reserialize the YAML frontmatter using `js-yaml`, and write the updated file atomically. It must return the updated agent record.
- FR-31: `DELETE /api/v1/agents/:id` must delete the agent file and return 204.
- FR-32: After any agent save operation (POST or PUT), the React UI must display a persistent warning: "Restart the Claude session for this agent to take effect."

**Skill Management**
- FR-33: `GET /api/v1/skills` must return all skill files found in `~/.claude/skills/` and `<project>/.claude/skills/` (current format), as well as legacy locations `~/.claude/commands/` and `<project>/.claude/commands/`, parsed into `{ id, name, scope, filePath, frontmatter, body }`.
- FR-34: `POST /api/v1/skills` must accept `{ name, scope, frontmatter, body }`, create the directory `<base>/<name>/` and write `SKILL.md` inside it using `write-atomic`, and return the created skill record.
- FR-35: `PUT /api/v1/skills/:id` must accept `{ frontmatter, body }` and write the updated `SKILL.md` atomically. No session restart warning is required (skill changes are live).
- FR-36: `DELETE /api/v1/skills/:id` must delete the skill directory and its contents and return 204.

**CLAUDE.md Management**
- FR-37: `GET /api/v1/claudemd` must return `{ userScope: { path, content }, projectScope: { path, content } }` for the active project context.
- FR-38: `PUT /api/v1/claudemd/user` must accept `{ content: string }` and write it atomically to `~/.claude/CLAUDE.md`.
- FR-39: `PUT /api/v1/claudemd/project` must accept `{ content: string, projectId: string }` and write it atomically to `<project>/.claude/CLAUDE.md`.
- FR-40: The React CLAUDE.md editor must display a line count indicator and show a visible warning (yellow banner) when the content exceeds 300 lines.

**Config Persistence**
- FR-41: The application config (project registry, app settings) must be stored as JSON at `%APPDATA%\ClaudeCodeManager\config.json`. If `APPDATA` is unset, fall back to `os.homedir()\.claudecodemanager\config.json`.
- FR-42: All writes to the config file must use `write-atomic` to prevent corruption on crash.
- FR-43: On startup, if the config file does not exist, the server must create it with an empty default structure: `{ version: "1", projects: [], settings: {} }`.

**Process Lifecycle**
- FR-44: The server must register handlers for `process.on('exit')`, `process.on('SIGTERM')`, and `process.on('SIGINT')`. Each handler must iterate the sessions Map and call `pty.kill()` on every active PTY before the process exits.
- FR-45: On startup, the server must check `%APPDATA%\ClaudeCodeManager\active_pids.json` for stale PIDs from a previous abnormal shutdown, attempt to kill each stale PID using `tree-kill`, and delete the file.
- FR-46: On each PTY spawn, the server must append the PID to `active_pids.json`. On each PTY kill, it must remove the PID from `active_pids.json`.

### Should Have (v1.1)

- FR-50: Settings editor UI for `~/.claude/settings.json` and `<project>/.claude/settings.json` with field validation against the JSON Schema at `https://json.schemastore.org/claude-code-settings.json`.
- FR-51: Job history persistence across server restarts (stored in the config file or a sidecar JSON file).
- FR-52: Per-project notes or README viewer in the sidebar.
- FR-53: One-click "copy output" button on job results.
- FR-54: Searchable terminal output within the current session buffer.
- FR-55: Dark/light theme toggle.

### Won't Have (explicitly out of scope for v1)

- Authentication or session tokens — reason: single-user local app, binding to 127.0.0.1 is sufficient isolation.
- Cloud or remote deployment — reason: design is deliberately localhost-only; adding remote access would require auth, TLS, and a redesigned security model.
- Git integration (commit UI, branch management, diff view) — reason: scope and complexity; use VS Code or a dedicated Git UI.
- MCP server configuration editor — reason: `.mcp.json` structure requires a separate research pass; read-only display is acceptable for v1.
- Electron or Tauri packaging — reason: `npm start` is sufficient for the target user; packaging adds CI complexity.
- Mobile browser support — reason: terminal emulation on mobile is impractical; xterm.js requires a keyboard.
- Plugin or extension system — reason: premature abstraction; build the core features first.

---

## 6. Technical Architecture

### Technology Stack

| Layer | Library | Version | Purpose |
|-------|---------|---------|---------|
| Runtime | Node.js | 20 LTS | Server runtime; `child_process.spawn`, `node-pty` compatibility |
| HTTP server | Express | 4.x | REST API, static file serving, middleware |
| WebSocket | ws | 8.x | Low-level WebSocket for PTY streaming; no transport fallbacks needed |
| PTY | node-pty-prebuilt-multiarch | latest | Prebuilt binaries avoid MSVC Build Tools requirement on Windows |
| Process tree kill | tree-kill | latest | Kills Claude's full process tree (sub-processes included) |
| Atomic file write | write-atomic | latest | Prevents config/agent/skill file corruption on crash |
| YAML parsing | js-yaml | 4.x | Agent and skill YAML frontmatter parse and serialize |
| UUID generation | uuid | 9.x | Session and job ID generation (v4) |
| Security headers | helmet | latest | Sets CSP, X-Content-Type-Options, X-Frame-Options |
| Frontend bundler | Vite | 5.x | Sub-second HMR for development; production bundle |
| UI framework | React | 18 | Concurrent rendering, hooks-based state management |
| Terminal renderer | xterm.js | 5.x | Browser-based PTY rendering; ConPTY-compatible |
| Terminal resize | xterm-addon-fit | latest | Resizes xterm.js to its container div |
| Styling | Tailwind CSS | 3.x | Utility-first; no conflicts with xterm.js canvas |
| Markdown rendering | react-markdown | 9.x | Safe Markdown rendering for job results |
| Markdown tables | remark-gfm | latest | GFM plugin for react-markdown (tables, code fences) |

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Node.js Process                          │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │  Express      │  │ SessionManager│  │     JobRunner        │  │
│  │  HTTP Server  │  │               │  │                      │  │
│  │               │  │ Map<id,{      │  │ Map<id,{             │  │
│  │  /api/v1/*    │  │   pty,        │  │   child,            │  │
│  │  static SPA   │  │   buffer,     │  │   clients           │  │
│  │               │  │   clients     │  │ }>                  │  │
│  └──────┬────────┘  │ }>            │  └────────┬─────────────┘  │
│         │           └───────┬───────┘           │               │
│         │                   │                   │               │
│  ┌──────▼────────────────────▼───────────────────▼────────────┐  │
│  │                    WebSocket Server (ws)                    │  │
│  │   /ws?sessionId=<uuid>          /ws/jobs?jobId=<uuid>       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │  FileManager │  │  ConfigStore  │  │   ProcessRegistry    │  │
│  │              │  │               │  │   (active_pids.json) │  │
│  │  Path valid. │  │  config.json  │  │                      │  │
│  │  YAML parse  │  │  write-atomic │  │  Stale PID cleanup   │  │
│  │  write-atomic│  │               │  │  on startup          │  │
│  └──────────────┘  └───────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     React SPA (Vite)                            │
│                                                                  │
│  ┌────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Terminal   │  │   Job Mode   │  │ Entities │  │ Projects │  │
│  │  View       │  │   View       │  │  View    │  │  View    │  │
│  │  xterm.js   │  │  Prompt+SSE  │  │ Agent/   │  │ Register │  │
│  │  WebSocket  │  │  react-      │  │ Skill/   │  │ Scaffold │  │
│  │             │  │  markdown    │  │ CLAUDE.md│  │          │  │
│  └────────────┘  └──────────────┘  └──────────┘  └──────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  Project Sidebar                           │  │
│  │  [Project A] [Project B] [Project C]  [+ Add Project]     │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

External Processes (one per active session):
  claude.exe ─ spawned by SessionManager via node-pty (ConPTY)
  claude.exe ─ spawned by JobRunner via child_process.spawn
```

### File Layout

```
<repo-root>/
├── package.json              # Root: scripts (start, dev, build)
├── server/
│   ├── index.js              # Express app bootstrap, server.listen("127.0.0.1")
│   ├── routes/
│   │   ├── projects.js       # /api/v1/projects
│   │   ├── sessions.js       # /api/v1/sessions
│   │   ├── jobs.js           # /api/v1/jobs
│   │   ├── agents.js         # /api/v1/agents
│   │   ├── skills.js         # /api/v1/skills
│   │   └── claudemd.js       # /api/v1/claudemd
│   ├── services/
│   │   ├── SessionManager.js # PTY lifecycle, sessions Map, ring buffer
│   │   ├── JobRunner.js      # child_process spawning, job Map
│   │   ├── FileManager.js    # All FS reads/writes, path validation
│   │   ├── ConfigStore.js    # %APPDATA% config JSON, write-atomic
│   │   └── ProcessRegistry.js# active_pids.json read/write
│   ├── ws/
│   │   ├── terminalHandler.js# /ws WebSocket upgrade handler
│   │   └── jobHandler.js     # /ws/jobs WebSocket upgrade handler
│   └── middleware/
│       ├── csrf.js           # X-Requested-With header check
│       ├── pathValidation.js # Path traversal prevention
│       └── security.js       # helmet() + binding assertions
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
│       │   ├── Terminal.jsx       # xterm.js wrapper + WebSocket
│       │   ├── JobPanel.jsx
│       │   ├── AgentEditor.jsx
│       │   ├── SkillEditor.jsx
│       │   └── ClaudeMdEditor.jsx
│       └── hooks/
│           ├── useSession.js
│           └── useJob.js
└── docs/
    └── PRD.md
```

### Data Model

**Project**
```
{
  id:        string (UUID v4)
  name:      string
  path:      string (absolute filesystem path, validated)
  createdAt: string (ISO 8601)
}
```

**SessionRecord** (in-memory only, not persisted)
```
{
  sessionId:      string (UUID v4)
  projectId:      string
  pty:            IPty (node-pty instance)
  buffer:         RingBuffer (100 KB fixed capacity)
  clients:        Set<WebSocket>
  pid:            number
  status:         "active" | "killed"
  createdAt:      Date
  lastActivityAt: Date
}
```

**JobRecord** (in-memory; job results persisted in v1.1)
```
{
  jobId:       string (UUID v4)
  projectId:   string
  prompt:      string
  allowedTools: string
  maxTurns:    number
  child:       ChildProcess
  clients:     Set<WebSocket | SseResponse>
  status:      "running" | "done" | "cancelled" | "error"
  result:      string | null (Markdown)
  createdAt:   Date
  completedAt: Date | null
}
```

**Agent** (file-backed)
```
{
  id:          string (UUID v4, generated from filePath hash or random)
  name:        string (from frontmatter)
  scope:       "user" | "project"
  filePath:    string (absolute)
  frontmatter: object (all valid YAML frontmatter fields)
  body:        string (Markdown body below frontmatter delimiter)
}
```

**Skill** (file-backed)
```
{
  id:          string
  name:        string (from frontmatter or directory name)
  scope:       "user" | "project"
  filePath:    string (absolute path to SKILL.md)
  frontmatter: object
  body:        string
}
```

**AppConfig** (persisted to %APPDATA%)
```
{
  version:  "1"
  projects: Project[]
  settings: {
    port:               number (default 3000)
    idleTimeoutMinutes: number (default 30)
  }
}
```

---

## 7. Claude Code Integration

### Binary Discovery

The server must locate the `claude` binary at startup using the following strategy:
1. Check if `claude` is on `PATH` via `child_process.spawnSync("claude", ["--version"], { shell: false })`.
2. If not found on PATH, check the default installation location for Windows: `%LOCALAPPDATA%\AnthropicClaude\claude.exe`. [ASSUMED: based on typical Electron app installation paths on Windows.]
3. If neither location yields a valid binary, log a clear error and exit.
4. Store the resolved binary path in a module-level constant used by all spawn calls.

### Terminal Mode (PTY) Invocation

```js
pty.spawn(CLAUDE_BIN, [], {
  name: "xterm-color",
  cols: 80,
  rows: 24,
  cwd: project.path,
  env: { ...process.env }
});
```

- Arguments: empty array (Claude Code reads input interactively from the PTY).
- `env`: inherit the full server environment so Claude Code can access the user's auth credentials (stored in `~/.claude.json` OAuth session).
- `cols` and `rows`: ConPTY uses these immediately; they are updated via `pty.resize()` when the browser terminal resizes.

### Job Mode (Headless) Invocation

```js
const child = child_process.spawn(CLAUDE_BIN, [
  "-p", prompt,
  "--output-format", "stream-json",
  "--allowedTools", allowedTools,
  "--max-turns", String(maxTurns),
  "--no-session-persistence"
], {
  cwd: project.path,
  stdio: ["pipe", "pipe", "pipe"],
  shell: false
});
child.stdin.end(); // CRITICAL: close stdin immediately (GitHub issue #7497)
```

- `--output-format stream-json`: produces line-delimited JSON events for streaming progress.
- `--no-session-persistence`: prevents cluttering Claude's session history with background jobs.
- `child.stdin.end()`: must be called immediately after spawn. Failure to do so causes the process to hang indefinitely (confirmed bug: GitHub issue #7497).
- `child.stdout` must be read line-by-line using the `readline` module. Each line is parsed as JSON and forwarded to the browser.
- Final event: parse for `result` field (a Markdown string) and send `{ type: "done", result }` to the browser.
- Cancellation: `tree-kill(child.pid)` — not `child.kill()`, which leaves sub-processes alive on Windows.

### Version Check at Startup

```js
const result = child_process.spawnSync(CLAUDE_BIN, ["--version"], { encoding: "utf8" });
const version = result.stdout.trim(); // e.g., "claude-code 1.2.3"
logger.info(`Claude Code version: ${version}`);
// Warn if version is below the minimum tested version
```

Minimum tested version: [ASSUMED: "1.0.0" as baseline — the team must update this after integration testing.]

### YAML Frontmatter Parsing

```js
// Parse
const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m);
const frontmatter = yaml.load(match[1]);
const body = match[2];

// Serialize
const serialized = `---\n${yaml.dump(frontmatter)}---\n${body}`;
```

- Agent frontmatter fields and their validation rules are documented in Section 6 of research_complete.md.
- Skill frontmatter fields and their validation rules are documented in Section 6 of research_complete.md.
- The `$ARGUMENTS` placeholder in the skill body must not be modified when only frontmatter is changed.

### Agent Behavioral Notes

- Agents are loaded at session start. Changes to agent files require a Claude session restart to take effect. The UI must display this warning after every agent save.
- Skill changes are detected live by Claude Code. No session restart is required after skill saves.
- The `name` frontmatter field in agent files must match `^[a-z][a-z0-9-]*$` (lowercase letters and hyphens only). The server must validate this before writing.

### Session Lifecycle

```
POST /api/v1/sessions
  → validate projectId
  → validate project.path (absolute, exists, accessible)
  → pty.spawn(CLAUDE_BIN, [], { cwd, env, cols: 80, rows: 24 })
  → session.clients = new Set()
  → permanent pty.onData handler wired (never removed)
  → append PID to active_pids.json
  → return { sessionId, projectId, createdAt }

WebSocket /ws?sessionId=<uuid>
  → validate sessionId exists (4004 if not)
  → session.clients.add(ws)
  → replay ring buffer → ws.send(chunk) for each chunk
  → wire pty.onData → ws.send (already wired; buffer already replaying)
  → on ws.message({ type:"input" }) → pty.write(data)
  → on ws.message({ type:"resize" }) → pty.resize(cols, rows)
  → on ws.close → session.clients.delete(ws) — PTY stays alive

DELETE /api/v1/sessions/:id
  → pty.kill()
  → sessions.delete(sessionId)
  → remove PID from active_pids.json
  → return 204

Idle sweeper (every 5 minutes):
  → for each session where clients.size === 0
       and now - lastActivityAt > IDLE_TIMEOUT_MINUTES
  → pty.kill(), sessions.delete(sessionId)
  → remove PID from active_pids.json
```

---

## 8. Security Requirements

All 10 of the following requirements are mandatory for v1 release. No exceptions.

**SEC-01: Bind to 127.0.0.1 only.**
The server must call `server.listen(PORT, "127.0.0.1")`. The `host` argument must never be `"0.0.0.0"` or omitted (which defaults to `0.0.0.0`). Verification: `netstat -an | findstr LISTENING` must show only the loopback address for the application port.

**SEC-02: No `shell: true` in any child process invocation.**
Every call to `child_process.spawn()` and `pty.spawn()` must pass arguments as a JavaScript array. The `shell` option must be `false` or omitted. A code review must audit every spawn call site before release. Rationale: `shell: true` allows arbitrary command injection via crafted project paths or prompts.

**SEC-03: Working directory path validation.**
Before spawning any PTY or job process with `cwd: project.path`:
- Validate `project.path` is an absolute path (does not start with `.`).
- Validate `project.path` contains no `..` components and no null bytes.
- Validate the directory exists and is accessible using `fs.accessSync`.
- [ASSUMED: UNC paths (e.g., `\\server\share`) are rejected in v1 with an error message.]
Return HTTP 400 with a descriptive error if validation fails.

**SEC-04: File write path validation.**
The `FileManager` service must:
- Resolve every write target path using `path.resolve()`.
- Assert that the resolved path starts with the expected base directory (`%APPDATA%\ClaudeCodeManager\`, `~/.claude/`, or a registered project path).
- Return HTTP 400 and write no file if the assertion fails.
This prevents path traversal attacks (e.g., `{ name: "../../evil" }` in an API body).

**SEC-05: WebSocket message size caps and backpressure.**
- Set `maxPayload: 1024 * 1024` (1 MB) on the `WebSocketServer` constructor.
- Before calling `ws.send(data)`, check `ws.bufferedAmount`. If it exceeds 256 KB, pause forwarding from the PTY output handler for that client until `ws.bufferedAmount` drops below the threshold.
- The ring buffer write must not be paused — only the per-client send may be paused.

**SEC-06: CSRF protection on mutating endpoints.**
All `POST`, `PUT`, `PATCH`, and `DELETE` endpoints must require the request header `X-Requested-With: ClaudeCodeManager`. Express middleware must verify this header and return HTTP 403 if absent. The React client must send this header on all mutating `fetch` calls. The middleware must be applied before all API routes.

**SEC-07: Security headers via helmet.**
Apply `helmet()` as the first Express middleware. The Content-Security-Policy must restrict `script-src` to `'self'` only. Verify the following headers are present on all responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-Powered-By` absent.

**SEC-08: No sensitive data in logs.**
The application must never log:
- API keys or OAuth tokens (from `~/.claude.json`)
- Full prompt content from job mode submissions
- Full file content of CLAUDE.md, agent files, or skill files
Allowed to log: session IDs, project IDs, PIDs, exit codes, error messages (without stack data containing file content).

**SEC-09: PTY process lifecycle management.**
- Register `process.on('exit')`, `process.on('SIGTERM')`, `process.on('SIGINT')` handlers that call `pty.kill()` on every session in the Map before the process exits.
- Implement the idle timeout sweeper (FR-19) to kill sessions idle beyond the configured threshold.
- On startup, check `active_pids.json` for stale PIDs and kill them with `tree-kill` (FR-45).
- Never rely on garbage collection or process exit alone to clean up ConPTY resources.

**SEC-10: `npm audit` in CI.**
Run `npm audit --audit-level=high` as a mandatory step before any release. Resolve all high and critical findings before shipping. This is non-optional because `node-pty` and `ws` receive periodic CVEs.

---

## 9. Non-Functional Requirements

### Performance

- NFR-01: The xterm.js terminal must display PTY output with a perceived latency of less than 50 ms from keystroke to screen update under normal localhost conditions.
- NFR-02: Session switching (WebSocket close + new WebSocket open + ring buffer replay) must complete within 500 ms for a 100 KB ring buffer.
- NFR-03: `POST /api/v1/sessions` must return within 2 seconds of the request (PTY spawned and ready).
- NFR-04: `POST /api/v1/jobs` must return within 1 second (child process spawned, response returned before job completes).
- NFR-05: The React SPA must load and render the project list within 3 seconds of the user navigating to `http://127.0.0.1:3000` on a cold start.
- NFR-06: The application must support at least 5 simultaneous active PTY sessions without measurable degradation in terminal responsiveness.
- NFR-07: Ring buffer memory must be capped at 100 KB per session. With 5 sessions, total ring buffer memory must not exceed 500 KB.

### Compatibility

- NFR-08: Primary platform: Windows 11 (23H2 or later). ConPTY behavior on Windows 11 pre-23H2 is unsupported [ASSUMED: based on ClosePseudoConsole deadlock risk on older builds].
- NFR-09: Runtime: Node.js 20 LTS. The application must not use any Node.js API marked as experimental in Node.js 20.
- NFR-10: The `node-pty-prebuilt-multiarch` package must be used (not plain `node-pty`) to avoid requiring MSVC Build Tools on the user's machine.
- NFR-11: The React SPA must support the latest stable versions of Chrome, Firefox, and Edge. Safari support is not required for v1 [ASSUMED: Windows-primary users; Safari is Mac-only].
- NFR-12: The Claude Code binary must be on the user's `PATH` or at the fallback location specified in Section 7. The application must not bundle or install Claude Code.

### Startup

- NFR-13: `npm install` followed by `npm start` must bring the application to a ready state (server listening, SPA served, browser-openable) in under 30 seconds on a machine with an internet connection (for `npm install`) and under 5 seconds on a machine with dependencies already installed.
- NFR-14: `npm start` must open the browser automatically at `http://127.0.0.1:<PORT>`. [ASSUMED: using the `open` npm package or a platform-appropriate `start` command.]
- NFR-15: The server must log its listening address and port to stdout on startup, e.g.: `Claude Code Visual Manager running at http://127.0.0.1:3000`.

### Reliability

- NFR-16: The server must not crash on malformed WebSocket messages. All message parsing must be wrapped in try/catch; malformed messages must log a warning and be discarded.
- NFR-17: The server must not crash if the `claude` binary exits unexpectedly. It must detect PTY exit via `pty.onExit`, update the session status to `"killed"`, notify connected WebSocket clients with `{ type: "session-exit", code }`, and remove the session from the Map.
- NFR-18: Write failures (e.g., disk full) in `write-atomic` must be caught, returned as HTTP 500 with a descriptive error, and must not corrupt existing files.

---

## 10. Phase Plan

### Phase 0 — Foundation (Week 1, Days 1-3)

**Objective:** Minimal working server + React shell with no features.

**Tasks:**
1. Initialize monorepo: `server/` (Node.js + Express) and `client/` (React + Vite + Tailwind).
2. Configure `npm start` to build the client and start the server, serving the client SPA at `http://127.0.0.1:3000`.
3. Apply `helmet()` middleware and the CSRF header middleware (SEC-06, SEC-07).
4. Bind to `127.0.0.1` only (SEC-01).
5. Implement `ConfigStore`: read/write `%APPDATA%\ClaudeCodeManager\config.json` with `write-atomic`.
6. Implement `ProcessRegistry`: `active_pids.json` read/write.
7. Register `SIGTERM`/`SIGINT`/`exit` handlers (FR-44, SEC-09).
8. Implement stale PID cleanup on startup (FR-45).
9. Implement Claude binary discovery and version check (FR-03).

**Acceptance Criteria:**
- `npm start` serves the React SPA at `http://127.0.0.1:3000`.
- `netstat` shows the port bound only to `127.0.0.1`.
- `POST /api/v1/projects` without the CSRF header returns 403.
- `node server/index.js` followed by Ctrl+C leaves no orphaned processes.

---

### Phase 1 — Project Management + PTY Terminal (Week 1-2, Days 4-8)

**Objective:** A user can register a project and open a live terminal to Claude Code.

**Tasks:**
1. Implement `GET /api/v1/projects`, `POST /api/v1/projects`, `DELETE /api/v1/projects` (FR-05, FR-07, FR-08).
2. Implement `POST /api/v1/projects/scaffold` (FR-06).
3. Implement `SessionManager`: PTY spawn, ring buffer, `sessions` Map, permanent `pty.onData` handler (FR-10 to FR-19).
4. Implement WebSocket terminal handler at `/ws?sessionId=<uuid>` (FR-13 to FR-16).
5. Implement `FileManager` with path validation (SEC-04).
6. Implement React `Sidebar` (project list) and `TerminalView` (xterm.js + WebSocket).
7. Implement xterm-addon-fit + `ResizeObserver` + resize WebSocket message (FR-20).
8. Implement session switching in the React client (FR-21).
9. Implement idle timeout sweeper (FR-19, SEC-09).

**Acceptance Criteria:**
- User can register an existing folder and see it in the sidebar.
- Clicking a project opens a live xterm.js terminal connected to a real `claude` process.
- Closing the browser tab and reopening restores the terminal session with ring buffer replay (QA critical path 1).
- Switching between two projects keeps both Claude processes alive (QA critical path 2).
- `DELETE /api/v1/sessions/:id` kills the PTY and removes it from the Map.
- Path traversal attempt returns 400 (QA critical path 5).

---

### Phase 2 — Entity Management (Week 2, Days 9-12)

**Objective:** A user can view, create, edit, and delete agents, skills, and CLAUDE.md files.

**Tasks:**
1. Implement `GET /api/v1/agents`, `POST`, `PUT`, `DELETE` (FR-28 to FR-31).
2. Implement `GET /api/v1/skills`, `POST`, `PUT`, `DELETE` (FR-33 to FR-36).
3. Implement `GET /api/v1/claudemd`, `PUT /api/v1/claudemd/user`, `PUT /api/v1/claudemd/project` (FR-37 to FR-39).
4. Implement YAML frontmatter parse/serialize with `js-yaml` for agents and skills.
5. Implement React `AgentEditor`, `SkillEditor`, `ClaudeMdEditor` components.
6. Implement "restart required" warning on agent save (FR-32).
7. Implement CLAUDE.md line count warning at 300 lines (FR-40).

**Acceptance Criteria:**
- User can create a new agent, and the file appears in the correct directory on disk.
- User can edit an existing agent's frontmatter and body; the saved file is valid YAML.
- User can delete an agent; the file is removed from disk.
- The "restart required" warning appears after every agent save.
- User can view and edit both user-scoped and project-scoped CLAUDE.md.
- CLAUDE.md editor shows a yellow warning banner when content exceeds 300 lines.
- Path traversal in agent name returns 400 (QA critical path 5 variant).

---

### Phase 3 — Job Mode (Week 2-3, Days 13-15)

**Objective:** A user can submit a prompt, watch streaming progress, and receive a formatted Markdown result.

**Tasks:**
1. Implement `JobRunner`: `child_process.spawn` with `--output-format stream-json`, stdin closed immediately (FR-22).
2. Implement SSE streaming at `GET /api/v1/jobs/:id/stream` (FR-23, FR-24).
3. Implement `DELETE /api/v1/jobs/:id` with `tree-kill` (FR-25).
4. Implement React `JobPanel`: prompt textarea, tool/turn config, streaming progress, `react-markdown` result rendering (FR-26, FR-27).

**Acceptance Criteria:**
- Submitting a prompt starts a job within 1 second (FR-04 timing).
- Streaming progress events appear in the UI while the job runs.
- Job completes without hanging (QA critical path 3).
- Clicking "Cancel" terminates the `claude` process and all sub-processes (QA critical path 6).
- After cancellation, a new job can be submitted successfully.
- Result is rendered as formatted Markdown with table and code block support.

---

### Phase 4 — Polish, QA, Security Sign-off (Week 3, Days 16-21)

**Objective:** All features stable, security audit passed, ready for release.

**Tasks:**
1. End-to-end QA of all 6 QA critical paths from research_complete.md.
2. Run `npm audit --audit-level=high` and resolve all findings (SEC-10).
3. Security agent audit: binding verification, no-shell-true audit, path traversal tests, CSRF tests, log cleanliness, CSP header check.
4. Error handling: surface WebSocket close codes 4004 and 4001 as UI error messages.
5. Stale process cleanup test: kill the server abnormally, verify no orphan processes, verify startup cleanup works on next start.
6. Performance testing: 5 simultaneous sessions under normal usage.
7. Documentation: README with prerequisites (Node.js 20, `claude` on PATH), `npm start` instructions, and troubleshooting for `node-pty` build failures.
8. Implement FR-50 (settings.json editor) as stretch goal if time permits.

**Acceptance Criteria:**
- All 6 QA critical paths pass.
- `npm audit` reports zero high or critical vulnerabilities.
- Security checklist from Section 8 is 100% complete.
- `npm start` on a clean Windows 11 machine with Node.js 20 and `claude` on PATH succeeds without errors.
- No `claude.exe` or `conhost.exe` processes remain after server shutdown (normal or abnormal).

---

## 11. Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Authentication / login | Single-user local app; `127.0.0.1` binding provides sufficient isolation |
| Multi-user support | Architectural redesign required; out of scope for v1 |
| Cloud / remote deployment | Would require TLS, auth, and a redesigned security model |
| Git integration (commit UI, branch management, diff view) | Separate concern; existing tools (VS Code, Sourcetree) handle this |
| MCP server configuration editor | `.mcp.json` editing requires additional research; read-only display sufficient for v1 |
| Electron or Tauri packaging | `npm start` is sufficient; packaging adds CI and code-signing complexity |
| Mobile browser support | PTY terminal emulation is impractical on mobile; xterm.js requires a physical keyboard |
| Plugin or extension system | Premature abstraction; build the core features first |
| Automated Claude Code CLI updates | The user manages their own Claude Code installation |
| Session sharing or collaboration | Requires auth and multi-user architecture |
| settings.json visual editor | Should Have for v1.1; omitted from MVP to reduce scope |
| Job history persistence across restarts | Should Have for v1.1; requires additional storage design |
| Claude.ai web integration | Claude Code CLI uses local auth; web integration is a different product |
| Custom themes beyond dark/light | Cosmetic; deferred |

---

## 12. Open Risks & Mitigations

| ID | Risk | Severity | Likelihood | Mitigation |
|----|------|----------|------------|------------|
| R-01 | `node-pty-prebuilt-multiarch` prebuilt binary missing for the user's Node.js version | HIGH | MEDIUM | Use `node-pty-prebuilt-multiarch` (not plain `node-pty`) to cover most Node.js 20 + Windows combinations. Document the MSVC Build Tools fallback in the README. Test installation on a clean Windows 11 machine before release. |
| R-02 | ConPTY output pipe deadlock if the permanent reader is ever paused or removed | HIGH | MEDIUM | Enforce the permanent reader pattern: the `pty.onData` handler is wired once at spawn and never removed or conditioned on client count. Add an integration test specifically for "browser disconnected, PTY still running" (QA critical path 1). |
| R-03 | Job mode process hang (GitHub issue #7497 — stdin not closed) | HIGH | HIGH | `child.stdin.end()` must be called immediately after every `child_process.spawn` call in `JobRunner`. This must be enforced as a code review checklist item and in the test suite. |
| R-04 | Claude CLI breaking change in `-p` or `--output-format` flags | MEDIUM | LOW-MEDIUM | Wrap job spawning in a version check at startup. Pin the minimum tested Claude Code CLI version in the README. Test against each new Claude Code release before updating the documented minimum version. |
| R-05 | Orphaned `claude.exe` / `conhost.exe` on abnormal server crash (before exit handlers fire) | MEDIUM | MEDIUM | Write active PIDs to `active_pids.json` on each spawn. On startup, kill stale PIDs with `tree-kill` before the server begins accepting requests. Document manual cleanup steps in the README. |
| R-06 | `ClosePseudoConsole` deadlock on Windows 11 pre-23H2 | LOW | LOW | Always drain the ring buffer before calling `pty.kill()`. Document minimum supported Windows version as Windows 11 23H2 or later. |
| R-07 | Memory growth from many active sessions' ring buffers | LOW | LOW | Cap ring buffer at 100 KB per session. Implement idle timeout sweeper (FR-19). Surface active session count in the UI status bar. |
| R-08 | XSS in job mode result rendering | MEDIUM | LOW | Use `react-markdown` (not `dangerouslySetInnerHTML`) for all Markdown rendering. Apply helmet CSP headers. Never inject raw HTML from Claude's output into the DOM. |
| R-09 | Config file corruption on server crash during write | LOW | LOW | All config writes use `write-atomic` (write-then-rename), which is atomic at the OS level. A crash mid-write leaves the previous file intact. |
| R-10 | Claude Code binary not found on user's PATH | LOW | HIGH (setup issue) | Detect at startup with `claude --version`, emit a clear error message with installation instructions, and exit with code 1. Do not silently fail. |

---

*End of PRD v1.0*
