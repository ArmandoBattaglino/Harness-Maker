# Research A: Claude CLI Headless/Job Mode

## Question

What flags or invocation modes does the `claude` CLI support for running non-interactively — i.e., send a prompt, get structured output back without a live terminal session? Is there a `--print` flag, a `--json` output mode, stdin pipe mode, or any headless mode? How do existing tools (like claude-code-webui, ClaudeX, ClaudeCodeUI) invoke claude non-interactively?

---

## Findings

### The `-p` / `--print` flag (the primary headless entry point)

The `claude` CLI has a first-class, officially documented headless mode activated by passing `-p` (alias `--print`). Anthropic previously called this "headless mode"; it is now branded as the **Agent SDK CLI**. The flag is stable and documented at `code.claude.com/docs/en/headless`.

```bash
claude -p "Your prompt here"
```

When `-p` is present, Claude Code processes the prompt, writes the response to stdout, and exits. No interactive terminal session is opened. All other CLI flags are compatible with `-p`.

### Output format options (`--output-format`)

Three output formats are supported, selected via `--output-format`:

| Value | Behavior |
|---|---|
| `text` (default) | Raw plain-text response on stdout |
| `json` | Single JSON object with `result`, `session_id`, usage metadata, and optionally `structured_output` if `--json-schema` is also passed |
| `stream-json` | Newline-delimited JSON events emitted in real-time as Claude generates the response |

For a job mode that waits for completion and then displays the result, `--output-format json` is the cleanest choice — one JSON blob arrives when the turn is complete, containing the full result and metadata.

For a streaming job mode (show output as it arrives), `--output-format stream-json --include-partial-messages --verbose` emits token-level delta events.

### Stdin pipe mode

Content can be piped into `claude -p` via stdin:

```bash
cat somefile.txt | claude -p "Summarize this"
gh pr diff 42 | claude -p "Review for security issues" --output-format json
```

The critical Windows/Node.js caveat: when spawning `claude -p` as a child process, **stdin must be explicitly closed immediately after spawn**, or Claude waits for more stdin input and the process hangs indefinitely. This is a confirmed bug/behavior documented in GitHub issue #7497 (Claude Code v1.0.112, affects Windows and Linux).

### Session continuity flags

- `--continue` (`-c`): continue the most recent conversation
- `--resume <id-or-name>` (`-r`): resume a specific named session
- `--session-id <uuid>`: pin a session to a specific UUID
- `--no-session-persistence`: prevent any session from being written to disk (ephemeral jobs)

### Tool approval / permission flags

- `--allowedTools "Bash,Read,Edit"`: auto-approve specific tools without prompting
- `--dangerously-skip-permissions`: skip all permission prompts (use with care)
- `--permission-prompt-tool <mcp-tool>`: delegate permission prompts to an MCP tool

### Structured JSON output with schema enforcement

```bash
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}}}'
```

The response JSON contains `structured_output` conforming to the provided schema.

### Budget and turn controls

- `--max-turns N`: stop after N agentic turns (prevents runaway agents)
- `--max-budget-usd N.NN`: cap API spend (only applies when using an API key, not subscription)
- `--fallback-model <model>`: fallback if primary model is overloaded (print mode only)

### How existing web UIs invoke claude non-interactively

**claude-code-webui** (sugyan): The README describes it as a "Web-based interface for Claude CLI with streaming chat responses." Source inspection was not available in the README, but the streaming nature implies use of `--output-format stream-json` or node-pty with `-p`. No confirmed implementation detail from docs.

**ClaudeCodeUI / CloudCLI** (siteboon): Described as providing "Direct access to the Agents CLI through built-in shell functionality." The README does not document the specific invocation method. Based on its feature set (session management, file explorer, remote access), it likely wraps both interactive sessions (via node-pty) and headless calls (via `-p`).

**General pattern across OSS projects**: The dominant community pattern for job/batch mode is `spawn("claude", ["-p", prompt, "--output-format", "json"])` with stdout captured and parsed as JSON once the process exits. The `stream-json` variant is used for streaming UIs. A known pitfall (issue #7497) is that stdin must be closed on the parent side immediately after spawn or the process hangs.

---

## Key Takeaways

- The `-p` / `--print` flag is the official, stable mechanism for non-interactive Claude Code invocation — it is actively maintained and documented by Anthropic as the "Agent SDK CLI."
- `--output-format json` returns a single, parse-ready JSON blob on stdout when the job completes; `--output-format stream-json` emits line-delimited JSON events in real-time — both are well-suited to a Node.js job runner.
- When spawning `claude -p` as a child process (via Node.js `child_process.spawn` or similar), stdin **must** be closed immediately after spawn to prevent the process from hanging indefinitely — this is a confirmed cross-platform issue (GitHub issue #7497).
- `--max-turns`, `--allowedTools`, `--dangerously-skip-permissions`, and `--no-session-persistence` are important companion flags for a well-behaved background job runner.
- `--json-schema` enables structured/typed output, useful if the job result needs to conform to a predictable shape for the frontend to render.

---

## Implications for this project

The job mode backend should spawn `claude` with `-p <prompt> --output-format json` using Node.js `child_process.spawn` (not `exec`, to avoid buffer limits on large outputs), capture stdout, and close stdin immediately after spawn to avoid the confirmed hang bug. The resulting JSON blob's `result` field contains the markdown-formatted response ready for display. For a better user experience, a streaming variant using `--output-format stream-json` can push token-level updates over WebSocket as the job runs, rather than waiting until completion. Tool permissions must be explicitly configured via `--allowedTools` or `--dangerously-skip-permissions` since interactive prompts are not possible in job mode.

---

## Sources

- Claude Code Headless/Programmatic Docs (official): https://code.claude.com/docs/en/headless
- Claude Code CLI Reference (official, full flag list): https://code.claude.com/docs/en/cli-reference
- GitHub issue #7497 — Process Hangs Indefinitely When Reading InputStream from Claude Code Headless Execution: https://github.com/anthropics/claude-code/issues/7497
- SFEIR Institute — Headless Mode and CI/CD Cheatsheet: https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/cheatsheet/
- CI/CD and Headless Mode with Claude Code (angelo-lima.fr): https://angelo-lima.fr/en/claude-code/claude-code-cicd-headless-en/
- claude-code-webui (sugyan) GitHub: https://github.com/sugyan/claude-code-webui
- ClaudeCodeUI / CloudCLI (siteboon) GitHub: https://github.com/siteboon/claudecodeui
