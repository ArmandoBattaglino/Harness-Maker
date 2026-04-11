function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortBehaviorRules(rules = []) {
  return [...rules].sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return deepClone(value);
}

function appendOverlayValue(existing, incoming) {
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return [...existing, ...clone(incoming)];
  }
  if (Array.isArray(existing)) {
    return [...existing, clone(incoming)];
  }
  if (Array.isArray(incoming)) {
    return [clone(existing), ...clone(incoming)];
  }
  if (typeof existing === 'string' && typeof incoming === 'string') {
    return `${existing}\n${incoming}`;
  }
  return [clone(existing), clone(incoming)];
}

export class PackResolver {
  resolveForRun(pack, { input = {}, projectId, projectPath } = {}) {
    if (!pack) {
      const err = new Error('Pack is required');
      err.statusCode = 400;
      throw err;
    }
    if (!projectId || !projectPath) {
      const err = new Error('projectId and projectPath are required');
      err.statusCode = 400;
      throw err;
    }

    const workflowContextPatch = {
      pack: {
        id: pack.id,
        name: pack.name,
        version: pack.packVersion,
        input: deepClone(input),
        knowledgeSources: deepClone(pack.knowledgeSources ?? []),
        behaviorRules: deepClone(sortBehaviorRules(pack.behaviorRules ?? [])),
        visibleSteps: deepClone(pack.visibleSteps ?? []),
        completionCriteria: deepClone(pack.completionCriteria ?? []),
        projectBinding: {
          projectId,
          projectPath,
        },
      },
    };

    const knowledgeOverlays = {};
    const conflicts = [];
    for (const source of pack.knowledgeSources ?? []) {
      const content = source?.content;
      if (!content || typeof content !== 'object' || Array.isArray(content)) continue;
      if (source.mergeStrategy === 'replace') {
        for (const existingKey of Object.keys(knowledgeOverlays)) {
          delete knowledgeOverlays[existingKey];
        }
        Object.assign(knowledgeOverlays, clone(content));
        continue;
      }
      for (const [key, value] of Object.entries(content)) {
        if (Object.prototype.hasOwnProperty.call(knowledgeOverlays, key)) {
          conflicts.push({
            type: source.mergeStrategy === 'append' ? 'knowledge_append_conflict' : 'knowledge_override_conflict',
            key,
            sourceId: source.id,
          });
        }
        if (source.mergeStrategy === 'append' && Object.prototype.hasOwnProperty.call(knowledgeOverlays, key)) {
          knowledgeOverlays[key] = appendOverlayValue(knowledgeOverlays[key], value);
        } else if (isPlainObject(knowledgeOverlays[key]) && isPlainObject(value)) {
          knowledgeOverlays[key] = {
            ...clone(knowledgeOverlays[key]),
            ...clone(value),
          };
        } else {
          knowledgeOverlays[key] = clone(value);
        }
      }
    }

    workflowContextPatch.packKnowledge = knowledgeOverlays;
    workflowContextPatch.packBehaviorDirectives = sortBehaviorRules(pack.behaviorRules ?? []).map((rule) => ({
      id: rule.id,
      name: rule.name,
      instruction: rule.instruction,
      mode: rule.mode,
      priority: rule.priority,
    }));

    return {
      workflowId: pack.workflowId,
      workflowContextPatch,
      packMetadata: {
        packId: pack.id,
        packName: pack.name,
        packVersion: pack.packVersion,
        visibleSteps: deepClone(pack.visibleSteps ?? []),
        artifactDefinitions: deepClone(pack.artifactDefinitions ?? []),
        outputSchema: deepClone(pack.outputSchema ?? {}),
        runtimePolicy: deepClone(pack.runtimePolicy ?? {}),
        projectBinding: {
          projectId,
          projectPath,
        },
        conflicts,
      },
    };
  }
}

export default PackResolver;
