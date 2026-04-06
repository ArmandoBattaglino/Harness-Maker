// Generate node IDs matching WorkflowStore NODE_ID_REGEX: ^[a-z][a-z0-9-]*$
// Uses crypto.randomUUID() (available in all modern browsers) instead of uuid package.

export function generateNodeId(type = 'agent') {
  const short = crypto.randomUUID().split('-')[0]; // 8 hex chars
  return `${type}-${short}`;
}
