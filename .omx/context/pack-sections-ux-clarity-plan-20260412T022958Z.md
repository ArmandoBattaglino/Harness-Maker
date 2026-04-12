# Pack Sections UX Clarity Plan

- Task statement: Plan how to improve the new pack sections so they remain powerful but become much less confusing.
- Desired outcome: A consensus UX/product plan that clarifies what to simplify, regroup, relabel, and stage progressively across Pack Builder and Packs.

## Known facts / evidence
- User feedback: the new pack sections feel cool/powerful but confusing and hard to understand.
- Pack Builder currently exposes many sections at once: overview/workflow link, input schema, outputs/artifacts, knowledge/context injection, runtime/dependencies, visible steps/operator preview, plus global actions like create/save/dry-run/open workflow drill-down.
- Pack Library currently mixes pack detail, distribution actions, run form, run monitor, artifacts, and advanced debug in one surface.
- Earlier grounding showed even some labels are unclear for non-technical users (for example dry-run validate, workflow drill-down).
- Product direction is pack-first operator UX with Swarm as technical drill-down, but the current UI still exposes too many implementation concepts too early.

## Constraints
- Preserve the pack-first product direction.
- Do not hide advanced power; prefer progressive disclosure.
- No new dependencies are required for the planning answer.

## Unknowns / open questions
- Whether the next improvement should be mostly IA/labeling, staged UX flow, or deeper behavioral simplification.
- Whether to optimize primarily for operators, builders, or hybrid technical users.

## Likely touchpoints
- client/src/views/PackBuilderView.jsx
- client/src/views/PackLibraryView.jsx
- docs/PACK_PLATFORM_DESIGN.md
- docs/memory/CONTEXT.md
