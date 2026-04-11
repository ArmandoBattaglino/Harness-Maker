# Pack Platform Design

**Status:** Drafted for implementation planning on 2026-04-11  
**Program:** V17.x Pack Platform  
**Primary source of truth:** [docs/TASK_PLAN.md](./TASK_PLAN.md) for execution, this document for design/contracts/checkpoints

## 1. Purpose

This document defines the target architecture for evolving the current workflow-first Swarm system into a pack-aware platform that acts as the implementation bridge toward a **vertical harness builder**.

The goal is not to replace workflows. The goal is to introduce a second product-level object that can be authored, validated, executed, and distributed on top of the existing runtime while shifting the product from a generic flow builder toward guided harness authoring:

- `Workflow` = internal orchestration asset
- `Pack` = product-level harness wrapper and distributable product asset
- `PackRun` = execution instance of a pack

## 2. Current State

The repository is currently workflow-first and runtime-first.

Current relevant primitives already exist:

- workflow persistence and versioning in [server/services/WorkflowStore.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/services/WorkflowStore.js)
- workflow execution and runtime orchestration in [server/services/SwarmEngine.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/services/SwarmEngine.js)
- workflow execution routes in [server/routes/swarm.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/routes/swarm.js)
- workflow CRUD and template routes in [server/routes/workflows.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/routes/workflows.js)
- execution hydration/state in [client/src/store/SwarmContext.jsx](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/store/SwarmContext.jsx)
- swarm lifecycle wiring in [client/src/hooks/useSwarm.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/hooks/useSwarm.js)
- workflow settings/editor surfaces in [client/src/canvas/WorkflowSettingsModal.jsx](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/canvas/WorkflowSettingsModal.jsx) and [client/src/views/SwarmView.jsx](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/views/SwarmView.jsx)

What does **not** exist yet:

- a first-class pack domain object
- pack contracts for input/output/artifacts
- pack-aware runtime wrapper
- pack builder UI
- pack distribution lifecycle
- pack release gates and fixtures

## 3. Goals

The V17.x program must make the following true:

1. Technical users can turn an existing workflow into a productized pack without mutating the workflow model itself.
2. Packs declare structured inputs, outputs, artifacts, visible steps, runtime policy, and dependencies.
3. Packs execute through the current Swarm runtime instead of introducing a parallel execution engine.
4. Operator-facing surfaces can run and observe packs without requiring the Swarm canvas.
5. Packs can be exported, imported, installed, forked, and version-pinned locally.
6. Published packs have reproducible fixture-based quality gates.
7. The product must move toward a **guided harness-authoring toolkit** where domain experts get explicit control over:
   - input schema
   - knowledge/context injection
   - prompt/behavior rules
   - output schema and final artifacts
8. The current workflow editor remains reachable as the advanced technical drill-down surface instead of being hidden completely.

## 4. Non-Goals For V1

- No workflow migration or forced conversion into packs.
- No public marketplace.
- No multi-workflow pack composition in v1.
- No XState/statechart rewrite of the engine.
- No generic schema-to-form framework as the primary UX.

## 5. Canonical Nouns

These names are locked for the V17.x program and should be used consistently across code, docs, tests, and routes.

### PackDefinition

Persistent product-level wrapper around one workflow, containing product metadata and contracts.

Required v1 fields:

- `id`
- `name`
- `description`
- `category`
- `workflowId`
- `packVersion`
- `status`
- `engineCompatibility`
- `visibility`
- `runtimePolicy`
- `dependencies`
- `inputSchema`
- `knowledgeSources`
- `behaviorRules`
- `outputSchema`
- `artifactDefinitions`
- `visibleSteps`
- `completionCriteria`
- `createdAt`
- `updatedAt`

### PackVersion

Immutable saved version of a pack. Draft edits create or mutate draft state; publish operations freeze a version.

### PackRun

Runtime execution envelope for one pack launch. The underlying execution still uses the existing Swarm engine.

### PackInstall

Installed/forked copy of a pack with provenance and version pinning metadata.

### PackFixture

Saved test input set plus expected checks for pre-publish or regression validation.

### PackRuntimePolicy

Declarative runtime configuration for a pack. This is not UI-only metadata.

### PackDependency

Manifest entry for workflow, agent, skill, or context overlay used by a pack.

