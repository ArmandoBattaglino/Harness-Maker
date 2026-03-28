// server/routes/triggers.js
// Trigger management endpoints for webhooks and RSS polling.
//
// POST /api/v1/triggers/webhooks/:path    → webhook receiver (SEC-V3-01, -04)
// GET  /api/v1/triggers                   → list all triggers

import { Router } from 'express';
import express from 'express';

/**
 * In-memory rate limiter for webhook endpoints specifically.
 * 10 req/min per IP (SEC-V3-04).
 * Keyed by IP + 'webhook' scope to separate from global rate limiter.
 * @type {Map<string, { count: number, resetAt: number }>}
 */
const _webhookRateLimitMap = new Map();

function webhookRateLimit(maxRequests = 10, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const key = `webhook:${ip}`;
    const now = Date.now();
    const record = _webhookRateLimitMap.get(key) || {
      count: 0,
      resetAt: now + windowMs,
    };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;
    _webhookRateLimitMap.set(key, record);

    if (record.count > maxRequests) {
      return res.status(429).json({ error: 'Too many webhook requests' });
    }
    return next();
  };
}

// Periodic sweep of stale webhook rate-limit entries to prevent memory leak.
// Entries whose window has expired are no longer needed — delete them.
const _webhookRateLimitSweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of _webhookRateLimitMap) {
    if (now > record.resetAt) {
      _webhookRateLimitMap.delete(key);
    }
  }
}, 60_000);
_webhookRateLimitSweepInterval.unref();

/**
 * Factory function — returns an Express router with trigger endpoints.
 *
 * @param {import('../services/TriggerManager.js').default} triggerManager
 * @returns {Router}
 */
export default function triggersRouter(triggerManager) {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /api/v1/triggers/webhooks/:path
  // Webhook receiver endpoint.
  // - External caller: NOT CSRF-protected (no X-Requested-With header expected)
  // - Rate limited: 10 req/min per IP (SEC-V3-04)
  // - Body size limit: 32 KB (SEC-V3-01)
  // - Always returns 200 { received: true } for external visibility
  // -------------------------------------------------------------------------
  router.post(
    '/webhooks/:path',
    express.json({ limit: '32kb' }),
    webhookRateLimit(10, 60000),
    async (req, res) => {
      try {
        const { path } = req.params;
        const payload = req.body || {};

        // Validate path is a non-empty string
        if (!path || typeof path !== 'string') {
          // Still return 200 to avoid revealing internal structure to external callers
          return res.status(200).json({ received: true });
        }

        // Handle the webhook — find registration and start/inject execution
        await triggerManager.handleWebhook(path, payload);

        // Always return 200 — external caller cannot know if matched or not (SEC)
        return res.status(200).json({ received: true });
      } catch (err) {
        // Log error but still return 200 to external caller
        console.error(`[triggers] POST /webhooks/:path error: ${err.message}`);
        return res.status(200).json({ received: true });
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/v1/triggers
  // List all currently registered triggers (webhooks + RSS pollers).
  // Internal UI endpoint: CSRF-protected.
  // → 200 { triggers: { webhooks: [], rssPollers: [] } }
  // -------------------------------------------------------------------------
  router.get('/', (req, res) => {
    try {
      const triggers = triggerManager.listTriggers();
      return res.json({ triggers });
    } catch (err) {
      console.error(`[triggers] GET / error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
