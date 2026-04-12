# PRD — Workflow as Heart, Pack as Wrapper

## Metadata
- Source spec: `.omx/specs/deep-interview-workflow-heart-pack-wrapper.md`
- Planning mode: ralplan consensus (non-interactive)
- Risk mode: standard
- Status: proposed

## Problem Statement
The current product exposes powerful pack surfaces, but the underlying workflow substrate is still too weak as the primary place to define and control a reusable capability. Core interface concepts such as user inputs, outputs, artifacts, and visible steps currently live mainly in the pack layer. This creates conceptual duplication, weakens workflow ownership, and makes the system feel confusing: workflows remain highly technical while packs feel prematurely burdened with interface responsibilities.

## Product Decision
Make the **workflow** the primary capability object for creation, launch, and inspection. Keep **pack** behavior and UI functionally intact in this phase, but begin moving the center of gravity downward by introducing workflow-native input/output/run concepts and minimal agent-level quality controls.

## Why
- Workflows are already the true execution substrate.
- The user wants workflow to become the place where both technical and non-technical users can build with control.
- Packs should remain available now, but should wrap a stronger workflow core rather than compensate for a weak workflow layer.

## Principles
1. **Workflow-first capability ownership** — if a concept is fundamental to defining and launching a capability, prefer making it native to workflow.
2. **Pack stability during substrate maturation** — do not redesign pack UI during this phase.
3. **Simple visible success first** — wave 1 success is clear workflow launch with clear input/output visibility.
4. **Power through staged depth** — introduce minimal but coherent agent-level controls now; defer heavy per-agent process scripting.
5. **No silent dual-authority** — whenever a workflow-native concept overlaps a pack concept, define precedence and migration rules explicitly.

## Decision Drivers
1. Reduce conceptual confusion between workflow and pack.
2. Make workflow directly launchable and inspectable as a serious reusable capability.
3. Preserve existing pack value without opening an oversized UI redesign.

## Viable Options
### Option A — Keep capability-interface concepts mostly in Pack
**Pros**
- Smaller near-term workflow changes
- Preserves current pack-centric authoring model

**Cons**
- Continues conceptual duplication
- Workflow remains weak as the true core object
- Confusion likely persists

**Status:** Rejected for this phase.

### Option B — Move everything immediately from Pack to Workflow
**Pros**
- Clean conceptual center
- Strong workflow ownership

**Cons**
- Too disruptive
- High risk of pack breakage and UI churn
- Conflicts with explicit non-goal: do not redesign pack UI now

**Status:** Rejected as too aggressive.

### Option C — Workflow-first substrate maturation while keeping Pack intact
**Pros**
- Aligns with user intent
- Strengthens workflow where it is currently weak
- Keeps pack stable while reducing future duplication
- Supports staged rollout and clearer verification

**Cons**
- Temporary duality remains during transition
- Requires careful precedence rules between workflow-native and pack-native concepts

**Status:** Chosen.

## Scope
### In Scope — Wave 1
1. **Workflow-native input contract**
   - multiple user inputs
   - type/required/default/help basics
   - direct workflow launch form
2. **Workflow-native run visibility**
   - show which inputs were used in the run
   - show canonical outputs/artifacts for the run
3. **Workflow-native minimal output contract**
   - define at least expected primary outputs/artifacts at workflow level
4. **Design-gate coexistence and precedence rules**
   - explicit workflow-vs-pack precedence matrix before implementation spreads
   - explicit pack-run vs workflow-direct-run behavior
   - explicit temporary mapping rules for overlapping concepts
5. **Minimal agent-level control contract**
   - lightweight skill/tool constraints per agent as guidance/injection and visibility, not hard enforcement
   - lightweight context/source controls per agent
   - lightweight expected-output definition per agent
6. **Canonical workflow result mapping**
   - explicit mapping from raw execution results to workflow-native canonical outputs/artifacts
7. **Pack coexistence hardening**
   - pack UI remains intact
   - pack continues to wrap workflow
   - no forced migration of pack UX in this phase

### Out of Scope — Wave 1
- Pack UI redesign
- Pack object removal or merge into workflow
- Heavy per-agent process DSL
- Full policy language for agent behavior
- Distribution/install/publish changes

## User Stories
### Story 1 — Define workflow inputs directly
As a workflow author, I can define multiple inputs directly at workflow level so the workflow becomes self-describing and runnable without relying on pack-only input configuration.

### Story 2 — Launch workflow with a clear run form
As a user, I can launch the workflow directly with explicit inputs so I understand what I am providing and what the workflow is expected to do.

### Story 3 — Inspect run I/O clearly
As a user, I can see the run inputs and resulting outputs/artifacts so I can understand what happened without diving into low-level runtime internals.

### Story 4 — Constrain agent quality lightly
As a workflow author, I can declare lightweight constraints for each agent (skills/tools, context/source, expected output) so output quality is more controllable.

## Functional Requirements
### FR-1 Workflow Input Contract
- Workflow definition supports a workflow-level input schema.
- Inputs may include at least: key, type, required flag, optional default, optional help/description.
- Workflow launch surface renders those inputs directly.

