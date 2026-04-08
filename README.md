# Claude Code Visual Manager

**Current Version: v9.0.0** - V9.0 Stream-JSON migration closed, 478/478 server tests passing. Root/client build clean at 500 modules.

A locally-hosted web application that provides a graphical interface for the Claude Code CLI. Run Claude Code sessions in a live browser terminal, submit background jobs, design multi-agent workflows, and manage agents, skills, and `CLAUDE.md` files from one app.

---

## Prerequisites

- **Node.js 20 LTS** or later - required for `node-pty` compatibility
- **Claude Code CLI** installed and available on PATH, or configured via `CLAUDE_BINARY_PATH`
- **Windows 11** is the primary tested platform; macOS and Linux are functionally supported but not the main target

---

## Installation

```bash
git clone <repository-url> claude-code-visual-manager
cd claude-code-visual-manager
npm run install:all
```

The `install:all` script installs dependencies for the root, server, and client packages.

---

## Running

```bash
npm start
```

This command:
1. Builds the React client with Vite into `server/public/`
2. Starts the Express server
3. Opens `http://127.0.0.1:3000` in your default browser unless `NO_OPEN=1` is set

The server binds exclusively to `127.0.0.1`.

---

## Features

| Feature | Description |
|---------|-------------|
| **Project Dashboard** | Register projects, inspect status, and launch terminal sessions from a single landing view. |
| **Live Terminal Hub** | Full xterm.js terminal connected to a real CLI PTY over WebSocket. |
| **Session Persistence** | PTY sessions survive browser tab closures through ring-buffer replay. |
| **Job Runner** | Submit one-shot prompts and stream structured progress/results. |
| **Deployment Manager** | CRUD for agents and skills plus runtime/environment inspection. |
| **Context Editor** | Edit and preview `CLAUDE.md` content for user and project scopes. |
| **Swarm Orchestrator** | Visual multi-agent canvas backed by `@xyflow/react`. |
| **Prompt-to-Flow** | Generate workflow graphs from natural-language prompts. |
| **Hybrid Provider Runtime (V9)** | Claude swarm nodes run with `--output-format stream-json --verbose`; Codex and Gemini nodes remain PTY-based. |
| **Stream-JSON Claude Telemetry (V9)** | Claude turns surface thinking, tool-use, per-turn cost, and structured result events in the UI. |
| **Graceful Stream-JSON Controls (V9)** | Claude stream-json sessions support truthful graceful stop, force stop, resume, and reset without regressing PTY behavior. |
| **Unified Chat View** | Conversation-style agent output with grouped stream-json metadata and PTY-safe chat rendering. |
| **Execution History / Templates / Versions** | Persist workflow runs, restore old versions, and start from built-in templates. |
| **Advanced Flow Control Nodes** | Conditional, merge, delay, loop, error-handler, and sub-workflow nodes for more complex orchestration. |

---

## Swarm Runtime Notes

### Provider split

- Claude swarm agents use the stream-json runtime
- Codex and Gemini swarm agents keep the PTY runtime
- Mixed-provider workflows are supported

### Stream-json behavior

- Claude tool allowlists use `--tools`
- Thinking/tool/cost metadata is surfaced in the Swarm UI
- Terminal `stream-json` error results are truthful blockers; failed Claude turns do not force a misleading downstream PTY handoff

### Current constraints

- Maximum 10 agent nodes and 15 edges per workflow
- Circuit breaker is advisory by default
- HITL resume text is capped at 8 KB
- Webhook receivers are rate-limited to 10 requests/minute/IP and capped at 32 KB bodies

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port. Server always binds to `127.0.0.1`. |
| `IDLE_TIMEOUT_MINUTES` | `30` | Minutes of inactivity before an idle PTY session is auto-killed. |
| `CLAUDE_BINARY_PATH` | auto-detected | Override path to the `claude` binary. |
| `NO_OPEN` | unset | Prevent the browser from auto-opening on startup. |

Project configuration is stored under `%APPDATA%\ClaudeCodeManager\config.json` on Windows, with a `~/.claudecodemanager/config.json` fallback.

---

## Troubleshooting

### App does not start

1. Verify `node --version` is 20 LTS or later.
2. Re-run `npm run install:all`.
3. If `node-pty` fails to load, reinstall dependencies so the native module matches your Node.js ABI version.

### Claude binary not found

1. Run `claude --version`.
2. If needed, set `CLAUDE_BINARY_PATH`.
3. On Windows, also check `%LOCALAPPDATA%\AnthropicClaude\claude.exe`.

### Terminal will not connect

1. Confirm the server is still running.
2. Check that nothing is blocking WebSocket traffic to `127.0.0.1`.
3. Reload the page; the ring buffer should replay recent output.

### Session disappears after tab switch

PTY sessions are meant to survive browser tab closes and reconnect automatically. If one is gone, it likely hit idle timeout or the server restarted.

### Jobs never complete

Cancel them from the UI or restart the server. The server kills child processes on shutdown.

---

## Visual Regression

The Swarm canvas has a screenshot-based visual regression suite for routing, focus mode, merge fan-in, and loop/feedback readability.

```bash
npm run test:visual:swarm
```

Refresh baselines after intentional visual changes:

```bash
npm run test:visual:swarm:update
```

If your environment cannot let the harness spawn its own server:

```powershell
npm run test:visual:swarm:prepare
$env:APPDATA='C:\Users\arman\Downloads\Test workflows - Copia\tests\visual\swarm\.appdata'
$env:PORT='3310'
$env:NO_OPEN='1'
npm run start
```

Then from a second terminal:

```powershell
npm run test:visual:swarm:reuse
```

More details live in [tests/visual/swarm/README.md](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/tests/visual/swarm/README.md).

---

## Security

- **Localhost only** - server binds to `127.0.0.1`
- **CSRF protection** - mutating API requests require `X-Requested-With: ClaudeCodeManager`
- **No shell injection** - process spawns use argument arrays with `shell: false`
- **Atomic file writes** - config and editor writes use `write-file-atomic`
- **Path validation** - write targets are resolved and prefix-checked before writes
- **Security headers** - Helmet sets CSP and related protections
- **Rate limiting** - API rate limiting protects against runaway loops

---

## Known Limitations

- No authentication; locality is the main security boundary
- Windows is the primary PTY target
- Job history is not persisted across restarts
- No Git UI
- No MCP editor UI
- Swarm execution state is still in-memory across server restarts
- Prompt-to-Flow depends on an installed `claude` binary
- RSS trigger registrations are in-memory

---

## License

Private - see `package.json`.
