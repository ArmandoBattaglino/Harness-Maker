// useCanvasValidation.js — Pre-run validation for swarm canvas.
// FR-V5-44 through FR-V5-46: validates workflow nodes/edges before execution.
import { useMemo } from 'react';

function createIssue({
  id,
  severity,
  scope,
  nodeId = null,
  summary,
  detail,
}) {
  return {
    id,
    severity,
    scope,
    nodeId,
    summary,
    detail,
    // Backward-compatible alias for older callers/tests that still expect message.
    message: detail,
  };
}

function getNodeLabel(node) {
  return node?.data?.label || node?.id || 'Node';
}

/**
 * Custom hook that validates canvas nodes and edges.
 *
 * @param {Array} nodes - React Flow nodes array
 * @param {Array} edges - React Flow edges array
 * @returns {{
 *   isValid: boolean,
 *   errors: Array,
 *   issues: Array,
 *   globalIssues: Array,
 *   agentIssues: Array,
 *   agentIssuesByNodeId: Record<string, Array>,
 *   blockingIssues: Array,
 * }}
 */
export function useCanvasValidation(nodes, edges) {
  return useMemo(() => {
    const issues = [];
    const agentNodes = nodes.filter((node) => node.type === 'agent');
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incomingTargets = new Set(
      edges
        .filter((edge) => nodeById.get(edge.source)?.type !== 'input' && nodeById.get(edge.target)?.type === 'agent')
        .map((edge) => edge.target)
        .filter(Boolean)
    );
    const explicitStartNodes = agentNodes.filter((node) => node.data?.isTriageNode);
    const rootAgentNodes = agentNodes.filter((node) => !incomingTargets.has(node.id));

    if (agentNodes.length === 0) {
      issues.push(createIssue({
        id: 'workflow:no-agent-nodes',
        severity: 'error',
        scope: 'global',
        summary: 'No agent nodes',
        detail: 'No agent nodes — add at least one agent.',
      }));
    }

    if (explicitStartNodes.length === 0 && rootAgentNodes.length === 0 && agentNodes.length > 0) {
      issues.push(createIssue({
        id: 'workflow:no-start-node',
        severity: 'error',
        scope: 'global',
        summary: 'No start node',
        detail: 'No start node — mark one or more agents as Start Node, or keep at least one root agent with no incoming edges.',
      }));
    }

    if (explicitStartNodes.length === 0 && rootAgentNodes.length > 1) {
      issues.push(createIssue({
        id: 'workflow:multiple-root-agents',
        severity: 'warning',
        scope: 'global',
        summary: 'Multiple root agents auto-start',
        detail: 'Multiple root agents will auto-start together — mark them as Start Node if you want this to stay explicit.',
      }));
    }

    for (const node of nodes) {
      const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
      const nodeLabel = getNodeLabel(node);

      if (node.type === 'agent' && !node.data?.systemPrompt?.trim()) {
        issues.push(createIssue({
          id: `agent:${node.id}:empty-system-prompt`,
          severity: 'warning',
          scope: 'agent',
          nodeId: node.id,
          summary: 'Empty system prompt',
          detail: `${nodeLabel} has an empty system prompt. Add guidance so the agent knows what to do.`,
        }));
      }

      if (node.type === 'trigger') {
        if (node.data?.triggerType === 'webhook' && !node.data?.webhookPath?.trim()) {
          issues.push(createIssue({
            id: `trigger:${node.id}:missing-webhook-path`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} is missing a webhook path`,
            detail: `${nodeLabel} has no webhook path. Add one before running the workflow.`,
          }));
        }

        if (node.data?.triggerType === 'rss' && !node.data?.rssUrl?.trim()) {
          issues.push(createIssue({
            id: `trigger:${node.id}:missing-rss-url`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} is missing an RSS URL`,
            detail: `${nodeLabel} has no RSS URL. Add one before running the workflow.`,
          }));
        }
      }

      if (node.type === 'input') {
        const fields = Array.isArray(node.data?.fields) ? node.data.fields : [];
        if (fields.length === 0) {
          issues.push(createIssue({
            id: `input:${node.id}:no-fields`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} has no input fields`,
            detail: `${nodeLabel} must define at least one field before the workflow can run.`,
          }));
        }
        fields.forEach((field, index) => {
          if (!field?.key?.trim()) {
            issues.push(createIssue({
              id: `input:${node.id}:field-${index}:missing-key`,
              severity: 'error',
              scope: 'global',
              nodeId: node.id,
              summary: `${nodeLabel} has an input field without a key`,
              detail: `${nodeLabel} field ${index + 1} must have a stable key.`,
            }));
          }
        });
        const hasAgentTarget = edges.some((edge) => edge.source === node.id && nodeById.get(edge.target)?.type === 'agent');
        if (!hasAgentTarget) {
          issues.push(createIssue({
            id: `input:${node.id}:not-connected`,
            severity: 'warning',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} is not connected to an agent`,
            detail: `${nodeLabel} will collect input but no agent is connected to receive it.`,
          }));
        }
      }

      if (node.type === 'outputExtractor') {
        const hasAgentSource = edges.some((edge) => edge.target === node.id && nodeById.get(edge.source)?.type === 'agent');
        if (!node.data?.artifactKey?.trim()) {
          issues.push(createIssue({
            id: `output-extractor:${node.id}:missing-artifact-key`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} is missing an artifact key`,
            detail: `${nodeLabel} must define an artifact key.`,
          }));
        }
        if (!hasAgentSource) {
          issues.push(createIssue({
            id: `output-extractor:${node.id}:missing-source`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} has no upstream agent`,
            detail: `${nodeLabel} must be connected from an agent output before the workflow can run.`,
          }));
        }
      }

      if (node.type === 'agent' && connectedEdges.length === 0 && !node.data?.isTriageNode) {
        issues.push(createIssue({
          id: `agent:${node.id}:disconnected`,
          severity: 'warning',
          scope: 'agent',
          nodeId: node.id,
          summary: 'Disconnected agent',
          detail: `${nodeLabel} is disconnected (no edges). Connect it or mark it as a Start Node if it should run alone.`,
        }));
      }

      if (node.type === 'input') {
        const fields = Array.isArray(node.data?.fields) ? node.data.fields : [];
        if (fields.length === 0) {
          issues.push(createIssue({
            id: `input:${node.id}:no-fields`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} has no fields`,
            detail: `${nodeLabel} must define at least one field before it can collect workflow input.`,
          }));
        }
        fields.forEach((field, index) => {
          if (!/^[a-z][a-z0-9_-]*$/.test(field?.key || '')) {
            issues.push(createIssue({
              id: `input:${node.id}:field-${index}:invalid-key`,
              severity: 'error',
              scope: 'global',
              nodeId: node.id,
              summary: `${nodeLabel} has an invalid field key`,
              detail: `${nodeLabel} field ${index + 1} must use a lowercase key like "client_brief".`,
            }));
          }
        });
      }

      if (node.type === 'outputExtractor') {
        const hasIncoming = edges.some((edge) => edge.target === node.id && nodeById.get(edge.source)?.type === 'agent');
        if (!node.data?.artifactKey?.trim() || !node.data?.artifactName?.trim()) {
          issues.push(createIssue({
            id: `outputExtractor:${node.id}:missing-artifact-config`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} artifact is incomplete`,
            detail: `${nodeLabel} must define an artifact key and name.`,
          }));
        }
        if (!hasIncoming) {
          issues.push(createIssue({
            id: `outputExtractor:${node.id}:no-agent-source`,
            severity: 'error',
            scope: 'global',
            nodeId: node.id,
            summary: `${nodeLabel} has no agent source`,
            detail: `${nodeLabel} needs an incoming Agent -> Output Extractor connection.`,
          }));
        }
      }
    }

    for (const edge of edges) {
      const sourceType = nodeById.get(edge.source)?.type;
      const targetType = nodeById.get(edge.target)?.type;
      const isValidVisualIoEdge = (
        (sourceType === 'input' && targetType === 'agent')
        || (sourceType === 'agent' && targetType === 'outputExtractor')
      );
      const isInvalidVisualIoEdge = (
        sourceType === 'input'
        || sourceType === 'outputExtractor'
        || targetType === 'input'
        || targetType === 'outputExtractor'
      ) && !isValidVisualIoEdge;
      if (isInvalidVisualIoEdge) {
        issues.push(createIssue({
          id: `edge:${edge.id || `${edge.source}-${edge.target}`}:invalid-visual-io`,
          severity: 'error',
          scope: 'global',
          summary: 'Invalid visual I/O edge',
          detail: 'Input blocks may connect only to agents, and Output Extractors may receive only agent outputs.',
        }));
      }
    }

    const globalIssues = issues.filter((issue) => issue.scope === 'global');
    const agentIssues = issues.filter((issue) => issue.scope === 'agent');
    const agentIssuesByNodeId = agentIssues.reduce((acc, issue) => {
      if (!issue.nodeId) return acc;
      acc[issue.nodeId] = [...(acc[issue.nodeId] || []), issue];
      return acc;
    }, {});
    const blockingIssues = globalIssues.filter((issue) => issue.severity === 'error');

    return {
      isValid: blockingIssues.length === 0,
      errors: issues,
      issues,
      globalIssues,
      agentIssues,
      agentIssuesByNodeId,
      blockingIssues,
    };
  }, [nodes, edges]);
}
