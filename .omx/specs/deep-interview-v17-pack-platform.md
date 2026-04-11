# Deep Interview Spec — V17 Pack Platform

## Metadata
- Profile: standard
- Rounds: 10
- Final ambiguity: 0.16
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: .omx/context/v17-pack-platform-20260411T022213Z.md
- Interview transcript: $((.omx\interviews\v17-pack-platform-20260411T023832Z.md -replace '\\','/'))

## Clarity breakdown
| Dimension | Score | Notes |
|---|---:|---|
| Intent clarity | 0.90 | Clear product shift from generic agent-flow builder toward vertical harness builder |
| Outcome clarity | 0.88 | Outcome framed as a more productized, domain-expert-friendly harness authoring model |
| Scope clarity | 0.90 | V17.x as a whole is in scope; v1 simplification accepted around one workflow per harness |
| Constraint clarity | 0.82 | Existing workflow engine/routes must remain; V17 is evolutionary, not destructive |
| Success clarity | 0.58 | Primary success signal is explicit control of input/knowledge/behavior/output; detailed UX metrics still to be refined in planning |
| Context clarity | 0.90 | V17 task map and design doc were reviewed directly |

## Intent
Transform the app from being primarily a flow builder for agents into a product that evolves toward a builder of **vertical, domain-specific harnesses**. The flow builder remains important, but increasingly as the engine and technical substrate beneath a more purposeful harness-authoring experience.

## Desired outcome
A domain expert should be able to build a specialized harness for a domain (for example marketing) with strong control over how domain knowledge is infused, while the product stays simple enough to guide authoring and still allows deeper technical workflow access when needed.

## In-scope
- Review and plan the **entire V17.x program** (#610–#676), not only the first implementation slice.
- Treat V17 as a product evolution toward a harness builder.
- Preserve the current flow builder while evolving it toward harness authoring.
- Make these four control surfaces first-class for V17:
  1. input schema
  2. knowledge/context injection
  3. prompt / behavior rules
  4. output schema + final artifacts
- Keep the control model as a **guided toolkit over the flow builder** with optional access to the technical workflow details.
- Keep **one workflow per harness/pack** in V17 for simplicity.

## Out-of-scope / Non-goals
- No public marketplace in V17.
- No multi-workflow harness composition in V17 (future scope).
- No fully over-simplified abstraction that hides the workflow details from advanced authors entirely.

## Decision boundaries
OMX may decide without confirmation:
- Detailed planning structure and dependency waves within the already-accepted V17.x roadmap, as long as the registered area order and the design constraints remain intact.
- Technical decomposition needed to preserve the current workflow engine while layering harness concepts above it.
- How to express the four must-have control surfaces in planning artifacts and implementation phases.

Requires user confirmation if changed:
- Changing the core product direction away from vertical harness authoring.
- Introducing public marketplace/distribution as a primary V17 goal.
- Expanding V17 to require multi-workflow harnesses now instead of later.
- Hiding technical workflow access behind a simplified-only UI model.

## Constraints
- Existing workflow CRUD and execution entrypoints must remain valid.
- Swarm canvas remains the builder/debug surface during this evolution.
- V17 should improve and evolve the current builder rather than replace it abruptly.
- Simplicity matters: v1 should stay manageable for users with domain knowledge.
- Rich control matters: users need explicit control over information/knowledge infusion.

## Testable acceptance criteria for planning handoff
- The V17 plan treats the app as evolving toward a harness builder, not merely adding a generic “pack” feature.
- The plan makes the four must-have authoring surfaces first-class and traceable across the V17 phases.
- The plan preserves one-workflow-per-harness in V17 and treats multi-workflow as future scope.
- The plan preserves existing workflow routes/runtime behavior as compatibility constraints.
- The plan explicitly uses a guided-toolkit-over-flow-builder model rather than a simplified-only abstraction.
- The plan identifies how success will be judged around explicit control of input, knowledge, behavior, and output.

## Assumptions exposed + resolutions
1. **Assumption:** V17 might only be about the next backend slice (V17.1).  
   **Resolution:** No — the user wants to reason about the whole V17.x transformation.
2. **Assumption:** Harness authoring might replace the flow builder immediately.  
   **Resolution:** No — V17 is an evolutionary bridge.
3. **Assumption:** “Control” might mean a completely simplified UI detached from the workflow.  
   **Resolution:** No — the user wants a guided toolkit with the ability to descend into technical workflow details.
4. **Assumption:** Multi-workflow composition might be required immediately.  
   **Resolution:** No — keep V17 simple with one workflow per harness for now.

## Pressure-pass findings
- A broad statement (“praticamente tutto”) was forced into prioritization, which revealed the four must-have control surfaces.
- A product-example tension (marketing harness with multiple workflows) was challenged against the current V17 design default (“one workflow per pack”), and the user explicitly chose to defer multi-workflow support.
- A proposed simplified UI model was rejected, revealing the true desired control model: guided toolkit + optional deep technical access.

## Brownfield evidence vs inference
### Evidence from repo artifacts
- docs/TASK_PLAN.md contains V17.0–V17.7 (#610–#676) and frames V17 as a full program.
- docs/PACK_PLATFORM_DESIGN.md already defines canonical nouns, compatibility rules, checkpoints, and a V17.x map.
- The design doc locks these defaults: one workflow per pack in v1, pack execution wraps existing swarm execution, legacy workflow routes remain intact, builder/operator are separate surfaces.
- docs/memory/CONTEXT.md states the immediate next step is to begin from V17.1 using V17.0 as the implementation contract.

### Inferences made during interview
- The current “pack” framing should be interpreted as part of a broader product shift toward harness authoring.
- The design/planning phase must emphasize authoring control surfaces more strongly than the current roadmap text alone may suggest.

## Technical context findings
- V17.0 establishes the design/program contract.
- V17.1–V17.7 currently sequence domain foundation, contract layer, runtime wrapper, builder authoring, operator surface, distribution, and release gates.
- The strongest product-critical lens for reviewing those phases is whether they help authors control:
  - inputs
  - knowledge/context injection
  - behavior rules
  - outputs/artifacts

## Recommended handoff
### Recommended: $ralplan
Use $ralplan next so the full V17.x roadmap is re-expressed as a consensus plan around the clarified product intent above, with explicit emphasis on the four core control surfaces and the guided-toolkit control model.

Suggested invocation shape:
- $ralplan <path-to-this-spec>
- or $plan --consensus --direct .omx/specs/deep-interview-v17-pack-platform.md

## Residual risks
- “Explicit control” is now directionally clear but still needs concrete UX/verification language in the planning phase.
- The existing V17 task map may need reframing/prioritization to foreground the four must-have surfaces more strongly.
