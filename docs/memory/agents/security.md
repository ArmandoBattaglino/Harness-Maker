---
## 2026-03-27 — V3 Swarm Orchestrator Early Security Assessment
**Status:** COMPLETED
**Called by:** User (early analysis phase, pre-PRD)

### Context when I started
v2.1 is release-ready (41 tasks completed). V3 Swarm Orchestrator is in the planning phase — architect produced DEC-011 to DEC-016, researcher and tech-lead completed Stage 0. No V3 code exists yet. This is a pre-PRD security assessment to identify new attack surface and produce mandatory security requirements before the PRD is written.

### What I did
1. Read all memory files in parallel: security.md (prior sessions), PROJECT.md, DECISIONS.md, CONTEXT.md, ACTIVITY_LOG.md, PROGRESS.md.
2. Analyzed the 8 new attack surfaces described in the assessment brief against the V2 baseline.
3. Rated each surface by risk level.
4. Identified new vulnerability classes introduced by V3 that do not exist in V2.
5. Produced mandatory security requirements for the PRD.
6. Identified low-risk items that appear risky but are contained by architecture.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/security.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended assessment outcome |
| docs/memory/CONTEXT.md | MODIFIED | Added V3 security assessment notes |

### Key Findings
- CRITICAL NEW SURFACE: POST /api/v1/triggers/webhooks/:path — only endpoint that can receive external traffic. Requires full input isolation and no PTY passthrough of raw webhook body.
- HIGH NEW SURFACE: WorkflowDefinition JSON load-and-execute — systemPrompt from disk becomes a live PTY instruction. Requires schema validation + size limits before any execution starts.
- HIGH NEW SURFACE: TriggerManager RSS polling — server makes outbound HTTP requests to user-configured URLs (SSRF vector).
- MEDIUM: HITL resume text injection — user text injected directly into running PTY. Already partially mitigated by CSRF; needs size cap.
- MEDIUM: SwarmEngine systemPrompt passthrough — user-controlled prompt text reaches spawned PTY process. Not a new class but new propagation path.
- LOW: Workflow names/descriptions on disk — display-only, file paths use UUID, low risk.
- LOW: broadcast endpoint — text to multiple PTYs, same risk profile as single PTY writeInput.

### Decisions I made
- Rated webhook endpoint as HIGH (not CRITICAL) overall because the app binds to 127.0.0.1 — external exposure requires deliberate user action (port forwarding / reverse proxy). However within the exposed surface it is the highest-risk entry point.
- Rated WorkflowDefinition load-and-execute as HIGH because disk-loaded content bypasses the CSRF check entirely — a file tamper attack would survive all existing mitigations.
- RSS polling is the only place the server initiates outbound connections — rated HIGH as an SSRF vector.

### What I learned
- V3 introduces two threat classes V2 never had: (1) server-initiated outbound requests (SSRF via RSS), (2) disk-resident data used as execution instructions (workflow JSON systemPrompt). Both require new mitigations not present in the V2 baseline.
- The HITL injection surface is the same as existing PTY writeInput — no new class, but new automation context means a poisoned HITL response could chain agent actions.
- Workflow names are safe because file paths use server-generated UUIDs (DEC-013), not the display name.

### State I'm leaving behind
- Assessment delivered to user. No code changes — this is a pre-PRD read-only analysis.
- 7 mandatory security requirements produced for the PRD author (prd-writer).
- See CONTEXT.md for notes to the prd-writer agent.

### Handoff
- prd-writer: incorporate the 7 mandatory security requirements as non-negotiable SEC requirements in the V3 PRD.
- backend-dev: when implementing TriggerManager, RSS polling needs an allowlist or at minimum a private-IP blocklist for SSRF prevention.
- backend-dev: WorkflowDefinition loader must validate JSON schema and enforce systemPrompt size cap before any PTY spawn.
- backend-dev: webhook endpoint needs its own stricter rate limiter, size cap on body, and must never pass raw body bytes to a PTY.
---

## 2026-03-18 — Full Re-Audit (user-requested, post-Tasks #16-#18)
**Status:** COMPLETED
**Called by:** User (direct request for comprehensive audit of full codebase)

