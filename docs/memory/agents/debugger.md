---
## 2026-03-18 — Task: Full Codebase Review (Code Audit)
**Status:** COMPLETED
**Called by:** User (manual request — full codebase code review)

### Context when I started
The project was declared v1 RELEASE READY after all 18 tasks completed including QA (110 tests pass) and Security Audit (all 10 SEC requirements pass, 3 MEDIUM findings resolved). The user requested a comprehensive independent code audit spanning the entire server and client codebase.

### What I did
1. Read all 7 memory files in parallel (PROJECT.md, DECISIONS.md, PROGRESS.md, CONTEXT.md, DECISIONS.md, ACTIVITY_LOG.md) — no prior debugger.md existed.
2. Read all server-side files: index.js, all services (SessionManager, JobRunner, RingBuffer, ConfigStore, ProcessRegistry, BinaryDiscovery, FileManager), all middleware (csrf, security, pathValidation), all routes (projects, sessions, agents, skills, claudemd, jobs), ws/terminalHandler.js, utils/frontmatter.js.
3. Read all client-side files: App.jsx, store/AppContext.jsx, hooks (useSession, useJob, useApi), components (Terminal, Sidebar, AddProjectModal, AgentEditor, SkillEditor, ClaudeMdEditor, JobPanel), views (TerminalView, JobView, EntitiesView, ProjectsView).
4. Read both package.json files (server and client).
5. Traced execution paths for all major flows: project creation, session creation, terminal connect, job run, entity CRUD.
6. Identified and documented 19 bugs/anomalies, severity-ranked.
7. Applied fixes for the 7 highest-severity issues.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| client/src/components/AddProjectModal.jsx | MODIFIED | BUG-03: Was POSTing to nonexistent /api/v1/projects/scaffold endpoint. Fixed to POST /api/v1/projects with scaffold in body. Also fixed response destructure (data.project not data). |
| client/src/components/Sidebar.jsx | MODIFIED | BUG-04: Project list response not destructured (was passing { projects: [...] } instead of the array). BUG-05: Session creation response not destructured (was passing { session: {...} } instead of the session object). |
| client/src/views/ProjectsView.jsx | MODIFIED | BUG-04 (also present here): Same projects list response not destructured. Fixed to data.projects ?? []. |
| client/src/hooks/useSession.js | MODIFIED | BUG-16: WS_BASE was hardcoded to ws://127.0.0.1:3000 ignoring PORT env var. Fixed to use window.location.port. |
| server/services/SessionManager.js | MODIFIED | BUG-02: Double ProcessRegistry.unregister (once in onExit, once in killSession). Added _unregistered flag guard. BUG-11: ws.bufferedAmount is browser-only API, always undefined server-side. Fixed to check ws._socket.bufferSize instead. |
| server/utils/frontmatter.js | MODIFIED | BUG-14: yaml.load() can return non-object scalars; || {} doesn't protect because non-empty strings are truthy. Added proper typeof+Array.isArray guard. |

### Improvements delivered
- Project creation via AddProjectModal now works correctly (was 404 every time with scaffold=true)
- Project list now renders correctly in both Sidebar and ProjectsView (was TypeError: state.projects.map is not a function)
- Session creation now correctly wires the session object to the terminal (was undefined sessionId)
- WebSocket connection works when PORT is not 3000
- ProcessRegistry no longer writes to disk twice per session kill
- Backpressure guard in SessionManager actually functions now (was silently always false)
- YAML frontmatter parser now correctly rejects non-object YAML values

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-02: Double unregister | killSession() and onExit both call ProcessRegistry.unregister(pid) | Added _unregistered flag on session object | FIXED |
| BUG-03: AddProjectModal wrong endpoint | scaffold=true sent to /api/v1/projects/scaffold (nonexistent) instead of /api/v1/projects | Fixed endpoint + response destructure | FIXED |
| BUG-04: Projects list not destructured | GET /api/v1/projects returns {projects:[]} but code passed whole object to SET_PROJECTS | Fixed in Sidebar.jsx and ProjectsView.jsx | FIXED |
| BUG-05: Session not destructured | POST /api/v1/sessions returns {session:{...}} but code stored whole wrapper | Fixed data.session destructure in Sidebar.jsx | FIXED |
| BUG-06: JobRunner memory leak | Completed jobs never removed from #jobs Map | DOCUMENTED (not fixed — requires TTL/limit design decision) | DEFERRED |
| BUG-07: Rate limiter map never cleaned | _rateLimitMap entries never deleted | DOCUMENTED | DEFERRED (LOW on localhost) |
| BUG-11: ws.bufferedAmount server-side | Browser WebSocket API property, always undefined on ws npm package | Fixed to ws._socket.bufferSize | FIXED |
| BUG-12: skills.js delete path traversal fragility | resolveAllowedBase result discarded with void | DOCUMENTED as architectural risk | DEFERRED |
| BUG-14: yaml.load non-object return | yaml.load can return strings/numbers; || {} doesn't protect | Added type guard | FIXED |
| BUG-16: WS_BASE hardcoded port 3000 | const WS_BASE = 'ws://127.0.0.1:3000' ignores PORT env | Fixed to window.location.port | FIXED |

