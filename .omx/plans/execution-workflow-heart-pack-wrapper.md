# Execution Plan - Workflow as Heart, Pack as Wrapper

## Goal
Implement the first workflow-first maturation wave so the workflow becomes the primary place to define, launch, and inspect a reusable capability, while leaving pack UI and pack flows intact.

## Delivery Shape
This execution plan converts the approved PRD into concrete waves and tasks. It is intentionally staged so the first visible win is **workflow launch clarity with clear input/output visibility**, while lightweight agent-level controls are added without opening a pack redesign.

## Waves Overview
- **Wave 1A - Design gate + workflow I/O substrate**
- **Wave 1B - Minimal agent-level quality controls**
- **Wave 1C - Coexistence hardening + regressions**

## Wave 1A - Design gate + Workflow I/O substrate
### WFH-000 - Define precedence matrix and workflow/pack coexistence gate
**Goal:** resolve dual-authority before implementation spreads.
- Define explicit rules for workflow direct run vs pack run.
- Define authority for inputs, outputs/artifacts, context/source, and expected output.
- Define whether overlapping workflow + pack concepts map, override, or remain separate in wave 1.
**Done when:** the plan and implementation can proceed without hidden workflow/pack ambiguity.

### WFH-001 - Extend workflow persistence contract for workflow-native I/O
**Goal:** add workflow-level fields for inputs and outputs without breaking existing workflows.
- Add additive workflow schema fields for:
  - input contract (multiple user inputs)
  - output contract (canonical outputs/artifacts)
- Keep backward compatibility with legacy workflow documents.
- Decide canonical field names and document them in code/comments.
**Likely touchpoints:** workflow persistence/store/routes/server-side schema validation.
**Done when:** workflows can save/load new I/O fields and old workflows still load cleanly.

### WFH-002 - Expose workflow-native I/O in workflow authoring UI
**Goal:** allow authoring workflow inputs and minimal outputs from the workflow surface.
- Add workflow input editing in existing workflow settings/editor surface.
- Add minimal output contract editing in the same workflow-native surface.
- Keep the UX light and staged; do not redesign pack screens.
**Likely touchpoints:** `client/src/canvas/WorkflowSettingsModal.jsx`, `client/src/views/SwarmView.jsx` and related workflow editing helpers.
**Done when:** a user can define at least two inputs and one canonical output directly from the workflow UI.

### WFH-003 - Add direct workflow launch form
**Goal:** make workflow directly runnable with explicit user-provided inputs.
- Render a workflow-native launch form from the workflow input contract.
- Validate required fields before launch.
- Submit input into workflow execution context.
**Likely touchpoints:** Swarm view launch area, launch payload shaping, server execution start path.
**Done when:** a workflow can be launched directly with explicit user inputs.

### WFH-004 - Add workflow run I/O visibility + canonical result mapping
**Goal:** make it obvious what went into the run and what came out, using a canonical workflow-level result shape.
- Show submitted inputs in the workflow run UI.
- Define and implement how raw execution results map into canonical workflow outputs/artifacts.
- Show canonical outputs/artifacts in the workflow run UI.
- Keep the first implementation focused on clarity, not deep runtime telemetry.
**Likely touchpoints:** `SwarmView`, `useSwarm`, result hydration paths, result panels, any workflow execution result adapter.
**Done when:** the run UI clearly shows the inputs used and canonical outputs/artifacts produced.

## Wave 1B - Minimal agent-level quality controls
### WFH-005 - Add lightweight agent skill/tool constraints
**Goal:** let workflow authors guide which skills/tools an agent may or should use.
- Add a minimal representation for allowed/required tool/skill guidance.
- Treat wave-1 constraints as guidance/injection and visibility, not hard enforcement.
- Keep the representation lightweight; no heavy policy engine in this wave.
**Likely touchpoints:** agent node data/editor UI, prompt/runtime shaping.
**Done when:** authors can set and persist basic tool/skill constraints per agent and the semantics are clearly documented as non-hard-enforcement.

### WFH-006 - Add lightweight agent context/source controls
**Goal:** let authors control what context/source an agent receives.
- Add minimal fields for context/source references or selection.
- Persist and surface them in agent editing UI.
**Likely touchpoints:** agent config UI, workflow definition persistence, prompt assembly/runtime context merge.
**Done when:** per-agent context/source choices are editable, persisted, and available to runtime.

### WFH-007 - Add lightweight expected-output definition per agent
**Goal:** let authors say what each agent is expected to return.
- Add a concise expected-output/goal field per agent.
- Surface it in authoring UI and runtime prompt shaping where appropriate.
**Likely touchpoints:** agent config UI, workflow node schema, prompt construction.
**Done when:** each agent can persist an expected output definition visible in the editor.

## Wave 1C - Coexistence hardening + regressions
### WFH-008 - Coexistence hardening follow-through
**Goal:** encode and regression-harden the precedence/mapping rules after implementation slices land.
- Verify the design-gate rules from WFH-000 still match the implemented behavior.
- Add explicit comments/docs in touched runtime paths where overlap remains subtle.
**Likely touchpoints:** design docs/comments, runtime mapping layer, pack resolver notes if needed.
**Done when:** the workflow-first phase has explicit coexistence guidance and no silent ambiguity in touched code paths.

### WFH-009 - Regression coverage for pack compatibility
**Goal:** prove that pack surfaces still work while workflow matures underneath.
- Add/update tests for pack builder/library compatibility.
- Cover workflow-origin changes that could affect pack launch/result hydration.
**Done when:** pack regressions remain green with workflow-first additions in place.

### WFH-010 - Playwright workflow-first smoke
**Goal:** prove the new primary happy path end to end.
- Create/update a deterministic workflow-first smoke covering:
  1. define workflow inputs
  2. launch workflow directly
  3. observe run inputs
  4. observe output/artifact
  5. confirm pack surface still opens cleanly
**Done when:** the smoke is stable and passes locally in the intended harness.

## Sequencing / Dependencies
1. **WFH-000** before all others.
2. **WFH-001** depends on WFH-000.
3. **WFH-002** depends on WFH-000 and WFH-001.
4. **WFH-003** depends on WFH-000, WFH-001, and WFH-002.
5. **WFH-004** depends on WFH-000, WFH-003, and whichever result contract shape WFH-001 introduces.
6. **WFH-005/WFH-006/WFH-007** can begin after WFH-000 + WFH-001 if the chosen workflow schema leaves clear agent extension points.
7. **WFH-008** follows implementation slices as a hardening pass, not as the initial design gate.
8. **WFH-009** and **WFH-010** follow the implementation slices but should be shaped early.

## Recommended Ralph Order
1. WFH-000
2. WFH-001
3. WFH-002
4. WFH-003
5. WFH-004
6. WFH-005 + WFH-006 + WFH-007
7. WFH-008
8. WFH-009
9. WFH-010
10. verification + architect review

## Verification Pack
- targeted server tests for workflow contract/persistence
- targeted client tests for workflow authoring + launch + run visibility
- targeted regression tests for pack compatibility
- targeted Playwright workflow-first smoke
- build/diagnostics/diff-check

## Scope Guardrails
- Do **not** redesign pack UI in this branch.
- Do **not** add a heavy per-agent process DSL in wave 1.
- Do **not** collapse workflow and pack into one object in this wave.
- Treat skill/tool controls as guidance/injection + visibility in wave 1, not hard enforcement.
- Keep workflow UI changes focused on clarity and controllability.
