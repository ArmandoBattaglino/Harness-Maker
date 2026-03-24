# Claude Code Visual Manager — Project Config

> Full project instructions are in the root `CLAUDE.md` of this repository.
> Global agent team workflow, memory protocol, and parallelism rules are in `~/.claude/CLAUDE.md`.

## Project-Specific Overrides

### Binary & Port
- Server: `http://127.0.0.1:3000` (default PORT=3000)
- Claude binary: auto-detected via BinaryDiscovery (PATH → %LOCALAPPDATA%\AnthropicClaude\claude.exe)

### Critical Constraints for All Agents
- NEVER use `shell: true` in any spawn call — SEC-02, enforced project-wide
- NEVER use `fs.writeFile` directly for config/agents/skills/CLAUDE.md — use `write-file-atomic`
- ALWAYS validate file paths with `path.resolve()` + prefix assert before any write
- PTY `onData` handler must NEVER be removed — DEC-009 (ConPTY deadlock prevention on Windows)
- `child.stdin.end()` must be called immediately after every job spawn — DEC-005 (GitHub #7497)

### Memory Location
All project memory is in `docs/memory/` — read before starting any task.
