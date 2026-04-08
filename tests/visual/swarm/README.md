# Swarm Visual Regression

This suite captures and compares canonical Swarm canvas screenshots against committed baselines.

It runs against an isolated local server instance on port `3310` using fixture workflows stored in this repo, so it does not depend on the user's saved workflows.

## Commands

```powershell
npm run test:visual:swarm
npm run test:visual:swarm:update
npm run test:visual:swarm:prepare
npm run test:visual:swarm:reuse
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
