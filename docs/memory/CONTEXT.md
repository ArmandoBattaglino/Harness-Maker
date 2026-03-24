# Current Context
**Session date:** 2026-03-24
**Focus:** Phase 7 — v1.1 Maintenance Backlog (Tasks #19, #20, #21 — all UNBLOCKED, run in parallel)

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- Tasks #1–#18 are ALL COMPLETED as of 2026-03-18. v1 is RELEASE READY.
- Post-v1 Debug & Security Audit completed (2026-03-18): 7 bugs fixed (BUG-02, 03, 04, 05, 11, 14, 16/19), 12 deferred to v1.1.
- Security re-audit PASS: all 10 SEC requirements satisfied, 0 CRITICAL/HIGH/MEDIUM findings remaining in production code.
- All 3 Phase 7 v1.1 tasks COMPLETED as of 2026-03-24: TASK #19 (JobRunner leak), TASK #20 (rate limiter leak), TASK #21 (vite CVE upgrade).
- Next step: v1.1 QA regression pass, then tag v1.1 release.

## Open Questions
- None blocking. v1 is shippable as-is. Phase 7 tasks are improvements, not blockers.

## Critical Constraints (current phase)
**All v1 implementation constraints (DEC-001 through DEC-010) are applied in the codebase.**
**Phase 7 agents should make targeted, minimal changes — do not refactor unrelated code.**

Key facts for Phase 7 agents:
- TASK #19 target: server/services/JobRunner.js — jobs Map eviction. Use setTimeout with .unref() pattern.
  Retention window should be at least 5 minutes. Do not delete jobs while their SSE stream is still active.
- TASK #20 target: server/index.js — _rateLimitMap cleanup. Use setInterval with .unref() sweeping stale entries.
  Do not change the observable rate-limiting behavior for legitimate requests.
- TASK #21 target: client/package.json — vite version bump. Run `npm run build` and `npm audit` in client/ to verify.
  Do not upgrade React, xterm.js, or react-markdown as part of this task.
- After all 3 Phase 7 tasks complete: run qa-tester regression pass, then tag v1.1.

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