### KnowledgeSource

Declarative description of how domain knowledge or contextual overlays enter a pack run. Examples include structured overlays, reusable context bundles, and runtime-selected context references. This is a first-class harness-authoring surface, not an implicit workflow-only concern.

### BehaviorRule

Declarative rule that shapes how the harness should behave at runtime above the underlying workflow defaults. Examples include prompt directives, tone/format constraints, escalation rules, or guardrail instructions. This is a first-class harness-authoring surface, not a hidden node-only setting.

## 6. Required Public Contracts

### Pack REST Surface

V1 routes:

- `GET /api/v1/packs`
- `POST /api/v1/packs`
- `GET /api/v1/packs/:id`
- `PUT /api/v1/packs/:id`
- `DELETE /api/v1/packs/:id`
- `GET /api/v1/packs/:id/versions`
- `POST /api/v1/packs/:id/versions/:timestamp/restore`
- `POST /api/v1/packs/:id/start`

Future V17 routes:

- `POST /api/v1/packs/:id/export`
- `POST /api/v1/packs/import`
- `POST /api/v1/packs/:id/install`
- `POST /api/v1/packs/:id/fork`
- `POST /api/v1/packs/:id/publish`
- fixture CRUD + runner endpoints

### Pack Input/Output Contract Standard

Chosen defaults:

- JSON Schema Draft 2020-12 for schema-bearing contracts
- Ajv for server-side validation
- semver for `engineCompatibility`
- JSZip for local bundle export/import

### Pack Authoring Surfaces

The following four surfaces are the product-critical harness-authoring surfaces for V17 and must be explicitly traceable through domain, contract, runtime, builder, and operator layers:

1. `inputSchema`
2. `knowledgeSources` / knowledge-context injection
3. `behaviorRules` / prompt-behavior directives
4. `outputSchema` + `artifactDefinitions`

## 7. Compatibility Rules

These rules are binding for the V17.x program:

1. Existing workflow CRUD remains valid.
2. Existing workflow execution entrypoints remain valid.
3. Existing Swarm canvas remains the builder/debug surface.
4. Pack execution wraps existing Swarm execution instead of replacing it.
5. V1 pack wraps exactly one primary workflow.
6. Builder and operator are separate surfaces over the same engine state.
7. Pack-facing authoring surfaces must not silently compete with workflow internals.
8. Advanced users must retain drill-down access to the underlying workflow.

## 8. Authoring Authority Model

V17 must avoid two silent sources of truth.

### Pack / harness is authoritative for

- input schema
- knowledge/context injection (`knowledgeSources`)
- prompt / behavior rules (`behaviorRules`)
- output schema and artifact definitions
- pack lifecycle, visibility, distribution, and release gates

### Workflow remains authoritative for

- graph topology and node orchestration
- low-level handoff structure
- advanced technical execution details edited directly in the workflow builder

### Drill-down contract

- The pack builder is the guided authoring surface for the harness-facing contract.
- The workflow editor remains the advanced technical drill-down surface.
- Workflow edits can affect orchestration and execution details, but they must not silently rewrite pack-facing contract fields.
- Pack contract edits remain authoritative at the pack layer; workflow graph edits remain authoritative at the workflow layer.

## 9. Runtime Precedence Matrix

The merge/apply order for a pack run is locked before runtime implementation begins:

1. Resolve `projectId` and `projectPath` explicitly.
2. Validate operator-provided input against `inputSchema`.
3. Load workflow base context and workflow-level defaults.
4. Apply `knowledgeSources` / pack context overlays above the workflow base context.
5. Apply `behaviorRules` as pack-scoped runtime behavior directives above workflow defaults.
6. Execute through the existing Swarm engine with additive pack metadata.
7. Validate/assemble outputs and artifacts against the pack contract.

Conflicts between pack-level overlays/rules and workflow-level defaults must be surfaced explicitly; they must not be resolved silently.

## 10. Component Touchpoints

### Domain and persistence

- [server/services/WorkflowStore.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/services/WorkflowStore.js)
- `server/stores/PackStore.js` (new)
- [server/stores/TemplateStore.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/stores/TemplateStore.js)
- [server/stores/ExecutionHistoryStore.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/stores/ExecutionHistoryStore.js)

