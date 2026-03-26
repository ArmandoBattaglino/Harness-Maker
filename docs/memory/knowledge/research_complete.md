# Full Research Brief: Claude Code Visual Manager
_Supervisor synthesis · 2026-03-18_
_Coverage: 4 topics — Researcher A (CLI headless/job mode), B (PTY session persistence Windows), C (file formats), D (multi-session PTY Node.js)_

---

## Tech Stack — Final Recommendations

| Layer | Chosen | Version | Why | Alternatives considered & rejected |
|-------|--------|---------|-----|------------------------------------|
| Runtime | Node.js | 20 LTS | Long-term support, native `child_process.spawn`, compatible with node-pty. All surveyed OSS tools target this version. | Node 18 (approaching EOL), Node 22 (not yet LTS at design time) |
| HTTP server | Express | 4.x | Minimal overhead, battle-tested middleware ecosystem, pairs cleanly with the `ws` library for WebSocket upgrade co-hosting. | Fastify (lower ecosystem familiarity for this team), Hono (newer, less documentation) |
| WebSocket | ws | 8.x | Lightweight, no abstraction over the protocol, gives direct control over message framing and backpressure. Used by node-pty community tutorials universally. | Socket.io (adds unnecessary transport fallbacks and namespace overhead for localhost-only app), native HTTP/2 push (poor browser dev tooling) |
| PTY | node-pty-prebuilt-multiarch | latest | Prebuilt binaries for Windows ConPTY avoid the most common build-failure class. `node-pty` (plain) requires node-gyp + MSVC Build Tools on first install — a user-facing setup failure risk. | node-pty plain (build failures on Windows without MSVC), python-pty (wrong runtime) |
| Process cleanup | tree-kill | latest | Kills the full process tree (child + all descendants) by PID. Essential because `claude` may itself spawn sub-processes; `process.kill()` leaves orphans. | `kill` npm package (no tree support on Windows), manual recursive kill (error-prone) |
| JSON write safety | write-atomic | latest | Atomic write-then-rename prevents corrupt config files if the server crashes mid-write. | `fs.writeFileSync` direct (risks truncated/empty JSON on crash) |
| Frontend bundler | Vite | 5.x | Sub-second HMR, native ESM, production build with minimal config. | Create React App (deprecated), Webpack (verbose config for this scale) |
| UI framework | React | 18 | Concurrent rendering, hooks-based state, mature ecosystem. | Vue 3 (viable but team familiarity drives choice), Svelte (smaller ecosystem for complex terminal UIs) |
| Terminal renderer | xterm.js | 5.x | Industry standard for browser-based terminal emulation, used by VS Code, ttyd, wetty, and all surveyed web terminal tools. Native WebSocket data ingestion, ConPTY-compatible. | Terminalizer (no live PTY), terminal.js (abandoned), custom canvas (weeks of work) |
| Terminal addon | xterm-addon-fit | latest | Resizes xterm.js viewport to fill its container div automatically; triggers PTY resize via `pty.resize()`. Required for correct terminal dimensions. | Manual resize calculation (fragile) |
| Styling | Tailwind CSS | 3.x | Utility-first, no stylesheet conflicts with xterm.js canvas, rapid UI iteration. | CSS Modules (more verbose for component variants), plain CSS (no design system benefits) |
| YAML parsing | js-yaml | 4.x | Parse and serialize agent/skill YAML frontmatter. | gray-matter (wraps js-yaml, adds overhead not needed here), manual regex (fragile) |
| Markdown render | react-markdown | 9.x | Render job mode results (markdown from `claude -p --output-format json`) safely in the browser. | dangerouslySetInnerHTML (XSS risk), marked (no React integration) |
| Config persistence | JSON files in %APPDATA% | — | Simple, no database dependency, readable by users, writable atomically with write-atomic. Path: `%APPDATA%\ClaudeCodeManager\`. | SQLite (overkill for single-user), localStorage (frontend-only, lost on server restart) |

---

## Architecture Deep Dive

The application is a single Node.js process (started via `npm start`) that hosts three logical subsystems: an Express HTTP server (serving the Vite-built React SPA and REST API), a WebSocket server (co-hosted on the same HTTP server, upgraded at `/ws`), and a PTY manager (owning all active `node-pty` instances). There is no separate database process.

**Request flow — Terminal mode:** The React SPA loads and renders a project list fetched from `GET /api/projects`. The user selects a project, triggering a REST call to `POST /api/sessions` (body: `{ projectId }`). The server creates a new PTY session: it calls `pty.spawn("claude", [], { cwd: project.path, env: process.env })`, assigns a UUID session ID, stores `{ pty, buffer: RingBuffer, clients: new Set() }` in the global `sessions` Map, and returns the `sessionId`. The React client then opens a WebSocket connection to `ws://localhost:PORT/ws?sessionId=<uuid>`. The server's `connection` handler resolves the session, adds the socket to `session.clients`, replays the ring buffer to catch up any prior output, then wires `pty.onData → ws.send` for live streaming. Keyboard input travels the reverse path: `ws.on('message') → pty.write(data)`. When the user switches to a different project, the React client calls `ws.close()` on the current connection (removing it from session A's client set — PTY A stays alive) and opens a new WebSocket with session B's ID.

