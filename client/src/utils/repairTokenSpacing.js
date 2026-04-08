// client/src/utils/repairTokenSpacing.js
// Repair BPE token-boundary spacing from Claude CLI stream-json output.
// Sub-word tokens can carry leading whitespace, producing "con su ma t or e"
// instead of "consumatore". Also repairs camelCase splitting like "Java Script".

/**
 * Merge runs of short lowercase fragments (1-3 chars) separated by single
 * spaces where at least one fragment is a single character, suggesting
 * artificial sub-word token boundaries.
 */
export function repairTokenSplitting(text) {
  return text.replace(
    /(?<![a-zA-Z\u00C0-\u00FF])([a-z\u00E0-\u00FF]{1,3})((?:\s[a-z\u00E0-\u00FF]{1,3}){2,})(?![a-zA-Z\u00C0-\u00FF])/g,
    (match, first, rest) => {
      const segments = [first, ...rest.trim().split(/\s+/)];
      const hasSingleChar = segments.some((s) => s.length === 1);
      if (!hasSingleChar) return match;
      const merged = segments.join('');
      if (merged.length >= 5) return merged;
      return match;
    }
  );
}

/**
 * Repair camelCase token splitting: "Java Script" → "JavaScript",
 * "high Water Mark" → "highWaterMark".
 */
export function repairCamelCaseSplitting(text) {
  return text.replace(
    /\b([a-z][a-z\d]*)\s+([A-Z][a-z\d]*(?:\s+[A-Z][a-z\d]*)*)\b/g,
    (match, lower, upperParts) => {
      const parts = upperParts.split(/\s+/);
      if (parts.every((p) => p.length <= 10)) {
        return lower + parts.join('');
      }
      return match;
    }
  );
}

/**
 * Apply all token-spacing repairs to text.
 */
export function repairAllTokenSpacing(text) {
  if (!text) return text;
  let result = repairTokenSplitting(text);
  result = repairCamelCaseSplitting(result);
  return result;
}
