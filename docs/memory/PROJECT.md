# Project: Claude Code Visual Manager
**Created:** 2026-03-18
**Last updated:** 2026-03-18
**Implementation status:** v1 — all 12 implementation tasks COMPLETED. Pending: QA sign-off (Task #13), Security audit sign-off (Task #14).

## What it is
A locally-hosted web application that provides a graphical user interface for the Claude Code CLI. It spawns Claude Code processes directly using the user's installed binary and delivers two interaction modes: a live PTY terminal (xterm.js over WebSocket) and a job mode (prompt → formatted Markdown result). It also provides visual editors for agents, skills, and CLAUDE.md files, with multi-project support and session persistence across browser tab closures.

## Tech Stack
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20 LTS | Required for node-pty compatibility |
| HTTP server | Express | 4.x | REST API + static SPA serving |
| WebSocket | ws | 8.x | PTY streaming; no transport fallbacks |
| PTY | node-pty-prebuilt-multiarch | latest | Prebuilt binaries — avoids MSVC Build Tools on Windows |
| Process kill | tree-kill | latest | Kills full process tree including Claude sub-processes |
| Atomic writes | write-atomic | latest | Prevents config/agent/skill file corruption on crash |
| YAML | js-yaml | 4.x | Agent and skill YAML frontmatter parse/serialize |
| UUID | uuid | 9.x | Session and job ID generation (v4) |
| Security headers | helmet | latest | CSP, X-Content-Type-Options, X-Frame-Options |
| Frontend bundler | Vite | 5.x | Sub-second HMR dev; production bundle |
| UI framework | React | 18 | Hooks-based state, concurrent rendering |
| Terminal renderer | xterm.js | 5.x | Browser PTY rendering, ConPTY-compatible |
| Terminal resize | xterm-addon-fit | latest | Resizes xterm.js to container div |
| Styling | Tailwind CSS | 3.x | Utility-first; extended theme with 20+ design tokens (Phase 9) |
| Fonts | Inter, JetBrains Mono | via Google Fonts CDN | Inter: UI text (400-700); JetBrains Mono: code/terminal (400-500); Geist: fallback only |
| Icons | Material Symbols Outlined | via Google Fonts CDN | Variable weight+fill; used for sidebar navigation and status indicators |
| Markdown render | react-markdown | 9.x | Safe Markdown for job results |
| Markdown tables | remark-gfm | latest | GFM plugin (tables, code fences) for react-markdown |

## Core Goals (from PRD)
- Live PTY terminal in browser connected to real Claude Code process (session starts < 2s)
- Session persistence: PTY survives browser tab close/reopen (ring buffer replay)
- Multi-project simultaneous sessions (at least 5 concurrent without instability)
- Job mode: prompt submitted → streaming progress → formatted Markdown result (starts < 1s)
- Entity management: CRUD for agents, skills, CLAUDE.md files
- Project registration and scaffolding (both flows, no manual filesystem steps)
- Clean process lifecycle: zero orphaned claude.exe / conhost.exe after shutdown
- Security baseline: all 10 SEC requirements satisfied before v1 release
- Single command launch: `npm start`

## Out of Scope (v1)
- Authentication or multi-user access
- Cloud or remote deployment (deliberately localhost-only)
- Git integration (commit UI, branch management, diff view)
- MCP server configuration editor (read-only display only)
- Electron or Tauri packaging
- Mobile browser support
- Plugin or extension system
- Automated Claude Code CLI updates
- Session sharing or collaboration
- settings.json visual editor (deferred to v1.1)
- Job history persistence across restarts (deferred to v1.1)

## Key Constraints
- Server must bind EXCLUSIVELY to 127.0.0.1 — never 0.0.0.0 (SEC-01)
- node-pty (plain, not prebuilt-multiarch) is the actual installed package — prebuilt-multiarch did not resolve on the target environment (DEC-001 revised by Task #2 devops)
- write-file-atomic (not write-atomic) is the actual installed package — write-atomic does not exist on npm (corrected by Task #2 devops)
- child.stdin.end() must be called immediately after every job spawn (GitHub issue #7497 hang bug)
- Primary platform: Windows 11 23H2 or later (ConPTY deadlock risk on older builds)
- No shell: true in any spawn call (command injection risk, SEC-02)
- All config/file writes must use write-file-atomic (SEC-09, FR-42)
- Config stored at %APPDATA%\ClaudeCodeManager\config.json (FR-41)
- All REST endpoints prefixed with /api/v1/ (FR-04)
- Default port: 3000, configurable via PORT env var (FR-01)
- Idle session timeout: 30 minutes default, configurable via IDLE_TIMEOUT_MINUTES (FR-19)
- X-Requested-With: ClaudeCodeManager header required on all mutating requests (SEC-06)
