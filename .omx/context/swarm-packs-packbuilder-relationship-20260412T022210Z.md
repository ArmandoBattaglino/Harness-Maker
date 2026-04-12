# Swarm / Packs / Pack Builder Relationship

- Task statement: Explain and plan how Swarm, Packs, and Pack Builder currently relate together so the product acts as a powerful harness-creation and output-management tool.
- Desired outcome: A consensus architecture/operating plan that clarifies current roles, boundaries, workflow, and the recommended product positioning/execution path.

## Known facts / evidence
- Current memory and code map state (2026-04-12) says Pack Builder is the guided authoring shell for pack-owned surfaces, Packs is the operator-first surface, and Swarm remains the advanced workflow/runtime drill-down.
- Memory explicitly states the four pack-owned surfaces are: input schema, knowledge/context injection, prompt/behavior rules, and output schema + artifacts.
- Runtime precedence already exists in memory: project binding -> input validation -> workflow base context -> pack knowledge overlays -> pack behavior rules -> swarm execution -> output/artifact validation.
- Pack Builder currently edits pack metadata/contracts and linked workflow selection; Swarm currently owns graph topology/orchestration and runtime execution inspection.
- Pack Library currently owns pack-first run/monitor/artifact visibility and builder/swarm drill-down entry points.

## Constraints
- Keep pack-first operator UX intact.
- Keep Swarm as advanced technical drill-down, not default operator entry.
- No new dependencies are needed for the planning answer.

## Unknowns / open questions
- Whether the next step should be primarily product explanation, architectural tightening, or implementation follow-up.
- Whether the user wants only the current-state explanation or also the recommended future target model.

## Likely touchpoints
- docs/memory/PROJECT.md
- docs/memory/CONTEXT.md
- docs/memory/CODE_MAP.md
- docs/PACK_PLATFORM_DESIGN.md
- client/src/views/PackLibraryView.jsx
- client/src/views/PackBuilderView.jsx
- client/src/views/SwarmView.jsx
