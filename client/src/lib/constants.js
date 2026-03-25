/**
 * Shared UI constants for Claude Code Visual Manager
 * Design system tokens extracted from Stitch design exports (Phase 9)
 */

/**
 * Main sidebar navigation items.
 * icon  — Material Symbols Outlined icon name
 * label — Display text
 * view  — AppContext view identifier
 */
export const NAV_ITEMS = [
  { icon: 'dashboard',   label: 'Projects',        view: 'projects' },
  { icon: 'terminal',    label: 'Live Terminal',    view: 'terminal' },
  { icon: 'play_arrow',  label: 'Job Runner',       view: 'jobs' },
  { icon: 'memory',      label: 'Deployments',      view: 'deployments' },
  { icon: 'description', label: 'Context Editor',   view: 'context' },
];

/**
 * Status-to-Tailwind-class mapping for badges and indicators.
 * Each key maps to { bg, text, dot } class strings.
 */
export const STATUS_COLORS = {
  running:   { bg: 'bg-success/10',  text: 'text-success',    dot: 'bg-success' },
  active:    { bg: 'bg-primary/10',  text: 'text-primary',    dot: 'bg-primary' },
  idle:      { bg: 'bg-surface',     text: 'text-text-muted', dot: 'bg-border-hover' },
  done:      { bg: 'bg-success/10',  text: 'text-success',    dot: 'bg-success' },
  completed: { bg: 'bg-success/10',  text: 'text-success',    dot: 'bg-success' },
  cancelled: { bg: 'bg-surface',     text: 'text-text-muted', dot: 'bg-text-muted' },
  error:     { bg: 'bg-error/10',    text: 'text-error',      dot: 'bg-error' },
  failed:    { bg: 'bg-error/10',    text: 'text-error',      dot: 'bg-error' },
  pending:   { bg: 'bg-warning/10',  text: 'text-warning',    dot: 'bg-warning' },
  queued:    { bg: 'bg-warning/10',  text: 'text-warning',    dot: 'bg-warning' },
};
