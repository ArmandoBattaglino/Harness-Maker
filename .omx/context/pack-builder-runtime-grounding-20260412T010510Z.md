# Pack Builder / Runtime Grounding

## Repro 1 — Pack -> Builder -> Swarm identity gap
- Pack Library `Open in Builder` previously switched only the app view, without preserving selected `packId` / `workflowId` / `executionId`.
- Pack Builder had its own local `selectedPackId` and defaulted to the first pack when no explicit context existed.
- Builder `Open workflow drill-down` previously switched only the app view to Swarm, without preserving linked workflow/runtime context.
- SwarmView owned `selectedWorkflowId` locally and had no cross-view handoff state.

## Repro 2 — Pack artifact visibility gap
- Pack run UI in `PackLibraryView` previously rendered artifacts as `name + status` only.
- `packResult.artifacts[].value` existed but was not rendered.
- Result: produced artifacts were present in data but not meaningfully visible in the pack surface.

## Identity path chosen
- Keep explicit identity data: `packId`, `workflowId`, optional `executionId`.
- Use the smallest viable mechanism in current architecture:
  - transient app-level navigation intent in `AppContext`
  - one-shot consume/clear semantics
  - reuse `swarm-active-execution` localStorage for execution context handoff into Swarm restoration

## Guard rails
- Do not silently default to unrelated first pack/workflow when explicit context exists.
- Do not clear broader global runtime state from pack surfaces unless ownership is proven local.
- Keep artifact rendering safe and bounded (markdown/text only, explicit empty/fallback states).