### FR-2 Workflow Launch Surface
- Swarm/workflow surface can launch the current workflow with workflow-native inputs.
- Submitted input is persisted into the execution context.

### FR-3 Workflow Run I/O Visibility
- Workflow run UI shows:
  - submitted inputs
  - resulting outputs
  - resulting artifacts if produced
- Visibility should be clear without requiring pack drill-down.

### FR-4 Workflow Output Contract
- Workflow supports at least a minimal expected output definition.
- Output contract should support a canonical primary result and optional additional outputs/artifacts.

### FR-4A Canonical Workflow Result Mapping
- Runtime result handling must define how raw execution outputs map into the workflow-native canonical output/artifact shape.
- Workflow run UI should render this canonical shape rather than heterogeneous raw fragments whenever canonical data is available.

### FR-5 Agent-Level Minimal Controls
Per agent, workflow supports lightweight declarations for:
- skill/tool allowance or requirement
- context/source selection or reference
- expected output/goal shape

These wave-1 controls are **guidance/injection + visibility** constructs, not a hard runtime enforcement system.

### FR-6 Workflow-Pack Coexistence
- Existing pack behavior remains functional.
- No pack UI redesign is required for wave 1.
- Workflow-native I/O concepts should be designed so pack can later map to them cleanly.

## Architect Review
### Strongest antithesis
A workflow-first move risks recreating pack concepts at workflow level while leaving the existing pack contracts intact, creating a larger rather than smaller duplication problem.

### Real tradeoff tension
- **Workflow-first clarity** vs **pack contract stability**
- **Fast substrate strengthening** vs **avoiding a long transitional dual-authority period**

### Synthesis
Adopt workflow-native concepts only for the fundamental capability interface (inputs, outputs, run visibility, lightweight agent controls), and explicitly defer pack redesign. Treat this as substrate maturation, not a premature pack deprecation program. Add precedence/mapping notes in the design so later convergence remains possible.

## Critic Evaluation
### Quality verdict
APPROVE

### Rationale
- Principle-option consistency is strong: chosen option preserves pack stability while strengthening workflow ownership.
- Scope is bounded and testable.
- Success criteria are explicit.
- Risks are acknowledged and mitigated via staged rollout and coexistence rules.

## Precedence Matrix (Wave 1)
| Scenario | Canonical source in wave 1 | Rule |
|---|---:|---|
| Workflow direct run - inputs | Workflow input contract | Workflow-native launch form is authoritative. |
| Workflow direct run - outputs/artifacts | Workflow output contract | Workflow run UI prefers workflow-native canonical outputs/artifacts. |
| Pack run - operator-provided input | Pack input schema | Pack launch remains authoritative for pack runs in this phase. |
| Pack run - workflow execution payload | Explicit mapping from pack input into workflow execution context | No silent merge; mapping/override behavior must be encoded intentionally. |
| Pack run - outputs/artifacts shown in pack UI | Pack contract/rendering | Pack UI remains pack-shaped in this phase, even if workflow-native outputs also exist underneath. |
| Agent context/source controls vs pack knowledge/rules | Pack overlays remain additive above workflow defaults for pack runs | Workflow direct runs use workflow-native controls only; pack runs add pack overlays on top. |
| Agent expected output | Workflow agent-level expected output | Canonical for workflow authoring; pack may wrap but not silently replace. |
## Acceptance Criteria
1. A workflow can define multiple user inputs in a workflow-native way.
2. A user can launch a workflow directly with those inputs.
3. The run UI clearly displays the inputs used.
4. The run UI clearly displays canonical outputs/artifacts produced.
5. The workflow can define at least a minimal output contract.
6. Each agent can express lightweight controls for skills/tools, context/sources, and expected output.
7. Pack UI remains functionally unchanged in this wave.

## Delivery Plan
### Wave 1A — Workflow I/O substrate
- extend workflow data model for input/output contract
- persist on server
- expose in workflow authoring/settings UI
- add workflow launch form and run I/O visibility

### Wave 1B — Minimal agent-level quality controls
- add per-agent skill/tool constraint field(s)
- add per-agent context/source reference field(s)
- add per-agent expected-output field(s)
- surface in existing agent/workflow editing surfaces

### Wave 1C — Coexistence hardening
- document precedence between workflow-native and pack-native concepts
- ensure pack flows do not regress
- add explicit compatibility tests

## Risks
1. **Dual-authority confusion persists**
   - Mitigation: document precedence; keep wave limited; do not redesign pack simultaneously.
2. **Workflow UI becomes overloaded**
   - Mitigation: place new concepts in staged/advanced sections; prioritize launch clarity first.
3. **Server/client contract churn**
   - Mitigation: additive schema changes and focused regression coverage.

## Follow-ups
- Reassess after wave 1 whether pack should later become a lighter wrapper over workflow-native contracts.
- If wave 1 proves successful, a later planning wave can address pack simplification/convergence.

## Staffing Guidance
### Ralph lane
Use when you want one persistent owner to implement wave 1 sequentially with verification after each slice.

### Team lane
Use when you want parallel lanes:
- architect/planner for contract boundaries
- executor for client/server workflow model changes
- test-engineer for contract/regression/Playwright coverage
- verifier for final evidence
