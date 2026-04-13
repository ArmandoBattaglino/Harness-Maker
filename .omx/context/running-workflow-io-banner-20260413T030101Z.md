# Context Snapshot: running-workflow-io-banner

- Created UTC: 20260413T030101Z
- Trigger: user asked $ralplan after reporting that the green workflow banner still appears while the flow is running.

## Task statement
Plan the removal of the green "Workflow run I/O" banner while a workflow execution is actively running.

## Desired outcome
A precise approved plan that removes the banner entirely during active execution states without regressing post-run visibility.

## Known facts / evidence
- Screenshot Immagine 2026-04-13 044727.png shows the green banner at the top while the workflow is running.
- In client/src/views/SwarmView.jsx, the banner is rendered by WorkflowRunSummary.
- WorkflowRunSummary currently renders whenever workflowRun or workflowResult exists.
- The desired behavior is to suppress it while the execution is active; showing it again after completion is acceptable.

## Constraints
- Keep the fix bounded to this banner behavior.
- Do not regress completed-run visibility unless explicitly intended.
- Prefer a minimal change with targeted regression coverage.

## Unknowns / open questions
- Whether the user wants the banner hidden only during unning or during all active execution states (unning, paused, locked, stopping).
- Whether any other runtime banner should be folded into the same cleanup later.

## Likely touchpoints
- client/src/views/SwarmView.jsx
- client/src/views/SwarmView.test.jsx
