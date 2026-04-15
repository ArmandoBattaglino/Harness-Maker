# Ralph Context Snapshot - Progressive Harness Maker Execution

- Created UTC: 20260414T142129Z
- Mode: Ralph
- Task statement: Execute the approved Progressive Harness Builder plan in detail until green; do not stop early; follow canonical memory rules and build truly verifiable tests, especially Playwright.
- Desired outcome: Swarm becomes a progressively configurable harness-builder shell with explicit canonical domains, shared compiled execution preview/resolver, provider capability truth, richer agent definition center, universal IO/artifact alignment, predictability observability, and PackBuilder coexistence/parity gates.
- Source plan: `.omx/plans/prd-swarm-progressive-harness-builder.md`
- Source test spec: `.omx/plans/test-spec-swarm-progressive-harness-builder.md`
- Existing related context: `.omx/context/harness-builder-personalizzabile-20260414T133007Z.md`

## Known facts/evidence
- PRD consensus status is APPROVED by Planner + Architect + Critic.
- Test spec requires milestone-by-milestone UI/user and server/runtime gates with targeted evidence.
- Repository directives require Ralph to sync `docs/TASK_PLAN.md`, reconcile `docs/memory/DECISIONS.md` at cycle boundaries, append `docs/memory/ACTIVITY_LOG.md`, and run targeted Playwright for user-visible behavior.
- `docs/shared/agent-tiers.md` is missing; use repo model/role contract and available Codex roles.
- `omx explore` is unavailable in this environment because cargo/prebuilt explore binary is missing; direct read-only inspection is used instead.

## Constraints
- Do not collapse workflow, agent, pack/harness, and runtime compiled state into one persistence blob.
- Preserve PackBuilder as authoritative until explicit parity gates pass.
- No new dependencies unless explicitly requested.
- Mutating API routes require `X-Requested-With: ClaudeCodeManager`.
- Atomic-write/path-safety/spawn rules from AGENTS.md remain in force.

## Unknowns/open questions
- Exact depth of visual redesign that can fit safely in one Ralph cycle; implementation will prefer schema/resolver/testable preview first, then additive UI consolidation.
- Whether all provider capability constraints can be enforced without affecting existing runtime fallback behavior; unsupported controls should surface structured incompatibilities.

## Likely codebase touchpoints
- `server/services/workflowContracts.js`
- `server/services/PackResolver.js`
- `server/services/SwarmEngine.js`
- `server/routes/swarm.js`, `server/routes/packs.js`, `server/routes/workflows.js`
- `client/src/canvas/AgentInspector.jsx`
- `client/src/canvas/SwarmCanvas.jsx`
- `client/src/canvas/WorkflowSettingsModal.jsx`
- `client/src/utils/visualWorkflowContracts.js`
- `client/src/views/SwarmView.jsx`, `PackBuilderView.jsx`, `PackLibraryView.jsx`
- tests under `server/tests`, `client/src/**/*.test.*`, and `scripts/*playwright-smoke.mjs`

## Plan summary
Implement milestones 1-9 as synced tasks in `docs/TASK_PLAN.md`, starting with model/resolver/capability grounding before additive UI changes.
