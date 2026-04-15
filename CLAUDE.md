# Claude Code Visual Manager

## Project Overview
Claude Code Visual Manager is a locally-hosted web application (localhost:3000) that provides a graphical UI for the Claude Code CLI. It supports three execution paths that matter in practice: a live PTY terminal (xterm.js over WebSocket), a job mode (prompt to formatted Markdown result via SSE), and a V9 swarm runtime where Claude nodes run via `stream-json` while Codex/Gemini nodes remain PTY-based.

## Running the Project
```
npm install       # Install all dependencies (server + client)
npm start         # Build client (Vite) + start server; auto-opens browser
```
App runs at: http://127.0.0.1:3000 (default; change via PORT env var)
Server binds exclusively to 127.0.0.1 and must never be exposed to the network.

## Code Conventions
- Language: JavaScript ESM modules. TypeScript is optional but must be consistent within a file.
- Server: Node.js 20 LTS. Use `child_process.spawn()` with argument arrays and `shell: false` only.
- All file writes must use `write-file-atomic`; never use raw `fs.writeFile` for config, agents, skills, or `CLAUDE.md`.
- Path validation: always `path.resolve()` plus prefix assertion before any write. Return HTTP 400 on failure.
- YAML: use `js-yaml` for all frontmatter parse/serialize. Format is `---`, YAML body, `---`, markdown body.
- Agent names must match `^[a-z][a-z0-9-]*$` and be validated server-side.
- REST endpoints live under `/api/v1/`. Mutations require `X-Requested-With: ClaudeCodeManager`.
- React: functional components plus hooks only. Keep one xterm.js terminal instance per session.
- Logging: never log API keys, OAuth tokens, full prompt payloads, or full file contents.
- DEC-027/028/029: Claude swarm agents use `--output-format stream-json --verbose`; Codex and Gemini swarm agents keep PTY runtime paths.
- Stream-json Claude tool allowlists must use `--tools`, not `--allowedTools`.
- Terminal `stream-json` error results are truthful blockers; do not force a downstream PTY handoff or cross-runtime fallback from a failed Claude stream-json turn.
- `child.stdin.end()` must be called immediately after every non-PTY spawn that only reads stdout/stderr.

## OMX Context
Planning artifacts from Oh My Codex sono in `.omx/`:
- `.omx/plans/` — PRD e test spec (approvati via consensus)
- `.omx/context/` — context snapshot e sessioni ralplan
- `.omx/artifacts/` — output di review e analisi
Leggi i file rilevanti prima di implementare feature pianificate tramite OMX.

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port. Server always binds to 127.0.0.1. |
| `IDLE_TIMEOUT_MINUTES` | `30` | Minutes of inactivity before an idle PTY session is auto-killed. |
| `CLAUDE_BINARY_PATH` | auto-detected | Override path to the `claude` binary. If unset, server checks PATH then `%LOCALAPPDATA%\\AnthropicClaude\\claude.exe`. |
