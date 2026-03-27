// server/middleware/webhookLimit.js
// SEC-V3-01: Webhook body size cap — 32 KB.
// This middleware will be imported and applied in server/routes/triggers.js (Task #75).
// Limits the JSON body parser to 32 KB for any webhook ingestion route to prevent
// memory exhaustion via oversized payloads from untrusted external callers.

import express from 'express';

/**
 * Express JSON body-parser middleware limited to 32 KB.
 * Apply before any route that receives webhook payloads.
 *
 * Usage in triggers.js:
 *   import webhookLimit from '../middleware/webhookLimit.js';
 *   router.post('/webhooks/:path', webhookLimit, handler);
 */
const webhookLimit = express.json({ limit: '32kb' });

export default webhookLimit;
