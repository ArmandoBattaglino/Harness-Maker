# Deep Interview Spec: Visual Input/Output Blocks

## Metadata

- Created UTC: 2026-04-12T11:11:49Z
- Profile: standard
- Context type: brownfield
- Final ambiguity: ~13%
- Threshold: <=20%
- Context snapshot: `.omx/context/visual-input-output-blocks-20260412T111149Z.md`
- Interview transcript: `.omx/interviews/visual-input-output-blocks-20260412T111149Z.md`
- Source screenshot: `c:\Users\arman\Downloads\Immagine 2026-04-12 130839.png`

## Clarity Breakdown

| Dimension | Score | Notes |
|---|---:|---|
| Intent | 96% | Make workflows more reliable and visually controllable by making I/O explicit in the flow. |
| Desired outcome | 92% | Input/Output/Output Extractor become canvas blocks connectable to agents. |
| Scope | 88% | MVP includes node-first I/O, structured run form, per-agent I/O config, output extractor artifacts. |
| Constraints | 84% | Use current contract infrastructure underneath; do not build total context manager yet. |
| Success criteria | 88% | Demo must show structured text+image input, agent-level output expectations, artifact extraction. |
| Brownfield context | 86% | Current contract pipeline and UI touchpoints identified. |

## Intent

Move workflow input/output/artifact definition out of hidden Settings tabs and into the visual workflow graph so the user can see, connect, and control what each agent receives, what each agent is expected to produce, and what final artifacts are extracted.

The deeper purpose is workflow reliability: agents should not receive an unstructured dump of context. The flow should make the handoff contract visible and configurable.

## Desired Outcome

The Swarm canvas should support first-class visual blocks for:

1. **Input Node** — defines user-provided or flow-provided input, including structured forms and mixed fields such as text + image.
2. **Agent-level Input/Output Configuration** — an agent can be configured to consume specific connected inputs and produce a specific expected output shape for downstream agents.
3. **Output Extractor Node** — consumes agent output and produces a configured artifact.

The user-facing model is **node-first**: the canvas is where inputs, outputs, and extraction are designed. The MVP may remain **contract-backed** internally: current `inputContract` / `outputContract` infrastructure can be reused/generated from the nodes to reduce risk and preserve existing run/result behavior.

## In Scope for MVP

### Visual node model

- Add Input nodes to the canvas/palette.
- Add Output Extractor nodes to the canvas/palette.
- Allow Input nodes and Output Extractor nodes to connect to agents using graph edges.
- The graph connections determine which agent receives which input and which output is extracted.

### Input Node MVP behavior

- Input nodes can define structured fields with form metadata:
  - text
  - textarea / markdown
  - JSON
  - enum/select
  - number/integer
  - boolean
  - image upload field
- A run-start form is generated from connected/configured Input nodes.
- If an Input node asks for image + text, the run form must allow uploading/selecting the image and entering the text.
- The submitted input is normalized into a structured payload that can be injected into connected agents.
- Connected agents receive explicit prompt context identifying:
  - input block name
  - input purpose/help text
  - field names and values
  - image/file reference or uploaded asset metadata

### Per-agent configuration

- Each agent should be configurable for what input blocks it receives.
- Each agent should be configurable for expected output, at least as markdown/text/JSON in MVP.
- Agent output expectation should guide what is handed off downstream.
- Full memory/context management is not part of MVP; per-agent I/O contracts are the first reliability layer.

### Output Extractor MVP behavior

- Output Extractor node consumes output from one or more upstream agents.
- User can configure what artifact it should produce.
- One Output Extractor should focus on one artifact type/definition.
- MVP artifact types should prioritize structured/textual formats already compatible with current pipeline:
  - markdown document
  - text document
  - JSON
  - table/CSV-like structured output
- The system should be designed so richer artifact types can be added later:
  - images
  - multiple images
  - video
  - multiple videos
  - Excel/files

### Contract-backed implementation bridge

- The canvas/node model is the user-facing source of interaction.
- Under the hood, the implementation may generate or reuse existing `inputContract` / `outputContract` shapes.
- Existing workflow run/result/artifact infrastructure should be reused where possible.
- Existing workflows with old contracts must not break.
- Settings should no longer be the primary place to edit workflow I/O. The existing Interface tab may be hidden, deprecated, or made read-only/advanced depending on implementation plan.

### Pack compatibility direction

