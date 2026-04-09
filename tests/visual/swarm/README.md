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
This probe is useful for manual reproduction and artifact capture, but it is intentionally **not** a CI regression gate because the upstream live model can paraphrase or compress payloads in ways that make the browser run nondeterministic.  It also requires a live Codex/GPT API key.

**The authoritative automated regression** for long inbound Codex handoffs lives in
`server/tests/swarm-engine-codex-sdk.test.js`, which verifies the real `_onHandoff -> Codex SDK
spawn` path with a deterministic long payload containing `TAIL-MARKER-OMEGA-9271`.  That suite is
part of `npm test --prefix server` and is the CI regression gate.

### Harness modes

| Command | What it does |
|---------|--------------|
| `npm run debug:swarm:codex-handoff` | Spawns an isolated server on port 3314 with fresh fixture app-data, runs the browser probe, then kills the server. |
| `npm run debug:swarm:codex-handoff:prepare` | Writes the fixture app-data only — no server, no browser. Use when the harness cannot spawn a child process. |
| `npm run debug:swarm:codex-handoff:reuse` | Connects to a server already running on port 3314. Performs a preflight check to verify the fixture workflow is present and injects it if absent. |

### --reuse-server mode (preflight check)

When `--reuse-server` is passed, the harness calls `GET /api/v1/workflows/:id` before opening the
browser.  If the fixture workflow is absent it attempts to inject it via `POST /api/v1/workflows`.
If injection fails it exits with a clear message instead of failing late with "could not be
selected in the Swarm UI".

### Isolated mode (default)

The harness always resets app-data and spawns a fresh `node server/index.js` process.  It does
NOT run `npm run start` (which would rebuild the Vite client on every invocation — a 60-120 s
overhead that is unnecessary because `server/public` is already compiled).

## Sandbox Fallback

If the harness cannot spawn its own child server in your environment, use the fallback flow:

```powershell
npm run debug:swarm:codex-handoff:prepare
$env:APPDATA='C:\Users\arman\Downloads\Test workflows - Copia\tests\visual\swarm\.codex-handoff-e2e-appdata'
$env:PORT='3314'
$env:NO_OPEN='1'
node server/index.js
```

Then, in a second terminal:

```powershell
npm run debug:swarm:codex-handoff:reuse
```

For the visual regression suite fallback:

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
