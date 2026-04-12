# Test Spec — Workflow as Heart, Pack as Wrapper

## Scope Under Test
Wave 1 workflow-first substrate maturation:
- workflow-native inputs
- workflow launch with user-provided inputs
- run-time visibility of inputs/outputs/artifacts
- minimal workflow-level output contract
- minimal per-agent controls (skills/tools, context/sources, expected output)
- no pack UI redesign regressions

## Test Strategy
Use a layered strategy:
1. **Unit/contract tests** for workflow schema and persistence
2. **Client component tests** for workflow authoring + run UI
3. **Integration tests** for launch payloads and result hydration
4. **Targeted Playwright smoke** for the user-visible workflow-first happy path
5. **Regression tests** confirming pack surfaces still work unchanged

## Required Test Areas
### 1. Workflow data contract
- workflow accepts/persists input contract fields
- workflow accepts/persists output contract fields
- workflow accepts/persists minimal agent control fields
- backward compatibility for existing workflows without these fields

### 2. Workflow authoring UI
- author can add multiple workflow inputs
- author can edit required/type/default/help basics
- author can define minimal output contract
- author can define lightweight per-agent skill/tool constraints
- author can define lightweight per-agent context/source references
- author can define lightweight per-agent expected output

### 3. Workflow launch UX
- workflow renders launch form from workflow-native inputs
- submitted inputs are sent with run start
- invalid/missing required input is blocked or clearly surfaced

### 4. Run observability
- run view shows submitted input values
- run view shows canonical outputs and/or artifacts
- visibility remains understandable without entering pack views

### 5. Pack compatibility
- existing pack builder still loads
- existing pack library still launches
- pack runs still hydrate pack outputs/artifacts
- no regression in pack-origin navigation caused by workflow changes

## Concrete Acceptance Tests
### Unit / server
1. Persist workflow with new `inputContract`/equivalent fields.
2. Persist workflow with new `outputContract`/equivalent fields.
3. Persist workflow with new agent-level lightweight control fields.
4. Load old workflow documents without migration failure.
5. Launch execution with workflow-native inputs and verify they reach execution context.

### Client / component
1. Workflow settings/editor can create two or more workflow inputs.
2. Workflow run form renders those inputs correctly.
3. Run submission includes entered values.
4. Run status view displays inputs used.
5. Run status/results view displays canonical outputs/artifacts.
6. Agent editor exposes and saves lightweight skill/context/expected-output fields.

### Integration
1. Create workflow -> define inputs -> launch -> inspect run I/O.
2. Create workflow -> define agent lightweight controls -> save/reload -> verify persistence.
3. Existing pack using linked workflow still loads and launches.

### Playwright smoke (mandatory)
User-visible flow should cover:
1. Open/create workflow in Swarm
2. Define at least two workflow inputs
3. Launch workflow directly from workflow surface
4. Observe submitted inputs and resulting output/artifact in the run UI
5. Confirm pack surfaces still open without redesign-dependent breakage

## Verification Commands (expected shape)
- targeted server tests for workflow routes/store/contracts
- targeted client tests for SwarmView + WorkflowSettingsModal + relevant agent editor surfaces
- targeted pack regression tests
- targeted Playwright smoke for workflow-first happy path
- build/type/lint/static diagnostics as available in repo conventions

## Risk-Based Emphasis
Highest-risk areas:
1. schema drift between workflow persistence and UI
2. confusing overlap between workflow-native and pack-native concepts
3. regressions in existing pack flows
4. UI overload in workflow surfaces reducing usability instead of improving it

## Evidence Required Before Claiming Completion
- passing targeted automated tests for workflow model/UI
- passing targeted automated regression tests for pack surfaces
- passing targeted Playwright smoke for workflow-first user path
- no new diagnostics on touched files
- explicit note of any unresolved workflow/pack precedence caveat
