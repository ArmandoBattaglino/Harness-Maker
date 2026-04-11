# V17 Test Coverage Matrix

**Created:** 2026-04-11  
**Scope:** V17.0-V17.7 pack platform / vertical harness builder bridge.  
**Policy:** This hardening wave is test-first and contract-boundary focused. Product/runtime changes are allowed only when a new test exposes a real defect.

## Coverage by Area

| V17 Area | Contract / Behavior | Automated Coverage | Notes |
|---|---|---|---|
| V17.0 Program contract | Pack/workflow authority, one-workflow-per-pack, guided toolkit framing | `docs/PACK_PLATFORM_DESIGN.md`, `docs/TASK_PLAN.md`, this matrix | Documentation/design-only phase; no runtime test expected. |
| V17.1 Domain foundation | PackStore CRUD, versions, fixtures, installs, path safety, route bootstrap, `usePack` | `server/tests/PackStore.test.js`, `server/tests/pack-routes.test.js`, `client/src/hooks/usePack.test.jsx` | App-level `/api/v1/packs` + CSRF coverage added in hardening. |
| V17.2 Contract layer | Ajv Draft 2020-12, input/output schemas, `knowledgeSources`, `behaviorRules`, artifacts, dependencies, semver | `server/tests/pack-contracts.test.js`, `server/tests/PackStore.test.js`, `server/tests/pack-routes.test.js` | Defaults/fileRef are validated as schema metadata only; runtime does not auto-fill defaults or upload files. |
| V17.3 Runtime wrapper | PackResolver, pack start, reserved inputs, pack metadata, visible steps, pack results, client hydration | `server/tests/pack-resolver.test.js`, `server/tests/pack-routes.test.js`, `server/tests/pack-result-builder.test.js`, `server/tests/execution-results-api.test.js`, `client/src/hooks/useSwarm.test.jsx`, `client/src/store/SwarmContext.test.jsx` | Tests assert pack metadata is additive and workflow-only runs stay valid. |
| V17.4 Builder | Pack Builder route, guided authoring sections, workflow drill-down, lifecycle lock | `client/src/views/PackBuilderView.test.jsx`, `server/tests/PackStore.test.js`, `client/src/store/AppContext.test.jsx` | Builder state remains local UI state; SwarmView remains workflow drill-down. |
| V17.5 Operator | Pack Library/detail/run, generated form, project binding, monitor, artifacts, debug drawer | `client/src/views/PackLibraryView.test.jsx`, `client/src/hooks/usePack.test.jsx`, `client/src/hooks/useSwarm.test.jsx` | Launch test covers explicit `projectId` + `projectPath`. |
| V17.6 Distribution | Export/import/install/fork, manifest, provenance, dependency rebinding | `server/tests/pack-distribution.test.js`, `server/tests/pack-routes.test.js`, `client/src/views/PackLibraryView.test.jsx` | Local-only JSON bundle semantics; no marketplace/network assumptions. |
| V17.7 Fixtures/release gates | Fixture persistence, deterministic assertions, publish gate | `server/tests/pack-routes.test.js`, `server/tests/PackStore.test.js`, `client/src/views/PackBuilderView.test.jsx` | Live provider fixture execution remains optional/manual. |

## Legacy Compatibility Invariants

- Workflow-only status/results/history payloads work without `packRun` / `packResult`.
- Pack metadata is emitted only when present and remains additive.
- Client reset / workflow switching clears pack runtime metadata.
- Existing SwarmView route remains reachable after Pack Builder and Packs routes were added.

## Required Verification Commands

```powershell
cd server
npm test
```

```powershell
cd client
npm test
npm run build
```

## Optional Manual Smoke

Provider-backed browser launch remains optional because it depends on local credentials/provider availability:

1. Create/edit pack in Pack Builder.
2. Open Packs library.
3. Bind an explicit project.
4. Launch pack and inspect monitor/debug drawer.
5. Export/import/fork.
6. Run fixture/publish gate.
