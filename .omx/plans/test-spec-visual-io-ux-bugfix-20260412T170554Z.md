# Test Spec: Visual I/O UX Bugfix Pass

## Verification commands
- `npm test --prefix client -- --run src/canvas/nodes/AgentNode.test.jsx src/canvas/nodes/InputNode.test.jsx src/canvas/nodes/OutputExtractorNode.test.jsx src/canvas/AgentInspector.test.jsx src/hooks/useCanvasValidation.test.js src/canvas/WorkflowRunModal.test.jsx`
- `npm test --prefix server -- --run tests/workflow-contracts.test.js tests/visual-io-swarm-engine.test.js`
- `npm run build`

## Current-system relationship assertions
- Existing agent warning-dot behavior remains unchanged.
- Existing top validation pills still render.
- Legacy workflows without visual I/O nodes still use old contract fallback.
- Visual Input/Output nodes add clarity without changing execution scheduling semantics.

## Ralplan Refresh — Added Test Focus

### Additional verification commands / checks
- Extend client tests to cover InputNode and OutputExtractorNode warning badge rendering and interaction.
- Extend client tests or Playwright smoke to verify validation aggregation messaging between node badges and top pills is not misleading.
- Add a visual/browser regression for the stray white canvas artifact when a minimal workflow is loaded.

### Additional current-system assertions
- Existing agent warning-dot behavior must remain unchanged.
- Top validation pills may continue to exist, but they must behave as workflow-level summary rather than a confusing duplicate local error channel.
- React Flow controls/minimap remain usable while the stray white artifact is eliminated.

## Critic Refinement — Exact Verification Targets

### Validation ownership verification

Extend/add tests with these exact targets:

- `client/src/hooks/useCanvasValidation.test.js`
  - verify node-local issues still carry `nodeId`
  - verify global issues remain limited to workflow-level conditions
- `client/src/canvas/nodes/VisualIONodes.test.jsx`
  - verify InputNode and OutputExtractorNode show warning badges when their node-local issues exist
- `client/src/views/SwarmView.test.jsx`
  - add a case asserting top validation pills summarize workflow/global issues without duplicating the exact same node-local message text for the same state

### Canvas artifact verification

Use one of:
- `client/src/canvas/SwarmCanvas.test.jsx` if the artifact can be isolated in component tests, or
- `scripts/visual-io-nodes-playwright-smoke.mjs` if the artifact depends on full browser layout

Exact repro assertion:
- with a minimal workflow containing an Input node in Swarm view, left palette open, right chat/activity rail open, there is **no detached white vertical rectangle** rendered in the lower-left canvas area.
- React Flow controls and minimap remain visible and usable.

### Pass/fail rule for this refreshed plan

The plan is only ready for Ralph execution when:
- validation ownership rules are explicit in PRD,
- exact test file targets are named,
- canvas artifact repro scenario is concrete,
- and the verification path names what proves the bug is gone.
