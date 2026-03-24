# Test workflows — CLAUDE.md

## Project Overview
Claude Code Visual Manager is a locally-hosted web application (localhost:3000) that provides a graphical UI for the Claude Code CLI. It spawns Claude Code processes directly using the user's installed binary and delivers two interaction modes: a live PTY terminal (xterm.js over WebSocket) and a job mode (prompt → formatted Markdown result via SSE). It also provides visual CRUD editors for agents, skills, and CLAUDE.md files, with persistent multi-project session management.

## Running the Project
```
npm install       # Install all dependencies (server + client)
npm start         # Build client (Vite) + start server; auto-opens browser
```
App runs at: http://127.0.0.1:3000 (default; change via PORT env var)
Server binds exclusively to 127.0.0.1 — never accessible from the network.

## Agent Team Workflow

### Session Start
Always begin by checking docs/memory/ for current project state.
Call the project-manager agent if starting a significant work session.

### Memory Location
All project memory is in docs/memory/:
- PROJECT.md — what this is, stack, constraints
- DECISIONS.md — past decisions with reasoning
- PROGRESS.md — task status
- CONTEXT.md — current focus and agent notes
- knowledge/INDEX.md — index of all research findings and external docs

### Bug Protocol
Any error → immediately call debugger agent → then update docs/memory/DECISIONS.md

## Code Conventions
- Language: JavaScript (ESM modules, `"type": "module"` in package.json). TypeScript is optional but must be consistent within a file — no mixed TS/JS in the same module.
- Server: Node.js 20 LTS. Use `child_process.spawn()` with array args and `shell: false` always (never `shell: true`).
- All file writes must use `write-atomic` — never `fs.writeFile` directly for config, agents, skills, or CLAUDE.md.
- Path validation: always `path.resolve()` + assert prefix before any write. Return HTTP 400 on failure.
- YAML: `js-yaml` for all frontmatter parse/serialize. Frontmatter format: `---\n<yaml>\n---\n<body>`.
- Agent name validation: must match `^[a-z][a-z0-9-]*$` — enforce server-side before writing.
- REST: all endpoints under `/api/v1/`. CSRF header `X-Requested-With: ClaudeCodeManager` required on all mutating requests.
- React: functional components + hooks only. One xterm.js `Terminal` instance per session — never reuse across project tabs.
- Logging: never log API keys, OAuth tokens, full prompt content, or full file content.

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port. Server always binds to 127.0.0.1. |
| `IDLE_TIMEOUT_MINUTES` | `30` | Minutes of inactivity before an idle PTY session is auto-killed. |
| `CLAUDE_BINARY_PATH` | auto-detected | Override path to the `claude` binary. If unset, server checks PATH then `%LOCALAPPDATA%\AnthropicClaude\claude.exe`. |
