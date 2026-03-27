# Documentation Status
_Last updated: 2026-03-27 after Task #52: SwarmContext.jsx Zustand ExecutionStore_

## Status Legend
- UP_TO_DATE -- matches current code
- PARTIAL -- partially updated, known gaps noted
- STALE -- not yet updated for recent changes
- MISSING -- should exist but does not

## Documentation Health

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| README.md | UP_TO_DATE | 2026-03-26 | Features table updated for Phase 9: 5 views, new design system, renamed features. |
| docs/SECURITY_AUDIT.md | UP_TO_DATE | 2026-03-18 | Phase 9 is frontend-only; no security surface change. |
| docs/ARCHITECTURE.md | UP_TO_DATE | 2026-03-26 | Component diagram, React component tree, and Section 8 (State Management) updated for Phase 9: 5 views, AppContext, EntitiesView deprecated. |
| docs/memory/PROJECT.md | UP_TO_DATE | 2026-03-25 | Tech stack table includes Phase 9 fonts and icons. |
| docs/memory/DECISIONS.md | UP_TO_DATE | 2026-03-18 | All 10 decisions still apply. Phase 9 design decisions documented in CONTEXT.md. |
| docs/memory/PROGRESS.md | UP_TO_DATE | 2026-03-26 | All 31 tasks marked COMPLETED including Phase 9. |
| docs/memory/CODE_MAP.md | UP_TO_DATE | 2026-03-26 | Updated by code-mapper for Phase 9 tasks. |
| docs/memory/CHANGELOG.md | UP_TO_DATE | 2026-03-26 | Updated by code-mapper for Phase 9 tasks. |
| docs/memory/ACTIVITY_LOG.md | UP_TO_DATE | 2026-03-26 | All Phase 9 entries present. |
| Inline comments | UP_TO_DATE | 2026-03-26 | All Phase 9 view components have appropriate comments. |
| docs/API.md | MISSING | -- | API surface documented in ARCHITECTURE.md Section 2. Standalone file deferred. |
| docs/CONTRIBUTING.md | MISSING | -- | Private tool; no external contributors. |

## New V3 Service Files (not yet in public docs — V3 incomplete)

