# Context Snapshot: input-node-wrapper-artifact

- Created UTC: 20260413T022552Z
- Trigger: user asked $ralplan after confirming the Input Block still shows a white square beneath it and requested container/DOM inspection.

## Task statement
Understand why the Input Block still renders with a white backing rectangle and produce a precise fix plan before execution.

## Desired outcome
A grounded plan that identifies the real root cause, compares viable fixes, and defines the smallest safe implementation/verification path.

## Known facts / evidence
- Screenshot Immagine 2026-04-13 041957.png shows a large white backing rectangle behind the custom Input Block card.
- DOM inspection in a focused Playwright harness shows the selected Input Block wrapper has class eact-flow__node react-flow__node-input ....
- Computed styles on that wrapper are React Flow defaults: background gb(255,255,255), width 150px, padding 10px, border radius 3px.
- The inner custom InputNode component itself computes correctly to dark emerald (gb(2,44,34)).
- client/node_modules/@xyflow/react/dist/style.css applies built-in default node chrome to .react-flow__node-input.
- client/src/canvas/SwarmCanvas.jsx registers the custom node type as input: InputNode, which collides with React Flow's built-in input node class naming.
- Output Extractor uses outputExtractor, so it does not inherit the same built-in .react-flow__node-output collision in the same way.

## Constraints
- Keep current workflow persistence/runtime semantics stable unless a rename/migration is explicitly chosen.
- Prefer the smallest safe fix that removes the white backing without breaking handles, selection, drag/drop, or existing tests.
- Preserve custom node visual styling and current validation badge behavior.

## Unknowns / open questions
- Should we ship a narrow CSS wrapper override now, or pay the broader cost to rename the persisted node type away from input?
- Do any other custom node types currently collide with reserved React Flow wrapper classes?

## Likely touchpoints
- client/src/canvas/SwarmCanvas.jsx
- client/src/canvas/nodes/InputNode.jsx
- client/src/index.css
- client/src/canvas/SwarmCanvas.test.jsx
- client/src/canvas/nodes/VisualIONodes.test.jsx
