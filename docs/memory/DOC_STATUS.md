# Documentation Status
_Last updated: 2026-03-27 after Tasks #43/#45: WorkflowStore.js + HandoffParser.js (V3 in progress)_

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-26 | Features table updated for Phase 9: 5 views, new design system, renamed features. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | Phase 9 is frontend-only; no security surface change. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-26 | Component diagram, React component tree, and Section 8 (State Management) updated for Phase 9: 5 views, AppContext, EntitiesView deprecated. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-25 | Tech stack table includes Phase 9 fonts and icons. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-18 | All 10 decisions still apply. Phase 9 design decisions documented in CONTEXT.md. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-26 | All 31 tasks marked COMPLETED including Phase 9. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-26 | Updated by code-mapper for Phase 9 tasks. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-26 | Updated by code-mapper for Phase 9 tasks. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-26 | All Phase 9 entries present. |
| Inline comments | UP_TO_DATE | 2026-03-26 | All Phase 9 view components have appropriate comments. |
| docs/API.md | MISSING | -- | API surface documented in ARCHITECTURE.md Section 2. Standalone file deferred. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. |

## New V3 Service Files (not yet in public docs — V3 incomplete)

| File | Status | Notes |
|------|--------|-------|
| server/services/WorkflowStore.js | UP_TO_DATE | New file (Task #43). Persistent workflow state store. Self-documenting code; no inline docs needed. Not yet reflected in ARCHITECTURE.md (V3 incomplete). |
| server/services/HandoffParser.js | UP_TO_DATE | New file (Task #45). Stateful rolling-buffer token extractor for ConPTY chunk-split handoff tokens. Well-documented inline. 22 unit tests in server/tests/HandoffParser.test.js. Not yet reflected in ARCHITECTURE.md (V3 incomplete). |
| server/index.js | UP_TO_DATE | Modified (Task #43). WorkflowStore initialization added at server startup. No documentation staleness — V3 architecture section in ARCHITECTURE.md does not exist yet. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- client/src/views/EntitiesView.jsx -- File still exists on disk but is no longer imported by App.jsx. Marked as DEPRECATED in ARCHITECTURE.md component tree. Can be deleted in a future cleanup.
- docs/ARCHITECTURE.md -- Does not yet include V3 components (WorkflowStore, HandoffParser, SwarmEngine, BroadcastService, etc.). Will require a major update when V3 is feature-complete.

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/API.md -- standalone REST API reference | Medium | API is documented in ARCHITECTURE.md; standalone file needed only if consumers other than internal agents use the API |
| docs/CONTRIBUTING.md | Low | Private tool at v1; no external contributors currently |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally; gap is minor and tracked here |
| README -- dev workflow section | Low | Internal dev workflow documented in CLAUDE.md; no duplication needed until project is opened |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn -- deferred to v1.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path -- deferred to v1.1 |
| Delete EntitiesView.jsx | Low | Dead code after Phase 9; kept for rollback safety |
| docs/ARCHITECTURE.md V3 section | High | Must be written once V3 feature set (SwarmEngine, WorkflowStore, HandoffParser, BroadcastService, SwarmCanvasView) is complete. Deferred intentionally -- documenting incomplete architecture creates false docs. |
| README.md V3 features | High | Must be updated once V3 ships. Currently README accurately describes v1.3 features only. Do not add V3 features until the V3 task plan is fully COMPLETED. |
