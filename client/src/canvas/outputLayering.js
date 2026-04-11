const OUTPUT_LAYER_Z_OFFSET = 2000;

export function applyExpandedOutputLayering(nodes, expandedOutputNodeId) {
  if (!expandedOutputNodeId) {
    return nodes;
  }

  let maxExistingZ = 0;

  for (const node of nodes) {
    if (node.id === expandedOutputNodeId) {
      continue;
    }

    const nodeZ = Number.isFinite(node?.zIndex) ? node.zIndex : 0;
    if (nodeZ > maxExistingZ) {
      maxExistingZ = nodeZ;
    }
  }

  const elevatedZ = maxExistingZ + OUTPUT_LAYER_Z_OFFSET;
  let hasChanges = false;

  const layeredNodes = nodes.map((node) => {
    if (node.id !== expandedOutputNodeId) {
      return node;
    }

    const currentZ = Number.isFinite(node?.zIndex) ? node.zIndex : 0;
    const nextZ = Math.max(currentZ, elevatedZ);

    if (nextZ === currentZ) {
      return node;
    }

    hasChanges = true;
    return {
      ...node,
      zIndex: nextZ,
    };
  });

  return hasChanges ? layeredNodes : nodes;
}
