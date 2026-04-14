# PRD — Swarm Progressive Harness Builder

- Date: 2026-04-14
- Source spec: `.omx/specs/deep-interview-harness-builder-personalizzabile.md`
- Planning mode: `$ralplan`
- Consensus status: APPROVED (Planner + Architect + Critic)

## 1. Problem / Context
The repo already contains strong brownfield building blocks:
- Swarm canvas/runtime authoring (`SwarmView`, `SwarmCanvas`, `AgentInspector`, `WorkflowSettingsModal`, `PromptToFlowBar`)
- workflow-native visual IO contracts (`visualIoContracts`, `workflowContracts`)
- pack/harness contract surfaces (`PackBuilderView`, `PackLibraryView`, pack routes/services)
- runtime/provider orchestration (`SwarmEngine`, swarm routes)

But the current authoring model is still fragmented across:
- workflow-level authoring
- agent node editing
- pack/harness contract editing
- runtime-resolved overlays

The user intent is to make **Swarm the primary home** for harness authoring while preserving:
- optional guided/prompt entry
- direct manual editing for technical users
- deep configurability of the **single agent** as the main design center
- predictable outputs via explicit, inspectable configuration

## 2. Product Goals
1. Make **Swarm** the canonical authoring shell.
2. Make the **single agent** fully configurable in fine detail.
3. Support both:
   - non-technical guided/semantic authoring
   - technical direct/manual deep editing
4. Preserve and expose agentic power while improving output predictability.
5. Ensure prompt/guided edits compile into visible structured configuration.
6. Unify workflow/agent/harness/runtime concepts through canonical shared contracts.

## 3. Non-goals
- Do not force all users through prompt/guided entry.
- Do not collapse workflow, agent, pack, and runtime state into one persistence blob.
- Do not retire PackBuilder before explicit Swarm parity gates pass.
- Do not promise unsupported provider/runtime/tool capabilities.
- Do not hide effective configuration behind opaque prompt-only automation.

## 4. Core Principles
1. **Swarm-first shell, not domain collapse.**
2. **Canonical schema before UX consolidation.**
3. **Single-agent configurability is primary.**
4. **Inspectable mapping over hidden magic.**
5. **Predictability through explicit contracts.**

## 5. Canonical Domain Model
### 5.1 WorkflowDefinition
Owns:
- graph topology
- edges / handoff structure
- workflow-level goal/settings
- visual IO nodes
- workflow-level policies

### 5.2 AgentDefinition
Owns:
- mission/role
- prompt layers and injection visibility
- tools access
- memory attachments and policies
- input/output contract bindings
- guardrails/forbidden actions
- runtime/provider/model policy
- handoff policy
- retry/error behavior

### 5.3 HarnessContract / PackDefinition
Owns:
- operator input schema
- knowledge/context overlays
- behavior rules
- output schema
- artifact definitions
- visible steps
- completion criteria
- lifecycle/distribution/fixtures
- harness-level runtime overlays

### 5.4 CompiledExecutionContract
Derived, not persisted as authoring truth. Owns effective resolved execution state:
- resolved prompt stack
- effective memory injection order
- effective input/output/artifact contracts
- resolved runtime/provider/model/tool availability
- resolved handoff/error behavior
- normalized execution payload for runtime and inspection

## 6. Required Precedence Matrix
Resolver/compiler must apply a deterministic merge order:
1. Base WorkflowDefinition
2. Workflow-derived visual IO and workflow settings contracts
3. Harness/Pack overlays
4. AgentDefinition overrides
5. Provider/runtime capability constraints
6. Run-time user inputs / execution payload values
7. Compiled normalization for runtime

This precedence must govern:
- prompt assembly
- input/output contracts
- memory injection
- model/runtime/tool legality
- artifacts/results
- handoff/retry/error rules

## 7. Brownfield Evidence and Gap Map
### Existing strengths
- `PromptToFlowBar` supports workflow scaffold generation.
- `AgentInspector` already edits model, prompt, tools, output guidance, and exposes last assembled prompt debug.
- `WorkflowSettingsModal` already manages workflow goal, mode, budget, loop/circuit/runtime defaults.
- visual IO contract helpers already derive structured workflow input/output/artifact contracts.
- `PackBuilderView` already models pack-owned surfaces: inputs, knowledge/context, behavior rules, outputs/artifacts, visible steps, runtime policy.
- `SwarmEngine` already contains provider/model/runtime/handoff logic and runtime capability logic.

