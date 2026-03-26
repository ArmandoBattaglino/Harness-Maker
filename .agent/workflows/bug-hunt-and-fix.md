---
description: Full QA bug hunt, documentation, and fix pipeline — test every component, document bugs, plan tasks, execute fixes, update all docs
---

# /bug-hunt-and-fix — Complete QA + Bug Fix Pipeline

This workflow runs a full cycle: **discover bugs → document → plan → fix → verify → update docs**.
Use it after a major feature phase or before a release to ensure stability.

## Prerequisites
- The project must build cleanly (`npm run build` from `client/`)
- All existing tests must pass (`npm test` from `server/` or root)
- The dev server should be running (`npm start` from root) for browser testing

---

## Phase 1: Bug Discovery (READ-ONLY — no code changes)

### Step 1.1 — Start the dev server
// turbo
```
npm start
```
Wait for the server to be listening (look for `[startup]` log).

### Step 1.2 — Run existing tests as baseline
// turbo
```
cd server && npx vitest run 2>&1 | Select-Object -Last 20
```
Record the pass/fail count. All tests should pass before proceeding.

### Step 1.3 — Run production build check
// turbo
```
cd client && npm run build 2>&1 | Select-Object -Last 10
```
Record module count. Build must succeed with 0 errors.

### Step 1.4 — Manual browser QA
Open the app in the browser (default: `http://127.0.0.1:3000`) and systematically test every component:

**For each component/view, verify:**
1. **Visual rendering** — icons, fonts, colors, layout match design spec
2. **Interactive elements** — every button, link, input, modal works
3. **Error states** — what happens on failure (API down, missing data)
4. **Edge cases** — rapid clicks, empty states, long text, tab switching
5. **Console** — check for JS errors on each view transition

**Components to test (in this order):**
1. **Sidebar** — navigation links, project list, session list, footer
2. **Project Dashboard** — grid/list toggle, search, add/delete projects, modals
3. **Terminal View** — session creation, terminal rendering, kill session
4. **Job Runner** — prompt submission, SSE streaming, cancel, result rendering
5. **Context Editor** — scope toggle, rule editing, save/discard, tab switching
6. **Deployment Manager** — agent CRUD, skill listing, process view

**Take screenshots** of each view using the browser tools for documentation.

### Step 1.5 — Create Bug Report
Create `bug_report.md` in the artifacts directory with this format for each bug found:

```markdown
## BUG-XX: [Short title]
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Component:** [View/Component name]
- **Steps to reproduce:**
  1. ...
  2. ...
- **Expected behavior:** ...
- **Actual behavior:** ...
- **Root cause:** [File:line] — [explanation]
- **Screenshot:** [if taken]
```

**DO NOT modify any code in this phase. Only observe and document.**

---

## Phase 2: Task Planning

### Step 2.1 — Read the bug report
Review the full bug report and categorize bugs by:
- **Priority:** CRITICAL → HIGH → MEDIUM → LOW
- **Layer:** Backend vs Frontend
- **Dependencies:** which fixes must come first

### Step 2.2 — Add tasks to TASK_PLAN.md
For each bug, add a detailed task to `docs/TASK_PLAN.md` following the existing format:

```markdown
### TASK #XX — Bug Fix — [Title]
- **Status:** PENDING
- **Agent:** backend-dev | frontend-dev
- **Priority:** CRITICAL | HIGH | MEDIUM | LOW
- **Difficulty:** EASY | MEDIUM | HARD
- **Depends on:** #XX (or none)

#### Context
[Current code snippet showing the bug]

#### Proposed Fix
[Exact code change to make]

#### Files to Modify
- `path/to/file.ext` — [what to change]

#### Acceptance Criteria
- [ ] [Specific testable criterion]
- [ ] Build passes (0 errors)
- [ ] No console errors
```

### Step 2.3 — Define execution order
Group tasks into waves:
- **Wave 1 (Backend):** CSP, security, error handling fixes — no frontend dependencies
- **Wave 2 (Frontend):** UI/UX fixes — may depend on Wave 1 (e.g., CSP fix enables icon rendering)
- **Wave 3 (QA):** Post-fix regression testing