**Request flow — Job mode:** The user fills in a prompt text area and clicks "Run". The React client calls `POST /api/jobs` (body: `{ projectId, prompt, allowedTools?, maxTurns? }`). The server spawns a child process via `child_process.spawn("claude", ["-p", prompt, "--output-format", "stream-json", "--allowedTools", tools, "--max-turns", n], { cwd: project.path, stdio: ["pipe", "pipe", "pipe"] })`. Crucially, `stdin` is closed immediately after spawn (`child.stdin.end()`) to avoid the confirmed hang described in GitHub issue #7497. The server opens a WebSocket channel (or server-sent events channel) per job, streaming line-delimited JSON events from stdout to the browser as they arrive. When the child exits, the server parses the final event for `result` and sends a `done` message. The React frontend renders the `result` field as Markdown using react-markdown.

**PTY session persistence across browser disconnects:** A permanent `pty.onData` consumer runs from the moment of spawn, writing output into a `RingBuffer` (fixed-capacity circular buffer, ~100 KB per session). This is non-negotiable on Windows: ConPTY's output pipe blocks the child process if the read end is not continuously drained, regardless of whether a WebSocket client is connected. This reader is never removed. On reconnect, the ring buffer is replayed synchronously before live data begins streaming.

**Config and file management:** The Express API exposes CRUD endpoints for projects (`/api/projects`), agents (`/api/agents`), skills (`/api/skills`), and CLAUDE.md files (`/api/claudemd`). All reads/writes go through a FileManager service that validates paths (both the target file path and the containing directory must be under the expected base directory — no path traversal). YAML frontmatter is parsed with `js-yaml` for agent and skill files. Config (app-level project registry) is stored in `%APPDATA%\ClaudeCodeManager\config.json` and written only with `write-atomic` to prevent corruption.

**Component boundaries:** `SessionManager` owns the sessions Map and all node-pty interactions. `JobRunner` owns child_process spawning for job mode. `FileManager` owns all filesystem reads/writes (never lets callers pass raw paths). `ConfigStore` owns the app config JSON. The React SPA contains four primary views: Terminal (xterm.js panel), Jobs (prompt + streaming result), Entities (agent/skill/CLAUDE.md editors), and Projects (project list + registration/scaffold).

---

## Implementation Patterns

### PTY Session Persistence Across WebSocket Disconnects

- **Pattern:** Decouple PTY lifetime from WebSocket lifetime using a server-side `Map<sessionId, SessionRecord>`.
- **How to implement:** `SessionRecord = { pty: IPty, buffer: RingBuffer, clients: Set<WebSocket>, createdAt: Date, lastActivityAt: Date }`. The `pty.onData` handler writes to `buffer` and also broadcasts to all `clients` — it is wired once at spawn and never removed. WebSocket `close` handlers call `session.clients.delete(ws)` and nothing else. WebSocket `connection` handlers call `session.clients.add(ws)` then replay the ring buffer.
- **Why this approach:** It mirrors the architecture of ttyd (which makes kill-on-disconnect an opt-in flag, not the default), and it solves the Windows ConPTY pipe-fill deadlock by ensuring the pipe is always drained.
- **Pitfalls to avoid:** Never call `pty.kill()` in the WebSocket close handler. Never allow the output pipe to be unread even momentarily on Windows (start the permanent reader before any WebSocket is connected). Add an idle timeout (configurable, default 30 minutes of no reconnection) to call `pty.kill()` and delete the session, preventing unbounded memory growth from abandoned sessions.

### Windows ConPTY Output Pipe Drain

- **Pattern:** Permanent async reader loop per PTY, writing to a ring buffer.
- **How to implement:** `pty.onData((data) => { ringBuffer.push(data); session.clients.forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(data); }); })` — this runs from `pty.spawn()` to `pty.kill()` with no gaps.
- **Why this approach:** Microsoft documentation and Windows Terminal issue #15976 confirm that an unread ConPTY output pipe causes the child process to block on its next write syscall. This is the single biggest stability risk on Windows.
- **Pitfalls to avoid:** Do not conditionally start/stop the reader based on client count. Do not call `pty.destroy()` or `ClosePseudoConsole` while the output pipe has unread data (drain fully first). Explicitly call `pty.kill()` on process exit/SIGTERM for all active sessions — ConPTY leaves orphaned conhost processes without it.

### Job Mode Child Process Spawning

