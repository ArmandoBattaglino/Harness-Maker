# PRD - V17.8 Code Review Fixes

## Metadata
- Date: 2026-04-11
- Branch: `feature/v17-pack-platform`
- Source: post-V17 code review report (`REQUEST CHANGES`)
- Context snapshot: `.omx/context/v17-code-review-fixes-20260411T133601Z.md`

## Problem
The V17 pack platform is implemented and heavily verified, but code review found merge-blocking correctness gaps around distribution atomicity and fixture release-gate integrity, plus several medium/low maintainability and UX concerns.

## Goals
1. Make pack import effectively atomic by rolling back workflow creation when pack creation fails.
2. Strengthen fixture assertion validation so malformed assertions cannot pass publish gates.
3. Surface PackLibrary launch/start errors in the operator UI.
4. Guard `PackStore.saveInstall()` against invalid caller-supplied install IDs.
5. Make pack delete semantics explicit and tested.
6. Normalize pack route error handling for all `statusCode` errors.
7. Reassess `chunkSizeWarningLimit`; avoid masking future bundle regressions.

## Non-goals
- No marketplace work.
- No multi-workflow pack composition.
- No actual video binary generation.
- No broad refactor of pack storage or Swarm runtime.
- No new dependency unless a test proves one is necessary.

## Scope
### P0 / blocking
- `PackStore.importBundle()` rollback on pack creation failure.
- Type-specific fixture assertion validation and defensive evaluation.

### P1 / should fix in same wave
- PackLibrary start error UI.
- `PackStore.saveInstall()` invalid ID guard.
- Pack delete semantics documented/tested.
- Pack route error handling consistency.

### P2 / polish
- Remove or reduce `chunkSizeWarningLimit` if build remains warning-free.

## Acceptance Criteria
- Invalid import leaves no dangling workflow.
- Malformed fixture assertions are rejected or fail closed; publish cannot pass with empty `expected` / missing artifact selectors.
- PackLibrary displays start errors without stale `packRun`/`packResult` hydration.
- Invalid install ID returns structured 400.
- Delete semantics are explicit and covered by tests.
- Pack route `statusCode` errors consistently preserve intended status.
- Full server suite passes.
- Full client suite passes.
- Client build passes without the prior Vite chunk warning.
- `git diff --check` passes.

## Available-Agent-Types Roster
- `executor` - implement focused fixes and tests.
- `test-engineer` - author failing tests first and verify coverage.
- `verifier` - run targeted/full suites and inspect outputs.
- `architect` - final STANDARD sign-off on storage/release-gate correctness.
- `writer` - update task plan/memory after implementation.

## ADR
### Decision
Fix review findings in a focused V17.8 stabilization wave.

### Drivers
- HIGH issues affect data integrity and release-gate trust.
- The fixes are bounded and testable.
- V17 should not merge with known bypassable publish gates.

### Alternatives Considered
1. Defer all findings until later: rejected because HIGH issues are merge-blocking.
2. Refactor PackStore/routes broadly: rejected as unnecessary scope expansion.
3. Focused test-first stabilization: chosen.

### Consequences
- Adds tests and small targeted code changes.
- Import and fixture/publish semantics become explicit.
- Bundle warning policy becomes intentional instead of accidental.
