# Test Spec — Input Block wrapper artifact fix

- Created UTC: 2026-04-13T02:25:52Z
- PRD: `.omx/plans/prd-input-node-wrapper-artifact-20260413T022552Z.md`

## Test intent
Prove that the white backing rectangle is eliminated for new Input Blocks without breaking legacy workflows persisted with `type: 'input'`.

## Unit / component coverage

### 1. SwarmCanvas
**File:** `client/src/canvas/SwarmCanvas.test.jsx`
- verify new Input Block creation uses canonical `workflowInput`
- verify node registration still renders InputNode for canonical type
- if practical, assert the rendered wrapper no longer relies on `.react-flow__node-input` semantics for new nodes

### 2. AgentInspector
**File:** `client/src/canvas/AgentInspector.test.jsx`
- legacy node `{ type: 'input' }` still opens Input Block fields
- canonical node `{ type: 'workflowInput' }` also opens Input Block fields

### 3. Canvas validation
**File:** `client/src/hooks/useCanvasValidation.test.js`
- validation treats legacy `input` and canonical `workflowInput` identically
- disconnected / malformed Input Block rules still apply to both

### 4. Client contract derivation
**File:** `client/src/utils/visualWorkflowContracts.test.js`
- legacy and canonical input node types derive identical effective input contracts

## Server/integration coverage

### 5. Server workflow contracts
**File:** `server/tests/workflow-contracts.test.js`
- legacy `input` workflow still normalizes/derives correctly
- canonical `workflowInput` workflow normalizes/derives identically

### 6. Runtime semantics
**File:** `server/tests/visual-io-swarm-engine.test.js`
- execution semantics for visual input nodes remain unchanged for both types

## Visual regression coverage

### 7. Focused visual smoke
**Existing file:** `scripts/visual-io-nodes-playwright-smoke.mjs`
- update/extend if needed so the created Input Block uses canonical type
- prove no white backing artifact for newly created canonical node

### 8. Optional focused DOM assertion
Use a small Playwright harness to assert:
- new Input Block wrapper is not styled with built-in `.react-flow__node-input` chrome
- or that computed wrapper background is not white for the new canonical type path

## Verification commands
```bash
npm test --prefix client -- --run src/canvas/SwarmCanvas.test.jsx src/canvas/AgentInspector.test.jsx src/hooks/useCanvasValidation.test.js src/utils/visualWorkflowContracts.test.js src/views/SwarmView.test.jsx
npm test --prefix server -- --run tests/workflow-contracts.test.js tests/visual-io-swarm-engine.test.js
npm run build
node scripts/visual-io-nodes-playwright-smoke.mjs
```

## Pass conditions
- all targeted tests pass
- build passes
- visual smoke passes
- newly created Input Block no longer shows the white backing rectangle
- legacy persisted `input` workflows still function without behavior regressions

## Risks to watch during execution
1. missed ad hoc `node.type === 'input'` checks
2. client/server alias drift
3. tests that only cover canonical type but not legacy type
4. accidental broad migration of persisted workflow files when only read-compatibility is intended
