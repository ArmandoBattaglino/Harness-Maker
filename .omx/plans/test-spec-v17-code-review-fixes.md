# Test Spec - V17.8 Code Review Fixes

## Scope
Verification contract for `.omx/plans/prd-v17-code-review-fixes.md`.

## Test Matrix

### P0-1 Import rollback
Files:
- `server/stores/PackStore.js`
- `server/tests/pack-distribution.test.js` or `server/tests/PackStore.test.js`

Tests:
- workflow create succeeds, pack create/validation fails -> imported workflow is deleted/rolled back.
- workflow create fails -> no pack is written.
- happy import still creates pack + workflow and rebinds workflow dependency.

Commands:
```powershell
cd server
npm test -- tests/pack-distribution.test.js tests/PackStore.test.js
```

### P0-2 Fixture assertion validation / publish gate
Files:
- `server/services/packContracts.js`
- `server/routes/packs.js`
- `server/tests/pack-routes.test.js`
- `server/tests/pack-contracts.test.js`

Tests:
- `outputIncludes` without `expected` rejected.
- `outputIncludes` with empty `expected` rejected.
- `outputIncludes` without `outputKey` rejected or explicitly defaults to `result` with non-empty expected.
- `artifactExists` without `artifactId` and `artifactName` rejected.
- `statusEquals` without non-empty `expected` rejected.
- malformed persisted assertions fail closed in runner.
- publish blocked unless at least one fixture has a meaningful passing lastResult.

Commands:
```powershell
cd server
npm test -- tests/pack-routes.test.js tests/pack-contracts.test.js
```

### P1-1 PackLibrary start errors
Files:
- `client/src/views/PackLibraryView.jsx`
- `client/src/views/PackLibraryView.test.jsx`

Tests:
- `POST /packs/:id/start` returns 400 -> UI displays error.
- failed start does not hydrate stale `packRun`/`packResult`.
- successful start still hydrates terminal result.

Commands:
```powershell
cd client
npm test -- src/views/PackLibraryView.test.jsx
```

### P1-2 saveInstall invalid IDs
Files:
- `server/stores/PackStore.js`
- `server/tests/PackStore.test.js`

Tests:
- `saveInstall({ id: '../bad', ... })` rejects with `statusCode=400`.
- valid install still persists.

### P1-3 Delete semantics
Files:
- `server/stores/PackStore.js`
- `server/tests/PackStore.test.js`

Choose and test one semantics:
- Cascade delete versions/fixtures for deleted pack; or
- Retain version/fixture data intentionally but prove deleted pack cannot be resurrected/listed.

Preferred: cascade current pack versions + fixtures; keep installs as provenance unless explicitly deleting installed records.

### P1-4 Route error consistency
Files:
- `server/routes/packs.js`
- `server/tests/pack-routes.test.js`

Tests:
- publish route preserves thrown `statusCode` via `respondKnownRouteError`.
- versions list route preserves store `statusCode` if thrown.

### P2 Chunk warning policy
Files:
- `client/vite.config.js`

Tests/verification:
- remove or lower `chunkSizeWarningLimit` if `npm run build` remains warning-free.
- if threshold retained, document why in comment and keep it narrowly justified.

## Final Verification
```powershell
cd server
npm test
```

```powershell
cd client
npm test
npm run build
```

```powershell
git diff --check
```

## Completion Criteria
- All P0/P1 items implemented or explicitly documented as accepted deferral.
- No CRITICAL/HIGH code review findings remain.
- Full suites/build pass.
- Lore-style commit created and pushed.
