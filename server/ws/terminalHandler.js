// server/ws/terminalHandler.js
// WebSocket handler for PTY terminal sessions.
// Wires incoming WebSocket connections to SessionManager without coupling
// PTY lifetime to WebSocket lifetime.

import { sessionManager } from '../services/SessionManager.js';

// -------------------------------------------------------------------------
// setupTerminalWebSocket
// Called once at startup with the WebSocketServer instance.
// -------------------------------------------------------------------------
export function setupTerminalWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    // Parse sessionId from URL query string: ws://host/terminal?sessionId=<uuid>
    let sessionId;
    try {
      const url = new URL(req.url, 'ws://x');
      sessionId = url.searchParams.get('sessionId');
    } catch {
      ws.close(4004, 'Bad request URL');
      return;
    }

    if (!sessionId) {
      ws.close(4004, 'sessionId query parameter is required');
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      ws.close(4004, 'Session not found');
      return;
    }

    if (session.status !== 'active') {
      ws.close(4001, 'Session is not active');
      return;
    }

    // Attach client — this also replays the ring buffer immediately
    sessionManager.attachClient(sessionId, ws);

    // -----------------------------------------------------------------------
    // Incoming messages from the browser terminal
    // -----------------------------------------------------------------------
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        // Unparseable message — ignore silently
        return;
      }

      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'input') {
        if (typeof msg.data !== 'string') return;
        sessionManager.writeInput(sessionId, msg.data);
      } else if (msg.type === 'resize') {
        const cols = parseInt(msg.cols, 10);
        const rows = parseInt(msg.rows, 10);
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
        if (cols < 1 || cols > 1000 || rows < 1 || rows > 1000) return;
        sessionManager.resizePty(sessionId, cols, rows);
      }
      // Unknown message types are silently dropped
    });

    // -----------------------------------------------------------------------
    // WebSocket close — detach client but DO NOT kill the PTY
    // -----------------------------------------------------------------------
    ws.on('close', () => {
      sessionManager.detachClient(sessionId, ws);
    });

    // -----------------------------------------------------------------------
    // WebSocket error — log error type only (SEC-08), then detach
    // -----------------------------------------------------------------------
    ws.on('error', (err) => {
      console.error(
        `[TerminalWS] WebSocket error — sessionId=${sessionId} type=${err.constructor.name}`
      );
      sessionManager.detachClient(sessionId, ws);
    });
  });
}
