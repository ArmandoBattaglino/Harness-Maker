# Current Context
**Session date:** 2026-03-27
**Focus:** V3 Planning — Multi-Agent Swarm Orchestrator PRD written. Next: V3 task planning and architecture.

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- V3 PRD COMPLETE (docs/PRD.md, version 3.0, 2026-03-27). Ready for V3 task planning.
- V2 is RELEASE READY (31 tasks, all COMPLETED). TASK #41 (regression QA) still pending for Phase 10.
- Build status: 299 modules, 0 errors.

## Open Questions (V3 — for Architect)
1. Scaffold AI model: which model for POST /api/v1/swarm/scaffold?
2. Workflow-to-project binding: strict per-project or global?
3. Agent PTY CWD: inherit project path or separate configurable CWD?
4. RSS authentication: clear error or silent skip for auth-gated feeds?
5. Zustand version: v4 or v5? (breaking API change between them)
6. swarmListeners Set: needs non-destructive addition to SessionManager (V2 file) — architect must specify contract carefully to avoid breaking V2 tests.

## Notes for Architect
- Read PRD Section 11 (Open Questions) before designing SwarmEngine/SessionManager integration.
- The swarmListeners tap point (Q6) is the most critical V2↔V3 bridge — any change to SessionManager must not remove the permanent pty.onData handler (DEC-009).

## What Changed in Phase 10

### Backend (2 files modified)
- **security.js**: CSP `fontSrc` and `styleSrc` updated to allow Google Fonts CDN
- **JobRunner.js**: `child.on('error')` handler + `child.stdin.end()` try-catch

### Frontend (5 files modified)
- **Sidebar.jsx**: `creatingSessionRef` race lock, `sessionError` feedback, dynamic version via API, logo `overflow-hidden`, settings icon de-interactivized
- **Terminal.jsx**: Background color `#1a1a1a` → `#000000`
- **ContextEditorView.jsx**: `handleScopeSwitch` with `window.confirm` guard
- **ProjectsView.jsx**: `modalMode` state, `focus:opacity-100` on three-dot menu
- **AddProjectModal.jsx**: `mode` prop for differentiated titles (Register/Scaffold)

## V3 Security Assessment Notes (for prd-writer)
Security assessment completed 2026-03-27. Seven mandatory requirements must appear in the V3 PRD as SEC-V3-01 through SEC-V3-07:
1. Webhook body size cap (32 KB max), no raw body passthrough to PTY
2. WorkflowDefinition schema validation + systemPrompt size cap (16 KB) before any spawn
3. SSRF prevention on RSS/webhook URLs — private IP blocklist (127.x, 10.x, 172.16-31.x, 192.168.x, ::1)
4. Stricter rate limiter on webhook endpoint (separate from main 200 req/min limiter)
5. HITL resume text size cap (8 KB max)
6. Workflow name/description length caps + character whitelist server-side
7. HandoffParser 4 KB flush buffer must never be passed to writeInput without sanitization

## Notes for TASK #41 (Regression QA)
- Verify all 11 bugs from bug_report.md are resolved
- Run `npm test` (110 tests should pass)
- Run `npm run build` (299 modules, 0 errors)
- Browser test: icons render as glyphs, terminal bg is black, scope switch prompts

---
## Update 2026-03-27 — V3 Planning Complete

**Focus:** V3 Swarm Orchestrator — Phase 1 (Backend Foundation) is next.

**Ready to start:** TASK #43 (WorkflowStore.js) — backend-dev

**V3 Key Decisions (for all agents):**
- DEC-V3-01: HandoffParser uses rolling 4KB byte accumulator (NOT line-by-line) — ConPTY splits tokens
- DEC-V3-02: PTY injection: soft=queue, hard=\x03+300ms+text+Escape+100ms+Enter (unreliable during tool calls)
- DEC-V3-03: SwarmEngine taps via session.swarmListeners Set — primary onData NEVER removed (DEC-009)
- DEC-V3-04: React Flow canvas state SEPARATE from Zustand ExecutionStore — never mix them
- DEC-V3-05: WorkflowContext = flat dict, shallow merge on each handoff (OpenAI Swarm pattern)
- Canvas always editable during execution (no lock)
- __DONE__ = soft notify only, workflow never auto-stops
- Budget = soft warn only, never stops
- HITL = human can chat at dept + agent level; PTY Explosion for direct terminal

**Blocking V3 start:** TASK #41 is COMPLETED. All V2 tasks done. V3 can begin immediately.

**First wave (Phase 1):** #43, #45 can run in parallel (WorkflowStore + HandoffParser have no deps on each other). #46 waits for #43+#45. #47 waits for #46. #48 waits for #46. #49 waits for #46.
