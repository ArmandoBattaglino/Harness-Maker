# Deep Interview Transcript: Visual Input/Output Blocks

- Created UTC: 2026-04-12T11:11:49Z
- Profile: standard
- Context type: brownfield
- Context snapshot: `.omx/context/visual-input-output-blocks-20260412T111149Z.md`
- Final ambiguity: ~13%
- Threshold: <=20%

## Initial Request
User wants workflow inputs/outputs moved out of Settings into visual Input and Output blocks. Output may optionally be an artifact. Inputs/outputs should provide customized information/instructions to agents and define what practical result should be returned.

## Round 1
**Question:** Should input/output blocks be true workflow nodes connectable to agents, or canvas-visible workflow-level configuration blocks?

**Answer:** They should be connectable to agents because that opens many more scenarios.

**Impact:** Scope shifted toward first-class graph nodes with execution semantics, not just visual contract metadata.

## Round 2
**Question:** What first real scenario must become possible through these connections?

**Answer summary:**
- Initial structured Input nodes should collect user input and inject JSON/Markdown into connected agents.
- Agents must be aware of what exists in the flow and what input they receive.
- Long-term desire: capillary control over memory/context injected into each agent.
- Inputs should be blocks and can be multiple.
- Mid-flow input/question blocks should force an agent to ask the user before handing off.
- Per-agent outputs should describe exactly what is passed to the next agent.
- Output Extractor nodes should populate artifacts in typed formats: images, video, multiple images/videos, formatted text, files, tables, Excel, etc.
- One Output Extractor should extract one artifact type.
- Flow-level configuration should later map into packs.

**Impact:** Feature scope includes Input nodes, possible mid-flow user input/HITL, per-agent output contracts, Output Extractor nodes, typed artifacts, and future pack compatibility.

## Round 3
**Question:** What remains out of scope for the first version?

**Answer:** Full/total control of agent context/memory can stay out of scope. It is enough to configure inputs and outputs, including per-agent, to better regulate what they pass.

**Impact:** MVP narrowed: no full context manager in first wave; focus on visual input/output configuration and handoff shaping.

## Round 4
**Question:** Should the implementation be pragmatic/compatible over existing contracts or radical/node-native?

**Answer:** User wanted the radical/node-native option explained more deeply before deciding.

**Impact:** Decision boundary stayed open until the next round.

## Round 5
**Question:** Should canvas/graph be source of truth, or should visual nodes be UI over compatible current contracts?

**Answer:** Move focus to nodes so we can connect them well. As a base to make them work, use the current `inputContract`/`outputContract` system so future development can build on it.

**Impact:** Decision boundary resolved: node-first UX and graph semantics, contract-backed MVP/migration bridge.

## Round 6
**Question:** What demo proves the first version is successful?

**Answer:**
- Concrete ability to add inputs and create them as structured as possible with forms/formats.
- Ability to load images that are in the project.
- Ability to configure inputs and outputs at individual-agent level.
- Good artifact handling inside Output Extractor node.

**Impact:** Success criteria include structured form-capable Input nodes, project image/file input capability, per-agent I/O configuration, and robust Output Extractor artifact handling.

## Round 7
**Question:** For project images/files, should MVP select existing project files or upload/copy files into the project from the UI?

**Answer:** If an input is configured to receive, for example, image + text, then when the workflow starts the form should allow uploading an image and entering the text for that requested input.

**Impact:** MVP must support run-start form fields with mixed input values, at least text plus image upload/reference, tied to an Input node's schema.
