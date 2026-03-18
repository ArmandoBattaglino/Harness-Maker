# Current Context
**Session date:** 2026-03-18
**Focus:** Phase 3 — Job Mode API + UI (Tasks #9 + #10), and Projects View UI (Task #11)

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- Tasks #1–#8 are ALL COMPLETED as of 2026-03-18 (committed to git)
- Phase 3 (Job Mode) is the immediate priority: Task #9 (JobRunner + SSE API) must ship first, then Task #10 (JobPanel UI)
- Task #11 (Projects View UI) is UNBLOCKED — depends only on #4 and #6, both done — can run in parallel with #9
- Task #12 (NFR Polish) depends on #5 and #6 — both done — also UNBLOCKED, lower priority than #9

## Open Questions
- None currently blocking — all prerequisites for active tasks are satisfied

## Critical Constraints (current phase)
**Phase 0 is done — node-pty constraint was resolved: use plain `node-pty` (not prebuilt-multiarch). See R-01 in PROGRESS.md.**

**For Task #9 (JobRunner):** child.stdin.end() MUST be called immediately after spawn — process hangs indefinitely otherwise (DEC-005, GitHub #7497). This is the most critical non-obvious constraint in the entire codebase. Also: use child_process.spawn() with shell:false and an array of args, never shell:true.

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