- Flow-level Input nodes should later map cleanly to pack input fields.
- Output Extractor nodes should later map cleanly to pack artifact definitions.
- MVP should not block this future direction.

## Out of Scope / Non-goals for MVP

- Full capillary control over all memory/context injected into every agent.
- Replacing all context/handoff internals in one wave.
- Full support for generated binary/media artifacts as first-class produced files.
- Fully general file management system.
- Breaking existing saved workflows/import/export without a migration path.
- Removing current contract infrastructure before node-backed behavior is stable.

## Decision Boundaries

OMX may decide without further user confirmation:

- The exact React Flow node component structure and visual styling, as long as Input and Output Extractor are clearly visible/connectable.
- How to serialize node-backed contracts internally, provided the user works from the canvas.
- How to reuse current `inputContract` / `outputContract` as an implementation bridge.
- Validation rules for incomplete Input/Output Extractor nodes.
- Whether Settings > Interface becomes hidden, read-only, deprecated, or an advanced fallback in the MVP plan.
- Initial artifact format set, if markdown/text/json/table are prioritized and richer media/file types are explicitly staged.

OMX should ask before:

- Dropping backward compatibility for existing workflows.
- Implementing a full context/memory manager beyond I/O contracts.
- Treating image/video/Excel/file artifact generation as required in the first implementation wave.
- Moving uploaded files into project folders in a way that mutates user project content without clear consent.

## Constraints

- Preserve existing project security rules for file paths, uploads, and local-only behavior.
- Any upload/file path feature must validate resolved paths and avoid arbitrary filesystem exposure.
- Mutating API calls must retain `X-Requested-With: ClaudeCodeManager` behavior.
- Do not use `shell: true` for process spawning.
- Keep existing workflow execution and artifact result pipeline working.
- UI behavior must be verified with targeted Playwright smoke because this is user-visible workflow canvas behavior.

## Testable Acceptance Criteria

### Canvas / visual modeling

1. User can add an Input Node from the palette/canvas controls.
2. User can add an Output Extractor Node from the palette/canvas controls.
3. Input Node and Output Extractor Node render as distinct visual block types on the canvas.
4. Input Node can be connected to one or more Agent nodes.
5. Agent node can connect to Output Extractor node.
6. Workflow validation reports clear errors for required but incomplete Input/Output Extractor configuration.

### Input configuration and run form

7. Input Node inspector/config UI allows structured field definition including at least text/textarea/markdown/json/enum/number/boolean.
8. Input Node supports an image upload/reference field in the run form for MVP text+image workflows.
9. Run modal/form is generated from visual Input nodes, not manually edited Settings fields.
10. Submitting a run with a text+image Input node records structured input values and image metadata/reference.
11. Connected agent prompt receives the input block explicitly labeled and scoped to that connection.

### Per-agent I/O

12. Agent-level UI allows defining expected output shape/instructions for that agent.
13. Agent expected output is injected into that agent prompt.
14. Downstream agents receive upstream output in a structured/labeled handoff rather than only generic text when an output contract is configured.

### Output Extractor / artifacts

15. Output Extractor node can be configured with artifact name, format, and extraction instructions.
16. Output Extractor produces a run artifact entry when connected upstream output exists.
17. Artifact appears in the existing artifacts/result UI after workflow completion.
18. One extractor maps to one artifact definition/type in MVP.

### Compatibility

19. Existing workflows with `inputContract`/`outputContract` continue to load without crashing.
20. Legacy contract-backed workflows can be migrated/displayed safely or treated as advanced fallback.
21. Workflow save/load/export/import preserves the new nodes and any generated contract bridge fields.

### Verification

22. Unit tests cover node contract normalization/derivation.
23. Client tests cover Input Node / Output Extractor UI and run form generation.
24. Server tests cover workflow run preparation and result/artifact building from node-backed contracts.
25. Targeted Playwright smoke demonstrates: create/load workflow, add input + image/text form, connect to agent, configure output extractor, run or mock-run, observe artifact/result visibility.

## Assumptions Exposed + Resolutions

- **Assumption:** Visual nodes should be more than metadata.  
  **Resolution:** Yes. They must be connectable and affect agent inputs/outputs.

- **Assumption:** A radical node-native rewrite might be desired immediately.  
  **Resolution:** Product should be node-first, but implementation should pragmatically reuse current contracts underneath for MVP.

