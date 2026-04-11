// client/src/utils/modelContextLimits.js
// Maps model identifiers to their maximum context window size (in tokens).

const MODEL_CONTEXT_LIMITS = {
  // Claude family — 200k context
  opus: 200_000,
  sonnet: 200_000,
  haiku: 200_000,

  // Codex / GPT family — 200k context
  'gpt-5.4': 200_000,
  'gpt-5.1-codex': 200_000,
  'gpt-4.1-codex': 200_000,

  // Gemini family — 1M context
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
};

const PROVIDER_DEFAULTS = {
  claude: 200_000,
  codex: 200_000,
  gemini: 1_000_000,
};

/**
 * Return the maximum context window size (tokens) for a given model,
 * or null if the model is unknown / empty.
 *
 * @param {string} [model]    - node-level model name (e.g. "sonnet", "gpt-5.4")
 * @param {string} [provider] - runtime provider fallback ("claude" | "codex" | "gemini")
 */
export function getModelContextLimit(model, provider) {
  if (model) {
    const key = String(model).trim().toLowerCase();
    if (key && MODEL_CONTEXT_LIMITS[key] !== undefined) return MODEL_CONTEXT_LIMITS[key];
    if (key.startsWith('claude-')) return 200_000;
    if (key.startsWith('gpt-')) return 200_000;
    if (key.startsWith('gemini-')) return 1_000_000;
  }

  // Fallback: use the runtime provider when node model is empty
  if (provider) {
    const p = String(provider).trim().toLowerCase();
    if (PROVIDER_DEFAULTS[p] !== undefined) return PROVIDER_DEFAULTS[p];
  }

  return null;
}
