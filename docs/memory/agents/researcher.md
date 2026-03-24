---
## 2026-03-24 — Research: Puppeteer MCP Server for Claude Code
**Status:** COMPLETED
**Called by:** user

### Context when I started
User needed to find the correct npm package for a Puppeteer MCP server compatible with Claude Code, including exact package name, install command, and settings.json configuration.

### What I did
1. Checked npm for `@modelcontextprotocol/server-puppeteer` — confirmed it exists but is DEPRECATED
2. Searched npm and web for replacement packages
3. Found two viable community replacements: `puppeteer-mcp-claude` and `puppeteer-mcp-server`
4. Researched tools/capabilities of each package
5. Also identified `@playwright/mcp` as the officially recommended alternative
6. Produced structured research report with all four options compared

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | CREATED | Initial session log |

### Improvements delivered
- Clear comparison of 4 Puppeteer/browser MCP options with exact install commands and config blocks
- Identified that the original Anthropic package is deprecated — saved team from using dead package

### Bugs I encountered
None.

### Decisions I made
- Recommended `puppeteer-mcp-claude` as primary Puppeteer option (most recent, Claude Code-focused, auto-installer)
- Noted `@playwright/mcp` as better long-term alternative if not locked to Puppeteer

### What I learned
- `@modelcontextprotocol/server-puppeteer` was deprecated sometime in 2025; Anthropic did not publish a replacement under a new name
- `puppeteer-mcp-claude` by jaenster is the most Claude Code-optimized community replacement (v0.1.10, Jan 2026)
- MCP config for Claude Code goes in `.claude.json` or `~/.claude/claude_desktop_config.json`, NOT in `settings.json`
- The `claude mcp add` CLI command is the simplest way to register MCP servers

### State I'm leaving behind
Research report delivered. No code changes.

### Handoff
None — research task fully self-contained.
---
