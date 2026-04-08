export const STRUCTURED_SPAWN_MODES = new Set(['stream-json', 'codex-sdk']);

export function isStructuredSpawnMode(mode) {
  return STRUCTURED_SPAWN_MODES.has(mode);
}
