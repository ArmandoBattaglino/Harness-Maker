# Context Snapshot - V17 Review Follow-up Plan

## Task statement
User invoked `$ralplan` to read the code-review findings for commit `fd40908` and update the plan for later `$ralph` execution.

## Desired outcome
Create a concise consensus plan and execution handoff for Ralph to fix the review findings without broadening scope.

## Known facts/evidence
- Target worktree: `C:\Users\arman\Downloads\Test workflows - Copia-v17`.
- Target branch: `feature/v17-pack-platform`.
- Reviewed commit: `fd40908 Stabilize V17 pack platform before release handoff`.
- Previous V17.8 evidence was green, but code review returned REQUEST CHANGES.
- Blocking HIGH finding: stale fixture `lastResult` can remain publish-eligible after `PackStore.update()` changes a pack. Publish currently checks runner-owned result but not freshness vs current pack definition.
- MEDIUM finding: `importBundle()` rollback ignores a false return from `workflowStore.delete(importedWorkflow.id)`.
- LOW finding: `PackLibraryView` run error can persist when selecting another pack.
- LOW finding: `saveFixtureResult()` is public and should validate/force runner-owned `lastResult` shape to reduce future misuse.

## Constraints
- Do not reimplement V17.0-V17.7.
- Work only in `feature/v17-pack-platform` worktree.
- Keep follow-up narrow and test-first.
- Preserve existing passing behavior and evidence discipline.
- No new dependencies.
- Mutating route and path-safety rules remain active.

## Likely codebase touchpoints
- `server/stores/PackStore.js`
- `server/routes/packs.js`
- `server/services/packContracts.js` if validator reuse is needed
- `server/tests/PackStore.test.js`
- `server/tests/pack-routes.test.js`
- `server/tests/pack-distribution.test.js`
- `client/src/views/PackLibraryView.jsx`
- `client/src/views/PackLibraryView.test.jsx`
- `docs/TASK_PLAN.md`
- `docs/memory/*`

## Proposed focus
Follow-up stabilization area V17.8.1 / V17.9: close code review findings by invalidating or freshness-checking fixture results after pack changes, surfacing rollback failure metadata, clearing stale PackLibrary errors on selection change, and hardening `saveFixtureResult()` against misuse.
