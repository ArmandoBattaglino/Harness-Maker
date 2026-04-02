# Swarm Simulated Walkthrough Report

Date: 2026-04-02
Purpose: exercise the Swarm UI with synthetic data and synthetic runtime events, without depending on the real Claude Code execution path

## What this run was

This run used a visible browser walkthrough driven by:
- the real app UI
- the real Swarm frontend components
- synthetic `swarm` API responses
- synthetic `swarm` WebSocket events
- synthetic terminal sessions for PTY Explosion

It did not change product code.
It used a test harness stored in:
- [swarm-sim-visible-runner.js](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-visible-runner.js)

## What was exercised successfully

The visible walkthrough covered these UI flows:
- open project and navigate to `Swarm`
- idle view rendering
- HITL drawer open and close
- synthetic Prompt-to-Flow generation
- canvas render with department, trigger, and agent nodes
- node selection and Agent Inspector rendering
- run state transition into active execution
- inter-agent feed visibility during active execution
- synthetic budget warning event delivery
- synthetic HITL request delivery
- `Open Terminal` button visibility from inspector
- PTY Explosion overlay opening and closing
- HITL approve flow in the UI
- BroadcastBar visibility and send action
- pause UI state
- resume UI state
- stop UI state
- reset back to idle

Screenshots captured:
- [swarm-sim-01-idle.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-01-idle.png)
- [swarm-sim-02-hitl-empty.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-02-hitl-empty.png)
- [swarm-sim-03-generated.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-03-generated.png)
- [swarm-sim-04-inspector.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-04-inspector.png)
- [swarm-sim-05-running.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-05-running.png)
- [swarm-sim-06-reviewer-hitl.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-06-reviewer-hitl.png)
- [swarm-sim-07-pty-explosion.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-07-pty-explosion.png)
- [swarm-sim-08-hitl-approved.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-08-hitl-approved.png)
- [swarm-sim-09-broadcast.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-09-broadcast.png)
- [swarm-sim-10-paused.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-10-paused.png)
- [swarm-sim-11-resumed.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-11-resumed.png)
- [swarm-sim-12-stopped.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-12-stopped.png)
- [swarm-sim-13-reset.png](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-sim-13-reset.png)

## What this proves

This proves that a substantial part of the Swarm frontend shell is usable when the UI receives the shape of data and events it expects.

More specifically, it confirms that these user-facing surfaces can behave coherently:
- toolbar state transitions
- drawer toggles
- inspector rendering
- canvas rendering for mixed node types
- feed rendering
- PTY overlay mounting
- broadcast input UX
- reset back to idle

## What this does not prove

This simulated run does not prove that the real backend/runtime works.

It does not validate:
- real `claude` scaffold execution
- real PTY-backed agent startup
- real handoff parsing from live CLI output
- real pause/resume semantics
- real HITL runtime freeze/unfreeze behavior
- real scoped broadcast delivery
- real reconnect/state hydration against the real server state

Those areas remain governed by the findings in:
- [swarm-user-browser-debug-report-2026-04-02.md](C:\Users\arman\Downloads\Test workflows - Copia\Debugging\swarm-user-browser-debug-report-2026-04-02.md)

## Most useful conclusion

The simulation separates frontend-shell quality from backend-runtime quality.

That separation tells us:
- several visible Swarm UI pieces are present and can work together
- the bigger blockers now are in the real runtime path and integration contracts, not only in static UI rendering

This is useful because it narrows the next debugging wave:
- keep using simulation to test and demonstrate UI flows quickly
- fix the real runtime path separately, starting from scaffold and execution-state integrity
