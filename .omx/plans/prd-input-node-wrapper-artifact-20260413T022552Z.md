# PRD — Input Block wrapper artifact fix

- Created UTC: 2026-04-13T02:25:52Z
- Context snapshot: `.omx/context/input-node-wrapper-artifact-20260413T022552Z.md`
- Mode: ralplan consensus APPROVED

## Problem
The custom Visual I/O Input Block renders with a white backing rectangle behind it.

## Grounded root cause
This is not an inner InputNode styling bug.
It is a React Flow wrapper collision:
- the custom node is registered with `type: 'input'`
- React Flow wraps it with `.react-flow__node-input`
- upstream `@xyflow/react/dist/style.css` applies built-in wrapper chrome there
  - white background
  - fixed width (150px)
  - padding (10px)
  - default border/radius

DOM evidence from focused Playwright inspection:
- wrapper class: `react-flow__node react-flow__node-input ...`
- wrapper computed background: `rgb(255,255,255)`
- inner custom InputNode remains correctly dark emerald

## Goal
Remove the white wrapper artifact durably while preserving all existing saved workflows and visual I/O execution semantics.

## Principles
1. Fix root cause, not only the symptom.
2. Preserve backward compatibility for persisted workflows.
3. Centralize alias/type handling to avoid future drift.
4. Prefer a durable semantic fix over brittle CSS warfare against upstream internals.

## Decision drivers
1. Correctness: `input` collides with a reserved React Flow wrapper class.
2. Safety: legacy workflows already persist `type: 'input'`.
3. Maintainability: avoid permanent dependence on fragile selector overrides.

## Options considered

### Option A — CSS override only
Keep `type: 'input'` and override `.react-flow__node-input` in app CSS.

**Pros**
- smallest diff
- fastest hotfix
- no compatibility work

**Cons**
- fights upstream internals
- can regress on React Flow upgrades
- leaves semantic collision in place
- may require increasingly specific selectors/`!important`

### Option B — Rename custom node type with backward-compatible aliasing **(chosen)**
Move new custom nodes to a canonical type such as `workflowInput`, while continuing to read legacy `input` workflows everywhere.

**Pros**
- removes root cause cleanly
- avoids upstream wrapper chrome entirely
- semantically clearer
- durable long-term

**Cons**
- broader touch surface
- requires disciplined alias coverage across client/server/tests

### Option C — Hybrid phased fix
Temporary CSS patch now, rename later.

**Pros**
- immediate relief

**Cons**
- double work
- high chance the temporary patch becomes permanent debt

## Decision
Adopt **Option B**.
Use **read both, write new**:
- legacy persisted nodes with `type: 'input'` remain valid
- newly created nodes use `type: 'workflowInput'`

## Mandatory guardrails
1. **Single source of truth** for canonical + legacy input node types.
2. **Explicit legacy regression coverage** for:
   - render
   - inspector
   - validation
   - contract derivation
   - execution

## Implementation shape
1. Introduce canonical helpers/constants for visual input node typing.
2. Change new-node creation and node registration to emit/use `workflowInput`.
3. Keep legacy `input` readable everywhere that interprets workflows.
4. Remove ad hoc `node.type === 'input'` checks in touched surfaces.
5. Add focused tests for both legacy and canonical types.

## File touchpoints
### Primary
- `client/src/canvas/SwarmCanvas.jsx`
- `client/src/canvas/NodePalette.jsx`
- `client/src/canvas/AgentInspector.jsx`
- `client/src/hooks/useCanvasValidation.js`
- `client/src/utils/visualWorkflowContracts.js`
- `server/services/workflowContracts.js`
- `server/services/SwarmEngine.js`

### Tests
- `client/src/canvas/SwarmCanvas.test.jsx`
- `client/src/canvas/AgentInspector.test.jsx`
- `client/src/hooks/useCanvasValidation.test.js`
- `client/src/utils/visualWorkflowContracts.test.js`
- `client/src/views/SwarmView.test.jsx`
- `server/tests/workflow-contracts.test.js`
- `server/tests/visual-io-swarm-engine.test.js`

## Acceptance criteria
1. A newly created Input Block no longer shows white wrapper chrome.
2. React Flow no longer styles the custom Input Block as built-in `.react-flow__node-input`.
3. Existing saved workflows with `type: 'input'` still load correctly.
4. Inspector/validation/contract derivation/execution still work for legacy workflows.
5. New workflows persist/create Input Blocks with canonical `workflowInput` type.
6. Targeted tests, build, and visual smoke all pass.

## ADR
### Decision
Rename the custom Input Block node type to `workflowInput` while supporting legacy `input` as a compatibility alias.

### Drivers
- grounded root-cause evidence
- maintainability
- compatibility safety

### Alternatives considered
- CSS override only
- hybrid CSS now / rename later

### Why chosen
It removes the actual collision instead of masking it, while keeping old workflows valid.

### Consequences
- slightly broader change surface now
- much lower long-term risk of wrapper-style regressions
- requires disciplined alias coverage

### Follow-ups
- audit whether any other custom node types collide with reserved React Flow wrapper classes
- consider centralizing visual node-type constants more broadly if more aliases appear

## Execution handoff
- Recommended lane: `$ralph`
- Suggested ownership: single-owner Ralph pass with focused compatibility verification
- Verification path: client targeted tests -> server targeted tests -> build -> visual Playwright smoke
