// server/utils/frontmatter.js
// YAML frontmatter parse / serialize helpers used by agents, skills, and claudemd routes.
// Format expected:  ---\n<yaml>\n---\n<body>
// Windows line endings (\r\n) are handled in the regex.

import yaml from 'js-yaml';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Frontmatter parse
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter: object, body: string }.
 * If no frontmatter block is found, returns { frontmatter: {}, body: content }.
 *
 * @param {string} content
 * @returns {{ frontmatter: object, body: string }}
 */
export function parseFrontmatter(content) {
  // Match both \n and \r\n line endings
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m);
  if (!match) return { frontmatter: {}, body: content };

  let frontmatter = {};
  try {
    frontmatter = yaml.load(match[1]) || {};
  } catch {
    // Malformed YAML — treat as empty frontmatter, preserve body
    frontmatter = {};
  }

  return { frontmatter, body: match[2] };
}

// ---------------------------------------------------------------------------
// Frontmatter serialize
// ---------------------------------------------------------------------------

/**
 * Serialize frontmatter object + body back to a markdown string.
 *
 * @param {object} frontmatter
 * @param {string} body
 * @returns {string}
 */
export function serializeFrontmatter(frontmatter, body) {
  const yamlBlock = yaml.dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlBlock}---\n${body}`;
}

// ---------------------------------------------------------------------------
// Stable entity ID from file path
// ---------------------------------------------------------------------------

/**
 * Derive a stable 16-character hex ID from an absolute file path.
 * The same file always produces the same ID (deterministic).
 *
 * @param {string} filePath - absolute path
 * @returns {string} 16 hex chars
 */
export function filePathToId(filePath) {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}
