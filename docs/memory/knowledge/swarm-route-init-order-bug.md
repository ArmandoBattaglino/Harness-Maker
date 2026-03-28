---
topic: SwarmEngine Route Initialization Order Bug
source: qa-tester
date: 2026-03-28
relevant_to: backend-dev, debugger, devops
---

# SwarmEngine Route Initialization Order Bug

## Context
Found during Task #80 V3 E2E testing. All swarm execution control and HITL inbox endpoints return HTTP 500 because swarmEngine is undefined inside the route handlers.

## Finding / Fix
**Root cause:** In server/index.js, lines 231-234 mount swarmRoutes and inboxRoutes using `app.locals.swarmEngine`, but SwarmEngine is not instantiated until lines 271-272. The factory functions (`swarmRoutes(swarmEngine, ...)` and `inboxRoutes(swarmEngine)`) capture `undefined` as a closure parameter.

**Error message:** `Cannot read properties of undefined (reading 'getStatus')`

**Affected endpoints:**
- GET /api/v1/swarm/:executionId/status
- POST /api/v1/swarm/:workflowId/start (after projectId validation passes)
- POST /api/v1/swarm/:executionId/pause
- POST /api/v1/swarm/:executionId/resume
- DELETE /api/v1/swarm/:executionId
- GET /api/v1/swarm/:executionId/agent/:nodeId/output
- POST /api/v1/swarm/:executionId/broadcast
- GET /api/v1/swarm/:executionId/inbox
- POST /api/v1/swarm/:executionId/inbox/:itemId/approve
- POST /api/v1/swarm/:executionId/inbox/:itemId/reject

**Fix:** Move route mounting (lines 231-234) to after SwarmEngine instantiation (after line 276). Specifically, place them after `app.locals.swarmEngine = swarmEngine;`.

## Key Takeaways
- Express route factory functions that take service instances via closure must be mounted AFTER the service is created
- This bug was NOT caught by the 187 existing unit tests because they mock services directly and never test the full server bootstrap order
- A server integration/smoke test that starts the real server and hits endpoints would catch this class of bug

## Sources / References
- server/index.js lines 231-234 (route mounting) and 271-272 (SwarmEngine creation)
- Server log: `[inbox] GET /:executionId/inbox error: Cannot read properties of undefined (reading 'getStatus')`
