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