### API and bootstrap

- [server/index.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/index.js)
- [server/routes/workflows.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/routes/workflows.js)
- [server/routes/swarm.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/routes/swarm.js)
- `server/routes/packs.js` (new)

### Runtime

- [server/services/SwarmEngine.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/services/SwarmEngine.js)
- `server/services/PackResolver.js` (new)
- `server/services/PackResultBuilder.js` (new)
- [server/stores/ExecutionHistoryStore.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/server/stores/ExecutionHistoryStore.js) with additive pack-aware history metadata

### Client state and hooks

- [client/src/store/SwarmContext.jsx](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/store/SwarmContext.jsx)
- [client/src/hooks/useSwarm.js](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/hooks/useSwarm.js)
- `client/src/hooks/usePack.js` (new)

### Builder/operator surfaces

- [client/src/views/SwarmView.jsx](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/views/SwarmView.jsx)
- [client/src/canvas/WorkflowSettingsModal.jsx](/C:/Users/arman/Downloads/Test%20workflows%20-%20Copia/client/src/canvas/WorkflowSettingsModal.jsx)
- `client/src/views/PackLibraryView.jsx` (new)
- `client/src/views/PackBuilderView.jsx` (new)
- `client/src/views/PackDetailView.jsx` (new)
- `client/src/views/PackRunView.jsx` (new)
- explicit builder↔workflow drill-down affordances and preview/sync rules

## 11. Checkpoint Framework

Every V17 task that changes behavior must explicitly name the checkpoints it is expected to satisfy.

### CK-A Contract

Schemas, enums, public names, and invariants are defined and frozen enough for implementation.

### CK-B Store

Persistence, versioning, restore behavior, and path safety are verified.

### CK-C API

REST route shape and failure semantics are stable and tested.

### CK-D Runtime

Execution semantics are correct and do not break workflow-only behavior.

### CK-E Client State

Hydration, reconciliation, and mode-specific selectors are stable.

### CK-F UX

Builder/operator flow is complete and coherent for the intended user.

### CK-G Regression

Touched neighboring contracts continue to pass their existing suites.

## 12. Task Packet Template

Every V17 task should be written with the following internal structure:

- Goal
- Primary files to inspect
- Expected modifications
- Acceptance criteria
- Dependencies
- Required checkpoints
- Tests to add/update
- Manual smoke

Additionally, every V17 task packet should declare which of the four harness-authoring surfaces it advances or protects.

## 13. V17.x Program Map

### V17.0

Program foundation, glossary, compatibility matrix, checkpoint model, design lock.

### V17.1

Pack domain foundation: PackDefinition, PackStore, CRUD, versioning, bootstrap, client hooks.

### V17.2

Pack contract layer: schemas, runtime policy, dependencies, visible steps, completion criteria, `knowledgeSources`, `behaviorRules`, and precedence/merge rules.

### V17.3

Pack-aware runtime: PackResolver, start route, snapshot extension, result assembly, blocker mapping, pack-aware history/restoration, and explicit operator project binding.

### V17.4

Builder authoring platform: pack editor shell, overview, schema editors, knowledge/context editor, behavior-rule editor, lifecycle, preview, and workflow drill-down.

### V17.5

Operator surface: library, detail, generated run form, run monitor, debug drawer, pack-first navigation, and explicit project binding.

### V17.6

Distribution: bundle format, export/import, install, fork, version pinning, provenance.

### V17.7

Fixtures and release gates: PackFixture, runner, assertions, publish gate, dry-run.

## 14. Validation And Verification Discipline

No area advances unless its own gate is green.

Minimum verification expected per area:

- schema/validator tests where contracts changed
- store tests where persistence changed
- route tests where API changed
- runtime integration tests where execution changed
- execution-history / restoration tests where pack-aware persistence changed
- client tests where hydration or rendering changed
- build pass when client code changed
- one manual smoke scenario per area

## 15. Defaults Locked For Implementation

- v1 uses one workflow per pack
- pack builder and operator are separate surfaces
- legacy workflow routes remain intact
- design doc + task plan are the authoritative planning artifacts for this program
- `knowledgeSources` and `behaviorRules` are first-class pack contract surfaces
- pack and workflow layers must follow the explicit authority model and precedence matrix above
