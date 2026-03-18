# Current Context
**Session date:** 2026-03-18
**Focus:** Phase 0 — Foundation (node-pty + WebSocket + xterm.js validation and server bootstrap)

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- Phase 0 is the current work target: monorepo init, Express + helmet + CSRF, ConfigStore, ProcessRegistry, process signal handlers, stale PID cleanup, Claude binary discovery

## Open Questions
- Will node-pty-prebuilt-multiarch have a prebuilt binary for the user's exact Node.js 20 LTS sub-version on Windows 11? (MUST be answered in Phase 0 before writing any PTY code)

## Critical Constraint (read this first)
**node-pty Windows build MUST be validated FIRST before any other Phase 0 work proceeds.**
Run `npm install node-pty-prebuilt-multiarch` and verify the binary loads on the target machine. If no prebuilt binary exists, escalate immediately to the architect — the PTY architecture must be reconsidered before any other code is written. See DEC-010 and R-01 in DECISIONS.md.

## Notes for Specific Agents

### For architect:
- Architecture document is COMPLETE: docs/ARCHITECTURE.md (produced 2026-03-18).
- All 10 sections are written. No further design work is needed before Phase 0 implementation begins.
- Fallback PTY strategy (if node-pty-prebuilt-multiarch binary is missing): not documented yet — only escalate if R-01 is confirmed during Phase 0 validation.

### For backend-dev:
- Read docs/research_b.md (PTY persistence + Windows reconnect) and docs/research_d.md (multi-session PTY Node.js) before starting Phase 0/1 work.
- Read docs/research_a.md (Claude CLI headless invocation) before starting Phase 3 (Job Mode).
- The permanent pty.onData handler pattern (DEC-009) is non-negotiable — see research_b.md for the ConPTY deadlock explanation.
- child.stdin.end() immediately after job spawn is non-negotiable (DEC-005, GitHub #7497).

### For frontend-dev:
- Read docs/research_c.md (Claude Code file formats) before building entity editors (Phase 2).
- One xterm.js Terminal instance per session — never share instances across project tabs.
- ResizeObserver on container div → fitAddon.fit() → WebSocket resize message, debounced 100ms.

### For qa-tester:
- 6 QA critical paths are defined in docs/research_complete.md — these are the Phase 4 acceptance gates.
- Priority test: browser tab close → reopen → verify ring buffer replay (QA critical path 1).
- Priority test: job mode completes without hanging (QA critical path 3, validates DEC-005).

### For security:
- All 10 SEC requirements (SEC-01 through SEC-10) are mandatory for v1 release. See PRD Section 8.
- Key items: 127.0.0.1 binding (SEC-01), no shell:true (SEC-02), path traversal prevention (SEC-03, SEC-04), CSRF header (SEC-06, DEC-008), helmet CSP (SEC-07).

### For devops:
- npm start must: build the client (Vite), start the server, auto-open browser at http://127.0.0.1:3000.
- npm audit --audit-level=high is a mandatory pre-release CI step (SEC-10).
