// Strip React Flow internal fields before saving workflow definitions.
// React Flow adds runtime fields like `measured`, `width`, `height`, `selected`,
// `dragging`, `positionAbsolute` etc. to nodes — these must not be persisted.
import { normalizeVisualInputNodeType } from './visualIoContracts.js';

export function sanitizeWorkflow(workflowDef) {
  return {
    ...workflowDef,
    nodes: (workflowDef.nodes ?? []).map((n) => ({
      id: n.id,
      type: normalizeVisualInputNodeType(n.type),
      position: { x: n.position.x, y: n.position.y },
      data: { ...n.data },
      ...(n.parentId ? { parentId: n.parentId } : {}),
    })),
    edges: (workflowDef.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type || 'handoff',
      ...(e.data ? { data: { ...e.data } } : {}),
    })),
  };
}
