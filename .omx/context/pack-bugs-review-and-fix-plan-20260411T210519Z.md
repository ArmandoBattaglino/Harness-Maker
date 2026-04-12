# Task Context Snapshot

- Task statement: Review the identified pack-related bugs and build a correct fix plan before implementation.
- Desired outcome: A consensus plan that fixes the real bugs, restores trustworthy verification, and adds the missing smoke coverage for pack creation/output.

## Known facts / evidence
- Code review found one concrete likely product bug: `client/src/views/PackLibraryView.jsx` keeps `runInput` when switching packs, while only `runError` is cleared. This can leak fields from one pack into another launch payload.
- Targeted verification shows current pack-related client tests pass:
  - `npm test --prefix client -- src/views/PackLibraryView.test.jsx src/views/MarketingVideoHarness.e2e.test.jsx src/hooks/usePack.test.jsx src/store/SwarmContext.test.jsx src/hooks/useSwarm.test.jsx` => 28/28 PASS
  - `npm test --prefix client -- src/views/PackBuilderView.test.jsx` => 1/1 PASS
  - `npm run build --prefix client` => PASS
  - `npm run test:playwright:v17-review-followup` => PASS
- Targeted server verification is not clean:
  - `npm test --prefix server -- tests/pack-routes.test.js tests/PackStore.test.js tests/pack-distribution.test.js tests/pack-contracts.test.js tests/pack-resolver.test.js tests/pack-result-builder.test.js tests/marketing-video-harness-stress.test.js`
  - Result: 54/57 PASS, 3 FAIL, all in `server/tests/marketing-video-harness-stress.test.js`
- The failing marketing-video stress test is stale versus current route contracts:
  - `POST /api/v1/packs/:id/start` now requires a registered project via `ConfigStore.getProjects()`.
  - `POST /api/v1/packs/:id/fixtures/:fixtureId/run` now requires a real `executionId` UUID and execution-backed result lookup.
- Current route implementation lines of interest:
  - `server/routes/packs.js`: project resolution + projectPath enforcement + input validation in start route; execution-backed fixture run contract; publish gate freshness/provenance checks.
- Current UI lines of interest:
  - `client/src/views/PackLibraryView.jsx`: selection state, input coercion, launch flow, result polling, no reset of `runInput` on pack change.
- Existing smoke coverage is limited:
  - `scripts/v17-review-followup-playwright-smoke.mjs` verifies publish freshness/provenance and PackLibrary error clearing.
  - It does not cover Pack Builder -> create draft -> pack appears -> launch -> final output.

## Constraints
- No new dependencies.
- Keep diffs small and reversible.
- Prefer fixing tests to match real product contracts only when the product behavior is already correct.
- Need trustworthy verification, including a targeted Playwright smoke for user-visible behavior impacted by changes.

## Unknowns / open questions
- Whether `runInput` should reset on every pack change or selectively preserve only shared keys.
- Whether a builder-to-library smoke should be API-seeded or UI-driven through Pack Builder creation flow.
- Whether any additional server-side contract drift exists beyond the three failing marketing stress assertions.

## Likely touchpoints
- `client/src/views/PackLibraryView.jsx`
- `client/src/views/PackLibraryView.test.jsx`
- `client/src/views/PackBuilderView.jsx`
- `client/src/views/PackBuilderView.test.jsx`
- `server/routes/packs.js`
- `server/tests/marketing-video-harness-stress.test.js`
- `scripts/v17-review-followup-playwright-smoke.mjs` or a new targeted pack smoke script
