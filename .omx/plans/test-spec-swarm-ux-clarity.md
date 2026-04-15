# Test Spec — Swarm UX Clarity Program

- Date: 2026-04-14
- Paired PRD: `.omx/plans/prd-swarm-ux-clarity.md`
- Planning mode: `$ralplan`

## 1. Scope Under Test
This test spec covers the approved two-wave UX clarity program:

- Wave 1: Activity rail + AgentInspector IA + derived preview + blocker clarity.
- Wave 2: Left rail Build/Workflows split + top bar hierarchy + workflow readability + medium-width layout.

## 2. Global Invariants
Every wave must preserve:

- no field ownership changes
- no schema/persistence changes
- no compiled-preview route contract changes
- no pack-owned fields presented as Swarm authoring truth
- no Output/Handoff behavior regressions in Wave 1

## 3. Wave 1 Required Tests

### Component / unit

#### AgentInspector
- tabs are exactly `Setup`, `Output`, `Handoff`
- Setup section headers appear in exact order:
  1. `Essentials`
  2. `Behavior & Output Guidance`
  3. `Context, Memory & Visibility`
  4. `Runtime & Policies`
  5. `Effective Preview (Derived)`
- representative fields remain visible/editable under the correct groups
- preview label includes `(Derived)`
- Output/Handoff rendering parity remains intact

#### SwarmContext / SwarmCanvas
- idle default rail is closed
- manual open/close works
- inbox/HITL event opens the rail
- blocking runtime error opens the rail
- unread activity during active run shows badge only and does not auto-open the rail

#### SwarmView
- missing project copy includes:
  - `Project required`
  - `Select a project in the sidebar to run this workflow.`
- validation blocker summary includes blocker count copy

### Integration / contract
- `POST /api/v1/swarm/compiled-preview` response shape remains unchanged
- no persisted workflow/agent/pack shape changes are introduced
- no pack-owned authoring controls are introduced in Swarm

### Playwright

PW1 — Idle shell starts focused on canvas:
- rail is closed on idle load
- canvas is primary visible workspace
- wide and medium screenshots captured

PW2 — Agent editing shows conservative tab model:
- tabs visible: `Setup`, `Output`, `Handoff`
- no `Results`/`Debug` tab in Wave 1

PW3 — Setup hierarchy is exact:
- headings appear in exact order
- representative fields are under correct sections

PW4 — Derived preview is visible but non-authoritative:
- `Effective Preview (Derived)` visible
- preview content renders when context is valid
- preview is not editable authoring truth

PW5 — Preview empty state is truthful:
- empty-state copy references missing valid context
- no incorrect save/load requirement

PW6 — Missing project blocker messaging:
- `Project required` visible
- `Select a project in the sidebar to run this workflow.` visible
- Run remains blocked

PW7 — HITL/inbox reopens rail:
- rail starts closed
- injected/triggered inbox/HITL event opens rail
- relevant item is visible

PW8 — Unread activity during active run is badge-only:
- non-blocking unread activity leaves rail closed
- unread badge is visible

PW9 — Blocking runtime error reopens rail:
- rail starts closed
- blocking error opens rail
- error state visible

## 4. Wave 2 Required Tests

### Component / unit

#### NodePalette
- split control exists for `Build` and `Workflows`
- Build contains node creation controls
- Workflows contains workflow management controls
- switching preserves action accessibility

#### SwarmView
- required top-bar actions remain available
- workflow identity/prerequisite/primary-action areas are visible
- secondary controls remain reachable

### Integration / contract
- workflow load/save semantics unchanged
- duplicate/export/import action wiring unchanged

### Playwright

PW10 — Left rail separates Build and Workflows:
- Build shows node creation controls
- Workflows shows workflow actions
- switching does not break current workflow state

PW11 — Workflow actions still work from Workflows rail:
- Workflows area opens
- select/load workflow remains reachable
- duplicate/export/import remain present when supported

PW12 — Top bar hierarchy is clearer:
- workflow identity visible without scanning whole bar
- run/save visible
- prerequisite/blocker state near primary controls
- secondary controls do not dominate

PW13 — Medium-width shell remains usable:
- at laptop-ish width, left rail usable
- canvas visible
- top bar does not wrap into unusable clutter
- no obvious overlap/cutoff

PW14 — Workflow selection readability improves:
- workflow list/presentation readable
- current selection visible
- metadata secondary, not dominant

## 5. Evidence Requirements

Wave 1 screenshots:
1. Idle shell wide.
2. Idle shell medium.
3. Setup ordered sections.
4. Effective Preview (Derived).
5. Missing project blocker.
6. HITL auto-open.
7. Badge-only unread.
8. Blocking error auto-open.

Wave 2 screenshots:
1. Build rail.
2. Workflows rail.
3. Top bar before/after.
4. Medium-width shell.
5. Workflow selection with many entries.

## 6. Release Gate
The UX clarity program is green only when:

- all changed component/unit tests pass
- Playwright scenarios for the completed wave pass
- client build passes
- no contract/schema/persistence drift is found
- no pack-authority drift is found
- fresh verification output is read and recorded

