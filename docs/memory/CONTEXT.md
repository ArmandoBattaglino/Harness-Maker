# Current Context
**Session date:** 2026-03-26
**Focus:** Phase 9 — Complete Frontend Redesign from Stitch Design Exports

_Project initialized via /create pipeline on 2026-03-18_

## Active Threads
- Tasks #1–#22 are ALL COMPLETED as of 2026-03-24. v1.2 is RELEASE READY.
- Phase 9 (Frontend Redesign) has been planned: 9 new tasks (#23-#31) added to TASK_PLAN.md.
- Stitch design exports are located at: C:\Users\arman\Downloads\Test workflows\stitch\stitch\
  - 5 screens: Terminal Hub, Orchestration Center, Project Dashboard, Context Editor, Deployment Manager
  - Each screen has code.html (full Tailwind markup) and screen.png (visual reference)
- The redesign completely replaces the frontend UI while keeping ALL backend API integration intact.

## Open Questions
- None blocking. All design references are in the Stitch exports. Backend is stable.

## Critical Constraints (Phase 9)
**All v1 backend constraints (DEC-001 through DEC-010) remain in effect — DO NOT modify server code.**
**Phase 9 is FRONTEND-ONLY. No server/, no routes/, no services/ changes.**

Key rules for Phase 9 frontend-dev agents:

### Design System
- Primary color: #933df5 (purple) — replaces the old #4ade80 (green) accent
- Background: #000000 (pure black) — replaces old #111111
- Fonts: Inter (primary), Geist (terminal hub), JetBrains Mono (code/terminal)
- Icons: Material Symbols Outlined (Google Fonts) — NOT Material Icons, NOT custom SVGs
- All 5 screens share a consistent design language; extract commonalities into tailwind.config.js

### Terminal (xterm.js) — DO NOT BREAK
- Terminal.jsx (client/src/components/Terminal.jsx) must NOT be modified
- useSession.js (client/src/hooks/useSession.js) must NOT be modified
- The xterm container must be flex-1 overflow-hidden with NO padding/max-width
- FitAddon, ResizeObserver, and WebSocket reconnect must continue to work
- One xterm.js Terminal instance per session — never reuse (DEC-009)

### API Integration — PRESERVE ALL
- useApi.js (client/src/hooks/useApi.js) must NOT be modified
- useJob.js (client/src/hooks/useJob.js) must NOT be modified
- All API endpoints remain the same: /api/v1/projects, /api/v1/sessions, /api/v1/jobs, /api/v1/agents, /api/v1/skills, /api/v1/claudemd
- CSRF header X-Requested-With: ClaudeCodeManager is already handled by useApi.js
- AppContext.jsx state management pattern is preserved but new view types added

### Navigation Changes
- OLD: 4 views (terminal, jobs, entities, projects)
- NEW: 5 views (projects, terminal, jobs, context, deployments)
- 'entities' view is REMOVED — split into 'context' (CLAUDE.md editor) and 'deployments' (agents/skills)
- Default landing view changes from 'terminal' to 'projects' (dashboard)

## Notes for Specific Agents

### For frontend-dev (Phase 9 primary agent):
- Start with TASK #23 (design system foundation) — all other tasks depend on it
- Read ALL 5 Stitch code.html files for markup reference and screen.png for visual reference
- The Stitch HTML uses CDN Tailwind — convert to proper Tailwind classes in the React components
- Material Symbols icons: use <span className="material-symbols-outlined">icon_name</span>
- For filled icons: add style={{ fontVariationSettings: "'FILL' 1" }}
- Terminal.jsx and useSession.js are OFF LIMITS — only change the container/wrapper components
- useApi.js and useJob.js are OFF LIMITS — only change the UI components that consume them

### For qa-tester (TASK #31):
- Compare each view against its Stitch screen.png screenshot
- Run full functional regression: project CRUD, PTY terminal, job execution, entity CRUD, CLAUDE.md editing
- All 110 existing tests must still pass (npm test)
- Check for console errors on every view transition