### Gaps to close
1. No explicit canonical split across workflow / agent / pack / compiled execution.
2. No shared resolver/compiler boundary producing one inspectable effective contract.
3. `AgentInspector` is still a node editor, not a full Agent Definition Center.
4. Prompt/guided configuration is workflow-scaffold oriented, not per-agent semantic editing.
5. Prompt injection, memory provenance, and precedence are not surfaced clearly end-to-end.
6. Agent-level predictability controls remain partly advisory rather than enforced/validated.
7. Pack surfaces and Swarm shell lack a parity/convergence roadmap.
8. Tests exist in pieces, but not as milestone-aligned user/server gates.

## 8. Product / UX Proposal
### 8.1 Product frame
Swarm becomes the **main harness authoring shell**.

### 8.2 Experience model
Users may start either:
- directly/manual in Swarm (technical)
- guided/semantic/prompt-assisted (non-technical or hybrid)

### 8.3 Agent Definition Center
Selecting an agent should open a richer authoring center with explicit sections for:
- Overview / mission
- Prompt layers and injection order
- Input contract and provenance
- Output contract and format
- Tools / runtime / model
- Memory attachments and policies
- Handoff policy
- Guardrails / forbidden actions
- Error / retry behavior
- Effective compiled preview / debug

### 8.4 Progressive depth model
Per agent and per workflow shell:
- Guided
- Semantic
- Structured
- Manual / Debug

### 8.5 PackBuilder coexistence
PackBuilder remains valid temporarily as a pack-authoritative editor until Swarm reaches parity through shared canonical model/service boundaries.

## 9. Risks and Mitigations
### Risk: source-of-truth drift
Mitigation:
- canonical domain split
- precedence matrix
- shared resolver/compiler before UX consolidation

### Risk: false predictability from advisory-only controls
Mitigation:
- compiled execution preview
- explicit enforcement vs advisory labeling
- milestone gates validating runtime honor/unsupported capability reporting

### Risk: provider/runtime mismatch
Mitigation:
- canonical capability matrix
- server-side validation
- UI availability/incompatibility surfacing

### Risk: missing memory model
Mitigation:
- create explicit memory schema and compiler stage before major UX rollout

### Risk: PackBuilder parity confusion
Mitigation:
- explicit parity checklist
- no retirement before passing parity gates

## 10. Ralph Execution Plan
Below is the approved sequential roadmap Ralph should follow.

---
## Milestone 1 — Brownfield source-of-truth audit
### Objective
Map current ownership, consumers, and drift across workflow, agent, pack, and runtime fields.

### Ralph tasks
1. Audit workflow fields across Swarm UI/store/routes.
2. Audit agent node fields in `AgentInspector`, node `data`, and runtime consumers.
3. Audit pack schema fields in `PackBuilderView`, routes, services, tests.
4. Audit runtime-resolved fields in `workflowContracts`, `PackResolver`, `SwarmEngine`, result services.
5. Build source-of-truth matrix and duplication/drift inventory.
6. Document unresolved/soft-authority fields.

### UI/User gate — PASS conditions
- Every visible authoring surface is mapped to one canonical domain candidate.
- Missing user-facing controls for required agent configurability are explicitly listed.

### Server/Runtime gate — PASS conditions
- Current runtime path is fully traced from persisted/editable fields to effective execution.
- All route payloads that touch authoring/runtime contracts are catalogued.

### Targeted tests / evidence
- Evidence-backed field matrix
- Route/service ownership table
- Source-of-truth consistency review artifact

---
## Milestone 2 — Canonical domain model + precedence matrix
### Objective
Freeze the canonical split and deterministic merge order.

### Ralph tasks
1. Define WorkflowDefinition schema boundary.
2. Define AgentDefinition schema boundary.
3. Define HarnessContract / PackDefinition schema boundary.
4. Define CompiledExecutionContract as derived-only output.
5. Define precedence matrix for conflicts/overrides.
6. Define compatibility strategy for current brownfield shapes.