### Decisions I made
- BUG-03 fix: Changed response consumption from `const project = await apiPost(...)` to `const data = await apiPost(...); data.project` — aligned with how every other route responds.
- BUG-11 backpressure fix: Used `ws._socket.bufferSize` which is the internal socket buffer on the Node.js net.Socket. This is an internal property but it is stable across ws@8.x and Node.js 20.
- BUG-02 flag: Used `session._unregistered = true` (property on the plain session object) rather than a WeakSet or separate Map — minimal change, zero allocations.

### What I learned
- The GET /api/v1/projects response wraps in { projects: [] } but both Sidebar and ProjectsView were consuming the raw response body without destructuring. This was a pervasive API contract mismatch that would have broken the entire projects UI.
- The AddProjectModal scaffold bug means the primary happy-path for new users (create project with scaffold) was completely broken — a 404 on every attempt.
- ws npm package server-side does NOT expose bufferedAmount. The backpressure guard was silently disabled since the very beginning.
- yaml.load() requires explicit type checking — the || {} pattern is a well-known pitfall.
- window.location.port is the correct way to make WS_BASE port-agnostic in Vite-built SPAs.

### State I'm leaving behind
All 7 critical/high/medium bugs have been fixed. The following bugs are documented but deferred:
- BUG-06 (JobRunner memory leak) — requires a TTL or max-size policy decision
- BUG-07 (rate limiter map growth) — very low impact on localhost
- BUG-08 (double cleanupStale at shutdown) — harmless extra disk write
- BUG-09 (frontmatter regex edge case) — very rare input pattern
- BUG-12 (skills.js delete path traversal fragility) — not exploitable now but fragile
- BUG-13 (openBrowser cmd.exe URL) — URL is server-controlled
- BUG-15 (idle sweeper Map mutation during iteration) — JavaScript Map iteration is safe for delete
- BUG-17 (RingBuffer edge case) — needs stress testing, no confirmed bug
- BUG-18 (useEffect missing deps) — React lint issue, no runtime impact
- BUG-19 (ProjectsView destructure) — FIXED (was same as BUG-04)

### Handoff
- qa-tester should re-run the test suite to verify the 7 fixes did not regress anything
- The JobRunner memory leak (BUG-06) should be addressed in v1.1: add a max-job-count or TTL cleanup
- Rate limiter map cleanup (BUG-07) should be addressed in v1.1
---
---
## 2026-03-28 — Task #80 BUGFIX: Swarm Route Init Order
**Status:** COMPLETED
**Called by:** User (bug escalated from qa-tester E2E test)

