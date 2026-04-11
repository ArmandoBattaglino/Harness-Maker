# PRD — V17 Pack Platform / Vertical Harness Builder Bridge

## Metadata
- Date: 2026-04-11
- Source artifacts:
  - `docs/TASK_PLAN.md` V17.0–V17.7 (`#610`–`#676`, lines 21839–23280)
  - `docs/PACK_PLATFORM_DESIGN.md` (design/contracts/checkpoints, especially lines 59–145, 145–291)
  - `.omx/specs/deep-interview-v17-pack-platform.md`
- Planning mode: RALPLAN consensus draft
- Scope: Full V17.x program planning, not implementation

## Requirements Summary
The app should evolve from a generic agent-flow builder into a **vertical harness builder**, while preserving the current flow builder as the technical substrate and advanced debug surface.

Grounding facts from the brownfield codebase:
- `server/index.js:186-188` wires `WorkflowStore`, and `server/index.js:262-273` wires `ExecutionHistoryStore` plus `/api/v1/swarm` execution routes.
- `server/services/WorkflowStore.js:30-45`, `249-316`, and `394-445` already provide workflow init/list/get/version/restore/save with atomic writes and path-safety checks.
- `server/routes/workflows.js:28-220` already exposes workflow CRUD and version restore routes under `/api/v1/workflows`.
- `server/routes/swarm.js:343-369` and neighboring status/results routes are the existing execution substrate that V17 must wrap, not replace.
- `client/src/hooks/useWorkflow.js:1-49`, `client/src/hooks/useSwarm.js:930-979`, and `client/src/views/SwarmView.jsx:134-1150` are the current client touchpoints that V17 must evolve.

## RALPLAN-DR Summary

### Principles
1. **Harness-first, workflow-backed:** V17 shifts product framing toward vertical harness authoring while keeping workflows as the execution substrate.
2. **Explicit author control over four surfaces:** input schema, knowledge/context injection, prompt/behavior rules, and output schema/artifacts must be first-class across domain, contract, runtime, and UI.
3. **Additive compatibility:** existing workflow CRUD/versioning and swarm execution routes remain valid; harness capability wraps them.
4. **Guided toolkit, not opaque abstraction:** the product becomes easier to author from, but advanced users can still descend into workflow internals.
5. **One workflow per harness in V17:** multi-workflow harnesses are explicitly future scope.

### Decision Drivers
1. **Product repositioning:** V17 is the bridge from agent-flow builder to vertical harness builder.
2. **Control-surface traceability:** each V17 area must visibly advance one or more of the four must-have authoring surfaces.
3. **Low-risk evolution:** existing stores/routes/runtime already provide a stable substrate; V17 should layer on top.

### Options
#### Option A — Pack-first wrapper program, reframed as harness bridge
- **Approach:** Keep the V17.0–V17.7 structure in `docs/TASK_PLAN.md`, but reinterpret “pack platform” as the implementation architecture for the harness-builder product shift.
- **Pros:** Aligns with existing design/task-plan structure; preserves compatibility; lets domain/contracts/runtime mature before UI polish; reuses current workflow and swarm routes.
- **Cons:** Risks staying too technical unless V17.0, V17.2, V17.4, and V17.5 are explicitly reframed around harness authoring.

#### Option B — UI-first harness-builder facelift on top of current workflow model
- **Approach:** Prioritize visible UI changes first, postponing durable pack domain/contract/runtime work.
- **Pros:** Faster visible product shift.
- **Cons:** Weak domain/runtime discipline; likely to create shallow UX backed by implicit workflow semantics; clashes with current V17 dependency order.

### Recommendation
Choose **Option A**, but explicitly reframe V17.0, V17.2, V17.4, and V17.5 so the current “pack platform” architecture is clearly presented as the bridge toward a **vertical harness builder**.