### UI/User gate — PASS conditions
- Every current authoring UI can be mapped to one canonical domain without ambiguity.
- Progressive-depth UX can be represented without inventing duplicate persistence.

### Server/Runtime gate — PASS conditions
- Effective contract resolution order is fully specified.
- No field family remains with ambiguous dual ownership.

### Targeted tests / evidence
- Table-driven precedence cases
- Negative conflict cases
- Schema ownership matrix tests (spec-level)

---
## Milestone 3 — Shared resolver/compiler boundary
### Objective
Create the central contract compiler/resolver design before heavy UI convergence.

### Ralph tasks
1. Define `ExecutionContractResolver` (or equivalent) responsibilities.
2. Specify inputs/outputs of the compiler.
3. Define normalization stages.
4. Define invalid configuration reporting.
5. Define preview endpoints/service boundaries.
6. Define coexistence path for PackBuilder and Swarm shell.

### UI/User gate — PASS conditions
- UI can request an inspectable effective preview without reverse-engineering runtime code.
- Guided edits can compile into visible structured state.

### Server/Runtime gate — PASS conditions
- One shared resolver can produce deterministic compiled execution state.
- Invalid combinations are catchable before runtime start.

### Targeted tests / evidence
- Resolver unit test matrix
- Integration contract preview cases
- Invalid-config rejection cases

---
## Milestone 4 — Provider capability matrix
### Objective
Turn provider/runtime/tool differences into explicit product truth.

### Ralph tasks
1. Inventory provider/model/runtime/tool constraints from current runtime.
2. Define normalized capability matrix schema.
3. Define UI exposure/incompatibility rules.
4. Define fallback semantics.
5. Define server enforcement points.

### UI/User gate — PASS conditions
- Users can see when a configuration is unavailable or degraded.
- No hidden invalid combination is silently accepted.

### Server/Runtime gate — PASS conditions
- Server rejects unsupported provider/model/tool/runtime combinations consistently.
- Fallback rules are deterministic and documented.

### Targeted tests / evidence
- Capability normalization unit tests
- Route validation integration tests
- UI availability/error state tests

---
## Milestone 5 — Swarm shell IA + PackBuilder coexistence plan
### Objective
Design Swarm as the shell without collapsing domain ownership.

### Ralph tasks
1. Design Swarm information architecture.
2. Define where workflow/agent/harness/compiled preview live in the shell.
3. Define PackBuilder temporary role.
4. Define parity checklist before PackBuilder retirement.
5. Define migration/deprecation decision gate.

### UI/User gate — PASS conditions
- Swarm-first shell is clear and discoverable.
- Technical direct path remains intact.
- Guided path remains optional.
- Ownership is not confusing to users.

### Server/Runtime gate — PASS conditions
- No domain authority is reassigned implicitly by UI shell changes.
- Existing pack-authoritative flows remain valid.

### Targeted tests / evidence
- UX journey matrices
- Swarm-vs-Pack parity checklist draft
- Playwright target list for future parity validation

---
## Milestone 6 — Agent Definition Center spec
### Objective
Define the full agent-centric editing experience.

### Ralph tasks
1. Specify tabs/sections for mission, prompts, IO, tools/runtime, memory, handoff, guardrails, error/retry, compiled preview.
2. Define progressive-depth behavior within the agent editor.
3. Define semantic-to-structured mapping flows.
4. Define prompt injection observability surfaces.
5. Define effective compiled preview per agent.

### UI/User gate — PASS conditions
- Non-technical users can configure semantically.
- Technical users can edit every single detail manually.
- Mapping from semantic edits to structured state is inspectable.

### Server/Runtime gate — PASS conditions
- Every agent section maps to canonical schema or compiled preview.
- No ad hoc runtime-only fields become hidden authoring truth.

### Targeted tests / evidence
- Component tests for Agent Definition Center IA
- Mapping preview integration tests
- Playwright targeted agent-edit smoke

---
## Milestone 7 — Universal IO and artifact contract alignment
### Objective
Unify visual IO, pack IO, and runtime result/output contracts.

