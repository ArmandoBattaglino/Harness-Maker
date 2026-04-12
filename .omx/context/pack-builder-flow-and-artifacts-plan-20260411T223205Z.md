# Task Context Snapshot

- Task statement: Plan fixes for two newly observed pack-surface bugs: (1) from Packs, opening Builder/drill-down does not let the user see the linked workflow flow running, and (2) the Packs surface does not show produced artifact content in a useful way.
- Desired outcome: A consensus implementation plan that clarifies the intended UX/state boundaries and defines the right fixes plus verification.

## Known facts / evidence
- `client/src/views/PackLibraryView.jsx` offers an `Open in Builder` button that only dispatches `SET_VIEW: 'pack-builder'`; it does not pass the selected pack identity or linked workflow identity.
- `client/src/views/PackBuilderView.jsx` has local state `selectedPackId` and only auto-selects the first pack when none is selected; it also has an `Open workflow drill-down` button that only dispatches `SET_VIEW: 'swarm'`.
- `client/src/views/SwarmView.jsx` owns `selectedWorkflowId` locally and loads workflows internally; there is no visible cross-view handoff state that selects the linked workflow when navigating from Pack Builder or Pack Library.
- This likely explains the user report that opening Builder/drill-down from the pack area does not show the expected linked flow.
- `client/src/views/PackLibraryView.jsx` renders run-monitor artifacts as a simple list of `artifact.name` + optional `status`, using `scopedPackResult?.artifacts ?? pack.artifactDefinitions ?? []`.
- `server/services/PackResultBuilder.js` includes artifact `value` fields in `packResult.artifacts`, but the Pack Library UI does not render those values.
- Therefore the current Packs surface can show that an artifact exists, but not the produced artifact content itself, which matches the user report that no produced artifact is effectively given back.
- Related existing surfaces:
  - `client/src/panels/WorkflowArtifactPanel.jsx` already renders aggregated markdown workflow artifacts in a richer panel.
  - Pack Builder is described as a guided authoring surface where the workflow graph is only available as advanced drill-down, not embedded directly.
- Recent verification/fixes already touched:
  - `client/src/views/PackLibraryView.jsx`
  - `client/src/views/PackLibraryView.test.jsx`
  - deterministic Playwright smoke for Builder -> Library -> Launch -> Output

## Constraints
- No new dependencies.
- Keep diffs small and reversible.
- Need truthful UX semantics: distinguish pack authoring, workflow drill-down, and pack run monitoring.
- Must verify user-visible behavior with targeted client tests and a smoke/browser path.

## Unknowns / open questions
- Should `Open in Builder` open the selected pack in Builder directly, or is Builder intended to remain pack-list-first with separate selection?
- Should Builder itself embed a mini graph/preview, or should it only deep-link correctly into Swarm with the linked workflow selected?
- For artifacts, should Pack Library show inline artifact content previews, download/view actions, or a drill-down modal per artifact type?
- Are the produced artifacts missing because of UI rendering only, or are there runtime/result-builder gaps for some artifact source types beyond the current evidence?

## Likely codebase touchpoints
- `client/src/views/PackLibraryView.jsx`
- `client/src/views/PackLibraryView.test.jsx`
- `client/src/views/PackBuilderView.jsx`
- `client/src/views/PackBuilderView.test.jsx`
- `client/src/views/SwarmView.jsx`
- `client/src/store/AppContext.jsx`
- `client/src/panels/WorkflowArtifactPanel.jsx`
- `server/services/PackResultBuilder.js`
- `scripts/v17-review-followup-playwright-smoke.mjs`
