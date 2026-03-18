# Documentation Status
_Last updated: 2026-03-18 after Debug & Security Re-Audit (7 bug fixes, security re-audit with MEDIUM-04 + LOW-03/LOW-04 findings)_

## Status Legend
- UP_TO_DATE — matches current code
- PARTIAL — partially updated, known gaps noted
- STALE — not yet updated for recent changes
- MISSING — should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-18 | No user-visible behavior changed by the bug fixes. Security model description remains accurate. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | Updated for re-audit: MEDIUM-04 (vite/esbuild CVE, dev-only) and LOW-03 (process.env passthrough) and LOW-04 (safeRead bypass in claudemd GET) added. npm audit section updated with client/ findings. SEC-10 row and OWASP A06 row updated. Summary Verdict updated to reflect 4 LOW findings and 1 dev-only MEDIUM. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-18 | Two sections updated for bug fixes: (1) Backpressure — corrected from browser-API ws.bufferedAmount to server-side ws._socket.bufferSize; (2) YAML frontmatter parse algorithm — updated to regex-based implementation with non-object yaml.load return guard and error catch. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-18 | Updated in Task #15 to correct package names (node-pty, write-file-atomic) and add v1 implementation status. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-18 | All 10 decisions documented by architect. DEC-001 note: actual package is plain node-pty (not prebuilt-multiarch) — documented in PROJECT.md; DECISIONS.md preserves the original intent for historical accuracy. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-18 | Maintained by project-manager through Phase 6. v1 release-ready status established. |
| docs/memory/CODE_MAP.md | PARTIAL | 2026-03-18 | Maintained by code-mapper through Task #18. Bug-fix changes to 6 files (AddProjectModal, Sidebar, ProjectsView, useSession, SessionManager, frontmatter) may need an update pass by code-mapper. |
| docs/memory/CHANGELOG.md | PARTIAL | 2026-03-18 | Maintained by code-mapper through Task #18. Debug session changes not yet in CHANGELOG — code-mapper should append entries for the 7 bug fixes. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-18 | Updated by all agents. Includes debugger and security re-audit entries from this session. |
| Inline comments | UP_TO_DATE | 2026-03-18 | All modified functions have accurate why-not-what comments. SessionManager.js backpressure guard has an explanatory comment for why ws._socket.bufferSize is used instead of ws.bufferedAmount. frontmatter.js has accurate JSDoc. |
| docs/API.md | MISSING | — | No dedicated API reference file exists. API surface is documented inside docs/ARCHITECTURE.md. A standalone docs/API.md would improve discoverability but is not required for v1 release — architecture doc is the single source of truth. |
| docs/CONTRIBUTING.md | MISSING | — | No contributing guide exists. Appropriate for a private/internal tool at v1. If the project is opened to contributors, this should be created. |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 — Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. The decision text is historically accurate (it was the plan). The correction is recorded in PROJECT.md Key Constraints and in PROGRESS.md TASK-2 notes. No edits to DECISIONS.md made to preserve decision history.
- docs/memory/DECISIONS.md:DEC-001 and package sections in TASK_PLAN.md — TASK_PLAN.md tech stack table still lists node-pty-prebuilt-multiarch and write-atomic. These are the original planned package names; the corrections are in PROGRESS.md. Both places are internally consistent with their purpose (plan vs reality).
- docs/memory/CODE_MAP.md — may need code-mapper pass to reflect AddProjectModal, Sidebar, ProjectsView, useSession, SessionManager, frontmatter changes from the debug session.
- docs/memory/CHANGELOG.md — 7 bug fixes from the debug session are not yet recorded as CHANGELOG entries.

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/API.md — standalone REST API reference | Medium | API is documented in ARCHITECTURE.md; standalone file needed only if consumers other than internal agents use the API |
| docs/CONTRIBUTING.md | Low | Private tool at v1; no external contributors currently |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally; gap is minor and tracked here |
| README — dev workflow section | Low | Internal dev workflow documented in CLAUDE.md; no duplication needed in public README until project is opened |
| SECURITY_AUDIT.md MEDIUM-04 fix | Low | Upgrade vite in client/package.json to patch esbuild CVE — dev-only, deferred to v1.1 |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn — deferred to v1.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path — deferred to v1.1 |
