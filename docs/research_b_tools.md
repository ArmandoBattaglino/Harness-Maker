# Research B: Claude CLI --allowedTools Syntax

## Question
What is the exact syntax for `--allowedTools` flag? What tools are available (full list)? Can you use glob patterns? Can you restrict tool arguments (e.g., "Bash(git *)" to only allow git commands)? Is there a `--disallowedTools` flag? What's the default tool set? How does this interact with --dangerously-skip-permissions?

## Findings

### Two Distinct Flags: --allowedTools vs --tools

Claude CLI has TWO different flags that control tools, and they serve different purposes:

1. **`--allowedTools`** -- Controls which tools run WITHOUT prompting for permission. It is a permission bypass list, NOT a restriction list. Tools not in this list still exist -- they just require user approval. Syntax: `--allowedTools "Read" "Bash(git *)" "Edit"` (space-separated quoted strings).

2. **`--tools`** -- Controls which built-in tools are AVAILABLE to the model at all. Tools not listed are completely removed from the model's context. Syntax: `--tools "Bash,Edit,Read"` (comma-separated string). Use `""` to disable all tools, `"default"` for all tools.

3. **`--disallowedTools`** -- Removes specified tools entirely from the model's context. The model cannot use them at all. Syntax: `--disallowedTools "Bash(git push *)" "Edit"` (space-separated quoted strings). Always takes precedence over --allowedTools.

### Complete Built-in Tool List

| Tool Name | Purpose |
|-----------|---------|
| `Bash` | Shell command execution |
| `Read` | Read files from filesystem |
| `Edit` | Exact string replacements in files |
| `MultiEdit` | Multiple edits to one file |
| `Write` | Create/overwrite files |
| `Glob` | File pattern matching |
| `Grep` | Regex content search (ripgrep) |
| `LS` | Directory listing |
| `WebFetch` | Fetch and process web URLs |
| `WebSearch` | Web search |
| `NotebookRead` | Read Jupyter notebooks |
| `NotebookEdit` | Edit Jupyter notebook cells |
| `TodoRead` | Read session task list |
| `TodoWrite` | Manage session task list |
| `Agent` | Launch subagent for research |
| `exit_plan_mode` | Exit plan mode |

MCP tools use prefix format: `mcp__<server>__<tool>` (e.g., `mcp__puppeteer__puppeteer_navigate`). Subagents use: `Agent(AgentName)`.

### Glob/Wildcard Pattern Syntax

Bash rules support `*` wildcards at ANY position:

- `Bash(npm run *)` -- all npm run commands
- `Bash(git *)` -- all git commands
- `Bash(* --version)` -- any --version command
- `Bash(git * main)` -- git commands targeting main
- `Bash(*)` is equivalent to plain `Bash` (matches all)

**Word boundary rule:** Space before `*` matters. `Bash(ls *)` matches `ls -la` but NOT `lsof`. `Bash(ls*)` matches both. The space enforces a word boundary.

**Shell operator awareness:** Claude Code understands `&&`, so `Bash(safe-cmd *)` will NOT auto-approve `safe-cmd && rm -rf /`. Each subcommand is evaluated independently.

Read/Edit rules use gitignore-style patterns with `*` (single dir) and `**` (recursive):
- `Edit(/src/**/*.ts)` -- TS files under src/
- `Read(./.env)` -- specific file
- `Read(~/Documents/*.pdf)` -- home-relative

WebFetch uses domain syntax: `WebFetch(domain:example.com)`.

### Argument Restriction -- YES, With Caveats

You CAN restrict Bash to specific commands: `Bash(git *)` only allows git commands. However, the official docs include a WARNING that Bash argument restrictions are "fragile":

- Options before arguments: `curl -X GET http://...` won't match `Bash(curl http://... *)`
- Variable expansion: `URL=http://example.com && curl $URL` bypasses URL restrictions
- Extra spaces or protocol variants break patterns

**Recommendation from official docs:** For URL filtering, deny all network Bash tools and use `WebFetch(domain:...)` instead. For robust enforcement, use PreToolUse hooks.

### Interaction with --dangerously-skip-permissions (CRITICAL)

