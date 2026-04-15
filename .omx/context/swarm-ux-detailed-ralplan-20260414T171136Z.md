# Ralplan Context Snapshot - Swarm UX Detailed Plan

- Created UTC: 20260414T171136Z
- Mode: Ralplan
- Task statement: Produce a detailed execution plan for Wave 1 and Wave 2 of the approved Swarm UX clarity pass, with macro areas, detailed tasks, and detailed test strategy per phase, especially Playwright.
- Baseline context: .omx/context/swarm-ux-clarity-ralplan-20260414T165550Z.md
- Approved rough-plan direction: Inspector-first IA polish (Wave 1), shell clarity pass (Wave 2), responsive/polish later.

## Approved rough-plan constraints
- Wave 1 is UI-only IA polish over existing V18 contracts.
- No field ownership changes.
- No preview/resolver contract changes.
- No schema/persistence changes.
- No pack-owned fields moved into Swarm authoring.
- Regroup only; no authority reclassification; no structured/advisory/derived category changes.

## Known facts/evidence
- Architect and Critic already approved the rough-plan v3 after adding exact headers/order, blocker-copy expectations, hard side-panel rules, and no-regression requirements.
- Wave 1 targets AgentInspector + activity rail + clearer blocker messaging.
- Wave 2 targets Build/Workflows split in left rail and top-bar cleanup.
- Existing Playwright smoke scripts/agent-compiled-preview-playwright-smoke.mjs already covers part of the agent-edit/preview path and can be extended or paralleled.

## Constraints
- Preserve V18 WorkflowDefinition / AgentDefinition / HarnessContract / CompiledExecutionContract boundaries.
- Keep PackBuilder authoritative for pack-owned authoring.
- No new dependencies.
- Planning only; do not implement yet.

## Desired output
- Macro areas for Wave 1 and Wave 2
- Detailed tasks per area
- File-level touchpoints
- Acceptance criteria per phase
- Detailed test plan per phase
- Playwright-specific coverage with concrete scenarios, assertions, and evidence expectations
- Suggested execution/staffing guidance