| File | Status | Notes |
|------|--------|-------|
| server/services/WorkflowStore.js | UP_TO_DATE | New file (Task #43). Persistent workflow state store. Self-documenting code; no inline docs needed. Not yet reflected in ARCHITECTURE.md (V3 incomplete). |
| server/services/HandoffParser.js | UP_TO_DATE | New file (Task #45). Stateful rolling-buffer token extractor for ConPTY chunk-split handoff tokens. Well-documented inline. 22 unit tests in server/tests/HandoffParser.test.js. Not yet reflected in ARCHITECTURE.md (V3 incomplete). |
| server/services/SwarmEngine.js (Task #46.1) | UP_TO_DATE | Created (Task #46.1). Class skeleton + constructor + setWsBroadcast + stopExecution + getStatus. All methods have JSDoc. swarmListeners tap design referenced to DEC-014. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/services/SwarmEngine.js (Task #46.2) | UP_TO_DATE | Modified (Task #46.2). Implemented startExecution, _spawnAgentPty, _ensureAgentPty, _onHandoff (stub), _onDone (stub). All methods have complete JSDoc with @param/@returns/@throws. WorkflowExecution in-memory shape documented in file header comment. tapFn lifecycle (register + cleanup in stopExecution) documented inline. budgetTracker hook documented as deferred to Task #49. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/services/SwarmEngine.js (Task #46.3) | UP_TO_DATE | Modified (Task #46.3). Implemented _buildSystemPrompt (assembles SWARM PROTOCOL block: role prompt + workflow context + handoff targets + __DONE__ instructions) and _startHeartbeat (5-min setInterval writing empty string to running agent sessions; .unref() for clean shutdown). _startHeartbeat call added in startExecution after _spawnAgentPty. JSDoc complete on both methods. _onHandoff and _onDone remain stubs (deferred to Tasks #62.x). Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/services/CircuitBreaker.js (Task #49) | UP_TO_DATE | Created (Task #49). Advisory circuit breaker for swarm handoff loops. Single check(edgeId, counter, threshold) method returns boolean — does NOT stop execution (FR-V3-17 advisory-only). JSDoc complete. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/services/BudgetTracker.js (Task #49) | UP_TO_DATE | Created (Task #49). Soft budget tracker for swarm executions. Methods: estimate(charCount), track(sessionId, chunk), registerSession(executionId, sessionId), getTotal(executionId), checkBudget(executionId, limitTokens), clearExecution(executionId). Does NOT stop execution (FR-V3-18 advisory-only). JSDoc complete. Wired into SwarmEngine._spawnAgentPty tapFn via this._budgetTracker guard (set externally). Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/routes/swarm.js (Task #47.1) | UP_TO_DATE | Created (Task #47.1). 7 REST endpoints under /api/v1/swarm: start (POST /:workflowId/start), pause (POST /:executionId/pause), resume (POST /:executionId/resume), stop (DELETE /:executionId), status (GET /:executionId/status), agent output (GET /:executionId/agent/:nodeId/output), broadcast (POST /:executionId/broadcast). Scaffold stub returns 501. All routes have comprehensive block comments documenting request/response/error shapes. Factory function (swarmRoutes) has JSDoc with @param/@returns. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/ws/swarmHandler.js (Task #48.1) | UP_TO_DATE | Created (Task #48.1). WebSocket handler for /ws/swarm path — channel routing + connection management. Module-level _subscribers Map (executionId -> Set<WebSocket>). handleSwarmConnection (default export): parses executionId query param, validates, registers ws, sends initial execution_status on connect, cleans up on close/error. getSubscribers (named export): returns subscriber set for a given executionId. All functions have JSDoc with @param/@returns. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/ws/swarmHandler.js (Task #48.2) | UP_TO_DATE | Modified (Task #48.2). broadcast(executionId, event) named export added. Iterates _subscribers set for executionId, JSON-serialises event, sends to all WebSocket connections with readyState === 1 (OPEN); non-open connections skipped silently. JSDoc complete with @param descriptions. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/index.js | UP_TO_DATE | Modified (Tasks #43, #47.1, #48.1, #48.2). WorkflowStore init (Task #43); swarm REST routes wired at /api/v1/swarm (Task #47.1); dual-WSS setup with /ws/swarm → wssSwarm and all other /ws/* → wssTerminal (Task #48.1); SwarmEngine instantiated after HTTP server creation and stored on app.locals; broadcast named export imported from swarmHandler.js and passed to swarmEngine.setWsBroadcast(broadcast) to wire live WS events from SwarmEngine to subscribers (Task #48.2). No documentation staleness — V3 architecture section in ARCHITECTURE.md does not exist yet. |
| server/utils/ssrfGuard.js (Task #50) | UP_TO_DATE | New file (Task #50). SEC-V3-03 SSRF prevention. isSafeUrl(urlString) blocks private IPv4 ranges, loopback (127.x, ::1, localhost), link-local (169.254.x), unspecified (0.0.0.0), and IPv4-mapped IPv6 variants. Synchronous check — no DNS lookup. Used by TriggerManager.js (Task #74). Complete JSDoc + module-level comment documenting the deliberate dns.lookup() omission. 36 tests in security-v3.test.js. Not yet in ARCHITECTURE.md (V3 incomplete). |
| server/middleware/webhookLimit.js (Task #50) | UP_TO_DATE | New file (Task #50). SEC-V3-01 body size cap. Express JSON middleware with 32KB limit. Stub ready for server/routes/triggers.js (Task #75). Usage example in file header comment. No JSDoc needed — one-liner export. |
| server/middleware/webhookRateLimit.js (Task #50) | UP_TO_DATE | New file (Task #50). SEC-V3-04 stricter rate limiter. 10 req/min per IP for webhook endpoints. In-memory Map + 60s stale sweep (.unref()) — same pattern as server/index.js global rate limiter. Stub ready for triggers.js (Task #75). JSDoc on the exported function. |
| server/middleware/hitlValidation.js (Task #50) | UP_TO_DATE | New file (Task #50). SEC-V3-05 HITL text size cap. validateResumeText(req, res, next) returns HTTP 400 if resumeText exceeds 8192 bytes. Stub ready for server/routes/inbox.js (Task #68). JSDoc complete with @param types. |
| server/tests/security-v3.test.js (Task #50) | UP_TO_DATE | New file (Task #50). 36 tests covering SEC-V3-02/-03/-05/-06/-07. isSafeUrl: 19 cases (private IPv4, loopback, link-local, IPv4-mapped IPv6, edge cases). WorkflowStore schema validation: 9 cases. HandoffParser oversized payload: 3 cases. validateResumeText: 5 cases. All 168 tests pass (132 pre-existing + 36 new). |
| client/package.json (Task #51) | UP_TO_DATE | Modified (Task #51). Added @xyflow/react@^12.10.1 and zustand@^4.5.7 to dependencies. V3 canvas and state management libraries. |
| client/src/store/SwarmContext.jsx (Task #52) | UP_TO_DATE | Created (Task #52). Zustand v4 execution store for V3 swarm orchestrator. Exports useSwarmStore (named + default). State slices: activeExecutionId, executionStatus, agentStates (per-node), edgeCounters, budget (estimatedTokensUsed/limitTokens), inboxItems (HITL queue), interAgentFeed (capped at 100 events), focusedDepartmentId, departmentStack (breadcrumb stack), selectedNodeId, wsConnected. Actions: setExecution, updateAgentState, updateEdgeCounter, updateBudget, addInboxItem, resolveInboxItem, addFeedEvent, setFocusedDepartment, navigateBreadcrumb (index-based breadcrumb pop), setSelectedNode, setWsConnected, reset. Per DEC-V3-04: React Flow canvas state is kept separate from this store. No React context wrapper — components call useSwarmStore() directly. Thin named export included for App.jsx compatibility. Inline comments document each state slice's data shape. Not yet in ARCHITECTURE.md (V3 incomplete). |

## Stale Sections (known gaps)

- docs/memory/DECISIONS.md:DEC-001 -- Records "use node-pty-prebuilt-multiarch" but actual installed package is plain node-pty. Historical accuracy preserved intentionally; correction in PROJECT.md.
- client/src/views/EntitiesView.jsx -- File still exists on disk but is no longer imported by App.jsx. Marked as DEPRECATED in ARCHITECTURE.md component tree. Can be deleted in a future cleanup.
- docs/ARCHITECTURE.md -- Does not yet include V3 components (WorkflowStore, HandoffParser, SwarmEngine, CircuitBreaker, BudgetTracker, swarm REST routes, swarmHandler WS, BroadcastService, V3 security layer, SwarmContext Zustand store, canvas deps, etc.). Will require a major update when V3 is feature-complete (Task #82). SwarmEngine is fully implemented through Task #46.3. CircuitBreaker and BudgetTracker exist as standalone pure-service classes (Task #49). server/routes/swarm.js implements 7 execution control REST endpoints (Task #47.1); scaffold endpoint remains a 501 stub. server/ws/swarmHandler.js implements WebSocket channel routing + connection management for /ws/swarm (Task #48.1) and broadcast() named export (Task #48.2). V3 security layer (Task #50): ssrfGuard.js (SSRF prevention, SEC-V3-03), webhookLimit.js (32KB cap, SEC-V3-01), webhookRateLimit.js (10 req/min, SEC-V3-04), hitlValidation.js (8KB HITL text cap, SEC-V3-05) — all stubs ready for Tasks #68, #74, #75. @xyflow/react@12.10.1 and zustand@4.5.7 installed in client/ (Task #51). client/src/store/SwarmContext.jsx Zustand store created (Task #52) — full execution + canvas + HITL state with 12 actions; importable by all V3 canvas components. swarmEngine.setWsBroadcast(broadcast) called in server/index.js — live WS event pipeline fully wired. Scaffold full implementation (#59) and HITL freeze (#70) still pending. _onHandoff and _onDone remain stubs until Tasks #62.1–#62.3.

## Documentation Debt

| Item | Priority | Reason deferred |
|------|----------|----------------|
| docs/API.md -- standalone REST API reference | Medium | API is documented in ARCHITECTURE.md; standalone file needed only if consumers other than internal agents use the API |
| docs/CONTRIBUTING.md | Low | Private tool at v1; no external contributors currently |
| docs/memory/DECISIONS.md DEC-001 correction note | Low | Historical accuracy preserved intentionally; gap is minor and tracked here |
| README -- dev workflow section | Low | Internal dev workflow documented in CLAUDE.md; no duplication needed until project is opened |
| SECURITY_AUDIT.md LOW-03 fix | Low | Build env var allowlist for PTY spawn -- deferred to v1.1 |
| SECURITY_AUDIT.md LOW-04 fix | Low | Refactor safeRead to cover claudemd GET path -- deferred to v1.1 |
| Delete EntitiesView.jsx | Low | Dead code after Phase 9; kept for rollback safety |
| docs/ARCHITECTURE.md V3 section | High | Must be written once V3 feature set (SwarmEngine, WorkflowStore, HandoffParser, BroadcastService, SwarmCanvasView) is complete. Deferred intentionally -- documenting incomplete architecture creates false docs. |
| README.md V3 features | High | Must be updated once V3 ships. Currently README accurately describes v1.3 features only. Do not add V3 features until the V3 task plan is fully COMPLETED. |
