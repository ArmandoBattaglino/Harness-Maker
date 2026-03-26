# Claude Code Visual Manager

A locally-hosted web application that provides a graphical interface for the Claude Code CLI. Run Claude Code sessions in a live browser terminal, submit background jobs, and manage your agents, skills, and CLAUDE.md files — all from a single-command launch.

---

## Prerequisites

- **Node.js 20 LTS** or later — required for `node-pty` prebuilt binary compatibility
- **Claude Code CLI** installed and accessible on your system PATH (or configured via `CLAUDE_BINARY_PATH`)
- **Windows 11** (primary supported platform, 23H2 or later recommended); macOS and Linux are functionally supported but not the primary test target

---

## Installation

```bash
git clone <repository-url> claude-code-visual-manager
cd claude-code-visual-manager
npm run install:all
```

The `install:all` script installs dependencies for the root, server, and client packages in one step.

---

## Running

```bash
npm start
```

This command:
1. Builds the React client via Vite (output lands in `server/public/`)
2. Starts the Express server
3. Automatically opens `http://127.0.0.1:3000` in your default browser

The server binds exclusively to `127.0.0.1` — it is never accessible from the network.

---

## Features

| Feature | Description |
|---------|-------------|
| **Project Dashboard** | Card-based overview of all registered projects with status indicators, quick actions (open terminal, delete), and project registration. Default landing view. |
| **Live Terminal Hub** | Full xterm.js terminal connected to a real Claude Code process over WebSocket. Resizes with the browser window. |
| **Session Persistence** | PTY sessions survive browser tab closures. A 100 KB ring buffer replays recent output on reconnect. |
| **Multi-Project Support** | Register multiple projects and run simultaneous Claude Code sessions — at least 5 concurrent without instability. |
| **Job Runner** | Submit a prompt as a background job. Streaming progress arrives via SSE; finished output renders as formatted Markdown. |
| **Deployment Manager** | Unified management for agents and skills. Profiles tab for CRUD on `.claude/agents/` YAML files, Active Processes tab for running sessions, and Environment tab for skills across all four scan locations. |
| **Context Editor** | Rule-based editor for CLAUDE.md files with syntax-highlighted preview, section management, and line count warnings. Supports both user-scope and project-scope files. |
| **Project Registration** | Register existing directories or scaffold a new `.claude/` structure (agents, commands, CLAUDE.md) from the UI. |
| **Auto-Open Browser** | Server opens the app URL in the default browser on every `npm start`. Set `NO_OPEN=1` to suppress. |
| **Redesigned UI** | Phase 9 design system with Inter/JetBrains Mono fonts, Material Symbols icons, purple (#933df5) accent on dark background, and 5-view sidebar navigation. |

---

## Configuration

All configuration is via environment variables set before running `npm start`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port. Server always binds to `127.0.0.1`. |
| `IDLE_TIMEOUT_MINUTES` | `30` | Minutes of inactivity before an idle PTY session is automatically killed. |
| `CLAUDE_BINARY_PATH` | auto-detected | Override path to the `claude` binary. If unset, the server checks PATH then `%LOCALAPPDATA%\AnthropicClaude\claude.exe`. |
| `NO_OPEN` | unset | Set to any non-empty value to prevent the browser from opening automatically on startup. Useful for CI or headless environments. |

**Example — custom port and binary path:**

```bash
PORT=8080 CLAUDE_BINARY_PATH="C:\tools\claude.exe" npm start
```

Application config (project registry) is stored at `%APPDATA%\ClaudeCodeManager\config.json` on Windows, or `~/.claudecodemanager/config.json` as a fallback.

---

## Troubleshooting

### 1. App won't start

**Symptoms:** `npm start` exits immediately or throws a module error.

**Steps:**
1. Confirm Node.js version is 20 LTS or later: `node --version`
2. Re-run the full install: `npm run install:all`
3. If `node-pty` fails to load, ensure you are on a supported Node.js version — the prebuilt binary must match your Node.js ABI version.

---

### 2. "claude binary not found" at startup

**Symptoms:** Server logs `[FATAL] Claude binary not found` and exits.

**Steps:**
1. Confirm the Claude Code CLI is installed: run `claude --version` in a terminal.
2. If the binary exists but is not on PATH, set the environment variable:
   ```bash
   CLAUDE_BINARY_PATH="C:\path\to\claude.exe" npm start
   ```
3. On Windows, the default install location is `%LOCALAPPDATA%\AnthropicClaude\claude.exe`. Verify it exists there.

---

### 3. Terminal not connecting

**Symptoms:** The terminal panel shows "Connecting..." indefinitely or displays a WebSocket error.

**Steps:**
1. The terminal uses a WebSocket connection to the same host and port as the app. Check that nothing is blocking WebSocket traffic to `127.0.0.1`.
2. Some security software or browser extensions intercept WebSocket upgrade requests. Try disabling extensions or using a private browsing window.
3. Confirm the server is still running — check the terminal where you ran `npm start`.
4. Reload the page. On reconnect, the ring buffer replays the last 100 KB of terminal output.

---

### 4. Session lost after tab switch or browser close

**Symptoms:** Switching back to a previously open project tab shows a blank or disconnected terminal.

**Expected behavior:** The PTY session continues running in the background while the browser is closed or on a different tab. When you switch back, the app reconnects automatically and replays buffered output. The session is only destroyed if it has been idle for longer than `IDLE_TIMEOUT_MINUTES` (default: 30 minutes), or if the server was restarted.

If the session is gone, start a new terminal from the project view.

---

### 5. Jobs hanging or never completing

**Symptoms:** A submitted job stays in "running" state indefinitely.

**Steps:**
1. Jobs have a maximum runtime enforced by the Claude Code CLI's own timeout. If a job runs longer than expected, use the "Cancel" button in the Job Mode UI to terminate it.
2. The server will cancel all running jobs automatically on shutdown (SIGTERM / SIGINT).
3. If the Cancel button does not respond, restart the server (`Ctrl+C` in the terminal, then `npm start`). The server kills all child processes on shutdown, including orphaned Claude sub-processes.

---

## Security

- **Localhost only.** The server binds to `127.0.0.1` and is never accessible from the local network or internet.
- **CSRF protection.** All mutating API requests require the `X-Requested-With: ClaudeCodeManager` header. The React client sends this automatically; cross-origin pages cannot set it.
- **No shell injection.** All process spawns use `shell: false` with argument arrays — user input is never interpolated into a shell command string.
- **Atomic file writes.** All config, agent, skill, and CLAUDE.md writes use `write-file-atomic` to prevent file corruption on crash.
- **Path traversal protection.** All file write paths are resolved and validated against their expected base directory before any write is performed.
- **Security headers.** Helmet provides CSP, `X-Content-Type-Options`, `X-Frame-Options`, and related headers on every response.
- **Rate limiting.** API routes are limited to 200 requests per minute per IP to guard against runaway client loops.

---

## Known Limitations (v1)

- **No authentication.** The app relies on network isolation (localhost-only binding) rather than user authentication. Do not change the bind address.
- **Windows primary.** The PTY layer targets Windows 11 with ConPTY. macOS and Linux work but are not the primary test target.
- **No job history persistence.** Completed job results are held in memory and lost on server restart. Persistence is planned for v1.1.
- **No settings.json editor.** The Claude Code `settings.json` file is readable but not editable via the UI. Planned for v1.1.
- **No git integration.** No commit, diff, or branch management UI. Out of scope for v1.
- **No MCP server editor.** MCP server configuration is display-only. Out of scope for v1.

---

## License

Private — see `package.json`.
