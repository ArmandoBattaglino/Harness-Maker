import semver from 'semver';

export const PACK_ENGINE_VERSION = '1.0.0';

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
  async resolveFromStores({ packId, packStore, workflowStore, input = {}, projectId, projectPath }) {
    if (!packStore || typeof packStore.get !== 'function') {
      const err = new Error('Pack store unavailable');
      err.statusCode = 503;
      throw err;
    }
    const pack = await packStore.get(packId);
    if (!pack) {
      const err = new Error('Pack not found');
      err.statusCode = 404;
      throw err;
    }
    const workflow = workflowStore && typeof workflowStore.get === 'function'
      ? await workflowStore.get(pack.workflowId)
      : null;
    if (!workflow) {
      const err = new Error('Linked workflow not found');
      err.statusCode = 400;
      throw err;
    }
    return {
      ...this.resolveForRun(pack, { input, projectId, projectPath, workflow }),
      pack,
      workflow,
    };
  }

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
    this._validateEngineCompatibility(pack);
    this._validateRequiredDependencies(pack);

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

  _validateEngineCompatibility(pack) {
    const range = String(pack.engineCompatibility ?? '').trim();
    if (range && range !== 'latest' && !semver.satisfies(PACK_ENGINE_VERSION, range)) {
      const err = new Error(`Pack requires engineCompatibility ${range}, current pack engine is ${PACK_ENGINE_VERSION}`);
      err.statusCode = 409;
      err.code = 'PACK_ENGINE_INCOMPATIBLE';
      throw err;
    }
  }

  _validateRequiredDependencies(pack) {
    const dependencies = Array.isArray(pack.dependencies) ? pack.dependencies : [];
    const workflowDependency = dependencies.find((dependency) => dependency?.type === 'workflow' && dependency?.targetId === pack.workflowId);
    if (!workflowDependency) {
      const err = new Error('Pack is missing its required workflow dependency');
      err.statusCode = 400;
      err.code = 'PACK_DEPENDENCY_MISSING';
      throw err;
    }
    const missingRequired = dependencies.filter((dependency) => dependency?.required && !dependency?.targetId);
    if (missingRequired.length > 0) {
      const err = new Error('Pack has unsatisfied required dependencies');
      err.statusCode = 400;
      err.code = 'PACK_DEPENDENCY_MISSING';
      throw err;
    }
  }
}

export default PackResolver;
