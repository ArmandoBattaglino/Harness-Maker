---
## 2026-03-27 — Task: V3 Swarm Orchestrator Technical Analysis
**Status:** COMPLETED
**Called by:** user (via /create pipeline Stage 2 — architect technical analysis)

### Context when I started
V2.0 of the app is fully complete and release-ready (31 tasks done, 110 tests pass, 0 vulnerabilities).
The project is now entering V3 planning. Previous agents (researcher, tech-lead, creative-director) had already
delivered Stage 0 assessments. User clarifications had been collected. I was called to produce the
full technical architecture analysis for the V3 Swarm Orchestrator feature.

Existing backend: Node.js ESM, Express, SessionManager (node-pty, ConPTY, permanent onData handler),
JobRunner (stream-json SSE), ConfigStore (write-file-atomic pattern), ProcessRegistry, FileManager,
RingBuffer, tree-kill. Five REST route files, one WS handler.

Existing frontend: React 18, Vite 6, Tailwind 3, AppContext useReducer, xterm.js v5, 6 views.

### What I did
Read all core service files (SessionManager.js, JobRunner.js, ConfigStore.js, terminalHandler.js,
AppContext.jsx, App.jsx, index.js), all memory docs (PROGRESS, DECISIONS, CONTEXT, PROJECT, ACTIVITY_LOG).
Produced a complete technical analysis covering: 10 new backend service components, 7 new frontend
components, full data model schemas (WorkflowDefinition, WorkflowExecution, AgentState), the
dual-store execution state architecture, all integration points with existing services, 8 ranked
technical risks, recommended stack additions (Zustand + @xyflow/react), and ASCII architecture diagram.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/architect.md | CREATED | This session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added session entry |
| docs/memory/DECISIONS.md | MODIFIED | Added DEC-011 through DEC-016 |

### Improvements delivered
- Complete V3 technical design document produced — ready for PRD writer and then implementation

### Decisions I made
- DEC-011: Separate Zustand execution store from React Flow canvas state — prevents update conflicts
- DEC-012: HandoffParser uses stateful rolling byte accumulator, not line-by-line parsing
- DEC-013: WorkflowStore follows ConfigStore pattern (write-file-atomic, JSON files on disk)
- DEC-014: SwarmEngine attaches a SECOND onData listener to existing PTY sessions (never replaces primary)
- DEC-015: Circuit breaker implemented per-edge with loop counter, not per-node
- DEC-016: Prompt-to-Flow uses existing JobRunner with --output-format stream-json; auto-retry once

### What I learned
- SessionManager.attachClient() only adds WebSocket clients; a second onData path needs to be wired
  directly on the PTY instance using ptyProcess.onData() — but must not replace the primary handler.
  The cleanest approach is a `swarmListeners` Set on the session record, iterated inside the primary handler.
- JobRunner.startJob() returns a jobId and uses readline on stdout — this readline interface is the
  hook point for extracting stream-json result blocks for Prompt-to-Flow.
- ConfigStore pattern: load() → in-memory _config → persist() via write-file-atomic. WorkflowStore
  should follow this EXACTLY to avoid inventing a new pattern.
- The existing AppContext uses useReducer. Adding Zustand only for execution state (not canvas) keeps
  the two concerns cleanly separated without migrating existing code.
- node-pty's onData fires with arbitrary byte chunks on Windows ConPTY — never assume newline boundaries.

### State I'm leaving behind
Technical analysis document delivered as a response. No code was written.
DECISIONS.md updated with DEC-011 through DEC-016.
ACTIVITY_LOG.md updated.

### Handoff
Next agent: prd-writer (Stage 5 of /create pipeline) — should read this technical analysis +
DECISIONS.md DEC-011 to DEC-016 before writing the PRD.
Then: backend-dev implements in this order: WorkflowStore → SwarmEngine → HandoffParser →
CircuitBreaker → BudgetTracker → TriggerManager → WorkflowReportGenerator → HITL routes →
Notification service → Broadcast route.
Then: frontend-dev implements: SwarmCanvas view → node components → ExecutionStore (Zustand) →
PromptToFlowModal → HITLInbox → WorkflowReportModal → NotificationBell.
---
