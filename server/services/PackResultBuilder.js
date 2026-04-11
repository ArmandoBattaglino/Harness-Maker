function getPreferredAgentOutput(pack, agentOutputs = {}) {
  const keys = Object.keys(agentOutputs);
  if (keys.length === 0) return null;

  const visibleSteps = Array.isArray(pack?.visibleSteps) ? pack.visibleSteps : [];
  for (let stepIndex = visibleSteps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = visibleSteps[stepIndex];
    const nodeIds = Array.isArray(step?.nodeIds) ? step.nodeIds : [];
    for (let index = nodeIds.length - 1; index >= 0; index -= 1) {
      const output = agentOutputs[nodeIds[index]];
      if (output?.finalText) {
        return output;
      }
    }
  }

  const artifactNodeId = (pack?.artifactDefinitions ?? [])
    .find((artifact) => artifact.sourceType === 'agentOutput' && artifact.sourceNodeId)?.sourceNodeId;
  if (artifactNodeId && agentOutputs[artifactNodeId]?.finalText) {
    return agentOutputs[artifactNodeId];
  }

  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const output = agentOutputs[keys[index]];
    if (output?.finalText) {
      return output;
    }
  }

  return agentOutputs[keys[keys.length - 1]] ?? null;
}

function readContextValue(executionLike, key) {
  const workflowContext = executionLike?.workflowContext ?? {};
  if (Object.prototype.hasOwnProperty.call(workflowContext, key)) {
    return workflowContext[key];
  }
  if (workflowContext.packOutputs && Object.prototype.hasOwnProperty.call(workflowContext.packOutputs, key)) {
    return workflowContext.packOutputs[key];
  }
  return undefined;
}

export function buildPackArtifacts(pack, executionLike, agentOutputs = {}, aggregatedArtifact = '') {
  return (pack?.artifactDefinitions ?? []).map((artifact) => {
    let value = null;
    if (artifact.sourceType === 'aggregatedArtifact') {
      value = aggregatedArtifact;
    } else if (artifact.sourceType === 'agentOutput') {
      value = agentOutputs[artifact.sourceNodeId ?? '']?.finalText ?? '';
    } else if (artifact.sourceType === 'workflowContext') {
      value = readContextValue(executionLike, artifact.name);
    }
    return {
      id: artifact.id,
      name: artifact.name,
      sourceType: artifact.sourceType,
      sourceNodeId: artifact.sourceNodeId ?? null,
      required: artifact.required !== false,
      value,
    };
  });
}

export function buildPackResult(pack, executionLike, agentOutputs = {}, aggregatedArtifact = '') {
  if (!pack) return null;

  const outputProperties = pack.outputSchema?.properties ?? {};
  const outputs = {};
  const preferredAgentOutput = getPreferredAgentOutput(pack, agentOutputs);
  const finalAgentText = preferredAgentOutput?.finalText ?? '';

  const propertyKeys = Object.keys(outputProperties);
  if (propertyKeys.length === 0) {
    outputs.result = finalAgentText || aggregatedArtifact || '';
  } else {
    for (const key of propertyKeys) {
      const explicitValue = readContextValue(executionLike, key);
      if (explicitValue !== undefined) {
        outputs[key] = explicitValue;
      } else if (key === 'result' || key === 'finalText' || propertyKeys.length === 1) {
        outputs[key] = finalAgentText || aggregatedArtifact || '';
      } else {
        outputs[key] = null;
      }
    }
  }

  return {
    packId: pack.id,
    packVersion: pack.packVersion,
    status: executionLike?.status ?? 'unknown',
    outputs,
    artifacts: buildPackArtifacts(pack, executionLike, agentOutputs, aggregatedArtifact),
    visibleSteps: (pack.visibleSteps ?? []).map((step) => ({
      id: step.id,
      label: step.label,
      description: step.description ?? '',
      nodeIds: Array.isArray(step.nodeIds) ? [...step.nodeIds] : [],
      status: executionLike?.status === 'completed' ? 'completed' : executionLike?.status ?? 'pending',
    })),
  };
}

export default buildPackResult;
