# Documentation Status
_Last updated: 2026-03-28 after Task #82: V3 Documentation Update_

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-28 | V3 features table, Swarm quick-start guide, V3 constraints, Known Limitations updated for v3. All V2 sections preserved. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-28 | V3 Section 11 added (11.1 system diagram, 11.2 WS events, 11.3 WorkflowDefinition schema, 11.4 handoff protocol, 11.5 HITL flow, 11.6 key decisions, 11.7 security requirements, 11.8 service dependency graph, 11.9 React component tree). Version header updated to 3.0. ToC entry added. |
| docs/API.md | UP_TO_DATE | 2026-03-28 | Created from scratch. Covers all V1 + V3 endpoints: Projects, Sessions, Jobs, Agents, Skills, CLAUDE.md, Workflows, Swarm Execution, HITL Inbox, Triggers, WS channels (terminal + swarm). |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-28 | Version updated to v3.0, implementation status updated to complete. @anthropic-ai/sdk row added to tech stack. @xyflow/react and zustand rows updated (no longer "not yet imported"). V3-Specific Constraints section added (DEC-011 through DEC-016, SEC-V3-01 through SEC-V3-07). |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-27 | DEC-011 through DEC-016 added by architect during V3 tasks. No changes needed. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-28 | Task #82 will be added to completed list. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-28 | Task #82 entry appended. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | V1 audit. V3 audit is docs/security-v3-audit.md (Task #79). |
| docs/security-v3-audit.md | UP_TO_DATE | 2026-03-28 | Produced by security agent (Task #79). Covers all 7 SEC-V3 requirements. |
| Inline comments | UP_TO_DATE | 2026-03-28 | All V3 route files (swarm.js, inbox.js, triggers.js, workflows.js) have comprehensive block comments on every endpoint documenting request/response/error shapes. JSDoc on all factory functions. No changes needed from this task. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. Deferred. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- client/src/views/EntitiesView.jsx -- Still exists on disk but is no longer imported by App.jsx. Marked DEPRECATED in ARCHITECTURE.md component tree. Can be deleted in a future cleanup.

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/CONTRIBUTING.md | Low | Private tool at v3.0; no external contributors |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally |
| Delete EntitiesView.jsx dead code | Low | Kept for rollback safety; no functional impact |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn — deferred to v3.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path — deferred to v3.1 |
| Swarm execution state persistence | Medium | In-memory only in v3.0; restart clears all executions. Disk persistence planned for v3.1. |
| TriggerNode.jsx full visual implementation | Medium | TriggerNode is a stub (type: "trigger") — full live state subscription deferred (was Task #76 which was out of scope for v3.0 wave). |
