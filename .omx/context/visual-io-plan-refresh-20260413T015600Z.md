# Context Snapshot: visual-io-plan-refresh

- Created UTC: 2026-04-13T01:56:00Z
- Trigger: user asked `$ralplan aggiorniamo il piano` after new screenshots and ongoing bug hunt.

## Task statement
Refresh the Visual I/O UX bugfix plan to include newly discovered issues: node-local warning badge parity, confusion between top validation pills and node badges, Output/Input clarity, and stray white canvas artifact.

## Desired outcome
Updated approved PRD + test-spec for the next execution pass, covering all currently known UX/validation/canvas issues.

## Known facts
- Existing plan files: `.omx/plans/prd-visual-io-ux-bugfix-20260412T170554Z.md`, `.omx/plans/test-spec-visual-io-ux-bugfix-20260412T170554Z.md`.
- Bug report exists at `.omx/reports/bug_report_visual_io_branch_20260412.md` and now includes BUG-01..BUG-09.
- New screenshot evidence adds explicit need to reason about duplicated/unclear validation surfacing (top pills vs node-local badges).
- Current implementation worktree has only report-file modifications pending; planning should not start code execution.

## Likely touchpoints
- client/src/hooks/useCanvasValidation.js
- client/src/canvas/nodes/InputNode.jsx
- client/src/canvas/nodes/OutputExtractorNode.jsx
- client/src/canvas/AgentInspector.jsx
- client/src/views/SwarmView.jsx
- client/src/canvas/SwarmCanvas.jsx
- client/src/index.css
