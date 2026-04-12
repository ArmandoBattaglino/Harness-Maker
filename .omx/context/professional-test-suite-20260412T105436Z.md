# Ralplan Context Snapshot — Professional Test Suite Hardening
- Task statement: Plan a new branch/workstream to make this project's tests more professional/enterprise-grade, especially so passing client tests and relationship/cross-layer tests gives high confidence.
- Desired outcome: Approved consensus plan with PRD/test-spec artifacts for a follow-up implementation branch focused on test quality gates, client confidence, relationship/integration tests, and realistic user workflows.
- Known facts/evidence:
  - Current branch is alph/workflow-heart-pack-wrapper and has many uncommitted Ralph implementation changes; do not switch branches in-place until those are committed/stashed or use a separate worktree.
  - Latest verified project state: server full suite 667/667 PASS, client full suite 93/93 PASS, client build 522 modules PASS, workflow-heart Playwright PASS, V17 pack Playwright PASS, diagnostics 0 errors.
  - Existing scripts include 
pm test --prefix server, 
pm test --prefix client, 
pm run build --prefix client, 
pm run test:playwright:v17-review-followup, 
pm run test:playwright:workflow-heart, 
pm run test:visual:swarm, and server freshness checks.
  - Test gaps discussed: coverage thresholds, lint/typecheck real gate, accessibility, visual regression for new UI, cross-layer relationship tests, CI quality gate script, dependency audit policy, concurrency/race tests, schema snapshots.
- Constraints:
  - No implementation in ralplan mode; output approved plan and stop.
  - Preserve current dirty worktree; branch strategy must avoid mixing current Ralph changes with new test-hardening work.
  - No new dependencies without explicit request during execution; planning may propose optional dependencies with alternatives.
  - Prioritize measurable, professional confidence: if client + relationship tests pass, user can trust the app is OK.
- Unknowns/open questions:
  - Whether the user wants strict enterprise gates to fail CI immediately on npm audit highs or a staged warning-only rollout.
  - Whether CI provider exists; plan should be local-script-first and CI-adaptable.
  - Whether branch should be created as a normal branch after current commit or a separate worktree immediately.
- Likely codebase touchpoints:
  - root/package.json, server/package.json, client/package.json
  - scripts/ quality gate and Playwright scripts
  - client/src/test/*, server/tests/*, client/server route and integration tests
  - tests/visual/swarm/*
  - docs/memory/V17_TEST_COVERAGE.md, docs/memory/*, .omx/plans/*
