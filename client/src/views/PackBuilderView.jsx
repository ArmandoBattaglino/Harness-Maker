import { useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppState } from '../store/AppContext.jsx';
import { usePack, usePackList } from '../hooks/usePack.js';
import { useWorkflowList } from '../hooks/useWorkflow.js';
import { clearStoredExecution, writeStoredExecution } from '../utils/swarmExecutionStorage.js';

function buildDraftPack(workflow) {
  return {
    name: `${workflow?.name ?? 'Workflow'} Harness`,
    description: workflow?.description ?? '',
    category: 'general',
    workflowId: workflow?.id ?? '',
    packVersion: '0.1.0',
    status: 'draft',
    engineCompatibility: '^1.0.0',
    visibility: 'private',
    runtimePolicy: { provider: 'auto', requiresProjectBinding: true, allowBuilderDebug: true },
    dependencies: [
      { id: 'linked-workflow', type: 'workflow', targetId: workflow?.id ?? '', version: 'current', required: true },
    ],
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    knowledgeSources: [],
    behaviorRules: [],
    outputSchema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false },
    artifactDefinitions: [{ id: 'final-report', name: 'Final report', sourceType: 'aggregatedArtifact', format: 'markdown', required: true }],
    visibleSteps: [],
    completionCriteria: ['Pack run reaches a terminal completed state'],
  };
}

function clonePack(pack) {
  return JSON.parse(JSON.stringify(pack));
}

