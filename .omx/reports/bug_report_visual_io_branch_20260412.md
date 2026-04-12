# Bug Report — Visual I/O Branch Discovery (2026-04-12)

Scope reviewed:
- Branch diff from `c37c373..HEAD`
- UI-heavy surfaces under `client/src/canvas/*`, `client/src/views/SwarmView.jsx`, `client/src/hooks/useCanvasValidation.js`
- Runtime/contract surfaces under `server/services/workflowContracts.js` and `server/services/SwarmEngine.js`

## Baseline

- Client targeted visual I/O suite: **PASS** (`7 files / 25 tests`)
- Server targeted visual I/O suite: **PASS** (`2 files / 11 tests`)
- Production build: **PASS** (`526 modules`)
- Targeted Playwright smoke (`scripts/visual-io-nodes-playwright-smoke.mjs`): **PASS**
- Live app smoke on `http://127.0.0.1:3000`: no console errors observed on initial Project Dashboard -> Swarm navigation

## Findings

### BUG-01: Image input is still metadata-only, not actually consumable by agents
- **Severity:** HIGH
- **Component:** WorkflowRunModal / workflowContracts / runtime prompt path
- **Steps to reproduce:**
  1. Create or load a workflow with an Input node containing an `image` field.
  2. Start the workflow and upload an image.
  3. Inspect the generated workflow input payload and prompt-side serialization.
- **Expected behavior:** The feature should either (a) provide a real run-scoped asset path/handle usable by agents, or (b) explicitly block execution of image inputs until such access exists.
- **Actual behavior:** The UI accepts an uploaded file, but only metadata (`assetId`, `name`, `mimeType`, `size`, `previewUrl`) is carried forward; no durable asset retrieval path is exposed to agents.
- **Root cause:**
  - `client/src/canvas/WorkflowRunModal.jsx:146-153`
  - `server/services/workflowContracts.js:645-657`
- **Risk:** User-facing promise is stronger than the actual runtime capability.
- **Recommended fix:** Either implement true run-scoped asset storage/retrieval, or explicitly block/label image inputs as metadata-only until the storage path exists.

### BUG-02: Output Extractor `selected` source policy is not actually usable from the UI
- **Severity:** MEDIUM
- **Component:** AgentInspector / extractor contract UX
- **Steps to reproduce:**
  1. Open an Output Extractor node in the inspector.
  2. Try to configure a specific selected source.
- **Expected behavior:** If `selected` source mode is supported, the UI should let the user choose concrete `selectedSourceNodeIds`.
- **Actual behavior:** The runtime supports `selected` internally, but the current UI path does not offer source selection controls. The path has been hidden from the MVP UI, but existing persisted workflows may still carry it awkwardly.
- **Root cause:**
  - UI path previously exposed unsupported mode; current code now hides it, but no migration/normalization path exists for already-persisted `selected` workflows.
- **Risk:** Existing workflows with `selected` may have unclear inspector behavior and future drift.
- **Recommended fix:** Add migration/normalization for persisted `selected` policies, or add a read-only warning when such a workflow is loaded.

### BUG-03: Client/server contract derivation logic is duplicated and drift-prone
- **Severity:** MEDIUM
- **Component:** visualWorkflowContracts / workflowContracts
- **Steps to reproduce:**
  1. Compare client-side derivation of visual input/output contracts with server-side derivation.
  2. Modify one side's schema or field naming.
- **Expected behavior:** One canonical derivation source or very strong parity enforcement.
- **Actual behavior:** Equivalent logic exists twice, once in:
  - `client/src/utils/visualWorkflowContracts.js`
  - `server/services/workflowContracts.js`
- **Root cause:** duplicated derivation/normalization responsibilities.
- **Risk:** silent client/server drift (already happened once with extractor instruction handling and image metadata shape).
- **Recommended fix:** Extract a shared schema/normalization module or add explicit parity tests guarding both implementations.

### BUG-04: Input node editor under-exposes the actual supported schema
- **Severity:** MEDIUM
- **Component:** AgentInspector UI for Input nodes
- **Steps to reproduce:**
  1. Open an Input node.
  2. Try to configure a richer structured field (defaults, enum options, help text, etc.).
- **Expected behavior:** The editor should expose the main fields the data model/runtime already supports, especially for a feature positioned as “structured input blocks”.
- **Actual behavior:** The editor mainly exposes key/label/type/required, but not the full structured surface implied by the model.
- **Root cause:** `client/src/canvas/AgentInspector.jsx:422-540`
- **Risk:** User cannot fully author the richer contract shape from the UI, even though the model suggests that capability.
- **Recommended fix:** Expand the editor or explicitly document the reduced MVP subset in the UI.

## Non-findings / things that look good

- No live console errors were observed during the focused browser pass.
- Current visual I/O targeted tests are green.
- Non-executable graph semantics for Input / Output Extractor are covered by server tests.
- Validation and contract hardening are materially better after the latest follow-up commits.

## Recommended Fix Order

1. **BUG-01** — decide product truth for image inputs (real asset access vs explicit MVP block/label)
2. **BUG-02** — normalize legacy `selected` extractor policies
3. **BUG-03** — reduce or guard against client/server contract derivation drift
4. **BUG-04** — widen or clarify Input node schema authoring UI

