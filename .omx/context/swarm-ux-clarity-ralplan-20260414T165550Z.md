# Ralplan Context Snapshot - Swarm UX Clarity Pass

- Created UTC: 20260414T165550Z
- Mode: Ralplan
- Task statement: Produce a consensus UX plan for improving Swarm and AgentInspector clarity before implementation.
- Desired outcome: A concrete, low-risk UX implementation plan that improves hierarchy, naming, layout clarity, and canvas space without breaking the V18 progressive harness builder architecture.
- Related baseline: .omx/plans/prd-swarm-progressive-harness-builder.md, .omx/plans/test-spec-swarm-progressive-harness-builder.md, docs/PROGRESSIVE_HARNESS_BUILDER.md

## Known facts/evidence
- Recent V18 implementation added Agent Definition Center + compiled preview and is green.
- Browser review found four competing surfaces in Swarm: top bar, left node/workflow rail, canvas, activity rail, inspector.
- Activity rail is open by default even when empty.
- AgentInspector currently mixes essentials, semantic controls, runtime controls, debug, and effective preview in one configuration flow.
- PackBuilder currently communicates authoring surfaces more clearly than Swarm.

## Constraints
- Keep PackBuilder authoritative for pack-owned behavior until explicit parity gates pass.
- Do not collapse workflow/agent/pack/compiled runtime domains.
- Prefer low-risk, reversible UX restructuring before broader shell refactors.
- No new dependencies unless explicitly requested.
- Preserve existing runtime and compiled-preview correctness.

## Unknowns/open questions
- Final tab model for AgentInspector: Setup/Output/Handoff vs Setup/Results/Debug.
- Whether to split NodePalette and workflow management with tabs or separate rails.
- How much top-bar simplification should fit in the first UX wave.

## Likely codebase touchpoints
- client/src/canvas/AgentInspector.jsx
- client/src/canvas/SwarmCanvas.jsx
- client/src/canvas/NodePalette.jsx
- client/src/views/SwarmView.jsx
- client/src/store/SwarmContext.jsx
- related tests and Playwright smoke
