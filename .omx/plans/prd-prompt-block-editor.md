# PRD — Prompt Block Editor

- Date: 2026-04-15
- Planning mode: direct (interview-refined)
- Status: DRAFT — awaiting user approval

## 1. Problem

The AgentInspector mixes configuration fields with prompt authoring in a 304px panel. Users fill fields (mission, guardrails, systemPrompt) without knowing what actually gets injected into the agent. Some fields are silently ignored (mission, guardrails), some are duplicated (systemPrompt in PTY), and 7 runtime sections are invisible. There is no way to see, reorder, or debug the assembled prompt.

## 2. Solution

A floating **Prompt Block Editor** panel that opens to the LEFT of an agent node when a gear icon is clicked on hover. Each prompt section from `_buildSystemPrompt()` is shown as a visual block card (same style as NodeOutputCard/NodeValidationCard). Each block has a form state (editable fields) and a preview state (shows the exact text that will be injected). Blocks are draggable to control assembly order. The server respects the user-defined order.

## 3. Non-goals

- No custom/user-defined blocks (only the predefined sections from `_buildSystemPrompt`)
- No changes to pack authority or field ownership
- No schema/persistence migration (block order stored in existing node.data)
- No removal of AgentInspector — it stays but becomes slimmer (essentials only)

## 4. UX Design

### 4.1 Gear Icon on Agent Node

- Appears on hover, positioned to the LEFT of the agent node (mirroring the output dot on the right)
- Icon: small gear (SVG or unicode ⚙), 18x18px, same style as the output-ready dot
- `position: absolute; top: 0; right: calc(100% + 6px);`
- On click: toggles the PromptBlockEditor panel open/closed
- When panel is open, gear icon stays visible (not just on hover)

### 4.2 PromptBlockEditor Panel

- Floating card, positioned to the LEFT of the node: `left: auto; right: calc(100% + 14px);`
- Same visual style as NodeOutputCard:
  - `w-[380px] max-h-[520px]`
  - `rounded-lg border border-indigo-500/30 bg-gray-950/[0.98] backdrop-blur-sm shadow-[0_8px_18px_rgba(0,0,0,0.28)]`
  - slide-in animation (mirrored for left side)
- Classes: `nowheel nodrag nopan` (same as NodeOutputCard)
- Header: agent name + block count + estimated tokens + close button
- Footer: "Copy assembled prompt" button (same style as NodeOutputCard footer)
- Body: scrollable list of prompt block cards

### 4.3 Prompt Block Cards

Each block is a card inside the panel body. Two visual states:

**Collapsed state** (default):
```
┌─ 🔵 Your Role ─────────────── [▼] ──┐
│ "Analizza il codebase e trova..."    │
│ [user-authored]              ≡       │
└──────────────────────────────────────┘
```
- Color dot by source type (blue=user, purple=pack, orange=runtime, gray=system)
- Title of the block
- First ~80 chars of compiled text as preview snippet
- Source label: `[user-authored]`, `[from pack]`, `[runtime only]`, `[system]`
- Drag handle (≡) for reorder
- Expand button [▼]

**Expanded state**:
```
┌─ 🔵 Your Role ─────────────── [▲] ──┐
│                                      │
│ [Form fields for this block]         │
│ ┌──────────────────────────────────┐ │
│ │ System Prompt                    │ │
│ │ ┌──────────────────────────────┐ │ │
│ │ │ Analizza il codebase...      │ │ │
│ │ └──────────────────────────────┘ │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Preview ─────────────────────────    │
│ ┌──────────────────────────────────┐ │
│ │ === YOUR ROLE ===                │ │
│ │ Analizza il codebase e trova i   │ │
│ │ bug critici nel modulo auth...   │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```
- Form section: the editable fields relevant to this block
- Preview section: the exact text as it will appear in the assembled prompt, in a `<pre>` or code-style box
- Non-editable blocks (pack, runtime, system) show only the preview

### 4.4 Block Definitions

10 predefined blocks, mapped to the sections in `_buildSystemPrompt()` (SwarmEngine.js:6536-6762):

