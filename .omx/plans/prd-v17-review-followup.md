# PRD — V17 Code Review Follow-up / Fixture Publish Freshness

## Metadata
- Date: 2026-04-11
- Worktree: `C:\Users\arman\Downloads\Test workflows - Copia-v17`
- Branch: `feature/v17-pack-platform`
- Base commit: `fd40908 Stabilize V17 pack platform before release handoff` or descendant
- Context snapshot: `.omx/context/v17-review-followup-20260411T143742Z.md`
- Source: code review on commit `fd40908` returned `REQUEST CHANGES`
- Planning mode: RALPLAN consensus approved by Planner, Architect, Critic

## Problem
V17.8 closed the first code-review stabilization wave, but a follow-up review found one remaining HIGH publish-gate integrity issue and three smaller hardening/UX issues.

The release gate currently requires runner-owned `fixture.lastResult`, but it can still accept a valid old result after the pack is edited through `PackStore.update()`. That means publish evidence may not correspond to the current pack state.

## Goals
1. Ensure fixture publish evidence matches the current pack definition.
2. Fail closed when fixture result provenance/freshness cannot be proven.
3. Surface import rollback cleanup failure without leaking internals through API responses.
4. Clear stale PackLibrary run errors on selected pack changes.
5. Harden `saveFixtureResult()` so future internal callers cannot accidentally save non-runner-owned results.
6. Preserve the already-verified V17.0-V17.8 implementation and keep scope narrow.

## Non-goals
- No V17.0-V17.8 reimplementation.
- No new pack provenance/hash/checksum framework.
- No broad Store transaction framework.
- No marketplace or multi-workflow scope.
- No new dependencies.

## RALPLAN-DR Summary

### Principles
1. Publish evidence must match current pack state.
2. Release gates fail closed when evidence is stale, malformed, or unverifiable.
3. Keep changes surgical and test-first.
4. Prefer explicit invalidation plus publish-time verification over implicit trust.
5. Update docs/memory only from fresh evidence.

### Decision Drivers
1. HIGH issue blocks merge/release readiness.
2. File-based store favors simple invalidation and targeted rollback metadata.
3. Existing V17 tests are green, so the follow-up must preserve behavior and add regression coverage.

### Options Considered
#### Option A — Invalidate fixture results on `PackStore.update()`
- Pros: simple UX, explicit fail-closed semantics, easy to test.
- Cons: does not protect stale data already on disk by itself.

#### Option B — Publish-time freshness/provenance check
- Pros: protects the gate even when stale data remains persisted.
- Cons: depends on result metadata and timestamp parsing.

#### Option C — Version/hash-bound fixture provenance
- Pros: strongest long-term model.
- Cons: too broad for this follow-up.

### Decision
Use **Option A + Option B**: invalidate fixture `lastResult` on pack update and require publish-time freshness/provenance checks against the current pack.

## In Scope
### Finding 1 — HIGH: stale fixture result publish eligibility
Required implementation:
- `PackStore.update()` invalidates fixture `lastResult` for that pack.
- Publish gate checks current-pack provenance/freshness:
  - `lastResult.source === 'fixture-runner'`
  - `lastResult.packId === pack.id`
  - `lastResult.packVersion === pack.packVersion`
  - `lastResult.ranAt` parses to a valid timestamp
  - `lastResult.ranAt >= pack.updatedAt`
  - assertions array is non-empty
  - all last assertions passed
- `hasMeaningfulPassingFixture()` must evaluate fixture against the current pack, not fixture alone.

### Finding 2 — MEDIUM: import rollback delete failure not reported
Required implementation:
- `importBundle()` detects `workflowStore.delete(importedWorkflow.id)` returning `false`.
- `importBundle()` detects rollback delete throwing.
- Preserve original import failure while attaching internal rollback metadata such as `rollbackFailed` / `rollbackWorkflowId` / safe rollback error message.
- API responses must not leak stack/path/internal rollback details.

### Finding 3 — LOW: PackLibrary stale run error on selection
Required implementation:
- Clear `runError` when `selectedPackId` changes.
- Keep reset minimal; reset broader run state only if tests prove it is correct.

### Finding 4 — LOW: `saveFixtureResult()` source hardening
Required implementation:
- Require `lastResult` to be an object.
- Force `source: 'fixture-runner'`.
- Ensure `ranAt` server-side if missing.
- Do not transform malformed result state into publishable evidence.

