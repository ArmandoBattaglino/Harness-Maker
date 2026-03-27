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

---
## 2026-03-27 — Quick Orientation Scan: V3 Swarm Orchestrator
**Status:** COMPLETED
**Called by:** user (orientation scan for /create pipeline, Stage 1)

### Context when I started
Stage 0 completed by tech-lead and creative-director. User requested a quick research snapshot covering: dominant canvas tech stacks in competitor products, competitor one-liners, top 3 pitfalls for visual multi-agent systems, @xyflow/react v12-specific notes, and the single most important architecture insight.

### What I did
1. Read project memory (PROJECT.md, ACTIVITY_LOG.md, researcher.md)
2. Ran 4 parallel web searches: stack comparison, @xyflow/react v12 specifics, multi-agent canvas pitfalls, React Flow performance limits
3. Ran 2 follow-up searches: Dify tech stack and v12 immutability/measured dimensions detail
4. Synthesized into a Quick Research Snapshot

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended activity entry |

### Improvements delivered
- Confirmed all four major competitors (LangFlow, Flowise, n8n, Dify) use React Flow as their canvas layer — validates the team's chosen approach
- Identified the v12 package rename (reactflow → @xyflow/react) and immutable-node-update requirement as hard breaking changes
- Identified ~500 nodes as the practical unoptimized performance ceiling; beyond that, custom nodes + memoization are mandatory
- Named state serialization/persistence as the single most critical architecture decision

### Bugs I encountered
None — research only.

### Decisions I made
- React Flow (@xyflow/react v12) is confirmed as the correct canvas choice based on industry adoption
- Performance ceiling is ~500 nodes before optimization work is needed

### What I learned
- ALL four main competitors (LangFlow, Flowise, n8n, Dify) use React Flow for their canvas — it is the de facto standard
- @xyflow/react v12 renamed from `reactflow`; node dimensions now live in `node.measured.width/height` not top-level
- v12 no longer supports object mutation for node updates — always create a new node object
- Practical performance ceiling without optimization: ~500 custom nodes. With memoization + virtualization: 1000+
- The biggest pitfall in multi-agent canvas systems is conflating visual state (canvas layout) with execution state (agent runtime) — they must be separate stores
- Circuit breaker and HITL inbox patterns require a dedicated execution state machine, not ad-hoc per-node state

### State I'm leaving behind
Research snapshot delivered. No code changes. Key finding: React Flow is the right call, v12 breaking changes are manageable but must be addressed upfront in architecture.

### Handoff
Architect should read the Key Architecture Insight section of the snapshot before designing the execution state model. Specifically: canvas state (positions, edges) and execution state (agent status, output, errors) must be in separate stores that stay in sync via a sync layer.
---
