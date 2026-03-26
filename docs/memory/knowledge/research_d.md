# Research D: Multi-Session PTY Management in Node.js

## Question

What is the recommended architecture pattern for managing N concurrent PTY sessions in a Node.js + WebSocket server? Specifically: (1) How to implement a session registry/map (sessionId → PTY instance)? (2) How to handle multiple concurrent WebSocket connections, each mapped to a different PTY? (3) How to implement session switching in the browser (disconnect from session A's WebSocket, connect to session B's WebSocket without killing either process)? (4) Are there memory or resource limits to consider for N concurrent PTY processes?

---

## Findings

### 1. Session Registry Pattern (sessionId → PTY)

The canonical pattern is a `Map<sessionId, PTYHandle>` stored in the Node.js process memory. Every source surveyed — including the Medium article on scalable node-pty usage and the DEV Community tutorial — converges on this structure:

```js
// Server-side registry
const sessions = new Map(); // sessionId -> { pty, dataBuffer, clients: Set<WebSocket> }

// On session create
const ptyProcess = pty.spawn(shell, [], { name: 'xterm-color', cwd, env });
sessions.set(sessionId, { pty: ptyProcess, dataBuffer: [], clients: new Set() });

// Pipe PTY output to ALL attached clients
ptyProcess.on('data', (data) => {
  const session = sessions.get(sessionId);
  session.dataBuffer.push(data);           // rolling buffer for reconnect replay
  session.clients.forEach(ws => ws.send(data));
});
```

The value stored per session should hold: the PTY instance, a rolling output buffer (for replaying missed output on reconnect), and a `Set` of currently attached WebSocket clients (zero or more).

### 2. Multiple WebSocket Connections Mapped to PTY

Because a PTY can have zero or more attached clients at any time, the server must decouple WebSocket lifecycle from PTY lifecycle entirely. On each `ws.on('connection')` event, the server reads a `sessionId` from the URL query string or an initial handshake message, looks it up in the registry, and adds the socket to that session's client set:

```js
wss.on('connection', (ws, req) => {
  const sessionId = parseSessionId(req.url);
  const session = sessions.get(sessionId);
  if (!session) { ws.close(4004, 'Session not found'); return; }

  session.clients.add(ws);
  // Replay buffered output so the UI catches up
  session.dataBuffer.forEach(chunk => ws.send(chunk));

  ws.on('message', (data) => session.pty.write(data));
  ws.on('close', () => session.clients.delete(ws));  // remove socket, keep PTY alive
});
```

This is distinct from the naive "one PTY per connection, kill on disconnect" pattern used in most tutorials, which is inappropriate for persistent sessions.

### 3. Session Switching Without Killing Processes

Session switching is a purely client-side operation when the architecture above is in place. The browser:

1. Closes the current WebSocket connection (`ws.close()`).
2. Opens a new WebSocket connection with the target `sessionId` in the URL.
3. The server removes the socket from session A's client set (step above) and adds it to session B's client set.
4. Both PTY processes remain alive; only the socket routing changes.

The xterm.js issue tracker confirms this pattern: the key insight from maintainers is that the PTY process is preserved as long as the server does not destroy it on disconnect. A rolling output buffer (a fixed-size deque, e.g., last 10,000 lines) lets the reconnecting client receive any output produced while the browser was on a different session, giving the illusion of seamless continuity.

### 4. Resource and Memory Limits

node-pty spawns real OS processes. Each PTY session on Windows (via ConPTY, available on Windows 1809+) consumes:

- One Windows ConPTY handle plus a child process (the shell/CLI being driven).
- File descriptors for the pipe pair.
- Memory for the shell process itself (for a Node.js-based CLI like Claude Code, this is significant — expect 50–150 MB per child process on top of the PTY overhead).

The node-pty README explicitly warns: **node-pty is not thread-safe** and must not be used across multiple worker threads. All PTY operations must remain on the main Node.js thread (or a single dedicated thread).

Node.js itself on a 64-bit Windows system defaults to a ~1.4 GB heap before OOM, adjustable with `--max-old-space-size`. With N heavy CLI child processes plus a Node.js server, the binding resource is OS memory and file descriptors, not the Node.js heap. For a localhost app managing a small number of projects (e.g., 5–20), this is not a practical constraint.

For scale beyond ~50 concurrent PTY sessions, community practice (seen in tools like wetty and ttyd) is to delegate persistence to `tmux` or `screen` rather than managing raw PTY lifecycles in application code. ttyd, for instance, maps each WebSocket connection to a new process, relying on tmux for session reattachment. For a single-user localhost app, this is unnecessary overhead.

---

## Key Takeaways

- Use `Map<sessionId, { pty, dataBuffer, clients: Set<WebSocket> }>` as the server-side session registry. PTY lifecycle must be independent of WebSocket lifecycle — never destroy the PTY on socket close.
- Session switching is client-initiated: close the current WebSocket, open a new one with the target sessionId. The server re-routes by adding/removing sockets from the session's client set. A rolling output buffer allows the newly connected client to replay missed output.
- node-pty is not thread-safe; keep all PTY operations on the main thread. Resource consumption per session is dominated by the child process (shell or CLI), not the PTY pipe itself. For a small N (under 20 sessions), Windows ConPTY handles this without configuration tuning.

---

## Implications for This Project

The Node.js + Express + ws server should maintain a `sessions` Map on startup and never destroy a PTY entry just because its WebSocket client disconnects. When the user switches projects in the browser, the React client closes the old WebSocket and opens a new one with the new project's sessionId — both Claude Code processes stay alive. A rolling output buffer (fixed-size array or circular buffer, e.g., 5,000–10,000 lines) per session is essential so switching back to a project replays recent terminal output. Because each session runs a full Claude Code CLI process, memory budgeting should assume 100–200 MB per active session on Windows — with 5 projects open simultaneously, this is 500 MB–1 GB of child process memory, well within typical developer machine capacity but worth surfacing in documentation.

---

## Sources

- Efficient and Scalable Usage of Node.js PTY with Socket.io for Multiple Users: https://medium.com/@deysouvik700/efficient-and-scalable-usage-of-node-js-pty-with-socket-io-for-multiple-users-402851075c4a
- Creating A Browser-based Interactive Terminal (Using XtermJS And NodeJS): https://www.eddymens.com/blog/creating-a-browser-based-interactive-terminal-using-xtermjs-and-nodejs
- How to Create Web-Based Terminals (DEV Community): https://dev.to/saisandeepvaddi/how-to-create-web-based-terminals-38d
- Web Terminal with Xterm.JS, node-pty and WebSockets: https://ashishpoudel.substack.com/p/web-terminal-with-xtermjs-node-pty
- microsoft/node-pty — Fork pseudoterminals in Node.JS: https://github.com/microsoft/node-pty
- xterm.js issue #677 — Reconnect with same PWD: https://github.com/xtermjs/xterm.js/issues/677
- xterm.js issue #1301 — demo application and websocket heartbeats: https://github.com/xtermjs/xterm.js/issues/1301
- tsl0922/ttyd — Share your terminal over the web: https://github.com/tsl0922/ttyd
- Node.js Memory Limits — What You Should Know (AppSignal): https://blog.appsignal.com/2021/12/08/nodejs-memory-limits-what-you-should-know.html
