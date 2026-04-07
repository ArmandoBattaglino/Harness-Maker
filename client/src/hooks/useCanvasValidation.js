// useCanvasValidation.js — Pre-run validation for swarm canvas.
// FR-V5-44 through FR-V5-46: validates workflow nodes/edges before execution.
import { useMemo } from 'react';

/**
 * Custom hook that validates canvas nodes and edges.
 *
 * @param {Array} nodes — React Flow nodes array
 * @param {Array} edges — React Flow edges array
 * @returns {{ isValid: boolean, errors: Array<{ nodeId?: string, message: string, severity: 'error'|'warning' }> }}
 */
export function useCanvasValidation(nodes, edges) {
  return useMemo(() => {
    const errors = [];
    const agentNodes = nodes.filter((n) => n.type === 'agent');
    const incomingTargets = new Set(edges.map((edge) => edge.target).filter(Boolean));
    const explicitStartNodes = agentNodes.filter((n) => n.data?.isTriageNode);
    const rootAgentNodes = agentNodes.filter((n) => !incomingTargets.has(n.id));

    // Rule 1: At least one agent node exists
    if (agentNodes.length === 0) {
      errors.push({ message: 'No agent nodes — add at least one agent', severity: 'error' });
    }

    // Rule 2: Start resolution must be possible.
    // Explicit start/triage nodes win; otherwise root agents auto-start together.
    if (explicitStartNodes.length === 0 && rootAgentNodes.length === 0 && agentNodes.length > 0) {
      errors.push({
        message: 'No start node — mark one or more agents as Start Node, or keep at least one root agent with no incoming edges',
        severity: 'error',
      });
    }

    if (explicitStartNodes.length === 0 && rootAgentNodes.length > 1) {
      errors.push({
        message: 'Multiple root agents will auto-start together — mark them as Start Node if you want this to stay explicit',
        severity: 'warning',
      });
    }

    // Check each node
    for (const node of nodes) {
      const connectedEdges = edges.filter(
        (e) => e.source === node.id || e.target === node.id
      );

      // Rule 3: Agent nodes have non-empty systemPrompt (warning)
      if (node.type === 'agent' && !node.data?.systemPrompt?.trim()) {
        errors.push({
          nodeId: node.id,
          message: `${node.data?.label || node.id}: empty system prompt`,
          severity: 'warning',
        });
      }

      // Rule 4: Trigger nodes have valid config
      if (node.type === 'trigger') {
        if (node.data?.triggerType === 'webhook' && !node.data?.webhookPath?.trim()) {
          errors.push({
            nodeId: node.id,
            message: `${node.data?.label || node.id}: no webhook path`,
            severity: 'error',
          });
        }
        if (node.data?.triggerType === 'rss' && !node.data?.rssUrl?.trim()) {
          errors.push({
            nodeId: node.id,
            message: `${node.data?.label || node.id}: no RSS URL`,
            severity: 'error',
          });
        }
      }

      // Rule 5: No completely disconnected agent nodes (warning)
      if (node.type === 'agent' && connectedEdges.length === 0 && !node.data?.isTriageNode) {
        errors.push({
          nodeId: node.id,
          message: `${node.data?.label || node.id}: disconnected (no edges)`,
          severity: 'warning',
        });
      }
    }

    return { isValid: errors.filter((e) => e.severity === 'error').length === 0, errors };
  }, [nodes, edges]);
}
