# Visual Input / Output Blocks Implementation Notes

Last updated: 2026-04-12

Binding plan inputs:

- `.omx/plans/prd-vio-20260412T121449Z.md`
- `.omx/plans/test-spec-vio-20260412T121449Z.md`

This document now serves two purposes:

1. the original design/guardrail note for the approved Visual I/O plan; and
2. the follow-up merge-readiness review for the implementation landed in commit
   `859d21f`.

## Product Direction

The approved direction is **node-first UX with contract-backed runtime
compatibility**:

1. Users design workflow inputs and artifact extraction on the canvas.
2. Visual Input nodes and Output Extractor nodes are the user-facing source of
   truth when present.
3. Existing `inputContract` and `outputContract` fields remain the internal
   bridge and legacy fallback.
4. Input and Output Extractor nodes are non-executable graph nodes:
   - Input nodes run during workflow preparation.
   - Output Extractor nodes run during result/artifact assembly.
   - Neither node type may spawn agent PTY/stream-json/codex-sdk sessions.

## Follow-up Review Status — 2026-04-12

### Current implementation snapshot

The current system now includes:

- visual Input node and Output Extractor node palette/inspector support;
- node-derived workflow `inputContract` / `outputContract` bridging;
- run-form rendering for text + image metadata inputs;
- agent-scoped prompt injection for connected visual inputs; and
- workflow-result artifact generation from Output Extractor nodes.

### Review findings fixed in this follow-up

1. **Client/server image metadata mismatch**
   - `WorkflowRunModal` submitted `mimeType`, while server validation only
     trusted `type`.
   - Result: browser-generated visual image inputs could fail server-side even
     though the modal accepted them.
   - Fix: server now accepts the client payload shape, normalizes `mimeType`
     and `type` together, and keeps the metadata-only boundary intact.

2. **Image size-cap drift**
   - Client UI allowed 10 MB while server validation enforced 5 MB.
   - Fix: the run-form gate is now aligned to the server-enforced 5 MB cap.

3. **Extractor provenance / source-policy gap**
   - Output Extractor artifacts were still effectively reading a single legacy
     `sourceNodeId`, which bypassed `firstIncoming` / `allIncoming` /
     `selected` behavior and lost provenance.
   - Fix: workflow results now resolve extractor artifacts from the configured
     source policy and attach artifact provenance in the result payload.

### Security boundary review

- Image inputs remain **metadata/reference only**. No raw `data`, `base64`,
  `path`, or `absolutePath` payload is accepted.
- The current run form captures a selected image file and normalizes it into
  safe metadata for workflow execution, but the MVP still does **not** expose a
  durable run-asset retrieval path that would let agents open uploaded image
  bytes directly.
- Server validation now rejects traversal-style image names such as
  `../secret.png`; the client-side filename check is no longer the only guard.
- Canonical cap: **5 MB per image metadata reference**.
- Allowed MIME types remain:
  - `image/png`
  - `image/jpeg`
  - `image/webp`
  - `image/gif`

### Merge-readiness verdict

**Verdict: ready after this follow-up patch, with a deliberate MVP boundary.**

No remaining blocker was found in the reviewed Visual I/O path after fixing the
client/server metadata contract and extractor provenance behavior. Remaining
future work is enhancement-oriented (true run-asset image access, richer
upload/storage flow, more artifact formats/viewers), not a correctness blocker
for the current MVP.

## Original Planning Baseline Map (Historical)

### Contract bridge baseline

- `server/services/workflowContracts.js`
  - Normalizes root-level `inputContract` / `outputContract`.
  - Validates typed text/textarea/number/integer/boolean/json/enum inputs.
  - Builds `workflowRun` context and canonical `workflowResult`.
  - Current gap for this plan: there is no effective graph-derived contract
    helper yet, `image` input is not allowed, `table` artifact format is not
    allowed, and extractor artifacts currently fall back to aggregate/final text.
- `server/services/WorkflowStore.js`
  - Persists the root contracts with safe defaults.
  - Current gap: no explicit visual node data normalization/compatibility
    contract for `input` or `outputExtractor` nodes.

### Canvas baseline

- `client/src/canvas/SwarmCanvas.jsx`
  - Registers current node types (`agent`, `department`, `trigger`, flow-control
    nodes, etc.) and centralizes `buildNodeData()` / drag/drop creation.
  - Current gap: no `input` or `outputExtractor` node registration/default data.
  - Risk to address during implementation: palette drop preview currently only
    previews `agent` nodes; new node types can be safely added without preview or
    the preview logic should be generalized deliberately.
- `client/src/canvas/NodePalette.jsx`
  - Provides draggable Agent, Department, and Webhook Trigger cards.
  - Current gap: no Input or Output Extractor cards.
- `client/src/canvas/AgentInspector.jsx`
  - Edits existing node types and current free-text agent `expectedOutput`.
  - Current gap: no Input node editor, no Output Extractor editor, and no
    structured `expectedOutputContract` editor.
- `client/src/hooks/useCanvasValidation.js`
  - Current start-node validation treats every incoming edge target as making an
    agent non-root.
  - Required change for visual Input nodes: ignore `input -> agent` edges for
    start-agent detection so a connected Input node does not make an agent
    non-startable.

### Run form and settings baseline

- `client/src/canvas/WorkflowRunModal.jsx`
  - Renders a flat form from root `inputContract`.
  - Current gap: no grouped fields by Input node and no image upload/reference
    control.
