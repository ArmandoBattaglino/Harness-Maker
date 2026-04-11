import { useEffect, useMemo, useState } from 'react';

import { useAppState, useAppDispatch } from '../store/AppContext.jsx';
import { usePack, usePackList } from '../hooks/usePack.js';
import { useSwarmStore } from '../store/SwarmContext.jsx';

export default function PackLibraryView() {
  const dispatch = useAppDispatch();
  const { projects, activeProjectId } = useAppState();
  const { packs, loading, error } = usePackList();
  const [selectedPackId, setSelectedPackId] = useState('');
  const { pack, start } = usePack(selectedPackId);
  const hydratePackRuntime = useSwarmStore((state) => state.hydratePackRuntime);
  const livePackRun = useSwarmStore((state) => state.packRun);
  const livePackResult = useSwarmStore((state) => state.packResult);
  const [runInput, setRunInput] = useState({});
  const [projectId, setProjectId] = useState(activeProjectId ?? '');
  const [runState, setRunState] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!selectedPackId && packs.length > 0) {
      setSelectedPackId(packs[0].id);
    }
  }, [packs, selectedPackId]);

  useEffect(() => {
    setProjectId((current) => current || activeProjectId || projects[0]?.id || '');
  }, [activeProjectId, projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId]
  );

  const inputFields = useMemo(
    () => Object.entries(pack?.inputSchema?.properties ?? {}),
    [pack]
  );

  function setInputValue(key, value) {
    setRunInput((current) => ({ ...current, [key]: value }));
  }

  async function startPackRun() {
    if (!pack || !selectedProject) return;
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
                  <label key={key} className="mb-3 block text-xs font-semibold text-text-muted">
                    {schema.title ?? key}
                    <input className="mt-1 w-full rounded bg-background-dark px-3 py-2 text-sm text-text-main" value={runInput[key] ?? ''} onChange={(event) => setInputValue(key, event.target.value)} placeholder={schema['x-packField']?.help ?? key} />
                  </label>
                ))}
                <button className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!selectedProject} onClick={startPackRun}>Launch pack</button>
              </div>

              <div className="rounded-xl border border-border-color bg-surface p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold">Run monitor</h3>
                  <button className="text-xs text-text-muted underline" onClick={() => setDebugOpen((value) => !value)}>Advanced debug</button>
                </div>
                <Timeline steps={(livePackRun?.packId === pack.id ? livePackRun.visibleSteps : pack.visibleSteps) ?? []} />
                <h4 className="mt-4 text-sm font-semibold">Artifacts</h4>
                <ul className="mt-2 space-y-2 text-xs text-text-muted">
                  {(livePackResult?.packId === pack.id ? livePackResult.artifacts : pack.artifactDefinitions ?? []).map((artifact) => (
                    <li key={artifact.id} className="rounded bg-background-dark px-3 py-2">{artifact.name} {artifact.status ? `- ${artifact.status}` : ''}</li>
                  ))}
                </ul>
                {runState && <p className="mt-3 text-xs text-success">Started execution {runState.executionId}</p>}
                {debugOpen && (
                  <pre className="mt-4 max-h-64 overflow-auto rounded bg-background-dark p-3 text-xs text-text-muted">
                    {JSON.stringify({ executionId: runState?.executionId ?? null, packRun: livePackRun, packResult: livePackResult }, null, 2)}
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
