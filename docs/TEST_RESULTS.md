# Test Results — Claude Code Visual Manager

**Date:** 2026-03-18
**Run by:** qa-tester agent (Task #13)

---

## Test Runner

| Item | Value |
|------|-------|
| Framework | Vitest v4.1.0 |
| Config | `server/vitest.config.js` |
| Command | `npm test` (root) or `npm test --prefix server` |
| Pool | `forks` (sequential to avoid cross-test PTY interference) |
| Timeout per test | 10,000ms |

---

## Summary

| Metric | Value |
|--------|-------|
| Test files | 6 |
| Total tests | **110 passed, 0 failed** |
| Duration | ~3.4s |
| Exit code | 0 |

**All 110 tests pass.**

---

## Per-Suite Results

### RingBuffer.test.js — 19 tests, 0 failures

Tests the core circular buffer (DEC-004: 100 KB cap, wrap-around).

| Test group | Tests | Status |
|------------|-------|--------|
| constructor | 5 | PASS |
| happy path (push/retrieve) | 5 | PASS |
| wrap-around overflow | 5 | PASS |
| clear() | 2 | PASS |
| toBuffer() consistency | 2 | PASS |

Key behaviours verified:
- Default capacity is 100 KB
- Pushes larger than capacity keep only the last N bytes
- Oldest bytes are discarded correctly on overflow
- Wrap-around produces correct byte ordering on `toBuffer()`
- `clear()` resets state and allows fresh writes

---

### FileManager.test.js — 17 tests, 0 failures

Tests the atomic file I/O service with path-traversal protection (SEC-03, SEC-04).

| Test group | Tests | Status |
|------------|-------|--------|
| validatePath — traversal rejection | 7 | PASS |
| readFile | 3 | PASS |
| writeFile | 4 | PASS |
| listDirectory | 2 | PASS |
| (via writeFile) parent dir creation | 1 | PASS |

Key behaviours verified:
- `../../../etc/passwd` style attacks are rejected with "Path traversal detected"
- Sibling-directory attacks (`/tmp/project-evil` when base is `/tmp/project`) are rejected
- Absolute paths outside `allowedBase` are rejected
- Reads, writes, and directory listing work correctly for valid paths
- `writeFile` creates missing parent directories atomically
- `listDirectory` returns `[]` for non-existent directories (no throw)

---

### csrf.test.js — 18 tests, 0 failures

Tests the CSRF middleware (DEC-008).

| Test group | Tests | Status |
|------------|-------|--------|
| safe methods (GET/HEAD/OPTIONS) | 3 | PASS |
| mutating methods — no header | 4 | PASS |
| mutating methods — wrong value | 4 | PASS |
| mutating methods — correct header | 4 | PASS |
| error cases | 3 | PASS |

Key behaviours verified:
- GET/HEAD/OPTIONS always pass through without the header
- POST/PUT/PATCH/DELETE return 403 if `X-Requested-With` is absent
- POST/PUT/PATCH/DELETE return 403 if header value is `XMLHttpRequest` or any other non-matching value
- POST/PUT/PATCH/DELETE pass through when header value is exactly `ClaudeCodeManager`
- Case-variant values (e.g. `ClaudeCodemanager`) are correctly rejected
- Response body on rejection is `{ error: "CSRF validation failed" }`

---

### pathValidation.test.js — 17 tests, 0 failures

Tests `validateProjectPath`, `validateClaudePath`, and `ApiError` from the path validation middleware.

| Test group | Tests | Status |
|------------|-------|--------|
| validateProjectPath — happy path | 2 | PASS |
| validateProjectPath — error cases | 3 | PASS |
| validateClaudePath — happy path | 4 | PASS |
| validateClaudePath — traversal rejection | 4 | PASS |
| ApiError | 2 | PASS |
| (misc) | 2 | PASS |

Key behaviours verified:
- Traversal attacks (`../..`) resolved by `path.resolve` are still caught by prefix check
- Sibling-directory suffix attacks are rejected (e.g. `/tmp/project-evil` not allowed for base `/tmp/project`)
- Empty allowed-base list correctly rejects all paths
- `ApiError` carries correct `statusCode` and is an `instanceof Error`

---

### SessionManager.test.js — 20 tests, 0 failures

Tests the PTY session lifecycle with mocked `node-pty` and `ProcessRegistry`.

| Test group | Tests | Status |
|------------|-------|--------|
| createSession | 4 | PASS |
| getSession | 2 | PASS |
| listSessions | 2 | PASS |
| attachClient | 3 | PASS |
| detachClient | 2 | PASS |
| writeInput | 3 | PASS |
| killSession | 4 | PASS |
| PTY session persistence (tab switch) | 1 | PASS |
| session switching | 1 | PASS |

Key critical-path behaviours verified:
- **PTY persistence**: session stays alive after all WebSocket clients detach — status remains `active`
- **Ring buffer replay**: when a client reconnects, buffered PTY output is replayed immediately
- **Session switching**: two different projects get independent sessions with separate session IDs
- **Kill closes clients**: `killSession` sends `ws.close()` to all attached WebSocket clients
- **writeInput guards**: input is silently dropped for unknown or killed sessions

---

### JobRunner.test.js — 19 tests, 0 failures

Tests the one-shot job executor with mocked `child_process.spawn` and `tree-kill`.

| Test group | Tests | Status |
|------------|-------|--------|
| startJob | 6 | PASS |
| cancelJob | 5 | PASS |
| cancelAll | 2 | PASS |
| addSseClient | 3 | PASS |
| listJobs (sanitization) | 2 | PASS |
| (misc: claudeBin guard) | 1 | PASS |

Key critical-path behaviours verified:
- **`stdin.end()` called immediately** (DEC-005 / GitHub #7497 hang prevention): confirmed via mock assertion
- **`shell: false` enforced** (SEC-02): spawn options checked directly
- **Cancellation race condition**: after `cancelJob`, if the child process exits non-zero, status stays `cancelled` — does NOT flip to `error`
- **SSE cancel event**: connected clients receive `{"type":"cancelled"}` immediately on job cancel
- **`cancelAll` skips finished jobs**: only `running` jobs are cancelled
- **`addSseClient` on finished job**: immediately sends `{"type":"done"}` and closes the response
- **`listJobs` sanitization**: prompt content and child process handle are NOT present in any list output (SEC-08)

---

## Test Infrastructure

### Files created

| File | Purpose |
|------|---------|
| `server/tests/RingBuffer.test.js` | Unit tests — circular buffer |
| `server/tests/FileManager.test.js` | Unit tests — atomic I/O + path traversal |
| `server/tests/csrf.test.js` | Unit tests — CSRF middleware |
| `server/tests/pathValidation.test.js` | Unit tests — path validation helpers |
| `server/tests/SessionManager.test.js` | Integration tests — PTY session lifecycle (mocked PTY) |
| `server/tests/JobRunner.test.js` | Integration tests — job execution (mocked spawn) |
| `server/vitest.config.js` | Vitest configuration |

### Scripts added

| Location | Script | Command |
|----------|--------|---------|
| `server/package.json` | `test` | `vitest run` |
| `package.json` (root) | `test` | `npm test --prefix server` |

---

## Issues Found During Testing

### Issue 1 — vi.mock hoisting with external variable reference (RESOLVED)

**Severity:** LOW (test infrastructure only)
**Location:** `tests/JobRunner.test.js`
**Description:** Initial implementation used `let spawnMock` then referenced it inside `vi.mock()`. Vitest hoists `vi.mock()` calls to the top of the file, before `let` declarations are initialized, causing `ReferenceError: Cannot access 'spawnMock' before initialization`.
**Fix:** Changed to `const spawnMock = vi.hoisted(() => vi.fn())` which creates the mock reference in a hoisted context that vi.mock can safely access.
**Status:** FIXED in test code.

### Issue 2 — EventEmitter mock for stdout incompatible with readline (RESOLVED)

**Severity:** LOW (test infrastructure only)
**Location:** `tests/JobRunner.test.js`
**Description:** Initial mock used `new EventEmitter()` for `child.stdout`. Node.js `readline.createInterface()` calls `input.resume()` internally, which `EventEmitter` does not implement. This caused `TypeError: input.resume is not a function`.
**Fix:** Changed mock to use `new PassThrough()` from the `stream` module, which is a proper Readable stream that `readline` accepts.
**Status:** FIXED in test code.

---

## Coverage of Critical Paths (per Task #13 requirements)

| Critical Path | Covered | Test Location |
|---------------|---------|---------------|
| PTY session persistence (session survives tab switch) | YES | `SessionManager.test.js` — "PTY session persistence" suite |
| Session switching (switching projects spawns correct session) | YES | `SessionManager.test.js` — "session switching" suite |
| Job hang prevention (stdin.end() called) | YES | `JobRunner.test.js` — "should call child.stdin.end() immediately" |
| Orphan process cleanup (ProcessRegistry) | PARTIAL | `SessionManager.test.js` — `ProcessRegistry.register/unregister` mocked and verified called |
| Path traversal rejection | YES | `FileManager.test.js` + `pathValidation.test.js` |
| Job cancellation (running job cancelled mid-execution) | YES | `JobRunner.test.js` — "cancelJob" suite |

**Note on ProcessRegistry orphan cleanup:** The `ProcessRegistry.cleanupStale()` function is called at server startup and shutdown via `server/index.js`. Since tests do not spin up the full Express server, `cleanupStale()` integration is partially covered — the call and mock verification confirm the contract is wired. Full end-to-end process kill testing would require a live OS process, which is out of scope for unit tests and is better addressed in a separate integration/smoke test.

---

## Recommendations

1. **Add integration smoke tests** (future): A separate test that boots the Express server on a test port, sends real HTTP requests, and verifies the full CSRF/rate-limit/routing chain. This is blocked on having a real `claude` binary available in CI.

2. **Consider adding idle sweeper tests**: The `#startIdleSweeper` / `IDLE_TIMEOUT_MS` logic is not directly tested. A unit test using `vi.useFakeTimers()` to advance the clock could verify sessions are killed after idle timeout.

3. **Add rate limiter tests**: The in-memory rate limiter in `server/index.js` is not covered because it is wired at the Express app level. An integration test could verify the 429 response after 200+ requests.

4. **All 110 current tests should run in CI**: No real PTY, filesystem writes outside `/tmp`, or network access is needed — all external dependencies are mocked. The test suite is safe to run in any CI environment.
