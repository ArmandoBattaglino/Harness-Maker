# Test Spec — V17 Pack Platform / Vertical Harness Builder Bridge

## Scope
Verification contract for the V17.x program described in `.omx/plans/prd-v17-pack-platform.md`.

## Test Objectives
1. Preserve existing workflow CRUD/versioning and swarm execution behavior.
2. Prove that the four authoring surfaces become explicit, validated, and executable:
   - input schema
   - knowledge/context injection
   - prompt/behavior rules
   - output schema/artifacts
3. Prove that builder and operator surfaces support the intended guided-toolkit model.
4. Prove that V17 remains one-workflow-per-harness.
5. Prove that local distribution and release gates work without marketplace assumptions.

## Area-by-Area Test Matrix

### V17.0 — Docs and planning contract
- **Checks**
  - `docs/TASK_PLAN.md` V17 sections use terminology consistent with harness-builder intent.
  - `docs/PACK_PLATFORM_DESIGN.md` defines the four authoring surfaces explicitly enough for later areas.
  - `docs/PACK_PLATFORM_DESIGN.md` defines the pack/workflow authority model and runtime precedence matrix explicitly.
  - The PRD/test-spec/deep-interview artifacts agree on non-goals and decision boundaries.
- **Evidence**
  - doc diff / review notes
  - consistency review pass for task #615

### V17.1 — Domain foundation
- **Unit / store tests**
  - PackStore init/list/get/create/update/delete
  - path safety and malformed-file handling
  - version save/list/get/restore behavior
- **Route tests**
  - `/api/v1/packs` CRUD
  - `/api/v1/packs/:id/versions`
  - `/api/v1/packs/:id/versions/:timestamp/restore`
- **Regression**
  - existing `/api/v1/workflows` tests remain green
  - server bootstrap still initializes legacy stores and new PackStore together

### V17.2 — Contract layer
- **Validator tests**
  - valid/invalid input schema field definitions
  - valid/invalid knowledge/context injection definitions
  - valid/invalid prompt/behavior rule definitions
  - valid/invalid output schema and artifact definitions
  - engineCompatibility and dependency validation
  - precedence/merge rule coverage for workflow base context + pack overlays + behavior rules
- **Integration tests**
  - PackStore rejects invalid contracts
  - pack routes reject malformed payloads with explicit errors
  - client hook shape matches server contract

### V17.3 — Runtime wrapper
- **Integration tests**
  - pack start route resolves pack → workflow and launches via existing swarm engine
  - pack inputs bind safely into workflow context
  - pack knowledge/context overlays merge according to the documented precedence rules
  - pack behavior rules apply according to the documented precedence rules
  - runtime metadata appears in execution snapshot/status/hydration
  - result assembly reflects declared outputs/artifacts
  - blockers/failures map to pack-level states without breaking workflow-only execution
  - execution history/results persistence carries additive `packId` / `packVersion` metadata without breaking workflow-only history lookups
- **Regression**
  - existing workflow-only start/status/results tests remain green
  - existing `useSwarm` hydration behavior remains green for non-pack flows

### V17.4 — Builder authoring platform
- **Client tests**
  - PackBuilder shell routing and load states
  - overview/workflow-link editor
  - input schema editor
  - knowledge/context injection editor
  - behavior-rule editor
  - output/artifact editor
  - runtime/dependency editor
  - visible-step mapper + operator preview
  - lifecycle state enforcement in builder UI
- **Behavior checks**
  - guided editors work without requiring raw JSON editing
  - author can still open/reach underlying workflow details
  - pack-facing edits and workflow drill-down edits respect the authority model
- **Regression**
  - existing Swarm builder/editor views still work
  - client build passes

### V17.5 — Operator surface
- **Client tests**
  - Pack Library and Pack Detail pages
  - generated run form from input schema
  - run monitor timeline / artifact display
  - debug drawer isolation for builder/admin users
  - pack-specific selectors and restoration
  - explicit project-binding flow in pack-first launch UX
- **Behavior checks**
  - operator can launch and observe a harness without opening the graph
  - advanced workflow/debug detail remains reachable but not default

### V17.6 — Distribution
- **Integration tests**
  - export bundle includes required manifest/data
  - import validates compatibility and rejects invalid archives
  - install/fork/version pinning/provenance behavior works locally
- **Regression**
  - no hidden workspace assumptions
  - no marketplace-specific dependencies introduced

### V17.7 — Fixtures and release gates
- **Integration tests**
  - PackFixture persistence and CRUD
  - fixture runner executes against pack runs
  - assertions evaluate deterministically
  - publish gate blocks invalid or unverified packs
  - builder dry-run/pre-publish UX surfaces failures clearly
- **Regression**
  - publish-state transitions remain controlled and reproducible

## Cross-Cutting Manual Smokes
1. Create a harness from an existing workflow.
2. Configure the four authoring surfaces.
3. Run the harness without opening the graph first.
4. Open advanced debug / workflow detail and confirm drill-down access.
5. Export and re-import the harness locally.
6. Run fixture verification and publish gate.

## Verification Commands / Evidence Expectations
- Server test suites covering new stores/routes/runtime changes
- Client test suites covering new builder/operator surfaces
- Client build pass when V17.4/V17.5 change client code
- Document review evidence for V17.0 terminology alignment
- Evidence that the precedence matrix and authority model are enforced rather than only described
- Final verifier/architect sign-off that legacy workflow behavior remains intact and the harness-first product framing is preserved

## Failure Conditions
- Any V17 area advances without explicit coverage of the four authoring surfaces where applicable.
- Existing workflow routes/runtime regress.
- Authority/precedence between pack and workflow layers is left implicit.
- Pack/harness authoring hides workflow internals completely.
- V17 scope drifts into marketplace or multi-workflow orchestration.

## Team Verification Path
- **Backend lane proves:** PackStore, contracts, runtime wrapper, distribution, fixtures/release gates.
- **Client lane proves:** PackBuilder, Pack Library/Detail/Run UX, drill-down behavior, build health.
- **Docs/planning lane proves:** terminology alignment and four-surface traceability.
- **Final verifier/Ralph proves:** cross-area regressions, end-to-end manual smoke, and sign-off against the PRD acceptance criteria.
