# Research C: Claude Code Configuration File Formats

## Question

What is the exact directory structure and file format that Claude Code CLI expects for:
1. Agent definition files (frontmatter fields, required vs optional, example)
2. Skill/slash command files (format, how they are invoked)
3. CLAUDE.md (sections, conventions, what Claude reads from it)
4. settings.json or any other config files

What are the exact paths on Windows?

---

## Findings

### 1. Agent Definition Files

Agents (called "subagents") are Markdown files with YAML frontmatter. The body of the file becomes the system prompt.

**Paths (priority order, highest first):**
- `--agents` CLI flag (JSON, session-only, not persisted)
- `.claude/agents/<name>.md` — project-scoped, committed to version control
- `~/.claude/agents/<name>.md` — user-scoped (all projects)
- Plugin `agents/` directory — lowest priority

On Windows, `~` resolves to `C:\Users\<username>`, so the global path is `C:\Users\<username>\.claude\agents\<name>.md`.

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | YES | Lowercase letters and hyphens. Unique identifier. |
| `description` | YES | When Claude should delegate to this agent. |
| `tools` | No | Comma-separated allowlist. Inherits all tools if omitted. |
| `disallowedTools` | No | Denylist — tools removed from inherited set. |
| `model` | No | `sonnet`, `opus`, `haiku`, a full model ID, or `inherit`. Defaults to `inherit`. |
| `permissionMode` | No | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, or `plan`. |
| `maxTurns` | No | Maximum agentic turns before the agent stops. |
| `skills` | No | List of skill names to preload into the agent's context at startup. |
| `mcpServers` | No | MCP servers available to this agent (inline or by name reference). |
| `hooks` | No | Lifecycle hooks scoped to this agent. |
| `memory` | No | Persistent memory scope: `user`, `project`, or `local`. |
| `background` | No | `true` to always run as a background task. Default: `false`. |
| `isolation` | No | `worktree` to run in an isolated git worktree. |

**Minimal example:**
```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a senior code reviewer. Analyze code and provide feedback on quality,
security, and best practices.
```

**Note:** Subagents are loaded at session start. After manually adding a file, restart the session or run `/agents` to load immediately.

---

### 2. Skill / Slash Command Files

Skills (the current term; "commands" is legacy) create `/slash-command` shortcuts. Both formats are equivalent.

**Paths:**
- `~/.claude/skills/<skill-name>/SKILL.md` — personal (all projects)
- `.claude/skills/<skill-name>/SKILL.md` — project-scoped
- `~/.claude/commands/<name>.md` — legacy personal commands (still supported)
- `.claude/commands/<name>.md` — legacy project commands (still supported)

On Windows: `C:\Users\<username>\.claude\skills\<skill-name>\SKILL.md`

The skill directory name (not the `name` frontmatter field) determines the slash command name. Each skill directory may also contain optional supporting files: templates, examples, and scripts.

**Frontmatter fields for SKILL.md:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name override; defaults to directory name. Lowercase, hyphens, max 64 chars. |
| `description` | Recommended | What the skill does and when to use it. Claude uses this for auto-invocation decisions. |
| `argument-hint` | No | Autocomplete hint shown in the `/` menu (e.g., `[issue-number]`). |
| `disable-model-invocation` | No | `true` prevents Claude from auto-loading this skill. User must invoke it manually. Default: `false`. |
| `user-invocable` | No | `false` hides the skill from the `/` menu; only Claude can invoke it. Default: `true`. |
| `allowed-tools` | No | Tools Claude can use without per-use approval when this skill is active. |
| `model` | No | Model to use when this skill is active. |
| `context` | No | `fork` runs the skill in an isolated subagent context. |
| `agent` | No | Which subagent type to use when `context: fork` is set. |
| `hooks` | No | Hooks scoped to this skill's lifecycle. |

**Invocation:**
- User types `/skill-name` (or `/skill-name argument`) in the Claude Code prompt.
- Claude can also invoke automatically when the task matches the `description`.
- `$ARGUMENTS` placeholder in the skill content is replaced with whatever follows the skill name.
- `$ARGUMENTS[N]` or `$N` access individual positional arguments.

**Minimal example (`~/.claude/skills/fix-issue/SKILL.md`):**
```markdown
---
name: fix-issue
description: Fix a GitHub issue by number
disable-model-invocation: true
---

Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue description
2. Understand the requirements
3. Implement the fix
4. Write tests
5. Create a commit
```

**Dynamic context injection:** The `!`command`` syntax (backtick-wrapped shell command prefixed with `!`) runs a shell command before the skill content is sent to Claude and injects its output inline.

---

### 3. CLAUDE.md

CLAUDE.md is a plain Markdown file with no required structure or frontmatter. Its full content is injected into Claude's system prompt at the start of every session.

**Paths (all loaded, with precedence from most-specific to least-specific):**

| Scope | Path |
|-------|------|
| User (global) | `~/.claude/CLAUDE.md` |
| Project root | `<project-root>/CLAUDE.md` |
| Project `.claude` dir | `<project-root>/.claude/CLAUDE.md` |
| Parent directories | Scanned up the directory tree (supports monorepo setups) |

On Windows, the global path is `C:\Users\<username>\.claude\CLAUDE.md`.

