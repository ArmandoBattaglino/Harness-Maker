# V3 Pre-Release Security Audit Report
**Date:** 2026-03-28
**Auditor:** security agent
**Task:** #79 — V3 Pre-Release Security Audit
**Scope:** All V3 additions (Tasks #43–#76)

---

## Executive Summary

**Overall verdict: PASS with notes.**

All 7 mandatory SEC-V3 requirements are implemented and active in production code. No CRITICAL or HIGH vulnerabilities were found in the V3 codebase itself. One HIGH dependency vulnerability exists in a transitive dependency (`path-to-regexp`) and one HIGH vulnerability in a client dev dependency (`picomatch`). One medium-severity design note is recorded for the webhook CSRF interaction. All 187 tests pass.

---

## SEC-V3 Requirements Verification

### SEC-V3-01: 32KB webhook body cap
**Status: PASS (strengthened — BUG-99 fix applied 2026-03-28)**
**Location:** `server/routes/triggers.js:72–74`

```js
router.post(
  '/webhooks/:path',
  express.raw({ limit: '32kb', type: 'application/json' }),
  webhookRateLimit(10, 60000),
  async (req, res) => {
    // manually parse: payload = JSON.parse(req.body.toString('utf8'))
  }
);
```

**BUG-99 fix (2026-03-28):** The original implementation used `express.json({ limit: '32kb' })` as per-route middleware. However, the global `express.json()` at `server/index.js:177` (100KB default limit) was mounted before all routes and consumed the request body first — the per-route middleware ran on an already-parsed body, making the 32KB cap ineffective.

The fix switches to `express.raw({ limit: '32kb', type: 'application/json' })`, which bypasses the global JSON parser entirely and enforces the size cap at the raw-bytes level. The handler then manually calls `JSON.parse(req.body.toString('utf8'))`. Invalid JSON is treated as an empty payload and still returns `{ received: true }` per SEC design (external callers must not receive error detail).

This makes SEC-V3-01 correctly enforced end-to-end: payloads over 32KB cause Express to return HTTP 413 before the rate limiter or handler are reached.

---

### SEC-V3-02: WorkflowDefinition schema validation
**Status: PASS**
**Location:** `server/services/WorkflowStore.js:92–116` (create), `server/services/WorkflowStore.js:123–152` (update), `server/services/WorkflowStore.js:175–239` (validate)

`WorkflowStore.validate()` is called on every `create()` and every `update()`. Validated fields:

| Field | Constraint | Code |
|-------|-----------|------|
| `name` | required, string, max 100 chars, `/^[\w\s\-.]+$/` | lines 184–192 |
| `description` | optional string, max 500 chars | lines 196–201 |
| `nodes` | array, max 50 items | lines 204–210 |
| `nodes[i].id` | must match `/^[a-z][a-z0-9-]*$/` | lines 220–222 |
| `nodes[i].data.systemPrompt` | max 16,384 chars (16KB) | lines 225–234 |

Server generates the workflow UUID via `randomUUID()` at `WorkflowStore.js:100` — client cannot inject arbitrary IDs. The client-supplied body is validated before the ID is assigned.

---

### SEC-V3-03: SSRF guard for RSS URLs
**Status: PASS**
**Location:** `server/services/TriggerManager.js:186`, `server/utils/ssrfGuard.js`

`isSafeUrl()` is called in `TriggerManager.createRssTrigger()` before any outbound fetch:

```js
// SEC-V3-03: SSRF guard — reject private/loopback URLs
if (!isSafeUrl(rssUrl)) {
  throw new Error(`createRssTrigger: URL rejected by SSRF guard — ${rssUrl}`);
}
```

Blocked ranges in `ssrfGuard.js`:
- Loopback: `127.x.x.x`, `::1`, `localhost`
- Private: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`
- Unspecified: `0.0.0.0/8`
- Link-local: `169.254.x.x`
- IPv4-mapped IPv6: both dotted-decimal (`::ffff:192.168.x.x`) and hex-word (`::ffff:c0a8:xxxx`) forms

Known limitation (acceptable, documented in ssrfGuard.js comments): domain names that resolve to private IPs at DNS-lookup time are not blocked. A hostname like `my-internal-host.local` would pass the URL guard if it resolves to a private IP. This is an accepted limitation for a synchronous check and was deliberated in Task #50.

---

### SEC-V3-04: Webhook rate limiter at 10 req/min
**Status: PASS**
**Location:** `server/routes/triggers.js:18–41`, `server/routes/triggers.js:75`

A module-scoped in-memory rate limiter (`_webhookRateLimitMap`) is implemented directly in `triggers.js`. Key design points:

- Keys are scoped as `webhook:<ip>` — separate from the global `rateLimit` at `server/index.js:198` (which allows 200 req/min)
- Limit is 10 requests per 60-second window per IP
- Sweep interval (line 45–52) runs every 60 seconds with `.unref()` — no memory leak
- Rate limiter is the second middleware after the body-size cap, ensuring oversized payloads are rejected before the rate counter is checked

---

### SEC-V3-05: HITL resumeText capped at 8KB
**Status: PASS**
**Location:** `server/middleware/hitlValidation.js:23`, `server/routes/inbox.js:50`

`validateResumeText` middleware is imported and applied on the approve route:

```js
// hitlValidation.js:23
export function validateResumeText(req, res, next) {
  if (req.body?.resumeText && req.body.resumeText.length > RESUME_TEXT_MAX_LENGTH) {
    return res.status(400).json({ error: 'resumeText exceeds 8KB limit' });
  }
  next();
}
```

`RESUME_TEXT_MAX_LENGTH = 8192` (8KB). The middleware is applied to `POST /:executionId/inbox/:itemId/approve` only (the reject endpoint does not accept a body). HTTP 400 is returned before any PTY write occurs.

---

### SEC-V3-06: Workflow name/description whitelist server-side
**Status: PASS**
**Location:** `server/services/WorkflowStore.js:14–19`, `server/services/WorkflowStore.js:184–192`

Constants enforced in `WorkflowStore.validate()`:
- `NAME_REGEX = /^[\w\s\-.]+$/` — allows only word characters, spaces, hyphens, dots
- `MAX_NAME_LENGTH = 100`
- `MAX_DESCRIPTION_LENGTH = 500`

These constraints apply to both `create()` and `update()`. The `scaffold` endpoint at `swarm.js:75` validates the generated workflow through `store.create()` before returning it, so Claude-generated workflows also pass through the same validation gate.

---

### SEC-V3-07: HandoffParser 4KB buffer cap + contextUpdate schema validation
**Status: PASS**
**Location:** `server/services/HandoffParser.js:10`, `server/services/HandoffParser.js:47–49`, `server/services/HandoffParser.js:91–102`

Buffer cap:
```js
const MAX_BUF = 4096; // SEC-V3-07
// In feed():
if (this._buf.length > MAX_BUF) {
  this._buf = this._buf.slice(this._buf.length - MAX_BUF);
}
```

The cap is enforced on every `feed()` call, keeping only the newest 4096 bytes. This prevents unbounded memory growth from a runaway agent.

`_validateContext()` enforces:
- Object (not array, not null)
- Max 50 keys
- Values must be string, number, or boolean (no nested objects)
- Max string value length 1024 chars

Validated context objects are shallow-merged into `workflowContext` only after passing `_validateContext()`. Malformed base64 or invalid JSON payloads are caught and logged as warnings without crashing.

---

## Additional Checks

### No `shell: true` in any V3 spawn calls
**Status: PASS**

Grep across all V3 service files returned zero matches for `shell: true`. The only spawn call in the codebase is in `server/services/JobRunner.js:119`:
```js
shell: false, // SEC-02: never shell: true
```

SwarmEngine uses `SessionManager.createSession()` which spawns via `node-pty` — not `child_process.spawn`. node-pty does not support `shell` option; it spawns directly via the OS PTY interface.

---

### No direct `fs.writeFile` calls
**Status: PASS**

Zero matches for `fs.writeFile` across all server-side files. All writes use `write-file-atomic` (`writeFileAtomic` from `write-file-atomic` package):
- `WorkflowStore._writeWorkflow()` — `server/services/WorkflowStore.js:283`
- All pre-existing write paths (FileManager, ConfigStore) confirmed in prior audits

---

### Path writes use `path.resolve()` + prefix assertion
**Status: PASS**
**Location:** `server/services/WorkflowStore.js:251–266`

`_resolveFilePath(id)` enforces:
1. String type check and empty-string rejection
2. Explicit rejection of `/`, `\`, `..`, and null bytes in the ID
3. `path.resolve(this._workflowsDir, id + '.json')` followed by a `startsWith(this._workflowsDir + path.sep)` assertion

This prevents directory traversal even if an ID containing `../` were somehow passed.

---

### Scaffold endpoint does NOT log raw prompt or Claude output
**Status: PASS**
**Location:** `server/routes/swarm.js:103–130`

The `POST /api/v1/swarm/scaffold` handler logs only `err.message` on failure (`console.error`). The `prompt` value from `req.body` and the Claude API response text are never logged. This satisfies SEC-08 (no prompt content in logs).

---

### WebSocket swarm channel validates executionId before accepting connection
**Status: PASS**
**Location:** `server/ws/swarmHandler.js:50–65`

```js
if (!executionId) {
  ws.send(JSON.stringify({ type: 'error', message: 'executionId required' }));
  ws.close();
  return;
}
```

The handler closes connections that omit `executionId`. Connections with a non-existent `executionId` receive an error event but are kept open for the subscriber lifetime (no auto-close on missing execution). This is low risk — the subscriber receives no data if the execution does not exist. The executionId is a v4 UUID generated server-side (`server/services/SwarmEngine.js:62`), making it unguessable.

---

### WorkflowDefinition IDs are server-generated UUIDs (client cannot inject arbitrary IDs)
**Status: PASS**
**Location:** `server/services/WorkflowStore.js:100`

```js
const id = randomUUID(); // crypto.randomUUID() — server-generated, never client-supplied
```

The `create()` method discards any `data.id` that might be included in the request body and always assigns a fresh UUID. The `update()` endpoint uses the `id` from the URL path (validated via `_resolveFilePath`), not from the body.

---

### CSRF protection on inbox approve/reject endpoints
**Status: PASS (inherited from global middleware)**

The `csrfMiddleware` is mounted globally at `server/index.js:180` before all routes. The HITL inbox endpoints (`POST /:executionId/inbox/:itemId/approve` and `POST /:executionId/inbox/:itemId/reject`) are mounted via `app.use('/api/v1/swarm', inboxRoutes(...))` at line 234 — after the CSRF middleware. All POST inbox calls from the UI include `X-Requested-With: ClaudeCodeManager` (verified in `client/src/hooks/useInbox.js:55–57` and line 83).

---

## npm audit Results

### Root package
```
path-to-regexp  8.0.0 - 8.3.0
Severity: HIGH
GHSA-j3q9-mxjg-w52f — path-to-regexp vulnerable to Denial of Service via sequential optional groups
GHSA-27v5-c462-wpq7 — path-to-regexp vulnerable to ReDoS via multiple wildcards
Dependency chain: @google/stitch-sdk → @modelcontextprotocol/sdk → express@5.2.1 → router@2.2.0 → path-to-regexp@8.3.0
```

**Risk assessment (MEDIUM for this deployment):** The path-to-regexp DoS vulnerability requires an attacker to submit crafted route patterns. In this application, routes are defined statically in the Express router — user-supplied strings are never passed as route patterns. The vulnerability in path-to-regexp manifests when user input is used as a route pattern string, which does not occur here. The effective risk is low for this specific application, despite the HIGH severity classification in the advisory.

**Fix:** `npm audit fix` — however this touches a transitive dependency of `@google/stitch-sdk`. Upgrade or removal of stitch-sdk should be evaluated. The vulnerability is NOT exploitable in the current routing pattern.

### Client dev dependencies
```
picomatch  <2.3.2
Severity: HIGH
GHSA — picomatch has a ReDoS vulnerability via extglob quantifiers
Dependency chain: tailwindcss@3.4.19 → chokidar → picomatch@2.3.1
```

**Risk assessment (LOW for this deployment):** picomatch is a dev dependency used by Tailwind CSS for file watching during development. It is NOT included in the production build. The picomatch vulnerability requires an attacker to supply crafted glob patterns to the matching function, which does not occur during build or production serving. This is a dev-only surface with no production exposure.

---

## MEDIUM Findings

### MEDIUM-V3-01: Webhook endpoint blocked by global CSRF middleware (design mismatch)
**Severity: MEDIUM (functional correctness issue, net security positive)**
**Location:** `server/middleware/csrf.js:9` (CSRF_EXEMPT_PREFIXES), `server/routes/triggers.js:67` (design comment)
**STATUS: FIXED — Task #234 (2026-04-06)**

The webhook receiver was designed to accept external POSTs without the `X-Requested-With: ClaudeCodeManager` CSRF header. However, the global `csrfMiddleware` blocked these requests with HTTP 403 before they reached the webhook handler.

**Fix applied (Task #234):** Added a `CSRF_EXEMPT_PREFIXES` array to `server/middleware/csrf.js` containing `'/api/v1/triggers/webhooks/'`. The middleware now skips CSRF validation for any request whose path starts with an exempt prefix. This is Option 1 from the original analysis — path-based exemption inside the middleware itself.

```js
const CSRF_EXEMPT_PREFIXES = ['/api/v1/triggers/webhooks/'];
// In csrfMiddleware:
if (CSRF_EXEMPT_PREFIXES.some((prefix) => reqPath.startsWith(prefix))) return next();
```

**Security impact:** The webhook endpoint is now the only mutating route exempt from CSRF validation. This is by design — external callers (GitHub webhooks, CI/CD systems) cannot send the custom header. The endpoint remains protected by its dedicated rate limiter (SEC-V3-04: 10 req/min/IP) and body size cap (SEC-V3-01: 32KB). The server still binds to 127.0.0.1 only, so external access requires deliberate port forwarding.

---

## LOW Findings

### LOW-V3-01: swarmHandler.js keeps open WS connections for non-existent executionIds
**Severity: LOW (informational)**
**Location:** `server/ws/swarmHandler.js:99–104`

When a client connects with a valid UUID format but an `executionId` that does not exist, the handler sends an error event but does not close the connection. The subscriber stays in `_subscribers` until it disconnects naturally. An attacker cannot use this to exfiltrate data (they receive no events) but could hold open connections to consume file descriptors.

**Mitigating factors:** The app binds to 127.0.0.1 — requires local access to exploit. WebSocket server has `maxPayload: 1MB` guard. UUID format is unguessable.

**Recommended fix:** Add `ws.close()` after sending the "Execution not found" error event.

---

### LOW-V3-02: BudgetTracker accumulates chars indefinitely during a running execution
**Severity: LOW (informational)**
**Location:** `server/services/BudgetTracker.js:21–25`

`track()` accumulates output character counts for each session without a per-session cap. A long-running agent session producing large output could cause the session char count to grow unboundedly in memory. `clearExecution()` is called by `SwarmEngine.stopExecution()`, which resets the counts on stop.

**Mitigating factors:** Budget is soft-advisory only — it never stops execution. The accumulation is bounded by session lifetime (killed on `stopExecution`). The ring buffer in SessionManager already caps output at 100KB per session, but BudgetTracker counts all chars, not just the buffer window.

**No immediate fix required.** If executions run for hours, consider adding a per-session char cap in `track()`.

---

### LOW-V3-03: RSS feed URL logged on non-2xx response and network error
**Severity: LOW (informational)**
**Location:** `server/services/TriggerManager.js:254`, `TriggerManager.js:261`

```js
console.error(`[TriggerManager] RSS fetch non-OK ${response.status} for ${rssUrl}`);
console.error(`[TriggerManager] RSS fetch error for ${rssUrl}:`, err.message);
```

The full RSS URL (including any query parameters or tokens) is logged in error cases. If an RSS URL contains an API key or authentication token (e.g., `https://example.com/feed?token=secret`), it would be exposed in server logs.

**Recommendation:** Truncate or sanitize the URL before logging: `new URL(rssUrl).hostname` or strip query parameters.

---

## OWASP Top 10 Checklist — V3 Additions

| OWASP Category | Status | Notes |
|----------------|--------|-------|
| A01 Broken Access Control | PASS | Execution IDs are server-generated UUIDs; all routes require CSRF; inbox routes check execution existence before item lookup |
| A02 Cryptographic Failures | PASS | No secrets stored; API keys read from env vars only; server binds to 127.0.0.1 |
| A03 Injection | PASS | No SQL; no shell:true; HandoffParser validates context schema; resumeText capped; workflow names use CHARACTER_REGEX |
| A04 Insecure Design | PASS | Security requirements baked in from Task #50; schema validation enforced at storage layer |
| A05 Security Misconfiguration | PASS | Helmet active; CSRF active; rate limiting active; body caps active |
| A06 Vulnerable Components | MEDIUM | path-to-regexp HIGH (transitive, non-exploitable pattern); picomatch HIGH (dev-only) |
| A07 Authentication Failures | PASS | Localhost-only binding; no session tokens |
| A08 Software Integrity | PASS | write-file-atomic used for all workflow writes; atomic write prevents partial-write corruption |
| A09 Logging Failures | PASS | Prompt content not logged; resumeText not logged; API keys not logged; RSS URL logged in error paths (LOW-V3-03) |
| A10 SSRF | PASS | isSafeUrl() blocks private IP literals; applied before every RSS fetch |

---

## Files Audited

| File | Status |
|------|--------|
| `server/routes/triggers.js` | PASS |
| `server/routes/inbox.js` | PASS |
| `server/routes/swarm.js` | PASS |
| `server/ws/swarmHandler.js` | PASS (LOW-V3-01 noted) |
| `server/services/SwarmEngine.js` | PASS |
| `server/services/HandoffParser.js` | PASS |
| `server/services/TriggerManager.js` | PASS (LOW-V3-03 noted) |
| `server/services/CircuitBreaker.js` | PASS |
| `server/services/BudgetTracker.js` | PASS (LOW-V3-02 noted) |
| `server/services/WorkflowStore.js` | PASS |
| `server/middleware/hitlValidation.js` | PASS |
| `server/utils/ssrfGuard.js` | PASS |
| `server/middleware/csrf.js` | PASS (MEDIUM-V3-01 noted: webhook interaction) |
| `client/src/hooks/useInbox.js` | PASS |

---

## Test Results

```
Test Files: 9 passed (9)
Tests:      187 passed (187)
Duration:   5.85s
```

All 187 tests pass. No regressions introduced by V3 additions.

---

## Summary Table

| Finding | Severity | Status | File |
|---------|----------|--------|------|
| path-to-regexp ReDoS (transitive dep) | HIGH (dep) | Note — non-exploitable in current routing | root/node_modules |
| picomatch ReDoS (client dev dep) | HIGH (dep) | Note — dev-only, no production exposure | client/node_modules |
| Webhook CSRF mismatch | MEDIUM | FIXED (Task #234, 2026-04-06) — path-based exemption in csrf.js | server/middleware/csrf.js |
| swarmHandler open WS on missing execution | LOW | Informational | server/ws/swarmHandler.js |
| BudgetTracker unbounded char accumulation | LOW | Informational | server/services/BudgetTracker.js |
| RSS URL logged in error paths | LOW | Informational | server/services/TriggerManager.js |
| SEC-V3-01: 32KB webhook body cap | PASS | Verified active. BUG-99 fix (2026-03-28): switched from express.json to express.raw — 32KB cap now enforced at raw-bytes level, bypassing global JSON parser. | server/routes/triggers.js:72 |
| SEC-V3-02: WorkflowDefinition schema validation | PASS | Verified active | server/services/WorkflowStore.js |
| SEC-V3-03: SSRF guard for RSS URLs | PASS | Verified active | server/services/TriggerManager.js:186 |
| SEC-V3-04: Webhook rate limiter 10 req/min | PASS | Verified active | server/routes/triggers.js:75 |
| SEC-V3-05: resumeText 8KB cap | PASS | Verified active | server/routes/inbox.js:50 |
| SEC-V3-06: Workflow name/description whitelist | PASS | Verified active | server/services/WorkflowStore.js:14–19 |
| SEC-V3-07: HandoffParser 4KB cap + context schema | PASS | Verified active | server/services/HandoffParser.js:10,47,91 |
| No shell:true in V3 spawn calls | PASS | Verified — zero matches | all server/services/* |
| No direct fs.writeFile | PASS | Verified — zero matches | all server/* |
| Path writes use resolve() + prefix assert | PASS | Verified | WorkflowStore._resolveFilePath |
| Scaffold endpoint does not log prompt/output | PASS | Verified | server/routes/swarm.js |
| WebSocket validates executionId | PASS | Verified | server/ws/swarmHandler.js:60–65 |
| Workflow IDs are server-generated UUIDs | PASS | Verified | server/services/WorkflowStore.js:100 |
