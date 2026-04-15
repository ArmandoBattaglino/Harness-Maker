# PRD — Swarm UX Clarity Program

- Date: 2026-04-14
- Source context: `.omx/context/swarm-ux-detailed-ralplan-20260414T171136Z.md`
- Planning mode: `$ralplan`
- Consensus status: APPROVED (Planner + Architect + Critic)

## 1. Problem / Context
The V18 Progressive Harness Builder work made Swarm more powerful by adding richer agent definition controls and a compiled execution preview. The resulting authoring surface is functionally capable but visually and cognitively dense:

- the activity/chat rail is open by default even when empty
- the agent inspector mixes essentials, semantic guidance, runtime policies, debug/output, and derived preview
- `Workflow Guidance` and `Agent Definition Center` feel overlapping in the UI
- `Compiled Preview` is useful but not clearly positioned as derived/effective information
- the left rail mixes node creation with workflow management
- the top toolbar presents many actions at similar visual weight

The next work should improve clarity without changing V18 domain ownership or runtime contracts.

## 2. Product Goals
1. Make the main Swarm flow easier to understand: select node → configure → understand effect → run.
2. Improve canvas breathing room by reducing empty panel noise.
3. Make AgentInspector setup hierarchy explicit and predictable.
4. Keep derived/effective preview useful while clearly non-authoritative.
5. Separate shell-level build actions from workflow-management actions.

## 3. Non-goals
- No field ownership changes.
- No schema or persistence changes.
- No compiled-preview resolver or route contract changes.
- No pack-owned field becomes Swarm authoring truth.
- No PackBuilder retirement or authority transfer.
- No broad runtime/compiler rewrite.

## 4. Core Principles
1. **Primary authoring path first** — optimize the common path before advanced/debug surfaces.
2. **Boundary safety over elegance** — preserve V18 WorkflowDefinition / AgentDefinition / HarnessContract / CompiledExecutionContract boundaries.
3. **Regroup only in Wave 1** — improve IA without reclassifying field authority.
4. **Derived truth stays derived** — effective preview explains output, not ownership.
5. **Small reversible waves** — each wave must be independently testable and rollback-friendly.

## 5. Approved Execution Waves

### Wave 1 — Conservative IA polish over existing contracts

Macro areas:
1. Activity rail idle behavior.
2. AgentInspector tab/section normalization.
3. Derived preview clarity.
4. Run-blocker messaging clarity.
5. Boundary/no-regression verification.

Hard constraints:
- `Inspector` tab becomes `Setup`.
- `Output` and `Handoff` tabs remain behaviorally unchanged.
- Setup section headers must be exactly:
  1. `Essentials`
  2. `Behavior & Output Guidance`
  3. `Context, Memory & Visibility`
  4. `Runtime & Policies`
  5. `Effective Preview (Derived)`
- Unread activity during an active run is badge-only; it does not auto-open the rail.
- Activity rail auto-opens only for intervention-critical states such as HITL/inbox and blocking runtime errors.

### Wave 2 — Shell clarity pass

Macro areas:
1. Left rail split: Build vs Workflows.
2. Top bar hierarchy cleanup.
3. Workflow selection readability.
4. Shell responsiveness/layout polish.
5. Shell-focused verification.

Wave 2 still preserves all V18 contract/ownership boundaries.

## 6. Acceptance Summary

Wave 1 passes only if:
- idle Swarm does not open an empty activity rail
- activity rail still opens on HITL/inbox and blocking runtime errors
- unread active-run activity is badge-only
- AgentInspector tabs are `Setup`, `Output`, `Handoff`
- Setup sections appear in the exact approved order
- preview is labeled `Effective Preview (Derived)`
- missing project copy includes `Project required` and `Select a project in the sidebar to run this workflow.`
- no schema, persistence, route-contract, pack-authority, Output/Handoff, or field-authority drift is introduced

Wave 2 passes only if:
- left rail separates Build and Workflows
- workflow actions remain reachable
- top bar primary actions and prerequisites are easier to scan
- workflow selection is more readable
- medium-width Swarm remains usable

## 7. Verification Requirements

Required checks include:
- component tests for AgentInspector, SwarmContext/SwarmCanvas, NodePalette, and SwarmView where changed
- route/contract regression for compiled-preview shape
- no schema/persistence diff audit
- Playwright smoke/evidence for each wave
- before/after screenshots for wide and laptop-ish widths

The paired test specification is `.omx/plans/test-spec-swarm-ux-clarity.md`.