**What Claude reads:** The entire file is consumed. There are no required sections. Common conventions include sections for:
- Project description and stack
- Directory layout
- Coding standards and style guidelines
- Common bash commands (build, test, lint)
- Testing instructions
- Warnings and project-specific constraints
- Agent team instructions (as in this project's global CLAUDE.md)

**Practical constraints:**
- Claude Code's system prompt already consumes ~50 tokens, so CLAUDE.md content competes for the context window.
- Official recommendation: keep under 300 lines; treat it as documentation that both humans and Claude must read quickly.
- Skill descriptions are loaded into context separately (budget: 2% of context window, fallback 16,000 characters).

---

### 4. settings.json and Other Config Files

**File hierarchy and paths:**

| Scope | Path | Notes |
|-------|------|-------|
| Managed (enterprise) | `C:\Program Files\ClaudeCode\managed-settings.json` | Cannot be overridden. Legacy `C:\ProgramData\ClaudeCode\` no longer supported as of v2.1.75. |
| Windows registry (managed) | `HKLM\SOFTWARE\Policies\ClaudeCode` (value: `Settings`, REG_SZ JSON) | Group Policy / Intune deployment. |
| User | `C:\Users\<username>\.claude\settings.json` | Applies to all projects. |
| Project (shared) | `<project>\.claude\settings.json` | Committed to version control. |
| Project (local) | `<project>\.claude\settings.local.json` | Not committed; gitignored automatically. |

**Precedence:** Managed > CLI args > Local > Project > User

**Key settings.json fields (partial list):**

| Key | Description |
|-----|-------------|
| `permissions.allow` | Array of tool permission patterns to auto-allow. |
| `permissions.deny` | Array of tool permission patterns to block. |
| `env` | Object of environment variables set for every session. |
| `model` | Override default model (e.g., `"claude-sonnet-4-6"`). |
| `hooks` | Lifecycle hook configurations. |
| `agent` | Run the main thread as a named subagent. |
| `cleanupPeriodDays` | Days before inactive sessions are deleted (default: 30). |
| `companyAnnouncements` | Array of strings shown at startup (enterprise use). |
| `apiKeyHelper` | Script to generate auth value dynamically. |
| `includeCoAuthoredBy` | Whether to include co-authored-by in git commits. |
| `language` | Claude's preferred response language. |
| `effortLevel` | Persisted effort level: `"low"`, `"medium"`, or `"high"`. |
| `alwaysThinkingEnabled` | Enable extended thinking by default. |

JSON schema for validation is published at: `https://json.schemastore.org/claude-code-settings.json`

**Other config files:**
- `~/.claude.json` — preferences (theme, OAuth session, MCP user/local configs, per-project tool trust). On Windows: `C:\Users\<username>\.claude.json`.
- `.mcp.json` — project-scoped MCP server definitions (in project root).
- `~/.claude.json` also stores per-project approved tools and session state.

**Memory directories (when agent `memory` field is set):**
- `user` scope: `~/.claude/agent-memory/<agent-name>/`
- `project` scope: `.claude/agent-memory/<agent-name>/`
- `local` scope: `.claude/agent-memory-local/<agent-name>/`

---

## Key Takeaways

- **Agent files** are Markdown + YAML frontmatter; only `name` and `description` are required. They live in `~/.claude/agents/` (user) or `.claude/agents/` (project). On Windows: `C:\Users\<username>\.claude\agents\<name>.md`.
- **Skills/commands** use `~/.claude/skills/<skill-name>/SKILL.md` (recommended) or the legacy `~/.claude/commands/<name>.md`. The directory name is the slash command name. Only `description` is strongly recommended in frontmatter; all other fields are optional.
- **CLAUDE.md** is free-form Markdown, has no required structure, and is fully injected into Claude's system prompt. It is read from multiple locations simultaneously, with more-specific paths taking precedence.
- **settings.json** is the main structured config; it lives at `~/.claude/settings.json` (user), `.claude/settings.json` (project, shared), and `.claude/settings.local.json` (project, personal). A published JSON schema enables IDE validation.
- On Windows, `~` always resolves to `C:\Users\<username>\`. Forward slashes and backslashes both work in Claude Code path handling.

---

## Implications for This Project

The web app must read and write files in at least three distinct directories (`~/.claude/agents/`, `~/.claude/skills/` or `~/.claude/commands/`, and `~/.claude/`) and handle YAML frontmatter parsing for both agents and skills. The frontmatter schemas differ between the two file types, so the app needs separate parsers or validation schemas for each. Since Claude Code loads agents at session start (not live) but picks up skill changes via live detection, the app's save flow does not need to trigger a reload for skills but should warn users to restart for agent changes to take effect. The `settings.json` schema is publicly available and should be used for validation before writing.

---

## Sources

- [Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Claude Code settings - Claude Code Docs](https://code.claude.com/docs/en/settings)
- [Using CLAUDE.md files - Anthropic Blog](https://claude.com/blog/using-claude-md-files)
- [Claude Code settings.json: Complete config guide (2026)](https://www.eesel.ai/blog/settings-json-claude-code)
- [Claude Code Configuration Files: Complete Guide - Inventive HQ](https://inventivehq.com/knowledge-base/claude/where-configuration-files-are-stored)
- [JSON Schema for settings.json](https://json.schemastore.org/claude-code-settings.json)
