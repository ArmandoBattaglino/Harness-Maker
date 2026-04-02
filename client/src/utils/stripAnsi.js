// client/src/utils/stripAnsi.js
// Removes ANSI/VT escape sequences from terminal output strings so they can
// be displayed as plain text in non-terminal React elements.

// Comprehensive ANSI escape sequence regex:
//   - CSI sequences:           \x1b[ ... <final byte a-zA-Z>   (includes SGR, cursor, erase, etc.)
//   - OSC sequences:           \x1b] ... \x07  (window title, hyperlinks, etc.)
//   - Character-set sequences: \x1b( or \x1b) followed by designator character
//   - Other 2-byte ESC seqs:   \x1b followed by any non-[ character
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[^[\]()]/g;

/**
 * Strip all ANSI escape sequences from a string and normalize line endings.
 *
 * @param {string} str - Raw terminal output string, possibly containing ANSI codes.
 * @returns {string} Clean text with escape sequences removed.
 */
export function stripAnsi(str) {
  if (!str) return str;
  return str
    .replace(ANSI_RE, '')  // remove all ANSI escape codes
    .replace(/\r\n/g, '\n') // normalize Windows line endings
    .replace(/\r/g, '\n');  // normalize bare carriage returns
}