| # | Block ID | Title | Source | Editable | Form Fields | Preview Source |
|---|----------|-------|--------|----------|-------------|----------------|
| 1 | `role` | Your Role | user | Yes | `systemPrompt` textarea (+ `mission` merged) | Lines 6637-6648 |
| 2 | `guardrails` | Guardrails | user | Yes | `guardrails` textarea | NEW — will be added to prompt |
| 3 | `guidance` | Quality Guidance | user | Yes | `tools` checkboxes, `skillHints` input, `expectedOutput` textarea, `expectedOutputContract` format+instructions | Lines 6681-6687 via `_buildAgentGuidanceLines()` |
| 4 | `awareness` | Agent Awareness | runtime | No | — | Lines 6627-6633 (`_buildAgentAwareness`) |
| 5 | `inputs` | Workflow Inputs | runtime | No | — | Lines 6654-6678 |
| 6 | `pack-knowledge` | Pack Knowledge | pack | No | — | Lines 6689-6693 |
| 7 | `pack-rules` | Pack Behavior Rules | pack | No | — | Lines 6695-6704 |
| 8 | `handoffs` | Inbound Handoffs | runtime | No | — | Lines 6706-6713 |
| 9 | `history` | Interaction History | runtime | No | `contextVisibility` select (full/minimal/roleOnly) | Lines 6715-6730 |
| 10 | `protocol` | Protocol | system | No | — | Lines 6732-6744 |

Conditional block (appears only when HITL mode is active):
| 11 | `hitl` | HITL Protocol | system | No | — | Lines 6747-6759 |

**Default order**: role, guardrails, guidance, awareness, inputs, pack-knowledge, pack-rules, handoffs, history, protocol, hitl

### 4.4.1 Expert-Level Blocks (Claude Code CLI Injections)

These blocks are **hidden by default** and visible only when the user enables "Expert Mode" via a toggle in the panel header. They represent injections that happen at the Claude Code CLI level — outside of `_buildSystemPrompt()` — and give power users full visibility and control over everything that reaches the agent.

| # | Block ID | Title | Source | Editable | What it shows | Origin |
|---|----------|-------|--------|----------|---------------|--------|
| E1 | `cli-bootstrap` | Runtime Bootstrap | cli | No | The bootstrap prompt injected by `_buildRuntimeProviderBootstrapPrompt()`: `"Claude runtime is active for this Swarm agent. Continue the workflow using the shared task context below."` + fallback info if applicable | SwarmEngine.js:1864-1885 |
| E2 | `cli-system-prompt` | CLI System Prompt | cli | No | The `--append-system-prompt` flag value passed to the Claude PTY process. Shows the raw systemPrompt text as it's injected at CLI level (PTY mode only — not present in stream-json mode) | SwarmEngine.js:4571-4578 |
| E3 | `cli-flags` | CLI Launch Flags | cli | No | All flags passed to the Claude binary: `--model`, `--output-format`, `--verbose`, `--dangerously-skip-permissions`, `--session-id`/`--resume`, `--tools` | SwarmEngine.js:5868-5892, RUNTIME_PROVIDER_PROFILES:411-455 |
| E4 | `cli-claude-md` | Project Instructions | cli | No | The content of the project's `CLAUDE.md` file, which Claude Code automatically reads and injects into every conversation. Shows the exact text the agent receives as project context | Auto-injected by Claude CLI from `CLAUDE.md` in project root |
| E5 | `cli-tools-allowlist` | Tool Allowlist | cli | Partial | The tools passed via `--tools` flag (default: `Bash,Read,Edit,Write,Grep,Glob,LS`). Shows exactly which tools the agent can use. Editable via the `tools` field already in the `guidance` block, but shown here as the CLI-level representation | SwarmEngine.js:5883-5889 |

**Expert block behavior:**
- All expert blocks have a `cli` source type and are colored **red** (🔴) to distinguish from the 4 standard source types
- Expert blocks are **always read-only** — they are informational, showing what Claude Code injects automatically
- `cli-tools-allowlist` is the only partially editable one — editing the tools checkboxes in the `guidance` block updates this block's preview
- Expert blocks appear **below** the standard blocks, in a separate "CLI Injections" collapsible section
- The `cli-system-prompt` block (E2) shows a ⚠️ warning badge when the PTY `--append-system-prompt` is active, indicating the double injection issue (until Step 2 fix removes it)
- The `cli-claude-md` block (E4) reads `CLAUDE.md` from the project root via a new field in the prompt-preview response; if no `CLAUDE.md` exists, shows `[No project CLAUDE.md found]`
- When expert mode is off, the token estimate in the header still includes CLI injection tokens, but with a note: `~2.4K tokens (+ ~0.8K CLI)` so the user knows there's more