- `client/src/views/SwarmView.jsx`
  - Opens the run modal from `workflowDef.inputContract`, auto-saves dirty
    contracts before direct workflow run, and passes `workflowInput`.
  - Current gap: no effective input model derived from nodes/edges.
- `client/src/canvas/WorkflowSettingsModal.jsx`
  - The Interface tab is editable for root contracts.
  - Required policy change: when visual Input or Output Extractor nodes exist,
    this tab must become a read-only summary or advanced legacy view, not a
    competing editable source of truth.

### Runtime/artifact baseline

- `server/services/SwarmEngine.js`
  - Current `_getStartNodes()` and fan-in setup must be guarded for non-agent
    visual I/O nodes.
  - Current prompt injection uses root `workflowRun` inputs and output contract
    summaries.
  - Required change: compute connected Input nodes per agent and inject only the
    connected input block(s); keep legacy behavior when no visual I/O nodes
    exist.
- `server/services/ExecutionResultsService.js` and
  `server/stores/ExecutionHistoryStore.js`
  - Carry workflow result data through status/results/history.
  - Required change: preserve extractor artifact provenance when available:
    `extractorNodeId`, `sourceNodeIds`, and `sourcePolicy`.

## Implementation Guardrails

### Source-of-truth rule

When a workflow contains visual I/O nodes:

```txt
effective runtime contracts = derive from visual nodes + graph edges
legacy root contracts = compatibility bridge / read-only summary
```

When a workflow contains no visual I/O nodes:

```txt
effective runtime contracts = existing inputContract/outputContract behavior
```

This protects old workflows while preventing two editable sources of truth.

### Non-executable graph semantics

Implementation should introduce an explicit helper/predicate for non-executable
visual I/O nodes, rather than scattering checks:

```txt
isExecutableAgentNode(node) => node.type === "agent" || legacy missing type
isPreparationNode(node) => node.type === "input"
isResultAssemblyNode(node) => node.type === "outputExtractor"
```

The following current-system relationship must remain true:

- A workflow with an Agent node and no incoming executable agent edges still has
  a start agent even if it has an incoming `input -> agent` edge.
- Runtime scheduling never spawns a session for `input` or `outputExtractor`.

### Image input boundary

Image fields must use a controlled run-asset reference boundary:

- accepted types: `image/png`, `image/jpeg`, `image/webp`, and optionally safe
  `image/gif`;
- explicit size cap: recommended 10 MB per image;
- no raw base64 prompt injection by default;
- no arbitrary project filesystem reads;
- traversal filenames and unsafe paths rejected server-side;
- prompt/log payloads include metadata/reference only.

If safe upload/storage is not implemented in the same wave as image UI, image
execution must fail with a clear validation error. It must not silently drop the
image field.

### Output Extractor artifact rule

One Output Extractor node produces one artifact. Missing upstream output must
produce `empty` or `error`; it must not fall back silently to unrelated aggregate
final text. `firstIncoming`, `allIncoming`, and `selected` source policies must
be deterministic and validated against connected/reachable source nodes.

## Code-Quality Review Notes

The current baseline is a good candidate for the planned bridge because the
root contract support is additive and well-contained. The main quality risks for
the next implementation lanes are:

1. **Duplicated schema constants.** Input types and artifact formats appear in
   both client UI and server contract code. If shared constants are not
   introduced, tests must lock the duplication (`image`, `table`, legacy types).
2. **Implicit agent assumptions.** `SwarmCanvas`, `useCanvasValidation`, and
   `SwarmEngine` each assume most graph nodes are executable or agent-like in
   different ways. Visual I/O nodes should be added through explicit predicates.
3. **Source-of-truth drift.** Settings Interface currently edits contracts
   directly. This must be guarded before node-derived contracts can become
   primary.
4. **Artifact fallback behavior.** Existing root artifact assembly intentionally
   falls back to aggregate/final text. Extractor-backed artifacts need a separate
   provenance-aware path to avoid incorrect results.
5. **Upload scope creep.** Image support should remain a run-scoped asset
   boundary, not a general project asset manager.

## Required Gate Evidence Format

Every microwave should record evidence in this format:

```md
#### Test Gate Evidence - MWx.y <name>

- Client impact: Direct / Substitute regression / N/A with rationale
- Client tests: `<command>` -> PASS/FAIL
- Server impact: Direct / Substitute regression / N/A with rationale
- Server tests: `<command>` -> PASS/FAIL
- Current-system relationship test: `<scenario>`
- Specific expected result: `<concrete assertion>`
- Evidence artifact/log: `<path or summary>`
- Decision: PROCEED / BLOCKED
```

Proceed only when all Direct/Substitute tests pass and all N/A rationales are
recorded.

## Documentation Update Scope

For the implementation team, update at minimum:

- `docs/VISUAL_INPUT_OUTPUT_BLOCKS.md` as the feature-facing design/ops note.
- `docs/memory/CODE_MAP.md` when new helpers/components/routes land.
- `docs/memory/CONTEXT.md` when the active wave changes.
- `docs/memory/PROGRESS.md` with per-wave verification summaries.
- `docs/memory/ACTIVITY_LOG.md` with final task evidence.

If an API route is added for run assets, also update `docs/API.md` with the
endpoint, payload shape, CSRF/mutating-header requirement, size cap, MIME
allowlist, and error responses.
