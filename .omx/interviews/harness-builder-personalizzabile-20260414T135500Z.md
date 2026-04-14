# Deep Interview Transcript Summary — harness-builder-personalizzabile

- Timestamp: 20260414T135500Z
- Profile: standard
- Context type: brownfield
- Final ambiguity: 0.03
- Threshold: 0.20
- Context snapshot: .omx/context/harness-builder-personalizzabile-20260414T133007Z.md

## Condensed transcript
1. User wants a harness builder that is maximally customizable but still usable by non-technical domain experts.
2. Swarm must remain the main home/product surface.
3. Progressive depth is required: users choose how deep to go.
4. Every workflow should be elevatable into a full harness.
5. Non-technical users should be able to manage agents and outcomes without diving into low-level detail.
6. Prompt/guided entry is optional, not universal; technical users may start directly in manual editing.
7. Non-technical users should be able to configure even single components/agents through guided prompt/question flows.
8. The true design center is the single agent: it must be configurable in fine detail, then the rest of the workflow/harness follows.
9. Explicit desired agent controls include:
   - memory and memory types/sources
   - prompt injection transparency (what prompts are injected and when)
   - mission/tasks/what the agent must do
   - input provenance (from user vs from other agents) and configurable input blocks
   - constraints / forbidden behavior
   - output contract and output format
   - tools access
   - model/runtime
   - handoff policy/targets
   - error handling
10. Core product goal added in the last round: exploit agentic power while still making output behavior predictable through fine-grained configurability.

## Pressure-pass findings
- Early assumption corrected: prompt-first is useful, but must not be mandatory for technical users.
- Stronger corrected principle: Swarm-native, progressive-depth, optional prompt-guided entry, full manual override.
- The real core is not generic workflow authoring but total configurability of the single agent plus predictable outputs.