## Product Intent
V17 should make it possible for a domain expert to build a specialized harness with strong, explicit control over how their knowledge enters the system, while keeping the underlying workflow reachable for advanced authoring and debugging.

## In Scope
- Review and execute the **full V17.x roadmap** registered in `docs/TASK_PLAN.md:21839-23280`.
- Preserve the current flow builder while evolving it toward harness authoring.
- Keep these four surfaces first-class and traceable:
  1. input schema
  2. knowledge/context injection
  3. prompt / behavior rules
  4. output schema + final artifacts
- Keep builder and operator surfaces separate but connected to the same runtime state (`docs/PACK_PLATFORM_DESIGN.md:288-291`).
- Keep **one workflow per harness** in V17 (`docs/PACK_PLATFORM_DESIGN.md:288`).

## Authoring Authority Model
V17 must avoid creating two silent sources of truth between the harness shell and the underlying workflow.

### Pack / harness is authoritative for
- input schema
- knowledge/context injection
- prompt / behavior rules
- output schema / artifacts
- pack lifecycle, visibility, distribution, and release gates

### Workflow remains authoritative for
- graph topology and node orchestration
- low-level handoff structure
- advanced technical execution details edited directly in the workflow builder

### Drill-down contract
- PackBuilder is the guided authoring surface for the four harness-facing contract surfaces.
- Advanced users may open the linked workflow in drill-down mode to edit graph/node orchestration details.
- Workflow edits round-trip back to the linked harness preview, but they must **not silently mutate** pack-facing contract fields.
- Pack-facing contract edits remain authoritative at the pack layer; workflow-facing graph edits remain authoritative at the workflow layer.

## Runtime Precedence Matrix
Before V17.3 implementation starts, the runtime contract is:

1. Resolve `projectId` and `projectPath` explicitly.
2. Validate operator-provided input against the pack input schema.
3. Load workflow base context and workflow-level defaults.
4. Apply pack knowledge/context overlays above the workflow base context.
5. Apply pack behavior rules above the workflow defaults.
6. Execute through the existing Swarm engine with additive pack metadata.
7. Validate and assemble outputs/artifacts against the pack contract.

Conflicts between pack-level overlays/rules and workflow-level defaults must be surfaced explicitly rather than resolved silently.

## Out of Scope / Non-goals
- No public marketplace in V17.
- No multi-workflow harness composition in V17.
- No simplified-only abstraction that hides workflow internals completely.

## Acceptance Criteria
1. `docs/TASK_PLAN.md` and `docs/PACK_PLATFORM_DESIGN.md` explicitly describe V17 as a bridge toward vertical harness authoring, not merely generic pack CRUD.
2. V17.1–V17.5 collectively define, persist, validate, execute, and expose:
   - input schema
   - knowledge/context injection
   - prompt/behavior rules
   - output schema/artifacts
3. Existing workflow CRUD/versioning behavior remains valid (`server/routes/workflows.js:28-220`; `server/services/WorkflowStore.js:30-45,249-445`).
4. Existing swarm execution start/status/results behavior remains valid while pack/harness execution wraps it (`server/index.js:262-273`; `server/routes/swarm.js:343-369`).
5. A technical/domain author can create a draft harness/pack from one workflow and explicitly configure the four surfaces.
6. The builder offers guided authoring, but advanced workflow detail remains reachable.
7. An operator can discover, launch, and monitor a harness without opening the workflow graph by default, while advanced runtime/debug detail stays available behind explicit debug affordances.
8. Versions, distribution, fixtures, and publish gates are test-backed before V17 closure.

## Implementation Plan

### Phase A — Reframe the program contract (V17.0, tasks #610–#616)
Reference: `docs/TASK_PLAN.md:21839-21999`, `docs/PACK_PLATFORM_DESIGN.md:59-145`, `238-291`
- Keep the existing V17.0 structure.
- Reframe V17.0 so “pack” is clearly the implementation architecture for harness-builder evolution.
- Ensure tasks #610–#612 map canonical pack nouns to the four authoring surfaces.
- Ensure tasks #613–#614 require each later V17 task to declare which surface(s) it advances.
- Ensure task #615 checks terminology consistency between “pack” implementation language and “harness” product language.