- **Pattern:** `child_process.spawn` with `--output-format stream-json`, stdin closed immediately.
- **How to implement:**
  ```js
  const child = spawn("claude", [
    "-p", prompt,
    "--output-format", "stream-json",
    "--allowedTools", allowedTools,
    "--max-turns", String(maxTurns),
    "--no-session-persistence"
  ], { cwd: project.path, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(); // CRITICAL — close stdin immediately to prevent hang (issue #7497)
  ```
  Read from `child.stdout` line by line (using the `readline` module or `split2`). Parse each line as JSON. Forward each event over a per-job WebSocket or SSE stream. On `child.on('close')`, extract the `result` field from the final `stream-json` event and send a `done` event to the browser.
- **Why this approach:** `spawn` (not `exec`) avoids the 200 KB stdout buffer cap that would truncate large Claude responses. `stream-json` provides live progress updates without waiting for the full response. Closing stdin immediately is mandatory — GitHub issue #7497 confirms the process hangs indefinitely otherwise.
- **Pitfalls to avoid:** Never use `exec` or `execSync` for job mode (buffer cap). Never leave stdin open. Set `--max-turns` to prevent runaway agentic loops. Use `--no-session-persistence` for ephemeral jobs to avoid cluttering session history. Kill the child process via `tree-kill(child.pid)` if the user cancels — `child.kill()` alone may leave claude's sub-processes alive.

### Session Switching in the Browser

- **Pattern:** Client-initiated WebSocket reconnect with a different session ID.
- **How to implement:** When the user clicks a different project in the sidebar, the React client: (1) calls `currentWs.close()` (triggers server-side `clients.delete(ws)` — PTY A stays alive), (2) navigates to the new project's terminal view, (3) opens `new WebSocket(\`ws://localhost:PORT/ws?sessionId=${sessionB}\`)`. The xterm.js instance is cleared with `terminal.clear()` and the replayed buffer for session B is written into it.
- **Why this approach:** Both PTY processes remain alive; only socket routing changes. This is zero-overhead switching — no process creation or destruction.
- **Pitfalls to avoid:** Clear the xterm.js buffer before replaying the new session's ring buffer to avoid visual corruption. Validate that the new sessionId exists server-side before completing the switch (return WebSocket close code 4004 if not found). Do not re-use the same xterm.js `Terminal` instance across sessions without a `terminal.reset()` — escape sequences from session A can corrupt session B's rendering.

### xterm.js Viewport Resize Synchronization

- **Pattern:** xterm-addon-fit + `ResizeObserver` → `pty.resize()`.
- **How to implement:** Mount a `ResizeObserver` on the terminal container div. In its callback, call `fitAddon.fit()` which resizes xterm.js to the container. Then read `terminal.cols` and `terminal.rows` and call `pty.resize(cols, rows)` via a WebSocket control message (type: `resize`). The server's message handler applies `session.pty.resize(cols, rows)`.
- **Why this approach:** ConPTY must be kept in sync with the terminal emulator's viewport or line wrapping and cursor positioning break.
- **Pitfalls to avoid:** Debounce resize events (100 ms) to avoid flooding the server. Always resize the PTY after the xterm.js resize completes, not before.

### Config File YAML Frontmatter Editing

- **Pattern:** Parse with `js-yaml`, edit in-memory, serialize back to file preserving the Markdown body.
- **How to implement:** Split the file content on the `---` frontmatter delimiter (regex: `/^---\n([\s\S]*?)\n---\n([\s\S]*)$/m`). Parse the frontmatter block with `yaml.load()`. Apply edits. Re-serialize with `yaml.dump()`. Reconstruct the full file as `---\n${frontmatter}---\n${body}`. Write atomically with `write-atomic`.
- **Why this approach:** js-yaml is the most widely used YAML library in Node.js and handles all valid YAML produced by Claude Code's own tooling.
- **Pitfalls to avoid:** Different frontmatter schemas apply to agent files vs. skill files — validate with separate schemas. Skills with the `$ARGUMENTS` placeholder in the body must not have the body modified by the editor when only frontmatter is changing. Warn users that agent changes require a session restart to take effect (agents are loaded at session start); skill changes are detected live by Claude Code.

---

## Claude Code File Formats Reference

This reference section documents every file type the app must read, write, and validate. All paths shown use Windows conventions; `~` resolves to `C:\Users\<username>`.

### Agent Definition Files

**Locations (highest priority first):**
- `.claude/agents/<name>.md` — project-scoped
- `~/.claude/agents/<name>.md` — user-scoped (global, all projects)
- Windows path: `C:\Users\<username>\.claude\agents\<name>.md`

**Format:** Markdown file with YAML frontmatter block.

