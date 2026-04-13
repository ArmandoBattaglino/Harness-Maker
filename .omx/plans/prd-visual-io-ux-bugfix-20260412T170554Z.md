# PRD: Visual I/O UX Bugfix Pass

Source context:
- `.omx/reports/bug_report_visual_io_branch_20260412.md`
- `.omx/context/visual-io-review-fixes-20260412T143141Z.md`
- screenshots: `190002.png`, `190101.png`, `190400.png`

## Goal
Improve the Visual Input/Output authoring UX so users can understand:
1. what the operator fills in,
2. what each connected agent receives,
3. what final artifact/deliverable the user gets,
4. which nodes are invalid via in-node warning dots, not only top validation pills.

## Scope
- Add validation warning dots + validation card support to InputNode and OutputExtractorNode.
- Add agent-facing preview to Input Block inspector.
- Add user-facing deliverable preview to Output Extractor inspector.
- Standardize extractor instruction field handling client-side.
- Remove unsupported selected-source mode from MVP UI.
- Deduplicate validation logic for Input/Output Extractor nodes.
- Keep image input explicitly metadata-only in current MVP.

## Acceptance criteria
- Input and Output Extractor nodes show amber warning dot when they have validation issues.
- Clicking the warning dot opens validation details like agent nodes already do.
- Input Block inspector shows a clear “what the agent receives” preview with connected target agents.
- Output Extractor inspector shows a clear “what the user gets” / artifact preview with connected upstream agents.
- Unsupported `selected` source mode is not exposed as an active authoring path in the MVP UI.
- No duplicate validation issues are produced for the same invalid input/output node.
- Focused client/server tests pass and build remains green.

## Ralplan Refresh — 2026-04-13

Additional findings from screenshots `190400.png` and `035209.png` extend the scope.

### Expanded Goal
Improve the Visual Input/Output authoring UX so users can understand:
1. what the operator fills in,
2. what each connected agent receives,
3. what final artifact/deliverable the user gets,
4. which nodes are invalid via in-node warning dots,
5. how node-local issues relate to the top validation pills,
6. and eliminate stray canvas/control visual artifacts.

### Added Scope
- Define one explicit validation-surfacing model:
  - node-local issues must surface on the node via amber badge + card,
  - workflow-global issues may surface in the top validation rail,
  - aggregation must avoid confusing duplicate phrasing for the same node issue.
- Investigate and fix the stray white vertical canvas artifact visible in the lower-left of the Swarm canvas.
- Keep the new Input/Output previews, but ensure they fit this clearer validation model.

### Added Acceptance Criteria
- Input and Output Extractor node issues are visible on-node via amber badge and validation card.
- The top validation pills do not create confusing duplicate UX for node-local issues; if a node-local issue is summarized globally, the wording/aggregation must make that relationship obvious.
- A minimal workflow with an Input Block and/or Output Extractor no longer shows unexplained white overlay artifacts in the canvas area.
- Focused client tests cover node-local validation badges for Input/Output nodes.
- Focused browser/smoke validation covers the canvas artifact regression when reproducible.

### Added Work Items
- W1: Validation surfacing model and aggregation policy
- W2: Input/Output inspector clarity previews
- W3: Canvas artifact investigation (React Flow control/minimap/overflow/layering)

## Critic Refinement — Validation Ownership + Artifact Repro

### Canonical validation ownership rule

1. **Node-local issue**
   - Owned by the node badge/card.
   - Applies to issues with a concrete `nodeId` (for example: Input block not connected, Output Extractor missing source, invalid field key).
   - The node badge is the primary place where the user should understand and inspect the issue.

2. **Workflow-global issue**
   - Owned by the top validation rail.
   - Applies to issues that are not attributable to a single node or that describe a workflow-level invariant (for example: no agent nodes, no start node, invalid edge category spanning multiple nodes).

3. **Aggregation rule**
   - The top validation rail may summarize node-local issues by count/category, but it must not restate the same issue message verbatim when that message already belongs to a node-local badge/card.
   - The same concrete message text must not appear as both a node-local issue and a top-rail issue for the same node state.

4. **Focus rule**
   - If a top validation pill summarizes node-local issues, interacting with that summary should focus or otherwise guide the user toward the affected node/category instead of acting like a second independent primary error surface.

### Concrete canvas artifact repro contract

The white vertical artifact bug must be reproduced and fixed against this exact scenario before considering the pass complete:

- **View:** Swarm view
- **Viewport:** desktop viewport similar to the provided screenshots (1366x768 or equivalent smoke viewport)
- **Project state:** selected project, minimal workflow loaded
- **Workflow shape:** one `input` node and optionally one `outputExtractor`, with no connected agent required to trigger the visual artifact state
- **UI state:** left node palette visible, right activity/chat rail visible
- **Observed bug:** a narrow detached white vertical rectangle appears in the lower-left area inside the canvas, not associated with any node
- **Expected pass condition:** that detached rectangle is absent while React Flow controls, minimap, and overlays remain usable and visible in their intended positions

### Additional acceptance criteria

- No duplicate identical message text for the same node appears both in node-local validation and top validation pills.
- Input node issues appear on the Input node badge/card; Output Extractor issues appear on the Output Extractor badge/card.
- Global top validation remains for `no agent nodes`, `no start node`, and invalid visual-I/O edge classes.
- The stray white canvas artifact is removed in the concrete repro scenario above without disabling legitimate React Flow controls/minimap functionality.
