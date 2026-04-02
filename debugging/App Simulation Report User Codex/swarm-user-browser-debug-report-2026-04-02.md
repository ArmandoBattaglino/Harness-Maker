# Swarm User Browser Debug Report

Date: 2026-04-02
Project: `C:\Users\arman\Downloads\Test workflows - Copia`
Scope: Swarm section only
Mode: User-style browser audit plus PRD/code cross-check for blocked paths

## Method

This report was produced by:
- reading the Swarm PRD in [docs/PRD.md](C:\Users\arman\Downloads\Test workflows - Copia\docs\PRD.md)
- opening the app in a real browser session at `http://127.0.0.1:3000`
- navigating the UI as a user would
- testing reachable Swarm controls directly in browser
- cross-checking blocked or inconsistent behavior against implementation files and the project memory docs

Browser evidence artifacts saved during the run:
- [swarm-home.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-home.png)
- [swarm-hitl-open.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-hitl-open.png)
- [swarm-scaffold-error.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-scaffold-error.png)

## User Flow Tested

1. Open app landing page
2. Confirm registered projects are present
3. Enter Swarm view
4. Verify idle-state controls
5. Open and close HITL drawer
6. Attempt Prompt-to-Flow generation from the UI
7. Cross-check whether existing saved workflows can be loaded from the UI
8. Cross-check downstream execution paths against PRD and implementation when onboarding blocker prevented full user traversal

## Findings

### BUG-SWARM-001
Severity: CRITICAL
Title: Prompt-to-Flow generation fails with HTTP 500 and blocks the primary Swarm onboarding path

Area:
- PromptToFlow
- Workflow creation
- First-run Swarm UX

Steps to reproduce:
1. Open the app
2. Navigate to the `Swarm` view
3. Select a project first if needed
4. Type a valid workflow description in the prompt input
5. Click `Generate`

Expected output:
- The app should call `POST /api/v1/swarm/scaffold`
- The request should return `201`
- A valid workflow graph should appear on the canvas
- The user should be able to inspect nodes and proceed to `Run`

Actual output:
- The browser request returns `500`
- The UI shows the error text `Claude exited 1:`
- No graph is generated
- `Run` remains disabled
- The user is blocked before reaching the main value of the Swarm feature

Observed evidence:
- Browser response body: `{"error":"Claude exited 1: "}`
- Screenshot: [swarm-scaffold-error.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-scaffold-error.png)

User impact:
- A new user cannot create a workflow from the advertised primary entrypoint
- The most important Swarm path in the PRD is broken at the first actionable step

Relevant files:
- [PromptToFlowBar.jsx](C:\Users\arman\Downloads\Test workflows - Copia\client\src\canvas\PromptToFlowBar.jsx)
- [swarm.js](C:\Users\arman\Downloads\Test workflows - Copia\server\routes\swarm.js)

### BUG-SWARM-002
Severity: HIGH
Title: Existing saved workflows are not discoverable or loadable from the Swarm UI

Area:
- Workflow reuse
- Swarm UX

Steps to reproduce:
1. Open the app
2. Navigate to `Swarm`
3. Look for any visible control to load or select an existing workflow

Expected output:
- Since the backend exposes workflow CRUD and saved workflows already exist, the user should have a visible way to select or load an existing workflow into the canvas
- A returning user should not be forced to regenerate a workflow every session

Actual output:
- No visible `Load workflow`, `Saved workflows`, or equivalent control is present in the Swarm UI
- At the time of testing, the backend already contained multiple saved workflows via `/api/v1/workflows`
- From a user perspective, saved workflows exist but are effectively inaccessible in the Swarm screen

User impact:
- Workflow persistence exists at the API/storage level but is not meaningfully usable from the main Swarm experience
- Once Prompt-to-Flow is broken, the user has no visible recovery path in the UI

Relevant files:
- [useWorkflow.js](C:\Users\arman\Downloads\Test workflows - Copia\client\src\hooks\useWorkflow.js)
- [SwarmView.jsx](C:\Users\arman\Downloads\Test workflows - Copia\client\src\views\SwarmView.jsx)

### BUG-SWARM-003
Severity: HIGH
Title: Pause/Resume appears to work in the UI but Resume does not actually resume the agent processes

Area:
- Execution controls
- Runtime integrity

