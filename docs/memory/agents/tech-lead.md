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
