# Project: Claude Code Visual Manager
**Created:** 2026-03-18
**Last updated:** 2026-04-11
**Implementation status:** v17.1 - task numbering extends through #676. V17.1 PACK DOMAIN FOUNDATION CLOSED on 2026-04-11 (#617-#625 all COMPLETED/PASS). V17.0 PACK PLATFORM PROGRAM FOUNDATION CLOSED on 2026-04-11 (#610-#616 all COMPLETED/PASS). V17.2 PACK CONTRACT LAYER is the next planned area (#626-#634). All earlier completed areas remain closed. Current V17 baseline now includes first-class pack persistence, pack CRUD/version restore routes, bootstrap wiring, a minimal client pack hook layer, and additive pack metadata carried through the existing workflow runtime/results/history substrate. Regression evidence for this baseline: targeted server suites 46/46 pass, client pack-hook suite 2/2 pass.

## What it is
A locally-hosted web application that provides a graphical user interface for the Claude Code CLI. It spawns Claude Code processes directly using the user's installed binary and delivers two interaction modes: a live PTY terminal (xterm.js over WebSocket) and a job mode (prompt â†’ formatted Markdown result). It also provides visual editors for agents, skills, and CLAUDE.md files, with multi-project support and session persistence across browser tab closures.

## Tech Stack
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20 LTS | Required for node-pty compatibility |
| HTTP server | Express | 4.x | REST API + static SPA serving |
| WebSocket | ws | 8.x | PTY streaming; no transport fallbacks |
| PTY | node-pty | 1.1.x | Native PTY bridge used by Gemini/live terminal paths and Codex PTY fallback paths |
| Process kill | tree-kill | latest | Kills full process tree including Claude sub-processes |
| Atomic writes | write-file-atomic | 5.x | Prevents config/agent/skill file corruption on crash |
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
| Markdown sanitization | rehype-sanitize | 6.x | XSS prevention for Markdown rendering in ChatMessage.jsx and job results |
| Canvas / flow | @xyflow/react | 12.x | V3 swarm canvas â€” node/edge graph rendering. ReactFlow + custom node/edge types. |
| Client state | zustand | 4.x | V3 execution store â€” fine-grained subscription for live swarm state (DEC-011). useSwarmStore in SwarmContext.jsx. |
| Claude API | @anthropic-ai/sdk | latest | V3 Prompt-to-Flow scaffold endpoint â€” calls claude-haiku-4-5-20251001 to generate workflow JSON. |
| Codex SDK | @openai/codex-sdk | latest | V9.1 structured Codex thread/run control for Swarm executions |

## Core Goals (from PRD)
- Live PTY terminal in browser connected to real Claude Code process (session starts < 2s)
- Session persistence: PTY survives browser tab close/reopen (ring buffer replay)
- Multi-project simultaneous sessions (at least 5 concurrent without instability)
- Job mode: prompt submitted â†’ streaming progress â†’ formatted Markdown result (starts < 1s)
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
- Server must bind EXCLUSIVELY to 127.0.0.1 â€” never 0.0.0.0 (SEC-01)
- node-pty (plain, not prebuilt-multiarch) is the actual installed package â€” prebuilt-multiarch did not resolve on the target environment (DEC-001 revised by Task #2 devops)
- write-file-atomic (not write-atomic) is the actual installed package â€” write-atomic does not exist on npm (corrected by Task #2 devops)
- child.stdin.end() must be called immediately after every job spawn (GitHub issue #7497 hang bug)
- Primary platform: Windows 11 23H2 or later (ConPTY deadlock risk on older builds)
- No shell: true in any spawn call (command injection risk, SEC-02)
- All config/file writes must use write-file-atomic (SEC-09, FR-42)
- Config stored at %APPDATA%\ClaudeCodeManager\config.json (FR-41)
- All REST endpoints prefixed with /api/v1/ (FR-04)
- Default port: 3000, configurable via PORT env var (FR-01)
- Idle session timeout: 30 minutes default, configurable via IDLE_TIMEOUT_MINUTES (FR-19)
- X-Requested-With: ClaudeCodeManager header required on all mutating requests (SEC-06)

## V3-Specific Constraints (DEC-011 through DEC-016)
- Execution state (Zustand) and canvas state (@xyflow/react) must NEVER be merged â€” DEC-011
- HandoffParser must use a stateful rolling byte accumulator â€” line-by-line parsing drops split ConPTY tokens (DEC-012)
- WorkflowStore writes one file per workflow to %APPDATA%\ClaudeCodeManager\workflows\ (DEC-013)
- SwarmEngine must attach secondary swarmListeners Set to session records â€” NEVER replace the primary pty.onData handler (DEC-014, DEC-009)
- Circuit breaker is keyed by directed edge pair (sourceId:targetId), not by node â€” DEC-015
- Prompt-to-Flow calls Anthropic SDK directly (claude-haiku-4-5-20251001) â€” DEC-016
- SEC-V3-01: Webhook body cap 32 KB | SEC-V3-03: SSRF guard on RSS URLs | SEC-V3-04: Webhook rate limit 10 req/min/IP
- SEC-V3-05: HITL resumeText cap 8 KB | SEC-V3-06: HandoffParser payload cap 64 KB
- SEC-V3-07: Webhook receiver always returns 200 to external callers (information leakage prevention)