Expected output:
- `Pause` should pause execution safely
- `Resume` should resume the same execution in a way that is reflected both in UI and in the underlying PTY-backed processes

Actual output:
- `Pause` sends `Ctrl+C` to active PTYs
- `Resume` only flips in-memory/UI state back to `running`
- No real reinjection or process-level resume sequence happens
- The UI can say `running` while the actual work remains interrupted

User impact:
- The user is misled into thinking the workflow resumed
- Long-running Swarm sessions become unreliable and potentially unrecoverable

Relevant files:
- [swarm.js](C:\Users\arman\Downloads\Test workflows - Copia\server\routes\swarm.js)
- [SwarmEngine.js](C:\Users\arman\Downloads\Test workflows - Copia\server\services\SwarmEngine.js)

### BUG-SWARM-004
Severity: HIGH
Title: Execution status is not kept consistent across backend state, WebSocket state, and client state

Area:
- Status synchronization
- Multi-tab/reload behavior

Expected output:
- `running`, `paused`, and `stopped` should be reflected consistently in:
  - backend execution state
  - WebSocket status events
  - client store
  - subsequent `/status` reads

Actual output:
- Execution status is initialized as `running`
- Pause/Resume transitions do not fully update canonical execution state
- Stop removes the execution without a clean final status broadcast path for client resync
- A second tab or a refreshed page can observe incomplete or misleading state

User impact:
- Status indicators are not trustworthy
- Recovery after refresh or reconnect is fragile

Relevant files:
- [SwarmEngine.js](C:\Users\arman\Downloads\Test workflows - Copia\server\services\SwarmEngine.js)
- [swarmHandler.js](C:\Users\arman\Downloads\Test workflows - Copia\server\ws\swarmHandler.js)
- [useSwarm.js](C:\Users\arman\Downloads\Test workflows - Copia\client\src\hooks\useSwarm.js)

### BUG-SWARM-005
Severity: HIGH
Title: HITL approve/reject flow is desynchronized and can leave the execution in a broken state

Area:
- HITL
- Human approval flow

Expected output:
- `Approve` should unfreeze the waiting agent using the runtime’s proper resume/injection sequence
- `Reject` should inject a rejection outcome and leave the workflow in a coherent state
- UI, backend state, and PTY state should all agree after either action

Actual output:
- `Approve` bypasses the proper `unfreezeAgent()` path
- It writes only `resumeText + newline`, forces state in memory, and does not fully broadcast or restore the correct agent runtime state
- `Reject` removes the inbox item but can leave the paused agent effectively frozen with no meaningful rejection injected back into the PTY

User impact:
- HITL, one of the central Swarm features, is not dependable under real usage
- A user can click approve/reject and still end up with a stuck execution

Relevant files:
- [inbox.js](C:\Users\arman\Downloads\Test workflows - Copia\server\routes\inbox.js)
- [SwarmEngine.js](C:\Users\arman\Downloads\Test workflows - Copia\server\services\SwarmEngine.js)
- [HitlInbox.jsx](C:\Users\arman\Downloads\Test workflows - Copia\client\src\panels\HitlInbox.jsx)

### BUG-SWARM-006
Severity: MEDIUM
Title: WebSocket reconnect snapshot is only partially applied, so refresh and multi-tab recovery are incomplete

Area:
- Reconnect
- Hydration
- Runtime visibility

Expected output:
- When a user refreshes or opens a second tab, the initial execution snapshot should restore:
  - agent states
  - edge counters
  - budget
  - execution status

Actual output:
- The server sends a larger `execution_status` payload on connect
- The client uses that event mainly to set `executionId/status`
- Agent states, edge counters, and budget are not properly rehydrated from the connect snapshot

User impact:
- A user can re-enter an active execution and see an incomplete or stale representation of the workflow

Relevant files:
- [swarmHandler.js](C:\Users\arman\Downloads\Test workflows - Copia\server\ws\swarmHandler.js)
- [useSwarm.js](C:\Users\arman\Downloads\Test workflows - Copia\client\src\hooks\useSwarm.js)

### BUG-SWARM-007
Severity: MEDIUM
Title: Broadcast scope contract is incomplete for department and specific-agent targeting

Area:
- Broadcast
- Scoped messaging

Expected output:
- Broadcast should support the PRD contract for:
  - all agents
  - a department
  - a specific agent

