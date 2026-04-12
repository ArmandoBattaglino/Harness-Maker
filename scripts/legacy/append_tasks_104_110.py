#!/usr/bin/env python3
"""Append tasks #104-#110 (QA bug-fix wave) to docs/TASK_PLAN.md."""

import os

base = r"C:\Users\arman\Downloads\Test workflows - Copia"
task_plan = os.path.join(base, "docs", "TASK_PLAN.md")

content = r"""

---

## Post-Release QA Bug-Fix Wave — Tasks #104–#110

**Declared:** 2026-03-29
**Source:** QA visual inspection (Puppeteer audit, 2026-03-29)
**Scope:** 7 frontend bugs found during visual regression testing of the fully integrated SwarmView.
  CRITICAL (2), MEDIUM (3), LOW (2).
**Assigned to:** frontend-dev
**Blocking:** V3 production release

---

TASK #104: BUG-VISUAL-01 — InterAgentFeed canvas width collapse (missing w-56 shrink-0)
Agent: frontend-dev
Priority: HIGH
Difficulty: LOW
Suggested Model: haiku
Status: PENDING
Context:
  BUG ID: BUG-VISUAL-01
  Severity: CRITICAL — the React Flow canvas collapses to ~172px wide, making it completely unusable.
  The minimap (202px) overflows 45px past the canvas left boundary into the sidebar.

  ROOT CAUSE:
  client/src/canvas/InterAgentFeed.jsx is missing the Tailwind classes `w-56 shrink-0` on its root
  container div. Without an explicit width, the component has no width reservation and the flex row
  in SwarmView.jsx distributes the remaining space incorrectly.

  The component has TWO render paths that both need the fix:

  PATH 1 — empty state (no messages yet):
    File: client/src/canvas/InterAgentFeed.jsx
    Line: ~28
    Current code:  <div className="flex flex-col ...">
    Required fix:  Add `w-56 shrink-0` to the className string so it becomes something like:
                   <div className="w-56 shrink-0 flex flex-col ...">

  PATH 2 — populated state (messages present):
    File: client/src/canvas/InterAgentFeed.jsx
    Line: ~40
    Current code:  <div className="flex flex-col ...">
    Required fix:  Add `w-56 shrink-0` to the className string (same fix, same class names).

  Note: Task #103 (BUG-SW-03) covers the empty-state-specific fix. This task covers the populated
  state (line ~40) AND ensures the empty state fix is also present. If both render paths share a
  single root div, one fix covers both. Inspect the actual file to confirm whether both paths use
  the same root element or separate ones.

  VERIFICATION:
  After the fix, the React Flow canvas in SwarmView should be at least 500px wide (the remaining
  space after w-56 InterAgentFeed + w-64 AgentInspector are subtracted from the total flex row).
  Run: npm run build from client/ -- must pass 0 errors.
  Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Both the empty-state and populated-state root divs in InterAgentFeed.jsx have `w-56 shrink-0`
  - [ ] The React Flow canvas in SwarmView is no longer collapsed (visually occupies remaining space)
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #102
---

TASK #105: BUG-SW-01 — Stop button invisible when execution is paused
Agent: frontend-dev
Priority: HIGH
Difficulty: LOW
Suggested Model: haiku
Status: PENDING
Context:
  BUG ID: BUG-SW-01
  Severity: CRITICAL — users cannot stop a paused swarm execution. The Stop button disappears the
  moment the user clicks Pause, leaving no way to terminate the run from the UI.

  ROOT CAUSE:
  File: client/src/views/SwarmView.jsx
  Line: ~159 (the Stop button's visibility/render condition)

  Current condition (approximate):
    {executionStatus === 'running' && (
      <button onClick={handleStop}>Stop</button>
    )}

  The condition must be broadened to show Stop when the execution is either running OR paused:
    {(executionStatus === 'running' || executionStatus === 'paused') && (
      <button onClick={handleStop}>Stop</button>
    )}

  Alternatively written as:
    {['running', 'paused'].includes(executionStatus) && (
      <button onClick={handleStop}>Stop</button>
    )}

  Read the file to confirm the exact condition syntax before editing.

  CONTEXT:
  - executionStatus comes from SwarmContext.jsx (added in task #103).
  - Valid values: 'idle' | 'running' | 'paused'
  - The Stop button calls handleStop (or stopExecution from useSwarm hook).
  - Do NOT change the Stop button's onClick handler or styling — only widen the visibility condition.

  VERIFICATION:
  Simulate: executionStatus = 'paused' → Stop button must be visible.
  Simulate: executionStatus = 'running' → Stop button must be visible.
  Simulate: executionStatus = 'idle' → Stop button must NOT be visible.
  Run: npm run build from client/ -- must pass 0 errors.
  Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Stop button is visible when executionStatus === 'running'
  - [ ] Stop button is visible when executionStatus === 'paused'
  - [ ] Stop button is NOT visible when executionStatus === 'idle'
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #101, #103
---

TASK #106: BUG-SW-02 — Run button callable with no project selected
Agent: frontend-dev
Priority: HIGH
Difficulty: LOW
Suggested Model: haiku
Status: PENDING
Context:
  BUG ID: BUG-SW-02
  Severity: CRITICAL — clicking Run with no project selected calls startExecution with an empty or
  null projectId, which sends a malformed API request to the server and causes a silent failure or
  server error with no feedback to the user.

  ROOT CAUSE:
  File: client/src/views/SwarmView.jsx
  Line: ~126 (the Run button's visibility/enabled condition)

  The Run button is currently shown/enabled based on executionStatus === 'idle' alone, without
  checking whether a project is actually selected.

  Fix: add `&& activeProjectId` to the Run button's render condition so it only appears (or is
  enabled) when both conditions are true:

  Current (approximate):
    {executionStatus === 'idle' && (
      <button onClick={handleRun}>Run</button>
    )}

  Fixed:
    {executionStatus === 'idle' && activeProjectId && (
      <button onClick={handleRun}>Run</button>
    )}

  WHERE activeProjectId comes from:
  - It is available from SwarmContext or from a useProjects/useActiveProject hook.
  - Read the top of SwarmView.jsx to find where it is already destructured. It is likely already
    in scope from an existing hook call — just add it to the condition.
  - If it is NOT already in scope, import it from the appropriate context (check
    client/src/context/SwarmContext.jsx or client/src/hooks/useSwarm.js for the variable name).

  ALTERNATIVE: If hiding the button is not preferred UX, disable it instead:
    <button onClick={handleRun} disabled={!activeProjectId || executionStatus !== 'idle'}>Run</button>

  Either approach is acceptable. Hiding (conditional render) is the simpler fix.

  VERIFICATION:
  - With no project selected: Run button must not be visible (or must be disabled).
  - With a project selected and status idle: Run button must be visible and enabled.
  - Run: npm run build from client/ -- must pass 0 errors.
  - Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Run button is NOT shown (or is disabled) when activeProjectId is null/undefined/empty
  - [ ] Run button IS shown and enabled when activeProjectId is set and executionStatus === 'idle'
  - [ ] startExecution is never called with a null/empty projectId
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #101
---

TASK #107: BUG-SW-03 — InterAgentFeed empty-state missing w-56 shrink-0 (layout shift)
Agent: frontend-dev
Priority: MEDIUM
Difficulty: LOW
Suggested Model: haiku
Status: PENDING
Context:
  BUG ID: BUG-SW-03
  Severity: MEDIUM — when InterAgentFeed has not yet received any messages, the empty-state div
  has no reserved width, causing a layout shift the moment the first event arrives and the component
  switches to its populated render path.

  This is the same root fix as BUG-VISUAL-01 (Task #104) but specifically for the empty-state
  render branch (line ~28 in InterAgentFeed.jsx).

  FILE: client/src/canvas/InterAgentFeed.jsx
  LINE: ~28 (the empty-state/no-messages render path root div)

  Fix: ensure the empty-state root div has `w-56 shrink-0` in its className.

  NOTE: Task #104 may already cover this fix if both render paths share the same root element.
  If Task #104 has already been completed and both render paths were fixed together, this task
  can be marked COMPLETED with a note referencing #104.

  If the two paths use separate root divs, apply the same `w-56 shrink-0` fix to the empty-state
  div at line ~28.

  VERIFICATION:
  On initial render (before any agent messages), the InterAgentFeed panel must occupy a fixed 224px
  (w-56 = 14rem = 224px at default Tailwind 16px base). No layout shift when first message arrives.
  Run: npm run build from client/ -- must pass 0 errors.
  Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Empty-state render path div has `w-56 shrink-0`
  - [ ] No layout shift when the first inter-agent message arrives
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #102, #104
---

TASK #108: BUG-VISUAL-05 — HitlInbox drawer has no visible title/header; HITL button double-click event bubbling
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: sonnet
Status: PENDING
Context:
  BUG ID: BUG-VISUAL-05
  Severity: MEDIUM — two separate issues in the HITL drawer in SwarmView.jsx:

  ISSUE A — Missing drawer title/header:
  The HITL inbox drawer container in SwarmView.jsx has no visible title or header. When the drawer
  opens, the user sees a list of approval requests with no panel label identifying what it is.
  Fix: add a header element inside the drawer container div. Suggested markup:
    <div className="p-4 border-b border-gray-700">
      <h2 className="text-sm font-semibold text-white">HITL Inbox</h2>
    </div>
  Place this immediately inside the drawer container, before the <HitlInbox /> component.

  FILE: client/src/views/SwarmView.jsx
  LOCATION: the drawer container div that wraps <HitlInbox /> (added in task #100).

  ISSUE B — Double-click event bubbling on HITL toggle button:
  Clicking the HITL button twice in rapid succession causes event bubbling that may open and
  immediately re-close the drawer, or trigger the underlying canvas click handler.
  Fix: add `e.stopPropagation()` to the HITL button's onClick handler:
    onClick={(e) => { e.stopPropagation(); toggleHitlDrawer(); }}
  Or if the handler is defined separately:
    const handleHitlToggle = (e) => { e.stopPropagation(); toggleHitlDrawer(); }

  FILE: client/src/views/SwarmView.jsx
  LOCATION: the HITL toggle button's onClick prop (near the toolbar area, added in task #100).

  Read the file to find the exact current handler syntax before editing.

  VERIFICATION:
  - Drawer must display "HITL Inbox" as a visible header when open.
  - Clicking HITL button twice must not cause unexpected double-toggle or canvas interference.
  - Run: npm run build from client/ -- must pass 0 errors.
  - Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Drawer has a visible "HITL Inbox" title/header element
  - [ ] Header is styled consistently with the app's dark theme (text-white, border-gray-700 or similar)
  - [ ] HITL toggle button has e.stopPropagation() on its onClick handler
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #100
---

TASK #109: BUG-SW-05 — HitlInbox approve/reject silently no-ops when executionId is null
Agent: frontend-dev
Priority: MEDIUM
Difficulty: MEDIUM
Suggested Model: sonnet
Status: PENDING
Context:
  BUG ID: BUG-SW-05
  Severity: MEDIUM — when the user clicks Approve or Reject in HitlInbox and executionId is null
  (e.g. no active execution, or the execution ended between the inbox opening and the click), the
  handler silently returns with no feedback. The user sees nothing — no error, no toast, no disabled
  state — and may click repeatedly thinking the UI is unresponsive.

  FILE: client/src/panels/HitlInbox.jsx
  LINES: ~52-53 (approve handler early-return guard)
         ~72-73 (reject handler early-return guard)

  Current approximate code pattern:
    const handleApprove = async (requestId) => {
      if (!executionId) return;   // line ~52 — silent no-op
      ...
    }

    const handleReject = async (requestId) => {
      if (!executionId) return;   // line ~72 — silent no-op
      ...
    }

  FIX OPTIONS (implement one consistently for both handlers):

  OPTION A — Disable approve/reject buttons when executionId is null:
    <button disabled={!executionId} onClick={() => handleApprove(req.id)}>Approve</button>
    <button disabled={!executionId} onClick={() => handleReject(req.id)}>Reject</button>
    Add visual styling for disabled state: `disabled:opacity-50 disabled:cursor-not-allowed`

  OPTION B — Show an inline error/toast when the guard fires:
    if (!executionId) {
      // call a toast/notification function if available, or set local error state
      setError('No active execution — cannot approve/reject.');
      return;
    }
    Display the error inline in the component (a small red text below the list, or a toast).

  RECOMMENDED: OPTION A (disable buttons) is simpler and provides immediate visual feedback.
  If a toast/notification system already exists in the codebase (check client/src/components/ for
  Toast.jsx or similar), OPTION B may also be used. Either is acceptable.

  Read the file at lines 40-90 to understand the full handler and render structure before editing.

  VERIFICATION:
  - With executionId null: Approve and Reject buttons must be visually disabled (or hidden).
  - With executionId set: buttons must work as before.
  - No silent no-ops — the user must always know why a button is non-functional.
  - Run: npm run build from client/ -- must pass 0 errors.
  - Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Approve button is disabled (or hidden) when executionId is null
  - [ ] Reject button is disabled (or hidden) when executionId is null
  - [ ] User receives visible feedback (disabled styling or error message) instead of silent failure
  - [ ] Handlers still work correctly when executionId is present
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #100, #68
---

TASK #110: BUG-VISUAL-07 — Sidebar footer shows v0.1.0 instead of v3.0.0
Agent: frontend-dev
Priority: LOW
Difficulty: LOW
Suggested Model: haiku
Status: PENDING
Context:
  BUG ID: BUG-VISUAL-07
  Severity: LOW — the sidebar footer displays the version string "v0.1.0" instead of the correct
  release version "v3.0.0". This is a cosmetic issue that erodes trust in the release.

  ROOT CAUSE (likely — confirm before editing):
  The version string is hardcoded or read from a stale source. Common locations to check:

  1. client/src/components/Sidebar.jsx (or wherever the sidebar footer is rendered) — may have
     a hardcoded version string like `v0.1.0`.
  2. client/package.json — `"version"` field. Vite can expose this as `import.meta.env.VITE_APP_VERSION`
     if configured in vite.config.js (define block).
  3. package.json (root) — root-level version field.
  4. vite.config.js — define block that injects version at build time.

  INVESTIGATION STEPS:
  a) Search for "0.1.0" in client/src/ to find where the string lives.
  b) Search for "version" in client/src/components/Sidebar.jsx (or wherever the footer renders).
  c) Check if import.meta.env.PACKAGE_VERSION or similar is used.

  FIX:
  - If hardcoded: change the string to "v3.0.0".
  - If read from package.json via import.meta.env: update the `"version"` field in the relevant
    package.json to "3.0.0".
  - If there is a Vite define in vite.config.js referencing package.json version, updating
    package.json version is sufficient.

  Do NOT change the major UI structure of the sidebar. This is a one-line string fix.

  VERIFICATION:
  After fix, the sidebar footer must display "v3.0.0" (or the correct current release version).
  Run: npm run build from client/ -- must pass 0 errors.
  Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] Sidebar footer displays "v3.0.0" (not "v0.1.0" or any other outdated string)
  - [ ] Version source is identified and documented (hardcoded vs. package.json vs. env)
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: none
---

TASK #111: BUG-SW-04 — useSwarm.js agentStates full-object dep causes excess WebSocket reconnections
Agent: frontend-dev
Priority: LOW
Difficulty: MEDIUM
Suggested Model: sonnet
Status: PENDING
Context:
  BUG ID: BUG-SW-04
  Severity: LOW — useSwarm.js includes the full agentStates object in the dependency array of the
  connectWs useCallback/useEffect. Because agentStates is a plain object reference that changes on
  every agent state update, the WebSocket connection is torn down and recreated far more often than
  necessary — potentially on every incoming WS message. This causes subtle flicker and wasted
  network round-trips but does not cause a hard crash.

  FILE: client/src/hooks/useSwarm.js
  LINE 15: agentStates is defined (useState or equivalent)
  LINE 63: agentStates appears in the connectWs dependency array (useCallback or useEffect deps)

  INVESTIGATION:
  Read lines 1-100 of the file to understand the full hook structure before editing.

  FIX:
  The connectWs function should NOT depend on the full agentStates object. Instead:

  OPTION A — Remove agentStates from deps entirely if connectWs does not read agentStates:
    Replace: [agentStates, ...]
    With:    [...]  (remove agentStates from the array)

  OPTION B — If connectWs needs to read agentStates inside callbacks, use a ref instead:
    const agentStatesRef = useRef(agentStates);
    useEffect(() => { agentStatesRef.current = agentStates; }, [agentStates]);
    // Then inside connectWs, read agentStatesRef.current instead of agentStates
    // Remove agentStates from connectWs deps — the ref is always current

  OPTION C — If only specific keys from agentStates are needed as deps:
    // Destructure stable primitives from agentStates and use those in deps instead
    const agentCount = Object.keys(agentStates).length;
    // Use agentCount in deps instead of agentStates

  RECOMMENDED: Read the file first. If connectWs does not actually read agentStates (it only writes
  to it via dispatch/setter), OPTION A (removal) is the correct fix. If it does read it, use OPTION B.

  VERIFICATION:
  - WS connection must NOT be recreated on every agent state update message.
  - Existing WS behavior (connect on mount, reconnect on project change) must be preserved.
  - Run: npm run build from client/ -- must pass 0 errors.
  - Run: npm test -- must pass (187 tests).

Acceptance Criteria:
  - [ ] agentStates full object is NOT in connectWs dependency array
  - [ ] WebSocket is not recreated on each agentStates update
  - [ ] All existing WS behaviors preserved (connect, disconnect, reconnect)
  - [ ] npm run build passes (0 errors)
  - [ ] npm test passes (187 tests)
Dependencies: #101
---
"""

with open(task_plan, "a", encoding="utf-8") as f:
    f.write(content)

print("Done -- appended tasks #104-#111 (8 tasks, QA bug-fix wave)")