- **Assumption:** Full agent context control is required immediately.  
  **Resolution:** No. Full context/memory manager is out of MVP; per-agent I/O control is enough initially.

- **Assumption:** Image/file support could mean selecting existing project files only.  
  **Resolution:** User wants run-start form support: if an input asks for image + text, the form should allow uploading image and entering text.

## Pressure-pass Findings

The first answer said connectable nodes would open more scenarios. The pressure pass asked for a concrete scenario and exposed that the real requirement is not just visual decluttering; it is a more reliable flow contract system:

- initial and mid-flow inputs,
- per-agent input/output shaping,
- explicit downstream handoff contracts,
- artifact extraction,
- future pack mapping.

This pressure pass prevented the spec from reducing the feature to a simple Settings UI relocation.

## Brownfield Evidence vs Inference

### Evidence

- `client/src/canvas/WorkflowSettingsModal.jsx` currently hosts Workflow Inputs, Canonical Outputs, Canonical Artifacts in an Interface tab.
- `client/src/canvas/WorkflowRunModal.jsx` currently builds a run form from `inputContract` and summarizes output/artifact expectations.
- `server/services/workflowContracts.js` already validates input/output contracts, injects them into run context, and builds workflow results/artifacts.
- `server/services/SwarmEngine.js` already injects workflow run inputs and declared outputs/artifacts into agent prompts and builds terminal workflow results.
- `client/src/canvas/SwarmCanvas.jsx` currently has no Input/Output node type registrations.
- `client/src/canvas/NodePalette.jsx` currently exposes Agent, Department, and Webhook Trigger but no Input/Output nodes.

### Inference

- Reusing `inputContract` / `outputContract` as a bridge is lower risk than replacing runtime/result infrastructure immediately.
- The existing artifact builder/result UI can likely be extended to consume Output Extractor definitions.
- Image upload needs careful path/storage design and likely should store metadata/reference rather than blindly injecting binary data into prompts.

## Likely Technical Touchpoints

### Frontend

- `client/src/canvas/SwarmCanvas.jsx`
- `client/src/canvas/NodePalette.jsx`
- New `client/src/canvas/nodes/InputNode.jsx`
- New `client/src/canvas/nodes/OutputExtractorNode.jsx`
- `client/src/canvas/AgentInspector.jsx`
- `client/src/canvas/WorkflowSettingsModal.jsx`
- `client/src/canvas/WorkflowRunModal.jsx`
- `client/src/views/SwarmView.jsx`
- `client/src/utils/sanitizeWorkflow.js`
- `client/src/hooks/useCanvasValidation.js`

### Server

- `server/services/workflowContracts.js`
- `server/services/WorkflowStore.js`
- `server/services/SwarmEngine.js`
- `server/routes/swarm.js`
- Potential file upload/project asset endpoint with strict path validation, if not already available.

### Tests

- `client/src/canvas/WorkflowSettingsModal.test.jsx`
- `client/src/canvas/WorkflowRunModal.test.jsx`
- `client/src/views/SwarmView.test.jsx`
- New tests for Input/Output node rendering/configuration.
- `server/tests/workflow-contracts.test.js`
- `server/tests/workflow-routes.test.js`
- Targeted Playwright smoke for visual node workflow.

## Recommended Next Handoff

### Recommended: `$ralplan`

Use consensus planning next to turn this requirements spec into PRD + test spec:

```txt
$ralplan --direct .omx/specs/deep-interview-visual-input-output-blocks.md
```

Expected planning outputs:

- `.omx/plans/prd-visual-input-output-blocks-*.md`
- `.omx/plans/test-spec-visual-input-output-blocks-*.md`

### Alternative: `$ralph`

Use only if the user wants direct persistent execution from this spec:

```txt
$ralph .omx/specs/deep-interview-visual-input-output-blocks.md
```

### Alternative: `$team`

Use if implementing in parallel lanes:

```txt
$team .omx/specs/deep-interview-visual-input-output-blocks.md
```

Suggested lanes:

- Frontend canvas/node UI lane.
- Contract derivation + run form lane.
- Backend execution/result/artifact lane.
- QA/Playwright lane.

## Residual Risks

- Image upload may expand into a broader asset/file management feature if not bounded carefully.
- Per-agent output contracts can become a full typed dataflow system; MVP should avoid overbuilding.
- Contract-backed bridge must not create two competing sources of truth visible to the user.
- Existing uncommitted worktree changes are present; execution planning must account for them before edits.