Actual output:
- The implementation effectively handles `all`
- Targeted routing does not honor the declared API contract correctly
- Department targeting is not truly implemented
- Agent targeting is coupled to node ID matching rather than the documented scope contract

User impact:
- Users cannot rely on scoped broadcast behavior for real orchestration
- Broadcast semantics are weaker than the Swarm UI concept suggests

Relevant files:
- [swarm.js](C:\Users\arman\Downloads\Test workflows - Copia\server\routes\swarm.js)
- [docs/PRD.md](C:\Users\arman\Downloads\Test workflows - Copia\docs\PRD.md)

### BUG-SWARM-008
Severity: MEDIUM
Title: Open Terminal from Agent Inspector is likely unreachable in normal WebSocket-driven usage

Area:
- AgentInspector
- PTY Explosion

Expected output:
- When a running agent has a live PTY session, the inspector should expose `Open Terminal`
- The button should reliably appear for the selected running node

Actual output:
- The Inspector only shows `Open Terminal` when `agentState.sessionId` exists
- The WebSocket `agent_status` path does not reliably deliver `sessionId` as part of the normal runtime contract
- This creates a real risk that the user never sees the button even when the agent is running

User impact:
- One of the most important advanced controls in Swarm may never appear for the user in normal flow

Relevant files:
- [AgentInspector.jsx](C:\Users\arman\Downloads\Test workflows - Copia\client\src\canvas\AgentInspector.jsx)
- [useSwarm.js](C:\Users\arman\Downloads\Test workflows - Copia\client\src\hooks\useSwarm.js)
- [docs/PRD.md](C:\Users\arman\Downloads\Test workflows - Copia\docs\PRD.md)

### BUG-SWARM-009
Severity: MEDIUM
Title: Agent micro-output and inspector output expectations are not backed by the runtime event payloads

Area:
- Agent visibility
- Runtime observability

Expected output:
- Agent nodes should show recent PTY output snippets
- The Inspector should show meaningful last output for the selected agent

Actual output:
- The documented actual WS event payload for `agent_status` does not include `lastOutputSnippet`
- The client store update path does not populate that snippet through the normal status event flow
- As a result, the UI contract for live micro-output is weaker than the PRD and component descriptions imply

User impact:
- The user loses important runtime visibility into what each agent is doing
- The Swarm canvas becomes less understandable during execution

Relevant files:
- [AgentNode.jsx](C:\Users\arman\Downloads\Test workflows - Copia\client\src\canvas\nodes\AgentNode.jsx)
- [AgentInspector.jsx](C:\Users\arman\Downloads\Test workflows - Copia\client\src\canvas\AgentInspector.jsx)
- [useSwarm.js](C:\Users\arman\Downloads\Test workflows - Copia\client\src\hooks\useSwarm.js)
- [docs/PRD.md](C:\Users\arman\Downloads\Test workflows - Copia\docs\PRD.md)

## Behaviors That Passed In Browser

These are not bugs; they worked in the tested idle path:
- Swarm view opens successfully from the sidebar
- Idle view shows the correct empty-state inspector text
- HITL drawer opens and closes
- Empty HITL state renders visibly
- Broadcast controls are hidden while execution is idle
- After selecting a project first, the `Run` button reason changes from `Select a project first` to `Generate a workflow below first`, which confirms the active-project gate is wired

## Important Blocked Coverage

The following user-path areas could not be fully tested end-to-end in pure browser mode because `Prompt-to-Flow` failed before a workflow could be created in-session:
- full node interaction after normal generation
- run lifecycle from a user-created workflow
- live handoff animation in a real generated workflow
- budget warning banner behavior
- real broadcast delivery to running agents
- PTY Explosion opened from a successfully running agent selected through normal user flow

Those areas were therefore evaluated by reading the PRD and implementation, and the findings above reflect that distinction.

## Conclusion

The Swarm section has a working shell and some correct idle-state UI behaviors, but the current user journey is not production-safe.

The most serious problem is that the primary onboarding path is broken:
- the user can open Swarm
- but cannot successfully generate a workflow
- and cannot visibly recover by loading an existing saved workflow from the Swarm UI

Even beyond that blocker, the execution layer still has high-risk inconsistencies in:
- pause/resume
- HITL approve/reject
- reconnect state hydration
- broadcast scope routing

From a user perspective, Swarm is currently a partially functional interface around an unreliable execution lifecycle.