### BUG-05: Input Block editor does not make the agent-facing payload clear enough
- **Severity:** MEDIUM
- **Component:** Input Block inspector / authoring UX
- **Evidence:** screenshot `c:\Users\arman\Downloads\Immagine 2026-04-12 190002.png`
- **Steps to reproduce:**
  1. Create or select an Input Block.
  2. Edit the right-side inspector (`Prompt`, field key, type, label, required).
  3. Try to understand what exact structure the connected agent will receive when the workflow runs.
- **Expected behavior:** The editor should clearly explain or preview:
  - what the operator sees in the run form,
  - what exact payload/shape is produced,
  - what fields are injected into the connected agent,
  - and ideally which agents will receive that block.
- **Actual behavior:** The current editor mostly exposes raw field configuration (`Prompt`, `Key`, `Type`, `Label`, `Required`) but does not make the resulting agent-facing payload obvious. The authoring experience feels under-explained and ambiguous.
- **Root cause:**
  - `client/src/canvas/AgentInspector.jsx:422-540`
  - related contract derivation lives in `client/src/utils/visualWorkflowContracts.js` and `server/services/workflowContracts.js`, but that derived shape is not surfaced back to the authoring UI.
- **Risk:** Users may configure Input Blocks incorrectly because they cannot tell what the agent really receives. This can create “it runs but not the way I expected” bugs that are hard to debug.
- **Recommended fix:** Add an inline "What the agent receives" preview or structured summary in the Input Block inspector, including:
  - block label,
  - prompt shown to operator,
  - final field keys/types,
  - example payload,
  - connected target agents.
  Optionally distinguish clearly between user-facing label and agent-facing key.

### BUG-06: Output Extractor editor is not clear enough about what artifact will actually be produced
- **Severity:** MEDIUM
- **Component:** Output Extractor inspector / authoring UX
- **Evidence:** screenshot `c:\Users\arman\Downloads\Immagine 2026-04-12 190101.png`
- **Steps to reproduce:**
  1. Create or select an Output Extractor node.
  2. Edit the inspector (`Artifact key`, `Artifact name`, `Format`, `Source policy`, `Extraction instruction`).
  3. Try to understand exactly what result will be created from upstream output.
- **Expected behavior:** The editor should clearly communicate:
  - what artifact entry will be created,
  - from which upstream source(s),
  - how `source policy` changes behavior,
  - what the produced payload/format will look like,
  - and ideally a preview of the resulting artifact structure.
- **Actual behavior:** The current editor shows low-level fields, but it is still hard to understand the practical output semantics. The UX is configuration-heavy but not explanatory enough.
- **Root cause:**
  - `client/src/canvas/AgentInspector.jsx:542-596`
  - extractor resolution logic exists in `client/src/utils/visualWorkflowContracts.js` and `server/services/workflowContracts.js`, but the resulting artifact behavior is not surfaced back into the authoring UI.
- **Risk:** Users may configure extractors that technically validate but do not match their mental model, especially around source policy and expected artifact shape.
- **Recommended fix:** Add an inline "What this extractor produces" summary/preview including:
  - artifact key/name/format,
  - source mode explanation,
  - upstream connected agent(s),
  - example artifact payload or rendering shape,
  - explicit note about unsupported/deferred modes.
  Also consider simplifying the editor by separating basic mode vs advanced mode.

### BUG-07: It is still too hard to understand/setup what a workflow run will actually reproduce
- **Severity:** HIGH
- **Component:** overall visual I/O authoring flow (Input + Output + run semantics)
- **Steps to reproduce:**
  1. Create a workflow with Input Block(s), Agent(s), and Output Extractor(s).
  2. Try to understand, before running, what concrete behavior/result the workflow will produce.
- **Expected behavior:** The authoring UI should make setup simple and predictable: what is collected, what reaches each agent, and what the run should produce should be obvious before execution.
- **Actual behavior:** The current setup still feels too abstract; it is hard to know exactly what will be reproduced by the run and how the pieces map to the final result.
- **Risk:** Users may create workflows that technically run but are not predictable enough to trust.
- **Recommended fix:** Add explicit end-to-end authoring previews: input summary, agent-facing payload summary, and final output/artifact contract summary visible before run.

### BUG-08: Output configuration does not yet guarantee a user-usable final deliverable
- **Severity:** HIGH
- **Component:** Output/Extractor semantics
- **Steps to reproduce:**
  1. Configure Output Extractor and/or agent expected output.
  2. Ask whether the resulting artifact is something the end user can immediately use.
- **Expected behavior:** Output configuration should make it clear that the workflow creates a concrete, usable deliverable for the user (report, file, artifact, etc.), not only an internal runtime transformation.
- **Actual behavior:** The current output model still feels too internal/configurational; it is not obvious enough that the result becomes a concrete user-usable deliverable.
- **Risk:** Users may not trust or adopt the feature because output feels like system wiring rather than product outcome.
- **Recommended fix:** Reframe Output/Extractor authoring around user-facing deliverables. Add a preview/summary like "What the user gets" and ensure artifact/result UI makes the final usable output prominent.