## Acceptance Criteria
1. Work happens in `C:\Users\arman\Downloads\Test workflows - Copia-v17` on `feature/v17-pack-platform`.
2. Base is `fd40908` or a descendant.
3. `PackStore.update()` invalidates prior fixture `lastResult` for that pack.
4. Publish rejects stale persisted `lastResult` even if invalidation did not run.
5. Publish accepts a legitimate rerun fixture result after pack update.
6. Publish requires current-pack `packId`, `packVersion`, valid `ranAt >= pack.updatedAt`, runner source, non-empty passed assertions.
7. Import rollback delete `false` and throw are detected internally.
8. Rollback metadata does not leak sensitive internals through API responses.
9. PackLibrary clears run error on selected pack change.
10. `saveFixtureResult()` forces runner source and validates/normalizes result shape safely.
11. Regression tests cover all four findings.
12. Targeted server/client tests pass.
13. Full server suite passes.
14. Full client suite passes.
15. Client build passes.
16. `git diff --check` passes.
17. Diagnostics are run where available and recorded.
18. Docs/memory updated with real counts.
19. Architect/code-reviewer verification approves.
20. Lore commit created.

## Implementation Plan

### Phase 0 — Safety gate
- Confirm worktree/branch/HEAD:
  - `pwd`
  - `git branch --show-current`
  - `git status --short`
  - `git log -1 --oneline`

### Phase 1 — Baseline targeted tests
- Server targeted pack tests.
- Client PackLibrary targeted test.

### Phase 2 — Server publish freshness
- Add fixture result invalidation on `PackStore.update()`.
- Add publish-time freshness/provenance checks.
- Add tests for update-flow invalidation and stale persisted results.
- Add test that rerunning fixture restores publish eligibility.

### Phase 3 — Server rollback + result hardening
- Detect rollback delete false/throw in `importBundle()`.
- Harden `saveFixtureResult()` source/shape/ranAt.
- Add targeted tests.

### Phase 4 — Client UX
- Clear `runError` on selected pack change.
- Add PackLibrary test with two packs: pack A fails, selecting pack B clears error.

### Phase 5 — Verification and docs
- Run targeted tests, full regression, build, diff check, diagnostics.
- Update task plan/memory with real evidence.
- Run architect/code-reviewer verification.
- Commit with Lore protocol.

## ADR
### Decision
Fix review findings with explicit fixture-result invalidation plus publish-time freshness/provenance checks.

### Drivers
- Publish gates must validate current pack state.
- Follow-up must remain narrow and low-risk.
- File-based store favors simple invalidation over new provenance infrastructure.

### Alternatives Considered
- Timestamp-only freshness as sole control: rejected because it leaves stale data visible and relies on every result carrying correct metadata.
- Version/hash-bound provenance: deferred as future hardening, too broad now.
- Broad transaction framework: rejected as unnecessary for the current file-store scope.

### Consequences
- Editing a pack conservatively invalidates prior fixture results.
- Users must rerun fixtures after pack changes.
- Publish gate becomes robust even if stale results remain persisted.

### Follow-ups
- Consider pack contract hash/version-bound fixture provenance in a future release.
- Consider field-level non-invalidating metadata edits only after product requirements define them.

## Available-Agent-Types Roster
- `executor` — implement server/client fixes.
- `debugger` — isolate failing test behavior.
- `test-engineer` — targeted/full regression strategy.
- `security-reviewer` — publish gate and rollback trust boundary.
- `architect` — final freshness/rollback model review.
- `code-reviewer` — post-fix review against findings.
- `verifier` — evidence validation.
- `writer` — docs/memory/task-plan updates.

## Ralph Handoff
Recommended execution mode: `$ralph` sequential.

```text
$ralph Execute the V17 code review follow-up on C:\Users\arman\Downloads\Test workflows - Copia-v17, branch feature/v17-pack-platform, base fd40908 or descendant.
Do not redo V17.0-V17.8. Fix only the four code review findings in .omx/plans/prd-v17-review-followup.md and verify against .omx/plans/test-spec-v17-review-followup.md.
```

## Team Handoff
Team is optional; if used, merge server lanes because `PackStore.js` overlaps.
- Lane 1 server store/routes/tests: stale result, rollback, `saveFixtureResult`.
- Lane 2 client PackLibrary UX.
- Lane 3 verification/security/code review.
- Lane 4 docs/memory after evidence.
