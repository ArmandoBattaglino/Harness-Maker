# Progressive Harness Builder Contract

**Status:** V18 Ralph implementation source-of-truth artifact.

This document records the evidence, canonical boundaries, resolver contract, capability policy, Swarm/Pack coexistence rules, Agent Definition Center IA, IO/artifact alignment, predictability model, and parity gate for the Progressive Harness Builder plan.

## 1. Brownfield source-of-truth audit

| Surface | Current code paths | Current persisted/effective fields | Canonical domain candidate | Drift / soft-authority notes |
| --- | --- | --- | --- | --- |
| Workflow shell | `client/src/views/SwarmView.jsx`, `client/src/canvas/SwarmCanvas.jsx`, `server/routes/workflows.js`, `server/services/WorkflowStore.js` | `name`, `description`, `nodes`, `edges`, `settings`, `initialContext`, `inputContract`, `outputContract` | `WorkflowDefinition` | Visual nodes can derive effective IO and override legacy contracts; Settings Interface remains workflow-native fallback when no visual IO nodes exist. |
| Agent inspector | `client/src/canvas/AgentInspector.jsx`, `server/services/SwarmEngine.js` | `systemPrompt`, `mission`, `model`, `tools`, `skillHints`, `contextSources`, `memorySources`, `expectedOutputContract`, `guardrails`, `handoffPolicy`, `errorRetryPolicy`, `contextVisibility`, `maxTurns` | `AgentDefinition` | Tool allowlists are enforced only on supported Claude structured runs; many quality controls are advisory prompt guidance unless runtime capability support is added. |
| Visual inputs | `workflowInput`/legacy input nodes, `client/src/utils/visualWorkflowContracts.js`, `server/services/workflowContracts.js` | `fields[]`, `prompt`, generated `inputContract` | `WorkflowDefinition` IO, scoped per `AgentDefinition` by edges | Visual input nodes are canonical when present. |
| Output extractors | `outputExtractor` nodes, `WorkflowArtifactBuilder`, `PackResultBuilder`, `workflowContracts.js` | `artifactKey`, `artifactName`, `format`, `sourcePolicy`, `selectedSourceNodeIds`, generated artifact contracts | `WorkflowDefinition` output/artifact contract | `instruction` and `extractionInstruction` remain compatible aliases; resolver treats output contract as derived before runtime. |
| Pack Builder | `client/src/views/PackBuilderView.jsx`, `server/routes/packs.js`, `server/services/packContracts.js`, `server/stores/PackStore.js` | `runtimePolicy`, `dependencies`, `inputSchema`, `knowledgeSources`, `behaviorRules`, `outputSchema`, `artifactDefinitions`, `visibleSteps`, `completionCriteria` | `HarnessContract / PackDefinition` | PackBuilder remains authoritative until parity gate passes. |
| Runtime | `server/services/SwarmEngine.js`, `server/services/ExecutionResultsService.js`, `server/services/ExecutionContractResolver.js` | provider/model strategy, prompt stack, workflowRun, packMetadata, results/artifacts | `CompiledExecutionContract` | Derived-only. Must not become a hidden authoring persistence blob. |

## 2. Canonical domain model and precedence matrix

### WorkflowDefinition
Owns the workflow graph, workflow-level goal/settings/context, workflow-native input/output contracts, and visual IO nodes.

### AgentDefinition
Owns each agent node's mission, prompt, runtime/model preference, tools, semantic skill/context/memory guidance, handoff/error policy, guardrails, and expected output declaration.

### HarnessContract / PackDefinition
Owns pack-level operator schema, knowledge sources, behavior rules, runtime policy, visible steps, artifact definitions, packaging/distribution state, and PackBuilder-specific lifecycle.

### CompiledExecutionContract
Derived-only runtime preview/contract produced by `server/services/ExecutionContractResolver.js`. It includes normalized domains, effective IO, capability matrix, incompatibilities, prompt/memory/handoff/error provenance, and pack overlay context.

| Field family | Precedence order | Effective source rule |
| --- | --- | --- |
| Workflow inputs | visual `workflowInput` nodes -> legacy `workflow.inputContract` | Visual nodes win when present; legacy remains fallback. |
| Workflow artifacts | visual `outputExtractor` nodes -> legacy `workflow.outputContract.artifacts` | Visual extractors win when present; legacy artifacts remain fallback. |
| Runtime provider/model | explicit run override -> pack runtime policy -> agent model -> server default | Pack policy participates only for pack-backed previews/runs. |
| Agent guidance | agent structured fields -> workflow context -> pack knowledge/behavior -> runtime protocol | Compiled prompt stack shows exact ordering. |
| Pack authority | PackBuilder pack fields -> Swarm drill-down preview | Swarm can inspect/edit parity-covered workflow/agent details but does not silently own pack fields. |

## 3. Shared resolver/compiler boundary

