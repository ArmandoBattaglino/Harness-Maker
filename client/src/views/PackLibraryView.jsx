import { useEffect, useMemo, useState } from 'react';

import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import { usePack, usePackList } from '../hooks/usePack.js';
import { apiGet } from '../hooks/useApi.js';
import { useSwarmStore } from '../store/SwarmContext.jsx';

export default function PackLibraryView() {
  const dispatch = useAppDispatch();
  const { projects, activeProjectId } = useAppState();
  const { packs, loading, error } = usePackList();
  const [selectedPackId, setSelectedPackId] = useState('');
  const { pack, start, exportBundle, install, fork } = usePack(selectedPackId);
  const hydratePackRuntime = useSwarmStore((state) => state.hydratePackRuntime);
  const livePackRun = useSwarmStore((state) => state.packRun);
  const livePackResult = useSwarmStore((state) => state.packResult);
  const [runInput, setRunInput] = useState({});
  const [projectId, setProjectId] = useState(activeProjectId ?? '');
  const [runState, setRunState] = useState(null);
  const [runError, setRunError] = useState('');
  const [runStarting, setRunStarting] = useState(false);
  const [distributionState, setDistributionState] = useState('');
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!selectedPackId && packs.length > 0) {
      setSelectedPackId(packs[0].id);
    }
  }, [packs, selectedPackId]);

  useEffect(() => {
    setRunInput({});
    setRunState(null);
    setRunError('');
    setDistributionState('');
  }, [selectedPackId]);

  useEffect(() => {
    setProjectId((current) => current || activeProjectId || projects[0]?.id || '');
  }, [activeProjectId, projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId]
  );
  const scopedPackRun = livePackRun?.packId === pack?.id ? livePackRun : null;
  const scopedPackResult = livePackResult?.packId === pack?.id ? livePackResult : null;

  const inputFields = useMemo(
    () => Object.entries(pack?.inputSchema?.properties ?? {}),
    [pack]
  );

  function setInputValue(key, value) {
    setRunInput((current) => ({ ...current, [key]: value }));
  }

  function coerceInputValue(schema, rawValue) {
    if (rawValue === '') return '';
    if (schema.type === 'integer') {
      const parsed = Number.parseInt(rawValue, 10);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }
    if (schema.type === 'number') {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : rawValue;
    }
    if (schema.type === 'object' || schema.type === 'array') {
      try {
        return JSON.parse(rawValue);
      } catch {
        return rawValue;
      }
    }
    return rawValue;
  }

  async function startPackRun() {
    if (!pack || !selectedProject) return;
    setRunStarting(true);
    setRunError('');
    try {
      const response = await start({
        projectId: selectedProject.id,
        projectPath: selectedProject.path,
        input: runInput,
      });
      setRunState(response);
      hydratePackRuntime({
        packRun: response.packRun,
        packResult: response.packResult,
      });
      void pollPackRun(response.executionId, response.workflowId ?? pack.workflowId);
    } catch (err) {
      setRunState(null);
      hydratePackRuntime({ packRun: null, packResult: null });
      setRunError(err instanceof Error ? err.message : 'Failed to launch pack');
    } finally {
      setRunStarting(false);
    }
  }

  async function pollPackRun(executionId, workflowId) {
    if (!executionId) return;
    const terminalStatuses = new Set(['completed', 'failed', 'stopped', 'blocked']);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
      try {
        const status = await apiGet(`/api/v1/swarm/${executionId}/status`);
        if (status?.packRun) {
          hydratePackRuntime({ packRun: status.packRun });
        }
        setRunState((current) => ({ ...(current ?? {}), executionId, status: status?.status ?? current?.status }));
        if (terminalStatuses.has(status?.status)) {
          const results = await apiGet(`/api/v1/swarm/executions/${executionId}/results${workflowId ? `?workflowId=${workflowId}` : ''}`);
          hydratePackRuntime({
            packRun: results?.packRun ?? status?.packRun,
            packResult: results?.packResult,
          });
          return;
        }
      } catch {
        return;
      }
    }
  }

  async function exportPack() {
    const response = await exportBundle();
    setDistributionState(`Exported ${response.bundle?.manifest?.packId ?? pack.id}@${response.bundle?.manifest?.packVersion ?? pack.packVersion}`);
  }

  async function installPack() {
    const response = await install({ installType: 'local', provenance: { source: 'local-library' } });
    setDistributionState(`Installed ${response.install?.packId ?? pack.id}`);
  }

  async function forkPack() {
    const forked = await fork();
    setDistributionState(`Forked ${forked?.name ?? pack.name}`);
  }

  return (
    <section className="flex h-full w-full overflow-hidden bg-background-dark text-text-main">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-border-color bg-surface p-4">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Pack Library</p>
          <h1 className="text-xl font-bold">Run a harness</h1>
          <p className="mt-1 text-xs text-text-muted">Operator-first surface. The workflow graph is optional debug detail.</p>
        </div>
        {loading && <p className="text-sm text-text-muted">Loading packs…</p>}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="space-y-2">
          {packs.map((item) => (
            <button
              key={item.id}
              className={`w-full rounded border px-3 py-2 text-left text-sm ${selectedPackId === item.id ? 'border-primary bg-primary/10' : 'border-border-color bg-background-dark'}`}
              onClick={() => setSelectedPackId(item.id)}
            >
              <div className="font-semibold">{item.name}</div>
              <div className="text-xs text-text-muted">{item.category} · v{item.packVersion}</div>
            </button>
          ))}
          {packs.length === 0 && !loading && (
            <p className="rounded border border-dashed border-border-color p-3 text-xs text-text-muted">No packs yet. Open Pack Builder to create one.</p>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {!pack ? (
          <div className="rounded-xl border border-border-color bg-surface p-6 text-sm text-text-muted">Select a pack to view details and launch it.</div>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            <header className="rounded-xl border border-border-color bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">Pack Detail</p>
                  <h2 className="text-2xl font-bold">{pack.name}</h2>
                  <p className="mt-1 text-sm text-text-muted">{pack.description || 'No description provided.'}</p>
                </div>
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'pack-builder' })}>
                  Open in Builder
                </button>
              </div>
              <div className="mt-4 grid gap-3 text-xs text-text-muted md:grid-cols-4">
                <Fact label="Version" value={pack.packVersion} />
                <Fact label="Status" value={pack.status} />
                <Fact label="Inputs" value={String(inputFields.length)} />
                <Fact label="Artifacts" value={String((pack.artifactDefinitions ?? []).length)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={exportPack}>Export bundle</button>
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={installPack}>Install locally</button>
                <button className="rounded border border-border-color px-3 py-2 text-sm" onClick={forkPack}>Fork draft</button>
                {distributionState && <span className="self-center text-xs text-text-muted">{distributionState}</span>}
              </div>
            </header>

            <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-border-color bg-surface p-5">
                <h3 className="mb-3 font-bold">Run form</h3>
                <label className="mb-3 block text-xs font-semibold text-text-muted">
                  Project binding
                  <select className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                    <option value="">Select project…</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
                {!selectedProject && <p className="mb-3 text-xs text-amber-300">Choose a project before launching this pack.</p>}
                {inputFields.map(([key, schema]) => (
                  <RunInputField
                    key={key}
                    fieldKey={key}
                    schema={schema}
                    value={runInput[key] ?? ''}
                    onChange={(rawValue) => setInputValue(key, coerceInputValue(schema, rawValue))}
                  />
                ))}
                {runError && (
                  <p role="alert" className="mb-3 rounded border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
                    {runError}
                  </p>
                )}
                <button className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!selectedProject || runStarting} onClick={startPackRun}>
                  {runStarting ? 'Launching…' : 'Launch pack'}
                </button>
              </div>

              <div className="rounded-xl border border-border-color bg-surface p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold">Run monitor</h3>
                  <button className="text-xs text-text-muted underline" onClick={() => setDebugOpen((value) => !value)}>Advanced debug</button>
                </div>
                <Timeline steps={scopedPackRun?.visibleSteps ?? pack.visibleSteps ?? []} />
                <h4 className="mt-4 text-sm font-semibold">Artifacts</h4>
                <ul className="mt-2 space-y-2 text-xs text-text-muted">
                  {(scopedPackResult?.artifacts ?? pack.artifactDefinitions ?? []).map((artifact) => (
                    <li key={artifact.id} className="rounded bg-background-dark px-3 py-2">{artifact.name} {artifact.status ? `- ${artifact.status}` : ''}</li>
                  ))}
                </ul>
                {runState && <p className="mt-3 text-xs text-success">Started execution {runState.executionId}</p>}
                {debugOpen && (
                  <pre className="mt-4 max-h-64 overflow-auto rounded bg-background-dark p-3 text-xs text-text-muted">
                    {JSON.stringify({ executionId: runState?.executionId ?? null, packRun: scopedPackRun, packResult: scopedPackResult }, null, 2)}
                  </pre>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </section>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded bg-background-dark p-3">
      <div className="uppercase tracking-widest text-text-dimmer">{label}</div>
      <div className="mt-1 text-text-main">{value}</div>
    </div>
  );
}

function Timeline({ steps }) {
  if (!steps.length) return <p className="text-xs text-text-muted">No visible steps declared yet.</p>;
  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li key={step.id} className="rounded bg-background-dark px-3 py-2 text-sm">
          <span className="font-semibold">{step.label}</span>
          <span className="ml-2 text-xs text-text-muted">{step.status ?? 'configured'}</span>
        </li>
      ))}
    </ol>
  );
}

function RunInputField({ fieldKey, schema, value, onChange }) {
  const label = schema.title ?? fieldKey;
  const help = schema['x-packField']?.help ?? fieldKey;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return (
      <label className="mb-3 block text-xs font-semibold text-text-muted">
        {label}
        <select className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select…</option>
          {schema.enum.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  if (schema.type === 'boolean') {
    return (
      <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-muted">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    );
  }

  if (schema['x-packField']?.fieldType === 'textarea' || schema.type === 'object' || schema.type === 'array') {
    return (
      <label className="mb-3 block text-xs font-semibold text-text-muted">
        {label}
        <textarea className="mt-1 min-h-24 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)} onChange={(event) => onChange(event.target.value)} placeholder={help} />
      </label>
    );
  }

  const inputType = schema.type === 'integer' || schema.type === 'number' ? 'number' : 'text';
  return (
    <label className="mb-3 block text-xs font-semibold text-text-muted">
      {label}
      <input className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" type={inputType} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={help} />
    </label>
  );
}
