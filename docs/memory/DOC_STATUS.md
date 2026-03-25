# Documentation Status
_Last updated: 2026-03-25 after Phase 9 Frontend Redesign Planning (9 tasks planned, no code changes)_

## Status Legend
- UP_TO_DATE — matches current code
- PARTIAL — partially updated, known gaps noted
- STALE — not yet updated for recent changes
- MISSING — should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-18 | Accurate for current v1.2 code. Will need updates after Phase 9 implementation (new navigation, new default view, design system changes). |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | Reflects post-hardening state: 3 MEDIUM FIXED, 1 MEDIUM dev-only open (MEDIUM-04 resolved by Task #21 vite upgrade), 4 LOW. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-18 | Backend architecture accurate. Frontend sections will need significant updates after Phase 9 implementation (new views, new navigation, design system). |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-18 | Core project description and constraints still accurate. Phase 9 is frontend-only and does not change stack or constraints. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-18 | All 10 decisions still apply. Phase 9 planning decisions (color, fonts, navigation) are recorded in CONTEXT.md and TASK_PLAN.md, not as formal DEC entries (they are design decisions, not architectural decisions). |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-25 | Updated by project-manager with Phase 9 pending section. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-24 | No code changed in this planning task. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-24 | No code changed in this planning task. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-25 | Updated by project-manager with Phase 9 planning entry. |
| Inline comments | UP_TO_DATE | 2026-03-18 | No code files modified. |
| docs/API.md | MISSING | — | API surface documented in ARCHITECTURE.md. Standalone file deferred. |
| docs/CONTRIBUTING.md | MISSING | — | Private tool; no external contributors. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 — Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- docs/TASK_PLAN.md Task #1 context — Still references node-pty-prebuilt-multiarch and write-atomic as planned packages. These are the original spec; corrections documented in PROGRESS.md.

## Upcoming Documentation Work (Phase 9)

When Phase 9 implementation begins, the following documents will need updates:

| Document | Section(s) affected | Trigger task |
|----------|---------------------|--------------|
| README.md | Features table (new views, navigation changes) | After Task #30 (App Shell Integration) |
| docs/ARCHITECTURE.md | Frontend component diagram, React state management, view routing | After Task #30 |
| docs/memory/PROJECT.md | Tech stack table (new fonts: Inter, Geist, JetBrains Mono; new icon library: Material Symbols Outlined) | After Task #23 (Design System Foundation) |
| Inline comments | New components will need why-not-what comments | After each Task #23-#30 |

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/API.md — standalone REST API reference | Medium | API is documented in ARCHITECTURE.md; standalone file needed only if consumers other than internal agents use the API |
| docs/CONTRIBUTING.md | Low | Private tool at v1; no external contributors currently |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally; gap is minor and tracked here |
| README — dev workflow section | Low | Internal dev workflow documented in CLAUDE.md; no duplication needed until project is opened |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn — deferred to v1.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path — deferred to v1.1 |
