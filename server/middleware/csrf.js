// server/middleware/csrf.js
// CSRF protection via custom header (DEC-008).
// All mutating methods require: X-Requested-With: ClaudeCodeManager

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUIRED_HEADER_VALUE = 'ClaudeCodeManager';

// Paths exempt from CSRF validation (called by external systems without the custom header)
const CSRF_EXEMPT_PREFIXES = ['/api/v1/triggers/webhooks/'];

export function csrfMiddleware(req, res, next) {
  // Exempt safe methods and WebSocket upgrade requests
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  // Exempt paths that receive external traffic (e.g. webhook receivers)
  const reqPath = req.path || req.url || '';
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => reqPath.startsWith(prefix))) {
    return next();
  }

  // WebSocket upgrades arrive as GET with Upgrade header — already exempt above,
  // but guard explicitly just in case routing changes
  if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
    return next();
  }

  const headerValue = req.headers['x-requested-with'];
  if (headerValue !== REQUIRED_HEADER_VALUE) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  return next();
}
