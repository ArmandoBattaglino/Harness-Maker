// server/middleware/hitlValidation.js
// SEC-V3-05: HITL (Human-in-the-Loop) resume text size cap — 8 KB.
// V13.1: Also validates selectedOptions array for multiple-choice HITL.

const RESUME_TEXT_MAX_LENGTH = 8192; // 8 KB
const SELECTED_OPTIONS_MAX_COUNT = 50;
const SELECTED_OPTION_MAX_LENGTH = 500;

/**
 * Express middleware that validates resumeText and selectedOptions in the request body.
 * - resumeText: optional string, max 8192 chars
 * - selectedOptions: optional array of strings, max 50 items, each max 500 chars
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateResumeText(req, res, next) {
  if (req.body?.resumeText && req.body.resumeText.length > RESUME_TEXT_MAX_LENGTH) {
    return res.status(400).json({ error: 'resumeText exceeds 8KB limit' });
  }

  const opts = req.body?.selectedOptions;
  if (opts !== undefined && opts !== null) {
    if (!Array.isArray(opts)) {
      return res.status(400).json({ error: 'selectedOptions must be an array of strings' });
    }
    if (opts.length > SELECTED_OPTIONS_MAX_COUNT) {
      return res.status(400).json({ error: `selectedOptions exceeds ${SELECTED_OPTIONS_MAX_COUNT} items` });
    }
    for (let i = 0; i < opts.length; i++) {
      if (typeof opts[i] !== 'string') {
        return res.status(400).json({ error: `selectedOptions[${i}] must be a string` });
      }
      if (opts[i].length > SELECTED_OPTION_MAX_LENGTH) {
        return res.status(400).json({ error: `selectedOptions[${i}] exceeds ${SELECTED_OPTION_MAX_LENGTH} chars` });
      }
    }
  }

  next();
}