**Frontmatter fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | YES | string | Lowercase letters and hyphens. Unique identifier. This is the agent's callable name. |
| `description` | YES | string | When Claude should delegate to this agent. Used for automatic routing. |
| `tools` | No | string (comma-separated) | Allowlist of tools. If omitted, agent inherits all tools. |
| `disallowedTools` | No | string (comma-separated) | Tools removed from the inherited set. |
| `model` | No | string | `sonnet`, `opus`, `haiku`, a full model ID, or `inherit`. Default: `inherit`. |
| `permissionMode` | No | string | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, or `plan`. |
| `maxTurns` | No | integer | Maximum agentic turns before the agent stops. |
| `skills` | No | list | Skill names to preload into the agent's context at startup. |
| `mcpServers` | No | object | MCP servers available to this agent. |
| `hooks` | No | object | Lifecycle hooks scoped to this agent. |
| `memory` | No | string | Persistent memory scope: `user`, `project`, or `local`. |
| `background` | No | boolean | `true` = always run as a background task. Default: `false`. |
| `isolation` | No | string | `worktree` = run in an isolated git worktree. |

**Minimal valid example:**
```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a senior code reviewer. Analyze code and provide feedback on quality,
security, and best practices.
```

**Important behavioral note:** Agents are loaded at session start. After the app saves a new or edited agent file, it must display a warning: "Restart the Claude session for this agent to take effect."

---

### Skill / Slash Command Files

**Locations:**
- `~/.claude/skills/<skill-name>/SKILL.md` — user-scoped (recommended, current format)
- `.claude/skills/<skill-name>/SKILL.md` — project-scoped (recommended, current format)
- `~/.claude/commands/<name>.md` — legacy personal commands (still supported)
- `.claude/commands/<name>.md` — legacy project commands (still supported)
- Windows path: `C:\Users\<username>\.claude\skills\<skill-name>\SKILL.md`

**Important:** The directory name determines the slash command name, not the `name` frontmatter field. Each skill directory may contain optional supporting files (templates, example inputs, helper scripts).

**Frontmatter fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | No | string | Display name override. Defaults to directory name. Lowercase, hyphens, max 64 chars. |
| `description` | Recommended | string | What the skill does. Claude uses this for auto-invocation decisions. |
| `argument-hint` | No | string | Autocomplete hint shown in the `/` menu (e.g., `[issue-number]`). |
| `disable-model-invocation` | No | boolean | `true` = user must invoke manually; Claude won't auto-load. Default: `false`. |
| `user-invocable` | No | boolean | `false` = hidden from `/` menu; only Claude can invoke it. Default: `true`. |
| `allowed-tools` | No | string | Tools usable without per-use approval when this skill is active. |
| `model` | No | string | Model override when this skill is active. |
| `context` | No | string | `fork` = run in an isolated subagent context. |
| `agent` | No | string | Which subagent type to use when `context: fork` is set. |
| `hooks` | No | object | Hooks scoped to this skill's lifecycle. |

**Argument injection:**
- `$ARGUMENTS` — replaced with everything after the skill name when invoked.
- `$ARGUMENTS[N]` or `$N` — individual positional arguments.
- `!`shell-command`` — dynamic context injection: runs a shell command and injects its stdout inline before sending to Claude.

**Minimal valid example (`~/.claude/skills/fix-issue/SKILL.md`):**
```markdown
---
name: fix-issue
description: Fix a GitHub issue by number
disable-model-invocation: true
---

Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue description
2. Understand the requirements
3. Implement the fix
4. Write tests
5. Create a commit
```

**Behavioral note:** Skill changes are detected live by Claude Code — no session restart required.

---

### CLAUDE.md

**Format:** Plain Markdown file. No required structure or frontmatter. The full content is injected into Claude's system prompt at session start.

**Locations (all loaded simultaneously; more-specific paths take precedence):**

| Scope | Path |
|-------|------|
| User (global) | `~/.claude/CLAUDE.md` = `C:\Users\<username>\.claude\CLAUDE.md` |
| Project root | `<project-root>/CLAUDE.md` |
| Project .claude dir | `<project-root>/.claude/CLAUDE.md` |
| Parent directories | Scanned up the directory tree (monorepo support) |

**Practical constraints:**
- Recommended maximum: 300 lines. Claude Code's own system prompt consumes context, and CLAUDE.md content competes for the same context window.
- Skill descriptions are loaded separately (budget: 2% of context window, fallback 16,000 characters).
- There are no required sections. Common conventions include: project description and stack, directory layout, coding standards, common bash commands, testing instructions, project-specific warnings.

**The app must handle:** Reading and writing CLAUDE.md files for both global scope (`~/.claude/CLAUDE.md`) and project scope (`<project>/.claude/CLAUDE.md` or `<project>/CLAUDE.md`). An editor with a line count warning at 300 lines is recommended.

---

### settings.json

**Locations and precedence (highest to lowest):**

