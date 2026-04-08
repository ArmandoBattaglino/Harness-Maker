---
## 2026-04-08 — Task: Write V6 PRD (Stream-JSON Agent Migration for Swarm Engine)
**Status:** COMPLETED
**Called by:** user (direct invocation with full discovery answers + research findings)

### Context when I started
The project was at V5.0 with 333+ tasks completed. A complete research phase had been done: stream-json event format, session management (--resume, --session-id), tool restriction (--tools vs --allowedTools bug #12232), security analysis (SEC-SJ-01 through SEC-SJ-07), and architect decisions (DEC-027 through DEC-029). The existing PRD was V5.0 dated 2026-04-06. The existing codebase uses PTY for all provider agents (Claude, Codex, Gemini) via SwarmEngine._spawnAgentPty().

### What I did
1. Read all memory files in parallel (PROJECT.md, DECISIONS.md, CONTEXT.md, prd-writer.md agent log).
2. Read existing PRD structure, SwarmEngine.js, swarmHandler.js, useSwarm.js, AgentNode.jsx, ChatMessage.jsx, AgentInspector.jsx, SwarmContext.jsx, SessionManager.js, ChatExtractor.js, JobRunner.js to understand current architecture.
3. Wrote complete V6 PRD at docs/PRD.md with all 13 sections + 2 appendices.
4. Section 11 covers 12 components: StreamJsonParser, _spawnAgentStreamJson, _spawnAgent dispatcher, Session Lifecycle, useSwarm.js extensions, AgentNode.jsx extensions, ChatMessage.jsx extensions, AgentInspector.jsx tool config, SwarmContext.jsx store extensions, ChatExtractor bypass, SessionManager bypass, swarmHandler.js routing.
5. Each component has full spec: inputs, outputs, step-by-step behavior, contracts, acceptance criteria.
6. All WS events fully specified with every field.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/PRD.md | MODIFIED (full rewrite) | V5 PRD replaced with V6 PRD for Stream-JSON Agent Migration |
| docs/memory/agents/prd-writer.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended task entry |

### Improvements delivered
- Complete single-source-of-truth PRD for stream-json migration with 12 fully specified components
- All 7 SEC-SJ-* security requirements documented with implementation references
- 4 new WS event types fully specified (agent_thinking, agent_tool_use, agent_tool_delta, agent_cost)
- Provider routing logic fully specified with model-to-method mapping
- Two-tier stop (graceful/forced/reset) fully specified with session file management
- Per-agent tool whitelist configuration fully specified with 16-tool checkbox UI
- 4 open questions flagged for researcher/backend-dev

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| No TerminalManager.js exists | User requirement referenced "TerminalManager" but terminal management is in SessionManager.js | Documented as SessionManager bypass instead | RESOLVED (documentation) |

### Decisions I made
- Replaced V5 PRD entirely (V6 is a new feature, not an addendum to V5). Rationale: stream-json migration is architecturally distinct from V5 visual editor features.
- Used 12 component specs covering both new (StreamJsonParser, _spawnAgentStreamJson) and modified (AgentNode, ChatMessage, AgentInspector, useSwarm, SwarmContext) and unchanged-but-documented (ChatExtractor, SessionManager, swarmHandler) components.
- Specified ChatExtractor and SessionManager as "bypass" components with no code changes needed — only documentation comments. This ensures implementers know these modules are intentionally untouched for the stream-json path.
- Kept agent_tool_delta as separate WS event rather than batching into agent_tool_use — real-time streaming requires individual delta events.

### What I learned
- The existing codebase has 120+ noise regexes across ChatExtractor, chatTextNormalization, and SessionManager replay filtering — all of which are bypassed by stream-json's clean structured output.
- HandoffParser's rolling byte accumulator (DEC-012) is unnecessary for stream-json because handoff tokens appear in clean text blocks, not raw PTY bytes.
- The existing SwarmContext.jsx updateAgentState action already supports arbitrary patches via shallow merge — no structural store changes needed, only new field documentation.
- JobRunner.js already uses readline + stream-json parsing for job mode — _spawnAgentStreamJson follows the same pattern.

### State I'm leaving behind
docs/PRD.md is complete, version 6.0, status Draft. 13 sections + 2 appendices. 12 component specifications with full acceptance criteria. 4 open questions flagged. Ready for project-manager to build TASK_PLAN.md.

### Handoff
- Project Manager: Read docs/PRD.md and build V6 tasks in docs/TASK_PLAN.md. Phase plan is in Appendix B (4 phases, ~14 tasks).
- Architect: Review open questions 1-4 (session file encoding, extended thinking, post-result hang, JSONL truncation).
- Researcher: Resolve open questions 1, 2, 4 before Phase 2 backend tasks begin.
---

---
## 2026-04-02 — Task: Write Section 11 — Component Specifications (Swarm V3)
**Status:** COMPLETED
**Called by:** user (direct invocation with full context and file list)

### Context when I started
The PRD at docs/PRD.md was complete through Section 12 (Out of Scope) and two appendices (Security, Phase Plan). Section 11 was titled "Open Questions". The Swarm V3 implementation was fully built (Tasks #1–#123 all COMPLETED as of 2026-03-31). Four known bugs had been identified in a prior analysis session: missing sessionId in agent_status events, unimplemented handoff_completed, unhandled trigger_fired/trigger_status, and undefined onUpdateNode prop.

### What I did
1. Read docs/PRD.md (existing sections 1-12 + appendices).
2. Read all 17 source files in parallel: SwarmEngine.js, HandoffParser.js, WorkflowStore.js, TriggerManager.js, swarm.js (routes), swarmHandler.js (WS), SwarmView.jsx, SwarmCanvas.jsx, AgentNode.jsx (in nodes/ subdirectory), HandoffEdge.jsx (in edges/ subdirectory), AgentInspector.jsx, BroadcastBar.jsx, InterAgentFeed.jsx, useSwarm.js, useInbox.js, SwarmContext.jsx.
3. Discovered that AgentNode and HandoffEdge are in subdirectories (nodes/ and edges/) not at the root canvas level — different from the paths given in the task prompt.
4. Wrote "Section 11 — Component Specifications" as an appendix to the PRD (appended after Appendix B). Covers 12 components in full spec format.
5. Wrote "Section 11.1 — WebSocket Event Field Reference (Actual Implementation)" documenting the exact fields of all 8 WS event types, including discrepancies from PRD Section 9.
6. Formally documented all 4 known bugs within the spec's "Known issues" sections.
7. Updated docs/memory/ACTIVITY_LOG.md.
8. Updated docs/memory/agents/prd-writer.md (this file).

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/PRD.md | MODIFIED (appended) | Added Section 11 (12 component specs) + Section 11.1 (WS event field reference) |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended task entry |
| docs/memory/agents/prd-writer.md | MODIFIED | Appended this session log |

### Improvements delivered
- Every Swarm component now has a testable specification that QA can use directly
- All 4 known bugs are formally documented with file, field, and impact description
- WS event field discrepancies between PRD and actual code are documented in one place
- The "Open Terminal" button root cause is fully traced (agent_status missing sessionId → agentState.sessionId never set → condition always false)
- handoff_completed is confirmed never emitted — FR-V3-43 is partially unimplemented

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| AgentNode.jsx path mismatch | Task prompt listed client/src/canvas/AgentNode.jsx but actual path is client/src/canvas/nodes/AgentNode.jsx | Used Glob to discover actual path | RESOLVED (documentation only) |
| HandoffEdge.jsx path mismatch | Same — actual path is client/src/canvas/edges/HandoffEdge.jsx | Same Glob approach | RESOLVED (documentation only) |

### Decisions I made
- Appended new section as "Section 11 — Component Specifications" rather than renaming the existing Section 11 (Open Questions) to preserve link stability for agents that reference it.
- Added Section 11.1 (WS Event Reference) as a sub-section rather than a separate numbered section to keep the TOC clean.
- Documented triggerStates/trigger_fired issue under both SwarmContext (Known Issues) and useSwarm (Known Issues) for maximum discoverability.

### What I learned
- `agent_status` events are the most under-specified: the PRD says they include `lastOutputSnippet` (they don't) and no one documented the missing `sessionId` field.
- TriggerManager emits `rss_item` (not `trigger_fired`) but this event name appears nowhere in the PRD, the client switch, or the store.
- The `onUpdateNode` prop gap in SwarmCanvas → AgentInspector is a silent latent bug — it will only surface when someone adds edit functionality to AgentInspector.
- `useInbox.js` uses `useSwarmStore.setState()` directly (bypassing defined actions) for the polling update path, which is an inconsistency with the rest of the store usage pattern.

### State I'm leaving behind
docs/PRD.md is fully updated. Section 11 covers all 12 Swarm components. Section 11.1 covers all 8 WS event types. Four known bugs are documented. All acceptance criteria are written as testable assertions.

### Handoff
- qa-tester: Use Section 11 acceptance criteria to write TEST GATE tests for each component.
- debugger: Prioritize the four "Known issues" entries — especially agent_status missing sessionId (blocks Open Terminal) and handoff_completed never emitted (FR-V3-43 gap).
- project-manager: Consider adding tasks for the 4 documented bugs if they are not already in TASK_PLAN.md.
---
## 2026-03-27 — Task: Write V3 PRD (Multi-Agent Swarm Orchestrator)
**Status:** COMPLETED
**Called by:** user (direct invocation with full context)

### Context when I started
V2.0 was release-ready as of 2026-03-26, with 31 tasks completed, 110 tests passing, 0 CVEs. The project already had a V1 PRD at docs/PRD.md written during the /create pipeline on 2026-03-18. The user provided a comprehensive brief covering the V3 vision (visual multi-agent Swarm Orchestrator), all user decisions from a discovery Q&A, technical research findings (HandoffParser FSM, PTY injection Ink workaround, React Flow v12 architecture), and 7 mandatory security requirements (SEC-V3-01 through SEC-V3-07).

### What I did
1. Read docs/memory/PROJECT.md, PROGRESS.md, CONTEXT.md, DECISIONS.md to understand the V2 state before writing.
2. Checked the existing docs/PRD.md (V1 PRD from 2026-03-18, version 1.0).
3. Wrote a complete V3 PRD replacing the V1 document at docs/PRD.md.
4. Structured the PRD with all 12 sections plus two appendices (Security Requirements and Phase Plan).
5. Ensured all 7 SEC-V3-* requirements were captured in FR form and in a dedicated Appendix A table.
6. Documented all 6 implementation phases in Appendix B.
7. Captured all user decisions as firm requirements (canvas always editable, __DONE__ soft-notify only, budget soft-warn only, HITL chat + PTY explosion, agent creation from scratch or existing .claude/agents/).
8. Documented the critical HandoffParser rolling accumulator constraint (ConPTY chunking) as FR-V3-14 and FR-V3-15.
9. Documented the Ink PTY injection sequence (\x03 + 300ms + text + \x1b + \r) as FR-V3-33.
10. Flagged 6 open questions for the architect.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/PRD.md | MODIFIED (full rewrite) | Replaced V1 PRD (2026-03-18) with V3 PRD (2026-03-27) for Swarm Orchestrator |
| docs/memory/agents/prd-writer.md | CREATED | This session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended this task entry |

### Improvements delivered
- Complete single-source-of-truth PRD for V3 implementation
- All 7 SEC-V3-* requirements in both FR section and dedicated Appendix A table
- All 6 implementation phases documented with exact file names
- All user decisions reflected as unambiguous requirements
- Critical ConPTY HandoffParser constraint captured as testable requirements
- Ink PTY injection workaround documented as FR
- 6 open questions flagged for architect

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| None | — | — | — |

### Decisions I made
- Replaced V1 PRD entirely rather than appending a new section. Rationale: V3 is a major architectural expansion; a single versioned document is cleaner for implementation agents than a patched V1.
- Used Appendix sections for Security and Phase Plan rather than inlining them. Rationale: keeps the main 12-section structure clean while preserving full detail for agents who need it.
- Captured `swarmListeners` Set as an open question (Q6) because it requires a non-destructive V2 file modification that the architect should specify precisely.

### What I learned
- The HandoffParser rolling accumulator is the single most critical implementation constraint — agents must understand ConPTY chunking before writing any parsing code.
- The Ink library PTY injection workaround (\x03 + delay + text + \x1b + \r) is non-obvious and will be a likely bug source if not documented prominently.
- The `write-file-atomic` vs `write-atomic` distinction (correct npm package is `write-file-atomic`) must be reiterated in V3 constraints because new agents may not read V2 decisions.

### State I'm leaving behind
docs/PRD.md is complete, version 3.0, status Draft. All 12 sections have real content. 6 open questions are flagged. The document is self-contained and ready to serve as the sole reference for the project-manager's TASK_PLAN.md construction and the architect's system design.

### Handoff
- Project Manager: read docs/PRD.md and build V3 tasks in docs/TASK_PLAN.md, starting from Phase 1.
- Architect: review Open Questions section (Section 11) before designing SwarmEngine and SessionManager integration. Specifically Q1 (scaffold model), Q5 (Zustand version), and Q6 (swarmListeners contract).
---
