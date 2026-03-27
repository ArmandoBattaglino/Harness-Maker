// server/middleware/hitlValidation.js
// SEC-V3-05: HITL (Human-in-the-Loop) resume text size cap — 8 KB.
// This validation middleware will be imported in server/routes/inbox.js (Task #68).
// Prevents injection of large payloads into running PTY sessions via the HITL
// approve/resume endpoint.

const RESUME_TEXT_MAX_LENGTH = 8192; // 8 KB

/**
 * Express middleware that validates the resumeText field in the request body.
 * Returns HTTP 400 if resumeText exceeds 8192 characters.
 * Calls next() if the field is absent or within the size limit.
 *
 * Usage in inbox.js:
 *   import { validateResumeText } from '../middleware/hitlValidation.js';
 *   router.post('/resume/:id', csrfMiddleware, validateResumeText, handler);
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateResumeText(req, res, next) {
  if (req.body?.resumeText && req.body.resumeText.length > RESUME_TEXT_MAX_LENGTH) {
    return res.status(400).json({ error: 'resumeText exceeds 8KB limit' });
  }
  next();
}
