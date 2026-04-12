import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowStore } from '../services/WorkflowStore.js';
import { ConfigStore } from '../services/ConfigStore.js';
import PackStore from '../stores/PackStore.js';
import packsRouter from '../routes/packs.js';

function getRouteHandler(router, method, routePath) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === routePath && candidate.route.methods?.[method]
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
  return layer.route.stack[0].handle;
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function marketingWorkflow() {
  return {
    name: 'Marketing Video Harness Workflow',
    description: 'Creates a complete marketing video campaign plan',
    nodes: [
      { id: 'strategist', type: 'agent', data: { label: 'Marketing Strategist', systemPrompt: 'Create a creative brief.' } },
      { id: 'scriptwriter', type: 'agent', data: { label: 'Video Scriptwriter', systemPrompt: 'Write the video script.' } },
      { id: 'storyboard', type: 'agent', data: { label: 'Storyboard Planner', systemPrompt: 'Create a shot list and storyboard.' } },
      { id: 'reviewer', type: 'agent', data: { label: 'Compliance Reviewer', systemPrompt: 'Check claims and brand safety.' } },
      { id: 'packager', type: 'agent', data: { label: 'Final Packager', systemPrompt: 'Package all outputs into the final artifact.' } },
    ],
    edges: [
      { id: 'e-strategy-script', source: 'strategist', target: 'scriptwriter' },
      { id: 'e-script-storyboard', source: 'scriptwriter', target: 'storyboard' },
      { id: 'e-storyboard-reviewer', source: 'storyboard', target: 'reviewer' },
      { id: 'e-reviewer-packager', source: 'reviewer', target: 'packager' },
    ],
    settings: { mode: 'autonomous', maxConversationTurns: 8 },
    initialContext: { currentTask: 'Create a complete marketing video campaign package.' },
  };
}

function marketingPack(workflowId) {
  return {
    name: 'Marketing Video Campaign Harness',
    description: 'Generates script, storyboard, shot list, CTA, social variants, and compliance notes for a short marketing video.',
    category: 'marketing',
    workflowId,
    packVersion: '1.0.0',
    status: 'draft',
    engineCompatibility: '^1.0.0',
    visibility: 'private',
    runtimePolicy: { provider: 'auto', requiresProjectBinding: true, allowBuilderDebug: true },
    dependencies: [{ id: 'linked-workflow', type: 'workflow', targetId: workflowId, version: 'current', required: true }],
    inputSchema: {
      type: 'object',
      properties: {
        productName: { type: 'string', title: 'Product name', 'x-packField': { fieldType: 'text', help: 'Product being promoted' } },
        productDescription: { type: 'string', title: 'Product description', 'x-packField': { fieldType: 'textarea', help: 'Long campaign/product context' } },
        targetAudience: { type: 'string', title: 'Target audience', 'x-packField': { fieldType: 'text' } },
        primaryPlatform: { type: 'string', enum: ['tiktok', 'instagram', 'youtube_shorts', 'linkedin', 'meta_ads'], 'x-packField': { fieldType: 'enum' } },
        campaignGoal: { type: 'string', enum: ['awareness', 'conversion', 'launch', 'retargeting', 'education'], 'x-packField': { fieldType: 'enum' } },
        tone: { type: 'string', enum: ['premium', 'playful', 'urgent', 'educational', 'emotional'], 'x-packField': { fieldType: 'enum' } },
        videoLengthSeconds: { type: 'integer', minimum: 6, maximum: 180, default: 30, 'x-packField': { fieldType: 'json', help: 'Length in seconds; default is metadata only.' } },
        callToAction: { type: 'string', title: 'CTA', 'x-packField': { fieldType: 'text' } },
        brandConstraints: { type: 'string', title: 'Brand constraints', 'x-packField': { fieldType: 'textarea' } },
        claimsToAvoid: { type: 'string', title: 'Claims to avoid', 'x-packField': { fieldType: 'textarea' } },
        sourceNotes: { type: 'string', title: 'Source notes', 'x-packField': { fieldType: 'textarea' } },
      },
      required: ['productName', 'productDescription', 'targetAudience', 'primaryPlatform', 'campaignGoal', 'tone', 'videoLengthSeconds', 'callToAction'],
      additionalProperties: false,
    },
    knowledgeSources: [
      { id: 'brand-voice', name: 'Brand voice', type: 'inline', mergeStrategy: 'merge', content: { voice: 'clear, confident, conversion-focused', avoid: ['unsupported health claims', 'guaranteed results'] }, required: true },
      { id: 'platform-rules', name: 'Platform rules', type: 'inline', mergeStrategy: 'merge', content: { instagram: 'strong visual hook', youtube_shorts: 'clear narrative arc', linkedin: 'professional outcome framing' }, required: true },
    ],
    behaviorRules: [
      { id: 'avoid-unsupported-claims', name: 'Avoid unsupported claims', instruction: 'Do not invent metrics, certifications, guarantees, or compliance claims.', mode: 'guardrail', priority: 1 },
      { id: 'hook-first', name: 'Hook first', instruction: 'Start with a strong visual or verbal hook in the first two seconds.', mode: 'append', priority: 10 },
    ],
    outputSchema: {
      type: 'object',
      properties: {
        creativeBrief: { type: 'string' },
        videoScript: { type: 'string' },
        storyboard: { type: 'string' },
        shotList: { type: 'string' },
        socialVariants: { type: 'object' },
        complianceNotes: { type: 'string' },
        finalRecommendation: { type: 'string' },
      },
      required: ['creativeBrief', 'videoScript', 'storyboard', 'shotList', 'complianceNotes'],
      additionalProperties: false,
    },
    artifactDefinitions: [
      { id: 'marketing-video-plan', name: 'Marketing Video Plan', sourceType: 'aggregatedArtifact', format: 'markdown', required: true },
      { id: 'script-output', name: 'Video Script', sourceType: 'agentOutput', sourceNodeId: 'scriptwriter', format: 'text', required: true },
    ],
    visibleSteps: [
      { id: 'strategy', label: 'Strategy', nodeIds: ['strategist'] },
      { id: 'script', label: 'Script', nodeIds: ['scriptwriter'] },
      { id: 'storyboard', label: 'Storyboard', nodeIds: ['storyboard'] },
      { id: 'review', label: 'Review and package', nodeIds: ['reviewer', 'packager'] },
    ],
    completionCriteria: ['Creative brief, video script, storyboard, shot list, CTA, social variants, and compliance notes are present.'],
  };
}