export default function PackBuilderView() {
  const dispatch = useAppDispatch();
  const { navigationIntent } = useAppState();
  const { workflows } = useWorkflowList();
  const { packs, loading, error, refresh, create } = usePackList();
  const [selectedPackId, setSelectedPackId] = useState('');
  const { pack, update, dryRun } = usePack(selectedPackId);
  const [draft, setDraft] = useState(null);
  const [saveState, setSaveState] = useState('');
  const [entryContext, setEntryContext] = useState(null);

  useEffect(() => {
    if (!selectedPackId && packs.length > 0) {
      setSelectedPackId(packs[0].id);
    }
  }, [packs, selectedPackId]);

  useEffect(() => {
    setDraft(pack ? clonePack(pack) : null);
  }, [pack]);

  useEffect(() => {
    if (navigationIntent?.focus !== 'builder') return;

    if (navigationIntent.packId) {
      setSelectedPackId(navigationIntent.packId);
    }
    setEntryContext({
      source: navigationIntent.source ?? 'unknown',
      packId: navigationIntent.packId ?? null,
      workflowId: navigationIntent.workflowId ?? null,
      executionId: navigationIntent.executionId ?? null,
    });
    dispatch({ type: 'CLEAR_NAVIGATION_INTENT' });
  }, [dispatch, navigationIntent]);

  useEffect(() => {
    if (entryContext?.packId && selectedPackId && entryContext.packId !== selectedPackId) {
      setEntryContext(null);
    }
  }, [entryContext?.packId, selectedPackId]);

  const linkedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === draft?.workflowId) ?? workflows[0] ?? null,
    [workflows, draft?.workflowId]
  );

  const workflowAgentNodes = useMemo(
    () => (linkedWorkflow?.nodes ?? []).filter((node) => node.type === 'agent'),
    [linkedWorkflow]
  );

  async function createDraft() {
    if (!linkedWorkflow && workflows.length === 0) return;
    const created = await create(buildDraftPack(linkedWorkflow ?? workflows[0]));
    setSelectedPackId(created.id);
    await refresh();
  }

  function patchDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function setWorkflow(workflowId) {
    patchDraft({
      workflowId,
      dependencies: [
        ...(draft?.dependencies ?? []).filter((dependency) => dependency.type !== 'workflow'),
        { id: 'linked-workflow', type: 'workflow', targetId: workflowId, version: 'current', required: true },
      ],
    });
  }

  function addInputField() {
    const id = `field${Object.keys(draft.inputSchema.properties ?? {}).length + 1}`;
    patchDraft({
      inputSchema: {
        ...draft.inputSchema,
        properties: {
          ...(draft.inputSchema.properties ?? {}),
          [id]: {
            type: 'string',
            title: `Input ${id}`,
            'x-packField': { fieldType: 'text', help: 'Operator-provided input' },
          },
        },
        required: [...new Set([...(draft.inputSchema.required ?? []), id])],
        additionalProperties: false,
      },
    });
  }

  function removeInputField(id) {
    const { [id]: _removed, ...properties } = draft.inputSchema.properties ?? {};
    patchDraft({
      inputSchema: {
        ...draft.inputSchema,
        properties,
        required: (draft.inputSchema.required ?? []).filter((item) => item !== id),
      },
    });
  }

  function moveInputField(id, direction) {
    const entries = Object.entries(draft.inputSchema.properties ?? {});
    const index = entries.findIndex(([key]) => key === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= entries.length) return;
    [entries[index], entries[nextIndex]] = [entries[nextIndex], entries[index]];
    patchDraft({
      inputSchema: {
        ...draft.inputSchema,
        properties: Object.fromEntries(entries),
      },
    });
  }

  function addOutput() {
    const id = `output${Object.keys(draft.outputSchema.properties ?? {}).length + 1}`;
    patchDraft({
      outputSchema: {
        ...draft.outputSchema,
        properties: {
          ...(draft.outputSchema.properties ?? {}),
          [id]: { type: 'string', title: `Output ${id}` },
        },
        required: [...new Set([...(draft.outputSchema.required ?? []), id])],
      },
    });
  }

  function removeOutput(id) {
    const { [id]: _removed, ...properties } = draft.outputSchema.properties ?? {};
    patchDraft({
      outputSchema: {
        ...draft.outputSchema,
        properties,
        required: (draft.outputSchema.required ?? []).filter((item) => item !== id),
      },
    });
  }

  function addArtifact() {
    patchDraft({
      artifactDefinitions: [
        ...(draft.artifactDefinitions ?? []),
        {
          id: `artifact-${(draft.artifactDefinitions ?? []).length + 1}`,
          name: 'Markdown artifact',
          sourceType: 'aggregatedArtifact',
          format: 'markdown',
          required: false,
        },
      ],
    });
  }

  function removeArtifact(id) {
    patchDraft({
      artifactDefinitions: (draft.artifactDefinitions ?? []).filter((artifact) => artifact.id !== id),
    });
  }

  function addDependency() {
    patchDraft({
      dependencies: [
        ...(draft.dependencies ?? []),
        {
          id: `context-dependency-${(draft.dependencies ?? []).length + 1}`,
          type: 'contextOverlay',
          targetId: 'local-context',
          version: 'current',
          required: false,
        },
      ],
    });
  }

  function addKnowledgeSource() {
    patchDraft({
      knowledgeSources: [
        ...(draft.knowledgeSources ?? []),
        {
          id: `source-${(draft.knowledgeSources ?? []).length + 1}`,
          name: 'Inline context',
          type: 'inline',
          mergeStrategy: 'merge',
          content: { guidance: 'Add domain knowledge here.' },
          required: true,
        },
      ],
    });
  }

  function addBehaviorRule() {
    patchDraft({
      behaviorRules: [
        ...(draft.behaviorRules ?? []),
        {
          id: `rule-${(draft.behaviorRules ?? []).length + 1}`,
          name: 'Behavior rule',
          instruction: 'Keep the result concise and actionable.',
          mode: 'append',
          priority: 100,
        },
      ],
    });
  }

  function addVisibleStep() {
    const nodeId = workflowAgentNodes[(draft.visibleSteps ?? []).length]?.id ?? workflowAgentNodes[0]?.id ?? '';
    patchDraft({
      visibleSteps: [
        ...(draft.visibleSteps ?? []),
        {
          id: `step-${(draft.visibleSteps ?? []).length + 1}`,
          label: `Step ${(draft.visibleSteps ?? []).length + 1}`,
          description: 'Operator-visible phase',
          nodeIds: nodeId ? [nodeId] : [],
        },
      ],
    });
  }

  function moveVisibleStep(id, direction) {
    const steps = [...(draft.visibleSteps ?? [])];
    const index = steps.findIndex((step) => step.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return;
    [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
    patchDraft({ visibleSteps: steps });
  }

  async function saveDraft() {
    if (!draft?.id) return;
    setSaveState('saving');
    try {
      const saved = await update(draft);
      setDraft(clonePack(saved));
      setSaveState('saved');
      setTimeout(() => setSaveState(''), 2000);
    } catch (err) {
      setSaveState(err.message);
    }
  }

  async function validateDraft() {
    if (!draft?.id) return;
    setSaveState('validating');
    try {
      const result = await dryRun({});
      setSaveState(result.ok ? 'dry-run ready' : `dry-run issues: ${(result.details ?? []).join(', ')}`);
    } catch (err) {
      setSaveState(err.message);
    }
  }

  function openWorkflowDrilldown() {
    if (!draft?.workflowId) return;

    if (entryContext?.executionId) {
      writeStoredExecution({
        executionId: entryContext.executionId,
        workflowId: draft.workflowId,
        status: 'running',
      });
    } else {
      clearStoredExecution();
    }

    dispatch({
      type: 'SET_NAVIGATION_INTENT',
      payload: {
        source: 'pack-builder',
        focus: 'workflow-runtime',
        packId: draft.id ?? entryContext?.packId ?? null,
        workflowId: draft.workflowId,
        executionId: entryContext?.executionId ?? null,
      },
    });
    dispatch({ type: 'SET_VIEW', payload: 'swarm' });
  }

  if (loading && !draft) {
    return <div className="p-8 text-text-muted">Loading packs…</div>;
  }

  return (
    <section className="flex h-full w-full overflow-y-auto bg-background-dark text-text-main">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Pack Builder</p>
            <h1 className="text-2xl font-bold">Vertical harness authoring</h1>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              Guided toolkit for the four pack-owned surfaces: inputs, knowledge/context,
              behavior rules, and outputs/artifacts. The workflow graph stays available as
              advanced drill-down.
            </p>
          </div>
          <button
            className="rounded border border-border-color px-3 py-2 text-sm text-text-muted hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50"
            onClick={openWorkflowDrilldown}
            disabled={!draft?.workflowId}
          >
            Open workflow drill-down
          </button>
        </header>

        {error && <div className="rounded border border-error/40 bg-error/10 p-3 text-sm text-error">{error}</div>}
        {entryContext && (
          <div className="rounded border border-primary/30 bg-primary/10 p-3 text-xs text-text-main">
            Builder opened from <span className="font-semibold">{entryContext.source}</span>. Linked workflow drill-down will target{' '}
            <span className="font-semibold">{draft?.workflowId ?? entryContext.workflowId ?? 'no workflow selected'}</span>.
            {entryContext.executionId
              ? ` Existing pack execution context: ${entryContext.executionId}.`
              : ' No active pack execution context is attached yet.'}
          </div>
        )}

        <div className="rounded-xl border border-border-color bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select className="rounded bg-background-dark px-3 py-2 text-sm" value={selectedPackId} onChange={(event) => setSelectedPackId(event.target.value)}>
              <option value="">Select pack…</option>
              {packs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="rounded bg-primary px-3 py-2 text-sm font-semibold text-white" onClick={createDraft} disabled={workflows.length === 0}>
              Create draft from workflow
            </button>
            {draft && (
              <>
                <button className="rounded border border-border-color px-3 py-2 text-sm disabled:opacity-40" onClick={saveDraft} disabled={draft.status !== 'draft'}>Save pack</button>
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={validateDraft}>Dry-run validate</button>
              </>
            )}
            {saveState && <span className="text-xs text-text-muted">{saveState}</span>}
          </div>
        </div>

        {!draft ? (
          <div className="rounded-xl border border-dashed border-border-color p-8 text-sm text-text-muted">
            Create or select a pack to start guided authoring.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col gap-5">
              <Panel title="Overview + workflow link">
                {draft.status !== 'draft' && (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                    This pack is {draft.status}; direct edits are version-locked by the server.
                  </div>
                )}
                <LabeledInput label="Name" value={draft.name} onChange={(value) => patchDraft({ name: value })} />
                <LabeledInput label="Category" value={draft.category} onChange={(value) => patchDraft({ category: value })} />
                <label className="text-xs font-semibold text-text-muted">
                  Linked workflow
                  <select className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={draft.workflowId} onChange={(event) => setWorkflow(event.target.value)}>
                    {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                  </select>
                </label>
              </Panel>

              <Panel title="Input schema">
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addInputField}>Add text input</button>
                <ActionList
                  items={Object.entries(draft.inputSchema.properties ?? {}).map(([id, value]) => ({ id, label: `${id}: ${value.title ?? value.type}` }))}
                  empty="No inputs yet"
                  onRemove={removeInputField}
                  onMove={moveInputField}
                />
              </Panel>

              <Panel title="Knowledge/context injection">
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addKnowledgeSource}>Add inline context</button>
                <FieldList items={(draft.knowledgeSources ?? []).map((source) => `${source.name} (${source.mergeStrategy})`)} empty="No knowledge sources yet" />
              </Panel>

              <Panel title="Prompt/behavior rules">
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addBehaviorRule}>Add behavior rule</button>
                <FieldList items={(draft.behaviorRules ?? []).map((rule) => `${rule.name}: ${rule.instruction}`)} empty="No behavior rules yet" />
              </Panel>
            </div>

            <div className="flex flex-col gap-5">
              <Panel title="Outputs + artifacts">
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addOutput}>Add output</button>
                <ActionList
                  items={Object.keys(draft.outputSchema.properties ?? {}).map((key) => ({ id: key, label: `Output: ${key}` }))}
                  empty="No outputs yet"
                  onRemove={removeOutput}
                />
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addArtifact}>Add artifact</button>
                <ActionList
                  items={(draft.artifactDefinitions ?? []).map((artifact) => ({ id: artifact.id, label: `${artifact.name} (${artifact.format})` }))}
                  empty="No artifacts yet"
                  onRemove={removeArtifact}
                />
              </Panel>

              <Panel title="Runtime + dependencies">
                <label className="text-xs font-semibold text-text-muted">
                  Runtime provider
                  <select className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={draft.runtimePolicy.provider ?? 'auto'} onChange={(event) => patchDraft({ runtimePolicy: { ...draft.runtimePolicy, provider: event.target.value } })}>
                    <option value="auto">Auto</option>
                    <option value="claude">Claude</option>
                    <option value="codex">Codex</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </label>
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addDependency}>Add context dependency</button>
                <FieldList items={(draft.dependencies ?? []).map((dependency) => `${dependency.type}: ${dependency.targetId}`)} empty="No dependencies" />
              </Panel>

              <Panel title="Visible steps + operator preview">
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={addVisibleStep}>Map visible step</button>
                <ActionList
                  items={(draft.visibleSteps ?? []).map((step) => ({ id: step.id, label: `${step.label}: ${(step.nodeIds ?? []).join(', ') || 'unmapped'}` }))}
                  empty="No visible steps yet"
                  onMove={moveVisibleStep}
                />
                <div className="rounded bg-background-dark p-3 text-xs text-text-muted">
                  Operator preview: {(draft.inputSchema.required ?? []).length} required input(s), {(draft.visibleSteps ?? []).length} visible step(s), {(draft.artifactDefinitions ?? []).length} artifact(s).
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-xl border border-border-color bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold text-text-main">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function LabeledInput({ label, value, onChange }) {
  return (
    <label className="text-xs font-semibold text-text-muted">
      {label}
      <input className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FieldList({ items, empty }) {
  if (!items.length) return <p className="text-xs text-text-muted">{empty}</p>;
  return (
    <ul className="space-y-1 text-xs text-text-muted">
      {items.map((item) => <li key={item} className="rounded bg-background-dark px-3 py-2">{item}</li>)}
    </ul>
  );
}

function ActionList({ items, empty, onRemove = null, onMove = null }) {
  if (!items.length) return <p className="text-xs text-text-muted">{empty}</p>;
  return (
    <ul className="space-y-1 text-xs text-text-muted">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-2 rounded bg-background-dark px-3 py-2">
          <span>{item.label}</span>
          <span className="flex gap-1">
            {onMove && (
              <>
                <button className="rounded border border-border-color px-1" onClick={() => onMove(item.id, -1)}>Up</button>
                <button className="rounded border border-border-color px-1" onClick={() => onMove(item.id, 1)}>Down</button>
              </>
            )}
            {onRemove && <button className="rounded border border-border-color px-1" onClick={() => onRemove(item.id)}>Remove</button>}
          </span>
        </li>
      ))}
    </ul>
  );
}