| Scope | Path | Notes |
|-------|------|-------|
| Managed (enterprise) | `C:\Program Files\ClaudeCode\managed-settings.json` | Cannot be overridden. |
| Windows registry | `HKLM\SOFTWARE\Policies\ClaudeCode` (value: `Settings`) | Group Policy / Intune. |
| User | `C:\Users\<username>\.claude\settings.json` | Applies to all projects. |
| Project (shared) | `<project>\.claude\settings.json` | Committed to version control. |
| Project (local) | `<project>\.claude\settings.local.json` | Gitignored automatically. |

**Precedence order:** Managed > CLI args > Local > Project > User

**Key fields:**

| Key | Type | Description |
|-----|------|-------------|
| `permissions.allow` | array | Tool permission patterns to auto-allow. |
| `permissions.deny` | array | Tool permission patterns to block. |
| `env` | object | Environment variables set for every session. |
| `model` | string | Override default model (e.g., `"claude-sonnet-4-6"`). |
| `hooks` | object | Lifecycle hook configurations. |
| `cleanupPeriodDays` | integer | Days before inactive sessions are deleted (default: 30). |
| `apiKeyHelper` | string | Script to generate auth value dynamically. |
| `includeCoAuthoredBy` | boolean | Whether to include co-authored-by in git commits. |
| `language` | string | Claude's preferred response language. |
| `effortLevel` | string | `"low"`, `"medium"`, or `"high"`. |
| `alwaysThinkingEnabled` | boolean | Enable extended thinking by default. |

**JSON Schema for validation:** `https://json.schemastore.org/claude-code-settings.json` — validate before writing.

---

### Other Config Files

| File | Path | Purpose |
|------|------|---------|
| `~/.claude.json` | `C:\Users\<username>\.claude.json` | Preferences (theme, OAuth session, MCP configs, per-project tool trust, session state). |
| `.mcp.json` | `<project-root>/.mcp.json` | Project-scoped MCP server definitions. |
| Agent memory (user) | `~/.claude/agent-memory/<agent-name>/` | Persistent agent memory (when `memory: user` set). |
| Agent memory (project) | `.claude/agent-memory/<agent-name>/` | Persistent agent memory (project scope). |
| Agent memory (local) | `.claude/agent-memory-local/<agent-name>/` | Persistent agent memory (local, not committed). |

---

## Security & Compliance Requirements

These 10 requirements are mandatory. None are optional for v1.

1. **Bind to 127.0.0.1 only.** The Express and WebSocket server must never bind to `0.0.0.0`. Use `server.listen(PORT, "127.0.0.1")`. This prevents any network access from outside the local machine.

2. **No `shell: true` in child_process calls.** Both PTY spawns (`node-pty`) and job mode spawns (`child_process.spawn`) must pass arguments as an array, never as a shell string. `shell: true` opens arbitrary command injection via crafted project paths or prompts.

3. **Working directory path validation.** Before spawning any PTY or job process with `cwd: project.path`, validate that `project.path` is an absolute path pointing to an existing directory that the Node.js process can access. Reject paths containing `..` components or null bytes. Do not allow the user to register a path outside their filesystem (e.g., network UNC paths) without explicit acknowledgment.