**KNOWN BUG (GitHub #12232, closed as NOT_PLANNED):** `--allowedTools` as a whitelist is IGNORED when `--dangerously-skip-permissions` (aka `--permission-mode bypassPermissions`) is active. All tools run without restriction.

**`--disallowedTools` DOES work** with bypassPermissions -- tools listed there are removed from the model entirely, regardless of permission mode.

**The `--tools` flag** restricts which tools are available to the model at all, and should work regardless of permission mode since it removes tools from the model's context entirely (not a permission check).

### Precedence Rules

1. Managed settings deny -- cannot be overridden by anything
2. `--disallowedTools` -- always takes effect
3. `--allowedTools` -- auto-approves matching tools (but does NOT restrict in bypass mode)
4. Local project settings
5. Shared project settings
6. User settings

**Deny always wins.** If a tool is denied at any level, no other level can allow it.

## Key Takeaways

1. **For our swarm system, use `--tools` (not `--allowedTools`) as the security boundary.** `--tools "Bash,Read,Edit"` removes unlisted tools entirely from the model's context. This is the actual restriction mechanism.
2. **Combine `--tools` with `--disallowedTools` for defense in depth.** Use `--tools` to set the available tool set, then `--disallowedTools` to block specific dangerous patterns like `Bash(rm -rf *)`.
3. **`--allowedTools` is NOT a security boundary** when using `--dangerously-skip-permissions`. It only controls which tools skip the permission prompt in normal mode.
4. **Bash argument restrictions work but are fragile.** `Bash(git *)` blocks non-git commands but can be bypassed via shell tricks. For our use case (agent tool whitelists in a trusted local environment), this is acceptable.
5. **All 16 built-in tools are known.** MCP tools follow `mcp__server__tool` naming. Subagents follow `Agent(name)` naming.

## Implications for This Project

1. **Per-agent tool config should store TWO lists:** `tools` (available tool set, maps to `--tools`) and `disallowedTools` (blocked patterns, maps to `--disallowedTools`). Do NOT rely on `--allowedTools` as the security boundary since we use `--dangerously-skip-permissions`.

2. **Spawn command construction:** Each agent spawn should include:
   ```
   claude -p "prompt" \
     --dangerously-skip-permissions \
     --tools "Bash,Read,Edit,Grep,Glob" \
     --disallowedTools "Bash(rm -rf *)" "Bash(curl *)" \
     --output-format stream-json \
     --resume <session-id>
   ```

3. **UI design for tool config:** Present checkboxes for the 16 built-in tools (maps to `--tools`), plus a text input for custom disallowed patterns (maps to `--disallowedTools`). The `--allowedTools` flag is irrelevant in our bypass-permissions context.

4. **MCP tool control:** MCP tools can be controlled via `--disallowedTools "mcp__server__*"` pattern or by not loading the MCP server at all via `--strict-mcp-config`.

5. **The `--bare` flag** is relevant for lightweight agents: it skips CLAUDE.md, hooks, MCP, skills, and limits tools to Bash + file read + file edit. Could be useful as a "minimal" preset.

## Sources

- [Claude Code CLI Reference (official)](https://code.claude.com/docs/en/cli-reference) -- complete flag table including --tools, --allowedTools, --disallowedTools
- [Claude Code Permissions (official)](https://code.claude.com/docs/en/permissions) -- permission rule syntax, wildcard patterns, tool-specific rules, precedence
- [Claude Code Settings (official)](https://code.claude.com/docs/en/settings) -- settings.json format, permission configuration
- [GitHub Issue #12232](https://github.com/anthropics/claude-code/issues/12232) -- confirms --allowedTools does NOT restrict tools in bypassPermissions mode
- [GitHub Issue #893](https://github.com/anthropics/claude-code/issues/893) -- pattern syntax documentation bugs
- [Claude Code Tools System Prompt (gist)](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f) -- complete tool list extracted from system prompt
- [ClaudeCode101 Tools Allowlist Tutorial](https://www.claudecode101.com/en/tutorial/configuration/tools-allowlist) -- community reference for tool names and Bash restriction patterns