`ExecutionContractResolver.compileExecutionContract()` is the shared preview/compiler boundary.

Inputs:
- `workflowDef`
- optional `workflowInput`
- optional `pack` and `packInput`
- `runtimeProvider`, `runtimeModels`
- backend runtime capability snapshot
- optional `selectedAgentId`

Outputs:
- `domains.workflow`, `domains.agents`, `domains.harness`, `domains.compiledExecution`
- `io.inputContract`, `io.outputContract`, `io.visualInputConnections`
- `capabilities.matrix` and selected provider/model states
- `errors`, `warnings`, `info`
- `observability.promptAssemblyOrder`, `memoryPrecedence`, `handoffPolicy`, `errorRetryPolicy`, `outputExpectations`

Route:
- `POST /api/v1/swarm/compiled-preview`
- Returns `{ preview }` on green preview or `{ error, preview, details }` with structured errors when invalid.
- It does not spawn agents or mutate workflows.
- Current V18 scope previews workflow/agent/pack structure and capability truth for authoring, but the Swarm Agent Definition Center currently sends workflow graph state plus `selectedAgentId` only. Pack-linked runtime overrides remain a documented next-step expansion, not hidden preview behavior.

## 4. Provider capability policy

Provider truth is backend-authoritative and previewed before runtime:

| Control | Claude | Codex | Gemini |
| --- | --- | --- | --- |
| Model availability | backend runtime snapshot | backend runtime snapshot | backend runtime snapshot |
| Tool allowlist | enforced for supported Claude structured runs | unsupported | unsupported |
| Skill hints | advisory | advisory | advisory |
| Context/memory sources | advisory | advisory | advisory |
| Expected output contract | advisory | advisory | advisory |
| Guardrails | advisory | advisory | advisory |
| Image inputs | metadata/advisory | unsupported/degraded | unsupported/degraded |
| Handoff/error policy | advisory + runtime protocol | advisory + runtime protocol | advisory + runtime protocol |

Unsupported or advisory controls are surfaced as structured incompatibilities/warnings instead of pretending they are hard-enforced.

## 5. Swarm shell and PackBuilder coexistence

Swarm is the primary shell for workflow/agent harness authoring and compiled previews. PackBuilder remains the pack-authoritative surface for packaging, distribution, fixture release gates, operator schemas, and visible-step authoring until explicit parity gates pass.

User journeys:
1. **Technical direct path:** open Swarm -> edit graph/agent/IO -> inspect compiled preview -> run.
2. **Guided semantic path:** select agent -> fill mission/memory/guardrails/policy fields -> inspect resolved preview.
3. **Pack-linked path:** open pack -> drill down into linked workflow -> inspect Swarm preview -> return to pack-oriented context when needed.
4. **Operator path:** Pack Library remains the launch/monitor/artifact surface.

## 6. Agent Definition Center IA

The Agent Inspector now exposes an additive Agent Definition Center with:
- mission
- memory sources
- guardrails
- handoff policy
- error/retry policy
- compiled preview

Existing sections remain available for model, prompt, tools, context visibility, max turns, start node, skill hints, context sources, and expected output contracts.

Compiled preview exposes:
- effective provider/model/spawn mode
- prompt assembly order
- memory provenance
- IO contract keys/artifacts
- handoff/error policies
- why-this-output-happened explanation
- structured incompatibilities and advisory notes

## 7. Universal IO and artifact alignment

Visual input blocks and output extractors are normalized into workflow input/output contracts by `workflowContracts.js` and included in compiled previews. Pack-backed previews keep pack schemas/artifacts visible under `domains.harness` and `observability.packOverlay` without moving pack ownership into workflow state.

## 8. Predictability and observability

Predictability is explicit rather than implied:
- `guardrails`, expected output, memory/context sources, and handoff/error policies are visible structured `AgentDefinition` fields.
- Compiled preview distinguishes advisory vs unsupported vs enforceable capability behavior.
- Prompt/memory/handoff/error ordering is inspectable before runtime.

## 9. Swarm parity and PackBuilder retirement gate

PackBuilder must not be retired or reduced unless all of the following pass in a future explicit decision:
1. Side-by-side Swarm/Pack fixtures prove equivalent persisted contracts for parity-covered features.
2. Pack/workflow equivalence integration tests pass.
3. Playwright parity smoke covers Swarm and Pack flows.
4. Existing pack publish/fixture/release gates remain green.
5. User explicitly approves the deprecation/retirement step.

Current V18 scope improves Swarm preview/agent authoring while preserving PackBuilder.

## 10. Verification map

- Server resolver: `server/tests/execution-contract-resolver.test.js`
- Swarm preview route: `server/tests/swarm-routes.test.js`
- Agent Definition Center UI: `client/src/canvas/AgentInspector.test.jsx`
- Mandatory Playwright smoke: `scripts/agent-compiled-preview-playwright-smoke.mjs`
