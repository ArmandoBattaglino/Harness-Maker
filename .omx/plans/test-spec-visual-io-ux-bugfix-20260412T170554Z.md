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
