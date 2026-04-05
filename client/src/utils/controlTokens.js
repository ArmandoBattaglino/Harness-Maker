import { stripAnsi } from './stripAnsi';

const EXACT_DONE_RE = /(^|\n)__DONE__(?=\n|$)/m;
const EXACT_HANDOFF_RE = /__HANDOFF__:[a-z][a-z0-9-]*:/i;
const ALIAS_DONE_LINE_RE = /(^|\n)DONE(?=\n|$)/m;
const ALIAS_DONE_TOKEN_RE = /DONE_TOKEN=DONE\b/i;
const ALIAS_HANDOFF_RE = /(^|\n)HANDOFF:[a-z][a-z0-9-]*:/im;

export function inspectControlTokens(text) {
  const cleaned = stripAnsi(String(text ?? ''));

  const hasExactDone = EXACT_DONE_RE.test(cleaned);
  const hasExactHandoff = EXACT_HANDOFF_RE.test(cleaned);
  const hasAliasDone = !hasExactDone && (ALIAS_DONE_LINE_RE.test(cleaned) || ALIAS_DONE_TOKEN_RE.test(cleaned));
  const hasAliasHandoff = !hasExactHandoff && ALIAS_HANDOFF_RE.test(cleaned);

  const notes = [];

  if (hasExactDone || hasExactHandoff) {
    const exactTokens = [];
    if (hasExactDone) exactTokens.push('__DONE__');
    if (hasExactHandoff) exactTokens.push('__HANDOFF__');
    notes.push(`Exact control token${exactTokens.length > 1 ? 's' : ''} visible: ${exactTokens.join(', ')}`);
  }

  if (hasAliasDone) {
    notes.push('Alias-like done text is visible; the literal workflow token is __DONE__.');
  }

  if (hasAliasHandoff) {
    notes.push('Alias-like handoff text is visible; the literal workflow token is __HANDOFF__:<targetId>:{...}.');
  }

  return {
    hasExactDone,
    hasExactHandoff,
    hasAliasDone,
    hasAliasHandoff,
    notes,
  };
}
