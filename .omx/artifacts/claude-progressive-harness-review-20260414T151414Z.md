# Original user task
Architectural/blocking review for the Progressive Harness Builder Ralph implementation.

# Final prompt sent to Claude CLI
In the current repository, review these changed files for blocking architectural/correctness issues only and answer APPROVE or REJECT with blockers only:
- server/services/ExecutionContractResolver.js
- server/routes/swarm.js
- server/services/SwarmEngine.js
- client/src/canvas/AgentInspector.jsx
- client/src/canvas/SwarmCanvas.jsx
- client/src/hooks/useApi.js
- server/tests/execution-contract-resolver.test.js
- server/tests/swarm-routes.test.js
- client/src/canvas/AgentInspector.test.jsx
- scripts/agent-compiled-preview-playwright-smoke.mjs
- docs/PROGRESSIVE_HARNESS_BUILDER.md
- docs/TASK_PLAN.md
- docs/memory/DECISIONS.md
Focus on source-of-truth boundaries, compiled preview correctness, pack runtime precedence, stale-edge risk, and verification sufficiency.

# Claude output (raw)
---  ## APPROVE  Nessun bloccante architetturale rilevato. Note specifiche sotto.  ---  ### Source-of-truth boundaries Pulite. `ExecutionContractResolver` è dichiarato `derivedOnly: true` nel suo output, non persiste nulla nel workflow, e `buildHarnessDomain` restituisce correttamente l'autorità come `'pack-authoritative'` quando il pack è presente. La separazione `WorkflowDefinition / AgentDefinition / HarnessContract / CompiledExecutionContract` è rispettata in tutti e quattro i layer.  ### Compiled preview correctness Corretta per il path del tipo "guided authoring". Un'osservazione di scope:  > **`AgentInspector.jsx:1320-1323`** — il client invia al compiled-preview endpoint solo `workflowDef` e `selectedAgentId`, senza `runtimeProvider`, `runtimeModels`, o `pack`. Il resolver riceve sempre `runtimeProvider: 'auto'` senza contesto di pack. L'anteprima dell'ADC riflette la definizione dell'agente con provider derivato dal modello scelto, **non** l'override di run o la runtime policy del pack. Questo è un limite documentato del V18 scope (PROGRESSIVE_HARNESS_BUILDER.md §5 journey 3), non un errore, ma è opportuno che sia esplicitamente riconosciuto: il preview pack-linked potrebbe mostrare un provider diverso da quello effettivo a runtime.  ### Pack runtime precedence Implementata correttamente. La condizione `requestedProvider === 'auto' && packRuntimeProvider && packRuntimeProvider !== 'auto'` a `ExecutionContractResolver.js:107-112` corrisponde esattamente all'ordine dichiarato nella precedence matrix (`explicit override → pack policy → agent model → server default`). Quando `requestedProvider` è esplicito, il pack non sovrascrive — corretto per design.  ### Stale-edge risk Assente. `AgentInspector.jsx:1313` preferisce le `edges` prop live (React Flow state) e fa fallback a `workflowDef.edges` solo se `edges` non è un array. Il dep array dell'`useEffect` a riga 1340 include esplicitamente `edges`. `SwarmCanvas.jsx:1206` passa sempre il live state.  ### Verification sufficiency Un gap da monitorare (non bloccante ora):  > **`scripts/agent-compiled-preview-playwright-smoke.mjs:128-162`** — lo smoke test usa un server stub con `buildPreview` hardcoded. **Non esercita il vero `ExecutionContractResolver`**. Se il resolver introduce una regressione nello schema dell'output (es. campo rinominato), i test unitari la coglieranno ma lo smoke passerà lo stesso, dando falsa sicurezza sull'integrazione UI↔API. Accettabile per il V18 (resolver coperto da `execution-contract-resolver.test.js`), ma il path end-to-end completo non è mai validato in modo automatico.  ---  **Nessun REJECT** — il codice può procedere. Le due osservazioni sopra non richiedono correzioni bloccanti ma sono utili da tracciare come debt se il scope si espande (ADC con pack context, smoke test full-stack).

# Concise summary
Claude CLI review approved the change set.

# Action items / next steps
- Continue with final Ralph reconciliation and completion logs.
