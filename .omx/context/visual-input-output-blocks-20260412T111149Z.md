# Context Snapshot: visual-input-output-blocks

- Created (UTC): 2026-04-12T11:11:49Z
- Mode: deep-interview
- Profile: standard
- Request image: `c:\Users\arman\Downloads\Immagine 2026-04-12 130839.png`

## Task statement
Clarify a feature request: move workflow input/output configuration out of Settings into visual Input and Output blocks on the Swarm canvas. Output blocks may optionally be artifacts. Inputs/outputs are intended as visual blocks that provide custom information/instructions to agents and define what the practical returned result should be.

## Desired outcome
Execution-ready requirements/spec for visually modeled Input/Output blocks in the workflow canvas, ready for `$ralplan` or execution planning.

## Stated solution
- Inputs and outputs should not live in Settings.
- They should be visual blocks on the canvas.
- Output can optionally be an artifact if indicated.
- Input blocks give personalized info/instructions to agents.
- Output blocks specify what agents should practically return.

## Probable intent hypothesis
The user wants workflow contracts to become first-class visual graph concepts instead of hidden modal metadata, so the workflow diagram communicates what enters the workflow, what each agent is asked to use/produce, and what final result/artifact is expected.

## Known facts / evidence
- Screenshot shows current Swarm page with top status sections `Submitted inputs`, `Canonical outputs`, and `Artifacts`, plus a red-marked empty canvas area before the first agent where an input block likely belongs.
- Current interface contracts live in `client/src/canvas/WorkflowSettingsModal.jsx`: `InterfaceTab` renders `Workflow Inputs`, `Canonical Outputs`, and `Canonical Artifacts` rows (around lines 380-452), under modal tabs including `Settings`, `Initial Context`, and `Interface` (around lines 525-568).
- `client/src/canvas/WorkflowRunModal.jsx` renders a run-time form from `inputContract` and summarizes expected outputs/artifacts (around lines 133-183).
- `client/src/views/SwarmView.jsx` persists `inputContract`/`outputContract` on workflow save/run and opens the run modal only when `inputContract` exists (around lines 455-543, 1313-1344).
- `server/services/workflowContracts.js` normalizes/validates `inputContract` and `outputContract`, injects them into workflow run context, and builds workflow outputs/artifacts (around lines 1-90, 103-145, 333-346).
- `server/services/SwarmEngine.js` currently injects workflow run inputs and declared outputs/artifacts into agent prompts and builds terminal workflow results (around lines 6618-6630, 8345-8368).
- Canvas currently registers node types `agent`, `department`, `trigger`, `conditional`, `merge`, `delay`, `loop`, `errorHandler`, `subWorkflow`; no input/output node types yet (`client/src/canvas/SwarmCanvas.jsx`, around lines 43-54).
- Node palette currently exposes `Agent Node`, `Department`, and `Webhook Trigger`; no visual Input/Output cards yet (`client/src/canvas/NodePalette.jsx`, around lines 6-25).
- `omx explore` was attempted first for brownfield lookup but failed because cargo/prebuilt explore binary is unavailable; shell/rg fallback was used.

## Constraints
- Deep-interview only: no implementation in this mode.
- Preserve existing workflow contracts/backward compatibility unless user explicitly wants a migration-only breaking change.
- Existing pack/workflow result/artifact pipeline should likely be reused rather than replaced.
- UI changes require targeted Playwright smoke for visible behavior before implementation completion in later execution mode.
- Must avoid touching unrelated existing worktree changes unless execution later explicitly does so.

## Unknowns / open questions
- Whether Input/Output blocks are workflow-level boundary nodes, per-agent prompt/instruction blocks, or both.
- Whether each block is executable in graph traversal, declarative metadata projected into contracts, or both.
- Whether all existing Settings > Interface contract editing should be removed, hidden, or kept as advanced/legacy.
- How output-as-artifact should be represented: a separate Artifact block, an Output block toggle, or output block type/format selector.
- Whether blocks should be required at workflow edges (e.g. Input -> Agent, Agent -> Output) or can be unconnected contract annotations.
- Migration expectations for existing workflows with `inputContract`/`outputContract`.

## Decision-boundary unknowns
- Can OMX choose the visual grammar (node shapes, labels, connection rules), or does the user want to decide it?
- Can OMX preserve hidden serialized contract fields while replacing the Settings UI with canvas nodes?
- Can OMX keep backward-compatible import/export with old contract fields?
- Can OMX define validation rules for incomplete/unconnected blocks?

## Likely codebase touchpoints
- Frontend: `client/src/canvas/SwarmCanvas.jsx`, `client/src/canvas/NodePalette.jsx`, new `client/src/canvas/nodes/InputNode.jsx`, new `client/src/canvas/nodes/OutputNode.jsx` or `ArtifactOutputNode.jsx`, `client/src/canvas/AgentInspector.jsx`, `client/src/canvas/WorkflowSettingsModal.jsx`, `client/src/canvas/WorkflowRunModal.jsx`, `client/src/views/SwarmView.jsx`, `client/src/utils/sanitizeWorkflow.js`, `client/src/hooks/useCanvasValidation.js`.
- Server: `server/services/workflowContracts.js`, `server/services/WorkflowStore.js`, `server/services/SwarmEngine.js`, `server/routes/swarm.js`, related tests.
- Tests: `client/src/canvas/WorkflowSettingsModal.test.jsx`, `client/src/canvas/WorkflowRunModal.test.jsx`, `client/src/views/SwarmView.test.jsx`, `server/tests/workflow-contracts.test.js`, `server/tests/workflow-routes.test.js`, targeted Playwright smoke.
