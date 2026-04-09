# Swarm Visual Regression

This suite captures and compares canonical Swarm canvas screenshots against committed baselines.

It runs against an isolated local server instance on port `3310` using fixture workflows stored in this repo, so it does not depend on the user's saved workflows.

## Commands

```powershell
npm run test:visual:swarm
npm run test:visual:swarm:update
npm run test:visual:swarm:prepare
npm run test:visual:swarm:reuse
npm run debug:swarm:codex-handoff
npm run debug:swarm:codex-handoff:prepare
npm run debug:swarm:codex-handoff:reuse
```

## What It Covers

- Parallel fan-out and merge
- Loop and feedback routing
- Flow-control nodes
- Dense mixed-node graph
- Focus mode on/off
- Node-selected context

## Outputs

- Baselines: `tests/visual/swarm/baselines/`
- Current run artifacts: `tests/visual/swarm/artifacts/`
- Isolated app data used by the harness: `tests/visual/swarm/.appdata/`

## Browser

The harness uses a locally installed Chrome or Edge executable through `playwright-core`.
If auto-detection fails, set `SWARM_VISREG_BROWSER` to the browser executable path.

The Codex handoff E2E script also accepts `SWARM_CODEX_HANDOFF_E2E_BROWSER` and reuses the same Chrome/Edge detection order.

## Live Codex Handoff Debug Probe

`npm run debug:swarm:codex-handoff` runs a real browser flow against an isolated server on port `3314`.

It loads a dedicated `Researcher -> Writer` workflow fixture and records whether the downstream Codex node still reports a truncated handoff.
This probe is useful for manual reproduction and artifact capture, but it is intentionally not the authoritative automated regression because the upstream live model can paraphrase or compress payloads in ways that make the browser run nondeterministic.

The authoritative automated regression for long inbound Codex handoffs lives in `server/tests/swarm-engine-codex-sdk.test.js`, which verifies the real `_onHandoff -> Codex SDK spawn` path with a deterministic long payload containing `TAIL-MARKER-OMEGA-9271`.

## Sandbox Fallback

If the harness cannot spawn its own child server in your environment, use the fallback flow:

```powershell
npm run test:visual:swarm:prepare
$env:APPDATA='C:\Users\arman\Downloads\Test workflows - Copia\tests\visual\swarm\.appdata'
$env:PORT='3310'
$env:NO_OPEN='1'
npm run start
```

Then, in a second terminal:

```powershell
npm run test:visual:swarm:reuse
```