### Phase B — Establish the persisted harness shell (V17.1, tasks #617–#625)
Reference: `docs/TASK_PLAN.md:22006-22196`, `server/index.js:186-188,262-273`, `server/services/WorkflowStore.js:22-45,249-445`, `client/src/hooks/useWorkflow.js:1-49`
- Implement `PackDefinition` / `PackVersion` and `PackStore` by reusing WorkflowStore’s atomic persistence and versioning patterns.
- Add additive bootstrap and REST wiring in `server/index.js` plus `server/routes/packs.js`.
- Add `client/src/hooks/usePack.js` as the normalized client access layer.
- Reserve/encode the four authoring surfaces in the PackDefinition shape from day one.

### Phase C — Make the authoring contract explicit (V17.2, tasks #626–#634)
Reference: `docs/TASK_PLAN.md:22198-22390`, `docs/PACK_PLATFORM_DESIGN.md:112-145`
- Treat V17.2 as the product heart of V17.
- Define and validate contract-bearing fields for:
  - input schema (#627)
  - output schema + artifacts (#628)
  - runtime policy + dependencies (#629)
  - knowledge/context injection (must be made explicit in this area as a first-class contract surface)
  - prompt/behavior rules (must be made explicit in this area as a first-class contract surface)
- Enforce validation in store/routes and normalize the shape through the client hook layer (#631–#632).
- Lock the precedence/merge rules between workflow base context, pack knowledge/context overlays, and pack behavior rules before runtime work starts.

### Phase D — Prove the harness runs through the existing engine (V17.3, tasks #635–#644)
Reference: `docs/TASK_PLAN.md:22392-22607`, `docs/PACK_PLATFORM_DESIGN.md:172-191`, `server/routes/swarm.js`, `client/src/hooks/useSwarm.js`
- Build pack resolution, start route, execution context extension, safe input binding, visible-step tracking, result/artifact assembly, blocker mapping, and pack-aware hydration.
- Make execution history and restoration pack-aware by persisting additive metadata such as `packId`, `packVersion`, and pack-facing result descriptors alongside the existing workflow execution substrate.
- Explicitly prove that execution truthfully reflects the four authoring surfaces:
  - inputs validated and injected
  - knowledge/context overlays resolved
  - behavior rules applied
  - outputs/artifacts assembled against declared contracts

### Phase E — Turn the builder into a guided harness toolkit (V17.4, tasks #645–#653)
Reference: `docs/TASK_PLAN.md:22609-22802`, `client/src/views/SwarmView.jsx:134-1150`
- Add the PackBuilder shell and lifecycle over current workflow-first tooling.
- Provide guided editors for the four surfaces.
- Keep a visible drill-down path to the underlying workflow and technical details.
- Make knowledge/context injection and prompt/behavior rules dedicated editor concerns, not implicit settings hidden under runtime policy.
- Define the builder↔workflow authority contract explicitly in product terms.
- Treat this as the first visible product transition toward harness-builder UX, not just a generic pack editor.

### Phase F — Create the operator-facing product surface (V17.5, tasks #654–#661)
Reference: `docs/TASK_PLAN.md:22804-22975`, `docs/PACK_PLATFORM_DESIGN.md:186-191`
- Split navigation into pack-first vs builder-first surfaces.
- Add Pack Library, Pack Detail, run form generation, run monitor, debug drawer, and pack-specific selectors/restoration.
- Define a pack-first project-binding model so operators can launch without opening Swarm while still satisfying the current runtime contract (`projectId`, `projectPath`) explicitly.
- Keep operator copy pack/harness-first and keep raw workflow detail behind explicit debug affordances.

### Phase G — Local portability without marketplace scope (V17.6, tasks #662–#669)
Reference: `docs/TASK_PLAN.md:22977-23144`, `docs/PACK_PLATFORM_DESIGN.md:129-143`
- Define manifest/archive format.
- Implement export/import/install/fork/version pinning locally.
- Treat distribution as gated on stabilized knowledge/context and behavior-rule semantics; do not freeze unstable semantics into archives.
- Keep scope strictly local and controlled; do not introduce marketplace framing.

### Phase H — Product-quality release gates (V17.7, tasks #670–#676)
Reference: `docs/TASK_PLAN.md:23146-23280`
- Add PackFixture, runner, assertions, publish-state transitions, and dry-run/pre-publish UX.
- Validate the harness as a product artifact, not only as a runtime success case.

## Risks and Mitigations
1. **Risk:** “Pack” remains too technical and misses the product repositioning.  
   **Mitigation:** explicitly rewrite/reframe V17.0, V17.4, and V17.5 wording and acceptance criteria around harness-builder intent.
2. **Risk:** knowledge/context injection and prompt/behavior rules remain implicit in the workflow internals.  
   **Mitigation:** promote both into explicit contract-bearing fields in V17.2 and explicit runtime inputs in V17.3.
3. **Risk:** operator UX leaks raw workflow complexity.  
   **Mitigation:** keep pack-first/operator-first views as the default, with advanced debug behind opt-in affordances.
4. **Risk:** pack and workflow layers become competing sources of truth.  
   **Mitigation:** lock the pack/workflow authority model and runtime precedence matrix before V17.3 work begins.
5. **Risk:** pack-aware history/restoration is assumed but not actually modeled in the workflow-centric execution-history substrate.  
   **Mitigation:** make additive history metadata and restoration semantics an explicit V17.3 requirement.
6. **Risk:** pack-first operator launch cannot satisfy current runtime prerequisites (`projectId`, `projectPath`).  
   **Mitigation:** define explicit project-binding UX and failure behavior as part of V17.5.
7. **Risk:** compatibility regressions hit existing workflow flows.  
   **Mitigation:** preserve workflow routes/runtime as additive contracts and run regression gates against `workflows.js`, `WorkflowStore`, `swarm.js`, `useSwarm`, and `SwarmView`.
8. **Risk:** V17 accidentally overreaches into multi-workflow orchestration.  
   **Mitigation:** keep one-workflow-per-harness locked in docs, routes, validation, and acceptance criteria.

## Verification Steps
- Verify terminology consistency across `docs/TASK_PLAN.md`, `docs/PACK_PLATFORM_DESIGN.md`, and `.omx/specs/deep-interview-v17-pack-platform.md`.
- Add mapping evidence showing where each V17 area advances the four authoring surfaces.
- Verify the pack/workflow authority contract and runtime precedence matrix are documented and test-covered before V17.3 is considered complete.
- Run store tests for CRUD/version/restore/path safety.
- Run route tests for pack CRUD, versions, start, distribution, publish, and fixtures.
- Keep existing workflow route and swarm execution regression suites green.
- Add contract validation tests for all declared authoring surfaces and negative cases.
- Add pack-aware execution-history and restoration tests that prove `packId` / `packVersion` metadata survives status/history/results flows without breaking workflow-only restoration.
- Add operator launch tests that prove project binding is explicit and no hidden workspace assumptions exist.
- Add builder/operator client tests and a client build pass for V17.4/V17.5.
- Run manual smokes for create/edit/run/debug/export/import/publish flows.

## ADR
### Decision
Adopt the existing V17 pack-platform architecture as the implementation path, but explicitly reframe it as the app’s bridge from workflow-first authoring to **vertical harness builder** product positioning.

### Drivers
- The user clarified that V17 is a product shift, not just a new entity.
- The existing substrate already supports safe persistence/versioning and execution.
- The four authoring surfaces need durable representation across domain, contract, runtime, and UI.

### Alternatives Considered
1. **Pure pack-platform framing with no harness-product reframing**  
   Rejected because it risks building the right architecture with the wrong product emphasis.
2. **UI-first harness-builder facelift over the current workflow model**  
   Rejected because it would weaken domain/runtime discipline and likely force later retrofits.

### Why Chosen
- Best matches the registered V17 task structure and design doc.
- Minimizes technical risk by layering onto current stores/routes/runtime.
- Preserves room for future multi-workflow harnesses without overloading V17.

### Consequences
- V17.0, V17.2, V17.4, and V17.5 need wording/emphasis updates.
- Contract modeling must explicitly include knowledge/context and behavior-rule surfaces.
- The plan must define a pack/workflow authority split plus a runtime precedence matrix before execution work starts.
- Pack-aware history/restoration and operator project binding become explicit planning obligations, not implicit assumptions.
- Pack/harness terminology must be handled carefully across docs and UI.

### Follow-ups
- Update V17 task wording so the four authoring surfaces are explicitly traceable.
- Ensure V17.2 contains explicit fields for knowledge/context injection and prompt/behavior rules.
- Ensure V17.4/V17.5 acceptance criteria measure guided harness authoring and pack-first operation, not only technical CRUD/rendering.
- Ensure V17.3 explicitly covers pack-aware history/restoration metadata and pack-facing status hydration.
- Ensure V17.5 explicitly defines project-binding UX for pack launches.

## Available-Agent-Types Roster
- `planner` — planning synthesis / task reframing
- `architect` — architecture review / substrate alignment
- `critic` — plan quality / risk challenge
- `executor` — implementation
- `debugger` — runtime / contract bug investigation
- `test-engineer` — test strategy and gate coverage
- `verifier` — completion evidence / regression validation
- `writer` — docs, task-plan, and memory sync
- `explore` — fast codebase lookup / touchpoint confirmation

## Follow-up Staffing Guidance
### Ralph path
- **Lane 1:** docs + contract framing — `writer` or `executor` (reasoning: medium)
- **Lane 2:** backend domain/runtime/distribution — `executor` (reasoning: high)
- **Lane 3:** client builder/operator UX — `executor` (reasoning: high)
- **Lane 4:** regression evidence — `test-engineer` then `verifier` (reasoning: medium/high)
- **Final sign-off:** `architect` (reasoning: high)

### Team path
- **Wave A:** V17.0 wording/task-plan/design sync — `planner` + `writer` (medium)
- **Wave B:** V17.1–V17.3 backend foundation/contracts/runtime — `executor` (high)
- **Wave C:** V17.4–V17.5 builder/operator surfaces — `executor` (high)
- **Wave D:** V17.6–V17.7 distribution/release gates — `executor` + `test-engineer` (high)
- **Cross-wave review:** `architect` after each major wave, `critic` on plan deltas, `verifier` on gates

## Launch Hints
### Ralph
- Suggested invocation after approval: `$ralph .omx/plans/prd-v17-pack-platform.md`
- Use the test spec in `.omx/plans/test-spec-v17-pack-platform.md` as the verification contract.

### Team
- Suggested invocation after approval: `$team .omx/plans/prd-v17-pack-platform.md`
- Team verification path: backend gates prove domain/contract/runtime/distribution; client gates prove builder/operator UX; Ralph or verifier does final cross-area regression and sign-off.

## Plan Changelog
- Initial consensus draft created from V17 task-plan/design-doc grounding plus the completed deep interview.
- Architect review incorporated:
  - promoted knowledge/context injection and prompt/behavior rules into explicit planning requirements
  - added a pack/workflow authority model
  - added a runtime precedence matrix
  - added pack-aware history/restoration requirements
  - added operator project-binding requirements
  - tightened builder↔workflow drill-down rules
