# Tech Lead — Session Memory

---
## 2026-03-27 — Task: Stage 0 Technical Assessment — V3 Swarm Orchestrator
**Status:** COMPLETED
**Called by:** user (via /create pipeline)

### Context when I started
V2 codebase is complete and release-ready (all 42 tasks done, 0 critical bugs). Stack: Node.js ESM, Express, node-pty, ws, React 18, Vite, xterm.js. Key platform fact: Windows 11 primary target, ConPTY, no shell:true, permanent pty.onData (DEC-009). V2 has SessionManager (PTY lifecycle), JobRunner (claude -p SSE streaming), ProcessRegistry (PID tracking), RingBuffer (100KB per session).

### What I did
Analyzed the proposed V3 architecture (SwarmEngine, WorkflowStore, HandoffParser, CircuitBreaker, React Flow canvas) for technical feasibility, platform fit, and hidden architectural risks. Cross-referenced against existing V2 constraints (DEC-001 through DEC-010).

### Key Technical Findings

**HANDOFF pattern reliability is the core risk.** The design relies on parsing `HANDOFF:<target>:<base64ctx>` as the last line of PTY stdout. PTY output is a raw byte stream — it has no message framing, no atomic line delivery, and no guaranteed ordering relative to other output. On Windows ConPTY specifically, output can be chunked arbitrarily across onData callbacks. A HANDOFF token could arrive split across two callbacks (e.g., `HANDOFF:agent` in one chunk, `-1:base64...` in the next). The parser must be stateful and buffer-aware, not line-at-a-time. This is a non-trivial implementation detail that the design document does not address.

**Second pty.onData() listener is valid per DEC-009.** node-pty supports multiple onData listeners on the same IPty instance. The permanent-handler rule (DEC-009) is about never REMOVING the first handler — adding a second listener for SwarmEngine is safe and does not violate that constraint.

**Concurrency ceiling.** The design spawns one PTY per agent per workflow execution. V2 supports 5 concurrent sessions (NFR-06). A swarm of N agents = N PTYs. The user's machine becomes the constraint (ConPTY handles + RAM). The design should define a hard cap (e.g., MAX_AGENTS_PER_WORKFLOW=8) to prevent resource exhaustion — the circuit breaker handles looping but not raw spawn count.

**JobRunner for Prompt-to-Flow generation.** Using `claude -p` to generate workflow JSON is sound — it reuses existing V2 infrastructure. The risk is JSON extraction from streamed output: `--output-format stream-json` emits multiple JSON event objects, not a single JSON blob. The design needs to specify which event type carries the final structured output (likely the `result` event with `subtype: result`) and how to handle malformed or incomplete JSON when the generated workflow is large.

**WorkflowStore persistence.** Flat JSON files on disk (like V2 config) is appropriate for the local single-user model. No new risk here.

**@xyflow/react v12 + React 18.** This combination is well-supported. No technical blocker.

### Decisions I made
- Flagged PTY stdout chunking as the single biggest technical unknown
- Identified PTY concurrency cap as a missing but necessary constraint
- Identified stream-json event parsing as a subtle but implementation-relevant gap

### State I'm leaving behind
Analysis complete. Three targeted questions produced for the /create pipeline. No code written.

### Handoff
Findings feed into Stage 1 (researcher) and Stage 2 (architect) of the /create pipeline.
---

---
## 2026-04-06 — Phase 0 Technical Assessment: N8N-style Swarm Editor Features
**Status:** COMPLETED
**Called by:** user (direct request)

### Context when I started
V6.0 runtime deep test bug fixes in progress (242/253 tasks completed). The Swarm subsystem is mature: SwarmEngine with multi-provider support (Claude/Codex/Gemini), HandoffParser with stateful accumulator, WorkflowStore with CRUD + validation, React Flow v12 canvas with AgentNode/DepartmentNode/TriggerNode, and a Zustand execution store separate from canvas state (DEC-011). The user wants to add N8N-style visual workflow editing: drag-and-drop node palette, inline editing, edge configuration, save/load, undo/redo, advanced flow control nodes, export/import, and validation.

### What I did
Analyzed 9 feature categories (A through I) for technical feasibility against the actual codebase. Read SwarmCanvas.jsx, AgentInspector.jsx, SwarmContext.jsx, WorkflowStore.js, workflows.js routes, useWorkflow.js hook, and SwarmEngine.js to ground the analysis in real code. Assessed each feature for feasibility, complexity, backend impact, risk to existing V3 behavior, and recommended implementation order.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| none | — | Pure analysis, no code changes |

### Improvements delivered
- Complete per-feature feasibility matrix (FEASIBLE / FEASIBLE WITH CHANGES / COMPLEX / BLOCKED)
- Identified 5 critical technical risks including node ID validation, React Flow internal field persistence, useWorkflow.update() return value bug, execution snapshot timing, and CircuitBreaker conflict with loop nodes
- Recommended 4-wave implementation order based on dependency and risk
- Identified which features require DEC decisions (F1 Conditional, F2 Merge/Join, F4 Loop)

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| useWorkflow.update() return value mismatch | Hook returns raw response but server wraps as {workflow} | Not fixed — flagged for Wave 1 | KNOWN |

### Decisions I made
- Wave 1 must be pure-frontend features (D Save, B Inspector, A Palette, I Validation) to avoid backend risk
- Advanced flow control nodes (F1-F5) each need a DEC decision before implementation because they change the core execution routing model
- State snapshot approach recommended for undo/redo over Zustand temporal middleware (canvas state is in React Flow, not Zustand per DEC-011)
- Recommended sanitizer utility for stripping React Flow internal fields before persistence

### What I learned
- handleUpdateNode callback already exists and works (SwarmCanvas line 96-103) — inspector editing is mostly a UI swap
- WorkflowStore.validate() enforces NODE_ID_REGEX on every node — all ID generation must conform
- SwarmEngine snapshots workflowDef at startExecution() time — canvas edits during execution are draft-only
- useWorkflow.update() has a latent bug that will surface once save is first exercised

### State I'm leaving behind
Analysis complete with 4-wave implementation roadmap. No code written. Five technical risks documented. Three features flagged as needing DEC decisions before implementation.

### Handoff
Results feed into task planning for the N8N-style editor feature set. The project-manager should create tasks following the 4-wave order. The architect should be called for DEC decisions on features F1, F2, and F4 before Wave 3 begins.
---
