# Deep Interview Spec — Harness Builder Personalizzabile

## Metadata
- Profile: standard
- Rounds: 10
- Final ambiguity: 0.03
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: .omx/context/harness-builder-personalizzabile-20260414T133007Z.md
- Transcript: .omx\interviews\harness-builder-personalizzabile-20260414T135500Z.md

## Clarity breakdown
| Dimension | Score |
|---|---:|
| Intent | 0.98 |
| Outcome | 0.95 |
| Scope | 0.97 |
| Constraints | 0.95 |
| Success criteria | 0.75 |
| Context | 0.94 |

## Intent
Create a Swarm-centered harness builder that preserves maximum agentic flexibility while making the product usable for both technical and non-technical users. The system should let users exploit agentic power without losing predictability of output.

## Desired outcome
- Swarm remains the primary home.
- Any workflow can become a full harness.
- Non-technical users can use guided/prompt-based semantic configuration without needing to dive into low-level controls.
- Technical users can enter directly and manually edit every detail from the start or after prompt-guided generation.
- The single agent is the design center and must be configurable in fine detail.
- Output behavior should become more predictable because agent behavior is more explicitly configurable.

## In scope
- Progressive-depth UX inside Swarm
- Optional prompt/guided configuration flows
- Full direct/manual editing for technical users
- Single-agent configurability as the primary authoring center
- Extending fine-grained control to handoffs, process steps, workflow, and full harness
- Universal structured input/output contracts and APIs/endpoints for agent/harness data flow

## Out of scope / Non-goals
- Forcing all users to start from prompt
- Splitting the product into two disconnected builders with different cores
- Hiding advanced control from technical users
- Requiring non-technical users to edit every low-level detail manually

## Decision boundaries
OMX/product may decide automatically:
- whether the user starts from guided/prompt entry or direct manual editing, based on explicit user choice or surfaced mode controls
- how to progressively disclose advanced controls
- how prompt/guided configuration maps into underlying structured agent/workflow fields, as long as all underlying details remain inspectable/editable

OMX/product must not hide or lock:
- full single-agent configurability
- manual direct editing for technical users
- visibility into prompts injected, memories used, IO contracts, handoffs, and runtime behavior

## Constraints
- Swarm stays the home surface
- Must support both non-technical and technical users within the same system
- Must preserve agentic power while improving predictability
- Brownfield direction should build on existing Swarm + Pack concepts rather than replace them blindly
- Input/output endpoints and documentation contracts need universal structured treatment

## Testable acceptance criteria
1. A technical user can open Swarm and edit an agent directly without going through prompt/guided flow.
2. A non-technical user can configure an agent semantically through guided prompt/questions without touching low-level fields.
3. Every agent exposes editable controls for memory, prompts, mission, inputs, constraints, outputs, tools, model/runtime, handoffs, and error behavior.
4. Prompt/guided configuration writes into inspectable/editable structured fields rather than opaque hidden state.
5. Workflow/harness IO is represented through structured universal contracts/endpoints, not only ad hoc UI state.
6. The product surfaces enough visibility to understand why an agent produced a given output.
7. The product increases output predictability by making constraints, IO, memory, and handoff behavior explicit.

## Single-agent configuration inventory
- Mission / responsibilities / what the agent must do
- Prompt injection visibility: what prompts are injected and when
- Memory: connected memories, memory types, multiple memory sources
- Input contract: from user vs from other agents, configurable input blocks
- Constraints / forbidden actions
- Output contract: what to produce, structure, format
- Tools access
- Model/runtime
- Handoff policy and destinations
- Error handling / retry behavior

## Brownfield evidence vs inference
### Evidence from repository
- Swarm already contains advanced canvas editing, AgentInspector, PromptToFlowBar, workflow settings, validation rail, workflow run modal, and artifact panel.
- Pack Builder already models inputs, knowledge/context, behavior rules, outputs/artifacts, visible steps, dependencies, and runtime policy.
- Visual IO nodes already exist and imply a path toward structured input/output contracts.

### Inference
- The missing layer is less about raw power and more about semantic configurability + inspectable mapping from semantic intent to structured agent settings.
- Current architecture suggests Pack Builder concepts should likely be pulled closer into Swarm as layered controls rather than staying too separate.

## Pressure-pass findings
- Prompt-first was initially overgeneralized; corrected to optional prompt/guided entry.
- The true invariant is full configurability of the single agent, not mandatory use of prompting.
- Predictability is a first-class product goal, not just power/flexibility.

## Recommended execution bridge
1. Recommended:  using this spec to produce a brownfield product/UX plan for “Swarm as progressive-depth harness builder”.
2. Alternative: refine further if you want the guided question pipeline itself specified in detail before planning.
