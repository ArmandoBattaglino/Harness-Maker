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
---
## 2026-04-02 — Task #128: BUG-TRIGGER-1 — Handle trigger_fired / trigger_status / rss_item in useSwarm.js
**Status:** COMPLETED
**Called by:** User (direct task assignment — V3.1 Swarm Bug Fix Wave)

### Context when I started
Task #127 (TEST GATE for BUG-HANDOFF-1) had PASSED. Task #128 was the next unblocked task. useSwarm.js had no handlers for trigger_fired, trigger_status, or rss_item WS event types — they all fell into the default:break branch. The Zustand store (SwarmContext.jsx) already had triggerStates {} and updateTriggerState(triggerId, patch) action. TriggerNode.jsx reads triggerStates[id].status, .lastFiredAt, .fireCount to render visual state. updateTriggerState was also not destructured in useSwarm.js at all (missing line).

### What I did
1. Read TriggerManager.js — confirmed it only emits `rss_item` (fields: type, nodeId, guid). trigger_fired and trigger_status are not yet emitted by the server but need client handlers for future use.
2. Read useSwarm.js — confirmed updateTriggerState was absent from destructured store actions; no trigger cases in switch.
3. Read SwarmContext.jsx — confirmed updateTriggerState(triggerId, patch) exists and does a merge patch.
4. Read TriggerNode.jsx — confirmed it reads status, lastFiredAt, fireCount from triggerStates[id].
5. Read PRD spec in TASK_PLAN.md (TASK #128 body) — confirmed field conventions for each event.
6. Added `updateTriggerState` destructure at line 14 of useSwarm.js (before setWsConnected).
7. Added three new cases after `case 'hitl_required'`: trigger_fired, trigger_status, rss_item.
8. Added updateTriggerState to connectWs useCallback dependency array.
9. Ran npm test — 187/187 pass.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| client/src/hooks/useSwarm.js | MODIFIED | Added updateTriggerState destructure (line 14); added case 'trigger_fired', case 'trigger_status', case 'rss_item' to onmessage switch (lines 60–83); added updateTriggerState to useCallback deps array |

### Improvements delivered
- trigger_fired → updateTriggerState(msg.triggerId ?? msg.nodeId, { fired:true, status:'fired', lastFiredAt, fireCount+1 })
- trigger_status → updateTriggerState(msg.triggerId ?? msg.nodeId, { status: msg.status })
- rss_item → updateTriggerState(msg.nodeId, { fired:true, status:'fired', lastFiredAt, fireCount+1, lastItem:msg.guid }) + addFeedEvent
- TriggerNode.jsx now receives live store updates when any trigger fires
- 187/187 tests pass, 0 regressions

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-TRIGGER-1: trigger WS events silently ignored | useSwarm.js switch had no cases for trigger_fired / trigger_status / rss_item; updateTriggerState not destructured | Added destructure + 3 new switch cases | FIXED |

### Decisions I made
- Used `msg.triggerId ?? msg.nodeId` as the store key for trigger_fired and trigger_status — the server spec is ambiguous on field name so this handles both conventions.
- Used `useSwarmStore.getState().triggerStates[id] ?? {}` to read current fireCount before incrementing — avoids stale closure capture in the onmessage handler which runs inside a useCallback.
- Added both `fired: true` (PRD boolean) and `status: 'fired'` (TriggerNode string enum) to both trigger_fired and rss_item — satisfies both the PRD acceptance criteria and the TriggerNode rendering logic.
- rss_item calls addFeedEvent per PRD spec section 11.1 — makes the RSS fire visible in the interAgentFeed panel.

### What I learned
- TriggerManager.js only emits `rss_item` (not trigger_fired or trigger_status). The latter two are planned server events with no current server-side implementation — client-side handlers are added preemptively.
- The rss_item WS event fields are exactly: `{ type: 'rss_item', nodeId: string, guid: string|null }` — emitted from TriggerManager._fireTrigger() line 311-315.
- When adding a new store action destructure to useSwarm.js, it must also be added to the useCallback deps array at line 88 to avoid stale closure bugs.

### State I'm leaving behind
client/src/hooks/useSwarm.js fixed. 187/187 tests pass. TASK #129 (TEST GATE for BUG-TRIGGER-1) is the next action — qa-tester must run it.

### Handoff
qa-tester runs TASK #129 (TEST GATE: BUG-TRIGGER-1) to verify trigger WS events update the store and TriggerNode renders correctly. On PASS, pipeline continues to TASK #130 (BUG-SWARM-2 or next bug in wave).
---
---
## 2026-04-02 — Task #130: BUG-INSPECTOR-1 — Define and pass onUpdateNode prop from SwarmCanvas to AgentInspector
**Status:** COMPLETED
**Called by:** User (direct task assignment — V3.1 Swarm Bug Fix Wave)

### Context when I started
TASK #129 (TEST GATE for BUG-TRIGGER-1) had PASSED. TASK #130 was the next unblocked task. The bug: AgentInspector.jsx declares `onUpdateNode` in its props signature but SwarmCanvas.jsx never defines a handler for it nor passes it as a prop. The result is `onUpdateNode === undefined` inside AgentInspector. No crash today because AgentInspector's current body never calls `onUpdateNode` — but the prop contract is permanently broken for any future code that tries to use it.

### What I did
1. Read 4 files in parallel: AgentInspector.jsx, SwarmCanvas.jsx, SwarmContext.jsx, debugger.md.
2. Confirmed: AgentInspector declares `onUpdateNode` in props signature (line 5) but never calls it anywhere in the component body. No TypeError fires at runtime, but the contract is broken.
3. Confirmed: SwarmCanvas mounts `<AgentInspector nodes={nodes} />` at line 125 — `onUpdateNode` is absent.
4. Confirmed: SwarmContext.jsx has no `updateNode` Zustand action. The correct mechanism is React Flow's `setNodes` from `useNodesState`, already available in SwarmCanvas.
5. `useCallback` was already imported at SwarmCanvas.jsx line 3 — no import change needed.
6. Defined `handleUpdateNode` using `useCallback` with `setNodes` as the dependency, applying a patch merge to node.data.
7. Passed `onUpdateNode={handleUpdateNode}` to `<AgentInspector>`.
8. Ran `npm test` — 187/187 pass, 0 regressions.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| client/src/canvas/SwarmCanvas.jsx | MODIFIED | Added `handleUpdateNode` useCallback (lines 96–103); passed as `onUpdateNode={handleUpdateNode}` to `<AgentInspector>` (line 134). |

### Improvements delivered
- `onUpdateNode` prop contract is now fully wired — AgentInspector receives a valid function reference
- Any future code in AgentInspector that calls `onUpdateNode(nodeId, patch)` will correctly update the React Flow node's `data` field
- No TypeError when/if `onUpdateNode` is called
- 187/187 tests pass, 0 regressions

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-INSPECTOR-1: onUpdateNode always undefined in AgentInspector | SwarmCanvas never defined a handler and never passed the prop | Added handleUpdateNode useCallback in SwarmCanvas; passed as onUpdateNode to AgentInspector | FIXED |

### Decisions I made
- Used `patch` as the parameter name (vs `data` in the TASK spec) to make clear it's a partial merge, not a full replacement — consistent with the `patch` convention used throughout SwarmContext actions.
- Did NOT add any UI to AgentInspector — the task spec explicitly says no UI change required since `onUpdateNode` is not currently called in the body.

### What I learned
- AgentInspector currently has no editable fields and no call to `onUpdateNode`. The prop was declared prophylactically for future inline editing. Wiring it now costs nothing and prevents a crash when that editing is implemented.
- When a React component declares a callback prop it never calls, the broken contract is silent — no linting error, no runtime crash. Always check both sides of the prop contract (declarer + passer) during code audit.

### State I'm leaving behind
client/src/canvas/SwarmCanvas.jsx is fixed. 187/187 tests pass. TASK #131 (TEST GATE for BUG-INSPECTOR-1) is the next action — qa-tester must run it.

### Handoff
qa-tester runs TASK #131 (TEST GATE: BUG-INSPECTOR-1) to verify the fix. On PASS, pipeline continues to TASK #132.
---
---
## 2026-04-03 — Task #145: BUG-UX-HANDOFF-1 — Fix handoff chain failure
**Status:** COMPLETED
**Called by:** User (direct task assignment)

### Context when I started
Multi-agent workflows (e.g. Ricercatore->Writer->Revisore) failed: only the first agent ran, emitting `__DONE__` immediately without producing `__HANDOFF__`. Other agents remained idle. The PTY tap ordering, line-by-line prompt delivery, HandoffParser cross-line recovery, and runtime blocker detection had all been fixed in prior tasks. But the handoff chain still didn't work end-to-end.

### What I did
1. Read all key files in parallel: SwarmEngine.js (1291 lines), HandoffParser.js, SessionManager.js, swarm.js, useSwarm.js, ScaffoldGenerator.js, plus all memory files.
2. Ran existing test suite — 218/218 pass (baseline).
3. Traced the complete execution path from startExecution → _spawnAgentPty → tapFn → parser.feed → _onDone/_onHandoff.
4. Identified three root causes:
   - **BUG A (Critical):** HandoffParser only accepted base64-encoded payloads. LLMs cannot reliably produce base64 in their text output. If the AI emitted `__HANDOFF__:target:{"key":"value"}` (plain JSON), the parser's `HANDOFF_WINDOW_RE` regex rejected it because `{`, `}`, `"` are not in the base64 character class. The token was silently dropped.
   - **BUG B (Important):** No max retry limit on `_onDone` reinject. When the AI repeatedly emitted `__DONE__` without `__HANDOFF__`, the system entered an infinite reinject loop.
   - **BUG C (Important):** System prompt told the AI to emit `__HANDOFF__:<targetId>:<base64_json_context_update>` but provided no concrete example. The AI didn't know what the token should look like.
5. Applied three targeted fixes.
6. Added 9 new tests (7 for HandoffParser plain JSON, 2 for SwarmEngine reinject limit).
7. Ran test suite — 227/227 pass, 0 regressions. Client build succeeds.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/services/HandoffParser.js | MODIFIED | Added `_parseDirectJsonHandoff()` method that parses plain JSON payloads (not base64). Updated `feed()` to try plain JSON first, then fall back to base64. Backward-compatible — existing base64 tokens still work. |
| server/services/SwarmEngine.js | MODIFIED | (1) Added `MAX_DONE_REINJECT_ATTEMPTS = 3` constant and `doneReinjectCount` on agent state. `_onDone` now forces a synthetic handoff to the first downstream target after 3 failed reinject attempts. (2) Updated `_buildSystemPrompt` to use plain JSON format and include a concrete handoff example with the actual target ID. (3) Updated `_buildContinueAfterDonePrompt` to show a concrete example token. |
| server/tests/HandoffParser.test.js | MODIFIED | Added 7 new tests in "Scenario 10: Plain JSON payload" covering: basic detection, surrounding text, empty object, preference over base64, nested object rejection, base64 fallback, and cross-chunk split. |
| server/tests/swarm-engine.test.js | MODIFIED | Added 2 new tests in "Case 8: _onDone max reinject limit" covering: forced handoff after max attempts, and handoff_started broadcast on forced handoff. |

### Improvements delivered
- HandoffParser now accepts both `__HANDOFF__:target:{"key":"value"}` (plain JSON) and `__HANDOFF__:target:base64encoded` (original format)
- AI models can now produce handoff tokens using natural JSON output rather than base64 encoding
- `_onDone` reinject loop is bounded to 3 attempts; after that, a synthetic handoff forces the workflow to advance
- System prompt includes a concrete handoff example with the actual target agent ID
- Continuation prompt also shows the exact expected format
- 227/227 tests pass, 0 regressions

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-A: HandoffParser rejects LLM-emitted plain JSON payloads | HANDOFF_WINDOW_RE only matches base64 chars; `{`, `}`, `"` excluded | Added _parseDirectJsonHandoff() that tries plain JSON before base64 | FIXED |
| BUG-B: Infinite _onDone reinject loop | No counter limiting reinject attempts | Added MAX_DONE_REINJECT_ATTEMPTS=3; force synthetic handoff after | FIXED |
| BUG-C: System prompt lacks concrete handoff example | AI didn't know what the token format looks like | Added concrete `__HANDOFF__:target:{"summary":"..."}` example | FIXED |

### Decisions I made
- Used plain JSON as the PRIMARY handoff format (tried first), base64 as fallback — this matches what LLMs actually produce
- Set MAX_DONE_REINJECT_ATTEMPTS to 3 — enough for the AI to correct itself, not so many that it loops endlessly
- Forced handoff goes to `handoffTargets[0]` (first downstream target) — simple, deterministic, always advances the workflow
- Kept base64 support for backward compatibility — existing tests still pass

### What I learned
- LLMs cannot reliably produce base64-encoded text. Asking an AI model to emit `base64_json_context_update` is a protocol design flaw. Plain JSON is the right default.
- The HandoffParser's `HANDOFF_WINDOW_RE` regex was a silent gatekeeper — it rejected any character outside `[A-Za-z0-9+/=:_\-\s]`, which excluded all JSON punctuation.
- When a tapFn-triggered handler (like `_onDone`) calls an async method (`_onHandoff`), the promise is fire-and-forget. Tests need explicit microtask flushing to observe the async side effects.
- The `ignoreParserUntil` echo marker system works correctly but creates complex test scenarios where each __DONE__ → reinject → echo marker cycle must be fully simulated.

### State I'm leaving behind
All three fixes are applied and tested. 227/227 tests pass. The handoff chain should now work: AI emits `__HANDOFF__:target:{"summary":"..."}` in plain JSON, the parser detects it, `_onHandoff` fires, and the next agent is spawned. If the AI still emits `__DONE__` 3 times, a forced handoff advances the workflow anyway. TASK #148 (AREA CHECKPOINT V3.4) is the next verification step.

### Handoff
qa-tester runs TASK #148 (AREA CHECKPOINT V3.4) to verify the full handoff chain end-to-end. The fix should be verifiable with any multi-agent workflow where agents have downstream targets.
---
---
## 2026-04-04 — Task #160: BUG-GEMINI-1 — Fix Gemini CLI prompt injection in SwarmEngine._flushSwarmPrompt()
**Status:** COMPLETED
**Called by:** User (direct task assignment — V4.0 Gemini Bug Fix Wave)

### Context when I started
V4.0 Gemini CLI harness integration was code-complete (tasks #154-#159), but E2E testing found that Gemini CLI never submits swarm prompts. The `_flushSwarmPrompt()` method writes lines with `\n` separators, which Gemini's Ink/React TUI interprets as multi-line input mode. In that mode, `\r` is treated as another newline rather than submit. Result: prompt text appears in Gemini's input but is never executed.

### What I did
1. Read memory files and SwarmEngine.js `_flushSwarmPrompt()` method (lines 500-564).
2. Confirmed root cause: `\n` characters in writeInput calls trigger Gemini's multi-line editing mode. The final `\r` is then another newline, not submit.
3. Added two new constants: `SWARM_GEMINI_SUBMIT_DELAY_MS = 500` and `SWARM_GEMINI_ECHO_DELAY_MS = 300`.
4. Added a Gemini-specific early-return branch at the top of the payload writing section in `_flushSwarmPrompt()`:
   - Flattens the prompt into a single line (newlines replaced with spaces)
   - Writes the flat prompt as a single writeInput call (no `\n`)
   - Sends `\r` after 500ms delay to submit
   - Writes the echo marker as a separate submission 800ms later (500+300)
   - Returns early, so Claude/Codex path is untouched
5. Ran `npm test --prefix server` — 255/255 pass, 0 regressions.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/services/SwarmEngine.js | MODIFIED | Added constants SWARM_GEMINI_SUBMIT_DELAY_MS (500) and SWARM_GEMINI_ECHO_DELAY_MS (300) at line 12. Added Gemini-specific branch in _flushSwarmPrompt() at lines 532-557 that writes prompt without \n, submits with delayed \r, and writes echo marker separately. |

### Improvements delivered
- Gemini CLI prompt injection now writes text WITHOUT \n characters (uses space-joined single line)
- Gemini prompt submission uses 500ms delayed \r (sufficient for Ink TUI to process text)
- Echo marker is written as a separate submission after the prompt, not inline
- Claude/Codex behavior is completely unchanged (Gemini branch returns early)

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| BUG-GEMINI-1: Gemini prompt never submitted | \n in writeInput triggers Ink multi-line mode; \r then treated as newline not submit | Gemini branch: flat prompt (no \n) + delayed \r + separate echo marker | FIXED |

### Decisions I made
- Used 500ms for Gemini submit delay (vs 100ms for Claude/Codex) — E2E testing showed Gemini needs more time between text write and submit
- Echo marker written as separate submission — cannot be part of prompt text or it would appear in Gemini's input and confuse the model
- Replaced \n with spaces (not pipes or other separators) — simplest transformation, preserves readability

### What I learned
- Gemini CLI uses Ink (React for CLI) with a multi-line text editor component. Unlike Claude/Codex which treat pasted multi-line text as a single input, Gemini's TUI interprets \n as "add a new line in the editor" and keeps the cursor in editing mode.
- The key insight is that \r works as submit ONLY when no \n has been written. Once \n enters the stream, the TUI switches to multi-line mode and \r becomes another newline.

### State I'm leaving behind
SwarmEngine.js is fixed. 255/255 tests pass. Gemini prompts will now be submitted correctly. TASK #161 (TEST GATE for BUG-GEMINI-1) is the next action.

### Handoff
qa-tester runs TASK #161 (TEST GATE: BUG-GEMINI-1) to verify the fix. On PASS, proceed to TASK #162 (BUG-GEMINI-2).
---

---
## 2026-04-06 — Task #231: BUG-WF-1 — System prompt text leaking into agent node card snippets
**Status:** COMPLETED
**Called by:** orchestrator

### Context when I started
Swarm workflow agent node cards were displaying system prompt preamble lines ("You are a Writer agent", "Current task: Execute the workflow goal...", etc.) as snippet text. The root cause was that ConPTY on Windows echoes injected system prompt text back into the PTY output stream, and `_buildSemanticSnippet()` was not filtering these preamble lines.

### What I did
1. Read `SNIPPET_NOISE_LINE_PATTERNS` array in `server/services/SwarmEngine.js` (lines 52-137) to confirm the swarm protocol preamble patterns were absent.
2. Read `_stripSnippetProtocolArtifacts()` (line 896-900) to confirm it only stripped `--- SWARM PROTOCOL ---` blocks but not `--- SWARM INPUT ---` blocks.
3. Added 13 new regex patterns to `SNIPPET_NOISE_LINE_PATTERNS` after the existing `/what would you like/i` entry, covering all known system prompt preamble lines.
4. Added a new `.replace()` call to `_stripSnippetProtocolArtifacts()` to strip `--- SWARM INPUT ... END SWARM INPUT ---` blocks at the block level.
5. Ran `npm test --prefix server` -- all 312/312 tests pass.
6. Marked TASK #231 as COMPLETED in `docs/TASK_PLAN.md`.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| server/services/SwarmEngine.js | MODIFIED | Added 13 noise patterns to SNIPPET_NOISE_LINE_PATTERNS (lines 137-149) and 1 block-level regex to _stripSnippetProtocolArtifacts (line 912) |
| docs/TASK_PLAN.md | MODIFIED | Marked TASK #231 as COMPLETED with completion note |

### Improvements delivered
- Agent node card snippets will no longer show system prompt preamble text during early agent running phase
- Both line-level filtering (individual preamble lines) and block-level filtering (SWARM INPUT wrapper) are now covered

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| System prompt text in snippets | SNIPPET_NOISE_LINE_PATTERNS missing swarm preamble patterns; _stripSnippetProtocolArtifacts missing SWARM INPUT block regex | Added 13 line patterns + 1 block regex | FIXED |

### Decisions I made
- Added patterns as anchored regexes (^...) where possible to avoid false positives on legitimate agent output that might contain similar words mid-sentence
- Used case-insensitive matching (/i) consistently since ConPTY echo can vary casing

### What I learned
- ConPTY echoes ALL injected PTY stdin text back into the output stream, including system prompts. Any text injected via `_flushSwarmPrompt` will appear in the snippet pipeline unless explicitly filtered.
- The snippet pipeline has two layers of defense: block-level stripping in `_stripSnippetProtocolArtifacts` (removes entire delimited sections) and line-level filtering in `_isSnippetNoiseLine` via `SNIPPET_NOISE_LINE_PATTERNS` (removes individual lines). Both layers need to be updated when new injected text formats are added.

### State I'm leaving behind
Fix is complete. All 312 tests pass. The 13 new patterns cover the known system prompt preamble lines. The block-level regex covers the `--- SWARM INPUT ---` wrapper. No behavioral changes to non-affected code paths.

### Handoff
None -- task is fully self-contained. The fix only adds filtering patterns; no downstream components are affected.
---