### Context when I started
QA tester identified that all /api/v1/swarm/* endpoints returned 500 TypeError. Root cause identified in the bug report: swarmRoutes() and inboxRoutes() were called at lines 231-234 of server/index.js before swarmEngine was instantiated at line 271. The factories received undefined as their swarmEngine argument.

### What I did
1. Read docs/memory/agents/debugger.md and server/index.js in parallel.
2. Confirmed exact bug: lines 231-234 called `swarmRoutes(app.locals.swarmEngine, ...)` and `inboxRoutes(app.locals.swarmEngine)` — both `undefined` because `new SwarmEngine(...)` was at line 271 (inside section 10, after the HTTP server was created, after the SPA wildcard fallback `app.get('*', ...)`, and after the error handler).
3. Identified a secondary problem: even if we just moved the mounts past line 271, they would be registered AFTER the `app.get('*', ...)` wildcard GET handler (line 238) and the error handler (line 253), meaning GET requests to /api/v1/swarm/* would be intercepted by the SPA fallback first.
4. Designed fix: move SwarmEngine instantiation UP to section 7 (before static serving), so route mounts happen before the SPA wildcard and error handler.
5. Removed the deferred `app.locals.triggersRouter` indirection (was storing the router for later mounting) — replaced with direct `triggersRouter(triggerManager)` call at the same location.
6. Ran `npm test` — 187/187 tests pass.
7. Committed: git commit 843680a.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/index.js | MODIFIED | Moved SwarmEngine instantiation + swarmRoutes/inboxRoutes/triggersRouter mount from section 10 (after HTTP server create) to section 7 (after workflow routes, before static serving). Removed app.locals.triggersRouter indirection. |

### Improvements delivered
- All /api/v1/swarm/* endpoints now receive a live SwarmEngine instance
- All /api/v1/swarm/**/inbox/* endpoints now receive a live SwarmEngine instance
- /api/v1/triggers now receives a live TriggerManager instance (was already working via the same deferred mount pattern, no change in behavior)

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| swarmRoutes/inboxRoutes receive undefined | Factory called before SwarmEngine instantiated — and route registered after SPA wildcard | Moved SwarmEngine init to section 7, before static serving and SPA fallback | FIXED |

### Decisions I made
- Chose to hoist SwarmEngine init rather than use a lazy-init pattern — simpler, no closures, consistent with how sessionManager and workflowStore are handled.
- Removed app.locals.triggersRouter deferred storage — was only needed because of the flawed late-mount pattern; no longer required.

### What I learned
- Express registers middleware/routes in call order. Any route registered after `app.get('*', ...)` will NEVER be reached for GET requests. The original code had the swarm routes destined for this dead zone (section 10, after the wildcard at section 8) in addition to the undefined-reference bug.
- Always check that API routes are mounted before the SPA wildcard fallback and before the global error handler.

### State I'm leaving behind
server/index.js is fully fixed. All 187 tests pass. The startup sequence now correctly instantiates SwarmEngine before mounting its routes, and all swarm/inbox/trigger routes are registered before static serving and the SPA fallback.

### Handoff
Task #81 (build verify + tag) and #82 (docs) can proceed — no further action required on this bug.
---
---
## 2026-04-02 — Task #124: BUG-SESSION-1 — Add sessionId to agent_status WS event
**Status:** COMPLETED
**Called by:** User (direct task assignment — V3.1 Swarm Bug Fix Wave)

### Context when I started
The "Open Terminal" button in AgentInspector was never visible during live Swarm execution. The button's render condition is `agentState?.sessionId` (AgentInspector.jsx line 43). The Zustand agentState.sessionId was always undefined because: (1) SwarmEngine never included sessionId in any agent_status broadcast, and (2) the useSwarm.js onmessage handler for agent_status only spread `{ status }` into agentState, discarding any sessionId that might have arrived.

### What I did
1. Read all 5 files in parallel: debugger.md, DECISIONS.md, SwarmEngine.js, useSwarm.js, AgentInspector.jsx.
2. Traced all 8 `_wsBroadcast` call sites for `agent_status` in SwarmEngine.js — confirmed none included sessionId.
3. Confirmed sessionId is available in scope at every call site: as the local `sessionId` variable in `_spawnAgentPty`, and as `state.sessionId` for all other methods.
4. Applied fixes to all 8 broadcast sites in SwarmEngine.js.
5. Applied client-side fix in useSwarm.js `case 'agent_status'` to forward sessionId from msg to updateAgentState.
6. Ran `npm test` — 187/187 pass, 0 regressions.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/services/SwarmEngine.js | MODIFIED | Added `sessionId` field to all 8 `_wsBroadcast` calls for `agent_status`. Call sites: _spawnAgentPty (line 198), pauseExecution (line 465), resumeExecution (line 484), _onHandoff step 9 (line 376), _onHandoff step 10 (line 383), _onDone (line 403), freezeAgent (line 516), unfreezeAgent (line 536). |
| client/src/hooks/useSwarm.js | MODIFIED | Updated `case 'agent_status'` handler (line 34) to spread sessionId into the updateAgentState call: `{ status: msg.status, ...(msg.sessionId ? { sessionId: msg.sessionId } : {}) }` |

### Improvements delivered
- The WS `agent_status` event now always carries `sessionId` when one exists
- `agentStates[nodeId].sessionId` in the Zustand store is now populated after spawn
- "Open Terminal" button in AgentInspector now renders for running agents
- pause/resume/handoff/done/freeze/unfreeze transitions all correctly propagate sessionId
- 0 test regressions — 187/187 pass

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-SESSION-1: sessionId never in agent_status WS event | SwarmEngine._wsBroadcast calls for agent_status omitted sessionId at all 8 emission sites; useSwarm.js also discarded it | Added sessionId to all 8 broadcasts; updated useSwarm.js handler to include sessionId | FIXED |

### Decisions I made
- Used `...(msg.sessionId ? { sessionId: msg.sessionId } : {})` spread pattern in useSwarm.js — avoids setting sessionId to undefined in the Zustand store for old events or events from agents whose PTY was killed (safe because AgentInspector already guards with `?.sessionId` truthiness).
- For _onDone, used `state?.sessionId` with optional chaining — state is always set at that point but the guard is consistent with the rest of the codebase's defensive style.

### What I learned
- SwarmEngine has exactly 8 agent_status broadcast sites across 7 methods. When adding new fields to this WS event, all 8 must be updated — they are not centralized.
- The useSwarm.js handler pattern `updateAgentState(nodeId, { status })` is a "partial patch" model — it only overwrites the named keys. This means if the server omits sessionId, the client silently retains whatever sessionId was previously set (or undefined). Always trace server → wire → client for WS contract bugs.

### State I'm leaving behind
Both files fixed. 187/187 tests pass. The Open Terminal button now works. TASK #125 (TEST GATE for BUG-SESSION-1) can proceed.

### Handoff
qa-tester runs TASK #125 (TEST GATE: BUG-SESSION-1) to verify the fix end-to-end before the pipeline continues to TASK #126 (BUG-HANDOFF-1).
---
---
## 2026-04-02 — Task #126: BUG-HANDOFF-1 — Emit handoff_completed from SwarmEngine._onHandoff()
**Status:** COMPLETED
**Called by:** User (direct task assignment — V3.1 Swarm Bug Fix Wave)

### Context when I started
Task #125 (TEST GATE for BUG-SESSION-1) had just PASSED. Task #126 was the next unblocked task in the V3.1 fix wave. SwarmEngine._onHandoff() was implemented in Task #62.1 and emits handoff_started (step 6), agent_status for source (step 9), and agent_status for target (step 10). FR-V3-43 requires a handoff_completed event to be broadcast after the handoff is fully complete. That emission was never added. Separately, useSwarm.js had no 'handoff_completed' case in its onmessage switch, so even if the server emitted it, the client would silently drop it into the default: break branch.

### What I did
1. Read 4 files in parallel: SwarmEngine.js, useSwarm.js, SwarmContext.jsx, debugger.md.
2. Confirmed the gap: _onHandoff() ends after step 10 without any handoff_completed broadcast. useSwarm.js switch has no case for handoff_completed. addFeedEvent is already destructured and used in the handoff_started case — available for reuse.
3. Applied server-side fix: added step 11 in _onHandoff() after step 10's closing brace, before the method's closing brace. The broadcast is wrapped in `if (this._wsBroadcast)` consistent with all other broadcast sites.
4. Applied client-side fix: added `case 'handoff_completed':` immediately after the closing brace of `case 'handoff_started'`. Handler calls `addFeedEvent({ ...msg, timestamp: Date.now() })` then `break`.
5. Ran `npm test` — 187/187 pass, 0 regressions.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/services/SwarmEngine.js | MODIFIED | Added step 11 in _onHandoff() (lines 388–395): `if (this._wsBroadcast) { this._wsBroadcast(executionId, { type: 'handoff_completed', sourceNodeId, targetNodeId: targetId }); }` — placed after step 10 (target agent_status), before the method's closing brace. |
| client/src/hooks/useSwarm.js | MODIFIED | Added `case 'handoff_completed': addFeedEvent({ ...msg, timestamp: Date.now() }); break;` at lines 44–46, immediately after the closing brace of `case 'handoff_started'` block. |

### Improvements delivered
- handoff_completed WS event is now broadcast with `{ type, sourceNodeId, targetNodeId }` after every successful handoff
- The client now processes handoff_completed and appends it to the interAgentFeed via addFeedEvent
- InterAgentFeed component (which renders interAgentFeed from Zustand) will now display the completion event
- handoff_started continues to be emitted at step 6 — no regression
- 187/187 tests pass

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-HANDOFF-1: handoff_completed never emitted | _onHandoff() was implemented before FR-V3-43 was finalized; the terminal broadcast was simply never added | Added step 11 with the broadcast in SwarmEngine._onHandoff(); added client handler in useSwarm.js | FIXED |

### Decisions I made
- Did NOT add edgeId or counter to handoff_completed — FR-V3-43 specifies only `{ type, sourceNodeId, targetNodeId }`. Adding extra fields would be out of scope.
- Placed the new broadcast unconditionally (not gated on targetState or sourceState) — by step 11 the handoff is always complete regardless of whether targetState is null.

### What I learned
- The WS event sequence for a full handoff is now: handoff_started (step 6) → agent_status source done (step 9) → agent_status target running (step 10) → handoff_completed (step 11). Any consumer relying on ordering can depend on this sequence.
- addFeedEvent is already available in useSwarm.js from the existing destructuring at line 13 — no import changes needed for new WS cases that call it.

### State I'm leaving behind
Both files fixed. 187/187 tests pass. TASK #127 (TEST GATE for BUG-HANDOFF-1) is the next action — qa-tester must run it.

### Handoff
qa-tester runs TASK #127 (TEST GATE: BUG-HANDOFF-1) to verify handoff_completed WS event end-to-end. On PASS, debugger proceeds to TASK #128 (BUG-TRIGGER-1).
---
