# OpenWorkflow Drill-Down Bug

- Task statement: Plan the fix for the Pack Builder "Open workflow drill-down" bug where clicking the button often opens a black screen or lands on generic Swarm instead of the linked workflow.
- Desired outcome: A consensus fix plan that makes Pack Builder -> Swarm drill-down deterministic, preserves the intended workflow/execution context, and adds regression coverage for the intermittent black-screen/navigation failure.

## Known facts / evidence
- User report (2026-04-12): clicking "Open workflow drill-down" often makes the screen go black or opens Swarm without the actual underlying workflow for the selected pack.
- Screenshot path: C:\Users\arman\Downloads\Immagine 2026-04-12 041807.png shows Pack Builder with the button visible and a linked workflow selected.
- Recent memory says this area was previously fixed, but the user reports the bug persists intermittently in the live app.
- `client/src/views/PackBuilderView.jsx` currently handles the button click by optionally writing `swarm-active-execution`, dispatching `SET_NAVIGATION_INTENT` with `focus: workflow-runtime`, then dispatching `SET_VIEW` to `swarm`.
- `client/src/views/SwarmView.jsx` consumes `navigationIntent` asynchronously, sets `selectedWorkflowId`, optionally fetches the target workflow, and clears the one-shot intent.
- `client/src/hooks/useSwarm.js` independently restores persisted `swarm-active-execution` from localStorage and may clear or hydrate execution state based on `/api/v1/swarm/:executionId/status`.
- Existing tests cover the happy path for Pack Builder drill-down, but there is no explicit stress/race regression for repeated drill-down, stale execution ids, delayed workflow fetch, or storage/intent precedence conflicts.

## Constraints
- No new dependencies.
- Keep diffs small and reversible.
- Preserve the pack-first operator flow; Swarm remains an advanced drill-down, not the default operator surface.
- Need a targeted Playwright smoke for the affected user-visible behavior before declaring completion.

## Unknowns / open questions
- Whether the black screen is caused by a React render crash, an inconsistent Swarm store hydration/reset, or a navigation race between `navigationIntent` and persisted execution restoration.
- Whether stale or terminal `executionId` values written by Pack Builder are incorrectly overriding the intended workflow selection path.
- Whether Swarm is reusing previous in-memory workflow state before the intended workflow fetch completes.

## Likely touchpoints
- client/src/views/PackBuilderView.jsx
- client/src/views/PackBuilderView.test.jsx
- client/src/views/SwarmView.jsx
- client/src/views/SwarmView.test.jsx
- client/src/hooks/useSwarm.js
- client/src/store/AppContext.jsx
- scripts/v17-review-followup-playwright-smoke.mjs (or a new targeted smoke)
