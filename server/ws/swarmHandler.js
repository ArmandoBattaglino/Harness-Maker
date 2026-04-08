// server/ws/swarmHandler.js
// WebSocket handler for swarm execution updates.
// Clients connect with ?executionId=<uuid> to subscribe to live execution events.
// Task #48.1 — channel routing + connection management.
// Task #48.2 — broadcast() export + wired to SwarmEngine.

// ---------------------------------------------------------------------------
// Module-level subscriber registry
// executionId (string) -> Set<WebSocket>
// ---------------------------------------------------------------------------
const _subscribers = new Map();

/**
 * Return the subscriber Set for a given executionId.
 * Returns an empty Set (not stored) if no subscribers exist.
 *
 * @param {string} executionId
 * @returns {Set<WebSocket>}
 */
export function getSubscribers(executionId) {
  return _subscribers.get(executionId) ?? new Set();
}

/**
 * Send a JSON event to all open WebSocket subscribers for a given executionId.
 * Connections whose readyState is not OPEN (1) are skipped silently.
 *
 * @param {string} executionId
 * @param {object} event  — must be JSON-serialisable
 */
export function broadcast(executionId, event) {
  const subs = getSubscribers(executionId);
  const msg = JSON.stringify(event);
  for (const ws of subs) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(msg);
    }
  }
}

/**
 * Handle an incoming WebSocket connection on the /ws/swarm path.
 *
 * @param {import('ws').WebSocket} ws
 * @param {import('http').IncomingMessage} req
 * @param {import('../services/SwarmEngine.js').default} swarmEngine
 */
export default function handleSwarmConnection(ws, req, swarmEngine) {
  // 1. Parse executionId from query string
  let executionId;
  try {
    const url = new URL(req.url, 'http://localhost');
    executionId = url.searchParams.get('executionId');
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Bad request URL' }));
    ws.close();
    return;
  }

  // 2. Require executionId
  if (!executionId) {
    ws.send(JSON.stringify({ type: 'error', message: 'executionId required' }));
    ws.close();
    return;
  }

  // 3. Require an execution snapshot before subscribing so reconnects only bind
  //    to canonical running or terminal executions that the server still knows.
  const status = swarmEngine.getStatus(executionId);
  const execution = swarmEngine.getExecution?.(executionId) ?? null;
  if (!status || !execution) {
    ws.send(JSON.stringify({ type: 'error', message: 'Execution not found' }));
    ws.close();
    return;
  }


  // 4. Add ws to per-execution subscriber set
  if (!_subscribers.has(executionId)) {
    _subscribers.set(executionId, new Set());
  }
  _subscribers.get(executionId).add(ws);

  // 5. Handle connection close — remove ws from subscriber set
  ws.on('close', () => {
    const set = _subscribers.get(executionId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        _subscribers.delete(executionId);
      }
    }
  });

  // 6. Handle connection error — remove ws from subscriber set, log error
  ws.on('error', (err) => {
    console.error(
      `[SwarmWS] WebSocket error — executionId=${executionId} message=${err.message}`
    );
    const set = _subscribers.get(executionId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        _subscribers.delete(executionId);
      }
    }
  });

  // 7. Send initial snapshot so reconnecting clients can fully hydrate state.
  ws.send(JSON.stringify({
    type: 'execution_status',
    ...status,
    workflowDef: execution.workflowDef ?? null,
  }));
}