function validMarketingInput(overrides = {}) {
  return {
    productName: 'VoltLite E-Bike 🚲',
    productDescription: 'A lightweight electric bicycle for urban commuters who want a premium, low-maintenance ride. '.repeat(80),
    targetAudience: 'Urban professionals aged 25-45 in Milan and Rome',
    primaryPlatform: 'instagram',
    campaignGoal: 'launch',
    tone: 'premium',
    videoLengthSeconds: 30,
    callToAction: 'Book a test ride',
    brandConstraints: 'No exaggerated speed or safety claims. Use Italian-friendly copy and avoid unsupported guarantees.',
    claimsToAvoid: 'Do not claim it is the safest e-bike. Do not promise medical, legal, or guaranteed commuting outcomes.',
    sourceNotes: 'Competitors emphasize battery range; our differentiator is lightweight design and service support. Unicode stress: città, qualità, €1.999, “smart quotes”.',
    ...overrides,
  };
}

function buildExecutionHistoryEntry(pack, projectPath, overrides = {}) {
  return {
    executionId: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    workflowContext: {
      creativeBrief: 'creative brief',
      videoScript: 'creative brief + script + storyboard + shot list + CTA',
      storyboard: 'storyboard',
      shotList: 'shot list',
      complianceNotes: 'compliance notes',
      finalRecommendation: 'CTA',
    },
    agentOutputs: {
      strategist: {
        label: 'Marketing Strategist',
        finalText: 'creative brief + script + storyboard + shot list + CTA',
      },
    },
    aggregatedArtifact: '# marketing video plan',
    packRun: {
      packId: pack.id,
      packVersion: pack.packVersion,
      visibleSteps: pack.visibleSteps,
      artifactDefinitions: pack.artifactDefinitions,
      outputSchema: pack.outputSchema,
      runtimePolicy: pack.runtimePolicy,
      projectBinding: { projectId: 'project-marketing', projectPath },
      conflicts: [],
    },
    ...overrides,
  };
}

