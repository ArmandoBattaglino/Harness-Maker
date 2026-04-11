import { Router } from 'express';

import PackResolver from '../services/PackResolver.js';
import buildPackResult from '../services/PackResultBuilder.js';
import { validateValueAgainstSchema } from '../services/packContracts.js';

const router = Router();
const packResolver = new PackResolver();

function respondKnownRouteError(res, err) {
  if (!err || !Number.isInteger(err.statusCode)) return false;
  return res.status(err.statusCode).json({ error: err.message });
}

function getPackStore(req) {
  const store = req.app.locals.packStore;
  if (!store) {
    const err = new Error('Pack service unavailable');
    err.statusCode = 503;
    throw err;
  }
  return store;
}

function getSwarmEngine(req) {
  const engine = req.app.locals.swarmEngine;
  if (!engine) {
    const err = new Error('Swarm service unavailable');
    err.statusCode = 503;
    throw err;
  }
  return engine;
}

function readPack(req) {
  return req.body?.pack && typeof req.body.pack === 'object'
    ? req.body.pack
    : (req.body ?? {});
}

function validateInputAgainstSchema(inputSchema = {}, input = {}) {
  return validateValueAgainstSchema(inputSchema, input, 'input', []);
}

function evaluateFixtureAssertions(fixture, runPayload = {}) {
  const status = runPayload.status ?? 'completed';
  const outputs = runPayload.outputs ?? {};
  const artifacts = Array.isArray(runPayload.artifacts) ? runPayload.artifacts : [];
  return (fixture.assertions ?? []).map((assertion) => {
    let passed = false;
    if (assertion.type === 'statusEquals') {
      passed = status === assertion.expected;
    } else if (assertion.type === 'outputIncludes') {
      const value = String(outputs[assertion.outputKey ?? 'result'] ?? '');
      passed = value.includes(assertion.expected ?? '');
    } else if (assertion.type === 'artifactExists') {
      passed = artifacts.some((artifact) => artifact.id === assertion.artifactId || artifact.name === assertion.artifactName);
    }
    return { ...assertion, passed };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const packs = await store.list();
    res.json({ packs });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const pack = await store.create(readPack(req));
    res.status(201).json({ pack });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: 'Validation failed', details: err.message.replace(/^Validation failed:\s*/, '').split('; ') });
    }
    next(err);
  }
});

router.post('/import', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const imported = await store.importBundle(req.body?.bundle ?? req.body);
    res.status(201).json(imported);
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const pack = await getPackStore(req).get(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    res.json({ pack });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const pack = await getPackStore(req).update(req.params.id, readPack(req));
    res.json({ pack });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ error: 'Validation failed', details: err.message.replace(/^Validation failed:\s*/, '').split('; ') });
    }
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const existing = await store.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    await store.delete(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.get('/:id/versions', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const pack = await store.get(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    const versions = await store.listVersions(req.params.id);
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/versions/:timestamp/restore', async (req, res, next) => {
  try {
    const pack = await getPackStore(req).restoreVersion(req.params.id, req.params.timestamp);
    res.json({ pack });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const engine = getSwarmEngine(req);
    const pack = await store.get(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }

    const projectId = req.body?.projectId;
    const projectPath = req.body?.projectPath;
    if (!projectId || !projectPath) {
      return res.status(400).json({ error: 'projectId and projectPath are required' });
    }

    const input = req.body?.input ?? {};
    const inputErrors = validateInputAgainstSchema(pack.inputSchema, input);
    if (inputErrors.length > 0) {
      return res.status(400).json({ error: 'Input validation failed', details: inputErrors });
    }

    const resolved = await packResolver.resolveFromStores({
      packId: req.params.id,
      packStore: store,
      workflowStore: req.app.locals.workflowStore,
      input,
      projectId,
      projectPath,
    });
    const executionId = await engine.startExecution(
      resolved.workflowId,
      projectId,
      projectPath,
      {
        runtimeProvider: req.body?.runtimeProvider ?? pack.runtimePolicy?.provider ?? 'auto',
        runtimeModels: req.body?.runtimeModels,
        workflowContextPatch: resolved.workflowContextPatch,
        packMetadata: resolved.packMetadata,
      }
    );
    const status = engine.getStatus(executionId);
    const packResult = buildPackResult(pack, status, {}, '');

    res.status(201).json({
      executionId,
      workflowId: resolved.workflowId,
      status: status?.status ?? 'running',
      pack,
      packRun: {
        packId: pack.id,
        packVersion: pack.packVersion,
        visibleSteps: resolved.packMetadata.visibleSteps,
        projectBinding: resolved.packMetadata.projectBinding,
        conflicts: resolved.packMetadata.conflicts,
      },
      packResult,
    });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/export', async (req, res, next) => {
  try {
    const bundle = await getPackStore(req).exportBundle(req.params.id);
    res.json({ bundle });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/install', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const pack = await store.get(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    const install = await store.saveInstall({
      packId: pack.id,
      sourcePackId: pack.id,
      packVersion: pack.packVersion,
      installType: req.body?.installType ?? 'local',
      provenance: req.body?.provenance ?? {
        source: 'local',
      },
    });
    res.status(201).json({ install });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/fork', async (req, res, next) => {
  try {
    const pack = await getPackStore(req).forkPack(req.params.id);
    res.status(201).json({ pack });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.get('/:id/fixtures', async (req, res, next) => {
  try {
    const fixtures = await getPackStore(req).listFixtures(req.params.id);
    res.json({ fixtures });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/fixtures', async (req, res, next) => {
  try {
    const fixture = await getPackStore(req).saveFixture(req.params.id, req.body?.fixture ?? req.body);
    res.status(201).json({ fixture });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: 'Validation failed', details: err.message.replace(/^Validation failed:\s*/, '').split('; ') });
    }
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/fixtures/:fixtureId/run', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const fixture = await store.getFixture(req.params.id, req.params.fixtureId);
    const pack = await store.get(req.params.id);
    if (!fixture || !pack) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const assertionResults = evaluateFixtureAssertions(fixture, req.body?.result ?? req.body ?? {});
    const result = {
      fixtureId: fixture.id,
      packId: pack.id,
      packVersion: pack.packVersion,
      passed: assertionResults.every((assertion) => assertion.passed),
      assertions: assertionResults,
      ranAt: new Date().toISOString(),
    };
    await store.saveFixture(req.params.id, { ...fixture, lastResult: result });
    res.json({ result });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/dry-run', async (req, res, next) => {
  try {
    const pack = await getPackStore(req).get(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    const input = req.body?.input ?? {};
    const details = validateInputAgainstSchema(pack.inputSchema, input);
    res.json({
      ok: details.length === 0,
      details,
      pack,
    });
  } catch (err) {
    if (respondKnownRouteError(res, err)) return;
    next(err);
  }
});

router.post('/:id/publish', async (req, res, next) => {
  try {
    const store = getPackStore(req);
    const pack = await store.get(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found', id: req.params.id });
    }
    const fixtures = await store.listFixtures(req.params.id);
    if (fixtures.length === 0) {
      return res.status(409).json({ error: 'Cannot publish without at least one fixture' });
    }
    if (!fixtures.some((fixture) => fixture.lastResult?.passed === true)) {
      return res.status(409).json({ error: 'Cannot publish without a passing fixture run' });
    }
    const published = await store.createPublishedVersion(req.params.id);
    res.json({ pack: published });
  } catch (err) {
    next(err);
  }
});

export default router;
