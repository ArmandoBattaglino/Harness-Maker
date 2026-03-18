# Current Context
**Session date:** 2026-03-18
**Focus:** Phase 5 — QA, Security Audit, and Documentation (Tasks #13, #14, #15 — all UNBLOCKED, run in parallel)

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- Tasks #1–#12 are ALL COMPLETED as of 2026-03-18 (committed to git)
- ALL implementation is done. Phase 5 is the final phase before v1 release.
- Task #13 (qa-tester), Task #14 (security), Task #15 (documenter) are all UNBLOCKED and can run in parallel
- Task #15 (Docs) has a soft dependency on #13 and #14 being complete — README should note any known issues discovered

## Open Questions
- None currently blocking — all prerequisites satisfied

## Critical Constraints (current phase)
**All implementation constraints (DEC-001 through DEC-010) are already applied in the codebase.**
**Phase 5 agents should read the codebase, not re-implement anything.**

Key facts for Phase 5 agents:
- node-pty constraint was resolved: plain `node-pty` is used (not prebuilt-multiarch). See R-01 in PROGRESS.md.
- child.stdin.end() is called immediately after every job spawn in server/services/JobRunner.js (DEC-005).
- Server binds to 127.0.0.1 in server/index.js (DEC-002, SEC-01).
- CSRF middleware is in server/middleware/csrf.js — rejects POST/PUT/PATCH/DELETE without X-Requested-With header (DEC-008, SEC-06).
- Path traversal prevention is in server/services/FileManager.js validatePath() (SEC-03, SEC-04).
- ConPTY deadlock prevention: permanent pty.onData handler in server/services/SessionManager.js (DEC-009).

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
