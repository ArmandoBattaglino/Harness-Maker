# Documentation Status
_Last updated: 2026-03-25 after Task #23: Design System Foundation_

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-18 | Still accurate -- Task #23 is internal design tokens only. Will need update after Task #30 (navigation/view changes). |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | Reflects post-hardening state. Phase 9 is frontend-only, no security surface change. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-18 | Component diagram still shows old 4-view layout (EntitiesView). Becomes stale after Task #24 (new sidebar) or Task #30 (app shell). Not stale yet because old views still exist in code. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-25 | Updated tech stack table with Inter, JetBrains Mono fonts and Material Symbols Outlined icons (Task #23). |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-18 | All 10 decisions still apply. Phase 9 design decisions are in CONTEXT.md. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-25 | Task #23 marked COMPLETED by project-manager. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-25 | Updated by code-mapper for Task #23 (expected). |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-25 | Updated by code-mapper for Task #23 (expected). |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-25 | Task #23 entries from frontend-dev, code-mapper, and documenter. |
| Inline comments | UP_TO_DATE | 2026-03-25 | New constants.js has adequate JSDoc. Modified files have appropriate comments. |
| docs/API.md | MISSING | -- | API surface documented in ARCHITECTURE.md. Standalone file deferred. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- docs/TASK_PLAN.md Task #1 context -- Still references node-pty-prebuilt-multiarch and write-atomic as planned packages. These are the original spec; corrections documented in PROGRESS.md.

## Upcoming Documentation Work (Phase 9)

When subsequent Phase 9 tasks complete, the following documents will need updates:

| Document | Section(s) affected | Trigger task |
|----------|---------------------|--------------|
| docs/ARCHITECTURE.md | Component diagram (4 views -> 5 views), React state management section, view routing | After Task #24 (New Sidebar) or Task #30 (App Shell Integration) |
| README.md | Features table (new views, navigation changes, design system mention) | After Task #30 (App Shell Integration) |
| Inline comments | New components will need why-not-what comments | After each Task #24-#30 |

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/API.md -- standalone REST API reference | Medium | API is documented in ARCHITECTURE.md; standalone file needed only if consumers other than internal agents use the API |
| docs/CONTRIBUTING.md | Low | Private tool at v1; no external contributors currently |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally; gap is minor and tracked here |
| README -- dev workflow section | Low | Internal dev workflow documented in CLAUDE.md; no duplication needed until project is opened |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn -- deferred to v1.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path -- deferred to v1.1 |
