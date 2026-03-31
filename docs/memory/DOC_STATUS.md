# Documentation Status
_Last updated: 2026-03-31 after Task #41: Post-Fix Regression QA — v3.0.0 confirmed stable (187/187 tests pass, all 113 tasks completed)_

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
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-31 | All 113 tasks COMPLETED. Tasks #32–#40 stale PENDING status corrected to COMPLETED. 187/187 regression tests pass at v3.0.0. Project confirmed stable. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-27 | Maintained by code-mapper. No changes from documenter. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-28 | V3 RELEASE-READY closure entry appended by project-manager and documenter. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | V1 audit. V3 audit is docs/security-v3-audit.md (Task #79). |
| docs/security-v3-audit.md | UP_TO_DATE | 2026-03-28 | BUG-99 fix note added: SEC-V3-01 now enforced via express.raw() — body-size bypass resolved. MEDIUM-V3-01 CSRF mismatch unchanged (not blocking; app is localhost-only). Verified clean at V3 RELEASE-READY closure. |
| Inline comments | UP_TO_DATE | 2026-03-28 | All V3 route files have comprehensive block comments. server/routes/swarm.js pause/resume comments reflect BUG-94/95 fixes. server/routes/triggers.js BUG-99 comment present. server/services/SwarmEngine.js getExecution(), getStatus(), stopExecution() all have accurate JSDoc. Verified clean at V3 RELEASE-READY closure. |
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
