---
## 2026-03-18 — Task #7 + #8: Entity Management API + UI
**Status:** COMPLETED
**Called by:** orchestrator (post-task code-mapper invocation)

### Context when I started
Tasks #7 (backend Entity Management API) and #8 (frontend Entity Management UI) had just completed. CODE_MAP.md covered through Task #6 (frontend Sidebar + TerminalView). CHANGELOG.md had entries for Tasks #1-#5. No code-mapper agent memory file existed.

### What I did
1. Read existing CODE_MAP.md and CHANGELOG.md to understand prior state
2. Read all 11 modified/created files in two parallel batches:
   - Batch 1 (server): FileManager.js, frontmatter.js, agents.js, skills.js, claudemd.js, index.js
   - Batch 2 (client): useApi.js, AgentEditor.jsx, SkillEditor.jsx, ClaudeMdEditor.jsx, EntitiesView.jsx
3. Traced all function connections: who calls what, via Grep for AppContext/useAppState
4. Rewrote CODE_MAP.md in full (previous entries preserved, new modules + functions added)
5. Appended two detailed changelog entries to CHANGELOG.md (Task #7 and Task #8)
6. Updated PROGRESS.md: moved Task #8 from Pending to Completed section
7. Confirmed TASK_PLAN.md already shows both tasks as Status: COMPLETED

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/CODE_MAP.md | REWRITTEN | Added Module Index table rows for 8 new modules; full Function Graph entries for all new server + client functions |
| docs/memory/CHANGELOG.md | APPENDED | Added detailed Task #7 and Task #8 entries with function-level descriptions |
| docs/memory/PROGRESS.md | MODIFIED | Moved Task #8 entry from Pending to Completed section (was misplaced) |
| docs/memory/agents/code-mapper.md | CREATED | This file |

### Improvements delivered
- CODE_MAP.md now covers the complete entity management stack (FileManager, frontmatter utils, 3 route files, 4 client components, extended useApi.js)
- Key architectural patterns documented: filePathToId (deterministic from path, not stored), resolveAllowedBase (two independent implementations in agents.js vs skills.js — slight scope difference: agents uses USER_AGENTS_DIR, skills uses USER_CLAUDE_DIR), DELETE with body pattern

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| PROGRESS.md had Task #8 in Pending section despite being COMPLETED | Likely written before completion was confirmed | Moved to Completed section | FIXED |

### Decisions I made
- Rewrote CODE_MAP.md rather than appending — the module index table needed new rows and prior function entries needed to be preserved; a full rewrite was cleaner than patch edits
- Documented resolveAllowedBase() as two separate entries (agents.js vs skills.js) because they differ: agents.js checks USER_AGENTS_DIR (the subdirectory), skills.js checks USER_CLAUDE_DIR (the parent) — this scope difference is a non-obvious security detail worth preserving

### What I learned
- agents.js and skills.js both have a `findProject(projectId)` function — identical implementations duplicated in two files (not shared via a utility). Future refactor opportunity.
- The DELETE-with-body pattern is necessary because agent/skill IDs are SHA-256 derived from file paths and cannot be reverse-hashed. The server needs the actual filePath to validate the write target.
- Skills have two formats (modern: skills/<name>/SKILL.md, legacy: commands/<name>.md). DELETE behavior differs: modern removes entire directory tree (fs.promises.rm recursive), legacy removes single file.
- ClaudeMdEditor does NOT use frontmatter parsing — CLAUDE.md is treated as raw markdown (no structured frontmatter), unlike agents and skills.

### State I'm leaving behind
- CODE_MAP.md: complete through Task #8. All server and client modules documented.
- CHANGELOG.md: entries for Tasks #1-#8 present.
- TASK_PLAN.md: Tasks #7 and #8 marked COMPLETED (already set by implementing agents).
- PROGRESS.md: Tasks #7 and #8 in Completed section.
- Next pending tasks: #9 (Job Mode API - backend-dev), #10 (Job Mode UI - frontend-dev)

### Handoff
After Tasks #9 and #10: code-mapper should document JobRunner service, SSE streaming route, JobPanel component, react-markdown integration.
---

---
## 2026-03-18 — Tasks #9+#10+#11: Job Mode API + Job Mode UI + Projects View UI
**Status:** COMPLETED
**Called by:** orchestrator (post-task code-mapper invocation)

### Context when I started
Tasks #9 (Job Mode API — backend-dev), #10 (Job Mode UI — frontend-dev), and #11 (Projects View UI — frontend-dev) had just completed. CODE_MAP.md covered through Task #8. CHANGELOG.md had entries through Task #8. My previous session log explicitly anticipated documenting JobRunner, SSE route, JobPanel, and react-markdown.

### What I did
1. Read agent memory file to confirm previous state and handoff notes
2. Read existing CODE_MAP.md and CHANGELOG.md (prior state)
3. Read all 8 modified/created files in parallel:
   - server/services/JobRunner.js, server/routes/jobs.js, server/index.js
   - client/src/hooks/useJob.js, client/src/components/JobPanel.jsx
   - client/src/views/JobView.jsx, client/src/views/ProjectsView.jsx
4. Grep confirmed index.css .markdown-result styles added
5. Confirmed TASK_PLAN.md already marks Tasks #9, #10, #11 as COMPLETED (implementing agents set this)
6. Updated CODE_MAP.md: header line, Module Index (4 new server rows, 4 new client rows), startup() entry (added jobsRouter + jobRunner.claudeBin), 14 new Function Graph entries, Key Behaviors + Key Patterns sections
7. Appended 3 CHANGELOG entries (Tasks #9, #10, #11) to CHANGELOG.md
8. Appended code-mapper entry to ACTIVITY_LOG.md
9. PROGRESS.md already up-to-date (frontend-dev had written tasks there)

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/CODE_MAP.md | MODIFIED | Header updated; Module Index: 8 new rows; startup() entry updated; 14 new Function Graph entries for JobRunner, jobs route, useJob, JobPanel components, JobView, ProjectsView components; Key Behaviors + Key Patterns sections extended |
| docs/memory/CHANGELOG.md | APPENDED | Three new entries: Task #9 (JobRunner + routes), Task #10 (useJob + JobPanel + JobView + index.css), Task #11 (ProjectsView full implementation) |
| docs/memory/ACTIVITY_LOG.md | APPENDED | code-mapper entry for Tasks #9+#10+#11 |
| docs/memory/agents/code-mapper.md | APPENDED | This session log |

### Improvements delivered
- CODE_MAP.md now covers the full job mode stack end-to-end: JobRunner → routes/jobs.js → useJob → JobPanel → JobView
- Key architectural patterns documented: SSE response ownership (JobRunner owns res lifetime), stdin.end() requirement (DEC-005), useJob ref+state duality for stale closure avoidance, .markdown-result CSS scope for react-markdown
- ProjectsView sub-components documented (StatusBadge, ConfirmDialog, formatDate)

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| None | — | — | — |

### Decisions I made
- Documented SSE response ownership explicitly: JobRunner.addSseClient owns the res lifetime; routes/jobs.js does NOT call res.end() after addSseClient returns true — this is non-obvious and a source of potential bugs if missed
- Documented jobIdRef vs jobId state duality in useJob: the ref is needed because cancelJob is a useCallback and would otherwise capture stale jobId state

### What I learned
- JobRunner uses the same claudeBin pattern as SessionManager — both are singletons with a public property set by index.js after binary discovery
- tree-kill is CJS-only in this codebase — both JobRunner.js and SessionManager.js use createRequire to import it (same pattern, independent implementations)
- SSE disables Express/Node timeouts via req.setTimeout(0) + res.setTimeout(0) — this is required or long-running jobs will get timeout-killed by the framework
- ProjectsView reads `sessions` from AppContext (not just `projects`) to determine session status badge — the sessions object is keyed by projectId

### State I'm leaving behind
- CODE_MAP.md: complete through Task #11. All server and client modules documented.
- CHANGELOG.md: entries for Tasks #1-#11 present.
- TASK_PLAN.md: Tasks #9, #10, #11 already COMPLETED (set by implementing agents).
- PROGRESS.md: Tasks #9, #10, #11 in Completed section (set by implementing agents, confirmed).
- Next pending tasks: #12 (NFR polish — backend-dev), #13 (QA), #14 (Security), #15 (Docs)

### Handoff
After Task #12: document NFR improvements — browser auto-open, resilience improvements, startup polish. After Tasks #13-#15: document test suite location, security audit findings, README.
---

---
## 2026-03-18 — Tasks #13+#14+#15: QA Test Suite + Security Audit + Documentation
**Status:** COMPLETED
**Called by:** orchestrator (post-task code-mapper invocation)

### Context when I started
Tasks #13 (QA Test Suite — qa-tester), #14 (Security Audit — security), and #15 (Documentation — documenter) had just completed. CODE_MAP.md covered through Task #11. CHANGELOG.md had entries through Task #11. Previous session log noted: "After Tasks #13-#15: document test suite location, security audit findings, README."

### What I did
1. Read agent memory file to confirm previous state and handoff notes
2. Read existing CODE_MAP.md (header + all sections) and CHANGELOG.md
3. Read all 7 new test files in parallel: RingBuffer.test.js, FileManager.test.js, csrf.test.js, pathValidation.test.js, SessionManager.test.js, JobRunner.test.js, vitest.config.js
4. Read docs/SECURITY_AUDIT.md (first 50 lines — verdict + findings)
5. Read docs/TEST_RESULTS.md (first 50 lines — summary)
6. Updated CODE_MAP.md header line (tasks #13-#15)
7. Added Test Infrastructure table to Module Index section (7 files, test counts)
8. Added Security + QA Artifacts section listing docs artifacts
9. Added full Test Modules section with 7 Function Graph entries (one per test file + vitest.config)
10. Added 3 new Key Behavior bullets (test suite facts, class-not-singleton pattern, security audit result)
11. Appended 3 detailed CHANGELOG entries (Tasks #13, #14, #15)
12. Wrote this agent memory log

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/CODE_MAP.md | MODIFIED | Header updated; Test Infrastructure table added; Security+QA Artifacts section added; 7 new Function Graph entries for test files; 3 new Key Behavior bullets |
| docs/memory/CHANGELOG.md | APPENDED | Three entries: Task #13 (full per-suite breakdown), Task #14 (audit verdict + findings), Task #15 (docs files) |
| docs/memory/agents/code-mapper.md | APPENDED | This session log |

### Improvements delivered
- CODE_MAP.md now maps all 6 test files as first-class modules with their coverage target, test count, mocking strategy, and key edge cases documented
- Security audit findings (3 MEDIUM) documented in KEY BEHAVIORS for any future agent to find without reading the full audit
- JobRunner.test.js complexity notes preserved: vi.hoisted() TDZ issue and PassThrough vs EventEmitter distinction

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| None | — | — | — |

### Decisions I made
- Documented test files as proper Function Graph entries (not just a table row in Module Index) — test files have architectural properties worth preserving: what they import, what they mock, which class vs singleton, and non-obvious constraints like vi.hoisted() and PassThrough
- Noted `{ SessionManager }` class import pattern explicitly — future backend-devs need to know tests use the class, not the singleton, or test isolation breaks
- Security audit MEDIUM findings added to Key Behaviors (not just CHANGELOG) because they are actionable constraints for future development

### What I learned
- vi.hoisted() is required when a mock factory needs to reference a variable that would be in TDZ at mock-hoist time. This is a Vitest-specific pattern (not in Vitest docs prominently)
- PassThrough stream required for readline.createInterface — plain EventEmitter lacks .resume(). This will catch future developers if they try to simplify the mock
- The security audit explicitly verified all 10 SEC requirements pass, but notes exec() in browser auto-open as a latent risk (not yet a vulnerability, but one code change away from being one)
- Task #15 (documenter) modified docs/memory/PROJECT.md and docs/memory/PROGRESS.md — these are living memory files, not code. CODE_MAP does not track them in the Function Graph but the CHANGELOG entry records the update for audit trail

### State I'm leaving behind
- CODE_MAP.md: complete through Task #15. All server modules, client modules, and test infrastructure documented.
- CHANGELOG.md: entries for Tasks #1-#15 present (full project history).
- All 110 tests passing. Security audit complete with 3 MEDIUM findings deferred to pre-release fix cycle.
- Next work: address MEDIUM security findings (exec() auto-open, allowedTools whitelist, PID file integrity) before v1.0 release

### Handoff
No pending tasks in current plan. If MEDIUM security findings are addressed, code-mapper should document changes to: server/index.js (exec → execFile for auto-open), server/routes/jobs.js (allowedTools validation), server/services/ProcessRegistry.js (PID integrity check).
---

---
## 2026-03-18 — Tasks #16+#17+#18: Security Hardening — openBrowser spawn, allowedTools whitelist, PID range guard
**Status:** COMPLETED
**Called by:** orchestrator (post-task code-mapper invocation)

### Context when I started
Tasks #16 (exec→spawn in openBrowser — server/index.js), #17 (allowedTools whitelist — server/routes/jobs.js), and #18 (PID range guard — server/services/ProcessRegistry.js) had just completed. These were the three MEDIUM security findings from the Task #14 audit (MEDIUM-01, MEDIUM-02, MEDIUM-03). CODE_MAP.md was complete through Task #15. CHANGELOG.md had entries through Task #15. My previous session log explicitly anticipated: "code-mapper should document changes to: server/index.js (exec→execFile for auto-open), server/routes/jobs.js (allowedTools validation), server/services/ProcessRegistry.js (PID integrity check)."

### What I did
1. Read agent memory file — confirmed previous state and exact handoff note
2. Read existing CODE_MAP.md (full, 861 lines) and CHANGELOG.md (full) to understand prior state
3. Read all 3 modified source files in parallel: server/index.js, server/routes/jobs.js, server/services/ProcessRegistry.js
4. Ran 3 targeted Grep calls: openBrowser callers, isValidPid callers, allowedTools references across server/
5. Confirmed: openBrowser is called only from startup(); isValidPid is called only from register() and cleanupStale(); allowedTools validation is local to the POST handler
6. Updated CODE_MAP.md header line (tasks #16-#18)
7. Updated Module Index entry for ProcessRegistry to mention isValidPid guard
8. Added new `openBrowser(url)` Function Graph entry (with Windows start/title-arg complexity note)
9. Updated `startup()` Function Graph entry — added openBrowser to Calls list, updated side effects, updated Last modified
10. Updated `POST /api/v1/jobs` Function Graph entry — added allowedTools whitelist detail and Complexity note, updated Last modified
11. Added 7 new ProcessRegistry Function Graph entries: isValidPid, register, unregister, cleanupStale, readRegistry (internal), writeRegistry (internal), killProcess (internal)
12. Updated Key Behaviors section: changed audit result bullet, added 3 FIXED bullets for MEDIUM-01/02/03
13. Appended 3 CHANGELOG entries (Tasks #16, #17, #18) with full function-level detail including breaking change note for Task #17
14. Appended ACTIVITY_LOG entry
15. Wrote this agent memory log

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/CODE_MAP.md | MODIFIED | Header updated; ProcessRegistry module index updated; openBrowser() new entry; startup() updated; POST /api/v1/jobs updated; 7 new ProcessRegistry Function Graph entries; Key Behaviors updated with MEDIUM-01/02/03 FIXED status |
| docs/memory/CHANGELOG.md | APPENDED | Three entries: Task #16 (openBrowser spawn fix), Task #17 (allowedTools whitelist), Task #18 (PID range guard) |
| docs/memory/ACTIVITY_LOG.md | APPENDED | code-mapper entry for Tasks #16+#17+#18 |
| docs/memory/agents/code-mapper.md | APPENDED | This session log |

### Improvements delivered
- CODE_MAP.md now documents the full ProcessRegistry module as first-class Function Graph entries (was previously only in Module Index table — no function-level detail)
- openBrowser() is now a documented named function with the Windows start/title-arg complexity note preserved
- MEDIUM-01/02/03 FIXED status is now in Key Behaviors — any future agent can see the security posture without reading the full audit
- Task #17 breaking change (400 for malformed allowedTools) is flagged in CHANGELOG for any future API consumers

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| startup() entry used backslash path `server\index.js` (inconsistent with rest of file) | Prior edit used backslash | Kept existing format — grep confirmed this is how it was stored | KNOWN (cosmetic only) |

### Decisions I made
- Added full function graph entries for ProcessRegistry internal helpers (readRegistry, writeRegistry, killProcess, isProcessAlive) — these are now security-relevant since isValidPid feeds into cleanupStale/register. Future agents debugging unexpected cleanup behavior need to know how the read→filter→kill chain works.
- Flagged Task #17 allowedTools validation as a BREAKING CHANGE in CHANGELOG — clients sending allowedTools with spaces/slashes now get 400 instead of pass-through. Documented which values are affected vs unaffected.
- Used `isValidPid` rather than "PID integrity check" as the function name in all entries for searchability

### What I learned
- ProcessRegistry had NO Function Graph entries at all in CODE_MAP.md — only a single Module Index table row. The module was non-trivial (7 functions, 2 now with security guards) and needed proper entries
- The Windows `start` command requires an explicit empty-string title argument: `cmd.exe /c start "" <url>`. Without it, `start` misparses the URL as the window title. This complexity note is load-bearing for any future developer modifying openBrowser()
- MAX_PID = 65535 is intentionally conservative (Linux default is 32768, configurable to 4194304). The comment in the source explains the rationale. Documented in Complexity note.

### State I'm leaving behind
- CODE_MAP.md: complete through Task #18. All 3 MEDIUM security findings are reflected as FIXED.
- CHANGELOG.md: entries for Tasks #1-#18 present (full project history).
- TASK_PLAN.md: Tasks #16, #17, #18 already COMPLETED (set by project-manager).
- Project status: v1 RELEASE READY per ACTIVITY_LOG/project-manager entry.

### Handoff
All 18 tasks complete. No pending code-mapper work. If a v1.1 cycle begins (LOW findings: CSP unsafe-inline, rate limiter persistent storage), code-mapper should document changes to server/middleware/security.js (CSP update) and server/index.js (rateLimit function, if persisted).
---