**Expert mode toggle:**
- Small toggle in the panel header: `[⚙ Expert]` — off by default
- State stored in `localStorage` (not in node.data — it's a UI preference, not workflow config)
- When toggled on, the CLI Injections section smoothly expands below the standard blocks

### 4.5 Block Ordering and Toggling

- Blocks are draggable via the ≡ handle to reorder
- Order is stored in `node.data.promptBlockOrder` as an array of block IDs
- If `promptBlockOrder` is not set, the default order above is used
- Each block can be toggled enabled/disabled via a subtle toggle on the card
- Disabled state stored in `node.data.promptBlockDisabled` as `{ [blockId]: true }`
- System blocks (`protocol`) cannot be disabled — toggle is hidden
- Runtime blocks can be disabled (user may not want agent awareness or transcript)

### 4.6 Inspector Slimming

When the Prompt Block Editor exists, the Setup tab in AgentInspector keeps ONLY:
- Agent name (header, already there)
- Model selector
- Start Node checkbox
- Department selector
- Handoff policy, Error policy, Max turns (these are runtime policies, not prompt content)
- Context Visibility selector

REMOVED from inspector (moved to block editor):
- System Prompt textarea → `role` block
- Mission textarea → merged into `role` block
- Guardrails textarea → `guardrails` block
- Skill hints → `guidance` block
- Expected output → `guidance` block
- Expected output format/instructions → `guidance` block
- Context sources / Memory sources → `guidance` block
- Tools checkboxes → `guidance` block
- Effective Preview section → replaced by block editor preview

## 5. Server Changes

### 5.1 New endpoint: `POST /api/v1/swarm/prompt-preview`

Request:
```json
{
  "workflowDef": { ... },
  "selectedAgentId": "agent-1",
  "blockId": "role" | null
}
```

Response:
```json
{
  "blocks": [
    {
      "id": "role",
      "title": "Your Role",
      "source": "user",
      "enabled": true,
      "compiledText": "=== YOUR ROLE ===\nAnalizza il codebase...",
      "tokenEstimate": 45
    },
    {
      "id": "guardrails",
      "title": "Guardrails",
      "source": "user",
      "enabled": true,
      "compiledText": "Guardrails: Non cancellare mai file...",
      "tokenEstimate": 12
    },
    ...
  ],
  "assembledPrompt": "=== YOUR ROLE ===\n...\n=== AGENT QUALITY GUIDANCE ===\n...",
  "totalTokenEstimate": 340,
  "blockCount": 8,
  "cliInjections": {
    "bootstrapPrompt": "Claude runtime is active for this Swarm agent.\nContinue the workflow using the shared task context below.",
    "appendSystemPrompt": "Analizza il codebase...",
    "launchFlags": ["--model", "opus", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--session-id", "uuid-here", "--tools", "Bash,Read,Edit,Write,Grep,Glob,LS"],
    "claudeMdContent": "# Claude Code Visual Manager\n\n## Project Overview\n...",
    "claudeMdPath": "C:/Users/arman/.../CLAUDE.md",
    "toolsAllowlist": ["Bash", "Read", "Edit", "Write", "Grep", "Glob", "LS"],
    "totalCliTokenEstimate": 820
  }
}
```

- When `blockId` is null, returns all blocks with their compiled text
- When `blockId` is set, returns only that block (for live preview on edit)
- Uses the same compilation logic from `_buildSystemPrompt()` but split per section
- Runtime-only blocks return placeholder text: `[Populated at runtime: inbound handoffs from upstream agents]`
- `cliInjections` is always included in the response — the client decides whether to show it based on expert mode toggle
- `claudeMdContent` reads the project `CLAUDE.md` via `fs.readFile()` at the project path; returns `null` if not found
- `appendSystemPrompt` is `null` when mode is stream-json (only used in PTY mode)
- `launchFlags` are simulated based on the node's provider and model config — they show what would be passed to the CLI at runtime

### 5.2 Modify `_buildSystemPrompt()` in SwarmEngine.js

- Read `node.data.promptBlockOrder` to determine section assembly order
- Read `node.data.promptBlockDisabled` to skip disabled blocks
- If no custom order, use the default order (backward compatible)
- Fix discrepancy: add guardrails to prompt (currently missing)
- Fix discrepancy: merge mission into role section (currently mission is ignored)
- Fix discrepancy: remove `--append-system-prompt` from PTY spawn (line 4576) since systemPrompt is already in the assembled prompt

### 5.3 Refactor `_buildSystemPrompt()` into block functions

Extract each section into a named function:

```js
_buildBlock_role(node, workflowContext) → string
_buildBlock_guardrails(node) → string
_buildBlock_guidance(node) → string
_buildBlock_awareness(execution, nodeId) → string
_buildBlock_inputs(workflowContext, nodeId, execution) → string
_buildBlock_packKnowledge(workflowContext) → string
_buildBlock_packRules(workflowContext) → string
_buildBlock_handoffs(inboundHandoffs) → string
_buildBlock_history(execution, visibility) → string
_buildBlock_protocol(handoffTargets) → string
_buildBlock_hitl(execution) → string
```

Then `_buildSystemPrompt()` iterates the block order and calls each function. The prompt-preview endpoint reuses these same functions.

## 6. Implementation Steps

### Step 1 — Server: refactor `_buildSystemPrompt()` into block functions
- File: `server/services/SwarmEngine.js`
- Lines: 6536-6762 → extract into 11 `_buildBlock_*` methods
- `_buildSystemPrompt()` becomes a loop over block order
- Add guardrails to `_buildBlock_guardrails()` (FIX: currently missing)
- Merge mission fallback into `_buildBlock_role()` (FIX: currently ignored)
- Read `node.data.promptBlockOrder` and `node.data.promptBlockDisabled`
- Backward compatible: default order if not set

### Step 2 — Server: remove `--append-system-prompt` duplication
- File: `server/services/SwarmEngine.js`
- Lines: 4575-4578 → remove the `--append-system-prompt` push for Claude PTY
- The system prompt is already in the assembled prompt passed via the session

### Step 3 — Server: new `/api/v1/swarm/prompt-preview` endpoint
- File: `server/routes/swarm.js`
- New POST route that calls the block functions individually
- Returns compiled text per block + assembled full prompt + token estimates
- Runtime blocks return placeholder strings

### Step 4 — Client: gear icon on AgentNode
- File: `client/src/canvas/nodes/AgentNode.jsx`
- Add gear icon button, visible on hover, positioned left of node
- On click: set `expandedPromptEditorNodeId` in SwarmContext store
- Track state in store alongside `expandedOutputNodeId`

### Step 5 — Client: SwarmContext store additions
- File: `client/src/store/SwarmContext.jsx`
- Add: `expandedPromptEditorNodeId: null`
- Add: `setExpandedPromptEditorNodeId(nodeId)`
- Mutual exclusion: opening prompt editor closes output card and vice versa

### Step 6 — Client: PromptBlockEditor component
- File: `client/src/canvas/nodes/PromptBlockEditor.jsx` (NEW)
- Floating card positioned LEFT of node (mirror of NodeOutputCard)
- Same visual style: border, bg, shadow, animation, scroll, nowheel/nodrag/nopan
- Header: agent name + block count + token estimate + close
- Body: scrollable list of PromptBlockCard components
- Footer: "Copy assembled prompt" button
- Calls `POST /api/v1/swarm/prompt-preview` on mount and on field change (debounced)
- Drag-and-drop reorder via HTML5 drag or pointer events (no external lib)

### Step 7 — Client: PromptBlockCard component
- File: `client/src/canvas/nodes/PromptBlockCard.jsx` (NEW)
- Two states: collapsed (snippet + source label) and expanded (form + preview)
- Color coding: blue dot for user, purple for pack, orange for runtime, gray for system
- Drag handle (≡) for reorder
- Toggle enabled/disabled (hidden for system blocks)
- Expanded form: renders the appropriate form fields per block type
- Expanded preview: `<pre>` showing the compiledText from the server response

### Step 8 — Client: slim down AgentInspector Setup tab
- File: `client/src/canvas/AgentInspector.jsx`
- Remove from Setup tab: systemPrompt, mission, guardrails, skillHints, expectedOutput, expectedOutputContract, contextSources, memorySources, tools checkboxes
- Keep: model, isTriageNode, parentDepartmentId, handoffPolicy, errorRetryPolicy, maxTurns, contextVisibility
- Remove: Effective Preview (Derived) section — replaced by block editor
- Remove: CollapsibleSection wrappers for removed sections

### Step 9 — Tests
- Unit test for refactored `_buildSystemPrompt()` block functions
- Unit test for prompt-preview endpoint (including `cliInjections` in response)
- Unit test for PromptBlockEditor rendering
- Unit test for PromptBlockCard collapsed/expanded states
- Unit test for block reorder persistence
- Unit test for expert mode toggle and CLI block rendering
- Integration test: field change in block editor → preview updates
- Verify: guardrails now appear in assembled prompt (regression fix)
- Verify: mission merged into role block
- Verify: no double systemPrompt injection in PTY mode
- Verify: CLI injection blocks show correct data (bootstrap prompt, flags, CLAUDE.md content)

## 7. Acceptance Criteria

### Standard blocks
1. Hovering an agent node shows a gear icon to its left
2. Clicking the gear opens a floating PromptBlockEditor panel to the left of the node
3. The panel shows all 10-11 prompt blocks as cards in the current assembly order
4. Each card shows: color dot, title, source label, snippet of compiled text
5. Clicking a card expands it to show form fields (for user blocks) and full compiled preview text
6. User blocks (role, guardrails, guidance) are editable inline
7. Pack/runtime/system blocks show preview only (read-only)
8. Blocks can be dragged to reorder — order persists in `node.data.promptBlockOrder`
9. Blocks can be toggled enabled/disabled (except system blocks)
10. The compiled preview text matches exactly what `_buildSystemPrompt()` would produce
11. Guardrails now appear in the assembled prompt (bug fix)
12. Mission is merged into the role block (bug fix)
13. SystemPrompt is no longer double-injected in PTY mode (bug fix)
14. The AgentInspector Setup tab contains only essential non-prompt fields
15. The Effective Preview section is removed from the inspector
16. Copy button copies the full assembled prompt to clipboard
17. Panel closes on Escape or click outside (same behavior as NodeOutputCard)
18. Panel style matches NodeOutputCard exactly (border, bg, shadow, animation)

### Expert-level blocks (CLI injections)
19. Panel header has an `[⚙ Expert]` toggle, off by default
20. Toggling expert mode on reveals a "CLI Injections" collapsible section below the standard blocks
21. Expert blocks are colored red (🔴) to distinguish from standard source types
22. `cli-bootstrap` block shows the runtime bootstrap prompt text
23. `cli-system-prompt` block shows the `--append-system-prompt` value (PTY mode only), with ⚠️ badge for double injection
24. `cli-flags` block shows all CLI launch flags as a formatted list (model, output-format, permissions, session, verbose)
25. `cli-claude-md` block shows the full `CLAUDE.md` content from the project root (or `[No project CLAUDE.md found]`)
26. `cli-tools-allowlist` block shows the tools passed via `--tools` flag
27. All expert blocks are read-only — informational only
28. Expert mode preference persists in `localStorage`, not in node.data
29. Token estimate in header shows split: `~2.4K tokens (+ ~0.8K CLI)` even when expert mode is off

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drag reorder UX is clunky without a library | Medium | Use pointer events with visual feedback; if insufficient, add `@dnd-kit/core` (~8KB) |
| Removing fields from inspector breaks existing workflows | Low | Fields are only moved, not deleted — data stays in node.data, just edited from a different surface |
| Token estimation is inaccurate | Low | Use simple `text.length / 4` heuristic with disclaimer; exact count not critical for authoring |
| Block preview endpoint adds server load | Low | Debounce calls (300ms) same as current compiled-preview |
| Users don't find the gear icon | Medium | Add tooltip on first use; gear icon pulses once when agent has no system prompt configured |
| Expert blocks expose internal implementation | Low | Hidden by default; clearly labeled as advanced/informational; red color signals "CLI-level, not workflow-level" |
| CLAUDE.md content could be large | Low | Truncate display at 2000 chars with "Show more" expand; token estimate is always accurate |

## 9. File Change Summary

| File | Action | What changes |
|------|--------|-------------|
| `server/services/SwarmEngine.js` | MODIFY | Refactor `_buildSystemPrompt()` into block functions; add guardrails; merge mission; read block order; remove `--append-system-prompt` duplication |
| `server/routes/swarm.js` | MODIFY | Add `POST /api/v1/swarm/prompt-preview` endpoint with `cliInjections` in response |
| `client/src/canvas/nodes/AgentNode.jsx` | MODIFY | Add gear icon on hover, toggle prompt editor state |
| `client/src/canvas/nodes/PromptBlockEditor.jsx` | CREATE | Floating panel component with block list + expert mode toggle + CLI injection section |
| `client/src/canvas/nodes/PromptBlockCard.jsx` | CREATE | Individual block card with form/preview states; supports `cli` source type (red dot) |
| `client/src/store/SwarmContext.jsx` | MODIFY | Add `expandedPromptEditorNodeId` state |
| `client/src/canvas/AgentInspector.jsx` | MODIFY | Remove prompt fields from Setup tab, remove Effective Preview |
| Tests (multiple) | CREATE/MODIFY | Unit + integration tests for new components, endpoints, and expert blocks |
