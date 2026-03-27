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
