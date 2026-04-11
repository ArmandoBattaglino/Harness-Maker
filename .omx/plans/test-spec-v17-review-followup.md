# Test Spec — V17 Code Review Follow-up / Fixture Publish Freshness

## Scope
Verification contract for `.omx/plans/prd-v17-review-followup.md`.

## Target
- Worktree: `C:\Users\arman\Downloads\Test workflows - Copia-v17`
- Branch: `feature/v17-pack-platform`
- Base: `fd40908` or descendant

## Test Matrix

### 1. HIGH — stale fixture result after pack update
Files:
- `server/stores/PackStore.js`
- `server/routes/packs.js`
- `server/tests/PackStore.test.js`
- `server/tests/pack-routes.test.js`

Required tests:
- Store test: create pack + fixture + runner-owned passing result, then `PackStore.update()`; fixture `lastResult` becomes `null`/non-publishable.
- Route/publish test: a fixture with `lastResult.ranAt < pack.updatedAt` is rejected even if it is runner-owned and passing.
- Route/publish test: a stale result produced before update cannot publish.
- Route/publish test: rerun fixture after update produces fresh result and publish becomes eligible.
- Publish gate checks `source`, `packId`, `packVersion`, valid `ranAt`, `ranAt >= pack.updatedAt`, non-empty assertions, all assertions passed.

### 2. MEDIUM — import rollback delete failure visibility
Files:
- `server/stores/PackStore.js`
- `server/tests/pack-distribution.test.js` or `server/tests/PackStore.test.js`

Required tests:
- Pack creation failure after workflow import still attempts rollback.
- If `workflowStore.delete()` returns `false`, thrown import error has internal rollback failure metadata.
- If `workflowStore.delete()` throws, thrown import error has internal rollback failure metadata.
- API route response, if covered, does not leak stack/path/internal rollback details.

### 3. LOW — PackLibrary stale run error on pack selection
Files:
- `client/src/views/PackLibraryView.jsx`
- `client/src/views/PackLibraryView.test.jsx`

Required tests:
- Pack A start returns 400 and displays error.
- Selecting Pack B clears the error.
- Existing successful start/hydration behavior remains unchanged.

### 4. LOW — `saveFixtureResult()` source hardening
Files:
- `server/stores/PackStore.js`
- `server/tests/PackStore.test.js`

Required tests:
- `saveFixture()` strips client-supplied `lastResult`.
- `saveFixtureResult()` forces `source: 'fixture-runner'` even if caller passes another source.
- `saveFixtureResult()` ensures `ranAt` if missing.
- Malformed result shapes cannot become publishable.

## Targeted Verification Commands

```powershell
cd "C:\Users\arman\Downloads\Test workflows - Copia-v17\server"
npm test -- tests/PackStore.test.js tests/pack-routes.test.js tests/pack-distribution.test.js tests/pack-contracts.test.js
```

```powershell
cd "C:\Users\arman\Downloads\Test workflows - Copia-v17\client"
npm test -- src/views/PackLibraryView.test.jsx
```

## Full Regression Commands

```powershell
cd "C:\Users\arman\Downloads\Test workflows - Copia-v17\server"
npm test
```

```powershell
cd "C:\Users\arman\Downloads\Test workflows - Copia-v17\client"
npm test
npm run build
```

```powershell
cd "C:\Users\arman\Downloads\Test workflows - Copia-v17"
git diff --check
```

## Diagnostics
Run diagnostics where available on:
- `server/stores/PackStore.js`
- `server/routes/packs.js`
- `server/services/packContracts.js` if changed
- `client/src/views/PackLibraryView.jsx`

If diagnostics reports `tsc skipped: no tsconfig found`, record as caveat rather than failure.

## Completion Criteria
- All four review findings fixed and tested.
- No CRITICAL/HIGH review finding remains.
- Targeted and full regression pass.
- Architect/code-reviewer verification approves.
- Docs/memory updated with exact evidence.
- Lore commit created.
