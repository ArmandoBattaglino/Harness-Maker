// Generate node IDs matching WorkflowStore NODE_ID_REGEX: ^[a-z][a-z0-9-]*$
// Uses crypto.randomUUID() (available in all modern browsers) instead of uuid package.

export function generateNodeId(type = 'agent') {
  const short = crypto.randomUUID().split('-')[0]; // 8 hex chars
  // Convert camelCase to kebab-case (e.g. errorHandler → error-handler)
  const kebab = type.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  return `${kebab}-${short}`;
}
