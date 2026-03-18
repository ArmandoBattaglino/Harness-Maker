# Research B: PTY Session Persistence and Reconnection on Windows

## Question

How do you keep a node-pty process alive when a WebSocket client disconnects, and then reconnect a new WebSocket connection to that same running PTY process later? What is the pattern for "detached PTY sessions" in Node.js? How do tools like ttyd, wetty, or similar web terminal apps handle session reconnection? Are there any specific Windows/ConPTY considerations for keeping a PTY alive without an active client?

---

## Findings

### The Core Pattern: PTY Session Store

The canonical pattern for detached PTY sessions is straightforward: **never couple the PTY process lifetime to the WebSocket connection lifetime**. Instead, the server maintains a session registry (typically a `Map`) keyed by a stable session ID. When a WebSocket closes, only the socket reference is removed from the session record — the `IPty` object and its event listeners remain untouched in memory. When a new WebSocket arrives with a matching session ID, it is grafted onto the existing PTY's `.onData` event stream.

The sequence is:

1. Client requests a new session → server calls `pty.spawn(...)`, stores `{ pty, outputBuffer, ws }` in `sessions.set(sessionId, ...)`, returns `sessionId` to the client.
2. Client disconnects (tab closed, network blip) → server's `ws.on('close')` handler removes `ws` from the session record but does **not** call `pty.kill()`.
3. Client reconnects with the same `sessionId` → server looks up the existing PTY, replays any buffered output, and wires the new `ws` into `pty.onData`.
4. User explicitly clicks "Stop" → server calls `pty.kill()` and deletes the session entry.

The output buffer (a rolling string or byte array with a configurable TTL or size cap) is essential: it lets the reconnecting client catch up on output produced while it was disconnected, recreating the illusion of a continuous session.

### How ttyd Handles Reconnection

ttyd (the reference C implementation using libwebsockets) exposes a `--reconnect` flag (default: 10 seconds) that tells the xterm.js client how long to wait before attempting to reconnect after a WebSocket closure. Critically, ttyd's architecture holds the PTY open server-side across client disconnects by default. The `-o / --once` and `-q / --exit-no-conn` flags opt into kill-on-disconnect behavior — meaning the baseline design is persistence-first. wetty and gotty follow the same philosophy, treating the PTY as the authoritative process whose lifetime the server controls independently of the browser session.

### Windows ConPTY-Specific Risks

Keeping a ConPTY alive without an active output reader is the single biggest hazard on Windows. ConPTY writes to a named pipe; if the pipe's read end is not being drained, the internal buffer fills and **the child process blocks on its next write syscall**. This does not kill the process, but it freezes it, which appears indistinguishable from a hang. The Microsoft documentation explicitly warns: "Servicing all of the pseudoconsole activities on the same thread may result in a deadlock where one of the communications buffers is filled."

The correct mitigation when no WebSocket is attached is to **keep a dedicated reader thread/loop draining the PTY output into a server-side ring buffer at all times** — not only when a client is connected. On reconnect, the client is replayed from the ring buffer. A known separate issue: `ClosePseudoConsole` can itself deadlock if the output pipe is not fully drained first (fixed in Windows 11 24H2 / build 26100, but relevant for earlier targets). A lingering ConPTY bug also means the conhost process can outlive the child shell unless `pty.kill()` is called explicitly — always clean up explicitly rather than relying on garbage collection.

### Output Buffer Sizing Trade-off

The WebSocket reconnection literature recommends a per-session TTL-bounded ring buffer. For terminal output, storing the last 50–200 KB or the last 60–120 seconds of output is usually sufficient to handle a tab-refresh or short network interruption. Beyond that, the cost in memory across many concurrent sessions becomes significant (at 1,000 sessions × 100 KB each = 100 MB RAM just for buffers).

---

## Key Takeaways

- **Decouple PTY lifetime from WebSocket lifetime.** Store `IPty` instances in a server-side `Map<sessionId, SessionRecord>`. On WebSocket close, detach the socket but leave the PTY running. Only call `pty.kill()` on explicit user request or a configurable idle timeout.
- **Always drain ConPTY output, even when no client is connected.** On Windows, an unread output pipe will block the child process. Run a persistent async reader loop that feeds output into a ring buffer regardless of client presence.
- **Replay the ring buffer on reconnect.** When a new WebSocket attaches to an existing session, immediately flush the buffered output before switching to live streaming. This recreates the terminal state without re-running any commands.
- **Explicit cleanup is mandatory on Windows.** ConPTY leaves dangling conhost processes if the PTY object is garbage-collected without `pty.kill()`. Always hook process exit and SIGTERM/SIGINT to call kill on all active sessions.
- **ttyd's default is persistence-first.** Kill-on-disconnect is an opt-in flag (`--once`, `--exit-no-conn`), confirming the community consensus that PTY persistence is the correct default architecture.

---

## Implications for This Project

The server must maintain a `Map<sessionId, { pty: IPty, buffer: RingBuffer, ws: WebSocket | null }>` and run a permanent `pty.onData` consumer that writes to the ring buffer unconditionally, so ConPTY's output pipe is never left unread. WebSocket `close` handlers must set `ws = null` in the session record and nothing else. On reconnect, the handler replays the ring buffer then wires the new socket into the live data stream. A configurable idle timeout (e.g., 30 minutes with no reconnection) should trigger `pty.kill()` and session cleanup to avoid unbounded memory growth from abandoned buffers. Windows 11 pre-24H2 targets should ensure `ClosePseudoConsole` is never called while the output pipe still has unread data, so drain the buffer fully before teardown.

---

## Sources

- [node-pty GitHub repository (microsoft/node-pty)](https://github.com/microsoft/node-pty)
- [Creating a Pseudoconsole Session - Windows Console | Microsoft Learn](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session)
- [ttyd - Share your terminal over the web (tsl0922/ttyd)](https://github.com/tsl0922/ttyd)
- [ttyd project homepage](https://tsl0922.github.io/ttyd/)
- [GoTTY - Share your terminal as a web application (yudai/gotty)](https://github.com/yudai/gotty)
- [ConPTY megathread: buffer gets out-of-sync (microsoft/terminal #15976)](https://github.com/microsoft/terminal/issues/15976)
- [ConPTY hangs on ClosePseudoConsole (microsoft/terminal discussion #17716)](https://github.com/microsoft/terminal/discussions/17716)
- [ConPTY should support overlapped I/O (microsoft/terminal #262)](https://github.com/microsoft/terminal/issues/262)
- [Node won't exit after connecting PTY (microsoft/node-pty #413)](https://github.com/microsoft/node-pty/issues/413)
- [WebSocket Reconnection: State Sync and Recovery Guide (websocket.org)](https://websocket.org/guides/reconnection/)
- [Windows Command Line: Introducing the Windows Pseudo Console (ConPTY)](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/)