### Ralph tasks
1. Align visual input nodes with canonical workflow/agent input model.
2. Align output extractor/artifact concepts with harness-pack/output model.
3. Define universal structured input/output endpoint/API needs.
4. Define documentation/source-of-truth format for structured contracts.

### UI/User gate — PASS conditions
- Users can see where input comes from and where output/artifacts go.
- Output structure/format is understandable and editable.

### Server/Runtime gate — PASS conditions
- Effective contracts derive consistently from canonical inputs.
- Result/artifact builders honor compiled contract rules.
- APIs preserve structured contract behavior.

### Targeted tests / evidence
- Contract derivation unit tests
- Route validation integration tests
- UI tests for visual IO + artifact expectations

---
## Milestone 8 — Predictability controls and observability
### Objective
Make agent output predictability explicit and inspectable.

### Ralph tasks
1. Define quality criteria/guardrail model.
2. Define forbidden-action and output strictness controls.
3. Define retry/error/handoff validation rules.
4. Define memory provenance and prompt stack views.
5. Define “why this output happened” surfaces.

### UI/User gate — PASS conditions
- Users can inspect prompts injected and when.
- Users can inspect memory sources and precedence.
- Users can inspect handoff policy and output expectations.
- Users can understand why an output happened.

### Server/Runtime gate — PASS conditions
- Compiled execution includes provenance/predictability data where applicable.
- Runtime enforces or explicitly marks unsupported predictability controls.

### Targeted tests / evidence
- Prompt assembly order tests
- Memory provenance/order tests
- Handoff/error policy tests
- Capability incompatibility tests
- Playwright observability smoke

---
## Milestone 9 — Swarm parity checkpoints and PackBuilder retirement gate
### Objective
Only retire/reduce PackBuilder authoring responsibilities after proven parity.

### Ralph tasks
1. Define parity checklist across pack-owned authoring surfaces.
2. Define side-by-side equivalence cases.
3. Define no-regression criteria.
4. Define PackBuilder retirement/deprecation gate.

### UI/User gate — PASS conditions
- Swarm can author parity-covered harness features without ownership confusion.
- User journeys previously handled by PackBuilder are complete in Swarm.

### Server/Runtime gate — PASS conditions
- Pack-authoritative runs continue to resolve correctly.
- Swarm-authored parity scenarios compile to equivalent runtime behavior where intended.

### Targeted tests / evidence
- Side-by-side parity fixtures
- Pack/workflow equivalence integration tests
- Playwright parity smoke for Swarm and Pack flows

## 11. Execution-wide acceptance criteria
1. Swarm remains the primary shell/UI home without becoming the sole data owner.
2. Workflow, Agent, Harness-Pack, and Compiled Execution remain distinct canonical layers.
3. A shared resolver/compiler exists conceptually before UX consolidation work proceeds.
4. Every milestone has explicit UI/user gates and server/runtime gates.
5. Every milestone has targeted tests/evidence, not generic “test later” notes.
6. Pack-authoritative behavior is preserved until parity gates pass.
7. Unsupported provider/runtime capability mismatches surface as structured incompatibilities, not silent degradation.
8. Agent configuration becomes inspectable enough to explain prompt assembly, memory injection, IO, handoff, runtime, and error behavior.

## 12. ADR
### Decision
Proceed with a **schema-first, compiler-first, Swarm-shell consolidation plan**.

### Drivers
- Swarm must remain the home.
- Single-agent configurability is the center.
- Predictability requires explicit compiled configuration.
- PackBuilder cannot be retired before parity.

### Alternatives considered
- Swarm UX-first consolidation without shared model/resolver
- Pack-led long-term primary authoring
- parallel persistence/domain ownership in multiple layers

### Why chosen
- safest brownfield path
- strongest long-term consistency
- best alignment with clarified user intent
- best support for both guided and manual users

### Consequences
- more upfront domain/model work
- temporary coexistence of Swarm shell and PackBuilder editing
- UX gains intentionally sequenced after shared contracts/resolver

### Follow-ups
- generate milestone-aligned test spec
- use this PRD as Ralph source of truth
- do not implement major Swarm UX consolidation before milestones 1–4 are grounded
