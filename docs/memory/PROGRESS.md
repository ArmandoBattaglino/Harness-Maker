
- [V4.0.4 TEST GATE PASS 2026-04-06] TASK #200 COMPLETED — TEST GATE PASS for BUG-TOKEN-FIDELITY-1
  312/312 server tests, client build clean. Control tokens __DONE__/__HANDOFF__ preserved literally in server snippet pipeline and client controlTokens.js. No code change needed. TASK #201 unblocked.
- [PM STATUS SYNC 2026-04-06] Wave 2 verified — 4 tasks confirmed COMPLETED:
  #187 PASS (V4.0.2 AREA CHECKPOINT — V4.0.2 CLOSED), #217 PASS (V4.4 AREA CHECKPOINT — V4.4 CLOSED),
  #199 COMPLETED (no bug — control tokens already preserved), #222 PASS (V4.5 TEST GATE).
  Areas now CLOSED: V4.0.2, V4.4 (both confirmed via AREA CHECKPOINT PASS).
  Open areas: V4.0.4 (#200-#205 PENDING, #199 done), V4.5 (#223 AREA CHECKPOINT PENDING).
  Next priority: V4.5 AREA CHECKPOINT #223, then V4.0.4 sequential chain #200-#205.

- [V4.5 AREA CLOSED 2026-04-06] TASK #223 COMPLETED — AREA CHECKPOINT PASS. 312/312 tests, 107/107 swarm-engine, build OK. All V4.5 tasks resolved. Snippet pipeline fully verified. V4.5 AREA IS CLOSED.

- [PM STATUS SYNC 2026-04-06] Wave 1 verified — 8 parallel tasks confirmed COMPLETED:
  #178 PASS, #180 PASS, #184 PASS, #186 PASS, #198 PASS, #213 PASS (V4.3 CLOSED),
  #216 PASS (V4.4 CLOSED via #217), #218 COMPLETED. Status header updated: V4.0.2 CLOSED,
  V4.0.3 CLOSED, V4.0.4 #198 PASS, V4.3 CLOSED, V4.4 CLOSED, V5.2 CLOSED.
  Open areas: V4.0.4 (#199-#205), V4.5 (#223 PENDING).

- [V4.0.2 AREA CLOSED 2026-04-06] TASK #187 COMPLETED — AREA CHECKPOINT PASS. 312/312 tests, build OK. All 6 Gemini E2E PTY/UI bugs verified fixed: PtyExplosion live output, ring buffer TUI sanitization, blocker false-positive suppression, snippet protocol filtering, InterAgentFeed icons. No regressions.

- [V4.0.4 TASK #199 COMPLETED 2026-04-06] Verified no change needed — control tokens __DONE__ and __HANDOFF__ are already preserved literally throughout the full pipeline (server snippet generation, WS broadcast, client rendering). Not a bug. TEST GATE #200 can proceed.

# Progress
- [V4.5 TEST GATE PASS 2026-04-06] TASK #222 COMPLETED — TEST GATE PASS for V4.5 Snippet Fidelity MVP Blockers
  312/312 server tests, client build 480 modules 0 errors. All 5 prerequisite tasks verified COMPLETED. _decompressConPTYSpaces handles case transitions + punctuation, SNIPPET_NOISE_LINE_PATTERNS 98+ patterns, _buildSemanticSnippet pipeline complete. TASK #223 AREA CHECKPOINT unblocked.

- [V4.4 AREA CLOSED 2026-04-06] TASK #217 COMPLETED — AREA CHECKPOINT PASS. 312/312 tests, build OK. Thinking animations + hook output filtering verified in SNIPPET_NOISE_LINE_PATTERNS. V4.4 Snippet Fidelity Final Polish is CLOSED.

- [V4.0.4 TEST GATE PASS 2026-04-06] TASK #198 COMPLETED — TEST GATE PASS for BUG-SNIPPET-FIDELITY-1
  All 10+ snippet quality tests pass (107/107 swarm-engine, 312/312 full suite). Finder/Route Checker/Formatter
  contamination filtered. No stale foreign text survives. Redraw fragments -> empty snippet. Structured fact
  reconstruction works. Protocol echo stripped. TASK #199 can proceed.

- [V4.0.2 TEST GATE PASS 2026-04-06] TASK #184 COMPLETED — TEST GATE BUG-SNIPPET-PROTOCOL-1 PASS
  Snippet semantic sanitization verified: 80+ noise patterns, block-level protocol stripping, semantic block scoring. 312/312 server tests, 107/107 swarm-engine tests. TASK #185 unblocked.

- [V4.5 FIX CLOSED 2026-04-06] TASK #218 COMPLETED — BUG-SNIPPET-CONPTY-SPACES marked COMPLETED after review
  _decompressConPTYSpaces() heuristic handles mixed-case English text and punctuation-separated text. Known limitation:
  all-lowercase text (Italian prose) unsolvable without dictionary — accepted as platform constraint. 312/312 tests pass.
- [V4.3 AREA CLOSED 2026-04-06] TASK #213 COMPLETED PASS — AREA CHECKPOINT for V4.3 E2E Deep Test Round 2
  312/312 server tests pass. Client build 480 modules 0 errors. SNIPPET_NOISE_LINE_PATTERNS covers all CLI chrome noise:
  bypass permissions, ctrl+g, Herding variants, version banner, model effort, thinking animations. V4.3 AREA CLOSED.

- [V4.0.2 TEST GATE PASS 2026-04-06] TASK #186 COMPLETED — TEST GATE PASS for BUG-FEED-ICON-1
  All 6 feed event types have matching EVENT_ICONS entries. handoff_completed renders checkmark. 312/312 server tests. Client build clean.
- [V4.0.2 TEST GATE PASS 2026-04-06] TASK #178 COMPLETED — TEST GATE PASS for BUG-PTY-EXPLOSION-1
  PtyExplosion connects to correct session WS, ring buffer replay on attachClient, multiple clients supported, DEC-009 respected. 312/312 tests. Client build clean.
- [V4.4 TEST GATE PASS 2026-04-06] TASK #216 COMPLETED — TEST GATE PASS for V4.4 Snippet Fidelity
  All 6 required patterns verified in SNIPPET_NOISE_LINE_PATTERNS (thinking animations, hook output). 312/312 server tests. Client build clean. AREA CHECKPOINT #217 is next.

- [V5.2 AREA CLOSED 2026-04-06] TASK #244 COMPLETED PASS — AREA CHECKPOINT for V5.2 Swarm Deep Test Bug Fixes
  All 6 integration checks passed: 312/312 server tests, client build clean, /health 200, malformed JSON 400,
  API 404 JSON, SPA root 200. TEST GATE #243 PASS confirmed. #242 DEFERRED acknowledged. V5.2 AREA IS CLOSED.

- [V5.2 TEST GATE PASS 2026-04-06] TASK #243 COMPLETED — TEST GATE PASS for all V5.2 bug fixes
  Malformed JSON 400 (3 endpoints), fetch-based hydration with 404 cleanup, rate limit 300, API 404 JSON. 312/312 tests. Client build OK. AREA CHECKPOINT #244 is next.

- [V5.2 WAVE 1 COMPLETE 2026-04-06] Tasks #238, #239, #240, #241 ALL COMPLETED — V5.2 Wave 1 done
  All 4 active bug fixes in V5.2 are complete. TEST GATE #243 now IN_PROGRESS (qa-tester running).
  Wave 1 summary: BUG-SWARM-API-1 (malformed JSON 400), BUG-SWARM-UI-2 (stale execution hydration cleared),
  BUG-SWARM-UI-3 (rate limit relaxed), BUG-SWARM-API-2 (API 404 catch-all). 312/312 tests pass across all fixes.
  Next: #243 TEST GATE result -> if PASS -> #244 AREA CHECKPOINT -> V5.2 CLOSED.

- [V5.2 FIX 2026-04-06] TASK #239 COMPLETED — BUG-SWARM-UI-2 stale execution hydration 404 cleared
  useSwarm.js hydration now detects 404 on persisted execution fetch, clears stale ID from localStorage,
  resets to idle. No more spurious 404 console errors after server restart. Client build passes.

- [V5.2 FIX 2026-04-06] TASK #238 COMPLETED — BUG-SWARM-API-1 malformed JSON returns 400 not 500
  Global error handler in server/index.js now detects Express body-parser SyntaxError and returns HTTP 400
  with clear JSON error. 312/312 tests pass.

- [V5.2 FIX 2026-04-06] TASK #241 COMPLETED — BUG-SWARM-API-2 API 404 catch-all before SPA fallback
  Unmatched /api/* paths now return JSON 404 instead of HTML 200. 312/312 tests pass.

- [V5.2 FIX 2026-04-06] TASK #240 COMPLETED — BUG-SWARM-UI-3 rate limiter relaxed from 200 to 300 req/min
  Normal rapid view switching no longer triggers 429 errors. 312/312 tests pass.

- [V5.2 PLAN 2026-04-06] Debugger Loop Phase 2 — Swarm Deep Test Bug Fixes bulk plan created
  Tasks #238-#244 added to TASK_PLAN.md. 5 bugs from Phase 1 E2E testing. MEDIUM: #238 (malformed JSON 500→400), #239 (stale execution hydration 404). LOW: #240 (rate limiter too strict), #241 (SPA catch-all for API paths). DEFERRED: #242 (duplicate workflow names). TEST GATE #243, AREA CHECKPOINT #244. Wave 1: #238+#239+#240+#241 in parallel. Wave 2: #243. Wave 3: #244.

- [V5.1 AREA CHECKPOINT VERIFIED 2026-04-06] Task #237 AREA CHECKPOINT PASS — V5.1 CLOSED
  qa-tester ran all 5 acceptance checks: npm test 312/312, client build 480 modules, health 200, webhook POST 200 (no CSRF), non-webhook POST 403 (CSRF enforced). All green. V5.1 area fully closed.

- [V5.1 AREA CLOSED 2026-04-06] V5.1 Debugger Loop Full-App Deep Check — CLOSED
  All tasks resolved: #234 COMPLETED (BUG-API-1 webhook CSRF exemption), #235 COMPLETED (TEST GATE PASS), #236 DEFERRED (BUG-UI-1 ConPTY artifact, DEC-009, MVP-acceptable), #237 COMPLETED (AREA CHECKPOINT verified). Webhook endpoint is now accessible to external callers. No regressions in V5.0, V4.x, or V3.x. No open tasks remain in V5.1.

- [V5.1 PM REVIEW 2026-04-06] TASK #234 VERIFIED COMPLETED — all 6 acceptance criteria checked. TASK #235 (TEST GATE) is NEXT — assigned to qa-tester. Critical path: #235 -> #237 (AREA CHECKPOINT).
- [V5.1 FIX 2026-04-06] TASK #234 COMPLETED — BUG-API-1 webhook CSRF exemption
  Added path-based exemption in server/middleware/csrf.js for `/api/v1/triggers/webhooks/` prefix. External webhook callers no longer receive 403 CSRF validation failed. All 312 server tests pass. Client build OK.

- [V5.1 PLAN 2026-04-06] Debugger Loop Full-App Deep Check — Phase 2 bulk plan created
  Tasks #234-#237 added to TASK_PLAN.md. BUG-API-1 (HIGH): webhook endpoint blocked by global CSRF middleware — assigned to debugger (#234), TEST GATE (#235), AREA CHECKPOINT (#237). BUG-UI-1 (LOW): terminal prompt garble after navigation — DEFERRED as known ConPTY artifact per DEC-009 (#236). Next: debugger fixes #234, then qa-tester runs #235 gate, then #237 checkpoint.

- [V5.0 FIX 2026-04-06] TASK #231 COMPLETED + TASK #232 COMPLETED — Swarm snippet preamble filtering and PTY Explosion terminal switching
  Two V5.0 debugger-loop bug fixes landed. (1) TASK #231 (BUG-WF-1): SwarmEngine.js `SNIPPET_NOISE_LINE_PATTERNS` expanded with 13 new regexes filtering swarm protocol preamble text ("You are a ... agent", "Current task:", "Workflow goal:", etc.) from agent node snippets. `_stripSnippetProtocolArtifacts()` also gained a `--- SWARM INPUT ... END SWARM INPUT ---` block-level regex so the entire injected prompt block is stripped before snippet scoring. (2) TASK #232 (BUG-WF-3): SwarmView.jsx `PtyExplosion` now carries `key={ptyExplosionNodeId}`, forcing React to unmount/remount the component when the user switches between agent terminals. This eliminates the stale xterm.js / WebSocket state that previously showed Agent A's terminal when the user clicked "Open Terminal" on Agent B. Build: 480 modules, 0 errors. TASK #233 (BUG-WF-2, done-token recovery prompt filtering) remains PENDING.

- [FIX/QA 2026-04-05] Codex auto-fallback prompt was compacted enough to remove the live `prompt_rejected` gate
  Follow-up on the residual `Codex/finder` blocker after the first compact-retry pass showed that the compact Codex bootstrap was still too large for the live workflow: the non-terminal fallback prompt for Finder was still ~959 chars and the resume retry ~618 chars, so `Auto` could still fall through `Codex -> Gemini` with `lastFallback.type=prompt_rejected`. `SwarmEngine` now uses a truly minimal compact Codex prompt for non-terminal agents: no Codex preamble in compact mode, no replay of the full workflow `currentTask` when the node already has its own system prompt, a dedicated ultra-short resume prompt after `prompt_rejected`, and a smaller handoff contract (`Last line only ...`) while keeping templated target IDs. Regression coverage was extended in `server/tests/swarm-engine.test.js` to prove that resume prompts no longer replay the full node instructions and that non-terminal compact Codex prompts stay focused on the node task instead of the full workflow block. Verification: `npx vitest run tests/swarm-engine.test.js` = 106/106 pass. Live retest after restart materially changed the runtime behavior: execution `4d1a46dd-d178-4dd0-8f1d-521b03e3043f` no longer fell back from `Codex` to `Gemini` because of `prompt_rejected`; instead `lastFallback` is now `codex -> gemini : rate_limited`, which means Codex progressed far enough that the remaining blocker is quota/availability, not prompt injection rejection. A previous live run before the final compaction (`c4db6322-eb87-4567-90b7-41cc524a5d21`) still completed end-to-end on Gemini after the old `prompt_rejected` path, so the new evidence is the stronger proof of improvement. The honest remaining open gate is provider capacity during live `Auto` E2E, plus separate snippet fidelity noise still visible in Gemini terminal-state tails.
- [FIX/QA 2026-04-05] Codex compact-retry no longer leaves a ghost blocked state, but live auto E2E still stalls after the retry
  Follow-up on the residual `Codex/finder` runtime bug after the live prompt-rejection probes. `SwarmEngine._attemptRuntimeFallback()` now clears the transient `prompt_rejected` blocker and restores the agent to `running` before attempting the one-time compact Codex retry, so the execution contract no longer reports a stale blocked state while the replacement/retry path is already in motion. Regression coverage was added/updated in `server/tests/swarm-engine.test.js` for the exact auto-mode case: one compact Codex retry is attempted first, the retry keeps `activeProvider/runtimeProvider=codex`, and the status contract no longer exposes `runtimeBlocker`. Verification: `npx vitest run tests/swarm-engine.test.js` = 104/104 pass. Fresh live auto execution `b00424d3-2625-48d9-9e7a-cd68dad16dd5` on `Prompt Reliability Control Workflow` confirms the behavior changed materially: `Claude -> Codex` fallback still occurs on a real Claude rate limit, Codex then emits the real `Conversation interrupted - tell the model what to do differently` line, and the backend keeps the run in truthful `running` state while reinjecting the compact prompt instead of immediately falling through to Gemini. However the gate is still open because the same live run then stalled on Codex with `finder.status=running`, `handoffCount=0`, and no downstream spawn even after the compact retry, so the next fix target is no longer false blocked-state reporting but why the post-retry Codex session stops making forward progress toward handoff.
- [FIX/QA 2026-04-05] Runtime availability + Gemini blocker precedence corrected after live E2E
  Follow-up on the browser E2E findings closed two concrete contract bugs. First, `server/index.js` now assigns the discovered Codex binary to `sessionManager`, so `/api/v1/swarm/runtime-capabilities` no longer reports `codex=false` while `Auto` fallback can still launch Codex; after restart, the live API reports `availability={ claude:true, codex:true, gemini:true }` and the Swarm toolbar no longer renders `Codex (Unavailable)`. Second, `SwarmEngine` now filters runtime blocker patterns by provider, recognizes hard Gemini quota phrases such as `You have exhausted your capacity on this model` / `Usage limit reached for all Pro models`, and lets those quota signals win over the Gemini `no_progress_timeout` watchdog when both are present in recent runtime output. Added regression coverage in `server/tests/swarm-engine.test.js` for the exhausted-capacity-vs-no-progress case. Verification: `npx vitest run tests/swarm-engine.test.js tests/swarm-routes.test.js` = 110/110 pass; live API check after server restart confirms all three runtimes are marked available and default to `claude=opus`, `codex=gpt-5.4`, `gemini=gemini-2.5-pro`.
- [QA 2026-04-05] Fresh browser E2E on runtime defaults found two live contract bugs
  Re-ran `Prompt Reliability Control Workflow` end-to-end from the real Swarm UI after restarting the local server with the latest runtime-default changes. The toolbar/model popup now reflects the new backend contract correctly (`claude -> opus`, `gemini -> gemini-2.5-pro`), but the live runs exposed two important mismatches. First, `GET /api/v1/swarm/runtime-capabilities` reported `availability.codex=false`, so the UI disabled Codex as `Unavailable`, yet an `Auto` execution (`8f13b5db-29fb-471e-93ff-a31efec4393b`) still fell back from Claude to Codex and ran on `gpt-5.4`; this is a real backend/UI contract bug, not just a display glitch. Second, a Gemini-only execution (`fe878f9d-90c5-44d5-898f-08124f026de5`) made one healthy handoff (`finder -> route-checker`, `edge c1=1`) but then the route-checker PTY hit repeated Gemini quota/usage-limit UI while the execution was ultimately classified as `runtimeBlocker.type=no_progress_timeout` instead of a rate-limit blocker. Result: the runtime-default UI wiring is improved, but E2E is still not closure-ready because provider availability and blocker classification are not yet truthful in all live cases.
- [FIX/QA 2026-04-05] Runtime model defaults now resolve to the highest detected model per provider
  Closed the runtime default-model drift between backend execution and the Swarm UI for all three providers. `SwarmEngine` now centralizes runtime model selection through `getDefaultRuntimeModel()` / `getRuntimeCapabilitySnapshot()`, so each detected runtime defaults to its highest curated model (`claude -> opus`, `codex -> gpt-5.4`, `gemini -> gemini-2.5-pro`) while still allowing an explicit per-provider override. Claude PTY launches now use `--model`, so it is no longer stuck on a non-configurable account default in Swarm. The `/api/v1/swarm/runtime-capabilities` route now exposes authoritative `providers`, `defaults`, and `availability`, and `SwarmView` consumes that contract to auto-preselect the detected default, disable unavailable runtimes, and keep manual per-provider overrides available without advertising stale placeholder defaults. Verification: `npx vitest run tests/swarm-engine.test.js tests/swarm-routes.test.js` = 109/109 pass, `npm run build --prefix client` passes.
- [FIX/QA 2026-04-05] TASK #197 completed, TASK #198 still blocked by a separate live Codex runtime failure
  `SwarmEngine` no longer exposes `lastOutputSnippet` as a near-raw PTY tail. The backend now keeps `_rawSnippetBuffer` for runtime detection only and derives the public snippet through a semantic sanitization pipeline that strips protocol echo (`--- END SWARM INPUT ---`), provider shell chrome, `/skills` / `/review` helper lines, Codex working/footer noise, stale foreign text (`Explain this codebase`, `print_handoff.py`, `server.pid`), and noisy redraw fragments. Added new regression cases in `server/tests/swarm-engine.test.js` for Finder/Route Checker/Formatter contamination, Codex prompt-rejection fallback, pure working-chrome tails, and prompt-echo wrappers. Verification: `npm test --prefix server -- swarm-engine.test.js` = 92/92 pass. Live retest on execution `c05059c1-3842-4e50-830b-1a4433ee70ff` confirmed that Finder card preview and `/api/v1/swarm/:executionId/status` now agree on a cleaned semantic snippet (`PROMPT-CONTROL-REPORT | VERSION=3.0.0 ...`) instead of showing `--- END SWARM INPUT ---` / raw prompt wrapper text. However the full TEST GATE #198 cannot honestly pass yet because the same run later derailed on a separate Codex runtime bug: Finder got interrupted with `Conversation interrupted - tell the model what to do differently`, never reached handoff, and the workflow never advanced to Route Checker / Formatter for full snippet-matrix verification.
- [PM 2026-04-05] V4.0.4 planning wave opened for agent terminal fidelity + snippet hygiene
  Added a new V4.0.4 area to `docs/TASK_PLAN.md` after a deep inspection of the currently open Codex Swarm execution `03037bdc-fa17-4184-890f-cc46106cb5b6`. The new tasks (#197-#205) isolate the remaining reliability problems that are no longer about duplicate handoffs themselves, but about how agent terminals are represented: contaminated `lastOutputSnippet` generation, collapsed control-token rendering, stale foreign prompt text inside PTY replay, noisy/meaningless node-card previews, and lack of explicit labeling for recovery/system-authored correction prompts. The canonical repro remains `Prompt Reliability Control Workflow`, with per-agent inspection of Finder, Route Checker, and Formatter through browser UI plus backend `/status` and `/agent/:nodeId/output`.
- [QA/FIX 2026-04-05] V4.0.3 Swarm hydration + Gemini control-flow stability wave completed
  Closed tasks #189-#196 after implementing three connected fixes: (1) backend-authoritative runtime model registry with `/api/v1/swarm/runtime-capabilities`, fail-fast 400 validation, and a Gemini dropdown that now only shows `gemini-2.5-pro` / `gemini-2.5-flash`; (2) bounded Gemini pre-handoff progress detection in `SwarmEngine` using forward-progress markers plus a watchdog that blocks honestly with `runtimeBlocker.type=no_progress_timeout`; and (3) stricter frontend runtime-state hygiene so new executions clear stale counters/feed/snippets, reset preserves the loaded workflow, and `SwarmCanvas` is re-keyed by execution identity. Verification: `npm test --prefix server -- swarm-engine.test.js swarm-routes.test.js` = 96/96 pass, `npm run build --prefix client` passes, browser QA confirmed no stale execution on reload or `Swarm -> Projects -> Swarm`, invalid Gemini model selection is rejected, and live Gemini control execution `e17a6ea7-818e-4ef0-8420-e1c6f00b7cd7` blocked honestly after ~67.5s instead of silently burning budget.
- [PM 2026-04-05] V4.0.3 planning wave opened for Swarm hydration + Gemini control-flow stability
  Added a new V4.0.3 task area to `docs/TASK_PLAN.md` to handle the bugs surfaced by the real retests after V4.0.2: stale ghost execution state in Swarm, Gemini model-list drift (`gemini-2.0-flash` advertised but rejected by the installed CLI), and oversized pre-handoff Gemini budget burn in the deterministic control workflow. New tasks #188-#196 split the work into implementation + TEST GATE streams for hydration integrity, validated model registry, bounded pre-handoff progress, and full UI/backend execution-state synchronization.
- [FIX 2026-04-05] Swarm ghost execution state cleared on re-entry
  Root cause of the misleading Swarm canvas was frontend hydration, not the backend execution map alone. `useSwarm.restorePersistedExecution()` only restored when a persisted execution existed; if there was no active persisted run, the Zustand store could keep showing a dead execution from memory, and if a persisted execution had already become `stopped/completed/failed`, the hook still rehydrated that dead snapshot into the canvas. Fix: added `clearExecutionState()` in `SwarmContext.jsx` and taught `useSwarm.js` to clear execution-only state when no persisted execution exists, when a persisted execution lookup fails, and after hydrating an execution that is already terminal. This keeps the loaded workflow available while preventing stale ghost runs from staying visible. Verification: `npm run build --prefix client` passes, and browser retest after stop/reload now returns Swarm to idle instead of showing the old stopped/completed run.
- [QA 2026-04-05] Fresh E2E retest split the backend/runtime result from the UI result
  Re-ran the deterministic `Prompt Reliability Control Workflow` as a live E2E against the current code on 2026-04-05. Gemini retest outcome is mixed: the new live execution `c578b338-1f29-445f-a869-5626231aa02e` no longer reproduced the old prompt-chain explosion in backend state (`edgeCounters.c1=1`, `finder.handoffCount=1` after stop), which suggests the in-flight `_onHandoff()` duplicate guard is helping in production. However the browser UI initially rendered a stale ghost state from a previous run, showing `Completed` plus `13 handoffs` while the backend status for the fresh execution still had only the `finder` agent running. The same Gemini run also spent more than a minute and over 200k estimated tokens on the first agent before a clean downstream state appeared, so E2E is still not healthy enough to call fixed. A quick Claude rerun remains quota-blocked in real life: execution `8655a46f-43f3-4c09-b586-fd5ee70872b8` hit the provider limit menu again within ~12 seconds and correctly surfaced `runtimeBlocker.type=rate_limited`.
- [FIX 2026-04-05] Duplicate handoff/prompt chain replay partially mitigated in SwarmEngine
  Follow-up analysis on the prompt-delivery stress audit confirmed that the “many messages in chain” symptom was not only provider verbosity: SwarmEngine could keep parsing a source PTY while the first `_onHandoff()` was still opening the target session. That left a race where repeated PTY redraws or repeated Gemini natural-language handoff text could increment the same edge counter multiple times before the source agent was finally marked done. Fix: the source agent is now marked internal `handoffing` immediately when `_onHandoff()` begins, duplicate `_onHandoff()` calls are ignored once the source has left `running`, and the PTY tap now stops parser/runtime-blocker processing for non-running agents. Regression proof added in `server/tests/swarm-engine.test.js`: repeated Gemini handoff chunks during an in-flight handoff now keep `handoffCount=1` and `edge-ab=1`. Verification: `npm test --prefix server -- swarm-engine.test.js` = 79/79 pass.
- [QA 2026-04-05] Claude/Gemini prompt-delivery stress audit found new runtime issues
  Real browser-driven Swarm QA on the new `Prompt Stress Audit Workflow` and `Prompt Reliability Control Workflow` exposed four important findings. (1) Claude-only runs are currently blocked immediately by a real provider usage-limit menu on 2026-04-05, so Claude could only be verified up to blocker detection. (2) The Gemini model option `gemini-2.0-flash` is advertised by the UI/backend contract but the installed Gemini CLI rejects it at runtime with `Model "gemini-2.0-flash" was not found or is invalid.`, leaving the Planner stuck on the Keep trying / Stop menu. (3) A lean 3-agent Gemini control workflow reproduced repeated downstream delivery: `finder` reached `status=done` with `handoffCount=18` and edge `c1=18` while `route-checker` kept running, which strongly suggests duplicate handoff/prompt processing rather than a single clean transition. (4) The Swarm UI can leave `Run` disabled after a reset/model-selection sequence even when the workflow remains visibly loaded, forcing an API-level restart workaround during QA. PTY visibility itself is working: browser node cards and raw agent output both showed live Gemini thinking/tool activity instead of blank panes.

- [TASK #197 follow-up] Agent terminal snippet fidelity hardened further â€” PARTIAL PROGRESS 2026-04-05
  After a real Codex rerun of `Prompt Reliability Control Workflow`, `/api/v1/swarm/:executionId/status` still exposed unreliable live snippets even though the earlier unit cases passed. `SwarmEngine` now separates the short runtime-detection buffer from a larger snippet-source buffer, refreshes terminal-state snippets from the agent session replay when serializing/broadcasting non-running states, and scores semantic report/fact blocks above recovery boilerplate and Codex TUI progress chrome. Added regression coverage for the exact failure shape: a useful semantic block followed by a long noisy tail plus final-agent recovery reminders. Verification: `npx vitest run tests/swarm-engine.test.js tests/swarm-routes.test.js tests/SessionManager.test.js` = 128/128 pass; live probe `a0fa0fe5-ccd4-4528-8b7b-ebbb0abf6f39` now shows a coherent backend snippet during the run instead of raw TUI fragments. Remaining work: TASK #198 final E2E gate still needs a full browser/backend pass across all three agents.

- [TASK #232 COMPLETED] BUG-WF-3 — PTY Explosion opens wrong agent terminal after switching nodes — 2026-04-06
  Added key={ptyExplosionNodeId} to PtyExplosion in SwarmView.jsx line 520. Forces React to fully unmount/remount when switching between agent terminals, eliminating stale xterm/WS state. Build passes (480 modules, 0 errors).
- [PM 2026-04-06] V5.0 Debugger Loop Deep Check — Phase 3 bug fixes COMPLETE, task plan updated
  Post-Phase-3 review: #231 (BUG-WF-1, system prompt snippet noise) COMPLETED with 13 new noise patterns + SWARM INPUT block regex. #232 (BUG-WF-3, wrong PTY terminal) COMPLETED with key prop fix. #233 (BUG-WF-2, done-token recovery noise) DEFERRED as MVP-acceptable — only visible in raw terminal, snippet pipeline already filters it. CHECK tasks: #225 (workflow lifecycle) and #227 (agent terminals) marked COMPLETED. #226 (HITL) and #228 (persistence) remain PENDING but unblocked. TEST GATE #229 BLOCKED on #226 + #228 completion. AREA CHECKPOINT #230 BLOCKED on #229. Next action: run #226 and #228 in parallel (qa-tester), then evaluate #229.
- [TASKS #178, #180, #184, #186, #187] Gemini INVALID_ARGUMENT root cause isolated and mitigated 2026-04-05
  Deep analysis of the live Gemini-only E2E showed that the most reproducible `INVALID_ARGUMENT` failure was triggered when the BroadcastBar `hard` mode interrupted a Gemini agent in the middle of an active tool/function turn. Our previous route implementation wrote `Ctrl-C` / raw PTY input directly, which can desynchronize Gemini's function-call accounting and produce the provider error `Please ensure that the number of function response parts is equal to the number of function call parts`. Fix: broadcasts now flow through `SwarmEngine.sendBroadcast()`, Gemini broadcasts are queued until the runtime prompt is writable again instead of forcing a mid-turn interrupt, pending prompts now flush as soon as prompt-ready is detected, and non-retrying Gemini function-call mismatch errors now surface as honest blocked runtime states instead of being silently ignored. Verification: `npm test --prefix server -- swarm-engine.test.js swarm-routes.test.js` = 86/86 pass, plus a fresh live Puppeteer rerun on 2026-04-05 with a `hard` Gemini broadcast against the running Researcher no longer reproduced `INVALID_ARGUMENT` in the PTY output.
- [TASKS #178, #180, #184, #186, #187] V4.0.2 Gemini-only full E2E rerun - STILL FAILING FUNCTIONALLY 2026-04-05
  Full browser E2E was re-run as a real user flow on `Research and Report Team` with runtime provider `Gemini` only and an explicit target output for the Writer (`Roman Aqueducts Brief` with 5 exact lines). The Researcher PTY Explosion is no longer blank and correctly replays live output, but the terminal visibly shows repeated Gemini `INVALID_ARGUMENT` API errors plus stray `]]` fragments. The execution eventually reports `completed` and spawns the Writer, but the Writer PTY deterministically replays unrelated stale content about `2026 Development Strategy`, emits `__DONE__`, and writes `summary_report.md` with that wrong content instead of the requested Roman-aqueduct output. Result: PTY visibility is improved, but the end-to-end Gemini workflow is still not trustworthy and the remaining QA gates must stay open.
- [TASKS #177, #179, #181, #182, #183, #185] V4.0.2 Gemini E2E PTY / UI Bug Fixes — CODE FIXES + BLOCKER GATE COMPLETED 2026-04-05
  SessionManager now sanitizes replay-only Gemini Ink TUI control sequences while preserving the permanent live PTY broadcast path, which resolves the PTY Explosion "replay only" symptom and the blank/gapped replay bug together. SwarmEngine now ignores transient Gemini retry text that was causing false `blocked` states, auto-handles Gemini usage-limit menus before hard-blocking, suppresses stale auth/API-key misclassification after Gemini recovery output, and promotes queued Gemini model switches once request-cancelled / ready markers appear via the real Gemini slash command syntax `/model set <fallback>`. InterAgentFeed now has a proper `handoff_completed` icon plus icons for current live feed event types. Verification: `npm test --prefix server -- SessionManager.test.js swarm-engine.test.js` = 100/100 pass.
- [TASKS #178, #180, #184, #186, #187] V4.0.2 Gemini E2E PTY / UI Bug Fixes — REAL GEMINI QA STILL PENDING 2026-04-05
  Real Gemini rerun with workflow `Research and Report Team` now keeps the Researcher out of false `blocked` state and records `lastModelFallback = gemini-2.5-flash`, proving the auto-recovery path triggers. However Gemini CLI still returns `API Error: You have exhausted your capacity on this model` and never advances to the Writer node, so PTY Explosion / Writer snippet / feed-icon end-to-end gates remain honestly open. A follow-up rerun after the `/model set` fix and server restart stayed alive for several minutes without reproducing the usage-limit menu again, so the updated command path is implemented and test-covered but not freshly re-observed in a natural live quota event.
- [TASKS #169-#170] V4.1 Per-Harness Model Selection — COMPLETED 2026-04-05
  Backend: _buildRuntimeProviderArgs accepts runtimeModels override, route POST /start accepts runtimeModels. Frontend: Models dropdown in SwarmView toolbar for Codex/Gemini. 7 new tests (70/70 pass). V4.1 CLOSED.
- [TASKS #171-#176] V4.0.1 Gemini Runtime Bug Fixes — COMPLETED 2026-04-05
  BUG-GEMINI-4 through BUG-GEMINI-7: Fixed 4 Gemini runtime bugs in SwarmEngine.js. 63/63 tests pass. V4.0.1 CLOSED.
## Completed
- [TASKS #160, #162, #164] Gemini CLI Bug-Fix Wave — definitive patch (backend+frontend) — COMPLETED 2026-04-04
  BUG-GEMINI-1 (CRITICAL): Refined `_flushSwarmPrompt` to flatten prompts and increase submission delays (800ms) to avoid Gemini's Ink TUI multi-line traps. BUG-GEMINI-2 (MEDIUM): Updated `_isRuntimePromptReady` with actual Gemini patterns (`type your message`, `>`). BUG-GEMINI-3 (LOW): Corrected `providerStrategyLabel` in `SwarmView.jsx` to show selection-specific labels even before execution. E2E verification: Playwright confirmed UI fix, vitest confirmed engine logic.

- [TASKS #138-#142] Swarm runtime integrity + contract completion wave - COMPLETED 2026-04-02
  Verified the Swarm runtime lifecycle/browser recovery gate, added deterministic local scaffold fallback when external providers are unavailable, completed scoped broadcast delivery (`all` / `department` / `agent`) with explicit recipient reporting, and restored live `lastOutputSnippet` propagation through `agent_status`. Docs/API/PRD contracts were aligned to the implemented behavior. Verification: `npm test --prefix server` = 203/203 pass, `npm run build --prefix client` succeeds, browser run verified Prompt-to-Flow generation, saved workflow loading, and execution completion.


- [TASKS #116-#118] Swarm Bug-Fix Wave — post-release patch (frontend-dev) — COMPLETED 2026-03-31
  BUG-SWARM-1: SwarmCanvas.jsx useEffect calls useReactFlow().fitView (setTimeout 50ms) after setNodes/setEdges — nodes now centered after generation. BUG-SWARM-2: Removed opacity:0 and staggered CSS animation from node style in PromptToFlowBar.jsx — ReactFlow bounding box measurements now correct. BUG-SWARM-3: workflowDef migrated from SwarmView.jsx local useState to Zustand (useSwarmStore.workflowDef + setWorkflowDef) — persists across route navigation. BUG-SWARM-4: useSwarm.startExecution already throws Error('No workflow selected') on undefined workflowId — confirmed present. Removed orphaned @keyframes fadeIn from index.css. All 4 bugs FIXED.

- [TASKS #114-#115] Toolbar Bug-Fix Wave (frontend-dev) — COMPLETED 2026-03-31
  BUG-TOOLBAR-2: useSwarm.js cleanup useEffect re-keyed on [workflowId] — old WebSocket now closed on workflow regen. BUG-TOOLBAR-3: SwarmView.jsx handlePause/handleResume guard against null activeExecutionId — no more /null/ URL requests. 187/187 tests pass. All 115 tasks COMPLETED. v3.0.0 fully stable, zero open bugs.

- [TASKS #104-#111] QA Visual Bug-Fix Wave (frontend-dev) — COMPLETED 2026-03-31
  All 8 bugs from the Puppeteer visual audit resolved: InterAgentFeed w-56 shrink-0 (VISUAL-01/SW-03),
  Stop button paused-state condition (SW-01), Run button activeProjectId guard (SW-02), HITL drawer
  header + stopPropagation (VISUAL-05), HitlInbox approve/reject disabled state (SW-05), version bump
  to v3.0.0 in package.json (VISUAL-07), agentStates subscription removed from useSwarm deps (SW-04).
  Puppeteer confirmation: all 6 views render correctly. v3.0.0 release state confirmed.

- [TASK-93/96/97/98] Backend service bug fixes (backend-dev) — COMPLETED 2026-03-28
  BUG-93: stopExecution() now calls budgetTracker.clearExecution(). BUG-96: Added public getExecution() method to SwarmEngine, inbox.js updated to use it instead of private _executions. BUG-97: cleanupExecution() now cleans up null-executionId pollers. BUG-98: getStatus() returns real budget data from budgetTracker. 187/187 tests pass. 473 modules build clean.
- [TASK-88/90/91] Frontend bug fixes (frontend-dev) — COMPLETED 2026-03-28
  BUG-88: handoffCount increment logic fixed (increments by 1 per event, not assigned edge counter). BUG-90: TriggerNode animation re-triggers on repeated firings (counter instead of boolean). BUG-91: useSwarm granular Zustand selectors prevent cascade re-renders. Build: 473 modules, 0 errors.
- [TASK-82] V3 Documentation Update (documenter) — COMPLETED 2026-03-28
  README.md V3 section, docs/ARCHITECTURE.md Section 11, docs/API.md created, docs/memory/PROJECT.md updated to v3.0. All documentation UP_TO_DATE for v3.0.0 release.
- [TASK-81] Build verification + v3.0.0 tag (devops) — COMPLETED 2026-03-28
  npm run build: 473 modules, 866.72 kB (within 3MB limit). npm test: 187/187 PASS. npm audit: 1 pre-existing HIGH in path-to-regexp (non-exploitable, noted in security audit). Git tag v3.0.0 created successfully. V3 release-ready.
- [TASK-80-BUGFIX] Swarm route init order bug (debugger) — COMPLETED 2026-03-28
  swarmRoutes() and inboxRoutes() were called with undefined swarmEngine. Fixed by moving SwarmEngine instantiation to before route mounting (section 7), keeping all routes before the SPA wildcard fallback. 187/187 tests pass. Committed as 843680a.
- [TASK-80] V3 End-to-End Test (qa-tester) — COMPLETED 2026-03-28
  E2E Playwright test of V3 Swarm Orchestrator. 187/187 tests pass. All 6 sidebar views load. SwarmView components verified (PromptToFlowBar, canvas, BreadcrumbBar, AgentInspector). V2 backward compatibility confirmed (Terminal spawns PTY with Claude Code CLI). Scaffold fails gracefully without API key. ONE HIGH BUG FOUND: SwarmEngine route initialization order — swarmRoutes and inboxRoutes mounted before SwarmEngine instantiation in server/index.js:231-234 vs 271-272, causing 500 on all execution endpoints.
- [TASK-79] V3 Pre-Release Security Audit (security) — COMPLETED 2026-03-28
  All 7 SEC-V3 requirements verified as active in production code. Zero CRITICAL/HIGH findings in V3 code. One MEDIUM design note (webhook CSRF interaction — net security positive). Two HIGH npm dependency advisories (path-to-regexp, picomatch — neither exploitable in current usage). 187/187 tests pass. docs/security-v3-audit.md produced.
- [TASK-78] SwarmEngine Integration Tests (qa-tester) — COMPLETED 2026-03-28
  server/tests/swarm-engine.test.js created: 19 tests across 7 cases (lifecycle, handoff, circuit breaker, budget, heartbeat, HITL, DEC-009). 187/187 tests pass in 5.62s. SessionManager fully mocked — no real PTY.
- [TASK-77] HandoffParser Unit Tests (qa-tester) — COMPLETED 2026-03-28
  server/tests/HandoffParser.test.js verified: all 8 required scenarios covered (chunk splitting, ANSI stripping, oversized payload rejection, malformed base64, __DONE__ detection, buffer overflow, multiple tokens). 168/168 tests pass.
- [TASK-74] TriggerManager.js — Webhooks + RSS Polling (backend-dev) — COMPLETED 2026-03-28
  server/services/TriggerManager.js created. Webhook registration, dispatch, RSS polling with SSRF guard. 168/168 tests pass.
- [TASK-62.2] SwarmEngine._onHandoff context injection + status updates (backend-dev) — COMPLETED 2026-03-27
  After _ensureAgentPty: injects updated workflowContext prompt into target PTY, sets source status done, sets target status running, broadcasts WS events.

### Phase 0 — Foundation (DONE as of 2026-03-18)
- [TASK-1] docs/ARCHITECTURE.md produced by architect — 2026-03-18
  All 10 sections complete: component diagram, full API surface (all endpoints), WebSocket protocol
  spec, RingBuffer implementation spec, idle timeout sweeper spec, Claude binary discovery algorithm,
  YAML frontmatter parse/serialize pattern, React state management (Zustand), error handling matrix,
  startup and shutdown sequence. This is the reference document for all implementation agents.
- [TASK-2] Monorepo scaffold created by devops — 2026-03-18
  Full monorepo structure created. npm install successful in both server/ and client/. npm run build
  verified. GET /health returns 200 at http://127.0.0.1:3000.
  PACKAGE CORRECTIONS discovered:
    - node-pty (not node-pty-prebuilt-multiarch) — prebuilt-multiarch did not resolve; plain node-pty works.
    - write-file-atomic (not write-atomic) — write-atomic does not exist on npm; correct package is write-file-atomic.
  Both corrected packages are installed in server/node_modules. All subsequent agents must use these names.
- [TASK-3] Server Foundation (backend-dev) — COMPLETED 2026-03-18
  Added: server/services/ConfigStore.js, ProcessRegistry.js, BinaryDiscovery.js, services/index.js,
  server/middleware/security.js, csrf.js, pathValidation.js. server/index.js fully bootstrapped.
  Verified: GET /health → 200; CSRF guard active; 501 on unimplemented routes.
- [TASK-4] Project Management REST API (backend-dev) — COMPLETED 2026-03-18
  Added: server/routes/projects.js (projectsRouter). Mounted at /api/v1/projects in server/index.js.
  All endpoints verified: list, create (auto-scaffold), get (pathExists check), delete, manual scaffold.
  Scaffold creates: .claude/CLAUDE.md (if missing), .claude/agents/, .claude/commands/.
- [TASK-5] SessionManager PTY spawn + ring buffer + idle sweeper, WebSocket terminal handler (backend-dev) — COMPLETED 2026-03-18
  Added: server/services/RingBuffer.js (100KB circular buffer, toBuffer() replay), server/services/SessionManager.js
  (singleton PTY owner, permanent pty.onData, idle sweeper every 5 min / 30 min timeout, backpressure guard),
  server/routes/sessions.js (session CRUD, sanitized responses), server/ws/terminalHandler.js (WebSocket attach/detach,
  input/resize routing). Modified: server/index.js (WSS maxPayload 1MB, sessionManager.killAll() in shutdown).
  PTY survives browser tab close. tree-kill via createRequire (CJS). sessionManager.claudeBin set by index.js.
- [TASK-6] React Sidebar + TerminalView + xterm.js + resize (frontend-dev) — COMPLETED 2026-03-18
  Added: client/src/store/AppContext.jsx (global context: projects, sessions, activeProjectId, activeView),
  client/src/hooks/useSession.js (WebSocket lifecycle + reconnect logic), client/src/components/Terminal.jsx
  (xterm.js instance, FitAddon, ResizeObserver debounced 100ms, term.reset on session switch),
  client/src/components/Sidebar.jsx (project list, status indicators, Stop button, Add Project modal trigger),
  client/src/components/AddProjectModal.jsx (register + scaffold flows), client/src/views/TerminalView.jsx
  (Start Terminal button, session switching, ring buffer replay on reconnect). Build verified.
- [TASK-7] Entity Management API (backend-dev) — COMPLETED 2026-03-18
  Created: server/services/FileManager.js (path-validated atomic file I/O), server/utils/frontmatter.js (YAML
  parse/serialize helpers), server/routes/agents.js (CRUD /api/v1/agents), server/routes/skills.js (CRUD
  /api/v1/skills, 4 scan locations: modern+legacy x user+project), server/routes/claudemd.js (read/write
  CLAUDE.md user+project scope). Mounted all three routers in server/index.js. npm run build verified.

- [TASK-8] Entity Management UI (frontend-dev) — COMPLETED 2026-03-18
  EntitiesView with 3 tabs: AgentEditor (full CRUD + restart banner), SkillEditor (full CRUD + toast), ClaudeMdEditor (dual-panel + live line count + 300-line warning). Build clean.

- [TASK-9] Job Mode API (backend-dev) — COMPLETED 2026-03-18
  Created: server/services/JobRunner.js (spawn claude -p, readline stdout SSE forwarding, tree-kill cancellation, cancelAll() for shutdown), server/routes/jobs.js (POST/GET stream/DELETE/GET list). Mounted in server/index.js. child.stdin.end() enforced (DEC-005). shell: false (SEC-02). Prompt never logged (SEC-08). Build verified.

- [TASK-10] Job Mode UI (frontend-dev) — COMPLETED 2026-03-18
  Created: useJob hook (startJob POST+EventSource, cancelJob DELETE, reset), JobPanel (5 render states: idle/running/done/cancelled/error, StreamLog, MarkdownResult with react-markdown+remark-gfm, AdvancedOptions, Copy button), JobView updated from stub. Markdown prose styles added to index.css. Build clean.

- [TASK-11] Projects View UI (frontend-dev) — COMPLETED 2026-03-18
  Replaced ProjectsView stub with full implementation: table of all projects (Name, Path, Status badge, Created date, Actions), "Register Project" button opens AddProjectModal, "Open Terminal" dispatches SET_ACTIVE_PROJECT + SET_VIEW:terminal, "Delete" shows ConfirmDialog then calls DELETE /api/v1/projects/:id + REMOVE_PROJECT dispatch. Fetches on mount and after modal close. Build clean (304 modules).
- [TASK-12] Non-Functional Requirements Polish (backend-dev) — COMPLETED 2026-03-18
  Added to server/index.js: browser auto-open (exec, NO_OPEN guard), in-memory rate limiter (200 req/min on /api/v1/*), GET /api/v1/version endpoint (appVersion, nodeVersion, platform), improved /health (uptime, activeSessions, activeJobs), improved startup logging ([startup] prefixed with version, binary path, config dir). Build verified clean.

## In Progress

### V4.0 — Gemini CLI Harness Integration (COMPLETED 2026-04-04)
_Integration finalized after fixing 3 E2E regressions (BUG-GEMINI-1, 2, 3)._

## Blocked
_None._

- [TASK-14] Pre-Release Security Audit (security) — COMPLETED 2026-03-18
  All 10 SEC requirements PASS. 3 MEDIUM findings (exec in openBrowser, allowedTools not whitelisted, PID file integrity), 2 LOW. 0 CRITICAL/HIGH. npm audit: 0 CVEs across 185 deps. Overall risk: LOW. docs/SECURITY_AUDIT.md produced.

- [TASK-13] Full QA Test Suite (qa-tester) — COMPLETED 2026-03-18
  110 tests pass (0 failures) across 6 test files. vitest v4.1.0 installed. All 6 PRD critical paths covered + unit tests for RingBuffer, FileManager, CSRF, pathValidation, SessionManager, JobRunner. `npm test` works from root and server directories. docs/TEST_RESULTS.md produced.

## Pending

### V4.0 — Gemini CLI Harness Integration
- [TASK-154] GEMINI-DISCOVERY-1 — Add Gemini CLI binary discovery to BinaryDiscovery.js (COMPLETED 2026-04-04)
- [TASK-155] GEMINI-SCAFFOLD-1 — Add Gemini scaffold provider to ScaffoldGenerator.js (COMPLETED 2026-04-04)
- [TASK-156] GEMINI-RUNTIME-1 — Add Gemini as a Swarm runtime provider in SwarmEngine.js (COMPLETED 2026-04-04)
- [TASK-157] GEMINI-UI-1 — Add Gemini to the Runtime provider dropdown and status indicators in SwarmView (COMPLETED 2026-04-04)
- [TASK-158] GEMINI-BLOCKER-1 — Add Gemini interactive PTY blocker and prompt-ready detection tests (COMPLETED 2026-04-04)
- [TASK-159] GEMINI-ROUTE-1 — Wire Gemini binary into swarm routes and server startup (COMPLETED 2026-04-04)
- **E2E TEST 2026-04-04: Tasks #154-#159 passed code review but live E2E test with Gemini CLI found 3 bugs:**
  - BUG-GEMINI-1 (CRITICAL): Prompt injection fails — Gemini Ink TUI treats `\n` as in-field newline, prompt never submitted
  - BUG-GEMINI-2 (MEDIUM): Prompt-ready pattern `esc to interrupt` not emitted by Gemini — always falls to 2500ms timer
  - BUG-GEMINI-3 (LOW/cosmetic): Strategy label shows "Auto fallback" before execution regardless of dropdown selection
- [TASK-160] BUG-GEMINI-1 — Fix prompt injection for Gemini CLI (PENDING)
- [TASK-161] TEST GATE — BUG-GEMINI-1 (PENDING)
- [TASK-162] BUG-GEMINI-2 — Fix prompt-ready detection patterns for Gemini CLI (PENDING)
- [TASK-163] TEST GATE — BUG-GEMINI-2 (PENDING)
- [TASK-164] BUG-GEMINI-3 — Fix strategy label cosmetic issue (PENDING)
- [TASK-165] TEST GATE — BUG-GEMINI-3 (PENDING)
- [TASK-166] GEMINI-DOCS-1 — Update DECISIONS.md, CODE_MAP.md, and ARCHITECTURE.md for Gemini provider (PENDING)
- [TASK-167] TEST GATE — Gemini CLI harness integration verification (PENDING)
- [TASK-168] AREA CHECKPOINT — V4.0 Gemini Harness Full Integration (end-to-end) (PENDING)

### V4.1 — Per-Harness Runtime Model Selection
- [TASK-169] FEATURE-MODEL-1 — Per-harness model selection UI and backend contract (PENDING)
- [TASK-170] FEATURE-MODEL-2 — Implement per-harness model selection (backend + frontend) (PENDING)

### Phase 7 — v1.1 Maintenance Backlog (ALL INDEPENDENT, run in parallel)
- [TASK-19] v1.1 — Fix JobRunner memory leak — backend-dev — COMPLETED 2026-03-24
  BUG-06 FIXED: Added _scheduleEviction() method with 10-minute TTL setTimeout (.unref()).
  Jobs in terminal state (done/cancelled/error) are auto-evicted after 10 min. Safety check
  prevents eviction while SSE clients are still connected. Timer stored on job record for clearing.
  File: server/services/JobRunner.js. All 110 tests pass.
- [TASK-20] v1.1 — Fix rate limiter memory leak — backend-dev — COMPLETED 2026-03-24
  BUG-07 FIXED: Added setInterval sweep (every 60s, .unref()) that deletes _rateLimitMap entries
  where resetAt has passed. No behavioral change for active rate-limited IPs. File: server/index.js
- [TASK-21] v1.1 — Upgrade vite to patch esbuild CVE — devops — COMPLETED 2026-03-24
  MEDIUM-04 FIXED: Upgraded vite from 5.4.21 to 6.4.1 in client/package.json. esbuild CVE
  (GHSA-67mh-4wv8-2f99) resolved — npm audit returns 0 vulnerabilities. Build passes (301 modules).
  All 110 tests pass. @vitejs/plugin-react@4.7.0 compatible with vite 6. Files: client/package.json,
  client/package-lock.json.

### Phase 6 — Security Hardening (ALL COMPLETED 2026-03-18)
- [TASK-16] Security hardening — replace exec() in openBrowser with shell:false spawn (backend-dev) — COMPLETED 2026-03-18
  Fixed: server/index.js. openBrowser() now uses spawn with shell:false, detached:true, child.unref(). exec removed.
- [TASK-17] Security hardening — validate allowedTools against character whitelist (backend-dev) — COMPLETED 2026-03-18
  Fixed: server/routes/jobs.js. Added /^[a-zA-Z0-9_,\-]+$/ regex check + 512-char length cap, HTTP 400 on violation.
- [TASK-18] Security hardening — validate PID range in ProcessRegistry (backend-dev) — COMPLETED 2026-03-18
  Fixed: server/services/ProcessRegistry.js. isValidPid() helper (range 1–65535), cleanupStale() and register() both guarded.

## V3 Planning Status
**V3 PRD WRITTEN — 2026-03-27.** docs/PRD.md (version 3.0) complete. Ready for project-manager to build V3 TASK_PLAN and architect to design SwarmEngine. 6 open questions in PRD Section 11 need architect review before implementation.

## Release Status
**v2.0 RELEASE READY — ALL 31 tasks COMPLETED as of 2026-03-26.**
- v1 (18 tasks, Phase 0–6): COMPLETED 2026-03-18.
- v1.1 (3 tasks, Phase 7): COMPLETED 2026-03-24.
  - TASK-19: JobRunner memory leak fixed (TTL eviction, BUG-06)
  - TASK-20: Rate limiter memory leak fixed (stale sweep, BUG-07)
  - TASK-21: Vite 5.4→6.4.1 (esbuild CVE MEDIUM-04 resolved)
- v1.2 (1 task, Phase 8): COMPLETED 2026-03-24.
  - TASK-22: GET /api/v1/jobs/:id route added (BUG-22)
- QA regression: 110/110 tests pass, npm audit 0 vulnerabilities.
- Full E2E audit: 25 endpoints + 8 UI views tested, 0 bugs remaining.
- Ready for `git tag v1.2.0`.
- v2.0 (9 tasks, Phase 9): COMPLETED 2026-03-26.
  - TASK-23 through TASK-30: Full frontend redesign from Stitch design exports (Tailwind, 5 new views, sidebar, app shell)
  - TASK-31: Visual QA + Functional Regression — 110/110 tests pass, 299 modules build, 0 critical/high bugs
- QA regression (Phase 9): 110/110 tests pass, build clean (299 modules), 0 CRITICAL/HIGH findings.
- Ready for `git tag v2.0.0`.
- v2.1 (10 tasks, Phase 10): 9/10 COMPLETED 2026-03-26. TASK-41 (regression QA) pending.
  - TASK-32: CSP fix — Google Fonts unblocked (fontSrc + styleSrc updated in security.js)
  - TASK-33: JobRunner child.on('error') handler + stdin.end() try-catch
  - TASK-34: Sidebar creatingSessionRef race condition lock
  - TASK-35: ContextEditorView handleScopeSwitch confirmation guard
  - TASK-36: Terminal background #1a1a1a → #000000
  - TASK-37: Sidebar sessionError state with visible UI feedback
  - TASK-38: SidebarFooter dynamic version via /api/v1/version + settings icon de-interactivized
  - TASK-39: Logo container overflow-hidden
  - TASK-40: AddProjectModal mode prop (register/scaffold), ProjectCard focus-within accessibility
  - Build: 299 modules, 0 errors

## Phase 9 — Frontend Redesign (Stitch Design Export)
**Status: COMPLETED — All 9 tasks (#23-#31) done as of 2026-03-26.**
- [TASK-23] COMPLETED 2026-03-25 — Design System Foundation (Tailwind config, fonts, CSS, constants) — frontend-dev
- [TASK-24] COMPLETED 2026-03-25 — New Sidebar Navigation Component — frontend-dev — depends on #23
- [TASK-25] COMPLETED 2026-03-26 — Project Dashboard View (replaces ProjectsView) — frontend-dev
- [TASK-26] COMPLETED 2026-03-26 — Live Terminal Hub View (replaces TerminalView) — frontend-dev
- [TASK-27] COMPLETED 2026-03-26 — Orchestration Center / Job Runner View (replaces JobView) — frontend-dev
- [TASK-28] COMPLETED 2026-03-26 — Context & Rules Editor View (new, replaces CLAUDE.md tab) — frontend-dev
- [TASK-29] COMPLETED 2026-03-26 — Deployment Manager View (new, replaces Agents/Skills tabs) — frontend-dev
- [TASK-30] COMPLETED 2026-03-26 — App Shell, Routing, View Integration — frontend-dev
- [TASK-31] COMPLETED 2026-03-26 — Visual QA + Functional Regression Testing — qa-tester

## Known Issues
- R-01 (RESOLVED): node-pty-prebuilt-multiarch not available — plain node-pty used instead
- R-02 (MITIGATED): ConPTY deadlock — permanent pty.onData handler enforced in SessionManager (never removed)
- R-04 (FIXED 2026-03-18): AddProjectModal sent POST to nonexistent /api/v1/projects/scaffold — fixed to /api/v1/projects with scaffold in body (BUG-03)
- R-05 (FIXED 2026-03-18): projects/session API responses not destructured in Sidebar and ProjectsView — all .map() calls were crashing (BUG-04, BUG-05)
- R-06 (FIXED 2026-03-18): WS_BASE hardcoded to port 3000 — fixed to window.location.port (BUG-16)
- R-07 (FIXED 2026-03-18): ws.bufferedAmount undefined server-side (browser API) — backpressure guard was always false; fixed to ws._socket.bufferSize (BUG-11)
- R-08 (FIXED 2026-03-18): yaml.load() non-object return not guarded in parseFrontmatter (BUG-14)
- R-09 (FIXED 2026-03-18): Double ProcessRegistry.unregister per session kill (BUG-02)
- R-10 (FIXED 2026-03-24): JobRunner #jobs Map memory leak — completed jobs now auto-evicted after 10min TTL (BUG-06, TASK-19)
- R-11 (FIXED 2026-03-24): Rate limiter _rateLimitMap stale sweep added — 60s interval cleans expired entries (BUG-07, TASK-20)
- R-03 (RESOLVED): Job mode process hang if child.stdin.end() not called — enforced in Task #9 (JobRunner.js line after spawn)
- NOTE: FileManager was NOT created in Task #5 as planned — RESOLVED in Task #7 (created server/services/FileManager.js).

## V3 — Swarm Orchestrator (57 granular tasks after split — 2026-03-27 replan)
**Status: 46/57 COMPLETED — as of 2026-03-28. All Phase 1 backend tasks done. All Phase 2 (Canvas Static) COMPLETED. Phase 3 (Prompt-to-Flow) FULLY COMPLETED. Phase 4 (Live Execution) ACTIVE: #62.1, #62.2, #62.3, #63, #64, #66, #67 DONE. Phase 5 wave: #68, #69, #70, #71.1, #71.2, #73 DONE. Phase 6 (Trigger Nodes): #74, #75, #76 ALL COMPLETED.**
**Note: Original 40 tasks (#43–#82). After model assignment + subtask split: 57 granular units.**
**7 original tasks split into subtasks: #46→3, #47→2, #48→2, #53→3, #57→2, #62→3, #71→2**
- V3 PRD complete: docs/PRD.md
- V3 research complete: docs/research_complete.md, research_a/b/c.md
- V3 task plan: docs/TASK_PLAN.md tasks #43–#82 (with subtasks .1/.2/.3)

### V3 Phase 1 — Backend Foundation
- [TASK-43] COMPLETED 2026-03-27 — WorkflowStore.js — 132/132 tests pass
- [TASK-44] COMPLETED 2026-03-27 — workflows.js CRUD routes (routes mounted, CRUD working)
- [TASK-45] COMPLETED 2026-03-27 — HandoffParser.js — 22 unit tests, 132/132 tests pass
- [TASK-46.1] COMPLETED 2026-03-27 — SwarmEngine — SessionManager patch + class skeleton, 132/132 tests pass
- [TASK-46.2] COMPLETED 2026-03-27 — SwarmEngine — startExecution + _spawnAgentPty + HandoffParser tap, 132/132 tests pass
- [TASK-46.3] COMPLETED 2026-03-27 — SwarmEngine — _buildSystemPrompt + _startHeartbeat, 132/132 tests pass
- [TASK-47.1] COMPLETED 2026-03-27 — swarm.js — 7 execution control endpoints, scaffold stub (501), mounted at /api/v1/swarm, 132/132 tests pass
- [TASK-47.2] COMPLETED 2026-03-27 — swarm.js — scaffold stub (501) confirmed present from #47.1; no code changes needed; 132/132 tests pass
- [TASK-48.1] COMPLETED 2026-03-27 — swarmHandler.js — channel routing + connection management; dual noServer WSS routing via server.on('upgrade'); 132/132 tests pass
- [TASK-48.2] COMPLETED 2026-03-27 — swarmHandler.js broadcast() + WS event wiring; broadcast() named export added; setWsBroadcast(broadcast) called in server/index.js; 132/132 tests pass
- [TASK-49] COMPLETED 2026-03-27 — CircuitBreaker.js + BudgetTracker.js — pure service classes, 132/132 tests pass
- [TASK-49] COMPLETED 2026-03-27 — CircuitBreaker.js + BudgetTracker.js — pure service classes, no I/O, no imports, 132/132 tests pass
- [TASK-50] COMPLETED 2026-03-27 — V3 Security Layer (SEC-V3-01 to SEC-V3-07) — ssrfGuard.js, webhookLimit.js, webhookRateLimit.js, hitlValidation.js created; SEC-V3-02/-06/-07 verified in WorkflowStore.js + HandoffParser.js; 36 new tests; 168/168 pass

### V3 Phase 2 — Canvas Static
- [TASK-51] COMPLETED 2026-03-27 — @xyflow/react@12.10.1 + zustand@4.5.7 installed in client/; 299 modules build clean; 132/132 tests pass — devops agent
- [TASK-52] COMPLETED 2026-03-27 — SwarmContext.jsx Zustand ExecutionStore — client/src/store/SwarmContext.jsx created; useSwarmStore Zustand store with execution state, canvas navigation, HITL inbox, inter-agent feed, breadcrumb stack. Build clean (299 modules).
- [TASK-53.1] COMPLETED 2026-03-27 — AgentNode.jsx — client/src/canvas/nodes/AgentNode.jsx created; reads agentStates from useSwarmStore, renders status colors, handles/label/snippet/handoffCount. Build clean (299 modules).
- [TASK-53.2] COMPLETED 2026-03-27 — DepartmentNode.jsx — client/src/canvas/nodes/DepartmentNode.jsx created; group container node with focused/selected state, setFocusedDepartment click, agentCount badge. Build clean (299 modules).
- [TASK-53.3] COMPLETED 2026-03-27 — TriggerNode.jsx — client/src/canvas/nodes/TriggerNode.jsx created; source-only Handle, purple theme, webhook (🔗) / rss (📡) icon mapping, selected ring. Build clean (299 modules).
- [TASK-54] COMPLETED 2026-03-27 — HandoffEdge.jsx — client/src/canvas/edges/HandoffEdge.jsx created; animated dashed blue line + counter badge driven by useSwarmStore edgeCounters[id]; @keyframes dashdraw added to index.css. Build clean (299 modules).
- [TASK-55] COMPLETED 2026-03-27 — AgentInspector.jsx — client/src/canvas/AgentInspector.jsx created; reads selectedNodeId/agentStates/setSelectedNode from SwarmStore; shows label, type badge, live status, handoffCount, systemPrompt, lastOutputSnippet; empty state when nothing selected. Build clean (299 modules).
- [TASK-56] COMPLETED 2026-03-27 — BreadcrumbBar.jsx — client/src/canvas/BreadcrumbBar.jsx created; root "All Agents" crumb always shown, department crumbs from departmentStack with label resolution from nodes prop, last crumb bold/white, navigateBreadcrumb(index) on click. Build clean (299 modules).
- [TASK-57.1] COMPLETED 2026-03-27 — SwarmCanvas.jsx — React Flow canvas with drill-down filtering; registers agent/department/trigger nodeTypes + handoff edgeType; useMemo drill-down filters nodes by focusedDepartmentId; onNodeClick/onPaneClick wired to SwarmStore; BreadcrumbBar + AgentInspector mounted. Build clean (299 modules).
- [TASK-57.2] COMPLETED 2026-03-27 — SwarmView.jsx — full-page layout shell; toolbar with executionStatus indicator (idle/running/stopped) + conditional Reset button; ReactFlowProvider wraps SwarmCanvas; workflowDef as useState(null) pending #61. Build clean (299 modules).
- [TASK-58] COMPLETED 2026-03-27 — App.jsx + Sidebar swarm nav; SwarmView imported and added to switch; 'hub' icon + 'Swarm' label added to NAV_ITEMS in constants.js (Sidebar auto-renders dynamically from NAV_ITEMS). No extra ReactFlowProvider needed — SwarmView already wraps SwarmCanvas with its own. Build: 470 modules, 0 errors. 168/168 tests pass.

### V3 Phase 3 — Prompt-to-Flow
- [TASK-59] COMPLETED 2026-03-27 — scaffold endpoint: generateWorkflowFromPrompt() + Claude claude-haiku-4-5-20251001 + WorkflowStore.create(); @anthropic-ai/sdk installed; 168/168 tests pass
- [TASK-60] COMPLETED 2026-03-27 — PromptToFlowBar.jsx + staggered animation — PromptToFlowBar.jsx created, @keyframes fadeIn added to index.css, SwarmView.jsx wired; 471 modules build clean
- [TASK-61] COMPLETED — useWorkflow.js CRUD hook — client/src/hooks/useWorkflow.js created; uses apiGet/apiPut/apiDelete wrappers; useWorkflow(id) + useWorkflowList() exports; build: 470 modules, 0 errors

### V3 Phase 4 — Live Execution
- [TASK-62.1] COMPLETED 2026-03-27 — SwarmEngine _onHandoff: full implementation verified (context merge, edge counter, circuit breaker advisory, handoffCount, _ensureAgentPty). 168/168 tests pass.
- [TASK-62.1] COMPLETED 2026-03-27 — SwarmEngine _onHandoff steps 1-4: context merge, edge counter, circuit breaker advisory, _ensureAgentPty. 168/168 tests pass.
- [TASK-62.2] COMPLETED 2026-03-27 — SwarmEngine _onHandoff: context injection + agent status updates. 168/168 tests pass.
- [TASK-62.3] COMPLETED 2026-03-27 — SwarmEngine _onDone (dual WS events) + BudgetTracker.registerSession wiring + lastOutputSnippet verified. 168/168 tests pass.
- [TASK-63] COMPLETED 2026-03-27 — useSwarm.js WS hook for execution control
- [TASK-64] COMPLETED 2026-03-27 — useHandoff.js edge animation hook
- [TASK-65] PENDING — AgentNode live updates — pulse + micro PTY log
- [TASK-66] COMPLETED 2026-03-27 — BroadcastBar.jsx + broadcast route — client/src/canvas/BroadcastBar.jsx created; mounted at bottom of SwarmView.jsx after ReactFlowProvider; returns null unless executionStatus==='running'; POSTs to /api/v1/swarm/:executionId/broadcast with {text, scope:'all', mode}; soft/hard mode selector; 3s result feedback; build: 472 modules, 0 errors
- [TASK-67] COMPLETED 2026-03-27 — SwarmEngine heartbeat — idle sweeper prevention

### V3 Phase 5 — HITL + PTY Explosion
- [TASK-68] COMPLETED 2026-03-27 — inbox.js HITL approve/reject API (server/routes/inbox.js created, mounted at /api/v1/swarm, 168/168 tests pass)
- [TASK-69] COMPLETED 2026-03-27 — HitlInbox.jsx approval panel created (client/src/panels/HitlInbox.jsx); list view with type badges, Approve/Reject flow, inline resume textarea, empty state, getPendingCount export; 472 modules, 0 errors
- [TASK-70] COMPLETED 2026-03-27 — SwarmEngine freezeAgent/unfreezeAgent HITL methods added; 168/168 tests pass
- [TASK-71.1] COMPLETED 2026-03-27 — PTY Explosion overlay component (frontend-dev, sonnet; dep: #58 ✓)
- [TASK-71.2] COMPLETED 2026-03-28 — PTY Explosion Escape key handler (frontend-dev, haiku; 473 modules, 0 errors)
- [TASK-72] IN_PROGRESS — InterAgentFeed.jsx real-time handoff log (frontend-dev, haiku; dep: #52 ✓)
- [TASK-73] COMPLETED 2026-03-28 — useInbox.js HITL polling hook (client/src/hooks/useInbox.js; polling + approve/reject actions; 473 modules, 0 errors)

### V3 Phase 6 — Trigger Nodes
- [TASK-74] COMPLETED 2026-03-28 — TriggerManager.js webhooks + RSS polling
- [TASK-75] COMPLETED 2026-03-28 — triggers.js routes
- [TASK-76] COMPLETED 2026-03-28 — TriggerNode.jsx full visual implementation

### V3 Phase 7 — QA + Security + Release
- [TASK-77] PENDING — HandoffParser unit tests (qa-tester)
- [TASK-78] PENDING — SwarmEngine integration tests (qa-tester)
- [TASK-79] PENDING — V3 Pre-Release Security Audit (security)
- [TASK-80] PENDING — V3 End-to-End Test (qa-tester, Puppeteer)
- [TASK-81] PENDING — Build verification + v3.0.0 git tag (devops)
- [TASK-82] PENDING — V3 Documentation update (documenter)

- [TASK-65] AgentNode Live Updates — frontend-dev — COMPLETED 2026-03-27
  Enhanced micro PTY log in AgentNode.jsx: scrollable dark code block, green monospace, last 4 lines, blinking cursor when running. animate-pulse border and handoffCount badge already existed. Build clean at 472 modules.
- [TASKS #145/#153 follow-up] Live runtime evidence + parser hardening - PARTIAL PROGRESS 2026-04-03
  2026-04-03 additional follow-up: live probe `b3c645a8-4ba6-473f-96e7-c80050a5bc18` exposed a second truthfulness bug because ConPTY replayed the prompt's concrete handoff example after the echo marker, causing a fake handoff into node-b with the example payload. SwarmEngine now keeps prompt/recovery examples templated with `<targetId>` so echoed guidance cannot become a parser-consumable handoff; probe `284de139-3fac-44f1-8b07-cf9356157f71` confirmed that the fake handoff disappeared (`running`, `handoffCount: 0`), and probe `9a7c81ae-ec1d-4b3b-a7c5-7abd01c10a22` confirmed that when Codex prints both a hard usage-limit stop and the softer `Approaching rate limits` chooser, Swarm now prefers the hard blocker and returns explicit `blocked` instead of hanging in ambiguous `running`. Verification now: `npm test --prefix server -- HandoffParser.test.js swarm-engine.test.js` = 83/83 pass, `vite build` succeeds. Remaining blocker: no usable non-blocked AI-dependent handoff run yet, so `#145`, `#148`, and `#153` remain open.
  Added HandoffParser tolerance for terminal-rendered `HANDOFF:` tokens after a live Codex run showed the interactive CLI stripping underscores from a real handoff attempt before the parser could consume it. Added deterministic test coverage for the Codex trust/bootstrap blocker. Fresh live artifacts now exist for: explicit Claude blocker (`e1e02b24-45b1-49f4-878c-8b1e1c2530e1`), explicit Codex blocker (`badef6de-2bb8-4259-8135-0df1e2f2db94`), and auto fallback Claude→Codex (`50962eb0-ee1a-4409-804b-a835f1ba8f8e`). Verification: `npm test --prefix server -- HandoffParser.test.js swarm-engine.test.js` = 72/72 pass, `vite build` succeeds. Remaining blocker: no usable non-blocked AI-dependent handoff run yet, so `#145`, `#148`, and `#153` remain open.





- [TASK #197 / #198 follow-up] Snippet fidelity hardening - PARTIAL PROGRESS 2026-04-05
  SwarmEngine snippet extraction now keeps a longer snippet-source buffer than the runtime-detection tail, refreshes terminal-state snippets from full session replay, reconstructs structured fact/report snippets from scattered `PROMPT-CONTROL-REPORT` / `START_ROUTE` / `STATUS_ROUTE` / `DONE_TOKEN` lines, and de-ranks replay blocks dominated by `Ran ...`, shell errors, prompt boilerplate, or provider quota banners. Added deterministic regressions in `server/tests/swarm-engine.test.js` for replay-backed semantic preservation, structured-fact reconstruction after command failures, and final-report reconstruction when the report lines are split apart by redraw noise. Verification: `npx vitest run tests/swarm-engine.test.js tests/swarm-routes.test.js tests/SessionManager.test.js` = 130/130 pass.
  Live evidence is mixed but improved: a real Codex run before the second heuristic pass completed all three agents and exposed the remaining replay-ranking bug (`route-checker` was beaten by `Ran rg ...` / PowerShell error blocks and `formatter` by prompt text instead of the final report), which directly informed the fix. After restarting the server to validate the refined logic live, Codex hit a hard usage-limit blocker immediately on `finder` (`executionId: 8a9d854a-77cd-4f13-84cb-e60c5ba56223`), so TASK #198 is still not honestly closable yet. Current state: deterministic coverage is green, browser/backend agreement was previously confirmed for `finder`, but a fresh full Codex E2E proof for all three agents still depends on runtime availability.
- [TASK #199 follow-up] UI debug views now annotate token aliases explicitly - PARTIAL PROGRESS 2026-04-05
  Added `client/src/utils/controlTokens.js` and wired it into `client/src/canvas/nodes/AgentNode.jsx` plus `client/src/canvas/AgentInspector.jsx` so snippet-based debug surfaces keep the raw text visible but explicitly warn when they are showing alias-like control text such as `HANDOFF:` or `DONE_TOKEN=DONE` instead of literal contract tokens. This reduces the risk that a provider-normalized alias is mistaken for the true parser contract while preserving exact `__DONE__` / `__HANDOFF__` visibility when those literals really appear. Verification: `npm run build --prefix client` succeeds.
- [TASK #198 / #199 / runtime-defaults follow-up] Post-fix E2E retest - PARTIAL PROGRESS 2026-04-05
  After wiring `sessionManager.codexBin` during server bootstrap and tightening Gemini blocker precedence, a fresh browser/API retest on `Prompt Reliability Control Workflow` confirmed the runtime-capability contract is now coherent: `/api/v1/swarm/runtime-capabilities` reports `availability.{claude,codex,gemini}=true`, the Swarm UI no longer labels Codex as unavailable, and the detected defaults remain `claude=opus`, `codex=gpt-5.4`, `gemini=gemini-2.5-pro`.
  The new `Auto` live run (`executionId: e92567b9-c747-4651-8bfe-c5692e7cfefb`) still does not close TASK #198. Claude fell back to Codex as expected, but `finder` remained `running` for multiple minutes with `handoffCount: 0`, no `runtimeBlocker`, and useful but never-finalized Codex output. Raw PTY replay shows Codex gathering the expected route/version facts, so this is no longer an availability/reporting bug; it is a separate live issue where Codex stays trapped in PTY work without emitting the handoff/done contract.
  The new `Gemini only` live run (`executionId: 160d83a7-53b9-4e6d-b7eb-38d2859699ac`) confirms the blocker-classification fix is working. Gemini surfaced explicit quota text (`You have exhausted your capacity on this model`, `Usage limit reached for all Pro models`, `Access resets at ...`) and the backend now reports `status: blocked` with `runtimeBlocker.type=rate_limited` on `finder` instead of collapsing the case into `no_progress_timeout`. This closes the earlier truthfulness gap for Gemini quota failures, while leaving the Codex no-handoff live bug as the main remaining blocker for fully closing TASK #198.
- [TASK #198 follow-up] Codex handoff recovery hardening - PARTIAL PROGRESS 2026-04-05
  Investigated the remaining live Codex stall and confirmed two distinct issues. First, a Codex non-terminal node can genuinely emit a valid `HANDOFF:` alias in PTY replay while the live parser misses it if the session is temporarily gated by `ignoreParserUntil`. SwarmEngine now performs a guarded buffered-handoff recovery pass over recent replay/runtime output, selecting only valid downstream handoffs and ignoring placeholder prompt examples. Added deterministic regression coverage for that case in `server/tests/swarm-engine.test.js`.
  Second, the earlier Codex missing-handoff reminder was too aggressive. The reminder prompt is now parser-safe (no literal parser-consumable control tokens), skips the echo-gate that could swallow a subsequent real handoff, avoids the Codex `Esc` interrupt path, and is delayed to a much later idle window so Codex gets time to complete naturally before Swarm intervenes. Verification: `npx vitest run tests/swarm-engine.test.js` = 103/103 pass.
  Live probes are improved for diagnosis but do not yet honestly close the task. Probe `6ad7a25d-c0f6-4ab9-a69a-5f57a61cf69b` exposed the true parser-loss bug because raw finder replay contained a valid `HANDOFF:route-checker:{...}` alias while execution state stayed `running`; that directly informed the buffered recovery fix. After the follow-up hardening and another server restart, probe `b729552b-7fed-4ffe-800b-7151eb4dd614` still fell through `Codex -> Gemini`, ending blocked on Gemini quota after `lastFallback.type=prompt_rejected`. So the parser-loss path is now covered and hardened, but there remains a separate live Codex prompt-rejection/fallback problem before TASK #198 can be closed end-to-end.
