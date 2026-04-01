# Documentation Status
_Last updated: 2026-03-31 after Swarm Audit — 4 new post-release bugs found (BUG-AUDIT-1 through BUG-AUDIT-4), Tasks #120-122 in progress_

## Release Status
**v3.0.0 — RELEASED 2026-03-31**
- QA inspection: CLEAN at release — zero bugs found at release gate
- Test suite: 187/187 passing (at release)
- Tasks completed: 119/115 (Tasks #116-118 are post-release Swarm bug fixes; Task #119 QA regression check completed)
- Open bugs: 4 (BUG-AUDIT-1 through BUG-AUDIT-4 — post-release Swarm audit; fixes in progress as Tasks #120-122)

## Open Bugs (post-release Swarm audit — fixes in progress)

| ID | Severity | Description | Task | Status |
|----|----------|-------------|------|--------|
| BUG-AUDIT-4 | MEDIUM | useInbox.js hook is implemented but not mounted by any component — HitlInbox or equivalent does not call it, so inbox polling never starts | #122 | IN PROGRESS |

## Fixed Bugs (v3.0.0 post-release patches)

| ID | Severity | Description | Task | Status |
|----|----------|-------------|------|--------|
| BUG-AUDIT-1 | CRITICAL | AgentInspector hidden in idle state — was gated behind showSidePanels; now always rendered (component has its own empty state) | #120 | FIXED 2026-03-31 |
| BUG-AUDIT-2 | CRITICAL | PtyExplosion not reachable from UI — "Open Terminal" button added to AgentInspector; calls setPtyExplosionNodeId when sessionId present | #121 | FIXED 2026-03-31 |
| BUG-AUDIT-3 | HIGH | PtyExplosion entry point missing — resolved alongside BUG-AUDIT-2 by wiring the button in AgentInspector | #121 | FIXED 2026-03-31 |
| BUG-SWARM-1 | HIGH | Swarm nodes invisible after generation — fitView not firing after node mount | #116 | FIXED 2026-03-31 |
| BUG-SWARM-2 | HIGH | Node style had `opacity: 0` + staggered animation — corrupted React Flow ResizeObserver bounding box | #116 | FIXED 2026-03-31 |
| BUG-SWARM-3 | MEDIUM | `workflowDef` lost on navigation — moved from local useState to Zustand (useSwarmStore) | #117 | FIXED 2026-03-31 |
| BUG-SWARM-4 | LOW | Missing null guard in `useSwarm.startExecution` — throws `Error('No workflow selected')` on undefined workflowId | #118 | FIXED 2026-03-31 |

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-31 | Task #112: Removed ANTHROPIC_API_KEY requirement from Swarm Quick Start step 2, removed "Environment Variable Required for Swarm" section, updated Known Limitations entry. Prompt-to-Flow now uses claude binary — no API key needed. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-31 | Task #112: DEC-016 updated — Prompt-to-Flow now spawns claude binary (-p/--output-format json), not Anthropic SDK. swarmRoutes accepts claudeBin as 3rd param. Previous entry: Section 11.5 HITL flow, Section 11.9 component tree — all still accurate. |
| docs/API.md | UP_TO_DATE | 2026-03-28 | pause endpoint: full state update + WS broadcast (BUG-94). resume endpoint: actual resumeExecution() behavior (BUG-95). budget field in status response: real budgetTracker data (BUG-98). Verified clean at V3 RELEASE-READY closure. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-28 | Version updated to v3.0, implementation status updated to complete. @anthropic-ai/sdk row added to tech stack. @xyflow/react and zustand rows updated (no longer "not yet imported"). V3-Specific Constraints section added (DEC-011 through DEC-016, SEC-V3-01 through SEC-V3-07). |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-27 | DEC-011 through DEC-016 added by architect during V3 tasks. No changes needed. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-31 | All 115 tasks COMPLETED. Tasks #32–#40 stale PENDING status corrected to COMPLETED. 187/187 regression tests pass at v3.0.0. Project confirmed stable. Zero open bugs. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-28 | V3 RELEASE-READY closure entry appended by project-manager and documenter. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | V1 audit. V3 audit is docs/security-v3-audit.md (Task #79). |
| docs/security-v3-audit.md | UP_TO_DATE | 2026-03-28 | BUG-99 fix note added: SEC-V3-01 now enforced via express.raw() — body-size bypass resolved. MEDIUM-V3-01 CSRF mismatch unchanged (not blocking; app is localhost-only). Verified clean at V3 RELEASE-READY closure. |
| Inline comments | UP_TO_DATE | 2026-03-31 | All V3 route files have comprehensive block comments. server/routes/swarm.js pause/resume comments reflect BUG-94/95 fixes. server/routes/triggers.js BUG-99 comment present. server/services/SwarmEngine.js getExecution(), getStatus(), stopExecution() all have accurate JSDoc. Post-release patch: SwarmCanvas.jsx useEffect comment updated (fitView rationale). SwarmContext.jsx workflowDef field comment added (BUG-SWARM-3). useSwarm.js startExecution null guard comment already present via throw. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. Deferred indefinitely. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- client/src/views/EntitiesView.jsx -- Still exists on disk but is no longer imported by App.jsx. Marked DEPRECATED in ARCHITECTURE.md component tree. Can be deleted in a future cleanup.
- docs/memory/CODE_MAP.md:TriggerNode entry -- Still contains "(stub)" notation from Task #53.3; Task #76 fully implemented TriggerNode with store subscription, fired animation, and timestamp display. Code-mapper should update the map entry.

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/CONTRIBUTING.md | Low | Private tool at v3.0; no external contributors |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally |
| Delete EntitiesView.jsx dead code | Low | Kept for rollback safety; no functional impact |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn — deferred to v3.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path — deferred to v3.1 |
| Swarm execution state persistence | Medium | In-memory only in v3.0; restart clears all executions. Disk persistence planned for v3.1. |
| docs/memory/CODE_MAP.md TriggerNode "(stub)" notation | Low | Code-mapper should update the map entry — TriggerNode is now fully implemented (Task #76). |
| MEDIUM-V3-01 (webhook CSRF mismatch) | Medium | Functional issue: external callers receive 403. Fix is CSRF exemption path in server/middleware/csrf.js. Not blocking v3.0 (app is localhost-only). |