Update the Task Status Summary table in TASK_PLAN.md.

---

## Phase 3: Execute Fixes

### Step 3.1 — Wave 1: Backend fixes
For each backend task:
1. Open the target file
2. Apply the fix exactly as documented in the task
3. Verify with `node --check <file>` if possible

### Step 3.2 — Wave 2: Frontend fixes
For each frontend task:
1. Open the target file
2. Apply the fix
3. No need to restart dev server (Vite HMR handles it)

### Step 3.3 — Build verification
// turbo
```
cd client && npm run build 2>&1 | Select-Object -Last 10
```
Must show same module count and 0 errors.

### Step 3.4 — Test suite verification
// turbo
```
cd server && npx vitest run 2>&1 | Select-Object -Last 20
```
All tests must still pass.

---

## Phase 4: Documentation Update

**After ALL fixes are applied and verified**, update these docs:

### Step 4.1 — TASK_PLAN.md
- Mark all completed tasks as `COMPLETED` in the Task Status Summary table
- Update the `_Last updated_` footer line

### Step 4.2 — ACTIVITY_LOG.md
Prepend a new entry at the top using this format:
```markdown
---
## [DATE] — [agent] — Tasks #XX-#YY: [Phase name]
**Outcome:** COMPLETED
**Summary:** [1-2 sentences describing all changes]
**Files changed:** [comma-separated list with (MODIFIED/CREATED)]
**Bugs fixed:** [BUG-XX list]
**Decisions made:** [key design decisions]
**Blockers:** none
**Next:** [what should happen next]
---
```

### Step 4.3 — CHANGELOG.md
Append a new section with:
- Per-file breakdown of what changed and why
- Functions Added / Functions Modified sections
- Build verification result

### Step 4.4 — CODE_MAP.md
- Update the `_Last updated_` header line
- Update any Module Index entries whose description changed (e.g., CSP directives)
- Add new Function Graph entries for any new functions

### Step 4.5 — CONTEXT.md
Rewrite to reflect current project state:
- What phase is active
- What was just completed
- What's remaining
- Key constraints

### Step 4.6 — PROGRESS.md
Add a new release block with per-task summaries:
```markdown
- v[X.Y] (N tasks, Phase XX): COMPLETED [DATE]
  - TASK-XX: [one-line summary]
  ...
  - Build: [modules] modules, 0 errors
```

### Step 4.7 — Agent memory files
If applicable, append session context to the relevant agent files in `docs/memory/agents/`:
- `backend-dev.md` — for backend fixes
- `frontend-dev.md` — for frontend fixes
- `qa-tester.md` — for QA results

---

## Phase 5: Final Regression QA (TASK #41 pattern)

### Step 5.1 — Browser regression test
Open the app and verify each bug from the bug report is actually fixed:
- [ ] Icons render as glyphs (not text)
- [ ] Terminal background is correct color
- [ ] No duplicate sessions on rapid click
- [ ] Scope switch prompts on unsaved changes
- [ ] Error messages appear for failed sessions
- [ ] Modal distinguishes Register vs Scaffold
- [ ] Footer shows dynamic version
- [ ] Three-dot menu accessible via keyboard

### Step 5.2 — Full test suite
// turbo
```
cd server && npx vitest run
```

### Step 5.3 — Production build
// turbo
```
cd client && npm run build
```

### Step 5.4 — Mark regression QA as COMPLETED
Update TASK_PLAN.md with the final QA task status.

---

## Summary Checklist
- [ ] Phase 1: Bugs discovered and documented in bug_report.md
- [ ] Phase 2: Tasks added to TASK_PLAN.md with full detail
- [ ] Phase 3: All fixes applied, build + tests pass
- [ ] Phase 4: All 7 docs updated (TASK_PLAN, ACTIVITY_LOG, CHANGELOG, CODE_MAP, CONTEXT, PROGRESS, agent memories)
- [ ] Phase 5: Regression QA passed, all bugs verified fixed