describe('marketing video harness deep/stress contract', () => {
  let tempDir;
  let workflowStore;
  let packStore;
  let workflow;
  let pack;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-video-harness-'));
    workflowStore = new WorkflowStore(tempDir);
    await workflowStore.init();
    workflow = await workflowStore.create(marketingWorkflow());
    packStore = new PackStore(tempDir, workflowStore);
    await packStore.init();
    pack = await packStore.create(marketingPack(workflow.id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a complete marketing-video pack with all V17 authoring surfaces', () => {
    expect(pack.inputSchema.required).toContain('productName');
    expect(pack.knowledgeSources.map((source) => source.id)).toEqual(['brand-voice', 'platform-rules']);
    expect(pack.behaviorRules[0].mode).toBe('guardrail');
    expect(pack.outputSchema.properties).toHaveProperty('videoScript');
    expect(pack.artifactDefinitions.map((artifact) => artifact.id)).toEqual(['marketing-video-plan', 'script-output']);
    expect(pack.visibleSteps.map((step) => step.label)).toEqual(['Strategy', 'Script', 'Storyboard', 'Review and package']);
  });

  it('starts repeated marketing-video pack runs with long unicode input and isolated execution identities', async () => {
    vi.spyOn(ConfigStore, 'getProjects').mockReturnValue([
      { id: 'project-marketing', name: 'Marketing Project', path: tempDir },
    ]);
    let counter = 0;
    const swarmEngine = {
      startExecution: vi.fn().mockImplementation(async () => `exec-marketing-${++counter}`),
      getStatus: vi.fn().mockImplementation((executionId) => ({ executionId, status: 'running', workflowId: workflow.id })),
    };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const executionIds = [];

    for (let i = 0; i < 5; i += 1) {
      const req = {
        params: { id: pack.id },
        body: {
          projectId: 'project-marketing',
          projectPath: tempDir,
          input: validMarketingInput({ sourceNotes: `${'nota '.repeat(500)} 🎬 variante ${i}` }),
        },
        app: { locals: { packStore, workflowStore, swarmEngine } },
      };
      const res = createMockRes();
      await handler(req, res, vi.fn());
      expect(res.statusCode).toBe(201);
      expect(res.body.packRun.packId).toBe(pack.id);
      executionIds.push(res.body.executionId);
    }

    expect(new Set(executionIds).size).toBe(5);
    expect(swarmEngine.startExecution).toHaveBeenCalledTimes(5);
  });

  it('rejects invalid marketing input before runtime starts', async () => {
    vi.spyOn(ConfigStore, 'getProjects').mockReturnValue([
      { id: 'project-marketing', name: 'Marketing Project', path: tempDir },
    ]);
    const swarmEngine = { startExecution: vi.fn(), getStatus: vi.fn() };
    const handler = getRouteHandler(packsRouter, 'post', '/:id/start');
    const req = {
      params: { id: pack.id },
      body: {
        projectId: 'project-marketing',
        projectPath: tempDir,
        input: validMarketingInput({
          productName: undefined,
          primaryPlatform: 'television',
          videoLengthSeconds: 'thirty',
          surprise: true,
        }),
      },
      app: { locals: { packStore, workflowStore, swarmEngine } },
    };
    delete req.body.input.productName;
    const res = createMockRes();

    await handler(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      "input must have required property 'productName'",
      'input must NOT have additional properties',
      'input.primaryPlatform must be equal to one of the allowed values',
      'input.videoLengthSeconds must be integer',
    ]));
    expect(swarmEngine.startExecution).not.toHaveBeenCalled();
  });

  it('round-trips distribution, fixtures, and publish gates for the marketing-video harness', async () => {
    const bundle = await packStore.exportBundle(pack.id);
    const imported = await packStore.importBundle(bundle);
    const forked = await packStore.forkPack(imported.pack.id);

    expect(imported.pack.workflowId).toBe(imported.workflow.id);
    expect(imported.pack.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'workflow', targetId: imported.workflow.id }),
    ]));
    expect(forked.status).toBe('draft');
    expect(forked.installMetadata.sourcePackId).toBe(imported.pack.id);

    const fixture = await packStore.saveFixture(pack.id, {
      name: 'VoltLite launch happy path',
      packVersion: pack.packVersion,
      input: validMarketingInput(),
      assertions: [
        { type: 'statusEquals', expected: 'completed' },
        { type: 'outputIncludes', outputKey: 'videoScript', expected: 'script' },
        { type: 'artifactExists', artifactId: 'marketing-video-plan' },
      ],
    });

    const publishHandler = getRouteHandler(packsRouter, 'post', '/:id/publish');
    const blocked = createMockRes();
    await publishHandler({ params: { id: pack.id }, body: {}, app: { locals: { packStore } } }, blocked, vi.fn());
    expect(blocked.statusCode).toBe(409);

    const runHandler = getRouteHandler(packsRouter, 'post', '/:id/fixtures/:fixtureId/run');
    const runRes = createMockRes();
    await runHandler({
      params: { id: pack.id, fixtureId: fixture.id },
      body: {
        executionId: '11111111-1111-4111-8111-111111111111',
      },
      app: {
        locals: {
          packStore,
          executionHistoryStore: {
            getEntry: vi.fn().mockResolvedValue(buildExecutionHistoryEntry(pack, tempDir)),
          },
        },
      },
    }, runRes, vi.fn());
    expect(runRes.body.result.passed).toBe(true);

    const allowed = createMockRes();
    await publishHandler({ params: { id: pack.id }, body: {}, app: { locals: { packStore } } }, allowed, vi.fn());
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body.pack.status).toBe('published');
  });
});