### Context when I started
All 18 tasks COMPLETED. The prior audit (Task #14) found 3 MEDIUM + 2 LOW findings. Tasks #16, #17, #18 fixed the 3 MEDIUM findings. This session is a full independent re-audit to verify those fixes and find any new issues.

### What I did
1. Read memory files in parallel: security.md (prior session), PROJECT.md, CONTEXT.md.
2. Read existing SECURITY_AUDIT.md to understand what was previously found and marked fixed.
3. Read ALL server source files in parallel: index.js, csrf.js, security.js, pathValidation.js, FileManager.js, ProcessRegistry.js, JobRunner.js, jobs.js, agents.js, projects.js, sessions.js, skills.js, claudemd.js, SessionManager.js, terminalHandler.js, BinaryDiscovery.js, ConfigStore.js, frontmatter.js.
4. Read client files: AppContext.jsx, JobPanel.jsx, useApi.js, useJob.js.
5. Ran npm audit in server/ (0 vulnerabilities), root (0 vulnerabilities), and client/ — **2 moderate vulnerabilities found in esbuild/vite (dev dependency only, GHSA-67mh-4wv8-2f99)**.
6. Grepped for: shell:true, exec(), process.env, console.log, safeRead, dangerouslySetInnerHTML, prompt logging, injection patterns.
7. Identified new findings: esbuild CVE in client devDeps (MEDIUM), process.env passthrough to PTY (LOW), safeRead path-validation bypass in claudemd GET (LOW — already contained by project lookup), rate limiter memory leak (LOW, pre-existing).

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/security.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended audit outcome |

### Improvements delivered
- Confirmed all 3 prior MEDIUM fixes are correctly applied in the live code
- Discovered 1 new MEDIUM finding: esbuild/vite CVE in client devDependencies
- Confirmed LOW-02 (rate limiter memory leak) still open
- NEW LOW-03: process.env passthrough exposes all server env vars to PTY child
- NEW LOW-04: safeRead in claudemd.js GET bypasses FileManager path validation (low risk due to project lookup containment)
- Full OWASP Top 10 re-verification complete

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| None new | — | — | — |

### Decisions I made
- Rated esbuild/vite CVE as MEDIUM (not HIGH) because: it only affects the dev server (`vite dev`), not the production build or the Express server. The production server serves a static Vite build from `server/public`, not via vite's dev server. Exploitation requires an attacker able to reach the local Vite dev port, which is only bound during development.
- Rated process.env passthrough as LOW: the app is localhost-only/single-user, so there are no untrusted users who could exploit leaked env vars. However, it violates the principle of least privilege.
- Rated safeRead bypass as LOW (informational): the read path is constrained by project lookup — you can only read files inside a registered project's path. Not exploitable to read arbitrary filesystem paths.

### What I learned
- Client devDependencies DO need to be audited separately — npm audit at the root does not recurse into client/.
- The process.env passthrough is a common node-pty pattern but does expose APPDATA, LOCALAPPDATA, CLAUDE_BIN, and any other env var to the Claude CLI child process. This is probably intentional for Claude to inherit PATH etc., but it's worth documenting.
- The safeRead pattern in claudemd.js GET does not use FileManager, but it's safe because the only untrusted input is projectId, which is looked up in ConfigStore — so project.path is always a previously-validated, registered path.

### State I'm leaving behind
- SECURITY_AUDIT.md updated with new findings (MEDIUM-04 for esbuild, LOW-03 and LOW-04).
- Overall verdict remains PASS for the production server. MEDIUM-04 is a dev-only concern.

### Handoff
- Fix MEDIUM-04: upgrade vite in client/ — `npm install vite@latest --prefix client`. This is a breaking change per npm audit (requires vite@8.x). Evaluate upgrade impact before applying.
- LOW-03: consider creating an explicit env whitelist for PTY spawn (PATH, HOME, USERPROFILE, APPDATA, LOCALAPPDATA, TERM) rather than passing process.env wholesale.
- LOW-04: refactor safeRead in claudemd.js to use fileManager.readFile with allowedBase for consistency.
---
## 2026-03-18 — Task #14: Pre-Release Security Audit
**Status:** COMPLETED
**Called by:** orchestrator (project-manager)

### Context when I started
All 12 implementation tasks (#1-#12) were COMPLETED. The application is a locally-hosted web app (localhost:3000) for the Claude Code CLI. The server directory had all modules in place: index.js, middleware/, routes/, services/, ws/, utils/. No previous security agent session existed.

### What I did
1. Read project memory files in parallel: PROJECT.md, DECISIONS.md, CODE_MAP.md (no prior security.md existed).
2. Read all 10 target files in parallel: server/index.js, middleware/pathValidation.js, middleware/csrf.js, middleware/security.js, services/FileManager.js, ws/terminalHandler.js, services/SessionManager.js, services/ProcessRegistry.js, services/JobRunner.js, package.json.
3. Read all route files in parallel: routes/agents.js, routes/projects.js, routes/sessions.js, routes/jobs.js, routes/skills.js, routes/claudemd.js.
4. Read supporting files: services/ConfigStore.js, services/BinaryDiscovery.js, utils/frontmatter.js, server/package.json.
5. Ran `npm audit --json` in both project root and server/ — both returned 0 vulnerabilities.
6. Grepped for `exec(`, `shell: true`, sensitive data logging, and `allowedTools` usage.
7. Audited all 10 SEC requirements and OWASP Top 10.
8. Wrote docs/SECURITY_AUDIT.md with full findings.

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/SECURITY_AUDIT.md | CREATED | Full security audit report — 10 SEC requirements, OWASP checklist, 3 MEDIUM findings, 2 LOW findings, npm audit results |
| docs/TASK_PLAN.md | MODIFIED | Changed Task #14 Status from PENDING to COMPLETED |
| docs/memory/agents/security.md | CREATED | This session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended audit outcome entry |
| docs/memory/PROGRESS.md | MODIFIED | Moved Task #14 to Completed section |

### Improvements delivered
- All 10 SEC requirements verified with exact file:line citations
- 3 MEDIUM findings identified with exact fix recommendations
- 2 LOW findings documented
- npm audit confirmed 0 CVEs in 185 dependencies
- Overall risk rating: LOW for intended deployment model

### Bugs I encountered
| Bug | Root cause | Fix applied | Status |
|-----|-----------|-------------|--------|
| None encountered | — | — | — |

### Decisions I made
- Rated `exec()` in openBrowser as MEDIUM (not HIGH) — the URL is currently not user-controlled (PORT is parseInt'd, base is hardcoded), making it not currently exploitable. But it deviates from the shell:false policy.
- Rated `allowedTools` lack of whitelist as MEDIUM — `shell: false` already prevents shell injection, but the parameter can influence Claude CLI behavior in unintended ways.
- Rated PID file integrity as MEDIUM — only exploitable on shared machines with weak ACLs, not the primary deployment target (single-user Windows desktop).
- Did NOT flag the `unsafe-inline` CSP for Tailwind as higher than LOW — it is explicitly documented as a known trade-off and has no known exploitation path in a localhost-only app.

### What I learned
- The codebase has strong security discipline: every module that handles paths validates them, no `shell:true` anywhere in critical paths, and prompt content is never logged.
- The one `exec()` call is in the browser auto-open helper added in Task #12. The backend-dev noted it in the ACTIVITY_LOG as an intentional decision with a code comment. It's technically sound today but violates the stated policy.
- `allowedTools` validation gap is a real finding — it is only type-checked, not value-validated. The Claude CLI accepts this as a CLI argument, so what the user sends directly controls which tools the spawned Claude process can use.
- write-atomic is used correctly and consistently across all file write paths.
- The ProcessRegistry PID-kill-on-startup pattern is sound for orphan cleanup but the PID file has no integrity protection.

### State I'm leaving behind
- docs/SECURITY_AUDIT.md: complete, ready for review. Verdict: NEEDS_ATTENTION (0 CRITICAL, 0 HIGH, 3 MEDIUM, 2 LOW).
- Task #14 marked COMPLETED in TASK_PLAN.md.
- Three MEDIUM issues remain unresolved in the codebase — they are documented but not fixed (this audit is read-only).

### Handoff
- If a developer is addressing the MEDIUM findings:
  - MEDIUM-01: Replace `exec()` in `openBrowser()` (server/index.js:44-55) with `spawn({ shell: false })` per the fix shown in the audit report.
  - MEDIUM-02: Add character-set regex validation on `allowedTools` before passing it to `startJob` in routes/jobs.js:44.
  - MEDIUM-03: Add PID range validation in ProcessRegistry.js `cleanupStale()` and consider setting restrictive NTFS ACLs on the config dir at creation in ConfigStore.js `ensureDir()`.
- Task #15 (Documenter) is the only remaining task before v1 release.
---