4. **File write path validation.** The FileManager service must verify that every file write target resolves within the expected base directory (either `%APPDATA%\ClaudeCodeManager\`, `~/.claude/`, or a registered project path). Use `path.resolve()` and assert that the result starts with the expected prefix. Never trust raw paths from API request bodies.

5. **WebSocket message size caps and backpressure.** Set a maximum inbound message size on the WebSocket server (e.g., 1 MB: `new WebSocketServer({ maxPayload: 1024 * 1024 })`). Check `ws.bufferedAmount` before sending; if it exceeds a threshold (e.g., 256 KB), pause the PTY output read loop rather than enqueuing unboundedly. This prevents memory exhaustion if a client's download speed cannot keep up.

6. **CSRF protection on mutating REST endpoints.** All `POST`, `PUT`, `PATCH`, and `DELETE` endpoints must require a custom request header (e.g., `X-Requested-With: ClaudeCodeManager`). The Express middleware checks for this header and rejects requests that lack it. This is sufficient for localhost-only apps where cross-origin requests are blocked by the browser's CORS preflight.

7. **Security headers via helmet.** Apply `helmet()` middleware to all Express responses. This sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` (restrict script sources to self), and removes `X-Powered-By`.

8. **No sensitive data in logs.** The application must never log: API keys, OAuth tokens from `~/.claude.json`, full prompt content from job mode, or full file content from CLAUDE.md/agent/skill files. Log only: session IDs, project IDs, process PIDs, exit codes, and error messages.

9. **PTY process lifecycle management.** Register `process.on('exit')`, `process.on('SIGTERM')`, and `process.on('SIGINT')` handlers that iterate the sessions Map and call `pty.kill()` on every active PTY. Without this, ConPTY leaves orphaned `conhost.exe` processes on Windows. Also implement a configurable idle timeout (default: 30 minutes) that kills sessions with no connected clients and no recent output.

10. **`npm audit` in CI.** Run `npm audit --audit-level=high` as a required step in any CI pipeline or pre-release checklist. The node-pty and ws ecosystems receive periodic CVEs; catching them before release is mandatory.

---

## Reference Implementations

These tools should be studied before implementing the corresponding subsystem.

| Tool | What to reference | URL |
|------|-------------------|-----|
| ttyd | PTY persistence architecture (kill-on-disconnect is opt-in, not default); reconnect flag; WebSocket framing | https://github.com/tsl0922/ttyd |
| wetty | Node.js + PTY + WebSocket + xterm.js integration pattern | https://github.com/butlerx/wetty |
| GoTTY | Alternative reference for session multiplexing | https://github.com/yudai/gotty |
| node-pty | Official API, Windows ConPTY notes, thread-safety warnings | https://github.com/microsoft/node-pty |
| xterm.js | Terminal renderer API, addons (fit, web-links), attachment patterns | https://github.com/xtermjs/xterm.js |
| ClaudeCodeUI (siteboon) | Closest existing competitor; study session management approach | https://github.com/siteboon/claudecodeui |
| claude-code-webui (sugyan) | Streaming job mode approach; React + WebSocket patterns | https://github.com/sugyan/claude-code-webui |
| write-atomic | Atomic file write pattern | https://github.com/npm/write-file-atomic |

---

## Per-Agent Guidance

### For Architect

- The server process is a single Node.js process (no worker threads — node-pty is not thread-safe). All PTY operations stay on the main thread.
- Design `SessionManager` as the sole owner of the sessions `Map`. No other module may call `pty.spawn()` or `pty.kill()` directly.
- Design `FileManager` as the sole owner of all filesystem reads/writes. All path validation lives here.
- The WebSocket server upgrades at `/ws?sessionId=<uuid>` for terminal sessions and `/ws/jobs?jobId=<uuid>` for job mode streaming (or use server-sent events for jobs — SSE is simpler for unidirectional streaming).
- The ring buffer implementation must be a true circular buffer (fixed memory allocation) to avoid unbounded memory growth. Cap at 100 KB per session.
- Plan for an idle timeout sweeper: a `setInterval` loop (runs every 5 minutes) that checks `lastActivityAt` on each session and kills sessions idle beyond the configured threshold.
- Session IDs must be UUIDs (use the `uuid` npm package, v4). Never use sequential integers — they are guessable.
- The REST API must be versioned from the start (`/api/v1/...`) to avoid breaking the frontend if the API evolves.

### For Backend Dev

- **PTY spawn invocation:** `pty.spawn("claude", [], { name: "xterm-color", cols: 80, rows: 24, cwd: project.path, env: { ...process.env } })`. Always pass explicit `cols` and `rows`; ConPTY uses these immediately.
- **Job mode invocation:** `child_process.spawn("claude", ["-p", prompt, "--output-format", "stream-json", "--allowedTools", tools, "--max-turns", String(maxTurns), "--no-session-persistence"], { cwd: project.path, stdio: ["pipe", "pipe", "pipe"] })`. Call `child.stdin.end()` immediately after spawn (GitHub issue #7497 — otherwise hangs indefinitely).
- **YAML frontmatter parsing:** Split on `/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/` — note `\r?\n` for Windows line endings. Use `js-yaml` for parse and dump.
- **Config path on Windows:** Use `process.env.APPDATA` (resolves to `C:\Users\<username>\AppData\Roaming`) as the base for `ClaudeCodeManager/config.json`. Fall back to `os.homedir()` if `APPDATA` is unset.
- **Process cleanup:** Register exit handlers for `SIGTERM`, `SIGINT`, and `exit`. For each session in the map, call `pty.kill()`. Use `tree-kill` (not `process.kill`) for job mode child processes.
- **Resize protocol:** Accept WebSocket messages of type `{ type: "resize", cols: N, rows: N }` and call `session.pty.resize(cols, rows)`.
- **Sessions endpoint shape:** `POST /api/v1/sessions` returns `{ sessionId, projectId, createdAt }`. `GET /api/v1/sessions` returns all active sessions. `DELETE /api/v1/sessions/:id` calls `pty.kill()` and removes from Map.

### For Frontend Dev

- **xterm.js initialization:** Create one `Terminal` instance per session view. Use `xterm-addon-fit` for automatic sizing. Wire a `ResizeObserver` on the container div that calls `fitAddon.fit()` then sends a resize WebSocket message.
- **WebSocket connection URL:** `ws://127.0.0.1:${PORT}/ws?sessionId=${sessionId}`.
- **Session switching UX:** Maintain a session registry in React state (`Map<sessionId, { ws, terminal, status }>`). On project tab click, call `currentWs.close()`, clear the xterm.js terminal (`terminal.clear()` then `terminal.reset()`), open a new WebSocket, replay the ring buffer into the terminal. Do not destroy the `Terminal` instance — reuse it.
- **Job mode result rendering:** Parse the `result` field from the final job event (a Markdown string). Render with `react-markdown` + `remark-gfm` for table and code block support. Display a streaming indicator while the job is running (token-level updates from `stream-json` events can be accumulated and shown in a text area or a simplified markdown preview).
- **Agent/skill editor:** A form-based editor for YAML frontmatter fields (one input per known field). The Markdown body below the frontmatter gets a plain textarea or a CodeMirror instance. On save, POST to `/api/v1/agents/:id` or `/api/v1/skills/:id`. Display the "restart required for agents" warning after saving an agent.
- **Project scaffold:** When the user chooses "New project", show a dialog for project name and directory path. POST to `/api/v1/projects/scaffold` — the server creates `<path>/.claude/` and `<path>/.claude/CLAUDE.md` with a starter template. After creation, register the project in the config store.
- **Error handling:** All WebSocket close events with codes `4004` (session not found) or `4001` (unauthorized) must surface a clear error message in the UI, not silently fail.

### For QA Tester

- **Critical path 1 — PTY persistence:** Open a project terminal, run a long command, close the browser tab (or navigate away from the terminal view), wait 10 seconds, return. Verify the command completed and its output is present in the terminal after reconnect. Verify the PTY process did not die.
- **Critical path 2 — Session switching:** Open two projects simultaneously. Type into terminal A. Switch to terminal B, type into it. Switch back to A. Verify both terminals show the correct independent output and both Claude processes are alive.
- **Critical path 3 — Job mode hang prevention:** Submit a job. Verify it starts and completes (does not hang indefinitely). Verify the server does not become unresponsive after the job completes.
- **Critical path 4 — Orphan process cleanup:** Kill the Node.js server (Ctrl+C) while two PTY sessions are active. Verify no `conhost.exe` or `claude.exe` processes remain in Task Manager.
- **Critical path 5 — File write validation:** Attempt to save an agent file with a path traversal (`name: "../../evil"`) via a crafted API request. Verify the server returns 400 and writes no file outside the expected directory.
- **Critical path 6 — Job cancellation:** Start a long job, click "Cancel" before it completes. Verify the `claude.exe` child process and any sub-processes are terminated (check Task Manager). Verify the server accepts new jobs after cancellation.
- **Regression suite:** After any change to `SessionManager`, re-run all PTY persistence and session-switching tests. After any change to `FileManager`, re-run all path validation tests.

### For Security Agent

- Before v1 release: run `npm audit --audit-level=high` and resolve all high/critical findings.
- Verify binding: `netstat -an | findstr LISTENING` must show the app port bound only to `127.0.0.1`, not `0.0.0.0`.
- Verify no shell injection: audit every call to `child_process.spawn` and `pty.spawn` to confirm arguments are passed as arrays, never as strings with `shell: true`.
- Verify path traversal protection: send API requests with body `{ "path": "../../etc/passwd" }` and `{ "name": "../../../evil" }` to all file-write endpoints. Verify all return 400.
- Verify CSRF header: send a `POST /api/v1/sessions` without the `X-Requested-With` header from a `<form>` (simulating a cross-site request). Verify rejection.
- Verify log cleanliness: run a job with a prompt containing a fake API key string. Scan the server log output to confirm the key string does not appear.
- Check `Content-Security-Policy` header on HTML responses to confirm it restricts external script sources.
- Review `~/.claude.json` read path in the app: confirm the app does not log or expose the OAuth token stored in that file.

---

## Open Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| node-pty Windows build failure on user machines without MSVC Build Tools | HIGH | HIGH | Use `node-pty-prebuilt-multiarch` which ships prebuilt binaries for common Node.js + Windows combinations. Document the MSVC fallback in the README. Test the install on a clean Windows 11 machine before release. |
| ConPTY pipe deadlock if output reader is paused or skipped | HIGH | MEDIUM | Enforce the permanent reader pattern (never conditionally remove the `pty.onData` handler). Add integration test for the "browser disconnected, PTY still running" scenario. |
| Claude CLI breaking change in `-p` / `--output-format` flags | MEDIUM | LOW-MEDIUM | Pin the Claude Code CLI version in documentation (advise users to update manually). Wrap the job runner in a version-check at startup that calls `claude --version` and warns if below the tested version. |
| Process orphan leak on server crash (before exit handlers fire) | MEDIUM | MEDIUM | Document that on abnormal server termination, the user may need to manually kill `claude.exe` processes. Consider writing active PIDs to a lock file at `%APPDATA%\ClaudeCodeManager\active_pids.json` on each spawn; on startup, check for stale PIDs and kill them. |
| Memory growth from large ring buffers across many sessions | LOW-MEDIUM | LOW (single user, <20 sessions) | Cap ring buffer at 100 KB per session. Implement the idle timeout sweeper. Surface active session count in the UI. |
| `ClosePseudoConsole` deadlock on Windows 11 pre-24H2 | LOW | LOW | Always drain the ring buffer fully before calling `pty.kill()`. Document the minimum supported Windows version as Windows 11 23H2 or later. |
| claude-code-webui or ClaudeCodeUI ship a competing feature before release | LOW | LOW | Not a technical risk; noted for awareness. Ship MVP fast. |

---

## All Sources

### Claude CLI Headless / Job Mode (Researcher A)
- Claude Code Headless/Programmatic Docs (official): https://code.claude.com/docs/en/headless
- Claude Code CLI Reference (official, full flag list): https://code.claude.com/docs/en/cli-reference
- GitHub issue #7497 — Process Hangs Indefinitely When Reading InputStream from Claude Code Headless Execution: https://github.com/anthropics/claude-code/issues/7497
- SFEIR Institute — Headless Mode and CI/CD Cheatsheet: https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/cheatsheet/
- CI/CD and Headless Mode with Claude Code (angelo-lima.fr): https://angelo-lima.fr/en/claude-code/claude-code-cicd-headless-en/
- claude-code-webui (sugyan) GitHub: https://github.com/sugyan/claude-code-webui
- ClaudeCodeUI / CloudCLI (siteboon) GitHub: https://github.com/siteboon/claudecodeui

### PTY Session Persistence — Windows (Researcher B)
- node-pty GitHub repository (microsoft/node-pty): https://github.com/microsoft/node-pty
- Creating a Pseudoconsole Session — Windows Console (Microsoft Learn): https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session
- ttyd — Share your terminal over the web (tsl0922/ttyd): https://github.com/tsl0922/ttyd
- ttyd project homepage: https://tsl0922.github.io/ttyd/
- GoTTY — Share your terminal as a web application (yudai/gotty): https://github.com/yudai/gotty
- ConPTY megathread: buffer gets out-of-sync (microsoft/terminal #15976): https://github.com/microsoft/terminal/issues/15976
- ConPTY hangs on ClosePseudoConsole (microsoft/terminal discussion #17716): https://github.com/microsoft/terminal/discussions/17716
- ConPTY should support overlapped I/O (microsoft/terminal #262): https://github.com/microsoft/terminal/issues/262
- Node won't exit after connecting PTY (microsoft/node-pty #413): https://github.com/microsoft/node-pty/issues/413
- WebSocket Reconnection: State Sync and Recovery Guide (websocket.org): https://websocket.org/guides/reconnection/
- Windows Command Line: Introducing the Windows Pseudo Console (ConPTY): https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/

### Claude Code File Formats (Researcher C)
- Create custom subagents — Claude Code Docs: https://code.claude.com/docs/en/sub-agents
- Extend Claude with skills — Claude Code Docs: https://code.claude.com/docs/en/skills
- Claude Code settings — Claude Code Docs: https://code.claude.com/docs/en/settings
- Using CLAUDE.md files — Anthropic Blog: https://claude.com/blog/using-claude-md-files
- Claude Code settings.json: Complete config guide (2026): https://www.eesel.ai/blog/settings-json-claude-code
- Claude Code Configuration Files: Complete Guide — Inventive HQ: https://inventivehq.com/knowledge-base/claude/where-configuration-files-are-stored
- JSON Schema for settings.json: https://json.schemastore.org/claude-code-settings.json

### Multi-Session PTY Node.js (Researcher D)
- Efficient and Scalable Usage of Node.js PTY with Socket.io for Multiple Users: https://medium.com/@deysouvik700/efficient-and-scalable-usage-of-node-js-pty-with-socket-io-for-multiple-users-402851075c4a
- Creating A Browser-based Interactive Terminal (Using XtermJS And NodeJS): https://www.eddymens.com/blog/creating-a-browser-based-interactive-terminal-using-xtermjs-and-nodejs
- How to Create Web-Based Terminals (DEV Community): https://dev.to/saisandeepvaddi/how-to-create-web-based-terminals-38d
- Web Terminal with Xterm.JS, node-pty and WebSockets: https://ashishpoudel.substack.com/p/web-terminal-with-xtermjs-node-pty
- microsoft/node-pty — Fork pseudoterminals in Node.JS: https://github.com/microsoft/node-pty
- xterm.js issue #677 — Reconnect with same PWD: https://github.com/xtermjs/xterm.js/issues/677
- xterm.js issue #1301 — demo application and websocket heartbeats: https://github.com/xtermjs/xterm.js/issues/1301
- tsl0922/ttyd — Share your terminal over the web: https://github.com/tsl0922/ttyd
- Node.js Memory Limits — What You Should Know (AppSignal): https://blog.appsignal.com/2021/12/08/nodejs-memory-limits-what-you-should-know.html
