# Deep Interview Spec — Workflow as Heart, Pack as Wrapper

## Metadata
- Profile: standard
- Rounds: 7
- Final ambiguity: 0.18
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: `.omx/context/pack-sections-ux-clarity-plan-20260412T022958Z.md`

## Clarity Breakdown
| Dimension | Score |
|---|---:|
| Intent | 0.92 |
| Outcome | 0.87 |
| Scope | 0.84 |
| Constraints | 0.72 |
| Success criteria | 0.82 |
| Context clarity | 0.90 |

## Intent
Make the **workflow** the true center of creation and control so both technical and non-technical users can define and run a capability in a more controllable way. Packs should remain available, but they should not currently be the place where the core capability is primarily authored.

## Desired Outcome
The workflow becomes a first-class capability object with:
- explicit user inputs
- clear run-time visibility of inputs and outputs
- stronger per-agent control over skills, context/sources, and expected outputs

The pack remains in place for now as a wrapper/reuse layer, without a UI redesign in this phase.

## In Scope
### Wave 1 required outcome
- Add **workflow-level input definition** and user-entered input handling.
- Add **workflow run visibility** for inputs and outputs.
- Add a **minimal workflow-level output contract**.
- Add **minimal agent-level controls** sufficient to improve output quality and control, especially:
  - a first lightweight form of skill control per agent
  - a first lightweight form of context/source control per agent
  - a first lightweight form of expected output definition per agent

### Product intent in this phase
- Strengthen the workflow substrate first.
- Make workflow launch and observation much clearer.
- Keep the pack layer intact while workflow matures underneath it.

## Out-of-Scope / Non-goals
- Do **not redesign the pack UI right now**.
- Do not try to collapse pack and workflow into one object in this phase.
- Do not require full, deeply detailed process scripting per agent in wave 1.

## Decision Boundaries
OMX may decide without further confirmation:
- the exact minimal UI/IA inside workflow needed to surface inputs/outputs clearly
- the exact lightweight representation for first-wave agent-level controls
- the sequencing of wave 1 so long as workflow I/O clarity remains the first visible success

OMX should **not** assume without confirmation:
- a full pack redesign
- removal of pack concepts
- a heavy per-agent process DSL in wave 1

## Constraints
- Pack should remain functionally as-is for now.
- The first wave must prove value through workflow launch clarity, not through maximal sophistication.
- Complexity should be added in a staged way: workflow I/O + light agent controls first, richer behavior later.
- Brownfield constraint: pack concepts (`inputSchema`, `outputSchema`, `artifactDefinitions`, `visibleSteps`) currently live in `PackBuilderView` / `PackLibraryView`, while workflow-level equivalents do not yet exist as primary native concepts.

## Testable Acceptance Criteria
1. A workflow can define multiple user inputs in a clear, workflow-native way.
2. A user can launch a workflow directly with those inputs.
3. The run view clearly shows which inputs were used.
4. The run view clearly shows resulting outputs/artifacts or at least canonical outputs for the run.
5. The workflow can define at least a minimal output expectation.
6. Each agent can express at least lightweight constraints for:
   - skills/tooling
   - received context/sources
   - expected output shape/goal
7. The pack UI is not redesigned in this wave.

## Assumptions Exposed + Resolutions
- **Assumption:** pack should absorb more functionality right now.
  **Resolution:** rejected for this phase; workflow substrate should mature first.
- **Assumption:** wave 1 must include every deep per-agent control.
  **Resolution:** rejected; wave 1 should include only a minimal but coherent agent-control layer.
- **Assumption:** detailed process scripting per agent is essential in wave 1.
  **Resolution:** not essential; this is the first thing to defer if scope must shrink.

## Pressure-Pass Findings
Revisited earlier assumption: the user initially asked for broad workflow strengthening, including process, skills, context, and per-agent outputs. Under pressure to prioritize wave 1 success, the user anchored success on **workflow launch clarity with visible inputs/outputs**, and explicitly chose to defer **detailed per-agent process** first.

## Brownfield Evidence vs Inference
### Evidence
- `PackBuilderView` currently owns `inputSchema`, `outputSchema`, `artifactDefinitions`, and `visibleSteps`.
- `PackLibraryView` currently owns run form, launch, run monitor, and artifact rendering.
- `WorkflowSettingsModal` exists, but workflow-native I/O and pack-like interface concepts are not yet the central workflow abstraction.

### Inference
- The current product confusion likely comes in part from capability-interface concepts living too far up in the pack layer instead of in the workflow substrate.

## Technical Context Findings
Likely touchpoints if this becomes a planning/execution lane:
- `client/src/views/SwarmView.jsx`
- `client/src/canvas/WorkflowSettingsModal.jsx`
- workflow data contracts / persistence on the server side
- eventual mapping from workflow-native I/O to pack wrapper behavior later

## Recommended Next Step
Use `$ralplan` next to convert this clarified direction into an execution plan focused on:
1. workflow-native I/O and run visibility
2. minimal agent-level control contract
3. explicit deferral of pack UI redesign
