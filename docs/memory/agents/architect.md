---
## 2026-04-06 — Analysis: PTY/Terminal Output Data Flow Map
**Status:** COMPLETED
**Called by:** user (direct request)

### Context when I started
V5 Waves 1-5 plus BugFix1 and BugFix2 all closed (324/326 tasks COMPLETED, 2 DEFERRED). The user requested a pure analysis task: map the complete data flow from PTY spawn through to client rendering for the Swarm agent output system, to understand where a "chat message" extraction point could be inserted.

### What I did
Read and analyzed the full output pipeline across 8 files:
- server/services/SessionManager.js — permanent pty.onData handler (DEC-009), ring buffer, swarmListeners Set (DEC-014)
- server/services/SwarmEngine.js — tapFn closure (line 2200-2471), _normalizeParserChunk, _buildSemanticSnippet (line 1150-1253), _broadcastAgentStatus (line 948-965), SNIPPET_NOISE_LINE_PATTERNS (120+ regexes), echo gate mechanism
- server/services/HandoffParser.js — rolling 8KB buffer, __HANDOFF__/__DONE__ token extraction
- server/ws/swarmHandler.js — broadcast() passthrough to subscribed WS clients
- server/routes/swarm.js — GET /agent/:nodeId/output endpoint (raw ring buffer)
- client/src/hooks/useSwarm.js — WS message handler, Zustand store updates
- client/src/canvas/nodes/AgentNode.jsx — card rendering (last 4 lines of snippet)
- client/src/canvas/AgentInspector.jsx — inspector panel rendering (full snippet)
- client/src/canvas/PtyExplosion.jsx — full raw xterm.js terminal bypass

Produced a complete data flow diagram with 10 stages, filtering inventory, and 4 candidate insertion points for chat message extraction.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/architect.md | MODIFIED | Added this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added session entry |

### Improvements delivered
- Complete data flow documentation from PTY spawn to UI rendering
- Identified every filtering/stripping stage with what gets lost at each point
- Mapped all 13 WS event types with their fields and emission points
- Identified 4 viable insertion points for chat message extraction, with Point A (inside tapFn after echo gate) as the recommended location

### Bugs I encountered
None — pure analysis task.

### Decisions I made
- Recommended Point A (inside tapFn, after echo gate, before snippet pipeline) as the best insertion point for chat message extraction — it has access to the full ANSI-stripped, echo-gated stream before the aggressive 120+ regex noise filter and block-scoring pipeline destroys the content

### What I learned
- The snippet pipeline is extremely aggressive: 120+ noise regex patterns, block scoring, 500-char cap. Most of the agent's actual output is discarded.
- _snippetSourceBuffer (120KB) is the richest filtered data source — it has all ANSI-stripped, echo-gated text. The 4KB _runtimeScanBuffer is too small for content extraction.
- The echo gate (ignoreParserUntil) is critical — it prevents echoed system prompt text from contaminating the output stream. Any new extraction point must respect this gate.
- _refreshAgentSnippet with preferSessionReplay=true (used for terminal agents) rebuilds from the full ring buffer — this is why done/completed agents sometimes show different snippets than running agents.
- PtyExplosion completely bypasses the snippet pipeline and shows raw xterm.js output from the regular terminal WS channel (session.clients), not the swarm channel.

### State I'm leaving behind
Pure analysis document delivered. No code changes. The analysis identifies Point A as the recommended insertion point for any future chat message extraction feature.

### Handoff
If a chat message extraction feature is requested, the architect should produce a design document specifying the exact extraction logic, new WS event type, and client-side rendering. Then backend-dev and frontend-dev implement.

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
