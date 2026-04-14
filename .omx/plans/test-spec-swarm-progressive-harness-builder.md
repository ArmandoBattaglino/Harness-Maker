# Test Spec — Swarm Progressive Harness Builder

- Date: 2026-04-14
- Paired PRD: `.omx/plans/prd-swarm-progressive-harness-builder.md`
- Planning mode: `$ralplan`

## 1. Scope under test
This spec defines the verification shape for the Ralph roadmap toward a Swarm-centered, progressive-depth harness builder with explicit single-agent configurability and predictable compiled execution behavior.

## 2. Core verification rule
For every milestone, Ralph must not declare completion until both pass:
- **UI/User gate**
- **Server/Runtime gate**

Both gates must be validated with targeted evidence, not generic confidence claims.

## 3. Global test categories
### UI / user-side
- React component tests
- targeted interaction tests
- Playwright smoke/regression flows

### Server / runtime-side
- unit tests
- integration/route tests
- compiler/resolver contract tests
- runtime behavior tests

### Cross-layer
- source-of-truth matrix checks
- precedence matrix resolution cases
- parity/equivalence fixtures

## 4. Milestone-by-milestone verification matrix

---
## Milestone 1 — Brownfield source-of-truth audit
### UI/User gate — PASS only if
- every current editing surface is mapped to one domain candidate
- missing user-facing controls are listed explicitly

### Server/Runtime gate — PASS only if
- current runtime path is traced end-to-end
- current route payloads touching contracts are catalogued

### Required evidence
- field/source-of-truth matrix artifact
- workflow/agent/pack/runtime ownership inventory
- drift/soft-authority list

### Targeted tests/checks
- inspection-backed assertion table
- route/service mapping verification
- schema ownership consistency review

---
## Milestone 2 — Canonical domain model + precedence matrix
### UI/User gate — PASS only if
- all current editing surfaces map to one canonical domain without ambiguity
- progressive-depth UX requirements are representable in schema terms

### Server/Runtime gate — PASS only if
- precedence rules deterministically resolve conflicts
- no major field family has ambiguous ownership

### Required evidence
- canonical schema table
- precedence matrix table
- compatibility notes for legacy shapes

### Targeted tests
- table-driven precedence resolution cases
- negative conflict cases
- schema ownership assertion tests

---
## Milestone 3 — Shared resolver/compiler boundary
### UI/User gate — PASS only if
- UI can obtain effective previews from one shared resolver path
- semantic/guided edits compile into inspectable structured state

### Server/Runtime gate — PASS only if
- one resolver/compiler can build deterministic compiled execution state
- invalid configurations fail before runtime start

### Required evidence
- resolver input/output contract
- invalid-config reporting contract
- preview boundary design

### Targeted tests
- resolver unit tests
- compiled preview integration tests
- invalid-config rejection tests
- compatibility regression tests for existing workflow/pack execution shapes

---
## Milestone 4 — Provider capability matrix
### UI/User gate — PASS only if
- invalid combinations are surfaced clearly to users
- control availability matches actual runtime truth

### Server/Runtime gate — PASS only if
- unsupported provider/model/tool/runtime combinations are rejected consistently
- fallback logic is deterministic and documented

### Required evidence
- capability matrix artifact
- compatibility policy notes
- UI incompatibility messaging matrix

### Targeted tests
- capability normalization unit tests
- server validation route tests
- UI tests for disabled/blocked/incompatibility states

---
## Milestone 5 — Swarm shell IA + PackBuilder coexistence
### UI/User gate — PASS only if
- Swarm shell is the discoverable home
- technical direct path is preserved
- guided path is optional
- Pack ownership is not confusing

### Server/Runtime gate — PASS only if
- no domain authority is accidentally moved by shell changes
- pack-authoritative flows continue to work untouched

### Required evidence
- IA diagrams / journey tables
- parity checklist draft
- temporary coexistence policy

### Targeted tests
- journey coverage matrix
- smoke checklist for Swarm shell navigation and pack-linked entry points

---
## Milestone 6 — Agent Definition Center
### UI/User gate — PASS only if
- a selected agent exposes inspectable sections for:
  - mission
  - prompts
  - inputs
  - outputs
  - tools/runtime
  - memory
  - handoff
  - guardrails
  - error/retry
  - compiled preview
