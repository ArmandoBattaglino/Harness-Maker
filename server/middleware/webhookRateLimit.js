// server/middleware/webhookRateLimit.js
// SEC-V3-04: Stricter rate limiter for webhook ingestion endpoints.
// Allows 10 requests per minute per IP, compared to the global 200 req/min
// limit applied to /api/v1/* in server/index.js.
//
// This will be imported and applied in server/routes/triggers.js (Task #75).
// Reuses the same in-memory pattern as server/index.js — no new dependencies.
//
// Usage in triggers.js:
//   import webhookRateLimit from '../middleware/webhookRateLimit.js';
//   router.post('/webhooks/:path', webhookRateLimit, webhookLimit, handler);

const _webhookRateLimitMap = new Map();
const WEBHOOK_MAX_REQUESTS = 10;
const WEBHOOK_WINDOW_MS = 60000; // 1 minute

// Periodic sweep to prevent memory leak — mirrors the pattern in server/index.js.
// Only runs when this module is imported (i.e., when triggers.js is loaded).
const _sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of _webhookRateLimitMap) {
    if (now > record.resetAt) {
      _webhookRateLimitMap.delete(ip);
    }
  }
}, 60000);
_sweepInterval.unref();

/**
 * Express middleware that enforces 10 requests per minute per IP.
 * Returns HTTP 429 when the limit is exceeded.
 */
export default function webhookRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const record = _webhookRateLimitMap.get(ip) || { count: 0, resetAt: now + WEBHOOK_WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WEBHOOK_WINDOW_MS;
  }

  record.count++;
  _webhookRateLimitMap.set(ip, record);

  if (record.count > WEBHOOK_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many webhook requests' });
  }
  return next();
}