- non-technical semantic path is usable
- technical deep-edit path exposes full control

### Server/Runtime gate — PASS only if
- every section maps to canonical agent schema or compiled preview output
- no ad hoc runtime field becomes hidden authoring truth

### Required evidence
- IA/spec artifact for sections and depth levels
- semantic→structured mapping rules
- prompt observability design

### Targeted tests
- component tests for agent sections and toggles
- mapping preview integration tests
- Playwright flows:
  - open agent
  - edit core fields
  - inspect compiled preview
  - save and reload

---
## Milestone 7 — Universal IO + artifact contract alignment
### UI/User gate — PASS only if
- users can understand where inputs come from
- users can define/inspect output structure and artifact format
- visual IO and agent/harness contracts feel coherent

### Server/Runtime gate — PASS only if
- canonical contracts derive consistently
- result/artifact builders honor compiled rules
- APIs preserve structured contract behavior

### Required evidence
- IO contract mapping table
- endpoint/API contract notes
- artifact derivation notes

### Targeted tests
- visual IO derivation unit tests
- route validation integration tests
- output/artifact builder regression tests
- UI tests for contract visibility/editability

---
## Milestone 8 — Predictability controls and observability
### UI/User gate — PASS only if
- users can inspect prompt injection order
- users can inspect memory provenance/precedence
- users can inspect handoff policy and output expectations
- users can understand why an output happened

### Server/Runtime gate — PASS only if
- compiled execution contains provenance and predictability data where promised
- runtime honors constraints or surfaces incompatibility explicitly

### Required evidence
- predictability control matrix
- provenance model
- observability UI specification

### Targeted tests
- prompt assembly order tests
- memory attachment ordering/type tests
- handoff policy tests
- error/retry policy tests
- capability incompatibility tests
- Playwright observability smoke

---
## Milestone 9 — Swarm parity and PackBuilder retirement gate
### UI/User gate — PASS only if
- parity-covered PackBuilder journeys are fully reproducible in Swarm
- user experience remains understandable during coexistence/migration

### Server/Runtime gate — PASS only if
- pack-authoritative runs keep working
- parity-covered Swarm-authored scenarios compile to intended equivalent effective behavior

### Required evidence
- parity checklist
- no-regression criteria
- retirement gate document

### Targeted tests
- side-by-side parity fixtures
- pack/workflow equivalence integration tests
- Playwright parity smoke across Swarm and Pack flows

## 5. Mandatory targeted UI tests
1. Technical direct-canvas path
2. Non-technical guided/semantic agent setup path
3. Prompt-to-agent mapping visibility path
4. Agent deep manual edit path
5. Workflow-to-harness authoring path
6. Compiled preview inspection path
7. Pack-linked Swarm authoring path

## 6. Mandatory targeted server/runtime tests
1. Canonical contract resolution
2. Precedence matrix correctness
3. Prompt assembly order
4. Memory attachment ordering and type handling
5. Input/output contract normalization
6. Handoff routing policy
7. Error/retry policy
8. Provider/runtime capability handling
9. Pack overlay resolution compatibility
10. Compiled execution preview determinism

## 7. Playwright smoke minimum set
Ralph must define and eventually run targeted smoke coverage for at least:
1. open Swarm and select/edit an agent
2. inspect compiled prompt/config preview
3. configure tools/runtime/memory/handoff/IO
4. save and reload without losing mapped structure
5. start workflow/harness and verify structured output behavior
6. parity smoke involving pack-linked Swarm path where applicable

## 8. Global exit criteria
The planning/execution program may only be considered complete when:
1. Swarm is the primary shell/UI home.
2. Workflow / Agent / Harness-Pack / Compiled Execution are explicit and non-conflicting.
3. Shared resolver/compiler and precedence matrix are defined before heavy UX consolidation.
4. PackBuilder remains until explicit parity gate passes.
5. UI/user gates and server/runtime gates pass for each completed milestone.
6. Targeted tests exist and pass for each completed milestone.
7. Unsupported provider/runtime configurations surface as structured incompatibilities.
8. Agent configuration becomes inspectable enough to explain prompts, memory, IO, handoffs, runtime, and error behavior.

## 9. Ralph execution note
Ralph should execute milestone-by-milestone in order. No later UI consolidation milestone should be treated as complete if an earlier model/resolver/capability milestone is still open or only partially verified.
