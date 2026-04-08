// server/services/SwarmEngine.js
// V3 Swarm Orchestrator — orchestration engine for multi-agent workflows.
// Manages workflow executions: spawns agent PTYs, routes handoffs, tracks budget.
// See DEC-014 for the swarmListeners tap design.

import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import HandoffParser from './HandoffParser.js';
import StreamJsonParser from './StreamJsonParser.js';
import { discoverCodexBinary, discoverGeminiBinary } from './BinaryDiscovery.js';
import { ChatExtractor } from './ChatExtractor.js';
import { buildWorkflowArtifact } from './WorkflowArtifactBuilder.js';

// tree-kill is CommonJS only — use createRequire to import it (DEC-006)
const requireCjs = createRequire(import.meta.url);
const treeKill = requireCjs('tree-kill');

const SWARM_PROMPT_ECHO_MARKER = '--- END SWARM INPUT ---';
const SWARM_PROMPT_SUBMIT_DELAY_MS = 100;
const SWARM_GEMINI_SUBMIT_DELAY_MS = 800;
const SWARM_GEMINI_ECHO_DELAY_MS = 400;
const SWARM_PROMPT_READY_FALLBACK_MS = 20000;
const SWARM_PROMPT_LINE_INTERVAL_MS = 25;
const SWARM_PROMPT_INTERRUPT_DELAY_MS = 120;
const SWARM_RUNTIME_MENU_SUBMIT_DELAY_MS = 75;
const SWARM_ECHO_MARKER_TIMEOUT_MS = 7000;
const MAX_DONE_REINJECT_ATTEMPTS = 3;
const STREAM_JSON_POST_RESULT_TIMEOUT_MS = 30000;
const SWARM_CODEX_MISSING_HANDOFF_IDLE_MS = 180000;
const SWARM_MISSING_HANDOFF_REMINDER_DELAY_MS = 3000;
const RUNTIME_SCAN_BUFFER_CHARS = 4000;
const SNIPPET_SCAN_BUFFER_CHARS = 120000;
const COMPACT_CODEX_AGENT_PROMPT_CHARS = 480;
const COMPACT_CODEX_TASK_CHARS = 320;
const COMPACT_CODEX_PROGRESS_CHARS = 220;
const DEFAULT_SWARM_CLAUDE_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'LS'];
const DEFAULT_SWARM_CLAUDE_MODEL = 'opus';
const DEFAULT_SWARM_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_SWARM_GEMINI_MODEL = 'gemini-2.5-pro';
const RUNTIME_PROVIDER = {
  AUTO: 'auto',
  CLAUDE: 'claude',
  CODEX: 'codex',
  GEMINI: 'gemini',
};
// Curated runtime model registry.
// These are the only explicit provider models that Swarm will advertise,
// accept from the UI, or auto-select during recovery on this installation.
export const SUPPORTED_RUNTIME_MODELS = {
  [RUNTIME_PROVIDER.CLAUDE]: [
    'opus',
    'claude-opus-4-6',
    'sonnet',
    'claude-sonnet-4-6',
    'haiku',
    'claude-haiku-4-5-20251001',
  ],
  [RUNTIME_PROVIDER.CODEX]: ['gpt-5.4', 'gpt-5.1-codex', 'gpt-4.1-codex'],
  [RUNTIME_PROVIDER.GEMINI]: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};
const SUPPORTED_GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash'];
const normalizeCompressedChatWord = (word = '') => String(word ?? '')
  .normalize('NFD')
  .replace(/\p{M}+/gu, '')
  .toLowerCase();
const COMPRESSED_CHAT_WORDS = [
  'a', 'agent', 'agents', 'al', 'all', 'and', 'augurando', 'base', 'be', 'beautiful', 'bene', 'benvenuti',
  'agenti', 'auguro', 'benvenuto', 'best', 'bella', 'both', 'caloroso', 'carissimi', 'che', 'ciao', 'ciascuno', 'collected', 'completed',
  'completato', 'compito', 'con', 'conciso', 'condividono', 'contains', 'context', 'contesto',
  'consolidated',
  'connect', 'correttamente', 'day', 'del', 'di', 'different', 'dispatching', 'diversa', 'downstream',
  'due', 'e', 'english', 'entrambi', 'esprimendo', 'essere', 'everyone', 'execute', 'final', 'finale',
  'fantastic', 'filled', 'for', 'form', 'forma', 'friend', 'friendliness', 'funzionato', 'generate', 'generated', 'generato', 'giornata',
  'generare', 'generera', 'genererà',
  'gioia', 'gli', 'going', 'good', 'great', 'greater', 'greeted', 'greeting', 'greetings', 'ha', 'handoff', 'handing', 'hanno', 'has', 'have', 'having', 'hello', 'hope',
  'ho', 'i', 'il', 'in', 'inglese', 'is', 'it', 'italian', 'joy', 'kind', 'la', 'language', 'life', 'lingua',
  'lo', 'lunghezza', 'lavorano', 'lavoreranno', 'making', 'may', 'meet', 'meglio', 'merge', 'meravigliosa', 'meravigliosamente', 'messaggi', 'moments', 'most', 'nodo', 'node', 'nodes',
  'now', 'offer', 'output', 'parallelo', 'parallel', 'partecipanti', 'per', 'piacere', 'positivo',
  'appreciated', 'incontrarci', 'italiana', 'know', 'our', 'personal', 'piena', 'piacere', 'pleasure', 'poi', 'presente', 'procedo', 'producing', 'produrre', 'pur', 'questa', 'questo', 'qui',
  'raccolto', 'received', 'report', 'reporter', 'resoconto', 'riceveranno', 'runtime', 'saluti', 'saluto', 'serenita', 'share', 'shared', 'should',
  'riassumera', 'riassumerà', 'risultati', 'smile', 'so', 'sono', 'spero', 'splendida', 'stati', 'stesso', 'stiate', 'success',
  'smiles', 'splendidly', 'such', 'successfully', 'successi', 'successo', 'summary', 'suo', 'sulla', 'task', 'the', 'they', 'things', 'time', 'tono',
  'that', 'ti', 'to', 'today', 'together', 'triage', 'true', 'tutti', 'un', 'una', 'uniti', 'valued', 'vengono', 'verranno', 'vero', 'vibes', 'voi', 'warmth', 'welcome', 'will', 'with',
  'wonderful', 'word', 'workflow', 'wishing', 'you', 'your', 'duplicate', 'da', 'here', 'ahead', 'absolutely', 'connection', 'conversations', 'even'
];
const EXTRA_COMPRESSED_CHAT_WORDS = [
  'altra', 'bello', 'bright', 'ci', 'connections', 'falling', 'finds', 'genera', 'incontriamo',
  'instradare', 'instead', 'laughter', 'message', 'mondo', 'one', 'piu', 'quando', 'reporter', 'requested',
  'request', 'richiesta', 'riassunti', 'spirits', 'summarize',
];
const ALL_COMPRESSED_CHAT_WORDS = [...COMPRESSED_CHAT_WORDS, ...EXTRA_COMPRESSED_CHAT_WORDS];
const COMPRESSED_CHAT_WORD_SET = new Set(ALL_COMPRESSED_CHAT_WORDS.map((word) => normalizeCompressedChatWord(word)));
const COMPRESSED_CHAT_MAX_WORD_LEN = ALL_COMPRESSED_CHAT_WORDS.reduce((max, word) => Math.max(max, word.length), 0);
const RESTORABLE_CHAT_TOKEN_RE = /^(?:[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF]{6,}|[a-z\u00DF-\u00F6\u00F8-\u00FF]{7,})$/u;
const RESTORABLE_CHAT_TOKEN_MATCH_RE = /(?:[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF]{6,}|[a-z\u00DF-\u00F6\u00F8-\u00FF]{7,})/gu;
const SNIPPET_NOISE_LINE_PATTERNS = [
  /^---\s*swarm protocol/i,
  /^---\s*end protocol/i,
  /^---\s*end swarm input\s*---$/i,
  /^-+\s*end swarm input\s*-+$/i,
  /end\s*swarm\s*input/i,
  /^do not output the handoff or done token/i,
  /^do not stop at (?:__done__|the done marker)/i,
  /^your very last line must be a valid handoff token/i,
  /^use [a-z0-9-]+ in place of <targetid>/i,
  /^use only flat json/i,
  /^output that final handoff token/i,
  /^replace the summary value/i,
  /^finish your work, then hand off to /i,
  /^messages to be submitted after next tool call/i,
  /^run \/review\b/i,
  /^use \/skills\b/i,
  /^find and fix a bug in @/i,
  /^write tests for @/i,
  /^[•·]\s*working\b/i,
  /^working\b/i,
  /^›\s+/i,
  /^\[pasted content\b/i,
  /^conversation interrupted\b/i,
  /^went wrong\? hit `\/feedback`/i,
  /^type your message(?: or @path\/to\/file)?/i,
  /^\? for shortcuts/i,
  /^apply this change\?/i,
  /^allow once$/i,
  /^esc to interrupt/i,
  /^press esc or ctrl\+c to cancel/i,
  /^waiting for authentication/i,
  /^usage limit reached/i,
  /^you have exhausted your capacity on this model/i,
  /^keep trying$/i,
  /^ready \(/i,
  /^(gpt|claude|gemini)-[a-z0-9.\-]+.*[·•]/i,
  /^tokens?( used)?[:\s]/i,
  /^context window[:\s]/i,
  /^we're making changes to gemini cli/i,
  /^what's changing:/i,
  /^how it affects you:/i,
  /^read more: https:\/\/goo\.gle\//i,
  /^plan: gemini code assist/i,
  /^\/upgrade$/i,
  /^access resets at /i,
  /^\/stats model for usage details$/i,
  /^\/model to switch models\.?$/i,
  /^\/auth to switch to api key\.?$/i,
  /^this request failed/i,
  /^\[?api error:/i,
  /^request cancelled\.?$/i,
  /^╭─+╮$/,
  /^╰─+╯$/,
  /^│/,
  /bypass\s*permissions\s*on\b/i,
  /bypasspermissionson/i,
  /ctrl\+g to edit in\b/i,
  /esc to interrupt/i,
  /^✢\s*herding/i,
  /^herding…$/i,
  /^herd$/i,
  /^claude code v\d/i,
  /^opus \d\.\d/i,
  /^sonnet \d\.\d/i,
  /^haiku \d\.\d/i,
  /^\w+ \d+\.\d+ with \w+ effort/i,
  /^~[\\/]/,
  /^~[A-Z]/i,
  /^found \d+ settings? issues?/i,
  /^\/doctor for details?/i,
  /^.\w+…/,
  /^\w+…$/,
  /\w+…\s*$/,
  /thinking with \w+ effort/i,
  /thought for \d+s/i,
  /stop says:/i,
  /MEMORIA NON SCRITTA/i,
  /ACTIVITY_LOG\.md/i,
  /session log prima di chiudere/i,
  /nessun agente ha aggiornato/i,
  /stop hook/i,
  /verifica che ogni agente/i,
  /claude code visual manager/i,
  /posso aiutarti a implementarlo/i,
  /can I help you implement/i,
  /how can i help you/i,
  /what would you like/i,
  /^tip:\s*/i,
  /codex app/i,
  /app-landing-page=true/i,
  /^you are a\b/i,
  /^(?:a\s+)?\w+\s+(?:lists?|finds?|writes?|creates?|researche?s?|summarize?s?|analyze?s?)\b.*hands?\s*off\b/i,
  /^you have an active task right now/i,
  /^current task:/i,
  /^workflow goal:/i,
  /^your output will be handed off/i,
  /^when your work is complete, emit one valid handoff token/i,
  /^the runtime will fan out that handoff/i,
  /in parallel for greeting genera\s*ti\s*on/i,
  /target id:\s*node-[a-z0-9-]+/i,
  /^last line only:?$/i,
  /^no extra text after that last handoff line\.?$/i,
  /^the last line:?\s/i,
  /^the final handoff tok/i,
  /^concrete example\b/i,
  /^for this workflow,?\s/i,
  /^valid target ids?:/i,
  /^context update:/i,
  /^__handoff__:<targetid>/i,
  /^when you are done with your part/i,
  /^execute the workflow goal/i,
  /^research the .+ project/i,
  /^write a .+ summary/i,
  /^you are the .+ in this workflow/i,
  /^your role is/i,
  /^you receive\b/i,
  /^your task is/i,
  /^---\s*system prompt/i,
  /^--- swarm input ---$/i,
  /^--- end swarm input ---$/i,
  /con\s*t\s*in\s*u\s*e\s*this\s*task/i,
  /is\s*not\s*the\s*end\s*of\s*the\s*workflow/i,
  /downstream\s*agents?\s*still\s*need/i,
  /then\s*hands?\s*off\s*to\s*(?:a|the|an)\s+\w+/i,
  /hands?\s*off\s*to\s*a\s*\w+\s*who/i,
  /emit\s*(?:one\s*)?(?:valid\s*)?handoff\s*token/i,
  /that\s*final\s*handoff\s*token/i,
  /replace\s*the\s*summary\s*value/i,
  /keep\s*the\s*handoff\s*line\s*compact/i,
  /flat\s*json\s*with\s*primitive\s*values/i,
  /^\(thinking\)(\(thinking\))*$/i,
  /api.?key/i,
  /enter your.*key/i,
  /authentication required/i,
  /sign.?in|log.?in/i,
  /codex auth/i,
  /openai api/i,
  /unauthorized[:\s]/i,
  /invalid.*token/i,
];
const SNIPPET_STALE_FOREIGN_LINE_PATTERNS = [
  /^explain this codebase$/i,
  /\bprint_handoff\.py\b/i,
  /\bserver\.pid\b/i,
];
const SNIPPET_RECOVERY_LINE_PATTERNS = [
  /^after completing your work, you must output the done marker on its own line:?$/i,
  /^this is mandatory\. the workflow cannot complete without this exact token\.?$/i,
  /^output __done__ as the very last line of your response, after all your content\.?$/i,
  /^reason: agent emitted __done__/i,
];
const SNIPPET_PROGRESS_LINE_PATTERNS = [
  /^worked for \d+[smhd]/i,
  /^preparing\b/i,
  /^summarizing\b/i,
];
const SNIPPET_PROMPT_LINE_PATTERNS = [
  /^inspect local .* only\./i,
  /^verify .* then hand off/i,
  /^print exactly .*expected report/i,
  /^with no extra prose, then output __done__/i,
  /^codex runtime is active for this swarm agent\./i,
  /^gemini runtime is active for this swarm agent\./i,
  /^claude runtime is active for this swarm agent\./i,
  /^continue the workflow using the shared task context below\./i,
  /^fallback reason:/i,
  /^you are the /i,
  /^current workflow context:?/i,
  /^(?:workflow name|workflow description|currenttask|task|instruction|workflow|merge_with|triage_note|agent(?:_[ab])?|language|greeting|status|translation|agent_[ab]_(?:language|greeting|translation)|merge_status)\s*:/i,
];
const SNIPPET_COMMAND_LINE_PATTERNS = [
  /^ran\s+/i,
  /^commandtype\s+name\s+version/i,
  /^impossibile eseguire il programma/i,
  /^fullyqualifiederrorid\s*:/i,
  /^nativecommandfailed$/i,
  /^[+~]\s/i,
];
const RUNTIME_BLOCKER_PATTERNS = [
  {
    type: 'rate_limited',
    provider: 'claude',
    matches: (text) =>
      text.includes("/rate-limit-options")
      || text.includes("you've hit your limit")
      || text.includes('you have hit your limit')
      || text.includes('usage limit reached'),
    message: 'Claude hit its usage limit before the swarm agent could continue.',
  },
  {
    type: 'provider_unavailable',
    provider: 'codex',
    matches: (text) =>
      text.includes('error: unexpected argument')
      && text.includes('usage: codex'),
    message: 'Codex rejected the configured Swarm launch arguments and could not start an interactive session.',
  },
  {
    type: 'provider_unavailable',
    provider: 'codex',
    matches: (text) =>
      text.includes('unsupported value')
      && text.includes('reasoning.effort'),
    message: 'Codex rejected the current model and reasoning-effort combination before the swarm task could run.',
  },
  {
    type: 'trust_required',
    provider: 'codex',
    matches: (text) =>
      text.includes('do you trust the contents of this directory')
      || text.includes('trust this folder')
      || text.includes('trust this directory'),
    message: 'Codex requires workspace trust before the swarm agent can continue.',
  },
  {
    type: 'rate_limited',
    provider: 'codex',
    matches: (text) =>
      text.includes("you've hit your usage limit")
      || text.includes('purchase more credits')
      || text.includes('try again at'),
    message: 'Codex hit its usage or credit limit before the swarm agent could continue.',
  },
  {
    type: 'prompt_rejected',
    provider: 'codex',
    matches: (text) =>
      text.includes('conversation interrupted - tell the model what to do differently')
      || text.includes('something went wrong? hit `/feedback` to report the issue'),
    message: 'Codex rejected the injected swarm steering prompt and could not continue the workflow in interactive mode.',
  },
  {
    type: 'rate_limited',
    provider: 'gemini',
    matches: (text) =>
      text.includes('resource exhausted')
      || text.includes('you have exhausted your capacity on this model')
      || text.includes('usage limit reached for all pro models')
      || text.includes('access resets at')
      || (text.includes('rate limit') && !text.includes('approaching rate limit') && !text.includes('approaching rate limits'))
      || text.includes('quota exceeded')
      || (text.includes('429') && (text.includes('resource exhausted') || text.includes('quota') || text.includes('too many requests'))),
    message: 'Gemini hit its usage or rate limit before the swarm agent could continue.',
  },
  {
    type: 'provider_unavailable',
    provider: 'gemini',
    matches: (text) =>
      text.includes('waiting for authentication')
      || text.includes('not authenticated')
      || text.includes('please sign in')
      || text.includes('login required')
      || text.includes('gemini_api_key')
      || text.includes('authentication failed')
      || (text.includes('api key') && !text.includes('usage limit') && !text.includes('/auth to switch')),
    message: 'Gemini requires authentication or an API key before the swarm agent can continue.',
  },
];
const RUNTIME_PROVIDER_PROFILES = {
  [RUNTIME_PROVIDER.CLAUDE]: {
    buildArgs: () => {
      const args = [];
      const configuredModel = String(process.env.SWARM_CLAUDE_MODEL ?? '').trim();
      const runtimeModel = getDefaultRuntimeModel(RUNTIME_PROVIDER.CLAUDE, configuredModel);

      if (runtimeModel) {
        args.push('--model', runtimeModel);
      }

      return args;
    },
  },
  [RUNTIME_PROVIDER.CODEX]: {
    buildArgs: () => {
      const args = ['--no-alt-screen', '-a', 'never', '-s', 'workspace-write'];
      const configuredModel = String(process.env.SWARM_CODEX_MODEL ?? '').trim();
      const runtimeModel = getDefaultRuntimeModel(RUNTIME_PROVIDER.CODEX, configuredModel);

      if (runtimeModel) {
        args.push('-m', runtimeModel);
      }

      if (process.env.SWARM_CODEX_SKIP_GIT_REPO_CHECK === '1') {
        args.push('--skip-git-repo-check');
      }

      return args;
    },
  },
  [RUNTIME_PROVIDER.GEMINI]: {
    buildArgs: () => {
      const args = [];
      const configuredModel = String(process.env.SWARM_GEMINI_MODEL ?? '').trim();
      const runtimeModel = getDefaultRuntimeModel(RUNTIME_PROVIDER.GEMINI, configuredModel);

      if (runtimeModel) {
        args.push('-m', runtimeModel);
      }

      return args;
    },
  },
};

function normalizeRuntimeProvider(provider) {
  const value = String(provider ?? '').trim().toLowerCase();
  if (value === RUNTIME_PROVIDER.CLAUDE || value === RUNTIME_PROVIDER.CODEX || value === RUNTIME_PROVIDER.GEMINI || value === RUNTIME_PROVIDER.AUTO) {
    return value;
  }
  return RUNTIME_PROVIDER.AUTO;
}

export function getSupportedRuntimeModels(provider) {
  const normalized = normalizeRuntimeProvider(provider);
  return [...(SUPPORTED_RUNTIME_MODELS[normalized] ?? [])];
}

export function getDefaultRuntimeModel(provider, preferredModel = null) {
  const normalizedProvider = normalizeRuntimeProvider(provider);
  if (normalizedProvider === RUNTIME_PROVIDER.AUTO) {
    return null;
  }

  const normalizedPreferred = String(preferredModel ?? '').trim();
  if (normalizedPreferred && isSupportedRuntimeModel(normalizedProvider, normalizedPreferred)) {
    return normalizedPreferred;
  }

  const supportedModels = getSupportedRuntimeModels(normalizedProvider);
  if (supportedModels.length === 0) return null;

  if (normalizedProvider === RUNTIME_PROVIDER.CLAUDE) {
    return supportedModels.includes(DEFAULT_SWARM_CLAUDE_MODEL)
      ? DEFAULT_SWARM_CLAUDE_MODEL
      : supportedModels[0];
  }

  if (normalizedProvider === RUNTIME_PROVIDER.CODEX) {
    return supportedModels.includes(DEFAULT_SWARM_CODEX_MODEL)
      ? DEFAULT_SWARM_CODEX_MODEL
      : supportedModels[0];
  }

  if (normalizedProvider === RUNTIME_PROVIDER.GEMINI) {
    return supportedModels.includes(DEFAULT_SWARM_GEMINI_MODEL)
      ? DEFAULT_SWARM_GEMINI_MODEL
      : supportedModels[0];
  }

  return supportedModels[0];
}

export function getRuntimeCapabilitySnapshot(sessionManager = null) {
  const providers = {
    claude: getSupportedRuntimeModels(RUNTIME_PROVIDER.CLAUDE),
    codex: getSupportedRuntimeModels(RUNTIME_PROVIDER.CODEX),
    gemini: getSupportedRuntimeModels(RUNTIME_PROVIDER.GEMINI),
  };

  const availability = {
    claude: Boolean(sessionManager?.claudeBin),
    codex: Boolean(sessionManager?.codexBin),
    gemini: Boolean(sessionManager?.geminiBin),
  };

  return {
    providers,
    availability,
    defaults: {
      claude: availability.claude ? getDefaultRuntimeModel(RUNTIME_PROVIDER.CLAUDE, process.env.SWARM_CLAUDE_MODEL) : null,
      codex: availability.codex ? getDefaultRuntimeModel(RUNTIME_PROVIDER.CODEX, process.env.SWARM_CODEX_MODEL) : null,
      gemini: availability.gemini ? getDefaultRuntimeModel(RUNTIME_PROVIDER.GEMINI, process.env.SWARM_GEMINI_MODEL) : null,
    },
  };
}

export function isSupportedRuntimeModel(provider, model) {
  const normalizedProvider = normalizeRuntimeProvider(provider);
  const normalizedModel = String(model ?? '').trim();
  if (!normalizedModel) return true;
  if (normalizedProvider === RUNTIME_PROVIDER.AUTO) {
    return false;
  }
  return getSupportedRuntimeModels(normalizedProvider).includes(normalizedModel);
}

export function validateRuntimeModels(runtimeModels = null) {
  if (!runtimeModels || typeof runtimeModels !== 'object') return null;

  for (const [provider, model] of Object.entries(runtimeModels)) {
    const normalizedProvider = normalizeRuntimeProvider(provider);
    const normalizedModel = String(model ?? '').trim();
    if (!normalizedModel) continue;
    if (!isSupportedRuntimeModel(normalizedProvider, normalizedModel)) {
      const supported = getSupportedRuntimeModels(normalizedProvider);
      const providerLabel = normalizedProvider || provider;
      const message = supported.length > 0
        ? `Unsupported ${providerLabel} model '${normalizedModel}'. Supported models: ${supported.join(', ')}`
        : `Unsupported ${providerLabel} model '${normalizedModel}'.`;
      const error = new Error(message);
      error.statusCode = 400;
      error.code = 'UNSUPPORTED_RUNTIME_MODEL';
      error.provider = normalizedProvider;
      error.model = normalizedModel;
      throw error;
    }
  }

  return runtimeModels;
}

function getGeminiNoProgressTimeoutMs() {
  return Number(process.env.SWARM_GEMINI_NO_PROGRESS_TIMEOUT_MS ?? 45000);
}

function getGeminiNoProgressTokenDelta() {
  return Number(process.env.SWARM_GEMINI_NO_PROGRESS_TOKEN_DELTA ?? 6000);
}

function getGeminiNoProgressHardTimeoutMs() {
  const configured = Number(process.env.SWARM_GEMINI_NO_PROGRESS_HARD_TIMEOUT_MS ?? 0);
  if (configured > 0) return configured;
  const softTimeout = getGeminiNoProgressTimeoutMs();
  return Math.max(softTimeout + 15000, Math.ceil(softTimeout * 1.5));
}

// ---------------------------------------------------------------------------
// Flow-control node types — these never spawn a PTY
// ---------------------------------------------------------------------------
const FLOW_CONTROL_NODE_TYPES = new Set([
  'conditional',
  'merge',
  'delay',
  'loop',
  'errorHandler',
  'subWorkflow',
]);

/**
 * Evaluate a simple condition string against a context object.
 * Supported syntax:
 *   key == "value"   — equality
 *   key != "value"   — inequality
 *   key contains "text" — string includes
 *   key exists        — key is present and not null/undefined
 *
 * Returns true if the condition matches, false otherwise.
 * Invalid/unparseable conditions return false (safe default).
 */
function evaluateCondition(condition, context) {
  if (!condition || typeof condition !== 'string') return false;
  const trimmed = condition.trim();

  // key exists
  const existsMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s+exists$/);
  if (existsMatch) {
    const key = existsMatch[1];
    const val = context?.[key];
    return val !== undefined && val !== null;
  }

  // key contains "text"
  const containsMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s+contains\s+"([^"]*)"$/);
  if (containsMatch) {
    const key = containsMatch[1];
    const searchText = containsMatch[2];
    const val = context?.[key];
    if (val === undefined || val === null) return false;
    return String(val).includes(searchText);
  }

  // key == "value"
  const eqMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s*==\s*"([^"]*)"$/);
  if (eqMatch) {
    const key = eqMatch[1];
    const expected = eqMatch[2];
    return String(context?.[key] ?? '') === expected;
  }

  // key != "value"
  const neqMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s*!=\s*"([^"]*)"$/);
  if (neqMatch) {
    const key = neqMatch[1];
    const expected = neqMatch[2];
    return String(context?.[key] ?? '') !== expected;
  }

  return false;
}

// ---------------------------------------------------------------------------
// WorkflowExecution shape (in-memory only, never persisted):
// {
//   executionId: string,
//   workflowId: string,
//   workflowDef: WorkflowDefinition,
//   status: 'running' | 'paused' | 'stopping' | 'stopped' | 'failed' | 'completed',
//   agentStates: Map<nodeId, { sessionId, status, handoffCount, lastOutputSnippet }>,
//   edgeCounters: Map<edgeId, number>,
//   workflowContext: {},
//   heartbeatTimer: NodeJS.Timer | null,
//   inboxItems: []
// }
// ---------------------------------------------------------------------------

class SwarmEngine {
  /**
   * @param {import('./SessionManager.js').SessionManager} sessionManager
   * @param {import('./WorkflowStore.js').WorkflowStore} workflowStore
   */
  constructor(sessionManager, workflowStore, circuitBreaker = null, budgetTracker = null) {
    this._sessionManager = sessionManager;
    this._workflowStore = workflowStore;
    this._circuitBreaker = circuitBreaker;
    this._budgetTracker = budgetTracker;
    this._executions = new Map();   // executionId -> WorkflowExecution
    this._wsBroadcast = null;       // function(executionId, event) — set by swarmHandler
    this._triggerManager = null;    // set by setTriggerManager() after TriggerManager is instantiated

    // Wave 5 — Advanced Flow Control state tracking
    this._mergeStates = new Map();  // `${executionId}:${nodeId}` -> { received: Set, required: number }
    this._loopStates = new Map();   // `${executionId}:${nodeId}` -> { iteration, maxIterations }
    this._delayTimers = new Map();  // `${executionId}:${nodeId}` -> timeout handle
    this._errorWatchers = new Map(); // executionId -> Map<watchedNodeId, Set<errorHandlerNodeId>>
    this._subWorkflowExecutions = new Map(); // `${executionId}:${nodeId}` -> child executionId

    this._chatExtractor = new ChatExtractor({
      onMessage: (msg) => this._broadcastChatMessage(msg),
      // NOTE: Do NOT pass _sanitizeChatMessage here — it is designed for
      // snippet display on agent cards and aggressively strips actual agent
      // content (BUG-V8-7 root cause). ChatExtractor's own NOISE_PATTERNS
      // and line-level filters are sufficient for chat/artifact output.
      periodicFlushMs: 8000,
    });

    this._executionHistoryStore = null; // set via setExecutionHistoryStore()
    this._persistedHistoryIds = new Set(); // guard against duplicate history writes
  }

  /**
   * Set the WebSocket broadcast function.
   * Called by swarmHandler.js after wiring up the WS channel.
   * @param {Function} fn - (executionId: string, event: object) => void
   */
  setWsBroadcast(fn) {
    this._wsBroadcast = fn;
  }

  /**
   * Set the TriggerManager instance.
   * Called by server/index.js immediately after TriggerManager is instantiated,
   * so stopExecution() can clean up RSS pollers and webhooks for the execution.
   * @param {import('./TriggerManager.js').default} tm
   */
  setTriggerManager(tm) {
    this._triggerManager = tm;
  }

  /**
   * Set the ExecutionHistoryStore instance for persisting terminal execution states.
   * Called by server/index.js after the store is instantiated.
   * @param {import('../stores/ExecutionHistoryStore.js').ExecutionHistoryStore} store
   */
  setExecutionHistoryStore(store) {
    this._executionHistoryStore = store;
  }

  _serializeAgentState(state = {}) {
    return {
      sessionId: state.sessionId ?? null,
      provider: state.provider ?? null,
      runtimeProvider: state.runtimeProvider ?? state.provider ?? null,
      status: state.status ?? 'idle',
      handoffCount: state.handoffCount ?? 0,
      lastOutputSnippet: state.lastOutputSnippet ?? '',
      lastModelFallback: state.lastModelFallback ?? null,
      ...(state.runtimeBlocker ? { runtimeBlocker: { ...state.runtimeBlocker } } : {}),
      // Stream-json specific fields (DEC-027)
      ...(state.spawnMode === 'stream-json' ? {
        spawnMode: 'stream-json',
        turnCount: state.turnCount ?? 0,
        totalCostUsd: state.totalCostUsd ?? 0,
        totalInputTokens: state.totalInputTokens ?? 0,
        totalOutputTokens: state.totalOutputTokens ?? 0,
      } : {}),
    };
  }

  _readAgentSessionReplay(state = null) {
    if (!state?.sessionId || typeof this._sessionManager?.getSession !== 'function') return '';
    const session = this._sessionManager.getSession(state.sessionId);
    const replayBuffer = session?.buffer?.toBuffer?.();
    if (!replayBuffer) return '';
    const replayText = Buffer.isBuffer(replayBuffer)
      ? replayBuffer.toString('utf8')
      : String(replayBuffer ?? '');
    return replayText.slice(-SNIPPET_SCAN_BUFFER_CHARS);
  }

  _readAgentSessionOutput(state = null) {
    if (!state?.sessionId) return '';

    if (typeof this._sessionManager?.getSanitizedSessionOutput === 'function') {
      return this._sessionManager.getSanitizedSessionOutput(state.sessionId) || '';
    }

    if (typeof this._sessionManager?.getSession !== 'function') return '';
    const session = this._sessionManager.getSession(state.sessionId);
    const replayBuffer = session?.buffer?.toBuffer?.();
    if (!replayBuffer) return '';
    return Buffer.isBuffer(replayBuffer)
      ? replayBuffer.toString('utf8')
      : String(replayBuffer ?? '');
  }

  _clearStreamJsonPostResultTimer(state = null) {
    if (!state?._streamJsonPostResultTimer) return;
    clearTimeout(state._streamJsonPostResultTimer);
    state._streamJsonPostResultTimer = null;
  }

  _killProcessTree(pid, nodeId, reason = 'stream-json') {
    if (!pid) return Promise.resolve();

    return new Promise((resolve) => {
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          console.warn(`[SwarmEngine] tree-kill ${reason} warning node=${nodeId}: ${err.message}`);
        }
        resolve();
      });
    });
  }

  _findStreamJsonSessionJsonl(sessionId) {
    if (!sessionId) return null;

    const searchRoots = [
      path.join(os.homedir(), '.claude', 'projects'),
      path.join(os.homedir(), '.claude', 'sessions'),
    ];

    for (const root of searchRoots) {
      if (!fs.existsSync(root)) continue;

      const stack = [root];
      while (stack.length > 0) {
        const currentDir = stack.pop();
        let entries = [];
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            stack.push(fullPath);
            continue;
          }
          if (entry.name === `${sessionId}.jsonl`) {
            return fullPath;
          }
        }
      }
    }

    return null;
  }

  _archiveAndDeleteStreamJsonSessionArtifacts(sessionId) {
    const jsonlPath = this._findStreamJsonSessionJsonl(sessionId);
    if (!jsonlPath) {
      return null;
    }

    let archivedJsonl = '';
    try {
      archivedJsonl = fs.readFileSync(jsonlPath, 'utf8');
    } catch (error) {
      console.warn(`[SwarmEngine] stream-json archive read warning session=${sessionId}: ${error.message}`);
    }

    try {
      fs.rmSync(jsonlPath, { force: true });
    } catch (error) {
      console.warn(`[SwarmEngine] stream-json JSONL delete warning session=${sessionId}: ${error.message}`);
    }

    const companionDir = path.join(path.dirname(jsonlPath), sessionId);
    if (fs.existsSync(companionDir)) {
      try {
        fs.rmSync(companionDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`[SwarmEngine] stream-json companion delete warning session=${sessionId}: ${error.message}`);
      }
    }

    return {
      sessionId,
      jsonlPath,
      archivedJsonl,
      archivedAt: new Date().toISOString(),
    };
  }

  async _forceStopStreamJsonAgent(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) return null;

    const state = execution.agentStates.get(nodeId);
    if (!state || state.spawnMode !== 'stream-json') return null;

    this._clearStreamJsonPostResultTimer(state);

    const child = state._streamJsonChild;
    state._streamJsonChild = null;

    state.doNotSpawnNextTurn = false;
    state._pendingStreamJsonStopMode = null;
    state._awaitingStreamJsonClose = false;
    state.currentToolUse = null;
    state.isThinking = false;
    state.needsRepair = true;
    state.status = 'stopped';

    if (child?.pid && !child.killed) {
      await this._killProcessTree(child.pid, nodeId, 'stream-json');
    }

    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
    return this.getStatus(executionId, execution);
  }

  async _resetStreamJsonAgent(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) return null;

    const state = execution.agentStates.get(nodeId);
    if (!state || state.spawnMode !== 'stream-json') return null;

    const previousSessionId = state.streamJsonSessionId ?? null;
    await this._forceStopStreamJsonAgent(executionId, nodeId);

    if (previousSessionId) {
      state._lastResetArchive = this._archiveAndDeleteStreamJsonSessionArtifacts(previousSessionId);
    }

    state.streamJsonSessionId = uuidv4();
    state.turnCount = 0;
    state.totalCostUsd = 0;
    state.totalInputTokens = 0;
    state.totalOutputTokens = 0;
    state.lastOutputSnippet = '';
    state.runtimeBlocker = null;
    state.currentToolUse = null;
    state.isThinking = false;
    state.needsRepair = false;
    state.doNotSpawnNextTurn = false;
    state._pendingStreamJsonStopMode = null;
    state._awaitingStreamJsonClose = false;
    state._streamJsonAccumulatedText = '';
    state.status = 'idle';

    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
    return this.getStatus(executionId, execution);
  }

  async stopStreamJsonAgent(executionId, nodeId, mode = 'graceful') {
    const execution = this._executions.get(executionId);
    if (!execution) return null;

    const state = execution.agentStates.get(nodeId);
    if (!state || state.spawnMode !== 'stream-json') return null;

    if (!['graceful', 'forced', 'reset'].includes(mode)) {
      throw new Error(`Unsupported stream-json stop mode '${mode}'`);
    }

    if (mode === 'graceful') {
      if (state.status !== 'running' || !state._streamJsonChild) {
        state.doNotSpawnNextTurn = false;
        state._pendingStreamJsonStopMode = null;
        state._awaitingStreamJsonClose = false;
        state.status = 'paused';
        this._broadcastAgentStatus(executionId, nodeId, state);
        this._syncExecutionStatusFromAgents(execution);
        return this.getStatus(executionId, execution);
      }

      state.doNotSpawnNextTurn = true;
      state._pendingStreamJsonStopMode = 'graceful';
      state._awaitingStreamJsonClose = false;
      this._broadcastAgentStatus(executionId, nodeId, state);
      this._syncExecutionStatusFromAgents(execution);
      return this.getStatus(executionId, execution);
    }

    if (mode === 'forced') {
      return this._forceStopStreamJsonAgent(executionId, nodeId);
    }

    return this._resetStreamJsonAgent(executionId, nodeId);
  }

  _looksLikeTruncatedLead(text = '') {
    const normalized = String(text ?? '').trim();
    if (!normalized) return false;
    if (/^[,.;:)\]}]/.test(normalized)) return true;
    if (/^[a-z\u00E0-\u00FF]{1,3}\b/u.test(normalized) && normalized.length > 80) return true;
    if (/^[a-z\u00E0-\u00FF][a-z\u00E0-\u00FF'’-]*[,.;:]/u.test(normalized) && normalized.length > 80) return true;
    return false;
  }

  _scoreFinalOutputCandidate(text = '') {
    const normalized = String(text ?? '').trim();
    if (!normalized) return Number.NEGATIVE_INFINITY;

    let score = this._chatTextQualityScore(normalized);
    score += Math.min(normalized.length, 1200) / 8;
    if (this._looksLikeTruncatedLead(normalized)) score -= 220;
    return score;
  }

  _resolveAgentFinalText(execution, nodeId, messages = [], state = null) {
    const messageText = messages
      .map((msg) => msg?.text || msg?.content || '')
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const sessionOutput = this._readAgentSessionOutput(state);
    const semanticSnippet = String(state?.lastOutputSnippet || '').trim()
      || this._buildSemanticSnippet(sessionOutput)
      || '';
    const executionContext = {
      executionId: execution?.executionId ?? execution?.id ?? null,
      nodeId,
    };

    const candidates = [
      semanticSnippet
        ? this._sanitizeChatMessage(semanticSnippet, {
            ...executionContext,
            rawText: semanticSnippet,
          })
        : '',
      semanticSnippet,
      sessionOutput
        ? this._sanitizeChatMessage(sessionOutput, {
            ...executionContext,
            rawText: sessionOutput,
          })
        : '',
      messageText
        ? this._sanitizeChatMessage(messageText, {
            ...executionContext,
            rawText: messageText,
          })
        : '',
      messageText,
    ]
      .map((text) => String(text ?? '').trim())
      .filter(Boolean);

    if (candidates.length === 0) return '';

    let bestText = candidates[0];
    let bestScore = this._scoreFinalOutputCandidate(bestText);
    for (const candidate of candidates.slice(1)) {
      const score = this._scoreFinalOutputCandidate(candidate);
      if (score > bestScore) {
        bestText = candidate;
        bestScore = score;
      }
    }

    return bestText;
  }

  _collectAgentOutputNodeIds(execution, groupedMessages = {}) {
    const nodeIds = new Set(Object.keys(groupedMessages));

    const agentStates = execution?.agentStates instanceof Map
      ? execution.agentStates
      : new Map(Object.entries(execution?.agentStates ?? {}));
    for (const [nodeId, state] of agentStates.entries()) {
      if (!nodeId) continue;
      if (state?.status && state.status !== 'idle') {
        nodeIds.add(nodeId);
      }
    }

    const workflowNodes = Array.isArray(execution?.workflowDef?.nodes)
      ? execution.workflowDef.nodes
      : [];
    for (const node of workflowNodes) {
      if (node?.type !== 'agent' || !node.id) continue;
      const state = agentStates.get(node.id);
      if ((groupedMessages[node.id]?.length ?? 0) > 0 || (state?.status && state.status !== 'idle')) {
        nodeIds.add(node.id);
      }
    }

    return nodeIds;
  }

  _buildAgentOutputs(execution) {
    const grouped = {};
    for (const msg of execution?.chatMessages ?? []) {
      if (msg?.role !== 'assistant' || !msg.nodeId) continue;
      if (!grouped[msg.nodeId]) grouped[msg.nodeId] = [];
      grouped[msg.nodeId].push(msg);
    }

    const agentStates = execution?.agentStates instanceof Map
      ? execution.agentStates
      : new Map(Object.entries(execution?.agentStates ?? {}));
    const workflowNodes = Array.isArray(execution?.workflowDef?.nodes)
      ? execution.workflowDef.nodes
      : [];
    const nodeIds = this._collectAgentOutputNodeIds(execution, grouped);
    const agentOutputs = {};

    for (const nodeId of nodeIds) {
      const messages = grouped[nodeId] ?? [];
      const state = agentStates.get(nodeId) ?? null;
      const nodeDef = workflowNodes.find((node) => node.id === nodeId) ?? null;
      const timestamps = messages
        .map((msg) => msg?.timestamp)
        .filter(Boolean)
        .sort();
      const finalText = this._resolveAgentFinalText(execution, nodeId, messages, state);

      if (!finalText && messages.length === 0 && !state) continue;

      agentOutputs[nodeId] = {
        label: nodeDef?.data?.label || nodeId,
        finalText,
        handoffPayloads: state?.handoffPayloads || [],
        status: state?.status || 'unknown',
        provider: state?.runtimeProvider || state?.provider || null,
        messageCount: messages.length,
        firstMessageAt: timestamps[0] ? new Date(timestamps[0]).toISOString() : null,
        lastMessageAt: timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
      };
    }

    return agentOutputs;
  }

  _refreshAgentSnippet(state = null, { preferSessionReplay = false } = {}) {
    if (!state) return '';

    const sessionReplay = preferSessionReplay ? this._readAgentSessionReplay(state) : '';
    const snippetSource = sessionReplay || state._snippetSourceBuffer || state._runtimeScanBuffer || '';
    if (!String(snippetSource).trim()) {
      return state.lastOutputSnippet ?? '';
    }
    let nextSnippet = this._buildSemanticSnippet(snippetSource);

    // If the selected snippet closely matches the agent's system prompt or the
    // full combined prompt (including workflow context/task description), discard
    // it and rebuild without that text.  This catches ANY provider echoing the prompt.
    const promptTexts = [state._agentSystemPrompt, state._agentFullPrompt].filter(Boolean);
    if (nextSnippet && promptTexts.length > 0) {
      const isPromptEcho = promptTexts.some(p => this._snippetOverlapsPrompt(nextSnippet, p));
      if (isPromptEcho) {
        nextSnippet = this._buildSemanticSnippet(
          snippetSource.replace(nextSnippet, '').trim()
        );
        // Check the replacement too — it might also be prompt echo
        if (nextSnippet && promptTexts.some(p => this._snippetOverlapsPrompt(nextSnippet, p))) {
          nextSnippet = '';
        }
      }
    }

    // Always update: prefer filtered result, even if empty (prevents stale noise).
    state.lastOutputSnippet = nextSnippet;
    if (sessionReplay) {
      state._snippetSourceBuffer = sessionReplay;
    }

    return state.lastOutputSnippet ?? '';
  }

  _serializeRuntimeBlocker(blocker = null) {
    if (!blocker) return null;
    return {
      type: blocker.type,
      provider: blocker.provider,
      message: blocker.message,
      nodeId: blocker.nodeId ?? null,
      childExecutionId: blocker.childExecutionId ?? null,
      childNodeId: blocker.childNodeId ?? null,
      detectedAt: blocker.detectedAt ?? null,
      progressReason: blocker.progressReason ?? null,
      elapsedMs: blocker.elapsedMs ?? null,
      tokenDelta: blocker.tokenDelta ?? null,
    };
  }

  _recoverBufferedHandoffEvent(execution, nodeId, state) {
    if (!execution || !state) return null;

    const candidateText = [
      this._readAgentSessionReplay(state),
      state._runtimeScanBuffer ?? '',
      state.lastOutputSnippet ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!candidateText || (!candidateText.includes('__HANDOFF__') && !candidateText.includes('HANDOFF:'))) {
      return null;
    }

    const parser = new HandoffParser();
    const recoveryEvents = parser.feed(candidateText.replace(/__DONE__/g, ''));
    const handoffEvent = recoveryEvents.find((evt) => evt.type === 'handoff') ?? null;
    if (!handoffEvent) return null;

    const isValidTarget = execution.workflowDef.edges.some(
      (edge) => edge.source === nodeId && edge.target === handoffEvent.targetId
    );
    return isValidTarget ? handoffEvent : null;
  }

  _getOutgoingTargets(workflowDef, nodeId) {
    if (!workflowDef || !nodeId) return [];
    return [...new Set(
      (workflowDef.edges ?? [])
        .filter((edge) => edge.source === nodeId)
        .map((edge) => edge.target)
        .filter(Boolean)
    )];
  }

  _getStartNodes(workflowDef) {
    if (!workflowDef || !Array.isArray(workflowDef.nodes) || workflowDef.nodes.length === 0) {
      return [];
    }

    const explicitStartNodes = workflowDef.nodes.filter((node) => node?.data?.isTriageNode === true);
    if (explicitStartNodes.length > 0) {
      return explicitStartNodes;
    }

    const incomingTargets = new Set((workflowDef.edges ?? []).map((edge) => edge.target).filter(Boolean));
    const rootNodes = workflowDef.nodes.filter((node) => !incomingTargets.has(node.id));
    if (rootNodes.length > 0) {
      return rootNodes;
    }

    const agentNodes = workflowDef.nodes.filter((node) => (node?.type ?? 'agent') === 'agent');
    const firstAgentNode = agentNodes[0];
    if (firstAgentNode) {
      return [firstAgentNode];
    }

    return [workflowDef.nodes[0]].filter(Boolean);
  }

  _clearSubWorkflowPollHandle(state) {
    if (!state?._subWorkflowPollHandle) return;
    clearInterval(state._subWorkflowPollHandle);
    state._subWorkflowPollHandle = null;
  }

  _getChildExecutionIds(parentExecutionId) {
    if (!parentExecutionId) return [];
    return [...this._subWorkflowExecutions.entries()]
      .filter(([key]) => key.startsWith(`${parentExecutionId}:`))
      .map(([, childExecutionId]) => childExecutionId);
  }

  _detachChildExecutionIds(parentExecutionId) {
    if (!parentExecutionId) return [];
    const childExecutionIds = [];
    for (const [key, childExecutionId] of [...this._subWorkflowExecutions.entries()]) {
      if (!key.startsWith(`${parentExecutionId}:`)) continue;
      childExecutionIds.push(childExecutionId);
      this._subWorkflowExecutions.delete(key);
    }
    return childExecutionIds;
  }

  _clearExecutionFlowControlState(executionId) {
    if (!executionId) return;

    for (const [key, handle] of [...this._delayTimers.entries()]) {
      if (!key.startsWith(`${executionId}:`)) continue;
      clearTimeout(handle);
      this._delayTimers.delete(key);
    }

    for (const key of [...this._mergeStates.keys()]) {
      if (key.startsWith(`${executionId}:`)) {
        this._mergeStates.delete(key);
      }
    }

    for (const key of [...this._loopStates.keys()]) {
      if (key.startsWith(`${executionId}:`)) {
        this._loopStates.delete(key);
      }
    }
  }

  _resolveHandoffFanOutTargets(execution, sourceNodeId, requestedTargetId) {
    if (!execution || !sourceNodeId || !requestedTargetId) return [requestedTargetId].filter(Boolean);

    const sourceNode = execution.workflowDef.nodes.find((node) => node.id === sourceNodeId);
    const outgoingTargets = this._getOutgoingTargets(execution.workflowDef, sourceNodeId);
    const sourceNodeType = sourceNode?.type ?? 'agent';

    if (
      sourceNodeType === 'agent'
      && outgoingTargets.length > 1
      && outgoingTargets.includes(requestedTargetId)
    ) {
      return outgoingTargets;
    }

    return [requestedTargetId];
  }

  _buildRuntimeProviderStrategy(workflowDef, requestedProvider = null) {
    const normalized = normalizeRuntimeProvider(requestedProvider ?? workflowDef?.settings?.runtimeProvider);
    if (normalized === RUNTIME_PROVIDER.CLAUDE) {
      return {
        mode: RUNTIME_PROVIDER.CLAUDE,
        activeProvider: RUNTIME_PROVIDER.CLAUDE,
        fallbackProvider: null,
        allowFallback: false,
      };
    }
    if (normalized === RUNTIME_PROVIDER.CODEX) {
      return {
        mode: RUNTIME_PROVIDER.CODEX,
        activeProvider: RUNTIME_PROVIDER.CODEX,
        fallbackProvider: null,
        allowFallback: false,
      };
    }
    if (normalized === RUNTIME_PROVIDER.GEMINI) {
      return {
        mode: RUNTIME_PROVIDER.GEMINI,
        activeProvider: RUNTIME_PROVIDER.GEMINI,
        fallbackProvider: null,
        allowFallback: false,
      };
    }
    return {
      mode: RUNTIME_PROVIDER.AUTO,
      activeProvider: RUNTIME_PROVIDER.CLAUDE,
      fallbackProvider: RUNTIME_PROVIDER.CODEX,
      tertiaryProvider: RUNTIME_PROVIDER.GEMINI,
      allowFallback: true,
    };
  }

  async _resolveRuntimeProviderBinary(provider) {
    if (provider === RUNTIME_PROVIDER.CODEX) {
      if (this._sessionManager.codexBin) {
        return this._sessionManager.codexBin;
      }
      return discoverCodexBinary();
    }
    if (provider === RUNTIME_PROVIDER.GEMINI) {
      if (this._sessionManager.geminiBin) {
        return this._sessionManager.geminiBin;
      }
      return discoverGeminiBinary();
    }

    const claudeBin = this._sessionManager.claudeBin;
    if (!claudeBin) {
      throw new Error('claudeBin not set on SessionManager');
    }
    return claudeBin;
  }

  _buildRuntimeProviderArgs(provider, runtimeModels = null) {
    // The runtime CLI entrypoints are interactive by default. Provider-specific
    // launch behavior is represented here so Swarm can select the correct
    // binary/launch profile without duplicating discovery logic.
    const profile = RUNTIME_PROVIDER_PROFILES[provider] ?? {};
    let args;
    if (typeof profile.buildArgs === 'function') {
      args = [...profile.buildArgs()];
    } else {
      args = [...(profile.args ?? [])];
    }

    // Per-workflow model override: if runtimeModels[provider] is set, replace the
    // explicit runtime model flag with the user-selected model.
    const overrideModel = runtimeModels?.[provider];
    if (
      overrideModel
      && typeof overrideModel === 'string'
      && overrideModel.trim()
      && isSupportedRuntimeModel(provider, overrideModel)
    ) {
      const modelFlag = provider === RUNTIME_PROVIDER.CLAUDE ? '--model' : '-m';
      const modelIndex = args.indexOf(modelFlag);
      if (modelIndex !== -1 && modelIndex + 1 < args.length) {
        args[modelIndex + 1] = overrideModel.trim();
      } else {
        args.push(modelFlag, overrideModel.trim());
      }
    }

    const modelFlag = provider === RUNTIME_PROVIDER.CLAUDE ? '--model' : '-m';
    const modelIndex = args.indexOf(modelFlag);
    if (modelIndex !== -1 && modelIndex + 1 < args.length) {
      const currentModel = String(args[modelIndex + 1] ?? '').trim();
      if (!isSupportedRuntimeModel(provider, currentModel)) {
        const fallbackModel = getDefaultRuntimeModel(provider);
        if (fallbackModel) {
          args[modelIndex + 1] = fallbackModel;
        } else {
          args.splice(modelIndex, 2);
        }
      }
    } else {
      const fallbackModel = getDefaultRuntimeModel(provider);
      if (fallbackModel) {
        args.push(modelFlag, fallbackModel);
      }
    }

    return args;
  }

  _buildRuntimeProviderBootstrapPrompt(provider, { fallbackFrom = null, fallbackReason = null } = {}) {
    let providerLabel = 'Claude';
    if (provider === RUNTIME_PROVIDER.CODEX) providerLabel = 'Codex';
    if (provider === RUNTIME_PROVIDER.GEMINI) providerLabel = 'Gemini';

    const lines = [
      `${providerLabel} runtime is active for this Swarm agent.`,
      'Continue the workflow using the shared task context below.',
    ];

    if (fallbackFrom) {
      let fallbackLabel = 'Claude';
      if (fallbackFrom === RUNTIME_PROVIDER.CODEX) fallbackLabel = 'Codex';
      if (fallbackFrom === RUNTIME_PROVIDER.GEMINI) fallbackLabel = 'Gemini';
      lines.unshift(`${providerLabel} replaced ${fallbackLabel} because the previous provider could not continue.`);
    }
    if (fallbackReason) {
      lines.push(`Fallback reason: ${fallbackReason}`);
    }

    return lines.join('\n');
  }

  _getBudgetSnapshot(execution) {
    let budget = { estimatedTokensUsed: 0, limitTokens: execution.workflowDef.settings?.budgetTokens || 0 };
    if (this._budgetTracker) {
      budget = {
        estimatedTokensUsed: this._budgetTracker.getTotal(execution.executionId),
        limitTokens: execution.workflowDef.settings?.budgetTokens || 0,
      };
    }
    return budget;
  }

  _markAgentProgress(execution, nodeId, state, reason) {
    if (!execution || !state || !reason) return;
    const now = Date.now();
    const estimatedTokens = this._budgetTracker ? this._budgetTracker.getTotal(execution.executionId) : 0;

    state.lastForwardProgressAt = now;
    state.lastForwardProgressReason = reason;
    state.lastForwardProgressTokens = estimatedTokens;

    if (reason === 'meaningful_output' && !state.firstMeaningfulOutputAt) {
      state.firstMeaningfulOutputAt = now;
    }
    if (reason === 'parser_token' && !state.firstParserTokenAt) {
      state.firstParserTokenAt = now;
    }
    if (reason === 'downstream_spawn' && !state.firstDownstreamSpawnAt) {
      state.firstDownstreamSpawnAt = now;
    }

    if (state.noProgressBlocked) {
      state.noProgressBlocked = false;
    }

    this._scheduleNoProgressWatch(execution.executionId, nodeId, state);
  }

  _hasMeaningfulGeminiOutput(rawChunk = '') {
    const normalized = this._normalizeParserChunk(rawChunk)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!normalized || normalized.length < 24) return false;

    const nonMeaningfulFragments = [
      'type your message or @path/to/file',
      'ready (',
      'thinking...',
      'keep trying',
      '/model to switch',
      'usage limit reached',
      'waiting for authentication',
      'request cancelled',
      'press esc or ctrl+c to cancel',
      SWARM_PROMPT_ECHO_MARKER.toLowerCase(),
    ];

    return !nonMeaningfulFragments.some((fragment) => normalized.includes(fragment));
  }

  _clearNoProgressWatch(state) {
    if (!state?.noProgressTimer) return;
    clearTimeout(state.noProgressTimer);
    state.noProgressTimer = null;
  }

  _scheduleNoProgressWatch(executionId, nodeId, state) {
    if (!state || state.provider !== RUNTIME_PROVIDER.GEMINI) return;
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const hasDownstreamTargets = execution.workflowDef.edges.some((edge) => edge.source === nodeId);
    if (!hasDownstreamTargets || state.status !== 'running' || state.runtimeBlocker || execution.runtimeBlocker || (state.handoffCount ?? 0) > 0) {
      this._clearNoProgressWatch(state);
      return;
    }

    this._clearNoProgressWatch(state);
    const lastProgressAt = state.lastForwardProgressAt ?? state.spawnedAt ?? Date.now();
    const elapsedMs = Date.now() - lastProgressAt;
    const softRemainingMs = Math.max(0, getGeminiNoProgressTimeoutMs() - elapsedMs);
    const hardRemainingMs = Math.max(0, getGeminiNoProgressHardTimeoutMs() - elapsedMs);
    const nextDelayMs = softRemainingMs > 0
      ? Math.min(softRemainingMs, hardRemainingMs || softRemainingMs)
      : Math.max(1, hardRemainingMs || getGeminiNoProgressTimeoutMs());

    state.noProgressTimer = setTimeout(() => {
      const currentExecution = this._executions.get(executionId);
      const currentState = currentExecution?.agentStates.get(nodeId);
      if (!currentExecution || !currentState) return;

      if (!this._maybeBlockForNoProgress(executionId, nodeId, currentState, { allowSilentTimeout: true })) {
        this._scheduleNoProgressWatch(executionId, nodeId, currentState);
      }
    }, nextDelayMs);

    if (state.noProgressTimer?.unref) {
      state.noProgressTimer.unref();
    }
  }

  _maybeBlockForNoProgress(executionId, nodeId, state, { allowSilentTimeout = false } = {}) {
    const execution = this._executions.get(executionId);
    if (!execution || !state) return false;
    if (state.provider !== RUNTIME_PROVIDER.GEMINI) return false;
    if (state.status !== 'running') return false;
    if (state.runtimeBlocker || execution.runtimeBlocker) return false;
    if ((state.handoffCount ?? 0) > 0) return false;

    const hasDownstreamTargets = execution.workflowDef.edges.some((edge) => edge.source === nodeId);
    if (!hasDownstreamTargets) return false;

    const lastProgressAt = state.lastForwardProgressAt ?? state.spawnedAt ?? Date.now();
    const elapsedMs = Date.now() - lastProgressAt;
    if (elapsedMs < getGeminiNoProgressTimeoutMs()) return false;

    const currentEstimatedTokens = this._budgetTracker ? this._budgetTracker.getTotal(execution.executionId) : 0;
    const lastProgressTokens = state.lastForwardProgressTokens ?? 0;
    const tokenDelta = Math.max(0, currentEstimatedTokens - lastProgressTokens);
    const softTimeoutSatisfied = tokenDelta >= getGeminiNoProgressTokenDelta();
    const hardTimeoutSatisfied = allowSilentTimeout && elapsedMs >= getGeminiNoProgressHardTimeoutMs();
    if (!softTimeoutSatisfied && !hardTimeoutSatisfied) return false;
    if (state.noProgressBlocked) return true;

    const recentRuntimeOutput = [
      state._runtimeScanBuffer ?? '',
      state.interventionBuffer ?? '',
      state.lastOutputSnippet ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    const recentGeminiBlocker = this._detectPatternBlocker(recentRuntimeOutput, RUNTIME_PROVIDER.GEMINI);
    if (recentGeminiBlocker?.type === 'rate_limited' || recentGeminiBlocker?.type === 'provider_unavailable') {
      state.noProgressBlocked = true;
      this._clearNoProgressWatch(state);
      void this._handleRuntimeBlocker(executionId, nodeId, recentGeminiBlocker);
      return true;
    }

    state.noProgressBlocked = true;
    this._clearNoProgressWatch(state);
    void this._handleRuntimeBlocker(executionId, nodeId, {
      type: 'no_progress_timeout',
      provider: RUNTIME_PROVIDER.GEMINI,
      message: `Gemini made no forward progress toward the first handoff for ${elapsedMs} ms and about ${tokenDelta} tokens.`,
      progressReason: state.lastForwardProgressReason ?? 'spawn',
      elapsedMs,
      tokenDelta,
      detectedAt: new Date().toISOString(),
    });
    return true;
  }

  _broadcastExecutionSnapshot(execution) {
    if (!this._wsBroadcast || !execution) return;
    this._wsBroadcast(execution.executionId, {
      type: 'execution_status',
      ...this.getStatus(execution.executionId, execution),
    });
  }

  _broadcastAgentStatus(executionId, nodeId, state) {
    if (!this._wsBroadcast) return;
    const lastOutputSnippet = state?.status && state.status !== 'running'
      ? this._refreshAgentSnippet(state, { preferSessionReplay: true })
      : (state?.lastOutputSnippet ?? '');
    this._wsBroadcast(executionId, {
      type: 'agent_status',
      nodeId,
      provider: state?.provider ?? null,
      runtimeProvider: state?.runtimeProvider ?? state?.provider ?? null,
      status: state?.status ?? 'idle',
      sessionId: state?.sessionId ?? null,
      spawnMode: state?.spawnMode ?? 'pty',
      lastOutputSnippet,
      ...(state?.runtimeBlocker
        ? { runtimeBlocker: this._serializeRuntimeBlocker(state.runtimeBlocker) }
        : {}),
    });

    // Flush chat extractor when agent is done
    if (state?.status === 'done' || state?.status === 'completed' || state?.status === 'error') {
      this._chatExtractor.flush(executionId, nodeId);
    }
  }

  _broadcastChatMessage(msg) {
    if (!msg?.executionId) return;
    const execution = this._executions.get(msg.executionId);
    if (execution) {
      execution.chatMessages = [...(execution.chatMessages ?? []), {
        nodeId: msg.nodeId ?? null,
        role: msg.role ?? 'assistant',
        text: msg.text ?? '',
        timestamp: msg.timestamp ?? Date.now(),
      }].slice(-500);
    }
    if (!this._wsBroadcast) return;
    this._wsBroadcast(msg.executionId, {
      type: 'chat_message',
      nodeId: msg.nodeId,
      role: msg.role,
      text: msg.text,
      timestamp: msg.timestamp,
    });
  }

  _setExecutionStatus(execution, status) {
    if (!execution || execution.status === status) return;
    execution.status = status;
    this._broadcastExecutionSnapshot(execution);

    // Persist execution history on terminal states
    if (['completed', 'stopped', 'failed'].includes(status)) {
      this._persistExecutionHistory(execution).catch((err) => {
        console.error(`[swarm] Failed to persist execution history: ${err.message}`);
      });
    }
  }

  /**
   * Persist a terminal execution to the ExecutionHistoryStore.
   * Guarded against duplicate writes via _persistedHistoryIds.
   * @param {object} execution
   */
  async _persistExecutionHistory(execution) {
    if (!this._executionHistoryStore) return;

    const execId = execution.executionId ?? execution.id;
    if (!execId || !execution.workflowId) return;

    // Guard against duplicate writes (stop/cleanup can be called multiple times)
    if (this._persistedHistoryIds.has(execId)) return;
    this._persistedHistoryIds.add(execId);

    const endedAt = new Date().toISOString();
    const startedAt = execution.startedAt || null;
    let durationMs = null;
    if (startedAt) {
      durationMs = Date.now() - new Date(startedAt).getTime();
      if (durationMs < 0) durationMs = null;
    }

    // Build node snapshots: which agents ran and their final states
    const nodeSnapshots = {};
    let nodesRun = 0;
    if (execution.agentStates) {
      for (const [nodeId, state] of execution.agentStates) {
        nodesRun++;
        nodeSnapshots[nodeId] = {
          status: state.status ?? 'unknown',
          provider: state.runtimeProvider ?? state.provider ?? null,
          handoffCount: state.handoffCount ?? 0,
        };
      }
    }

    const agentOutputs = this._buildAgentOutputs(execution);

    // Build aggregated markdown artifact
    const aggregatedArtifact = buildWorkflowArtifact({
      workflowName: execution.workflowDef?.name || 'Workflow',
      workflowDescription: execution.workflowDef?.description || '',
      executionId: execId,
      status: execution.status,
      startedAt,
      endedAt,
      durationMs,
      agentOutputs,
    });

    // Build a human-readable outcome summary
    let outcome = '';
    if (execution.status === 'completed') {
      outcome = `Workflow completed successfully. ${nodesRun} node(s) executed.`;
    } else if (execution.status === 'stopped') {
      outcome = `Workflow stopped by user. ${nodesRun} node(s) were active.`;
    } else if (execution.status === 'failed') {
      outcome = `Workflow failed. ${nodesRun} node(s) were active.`;
    }

    const entry = {
      executionId: execId,
      status: execution.status,
      startedAt,
      endedAt,
      durationMs,
      nodesRun,
      outcome,
      nodeSnapshots,
      agentOutputs,
      aggregatedArtifact,
    };

    try {
      await this._executionHistoryStore.addEntry(execution.workflowId, entry);
    } catch (err) {
      // Remove from guard set so a retry is possible
      this._persistedHistoryIds.delete(execId);
      throw err;
    }
  }

  _buildInitialWorkflowContext(workflowDef) {
    const initialContext =
      workflowDef?.initialContext && typeof workflowDef.initialContext === 'object'
        ? { ...workflowDef.initialContext }
        : {};

    const workflowName = workflowDef?.name || 'Workflow';
    const workflowDescription = workflowDef?.description || '';
    const defaultCurrentTask = workflowDescription
      ? `Execute the workflow goal described here: ${workflowDescription}`
      : `Execute the workflow "${workflowName}" and advance it through the agent graph.`;

    return {
      workflowName,
      workflowDescription,
      currentTask: initialContext.currentTask || defaultCurrentTask,
      ...initialContext,
    };
  }

  _recordInboundHandoff(execution, sourceNodeId, targetNodeId, contextUpdate = {}) {
    if (!execution || !targetNodeId) return;
    if (!execution.inboundHandoffs) {
      execution.inboundHandoffs = new Map();
    }

    const sourceNode = execution.workflowDef?.nodes?.find((node) => node.id === sourceNodeId) ?? null;
    const sourceLabel = sourceNode?.data?.label || sourceNodeId;
    const payload = contextUpdate && typeof contextUpdate === 'object'
      ? { ...contextUpdate }
      : {};
    const existing = execution.inboundHandoffs.get(targetNodeId) ?? [];
    const nextEntries = existing.filter((entry) => entry.sourceNodeId !== sourceNodeId);

    nextEntries.push({
      sourceNodeId,
      sourceLabel,
      payload,
      timestamp: new Date().toISOString(),
    });

    execution.inboundHandoffs.set(targetNodeId, nextEntries.slice(-8));
  }

  _getInboundHandoffsForTarget(execution, targetNodeId) {
    if (!execution?.inboundHandoffs || !targetNodeId) return [];
    return execution.inboundHandoffs.get(targetNodeId) ?? [];
  }

  _shouldWaitForAllAgentInputs(execution, targetNodeId) {
    if (!execution || !targetNodeId) return false;
    const targetNode = execution.workflowDef?.nodes?.find((node) => node.id === targetNodeId) ?? null;
    if (!targetNode || this._isFlowControlNode(targetNode)) return false;

    const incomingSourceCount = new Set(
      (execution.workflowDef?.edges ?? [])
        .filter((edge) => edge.target === targetNodeId)
        .map((edge) => edge.source)
        .filter(Boolean)
    ).size;
    if (incomingSourceCount <= 1) return false;

    const descriptor = `${targetNode.data?.label || ''} ${targetNode.data?.systemPrompt || ''}`;
    return /\b(wait for|collect|both|merge|combine|combined|summariz(?:e|es|ed|ing)?|aggregate|all inputs|all results|together)\b/i.test(descriptor);
  }

  _registerPendingAgentInput(execution, targetNodeId, sourceNodeId) {
    if (!execution || !targetNodeId) return { required: 0, received: 0 };
    if (!execution.agentInputBarriers) {
      execution.agentInputBarriers = new Map();
    }

    const required = new Set(
      (execution.workflowDef?.edges ?? [])
        .filter((edge) => edge.target === targetNodeId)
        .map((edge) => edge.source)
        .filter(Boolean)
    ).size;
    const barrier = execution.agentInputBarriers.get(targetNodeId) ?? { required, received: new Set() };
    barrier.required = required;
    if (sourceNodeId) {
      barrier.received.add(sourceNodeId);
    }
    execution.agentInputBarriers.set(targetNodeId, barrier);
    return { required: barrier.required, received: barrier.received.size };
  }

  _normalizeParserChunk(rawChunk = '') {
    // Phase 1: Strip non-CUF escape sequences first
    let text = rawChunk
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')   // OSC sequences
      .replace(/\x1b(?!\[)[@-_][0-?]*[ -/]*[@-~]/g, '');    // other 7-bit C1 (NOT CSI)

    // Phase 2: Smart CUF handling via segment analysis.
    // Split by CUF sequences to examine the text segments between them.
    // Short segments (≤3 chars) on BOTH sides of a CUF(1) indicate
    // char-by-char ConPTY rendering — join without a space.
    // Otherwise CUF represents a real whitespace gap — insert space(s).
    const cufParts = text.split(/\x1b\[(\d*)C/);
    // cufParts = [seg0, cufN0, seg1, cufN1, seg2, ...]

    if (cufParts.length > 1) {
      // Clean each text segment of remaining CSI (colors, cursor moves)
      const segs = [];
      const cufNs = [];
      for (let i = 0; i < cufParts.length; i++) {
        if (i % 2 === 0) {
          segs.push(cufParts[i].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''));
        } else {
          cufNs.push(Number(cufParts[i]) || 1);
        }
      }

      let result = segs[0];
      for (let i = 0; i < cufNs.length; i++) {
        const count = cufNs[i];
        const prevSeg = segs[i];
        const nextSeg = segs[i + 1] ?? '';

        if (count >= 2) {
          // Large CUF gap — always whitespace
          result += ' '.repeat(count);
        } else {
          // CUF(1): decide based on adjacent segment lengths.
          // If BOTH neighbors are short (≤3 chars), it's likely char-by-char
          // ConPTY rendering — join without space. ConPTY splits words into
          // small 1-3 char chunks when rendering character-by-character.
          // If either neighbor is ≥4 chars, it's a real word → insert space.
          if (prevSeg.length <= 3 && nextSeg.length <= 3) {
            // Both short — char-by-char rendering, no space
          } else {
            result += ' ';
          }
        }
        result += nextSeg;
      }
      text = result;
    } else {
      // No CUF found — just strip remaining CSI
      text = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    }

    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  _stripSnippetProtocolArtifacts(rawText = '') {
    return String(rawText ?? '')
      .replace(/----?\s*SWARM PROTOCOL[\s\S]*?----?\s*END PROTOCOL\s*----?/gi, '\n')
      .replace(/----?\s*SWARM INPUT[\s\S]*?----?\s*END SWARM INPUT\s*----?/gi, '\n')
      .replace(/^-+\s*END SWARM INPUT\s*-+\s*$/gm, '\n')
      .replace(/Do NOT output the handoff or done token mid-response\.[\s\S]*?Only as the very LAST line\./gi, '\n')
      .replace(/\w+\s+is\s+not\s+the\s+end\s+of\s+the\s+workflow\s+yet\.?[^\n]*/gi, '\n')
      .replace(/Do\s+not\s+stop\s+at\s+the\s+done\s+marker[^\n]*/gi, '\n')
      .replace(/Con\s*t\s*in\s*u\s*e\s*this\s*task\s*:[^\n]*/gi, '\n')
      .replace(/Continue\s+this\s+task\s*:[^\n]*/gi, '\n')
      .replace(/Finish\s+your\s+work,?\s+then\s+hand\s+off\s+to\s+[^\n]*/gi, '\n')
      .replace(/Your\s+very\s+last\s+line\s+must\s+be\s+a\s+valid\s+handoff[^\n]*/gi, '\n')
      .replace(/Execute\s+the\s+workflow\s+goal\s+described\s+here[^\n]*/gi, '\n')
      .replace(/Use\s+\S+\s+in\s+place\s+of\s+<targetId>[^\n]*/gi, '\n')
      .replace(/Output\s+that\s+final\s+handoff\s+token[^\n]*/gi, '\n')
      .replace(/Replace\s+the\s+summary\s+value\s+with[^\n]*/gi, '\n')
      // Strip role + directive blocks: "You are a [role]. Take/List/Find/Write..."
      // ConPTY wraps these across multiple lines, so use [\s\S] to span them.
      .replace(/You\s+are\s+(?:a|an|the)\s+[\s\S]*?(?:hands?\s+off|handoff|__DONE__|__HANDOFF__)/gi, '\n')
      .replace(/You\s+are\s+(?:a|an|the)\s+\w[\w\s]*?\.\s*(?:Take|List|Find|Write|Create|Compose|Analyze|Research|Summarize|Identify|Generate|Produce|Craft|Prepare)[\s\S]*?(?:\.\s*\n|\n{2})/gi, '\n')
      .replace(/^__HANDOFF__:[^\n]*/gm, '\n')
      .replace(/^HANDOFF:[^\n]*/gm, '\n')
      .replace(/\s+(?:__HANDOFF__|HANDOFF):[^\n]*/g, '');
  }

  _normalizeSnippetLine(rawLine = '') {
    return String(rawLine ?? '')
      .replace(/^[\s\u2022\u00b7\u203a\u25e6\u25cf\u2500-\u257f\u2580-\u259f\u2720-\u2740*+|>]+/, '')
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/^\s*exactly these lines and then __done__:\s*/i, '')
      .replace(/\s*Explain this codebase.*$/i, '')
      .replace(/\s*Messages to be submitted after next tool call.*$/i, '')
      .replace(/\s*Run \/review\b.*$/i, '')
      .replace(/\s*Use \/skills\b.*$/i, '')
      .replace(/\s*Type your message(?: or @path\/to\/file)?.*$/i, '')
      .replace(/\s*\? for shortcuts.*$/i, '')
      .trim();
  }

  _isSnippetRecoveryLine(line = '') {
    const normalized = this._normalizeSnippetLine(line);
    if (!normalized) return false;
    return SNIPPET_RECOVERY_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  _isSnippetNoiseLine(line = '') {
    const normalized = this._normalizeSnippetLine(line);
    const compactNormalized = normalized.toLowerCase().replace(/[\s~\\/_.\-Â·â€¢]+/g, '');
    if (!normalized) return true;
    if (SNIPPET_NOISE_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
    if (compactNormalized.includes('opus46withmediumeffort')) return true;
    if (compactNormalized.includes('whatdoyouwanttodo')) return true;
    if (compactNormalized.includes('claudeprodownloads')) return true;
    if (/^[,.;:|/\\<>\[\]()\-_=+*`~]+$/.test(normalized)) return true;
    if (/^([A-Za-z])\1{3,}$/.test(normalized)) return true;
    if (/^[A-Za-z]{1,3}$/.test(normalized)) return true;
    if ((/\.(?:py|pid|js|jsx|ts|tsx|md|json)$/i.test(normalized) || normalized.includes('server.pid'))
      && normalized.split(/\s+/).length <= 3) {
      return true;
    }
    return false;
  }

  /**
   * Returns true if the snippet text is substantially a substring of the
   * agent's system prompt — meaning the CLI echoed the prompt back rather
   * than producing original output.  Uses word-level overlap (>60%).
   */
  _snippetOverlapsPrompt(snippet, systemPrompt) {
    if (!snippet || !systemPrompt) return false;
    const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const snippetWords = normalize(snippet).split(' ').filter(Boolean);
    if (snippetWords.length < 4) return false;
    const promptNorm = ` ${normalize(systemPrompt)} `;
    let matchCount = 0;
    for (const w of snippetWords) {
      if (promptNorm.includes(` ${w} `)) matchCount++;
    }
    return (matchCount / snippetWords.length) > 0.6;
  }

  _scoreSnippetBlock(block = '') {
    const normalized = String(block ?? '').trim();
    if (!normalized) return Number.NEGATIVE_INFINITY;

    const words = normalized.split(/\s+/).filter(Boolean);
    let score = Math.min(normalized.length, 320);
    score += Math.min(words.length * 8, 160);
    score += Math.min(normalized.split('\n').filter(Boolean).length * 12, 60);

    if (/^__HANDOFF__:/m.test(normalized) || /^HANDOFF:/m.test(normalized)) score -= 120;
    if (/do not (?:output|stop at) (?:the (?:handoff|done)|__done__|__handoff__)/i.test(normalized)) score -= 200;
    if (/[:.]/.test(normalized)) score += 20;
    if (/[-*]\s/.test(normalized) || /^\d+\./m.test(normalized)) score += 15;
    if ((normalized.match(/\b[A-Z_]+=[^\s|]+/g) ?? []).length >= 2) score += 120;
    if ((normalized.match(/\/api\/v1\//g) ?? []).length >= 1) score += 80;
    if (/127\.0\.0\.1|v\d+\.\d+\.\d+/i.test(normalized)) score += 40;
    if (SNIPPET_STALE_FOREIGN_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) score -= 180;
    if (SNIPPET_RECOVERY_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) score -= 260;
    if (SNIPPET_PROGRESS_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) score -= 180;
    if (SNIPPET_PROMPT_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) score -= 180;
    if (SNIPPET_COMMAND_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) score -= 260;
    if (/heads up, you have less than \d+%/i.test(normalized)) score -= 180;
    if (/api error:|this request failed|access resets at/i.test(normalized)) score -= 180;
    if (/^(?:ran|running)\b/im.test(normalized)) score -= 160;
    if (words.length <= 3) score -= 80;

    return score;
  }

  _isSnippetStructuredFactLine(line = '') {
    const normalized = this._normalizeSnippetLine(line);
    if (!normalized || this._isSnippetNoiseLine(normalized)) return false;

    return /PROMPT-CONTROL-REPORT\b/i.test(normalized)
      || /\b(?:VERSION|HOST|START_ROUTE|STATUS_ROUTE|PROMPT_BUILDER|DONE_TOKEN)=[^\s|]+/i.test(normalized);
  }

  _buildStructuredFactSnippet(lines = []) {
    const factLines = [];
    const seen = new Set();
    let sawExplicitDone = false;

    for (const rawLine of lines) {
      const line = this._normalizeSnippetLine(rawLine);
      if (/^__DONE__$/i.test(line)) {
        sawExplicitDone = true;
        continue;
      }
      if (!this._isSnippetStructuredFactLine(line)) continue;

      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      factLines.push(line);
    }

    if (factLines.length < 3) return '';

    const snippetLines = factLines.slice(0, 8);
    if (sawExplicitDone) {
      snippetLines.push('__DONE__');
    }

    return snippetLines.join('\n').slice(-500);
  }

  _buildRecoverySnippet(rawText = '') {
    const normalized = this._normalizeParserChunk(rawText);
    if (!normalized.trim()) return '';

    if (SNIPPET_RECOVERY_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return 'Runtime reminder: final agent was prompted to output __DONE__ after its content.';
    }

    if (/conversation interrupted|went wrong|usage limit|not authenticated|authentication failed|rate limit|quota exceeded|resource exhausted|error/i.test(normalized)) {
      return normalized
        .split('\n')
        .map((line) => this._normalizeSnippetLine(line))
        .find((line) => /conversation interrupted|went wrong|usage limit|not authenticated|authentication failed|rate limit|quota exceeded|resource exhausted|error/i.test(line))
        ?.slice(-500) ?? '';
    }

    return '';
  }

  _sanitizeChatMessage(rawText = '', context = null) {
    const normalized = this._stripSnippetProtocolArtifacts(this._normalizeParserChunk(rawText));
    if (!normalized.trim()) return '';

    const cleanedLines = [];
    let previousLine = '';

    for (const rawLine of normalized.split('\n')) {
      const line = this._normalizeSnippetLine(rawLine);
      const compactLine = line
        ? line.toLowerCase().replace(/[\s~\\/_.\-·▝▜▛▘▞▟█─]+/g, '')
        : '';
      if (!line) continue;
      if (this._isSnippetNoiseLine(line)) continue;
      if (this._isSnippetRecoveryLine(line)) continue;
      if (/^claude\s*codev?\d/i.test(line)) continue;
      if (/^(?:opus|sonnet|haiku)\s*\d/i.test(line)) continue;
      if (/^(?:opus|sonnet|haiku)\d/i.test(line)) continue;
      if (/(?:medium|high|low)\s*effort/i.test(line)) continue;
      if (/(?:medium|high|low)effort/i.test(line)) continue;
      if (/claude\s*(?:api|max)/i.test(line)) continue;
      if (/claude(?:api|max)/i.test(line)) continue;
      if (/extra\s*usage/i.test(line)) continue;
      if (compactLine.includes('opus46withmediumeffortclaudemax')) continue;
      if (compactLine.includes('extrausage')) continue;
      if (compactLine.includes('claudecodev')) continue;
      if (compactLine.includes('downloadstestworkflowscopia')) continue;
      if (compactLine.includes('clauderuntimeisactiveforthisswarmagent')) continue;
      if (compactLine.includes('codexruntimeisactiveforthisswarmagent')) continue;
      if (compactLine.includes('geminiruntimeisactiveforthisswarmagent')) continue;
      if (compactLine.includes('continuetheworkflowusingthesharedtaskcontextbelow')) continue;
      if (compactLine.includes('useanyoneoftheseconnectedtargetidsinyourfinalhandofftoken')) continue;
      if (compactLine.includes('theruntimewillduplicatethathandoffacrosseveryconnecteddownstreamnode')) continue;
      if (/^you are the /i.test(line)) continue;
      if (/^current workflow context:?/i.test(line)) continue;
      if (/^this agent is not terminal in the workflow\.?$/i.test(line)) continue;
      if (/^when your stage is complete, you must emit a handoff token/i.test(line)) continue;
      if (/^your required downstream target is:/i.test(line)) continue;
      if (/^if another agent is better suited to /i.test(line)) continue;
      if (/^do not emit\b/i.test(line)) continue;
      if (/^HANDOFF:[a-z0-9-]+:/i.test(line)) continue;
      if (/tips for getting|welcome back|recent activity|no recent activity|run \/init to create/i.test(line)) continue;
      if (/^agent[-_\s]?[ab]\s*:\s*(?:greeting|translation|language)\b/i.test(line)) continue;
      if (compactLine.includes('agenta:greeting') || compactLine.includes('agentb:greeting')) continue;
      if (compactLine.includes('agenta:translation') || compactLine.includes('agentb:translation')) continue;
      if (compactLine.includes('agenta:language') || compactLine.includes('agentb:language')) continue;
      if (compactLine.includes('tipsforgetting') || compactLine.includes('welcomeback') || compactLine.includes('recentactivity') || compactLine.includes('run/inittocreate')) continue;
      if (/^(?:workflow name|workflow description|currenttask|task|instruction|workflow|merge_with|triage_note|agent(?:_[ab])?|language|greeting|status|translation|agent_[ab]_(?:language|greeting|translation)|merge_status)\s*:/i.test(line)) continue;
      if (/^["'{[]/.test(line)) continue;
      if (/"[^"\n]{1,80}"\s*:/.test(line)) continue;
      if ((line.match(/[{}":[\]]/g) ?? []).length > Math.max(4, Math.floor(line.length * 0.12))) continue;
      if (/^(?:[A-Z_]+=[^\s|]+|\w+:\s*\{)/.test(line)) continue;
      if (line === previousLine) continue;
      cleanedLines.push(line);
      previousLine = line;
    }

    let text = this._decompressConPTYSpaces(cleanedLines.join('\n')).trim();
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    if (!text) {
      text = this._buildRecoverySnippet(normalized);
    }

    const stateFallback = this._getChatSanitizationFallback(context);
    if (!text) {
      if (!stateFallback) return '';
      text = this._decompressConPTYSpaces(stateFallback).replace(/\n{3,}/g, '\n\n').trim();
    }

    if (/(?:bypass permissions on|claude code v\d|opus \d|sonnet \d|haiku \d|\/buddy|shift\+tab to cycle)/i.test(text)) {
      if (!stateFallback) return '';
      const fallbackText = this._decompressConPTYSpaces(stateFallback).replace(/\n{3,}/g, '\n\n').trim();
      if (!fallbackText) return '';
      text = fallbackText;
    }

    if ((!text || this._chatTextLooksCorrupted(text)) && stateFallback) {
      const fallbackText = this._decompressConPTYSpaces(stateFallback).replace(/\n{3,}/g, '\n\n').trim();
      if (fallbackText && this._chatTextQualityScore(fallbackText) >= this._chatTextQualityScore(text)) {
        text = fallbackText;
      }
    }

    if (this._chatTextLooksCorrupted(text)) {
      const semanticCandidate = this._buildSemanticSnippet(rawText);
      if (semanticCandidate) {
        const semanticText = this._decompressConPTYSpaces(semanticCandidate).replace(/\n{3,}/g, '\n\n').trim();
        if (semanticText && this._chatTextQualityScore(semanticText) >= this._chatTextQualityScore(text)) {
          text = semanticText;
        }
      }
    }

    if (/(?:must emit a handoff token|your required downstream target|do not stop at the done marker|finish your work, then hand off to|very last line must be a valid handoff token|this agent is not terminal in the workflow|is not the end of the workflow yet|runtime is active for this swarm agent|continue the workflow using the shared task context below|use any one of these connected target ids|the runtime will duplicate that handoff across every connected downstream node)/i.test(text)) {
      return '';
    }

    return text;
  }

  _getChatSanitizationFallback(context = null) {
    const executionId = context?.executionId;
    const nodeId = context?.nodeId;
    if (!executionId || !nodeId) return '';

    const execution = this._executions.get(executionId);
    const state = execution?.agentStates?.get(nodeId);
    if (!state) return '';

    const snippetFallback = this._buildSemanticSnippet(
      state._snippetSourceBuffer
      || state._runtimeScanBuffer
      || ''
    );
    const lastSnippet = state.lastOutputSnippet || '';

    if (!lastSnippet) return snippetFallback || '';
    if (!snippetFallback) return lastSnippet;
    if (!this._chatTextLooksCorrupted(snippetFallback) && snippetFallback.length > lastSnippet.length + 40) {
      return snippetFallback;
    }

    return this._chatTextQualityScore(snippetFallback) >= this._chatTextQualityScore(lastSnippet)
      ? snippetFallback
      : lastSnippet;
  }

  _chatTextLooksCorrupted(text = '') {
    const normalized = String(text ?? '').trim();
    if (!normalized) return false;
    if (/^you are the /im.test(normalized)) return true;
    if (/^current workflow context:?/im.test(normalized)) return true;
    if (/(?:must emit a handoff token|your required downstream target|do not stop at the done marker|finish your work, then hand off to|very last line must be a valid handoff token|this agent is not terminal in the workflow|is not the end of the workflow yet|runtime is active for this swarm agent|continue the workflow using the shared task context below|use any one of these connected target ids|the runtime will duplicate that handoff across every connected downstream node)/i.test(normalized)) {
      return true;
    }
    if (/^(?:workflow name|workflow description|currenttask|task|instruction|workflow|merge_with|triage_note|agent(?:_[ab])?|language|greeting|status|translation|agent_[ab]_(?:language|greeting|translation)|merge_status)\s*:/im.test(normalized)) {
      return true;
    }
    if (/(?:tips for getting|welcome back|recent activity|no recent activity|run \/init to create)/i.test(normalized)) {
      return true;
    }
    if (/(?:extra\s*usage|claude\s*max|claude codev?\d|opus\s*4(?:\.\d+)?\s*with\s*(?:medium|high|low)\s*effort)/i.test(normalized)) {
      return true;
    }
    if ((normalized.match(/\b[A-Za-z\u00C0-\u00FF]{12,}\b/gu) ?? []).length >= 2) return true;
    if ((normalized.match(/\b(?:[A-Za-z\u00C0-\u00FF]\s+){3,}[A-Za-z\u00C0-\u00FF]\b/gu) ?? []).length >= 1) return true;
    if ((normalized.match(/[a-z\u00E0-\u00FF][A-Z\u00C0-\u00D6]/gu) ?? []).length >= 2) return true;
    return false;
  }

  _chatTextQualityScore(text = '') {
    const normalized = String(text ?? '').trim();
    if (!normalized) return Number.NEGATIVE_INFINITY;

    let score = this._scoreSnippetBlock(normalized);
    score -= (normalized.match(/\b[A-Za-z\u00C0-\u00FF]{12,}\b/gu) ?? []).length * 60;
    score -= (normalized.match(/\b(?:[A-Za-z\u00C0-\u00FF]\s+){3,}[A-Za-z\u00C0-\u00FF]\b/gu) ?? []).length * 80;
    score -= (normalized.match(/[a-z\u00E0-\u00FF][A-Z\u00C0-\u00D6]/gu) ?? []).length * 20;
    if (/^you are the /im.test(normalized)) score -= 240;
    if (/^current workflow context:?/im.test(normalized)) score -= 240;
    if (/(?:must emit a handoff token|your required downstream target|do not stop at the done marker|finish your work, then hand off to|very last line must be a valid handoff token|this agent is not terminal in the workflow|is not the end of the workflow yet|runtime is active for this swarm agent|continue the workflow using the shared task context below|use any one of these connected target ids|the runtime will duplicate that handoff across every connected downstream node)/i.test(normalized)) score -= 320;
    if (/(?:extra\s*usage|claude\s*max|claude codev?\d|opus\s*4(?:\.\d+)?\s*with\s*(?:medium|high|low)\s*effort)/i.test(normalized)) score -= 320;
    if (/(?:tips for getting|welcome back|recent activity|no recent activity|run \/init to create)/i.test(normalized)) score -= 420;
    return score;
  }

  _sanitizeDisplaySnippetText(rawText = '') {
    const normalized = this._stripSnippetProtocolArtifacts(this._normalizeParserChunk(rawText));
    if (!normalized.trim()) return '';

    const cleanedLines = [];
    let previousLine = '';

    for (const rawLine of normalized.split('\n')) {
      const line = this._normalizeSnippetLine(rawLine);
      const compactLine = line
        ? line.toLowerCase().replace(/[\s~\\/_.\-·]+/g, '')
        : '';
      if (!line) continue;
      if (this._isSnippetNoiseLine(line)) continue;
      if (this._isSnippetRecoveryLine(line)) continue;
      if (SNIPPET_PROMPT_LINE_PATTERNS.some((pattern) => pattern.test(line))) continue;
      if (SNIPPET_COMMAND_LINE_PATTERNS.some((pattern) => pattern.test(line))) continue;
      if (/^(?:__HANDOFF__|HANDOFF:)/i.test(line)) continue;
      if (/^claude\s*codev?\d/i.test(line)) continue;
      if (/^(?:opus|sonnet|haiku)\s*\d/i.test(line)) continue;
      if (/claude\s*(?:api|max)/i.test(line)) continue;
      if (/extra\s*usage/i.test(line)) continue;
      if (/^you are the /i.test(line)) continue;
      if (/^current workflow context:?/i.test(line)) continue;
      if (/^the last line:?$/i.test(line)) continue;
      if (/^last line only:?$/i.test(line)) continue;
      if (/^valid target ids?:/i.test(line)) continue;
      if (/^context update:/i.test(line)) continue;
      if (/^concrete example\b/i.test(line)) continue;
      if (/^for this workflow,?\s/i.test(line)) continue;
      if (/^the final handoff tok/i.test(line)) continue;
      if (/^when your stage is complete, you must emit a handoff token/i.test(line)) continue;
      if (/^your required downstream target is:/i.test(line)) continue;
      if (/^if another agent is better suited to /i.test(line)) continue;
      if (/^do not emit\b/i.test(line)) continue;
      if (/^(?:workflow name|workflow description|currenttask|task|instruction|workflow|merge_with|triage_note|agent(?:_[ab])?|language|greeting|status|translation|agent_[ab]_(?:language|greeting|translation)|merge_status)\s*:/i.test(line)) continue;
      if (compactLine.includes('opus46withmediumeffortclaudemax')) continue;
      if (compactLine.includes('opus46withmediumeffort')) continue;
      if (compactLine.includes('extrausage')) continue;
      if (compactLine.includes('claudecodev')) continue;
      if (compactLine.includes('whatdoyouwanttodo')) continue;
      if (compactLine.includes('claudeprodownloads')) continue;
      if (compactLine.includes('nowusingextra')) continue;
      if (compactLine.includes('clauderuntimeisactiveforthisswarmagent')) continue;
      if (compactLine.includes('continuetheworkflowusingthesharedtaskcontextbelow')) continue;
      if ((line.match(/[{}":[\]]/g) ?? []).length > Math.max(4, Math.floor(line.length * 0.12))) continue;
      if (line === previousLine) continue;
      cleanedLines.push(line);
      previousLine = line;
    }

    const text = this._decompressConPTYSpaces(cleanedLines.join('\n'))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(-500);

    if (!text) return '';
    if (/^__DONE__$/i.test(text)) return '';
    if (
      /PROMPT-CONTROL-REPORT\b/i.test(text)
      || (text.match(/\b[A-Z_]+=[^\s|]+/g) ?? []).length >= 2
    ) {
      return text;
    }
    if (this._chatTextLooksCorrupted(text)) return '';
    return text;
  }

  _buildSemanticSnippet(rawText = '') {
    const sanitizedText = this._stripSnippetProtocolArtifacts(this._normalizeParserChunk(rawText));
    const normalizedLines = sanitizedText
      .split('\n')
      .map((line) => this._normalizeSnippetLine(line))
      .filter(Boolean);
    const blocks = [];
    let currentBlock = [];
    let previousLine = '';
    let sawRecoveryPrompt = false;

    const flushBlock = () => {
      if (currentBlock.length === 0) return;
      const blockText = currentBlock.join('\n').trim();
      if (blockText) blocks.push(blockText);
      currentBlock = [];
      previousLine = '';
    };

    for (const rawLine of sanitizedText.split('\n')) {
      const line = this._normalizeSnippetLine(rawLine);

      if (!line) {
        flushBlock();
        continue;
      }

      if (this._isSnippetRecoveryLine(line)) {
        sawRecoveryPrompt = true;
        flushBlock();
        continue;
      }

      if (this._isSnippetNoiseLine(line)) {
        flushBlock();
        continue;
      }

      if (line === previousLine) {
        continue;
      }

      currentBlock.push(line);
      previousLine = line;
    }

    flushBlock();

    const structuredFactSnippet = this._buildStructuredFactSnippet(normalizedLines);
    const structuredFactScore = structuredFactSnippet
      ? this._scoreSnippetBlock(structuredFactSnippet)
        + (structuredFactSnippet.includes('PROMPT-CONTROL-REPORT') ? 240 : 180)
      : Number.NEGATIVE_INFINITY;

    if (structuredFactSnippet && structuredFactScore >= 280) {
      const sanitizedStructuredFact = this._sanitizeDisplaySnippetText(structuredFactSnippet);
      if (sanitizedStructuredFact) {
        return sanitizedStructuredFact;
      }
    }

    if (blocks.length === 0) {
      if (structuredFactSnippet) {
        return this._sanitizeDisplaySnippetText(structuredFactSnippet) || structuredFactSnippet;
      }

      const fallbackLines = normalizedLines.filter((line) => {
        if (this._isSnippetNoiseLine(line)) return false;
        return line.split(/\s+/).filter(Boolean).length > 3;
      });

      if (fallbackLines.length > 0) {
        const fallbackText = fallbackLines.slice(-6).join('\n').slice(-500);
        return this._sanitizeDisplaySnippetText(fallbackText) || this._decompressConPTYSpaces(fallbackText);
      }

      const blockerLines = normalizedLines.filter((line) =>
        /conversation interrupted|went wrong|usage limit|not authenticated|authentication failed|rate limit|quota exceeded|resource exhausted|error/i.test(line)
      );

      if (blockerLines.length > 0) {
        const blockerText = blockerLines.at(-1)?.slice(-500) ?? '';
        return this._sanitizeDisplaySnippetText(blockerText) || this._decompressConPTYSpaces(blockerText);
      }

      return sawRecoveryPrompt ? this._buildRecoverySnippet(sanitizedText) : '';
    }

    const candidates = blocks.map((block, index) => ({
      block,
      score: this._scoreSnippetBlock(block) + (index * 5),
    }));
    if (structuredFactSnippet) {
      candidates.push({ block: structuredFactSnippet, score: structuredFactScore });
    }
    candidates.sort((a, b) => b.score - a.score);
    const bestScore = candidates[0]?.score ?? Number.NEGATIVE_INFINITY;

    if (bestScore < 0) {
      const recoveryFallback = this._buildRecoverySnippet(sanitizedText);
      if (recoveryFallback) return recoveryFallback;
    }

    for (const candidate of candidates) {
      const collapsed = candidate.block.replace(/(\(thinking\)){2,}/gi, '(thinking...)').slice(-500);
      const sanitizedCandidate = this._sanitizeDisplaySnippetText(collapsed);
      if (sanitizedCandidate) return sanitizedCandidate;
    }

    const fallbackCandidate = candidates[0]?.block?.replace(/(\(thinking\)){2,}/gi, '(thinking...)').slice(-500) ?? '';
    if (!fallbackCandidate) return '';
    return this._sanitizeDisplaySnippetText(fallbackCandidate) || this._decompressConPTYSpaces(fallbackCandidate);
  }

  /**
   * Restore spaces lost by Windows ConPTY compression.
   * ConPTY sometimes strips spaces between words, producing output like
   * "Sonol'agenteditriageperilrouting" instead of "Sono l'agente di triage per il routing".
   * Applied per-line; skips lines that look like code, URLs, paths, or structured facts.
   */
  _decompressConPTYSpaces(text) {
    if (!text) return text;
    return text.split('\n').map((line) => {
      if (/[={}()\[\]\/:].*[={}()\[\]\/:]/.test(line)) return line;
      if (/^[A-Z_]+=/.test(line)) return line;
      if (/^\s*[-â€¢]/.test(line) && /\/api\//.test(line)) return line;
      if (/https?:\/\//.test(line)) return line;
      if (/PROMPT-CONTROL-REPORT/.test(line)) return line;
      return line
        .replace(/([.!?])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
        .replace(/([,;])([a-zA-Z\u00C0-\u00F6])/gu, '$1 $2')
        .replace(/(-[A-Z])([a-z\u00E0-\u00F6])/gu, '$1 $2')
        .replace(/([a-z\u00E0-\u00F6])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
        .replace(/\b([a-zA-Z\u00C0-\u00F6]+(?:['’](?:s|re|ve|ll|d|m)|n['’]t))(?=[a-zA-Z\u00C0-\u00F6])/gu, '$1 ')
        .replace(/\b([a-zA-Z\u00C0-\u00F6]+['’])([a-zA-Z\u00C0-\u00F6]{7,})/gu, (_, prefix, suffix) => `${prefix}${this._restoreCompressedChatToken(suffix)}`)
        .replace(RESTORABLE_CHAT_TOKEN_MATCH_RE, (token) => this._restoreCompressedChatToken(token))
        .replace(/\s{2,}/g, ' ')
        .trimEnd();
    }).join('\n');
  }

  _restoreCompressedChatToken(token = '') {
    if (!token || !RESTORABLE_CHAT_TOKEN_RE.test(token)) return token;

    const lower = token.toLowerCase();
    const states = new Array(lower.length + 1).fill(null);
    states[0] = { score: 0, matchedChars: 0, matchedWords: 0, parts: [] };

    const pickBetterState = (candidate, current) => {
      if (!candidate) return current;
      if (!current) return candidate;
      if (candidate.score !== current.score) return candidate.score > current.score ? candidate : current;
      if (candidate.matchedChars !== current.matchedChars) {
        return candidate.matchedChars > current.matchedChars ? candidate : current;
      }
      if (candidate.matchedWords !== current.matchedWords) {
        return candidate.matchedWords > current.matchedWords ? candidate : current;
      }
      return candidate.parts.length < current.parts.length ? candidate : current;
    };

    for (let index = 0; index < lower.length; index += 1) {
      const current = states[index];
      if (!current) continue;

      const unmatchedState = {
        score: current.score - 3,
        matchedChars: current.matchedChars,
        matchedWords: current.matchedWords,
        parts: [...current.parts, { start: index, end: index + 1, matched: false }],
      };
      states[index + 1] = pickBetterState(unmatchedState, states[index + 1]);

      for (let length = 1; length <= COMPRESSED_CHAT_MAX_WORD_LEN && index + length <= lower.length; length += 1) {
        const slice = lower.slice(index, index + length);
        if (!COMPRESSED_CHAT_WORD_SET.has(slice)) continue;
        const matchState = {
          score: current.score + (length * 2) - (length === 1 ? 2 : 0),
          matchedChars: current.matchedChars + length,
          matchedWords: current.matchedWords + 1,
          parts: [...current.parts, { start: index, end: index + length, matched: true }],
        };
        states[index + length] = pickBetterState(matchState, states[index + length]);
      }
    }

      const result = states[lower.length];
      if (!result) return this._restoreCompressedChatTokenGreedy(token, lower) ?? token;

      const coverage = result.matchedChars / token.length;
      const minimumScore = token.length * 0.35;
      if (result.matchedWords < 2 || coverage < 0.6 || result.score <= minimumScore) {
        return this._restoreCompressedChatTokenGreedy(token, lower) ?? token;
      }

    const matchedParts = result.parts.filter((part) => part.matched);
    const singleCharMatches = matchedParts.filter((part) => (part.end - part.start) === 1).length;
    const tinyMatches = matchedParts.filter((part) => (part.end - part.start) <= 2).length;
    if (singleCharMatches > 1 || tinyMatches > 2) {
      return this._restoreCompressedChatTokenGreedy(token, lower) ?? token;
    }

    const mergedParts = [];
    for (const part of result.parts) {
      const previous = mergedParts.at(-1);
      if (previous && !previous.matched && !part.matched && previous.end === part.start) {
        previous.end = part.end;
      } else {
        mergedParts.push({ ...part });
      }
    }

      return mergedParts
        .map((part) => token.slice(part.start, part.end))
        .join(' ');
    }

  _restoreCompressedChatTokenGreedy(token = '', lowerToken = token.toLowerCase()) {
    if (!token || !RESTORABLE_CHAT_TOKEN_RE.test(token)) return null;

    const parts = [];
    let index = 0;

    while (index < lowerToken.length) {
      let bestEnd = -1;

      for (
        let length = Math.min(COMPRESSED_CHAT_MAX_WORD_LEN, lowerToken.length - index);
        length >= 1;
        length -= 1
      ) {
        const slice = lowerToken.slice(index, index + length);
        if (!COMPRESSED_CHAT_WORD_SET.has(slice)) continue;
        bestEnd = index + length;
        break;
      }

      if (bestEnd === -1) return null;
      parts.push({ start: index, end: bestEnd });
      index = bestEnd;
    }

    if (parts.length < 2) return null;
    return parts.map((part) => token.slice(part.start, part.end)).join(' ');
  }

  _shouldSkipConPTYDecompression(line = '') {
    if (!line) return false;
    if (/[{}\[\]]/.test(line)) return true;
    if (/^[A-Z_]+=/.test(line)) return true;
    if (/^\s*\w+\s*:\s*[{[]/.test(line)) return true;
    if (/^\s*[-Ã¢â‚¬Â¢]/.test(line) && /\/api\//.test(line)) return true;
    if (/https?:\/\//.test(line)) return true;
    if (/PROMPT-CONTROL-REPORT/.test(line)) return true;
    if (/^(?:~[\\/]|[A-Za-z]:[\\/])/.test(line)) return true;
    return false;
  }

  _restoreFragmentedChatSequence(sequence = '') {
    const raw = String(sequence ?? '').trim();
    if (!raw.includes(' ')) return raw;

    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return raw;
    if (!parts.every((part) => /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}$/u.test(part))) return raw;

    const singleCharCount = parts.filter((part) => part.length === 1).length;
    if (singleCharCount === 0) return raw;
    if (singleCharCount === 1 && parts.length !== 2) return raw;

    const knownParts = parts.filter((part) => COMPRESSED_CHAT_WORD_SET.has(normalizeCompressedChatWord(part))).length;
    if (knownParts === parts.length) return raw;

    const merged = parts.join('');
    const normalizedMerged = normalizeCompressedChatWord(merged);
    if (COMPRESSED_CHAT_WORD_SET.has(normalizedMerged)) return merged;

    if (merged.length < 5) {
      return raw;
    }

    const restored = merged.length >= 7 ? this._restoreCompressedChatToken(merged) : merged;
    if (restored !== merged) return restored;
    return raw;
  }

  _decompressConPTYSpaces(text) {
    if (!text) return text;
    return text.split('\n').map((line) => {
      if (this._shouldSkipConPTYDecompression(line)) return line;
      return line
        .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1}\s+(?:[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\s+){1,4}[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\b/gu, (sequence) => this._restoreFragmentedChatSequence(sequence))
        .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1}(?:\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}){0,2}\b/gu, (sequence) => this._restoreFragmentedChatSequence(sequence))
        .replace(/([.!?])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
        .replace(/([,;])([a-zA-Z\u00C0-\u00F6])/gu, '$1 $2')
        .replace(/([):])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
        .replace(/([a-z\u00E0-\u00F6])-(Agent-[A-Z]\b)/gu, '$1 $2')
        .replace(/\bA gent(?=-[A-Z]\b)/gu, 'Agent')
        .replace(/([a-z\u00E0-\u00F6])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
        .replace(/([A-Za-z\u00C0-\u00FF]{5,})(l['’][A-Za-z\u00C0-\u00FF]{3,})/gu, '$1 $2')
        .replace(/\b([a-zA-Z\u00C0-\u00F6]+(?:['â€™](?:s|re|ve|ll|d|m)|n['â€™]t))(?=[a-zA-Z\u00C0-\u00F6])/gu, '$1 ')
        .replace(/\b([a-zA-Z\u00C0-\u00F6]+['â€™])([a-zA-Z\u00C0-\u00F6]{7,})/gu, (_, prefix, suffix) => `${prefix}${this._restoreCompressedChatToken(suffix)}`)
        .replace(RESTORABLE_CHAT_TOKEN_MATCH_RE, (token) => this._restoreCompressedChatToken(token))
        .replace(/\s{2,}/g, ' ')
        .trimEnd();
    }).join('\n');
  }

  _restoreCompressedChatToken(token = '') {
    if (!token || !RESTORABLE_CHAT_TOKEN_RE.test(token)) return token;

    const normalizedToken = normalizeCompressedChatWord(token);
    if (COMPRESSED_CHAT_WORD_SET.has(normalizedToken)) return token;
    const states = new Array(normalizedToken.length + 1).fill(null);
    states[0] = { score: 0, matchedChars: 0, matchedWords: 0, parts: [] };

    const pickBetterState = (candidate, current) => {
      if (!candidate) return current;
      if (!current) return candidate;
      if (candidate.score !== current.score) return candidate.score > current.score ? candidate : current;
      if (candidate.matchedChars !== current.matchedChars) {
        return candidate.matchedChars > current.matchedChars ? candidate : current;
      }
      if (candidate.matchedWords !== current.matchedWords) {
        return candidate.matchedWords > current.matchedWords ? candidate : current;
      }
      return candidate.parts.length < current.parts.length ? candidate : current;
    };

    for (let index = 0; index < normalizedToken.length; index += 1) {
      const current = states[index];
      if (!current) continue;

      const unmatchedState = {
        score: current.score - 3,
        matchedChars: current.matchedChars,
        matchedWords: current.matchedWords,
        parts: [...current.parts, { start: index, end: index + 1, matched: false }],
      };
      states[index + 1] = pickBetterState(unmatchedState, states[index + 1]);

      for (let length = 1; length <= COMPRESSED_CHAT_MAX_WORD_LEN && index + length <= normalizedToken.length; length += 1) {
        const slice = normalizedToken.slice(index, index + length);
        if (!COMPRESSED_CHAT_WORD_SET.has(slice)) continue;
        const matchState = {
          score: current.score + (length * 2) - (length === 1 ? 2 : 0),
          matchedChars: current.matchedChars + length,
          matchedWords: current.matchedWords + 1,
          parts: [...current.parts, { start: index, end: index + length, matched: true }],
        };
        states[index + length] = pickBetterState(matchState, states[index + length]);
      }
    }

    const result = states[normalizedToken.length];
    if (!result) return this._restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;

    const coverage = result.matchedChars / token.length;
    const minimumScore = token.length * 0.35;
    if (result.matchedWords < 2 || coverage < 0.6 || result.score <= minimumScore) {
      return this._restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;
    }

    const matchedParts = result.parts.filter((part) => part.matched);
    const singleCharMatches = matchedParts.filter((part) => (part.end - part.start) === 1).length;
    const tinyMatches = matchedParts.filter((part) => (part.end - part.start) <= 2).length;
    if (singleCharMatches > 1 || tinyMatches > 3) {
      return this._restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;
    }

    const mergedParts = [];
    for (const part of result.parts) {
      const previous = mergedParts.at(-1);
      if (previous && !previous.matched && !part.matched && previous.end === part.start) {
        previous.end = part.end;
      } else {
        mergedParts.push({ ...part });
      }
    }

    return mergedParts
      .map((part) => token.slice(part.start, part.end))
      .join(' ');
  }

  _restoreCompressedChatTokenGreedy(token = '', normalizedToken = normalizeCompressedChatWord(token)) {
    if (!token || !RESTORABLE_CHAT_TOKEN_RE.test(token)) return null;

    const parts = [];
    let index = 0;

    while (index < normalizedToken.length) {
      let bestEnd = -1;

      for (
        let length = Math.min(COMPRESSED_CHAT_MAX_WORD_LEN, normalizedToken.length - index);
        length >= 1;
        length -= 1
      ) {
        const slice = normalizedToken.slice(index, index + length);
        if (!COMPRESSED_CHAT_WORD_SET.has(slice)) continue;
        bestEnd = index + length;
        break;
      }

      if (bestEnd === -1) return null;
      parts.push({ start: index, end: bestEnd });
      index = bestEnd;
    }

    if (parts.length < 2) return null;
    return parts.map((part) => token.slice(part.start, part.end)).join(' ');
  }

  _detectPatternBlocker(rawChunk = '', provider = null) {
    const normalized = this._normalizeParserChunk(rawChunk).toLowerCase();
    if (!normalized.trim()) return null;
    const recentNormalized = normalized.slice(-500);

    if (provider === RUNTIME_PROVIDER.GEMINI) {
      const hasFunctionCallMismatch =
        recentNormalized.includes('number of function response parts is equal to the number of function call parts')
        || recentNormalized.includes('function call parts of the function call turn');
      const hasAutoRetrySignal = recentNormalized.includes('retrying automatically');

      if (hasFunctionCallMismatch && !hasAutoRetrySignal) {
        return {
          type: 'provider_unavailable',
          provider: RUNTIME_PROVIDER.GEMINI,
          message: 'Gemini corrupted the current tool/function turn and cannot safely continue in this session.',
          detectedAt: new Date().toISOString(),
        };
      }

      // Ignore transient Gemini request failures that self-recover during
      // Thinking/streaming. Only suppress if the signal appears in the recent tail,
      // not in old scrolled output.
      if ((recentNormalized.includes('this request failed')
        || recentNormalized.includes('invalid_argument')
        || recentNormalized.includes('badrequest'))
        && !recentNormalized.includes('usage limit')
        && hasAutoRetrySignal) {
        return null;
      }

      const hasUsageLimitSignal =
        recentNormalized.includes('usage limit reached')
        || recentNormalized.includes('usage limit for')
        || recentNormalized.includes('/model to switch')
        || recentNormalized.includes('keep trying');
      const hasHardUsageLimitSignal =
        recentNormalized.includes('you have exhausted your capacity on this model')
        || recentNormalized.includes('usage limit reached for all pro models')
        || recentNormalized.includes('access resets at');
      const hasPromptReadySignal = this._isRuntimePromptReady(recentNormalized, provider);
      const hasStaleAuthBanner =
        recentNormalized.includes('waiting for authentication')
        || recentNormalized.includes('press esc or ctrl+c to cancel');
      const hasAuthFailureSignal =
        recentNormalized.includes('not authenticated')
        || recentNormalized.includes('please sign in')
        || recentNormalized.includes('login required')
        || recentNormalized.includes('gemini_api_key')
        || recentNormalized.includes('authentication failed')
        || recentNormalized.includes('api key');
      const hasAnyUsageSignal = hasUsageLimitSignal || hasHardUsageLimitSignal;

      if (hasUsageLimitSignal && !hasHardUsageLimitSignal) {
        return null;
      }

      if (hasPromptReadySignal && hasStaleAuthBanner && hasAnyUsageSignal) {
        return null;
      }
    }

    const match = RUNTIME_BLOCKER_PATTERNS.find(
      (candidate) => candidate.provider === provider && candidate.matches(normalized)
    );
    if (!match) return null;

    return {
      type: match.type,
      provider: match.provider,
      message: match.message,
      detectedAt: new Date().toISOString(),
    };
  }

  _isRuntimePromptReady(rawChunk = '', provider = null) {
    const normalized = this._normalizeParserChunk(rawChunk).toLowerCase();
    if (!normalized.trim()) return false;

    if (provider === RUNTIME_PROVIDER.CLAUDE) {
      return normalized.includes('bypass permissions on')
        || normalized.includes('ctrl+g to edit in notepad')
        || normalized.includes('/buddy');
    }

    if (provider === RUNTIME_PROVIDER.CODEX) {
      return normalized.includes('workspace-write')
        || normalized.includes('approval')
        || normalized.includes('model')
        || normalized.includes('esc to interrupt');
    }

    if (provider === RUNTIME_PROVIDER.GEMINI) {
      // Ignore prompt-ready signals while Gemini is still authenticating or
      // showing the startup banner — TUI box borders contain '>' characters
      // that cause false positives.
      if (normalized.includes('waiting for authentication')
        || normalized.includes('press esc or ctrl+c to cancel')
        || normalized.includes('geminicli-updates')
        || normalized.includes('making changes to gemini cli')) {
        return false;
      }
      return normalized.includes('type your message')
        || normalized.includes('? for shortcuts')
        || normalized.includes('apply this change?')
        || normalized.includes('allow once')
        || /^\s*>\s+$/.test(normalized)
        || /\n\s*>\s+/.test(normalized);
    }

    return false;
  }

  _detectRuntimeBlocker(rawChunk = '', provider = null, state = null) {
    // Intervention detection often fails on split PTY packets.
    // Use a small stateful buffer (Task #172)
    if (state) {
      state.interventionBuffer = ((state.interventionBuffer ?? '') + rawChunk).slice(-2048);
      rawChunk = state.interventionBuffer;
    }

    const normalized = this._normalizeParserChunk(rawChunk).toLowerCase();
    if (!normalized.trim()) return null;

    // Check universal pattern-based blockers first (rate limits, auth failures) —
    // these apply to ALL providers including Claude.
    // EXCEPTION: for Gemini, skip pattern blockers if the usage-limit interactive menu
    // is detected, because the menu should be handled as an intervention, not a hard blocker.
    // However, if the menu is NOT detected (buffer too short, banner too long), fall back
    // to the pattern blocker so quota exhaustion is never silently swallowed.
    let geminiUsageLimitSkipped = false;
    if (provider === RUNTIME_PROVIDER.GEMINI && normalized.includes('usage limit reached')) {
      // Defer pattern blocker — try menu detection first, fall back below if menu not found
      geminiUsageLimitSkipped = true;
    } else {
      const patternBlocker = this._detectPatternBlocker(rawChunk, provider);
      if (patternBlocker) return patternBlocker;
    }

    // Interactive menu detection only applies to Codex and Gemini TUIs.
    if (provider !== RUNTIME_PROVIDER.CODEX && provider !== RUNTIME_PROVIDER.GEMINI) return null;
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    const hasHardUsageLimit =
      normalized.includes("you've hit your usage limit")
      || normalized.includes('purchase more credits')
      || normalized.includes('try again at');

    if (
      compact.includes('choosehowyoudlikecodextoproceed')
      && compact.includes('trynewmodel')
      && compact.includes('useexistingmodel')
    ) {
      if (state) state.interventionBuffer = '';
      return {
        type: 'model_selection_menu',
        provider: RUNTIME_PROVIDER.CODEX,
      };
    }

    if (
      !hasHardUsageLimit
      && (
      compact.includes('approachingratelimits')
      && compact.includes('keepcurrentmodel')
      && (compact.includes('switchtogpt') || compact.includes('codexmini'))
      )
    ) {
      if (state) state.interventionBuffer = '';
      return {
        type: 'rate_limit_menu_keep_current_model',
        provider: RUNTIME_PROVIDER.CODEX,
      };
    }

    // Gemini rate-limit / usage-limit interactive menu — auto-switch to a smaller model
    if (provider === RUNTIME_PROVIDER.GEMINI) {
      if (
        (normalized.includes('usage limit reached') || normalized.includes('usage limit for'))
        && (compact.includes('keeptrying') || normalized.includes('keep trying')
          || compact.includes('1keeptrying') || normalized.includes('1. keep trying')
          || (normalized.includes('/model') && normalized.includes('stop')))
      ) {
        if (state) state.interventionBuffer = '';
        return {
          type: 'gemini_usage_limit_menu',
          provider: RUNTIME_PROVIDER.GEMINI,
        };
      }
    }

    if (provider === RUNTIME_PROVIDER.GEMINI || provider === RUNTIME_PROVIDER.CODEX) {
      if (
        compact.includes('doyoutrustthefollowingfolders')
        || compact.includes('trustingafolderallows')
      ) {
        if (state) state.interventionBuffer = '';
        return {
          type: 'gemini_trust_menu',
          provider: provider,
        };
      }

      // Detection for "Permission menu" on Gemini/Codex (Allow once / Allow for this session)
      if (
        (compact.includes('allowonce') && compact.includes('allowforthissession'))
        || (normalized.includes('1. allow once') && normalized.includes('2. allow for this session'))
        || (normalized.includes('apply this change?') && compact.includes('1allowonce'))
      ) {
        if (state) state.interventionBuffer = '';
        return {
          type: 'permission_menu_allow_once',
          provider: provider,
        };
      }
    }

    // Fallback: if Gemini "usage limit reached" was detected but the interactive menu
    // was NOT found in the buffer (banner too long, buffer split), fall back to the
    // pattern blocker so quota exhaustion is never silently swallowed as "running".
    if (geminiUsageLimitSkipped) {
      const patternBlocker = this._detectPatternBlocker(rawChunk, provider);
      if (patternBlocker) return patternBlocker;
    }

    return null;
  }

  _applyRuntimePromptIntervention(sessionId, state, intervention) {
    if (!sessionId || !state || !intervention) return false;

    // Gemini usage-limit menu: cancel the current request with Esc so the CLI
    // returns to a prompt, then switch to a flash model via /model set.
    // Gemini Ink TUI uses SelectInput — Esc is the most reliable way we found
    // to "stop" the in-flight request without choosing "Keep trying".
    if (intervention.type === 'gemini_usage_limit_menu') {
      const now = Date.now();
      const lastHandled = state.geminiUsageLimitHandledAt ?? 0;
      // Debounce: don't re-handle within 8s (Gemini needs time to process)
      if (state.geminiUsageLimitHandled && (now - lastHandled < 8000)) return false;

      state.geminiUsageLimitHandled = true;
      state.geminiUsageLimitHandledAt = now;
      const fallbackCount = state.geminiModelFallbackCount ?? 0;
      state.geminiModelFallbackCount = fallbackCount + 1;

      const targetModel = SUPPORTED_GEMINI_FALLBACK_MODELS[fallbackCount] ?? null;

      if (targetModel) {
        state.pendingGeminiModelSwitch = targetModel;
        state.pendingGeminiModelSwitchAt = now;
      } else {
        state.pendingGeminiModelSwitch = null;
        state.pendingGeminiModelSwitchAt = 0;
      }

      // Step 1: Cancel the current request so Gemini returns to a writable prompt.
      console.log(`[SwarmEngine] Gemini usage limit (attempt ${fallbackCount + 1}) — dismissing menu for session ${sessionId}`);
      this._sessionManager.writeInput(sessionId, '\u001b');

      if (targetModel) {
        console.log(`[SwarmEngine] Queued Gemini model fallback to ${targetModel} once prompt is ready`);
      }

      state.interventionBuffer = '';

      return true;
    }

    if (
      intervention.type === 'model_selection_menu'
      || intervention.type === 'rate_limit_menu_keep_current_model'
      || intervention.type === 'gemini_trust_menu'
      || intervention.type === 'permission_menu_allow_once'
    ) {
      let handledKey = 'rateLimitMenuHandled';
      if (intervention.type === 'model_selection_menu') handledKey = 'modelSelectionMenuHandled';
      if (intervention.type === 'gemini_trust_menu') handledKey = 'geminiTrustMenuHandled';
      if (intervention.type === 'permission_menu_allow_once') handledKey = 'permissionMenuHandled';

      const now = Date.now();
      const lastHandled = state[`${handledKey}At`] ?? 0;
      // Allow retrying if the menu persists for more than 2 seconds (Task #173)
      if (state[handledKey] && (now - lastHandled < 2000)) return false;
      
      state[handledKey] = true;
      state[`${handledKey}At`] = now;

      if (intervention.type === 'permission_menu_allow_once') {
        // Robust approval sequence
        this._sessionManager.writeInput(sessionId, '1\r\n');
        setTimeout(() => this._sessionManager.writeInput(sessionId, '\r'), 100);
        return true;
      }

      if (intervention.type === 'gemini_trust_menu') {
        this._sessionManager.writeInput(sessionId, '\r');
      } else {
        // Prefer staying on the configured model when Codex renders an
        // interactive model-choice menu so Swarm can continue without silently
        // accepting a provider-driven model change.
        this._sessionManager.writeInput(sessionId, '\x1b[B');
        setTimeout(() => {
          this._sessionManager.writeInput(sessionId, '\r');
        }, SWARM_RUNTIME_MENU_SUBMIT_DELAY_MS);
      }

      return true;
    }

    return false;
  }

  _flushSwarmPrompt(sessionId, state = null) {
    const prompt = state?.pendingPrompt ?? null;
    if (!sessionId || !prompt) return;
    const promptOptions = state?.pendingPromptOptions ?? {};
    const skipParserEchoGate = promptOptions.skipParserEchoGate === true;

    if (state) {
      if (state.promptReadyTimer) {
        clearTimeout(state.promptReadyTimer);
        state.promptReadyTimer = null;
      }
      // Clear any previous echo-marker timeout before setting a new one
      if (state.echoMarkerTimer) {
        clearTimeout(state.echoMarkerTimer);
        state.echoMarkerTimer = null;
      }
      state.pendingPrompt = null;
      state.pendingPromptOptions = null;
      if (state.runtimeSession) {
        state.promptReady = false;
      }
      state.ignoreParserUntil = skipParserEchoGate ? null : SWARM_PROMPT_ECHO_MARKER;
      state.ignoreParserBuffer = '';

      if (!skipParserEchoGate) {
        // Fallback: if the echo marker is never observed (e.g. Claude's
        // interactive CLI does not echo pasted text), clear the gate after
        // a timeout so the parser can resume detecting __DONE__ / __HANDOFF__.
        state.echoMarkerTimer = setTimeout(() => {
          if (state.ignoreParserUntil) {
            state.ignoreParserUntil = null;
            // On Windows, ConPTY often does NOT echo the marker text at all (the
            // Claude Code CLI handles input internally). The gate buffer therefore
            // contains BOTH the CLI banner/prompt echo AND Claude's real response.
            // Instead of discarding everything, try to extract real output:
            //
            // 1. Fuzzy marker scan — if found, keep only post-marker text
            // 2. Otherwise, feed the ENTIRE buffer through ChatExtractor's filtering
            //    pipeline (NOISE_PATTERNS, STRONG_PROMPT_INDICATORS, _isPromptEcho)
            //    which will strip prompt echo and keep real output.
            const fuzzyMarker = /-+\s*E\s*N\s*D\s+S\s*W\s*A\s*R\s*M\s+I\s*N\s*P\s*U\s*T\s*-+/i;
            const buf = state.ignoreParserBuffer || '';
            const fuzzyMatch = buf ? fuzzyMarker.exec(buf) : null;
            const contentToFeed = fuzzyMatch
              ? buf.slice(fuzzyMatch.index + fuzzyMatch[0].length)
              : buf;
            state.ignoreParserBuffer = '';

            if (state.sessionId && contentToFeed.trim()) {
              for (const ex of this._executions.values()) {
                for (const [nId, s] of ex.agentStates.entries()) {
                  if (s === state) {
                    // Pre-filter the gate buffer to remove prompt echo lines
                    // before feeding to ChatExtractor. This prevents a single
                    // protocol line from causing the ENTIRE message to be discarded.
                    const preFiltered = this._stripSnippetProtocolArtifacts(contentToFeed);
                    this._chatExtractor.resetBuffer(nId);
                    // Split into paragraphs so prompt echo sections get filtered
                    // independently from real output sections.
                    const paragraphs = preFiltered.split(/\n{2,}/);
                    for (const para of paragraphs) {
                      if (para.trim()) {
                        this._chatExtractor.feed(ex.id, nId, para + '\n\n');
                      }
                    }
                    // Also update snippet buffer (use original for snippet — it
                    // has its own filtering via _buildSemanticSnippet)
                    s._snippetSourceBuffer = ((s._snippetSourceBuffer ?? '') + contentToFeed).slice(-120000);
                    s.lastOutputSnippet = this._buildSemanticSnippet(s._snippetSourceBuffer);
                    this._broadcastAgentStatus(ex.id, nId, s);
                    break;
                  }
                }
              }
            }
          }
          state.echoMarkerTimer = null;
        }, SWARM_ECHO_MARKER_TIMEOUT_MS);
        if (state.echoMarkerTimer.unref) {
          state.echoMarkerTimer.unref();
        }
      }
    }

    // Gemini CLI (Ink/React TUI) treats \n as multi-line input — NOT as submit.
    // Write the prompt as a single line (no \n), submit with delayed \r, then
    // write the echo marker separately after submission.
    if (state?.provider === RUNTIME_PROVIDER.GEMINI) {
      // Flatten prompt into a single line to avoid Ink TUI multi-line editor trap.
      // We also trim and remove carriage returns explicitly.
      const flatPrompt = prompt.replace(/[\r\n]+/g, ' ').trim();
      this._sessionManager.writeInput(sessionId, flatPrompt);

      if (state) {
        state.promptSubmissionCount = (state.promptSubmissionCount ?? 0) + 1;
      }

      // Submit the prompt text with multiple terminators to ensure Ink registers it
      setTimeout(() => {
        // Redundant sequence: \r\n followed by a delayed \r and \n to ensure submission
        this._sessionManager.writeInput(sessionId, '\r\n');
        setTimeout(() => {
          this._sessionManager.writeInput(sessionId, '\r');
          // Third fallback: \n if \r fails to trigger the TUI editor submit
          setTimeout(() => {
            this._sessionManager.writeInput(sessionId, '\n');
            // Final flush
            setTimeout(() => {
              this._sessionManager.writeInput(sessionId, '\r');
            }, 50);
          }, 100);
        }, 100);
      }, SWARM_GEMINI_SUBMIT_DELAY_MS);

      if (!skipParserEchoGate) {
        // Write the echo marker as a separate submission after the prompt is sent
        setTimeout(() => {
          this._sessionManager.writeInput(sessionId, SWARM_PROMPT_ECHO_MARKER);
          setTimeout(() => {
            this._sessionManager.writeInput(sessionId, '\r\n');
            setTimeout(() => {
              this._sessionManager.writeInput(sessionId, '\r');
            }, 100);
          }, SWARM_GEMINI_SUBMIT_DELAY_MS);
        }, SWARM_GEMINI_SUBMIT_DELAY_MS + SWARM_GEMINI_ECHO_DELAY_MS);
      }

      return;
    }

    const payload = skipParserEchoGate ? prompt : `${prompt}\n${SWARM_PROMPT_ECHO_MARKER}`;
    const writePayload = () => {
      if (state?.runtimeSession) {
        const shouldInterruptFirst =
          state?.provider === RUNTIME_PROVIDER.CODEX
          && (state?.promptSubmissionCount ?? 0) > 0
          && promptOptions.interruptActiveCodex !== false;
        const lines = payload.split('\n');
        const baseDelay = shouldInterruptFirst ? SWARM_PROMPT_INTERRUPT_DELAY_MS : 0;

        if (shouldInterruptFirst) {
          this._sessionManager.writeInput(sessionId, '\x1b');
        }

        lines.forEach((line, index) => {
          setTimeout(() => {
            this._sessionManager.writeInput(sessionId, `${line}\n`);
          }, baseDelay + (index * SWARM_PROMPT_LINE_INTERVAL_MS));
        });
        return baseDelay + (lines.length * SWARM_PROMPT_LINE_INTERVAL_MS);
      }

      this._sessionManager.writeInput(sessionId, payload);
      return 0;
    };

    const submitAfterMs = writePayload();
    if (state) {
      state.promptSubmissionCount = (state.promptSubmissionCount ?? 0) + 1;
    }

    // Claude/Codex treat large multi-line writes as a paste operation. Submit on
    // the next tick so the interactive CLI executes the pasted swarm prompt.
    setTimeout(() => {
      this._sessionManager.writeInput(sessionId, '\r');
    }, submitAfterMs + SWARM_PROMPT_SUBMIT_DELAY_MS);
  }

  _writeSwarmPrompt(sessionId, prompt, state = null, options = {}) {
    if (!sessionId || !prompt) return;

    if (!state) {
      this._flushSwarmPrompt(sessionId, {
        pendingPrompt: prompt,
        pendingPromptOptions: options,
      });
      return;
    }

    state.pendingPrompt = prompt;
    state.pendingPromptOptions = options;

    if (state.promptReady) {
      this._flushSwarmPrompt(sessionId, state);
      return;
    }

    if (!state.promptReadyTimer) {
      state.promptReadyTimer = setTimeout(() => {
        state.promptReady = true;
        state.promptReadyTimer = null;
        this._flushSwarmPrompt(sessionId, state);
      }, SWARM_PROMPT_READY_FALLBACK_MS);
    }
  }

  sendBroadcast(executionId, nodeId, text, { mode = 'soft' } = {}) {
    const execution = this._executions.get(executionId);
    const state = execution?.agentStates.get(nodeId);
    const sessionId = state?.sessionId ?? null;
    const prompt = String(text ?? '').trim();

    if (!execution || !state || state.status !== 'running' || !sessionId || !prompt) {
      return { sent: false, delivery: 'skipped' };
    }

    if (state.provider === RUNTIME_PROVIDER.GEMINI) {
      if (state.runtimeSession && !state.promptReady) {
        state.pendingOperatorPrompt = prompt;
        state.pendingOperatorPromptMode = mode;
        state.pendingOperatorPromptQueuedAt = Date.now();
        return { sent: true, delivery: 'queued' };
      }

      this._writeSwarmPrompt(sessionId, prompt, state);
      return { sent: true, delivery: 'injected' };
    }

    if (mode === 'hard') {
      this._sessionManager.writeInput(sessionId, '\x03');
      setTimeout(() => {
        this._sessionManager.writeInput(sessionId, `${prompt}\x1b`);
        setTimeout(() => {
          this._sessionManager.writeInput(sessionId, '\n');
        }, 100);
      }, 300);
      return { sent: true, delivery: 'interrupted' };
    }

    this._sessionManager.writeInput(sessionId, `${prompt}\x1b\n`);
    return { sent: true, delivery: 'injected' };
  }

  /**
   * Emit a user-originated chat message (e.g. from broadcast bar).
   */
  emitUserChatMessage(executionId, nodeId, text) {
    this._broadcastChatMessage({
      executionId,
      nodeId,
      role: 'user',
      text,
      timestamp: Date.now(),
    });
  }

  _shouldFallback(execution, blocker, state) {
    if (!execution || !blocker || !state) return false;
    if (execution.providerStrategy?.mode !== RUNTIME_PROVIDER.AUTO) return false;
    if (!execution.providerStrategy?.allowFallback) return false;
    // Stream-json Claude turns are process-per-turn rather than long-lived PTY
    // sessions. If Claude returns a terminal error result, falling across to a
    // different runtime mid-turn is not execution-coherent yet; block truthfully
    // instead of spawning a contaminated replacement session.
    if (state.spawnMode === 'stream-json') return false;

    const currentProvider = state.provider;
    const blockerProvider = blocker.provider;

    if (currentProvider !== blockerProvider) return false;

    if (currentProvider === RUNTIME_PROVIDER.CLAUDE) {
      return blocker.type === 'rate_limited' || blocker.type === 'provider_unavailable';
    }
    if (currentProvider === RUNTIME_PROVIDER.CODEX) {
      return blocker.type === 'rate_limited' || blocker.type === 'provider_unavailable' || blocker.type === 'trust_required' || blocker.type === 'prompt_rejected';
    }

    return false;
  }

  async _attemptRuntimeFallback(executionId, nodeId, blocker) {
    const execution = this._executions.get(executionId);
    if (!execution) return false;

    const currentState = execution.agentStates.get(nodeId);
    if (!this._shouldFallback(execution, blocker, currentState)) {
      return false;
    }

    const previousSessionId = currentState?.sessionId ?? null;
    const previousTapFn = currentState?.tapFn ?? null;
    const currentProvider = currentState.provider;
    const codexPromptRetryCounts = execution.codexPromptRetryCounts ?? new Map();

    if (currentProvider === RUNTIME_PROVIDER.CODEX && blocker.type === 'prompt_rejected') {
      const currentRetryCount = codexPromptRetryCounts.get(nodeId) ?? 0;
      if (currentRetryCount < 1) {
        codexPromptRetryCounts.set(nodeId, currentRetryCount + 1);
        execution.codexPromptRetryCounts = codexPromptRetryCounts;
        execution.runtimeBlocker = null;
        const recoverySnippet = this._buildCodexRecoverySnippet(currentState);
        if (currentState) {
          currentState.runtimeBlocker = null;
          currentState.status = 'running';
        }
        this._syncExecutionStatusFromAgents(execution);

        try {
          await this._spawnAgentPty(executionId, nodeId, {
            requestedProvider: RUNTIME_PROVIDER.CODEX,
            replaceCurrentSession: true,
            compactCodexPrompt: true,
            resumeCodexPrompt: true,
            deferCodexInitialPrompt: true,
            recoverySnippet,
            previousSessionId,
            previousTapFn,
          });

          execution.runtimeBlocker = null;
          const latestState = execution.agentStates.get(nodeId);
          if (latestState) {
            latestState.runtimeBlocker = null;
          }

          this._syncExecutionStatusFromAgents(execution);
          this._broadcastExecutionSnapshot(execution);
          return true;
        } catch (error) {
          // Fall through to provider fallback on retry failure.
        }
      }
    }

    let nextProvider;
    if (currentProvider === RUNTIME_PROVIDER.CLAUDE) {
      nextProvider = RUNTIME_PROVIDER.CODEX;
    } else if (currentProvider === RUNTIME_PROVIDER.CODEX) {
      nextProvider = RUNTIME_PROVIDER.GEMINI;
    } else {
      return false;
    }

    try {
      await this._spawnAgentPty(executionId, nodeId, {
        requestedProvider: nextProvider,
        fallbackFrom: currentProvider,
        fallbackReason: blocker.message,
        previousSessionId,
        previousTapFn,
      });

      execution.lastFallback = {
        fromProvider: currentProvider,
        toProvider: nextProvider,
        reason: blocker.message,
        type: blocker.type,
        nodeId,
        detectedAt: blocker.detectedAt ?? new Date().toISOString(),
      };

      if (execution.providerStrategy) {
        execution.providerStrategy.activeProvider = nextProvider;
      }
      execution.runtimeBlocker = null;

      const latestState = execution.agentStates.get(nodeId);
      if (latestState) {
        latestState.runtimeBlocker = null;
      }

      this._syncExecutionStatusFromAgents(execution);
      this._broadcastExecutionSnapshot(execution);
      return true;
    } catch (error) {
      const failure = {
        fromProvider: RUNTIME_PROVIDER.CLAUDE,
        toProvider: RUNTIME_PROVIDER.CODEX,
        reason: error.message,
        type: 'fallback_failed',
        nodeId,
        detectedAt: new Date().toISOString(),
      };
      execution.lastFallback = failure;
      this._broadcastExecutionSnapshot(execution);
      return false;
    }
  }

  async _handleRuntimeBlocker(executionId, nodeId, blocker) {
    const execution = this._executions.get(executionId);
    if (!execution || !blocker) return false;

    const state = execution.agentStates.get(nodeId);
    if (!state) return false;

    const nextBlocker = {
      ...blocker,
      nodeId,
    };

    state.runtimeBlocker = nextBlocker;
    state.status = 'blocked';
    execution.runtimeBlocker = nextBlocker;
    this._broadcastAgentStatus(executionId, nodeId, state);
    this._setExecutionStatus(execution, 'blocked');

    const fallbackApplied = await this._attemptRuntimeFallback(executionId, nodeId, nextBlocker);
    if (!fallbackApplied) {
      this._broadcastExecutionSnapshot(execution);
    }

    return fallbackApplied;
  }

  _syncExecutionStatusFromAgents(execution) {
    if (!execution || ['stopping', 'stopped', 'failed', 'completed'].includes(execution.status)) {
      return execution?.status ?? null;
    }

    const agentStates = [...execution.agentStates.values()];
    const hasRuntimeBlocker =
      Boolean(execution.runtimeBlocker)
      || agentStates.some((state) => Boolean(state.runtimeBlocker));
    const hasRunning = agentStates.some((state) => state.status === 'running');
    const hasPaused = agentStates.some((state) => state.status === 'paused');
    const hasBlocked = agentStates.some((state) => state.status === 'blocked');
    const hasFailed = agentStates.some((state) => state.status === 'failed');

    if (hasFailed) {
      this._chatExtractor.cleanup(execution.executionId ?? execution.id);
      this._setExecutionStatus(execution, 'failed');
    } else if (hasBlocked || hasRuntimeBlocker) {
      this._setExecutionStatus(execution, 'blocked');
    } else if (hasRunning) {
      this._setExecutionStatus(execution, 'running');
    } else if (hasPaused) {
      this._setExecutionStatus(execution, 'paused');
    } else if (agentStates.length > 0) {
      // Check for pending flow-control nodes before declaring completed:
      // active delay timers, pending merge convergences, or active loops
      const execId = execution.executionId ?? execution.id;
      const delayKeys = [...this._delayTimers.keys()].filter((k) => k.startsWith(execId + ':'));
      const mergeKeys = [...this._mergeStates.keys()].filter((k) => k.startsWith(execId + ':'));
      const loopKeys = [...this._loopStates.keys()].filter((k) => k.startsWith(execId + ':'));
      const hasPendingFlowControl = delayKeys.length > 0 || mergeKeys.length > 0 || loopKeys.length > 0;

      if (!hasPendingFlowControl) {
        this._chatExtractor.cleanup(execution.executionId ?? execution.id);
        this._setExecutionStatus(execution, 'completed');
        if (execution.heartbeatTimer) {
          clearInterval(execution.heartbeatTimer);
          execution.heartbeatTimer = null;
        }
      }
      // else: keep status as 'running' — flow-control nodes are still active
    }

    return execution.status;
  }

  /**
   * Start a new workflow execution.
   * Implemented in Task #46.2.
   * @param {string} workflowId
   * @param {string} projectId
   * @param {string} projectPath
   * @returns {Promise<object>} execution status
   */
  async startExecution(workflowId, projectId, projectPath, runtimeOptions = {}) {
    // 1. Load workflow definition from store
    const wf = await this._workflowStore.get(workflowId);
    if (!wf) throw new Error('Workflow not found');

    // Apply per-execution runtime model overrides into workflow settings
    if (runtimeOptions.runtimeModels && typeof runtimeOptions.runtimeModels === 'object') {
      validateRuntimeModels(runtimeOptions.runtimeModels);
      wf.settings = wf.settings ?? {};
      wf.settings.runtimeModels = { ...wf.settings.runtimeModels, ...runtimeOptions.runtimeModels };
    }

    const providerStrategy = this._buildRuntimeProviderStrategy(
      wf,
      runtimeOptions.provider ?? runtimeOptions.runtimeProvider
    );

    // 2. Build execution record
    const executionId = uuidv4();
    const execution = {
      executionId,
      workflowId,
      workflowDef: wf,
      projectId,
      projectPath,
      status: 'running',
      startedAt: new Date().toISOString(),
      agentStates: new Map(),
      edgeCounters: new Map(),
      agentInputBarriers: new Map(),
      inboundHandoffs: new Map(),
      workflowContext: this._buildInitialWorkflowContext(wf),
      heartbeatTimer: null,
      inboxItems: [],
      chatMessages: [],
      runtimeBlocker: null,
      providerStrategy,
      runtimeProvider: providerStrategy.activeProvider,
      activeProvider: providerStrategy.activeProvider,
      codexPromptRetryCounts: new Map(),
      lastFallback: null,
    };

    // 3. Store BEFORE spawning (so _spawnAgentPty can look it up)
    this._executions.set(executionId, execution);

    // 3b. Register error handler watchers (Wave 5 — FR-V5-74)
    this._registerErrorWatchers(executionId, execution);

    // 4. Resolve entry nodes. All explicit start nodes begin immediately;
    // otherwise root nodes auto-start together as an implicit parallel entry.
    const startNodes = this._getStartNodes(wf);
    if (startNodes.length === 0) {
      throw new Error(`Workflow ${workflowId} has no startable nodes`);
    }

    // 5. Start each entry node. This supports parallel fan-out workflows where
    // multiple branches intentionally begin at the same time and converge later.
    for (const startNode of startNodes) {
      if (this._isFlowControlNode(startNode)) {
        await this._activateFlowControlNode(executionId, startNode.id);
      } else {
        await this._spawnAgent(executionId, startNode.id, {
          requestedProvider: providerStrategy.mode,
        });
      }
    }

    // 6. Start heartbeat to keep agent PTYs alive
    this._startHeartbeat(executionId);

    this._broadcastExecutionSnapshot(execution);

    return executionId;
  }

  /**
   * Spawn an agent PTY session for a specific node in the workflow.
   * Implemented in Task #46.2.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<void>}
   */
  async _spawnAgentPty(executionId, nodeId, spawnOptions = {}) {
    // [STREAM-JSON-MIGRATION] PTY-only spawn path.
    // Claude stream-json agents use _spawnAgentStreamJson(); this branch keeps
    // the legacy terminal/session-manager contract for Codex, Gemini, and any
    // other non-Claude provider routed through PTY.
    const execution = this._executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const node = execution.workflowDef.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in workflow`);

    // Build handoff targets from outgoing edges
    const handoffTargets = execution.workflowDef.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);

    const requestedProvider = normalizeRuntimeProvider(
      spawnOptions.requestedProvider ?? spawnOptions.provider ?? execution.activeProvider
    );
    const candidateProviders = requestedProvider === RUNTIME_PROVIDER.AUTO
      ? [RUNTIME_PROVIDER.CLAUDE, RUNTIME_PROVIDER.CODEX, RUNTIME_PROVIDER.GEMINI]
      : [requestedProvider];

    const previousState = execution.agentStates.get(nodeId) ?? null;
    const previousSessionId = previousState?.sessionId ?? null;
    const previousTapFn = previousState?.tapFn ?? null;
    const parser = new HandoffParser();
    let lastError = null;

    for (let index = 0; index < candidateProviders.length; index += 1) {
      const provider = candidateProviders[index];
      const isFallbackAttempt = index > 0 || spawnOptions.fallbackFrom != null;
      const shouldCompactCodexPrompt = provider === RUNTIME_PROVIDER.CODEX
        && spawnOptions.compactCodexPrompt !== false;

      try {
        const binaryPath = await this._resolveRuntimeProviderBinary(provider);
        const launchArgs = this._buildRuntimeProviderArgs(provider, execution.workflowDef?.settings?.runtimeModels);

        // Pass the agent's user-defined system prompt via --append-system-prompt
        // so the Claude CLI treats it as a real system-level instruction rather
        // than a user message that can be deprioritized.  This is the primary
        // mechanism for ensuring the agent follows its configured role.
        const agentSystemPromptText = (node.data && node.data.systemPrompt) || '';
        if (provider === RUNTIME_PROVIDER.CLAUDE && agentSystemPromptText.trim()) {
          launchArgs.push('--append-system-prompt', agentSystemPromptText.trim());
        }

        const bootstrapPrompt = (
          (provider === RUNTIME_PROVIDER.CODEX && spawnOptions.resumeCodexPrompt === true)
          || (provider === RUNTIME_PROVIDER.CODEX && shouldCompactCodexPrompt)
        )
          ? ''
          : this._buildRuntimeProviderBootstrapPrompt(provider, {
            fallbackFrom: spawnOptions.fallbackFrom ?? null,
            fallbackReason: spawnOptions.fallbackReason ?? null,
          });
        const systemPrompt = this._buildSystemPrompt(
          node,
          execution.workflowContext,
          handoffTargets,
          provider,
          {
            ...spawnOptions,
            compactCodexPrompt: shouldCompactCodexPrompt,
          }
        );
        const combinedPrompt = [bootstrapPrompt, systemPrompt].filter(Boolean).join('\n\n');
        // Register the full prompt text with ChatExtractor so it can detect
        // and discard messages that are echo/summary of the system prompt.
        this._chatExtractor.registerNodePrompt(nodeId, combinedPrompt);
        const deferCodexInitialPrompt = provider === RUNTIME_PROVIDER.CODEX
          && spawnOptions.deferCodexInitialPrompt !== false;
        const codexInitialPrompt = provider === RUNTIME_PROVIDER.CODEX
          && !deferCodexInitialPrompt
          ? `${combinedPrompt}\n${SWARM_PROMPT_ECHO_MARKER}`
          : null;
        const session = await this._sessionManager.createSession(
          execution.projectId,
          execution.projectPath,
          binaryPath,
          {
            provider,
            args: launchArgs,
            bootstrapPrompt,
            initialPrompt: codexInitialPrompt,
          }
        );
        const sessionId = session.sessionId;

        const state = {
          sessionId,
          tapFn: null,         // set below after tapFn is defined
          status: 'running',
          handoffCount: 0,
          lastOutputSnippet: '',
          provider,
          runtimeProvider: provider,
          runtimeBlocker: null,
          ignoreParserUntil: codexInitialPrompt ? SWARM_PROMPT_ECHO_MARKER : null,
          ignoreParserBuffer: '',
          promptReady: false,
          pendingPrompt: null,
          promptReadyTimer: null,
          promptSubmissionCount: 0,
          runtimeSession: true,
          doneReinjectCount: 0,
          _parser: parser,
          _runtimeScanBuffer: '',
          _snippetSourceBuffer: '',
          modelSelectionMenuHandled: false,
          rateLimitMenuHandled: false,
          echoMarkerTimer: null,
          geminiUsageLimitHandled: false,
          geminiUsageLimitHandledAt: 0,
          geminiModelFallbackCount: 0,
          pendingGeminiModelSwitch: null,
          pendingGeminiModelSwitchAt: 0,
          pendingOperatorPrompt: null,
          pendingOperatorPromptMode: null,
          pendingOperatorPromptQueuedAt: 0,
          doneReminderSent: false,
          doneReminderTimer: null,
          missingHandoffReminderSent: false,
          missingHandoffReminderTimer: null,
          spawnedAt: Date.now(),
          lastRuntimeBusyAt: Date.now(),
          lastForwardProgressAt: Date.now(),
          lastForwardProgressReason: 'spawn',
          lastForwardProgressTokens: this._budgetTracker ? this._budgetTracker.getTotal(execution.executionId) : 0,
          firstMeaningfulOutputAt: null,
          firstParserTokenAt: null,
          firstDownstreamSpawnAt: null,
          noProgressBlocked: false,
          noProgressTimer: null,
          _agentSystemPrompt: (node.data && node.data.systemPrompt) || '',
          _agentFullPrompt: combinedPrompt || '',
        };

        if (codexInitialPrompt) {
          state.promptSubmissionCount = 1;
        }

        execution.activeProvider = provider;
        execution.runtimeProvider = provider;
        execution.providerStrategy = {
          ...execution.providerStrategy,
          activeProvider: provider,
        };
        execution.agentStates.set(nodeId, state);
        this._scheduleNoProgressWatch(executionId, nodeId, state);

        // Register session with BudgetTracker so getTotal(executionId) includes it
        if (this._budgetTracker) {
          this._budgetTracker.registerSession(executionId, sessionId);
        }

        const tapFn = (chunk) => {
          const currentState = execution.agentStates.get(nodeId);
          let processingChunk = chunk;
          let gateBufferFlushed = false;
          if (currentState && !currentState.ignoreParserUntil && currentState.ignoreParserBuffer) {
            // The echo gate timed out — the ignoreParserBuffer contains system
            // prompt echo text from the gate period.  Prepend it for marker
            // detection (__DONE__/__HANDOFF__) but flag it so the echo noise
            // does NOT leak into ChatExtractor or the snippet buffer.
            processingChunk = `${currentState.ignoreParserBuffer}${chunk}`;
            currentState.ignoreParserBuffer = '';
            gateBufferFlushed = true;
          }
          if (currentState) {
            // Accumulate ANSI-stripped output into lastOutputSnippet first,
            // so prompt-ready detection can scan the full rolling buffer.
            const cleanChunk = this._normalizeParserChunk(processingChunk);
            // Keep the raw tail for runtime detection, but derive the
            // user-facing snippet from a semantic sanitization pass.
            currentState._runtimeScanBuffer = ((currentState._runtimeScanBuffer ?? '') + cleanChunk).slice(-RUNTIME_SCAN_BUFFER_CHARS);
            if (!currentState.ignoreParserUntil) {
              // When flushing the gate buffer, only feed the NEW chunk to
              // ChatExtractor — the prepended buffer contains system prompt
              // echo noise that would pollute the chat with protocol text.
              const chatChunk = gateBufferFlushed
                ? this._normalizeParserChunk(chunk)
                : cleanChunk;
              this._chatExtractor.feed(executionId, nodeId, chatChunk);
            } else {
            }
            if (!currentState || currentState.status !== 'running') {
              // Agent is no longer running — still accumulate for runtime detection
              // but do NOT update the public snippet or broadcast, since post-done
              // PTY output (CLI chrome, hooks) would overwrite the clean snippet.
              return;
            }
            // Only update the user-facing snippet AFTER the echo gate has cleared,
            // so echoed system prompt text never appears in the agent card.
            if (!currentState.ignoreParserUntil) {
              // Similarly, skip gate buffer content for snippets.
              const snippetChunk = gateBufferFlushed
                ? this._normalizeParserChunk(chunk)
                : cleanChunk;
              currentState._snippetSourceBuffer = ((currentState._snippetSourceBuffer ?? '') + snippetChunk).slice(-SNIPPET_SCAN_BUFFER_CHARS);
              currentState.lastOutputSnippet = this._buildSemanticSnippet(currentState._snippetSourceBuffer);
              this._broadcastAgentStatus(executionId, nodeId, currentState);
            }
          }
          if (currentState && !currentState.promptReady) {
            // Check both the single chunk AND the accumulated buffer — ConPTY can
            // split prompt-ready indicators (e.g. "bypass permissions on") across
            // multiple onData callbacks, so the single chunk may never contain
            // the full string.  Checking the raw rolling buffer covers this.
            // Gate: skip prompt-ready detection while the echo gate is active —
            // the CLI banner (which contains "bypass permissions on") would falsely
            // trigger promptReady before the agent starts working, causing the
            // done reminder to fire prematurely (BUG-DONE-BARE-1 root cause).
            if (!currentState.ignoreParserUntil
              && (this._isRuntimePromptReady(processingChunk, currentState.provider)
                || this._isRuntimePromptReady(currentState._runtimeScanBuffer, currentState.provider))) {
              currentState.promptReady = true;
            }
          }

          const pendingGeminiChunkText = this._normalizeParserChunk(processingChunk).toLowerCase();
          const pendingGeminiInterventionText = this._normalizeParserChunk(currentState?.interventionBuffer ?? '').toLowerCase();
          const normalizedChunkText = this._normalizeParserChunk(processingChunk).toLowerCase();

          if (currentState?.provider === RUNTIME_PROVIDER.CODEX && normalizedChunkText.includes('working (')) {
            currentState.lastRuntimeBusyAt = Date.now();
            currentState.missingHandoffReminderSent = false;
            if (currentState.missingHandoffReminderTimer) {
              clearTimeout(currentState.missingHandoffReminderTimer);
              currentState.missingHandoffReminderTimer = null;
            }
          }

          const pendingGeminiSwitchReady = currentState
            && currentState.provider === RUNTIME_PROVIDER.GEMINI
            && currentState.pendingGeminiModelSwitch
            && (
              this._isRuntimePromptReady(chunk, currentState.provider)
              || this._isRuntimePromptReady(processingChunk, currentState.provider)
              || this._isRuntimePromptReady(currentState.interventionBuffer ?? '', currentState.provider)
              || pendingGeminiChunkText.includes('request cancelled')
              || pendingGeminiChunkText.includes('ready (')
              || pendingGeminiInterventionText.includes('request cancelled')
              || pendingGeminiInterventionText.includes('ready (')
            );
          if (pendingGeminiSwitchReady) {
            const targetModel = currentState.pendingGeminiModelSwitch;
            currentState.pendingGeminiModelSwitch = null;
            currentState.pendingGeminiModelSwitchAt = 0;
            currentState.lastModelFallback = targetModel;
            currentState.interventionBuffer = '';
            this._markAgentProgress(execution, nodeId, currentState, 'provider_intervention');
            console.log(`[SwarmEngine] Gemini prompt ready again - switching to ${targetModel} via /model set`);
            this._sessionManager.writeInput(sessionId, `/model set ${targetModel}\n`);
            this._broadcastAgentStatus(executionId, nodeId, currentState);
            return;
          }

          if (currentState?.pendingPrompt && currentState.promptReady) {
            this._flushSwarmPrompt(sessionId, currentState);
            return;
          }

          if (
            currentState
            && currentState.provider === RUNTIME_PROVIDER.GEMINI
            && currentState.pendingOperatorPrompt
            && currentState.promptReady
          ) {
            const operatorPrompt = currentState.pendingOperatorPrompt;
            currentState.pendingOperatorPrompt = null;
            currentState.pendingOperatorPromptMode = null;
            currentState.pendingOperatorPromptQueuedAt = 0;
            this._writeSwarmPrompt(sessionId, operatorPrompt, currentState);
            return;
          }

          const interventionInput = currentState?._runtimeScanBuffer ?? currentState?.lastOutputSnippet ?? '';
          const promptIntervention = currentState
            ? this._detectRuntimeBlocker(interventionInput, currentState.provider, currentState)
            : null;
          if (promptIntervention && this._applyRuntimePromptIntervention(sessionId, currentState, promptIntervention)) {
            this._markAgentProgress(execution, nodeId, currentState, 'provider_intervention');
            return;
          }
          if (
            promptIntervention
            && (
              promptIntervention.type === 'gemini_usage_limit_menu'
              || promptIntervention.type === 'model_selection_menu'
              || promptIntervention.type === 'rate_limit_menu_keep_current_model'
              || promptIntervention.type === 'gemini_trust_menu'
              || promptIntervention.type === 'permission_menu_allow_once'
            )
          ) {
            return;
          }

          if (this._budgetTracker) {
            this._budgetTracker.track(sessionId, processingChunk);
            const limit = execution.workflowDef.settings?.budgetTokens || 0;
            if (limit > 0) {
              const result = this._budgetTracker.checkBudget(executionId, limit);
              if (result.exceeded && this._wsBroadcast) {
                this._wsBroadcast(executionId, {
                  type: 'budget_update',
                  estimatedTokensUsed: result.estimatedUsed,
                  limitTokens: limit,
                });
              }
            }
          }

          if (currentState.provider === RUNTIME_PROVIDER.GEMINI && !currentState.firstMeaningfulOutputAt && this._hasMeaningfulGeminiOutput(processingChunk)) {
            this._markAgentProgress(execution, nodeId, currentState, 'meaningful_output');
          }

          let chunkForParser = processingChunk;
          if (currentState?.ignoreParserUntil) {
            const normalized = this._normalizeParserChunk(processingChunk);
            currentState.ignoreParserBuffer = (currentState.ignoreParserBuffer + normalized).slice(-8192);
            // Try exact match first, then fuzzy regex (ConPTY can garble the marker
            // by inserting CUF spaces, stripping dashes, etc.)
            let markerIndex = currentState.ignoreParserBuffer.indexOf(currentState.ignoreParserUntil);
            let markerLength = currentState.ignoreParserUntil.length;
            if (markerIndex === -1) {
              const fuzzyMarker = /-+\s*E\s*N\s*D\s+S\s*W\s*A\s*R\s*M\s+I\s*N\s*P\s*U\s*T\s*-+/i;
              const fuzzyMatch = fuzzyMarker.exec(currentState.ignoreParserBuffer);
              if (fuzzyMatch) {
                markerIndex = fuzzyMatch.index;
                markerLength = fuzzyMatch[0].length;
              }
            }

            if (markerIndex === -1) {
              return;
            }

            const remainder = currentState.ignoreParserBuffer.slice(
              markerIndex + markerLength
            );
            currentState.ignoreParserUntil = null;
            currentState.ignoreParserBuffer = '';
            // Clear the runtime scan buffer so old CLI banner text (e.g.
            // "bypass permissions on") doesn't falsely trigger promptReady
            // once the echo gate opens (BUG-DONE-BARE-1 root cause fix).
            currentState._runtimeScanBuffer = '';
            // Discard any ChatExtractor buffer accumulated during the echo
            // gate period — it contains CLI banner noise that would pollute
            // the first chat message with non-semantic text.
            this._chatExtractor.resetBuffer(nodeId);
            // Cancel the fallback timer — the marker arrived in time
            if (currentState.echoMarkerTimer) {
              clearTimeout(currentState.echoMarkerTimer);
              currentState.echoMarkerTimer = null;
            }

            if (!remainder) {
              return;
            }

            chunkForParser = remainder;
          }

          const runtimeBlocker = this._detectRuntimeBlocker(chunkForParser, currentState.provider, currentState);
          if (runtimeBlocker) {
            void this._handleRuntimeBlocker(executionId, nodeId, runtimeBlocker);
            return;
          }

          const events = parser.feed(chunkForParser);
          if (events.length === 0) {
            const recoveredHandoff = this._recoverBufferedHandoffEvent(execution, nodeId, currentState);
            if (recoveredHandoff) {
              events.push(recoveredHandoff);
            }
          }
          
          // Fuzzy fallback for handoff detection (Task #171)
          // If the parser didn't find a formal __HANDOFF__ token, we check for
          // common natural language patterns emitted by smaller models in TUIs.
          if (events.length === 0 && currentState.provider === RUNTIME_PROVIDER.GEMINI) {
            const cleanText = chunkForParser.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').toLowerCase();
            const handoffMatch = cleanText.match(/handoff[ \s]to[ \s:'"]+([a-z][a-z0-9-]*)/);
            if (handoffMatch) {
              const targetId = handoffMatch[1];
              // Verify target exists in workflow
              const isValidTarget = execution.workflowDef.edges.some(e => e.source === nodeId && e.target === targetId);
              if (isValidTarget) {
                this._markAgentProgress(execution, nodeId, currentState, 'parser_token');
                this._onHandoff(executionId, nodeId, { type: 'handoff', targetId, contextUpdate: {} });
              }
            }
          }

          for (const evt of events) {
            if (evt.type === 'handoff') {
              this._markAgentProgress(execution, nodeId, currentState, 'parser_token');
              this._onHandoff(executionId, nodeId, evt);
            }
            if (evt.type === 'done') {
              this._markAgentProgress(execution, nodeId, currentState, 'parser_token');
              this._onDone(executionId, nodeId);
            }
          }

          if (this._maybeBlockForNoProgress(executionId, nodeId, currentState)) {
            return;
          }

          // Terminal-node done reminder: if this node has no handoff targets,
          // the prompt has already been flushed (promptReady + promptSubmissionCount > 0),
          // and Claude is back at the interactive prompt (prompt-ready detected again),
          // the agent likely finished its work but forgot to emit __DONE__.
          // Schedule a one-shot reminder after a brief debounce.
          if (currentState && currentState.promptReady && !currentState.doneReminderSent
            && currentState.status === 'running' && (currentState.promptSubmissionCount ?? 0) > 0) {
            const nodeHandoffTargets = execution.workflowDef.edges
              .filter((e) => e.source === nodeId)
              .map((e) => e.target);
            if (nodeHandoffTargets.length === 0
              && this._isRuntimePromptReady(currentState._runtimeScanBuffer, currentState.provider)) {
              // Debounce: wait 3s to avoid false triggers during streaming
              if (!currentState.doneReminderTimer) {
                currentState.doneReminderTimer = setTimeout(() => {
                  currentState.doneReminderTimer = null;
                  if (currentState.status !== 'running' || currentState.doneReminderSent) return;
                  currentState.doneReminderSent = true;
                  const reminder = [
                    'You have completed your work but did not emit the required done marker.',
                    'Please output exactly this on a new line now:',
                    '__DONE__',
                  ].join('\n');
                  this._writeSwarmPrompt(sessionId, reminder, currentState);
                }, 3000);
              }
            }
          }

          if (this._shouldSendMissingHandoffReminder(execution, nodeId, currentState)) {
            if (!currentState.missingHandoffReminderTimer && !currentState.missingHandoffReminderSent) {
              currentState.missingHandoffReminderTimer = setTimeout(() => {
                currentState.missingHandoffReminderTimer = null;
                const currentExecution = this._executions.get(executionId);
                const latestState = currentExecution?.agentStates.get(nodeId);
                if (!currentExecution || !latestState) return;
                if (!this._shouldSendMissingHandoffReminder(currentExecution, nodeId, latestState)) return;

                const currentNode = currentExecution.workflowDef.nodes.find((candidate) => candidate.id === nodeId);
                const nodeHandoffTargets = currentExecution.workflowDef.edges
                  .filter((e) => e.source === nodeId)
                  .map((e) => e.target);
                latestState.missingHandoffReminderSent = true;
                this._writeSwarmPrompt(
                  latestState.sessionId,
                  this._buildMissingHandoffReminderPrompt(currentNode, currentExecution.workflowContext, nodeHandoffTargets),
                  latestState,
                  {
                    interruptActiveCodex: false,
                    skipParserEchoGate: true,
                  }
                );
              }, SWARM_MISSING_HANDOFF_REMINDER_DELAY_MS);
            }
          } else if (currentState?.missingHandoffReminderTimer) {
            clearTimeout(currentState.missingHandoffReminderTimer);
            currentState.missingHandoffReminderTimer = null;
          }
        };

        state.tapFn = tapFn;

        // Register tap on swarmListeners (DEC-014)
        const ptySession = this._sessionManager.getSession(sessionId);
        if (ptySession) {
          ptySession.swarmListeners.add(tapFn);
          state.runtimeSession = Object.prototype.hasOwnProperty.call(ptySession, 'pty');
          state.promptReady = !state.runtimeSession;
        }

        // Remove the previous provider session after the replacement is live.
        const shouldReplaceCurrentSession = isFallbackAttempt || spawnOptions.replaceCurrentSession === true;
        if (shouldReplaceCurrentSession && previousSessionId && previousSessionId !== sessionId) {
          if (previousTapFn) {
            const previousSession = this._sessionManager.getSession(previousSessionId);
            previousSession?.swarmListeners?.delete(previousTapFn);
          }
          await this._sessionManager.killSession(previousSessionId);
        }

        if (combinedPrompt && !codexInitialPrompt) {
          this._writeSwarmPrompt(sessionId, combinedPrompt, state);
        }

        if (isFallbackAttempt && previousState?.provider !== provider && this._wsBroadcast) {
          const fallbackFrom = spawnOptions.fallbackFrom ?? candidateProviders[0];
          execution.lastFallback = {
            fromProvider: fallbackFrom,
            toProvider: provider,
            reason: spawnOptions.fallbackReason ?? 'provider_fallback',
            nodeId,
            detectedAt: new Date().toISOString(),
          };
          this._wsBroadcast(executionId, {
            type: 'runtime_provider_switch',
            nodeId,
            fromProvider: fallbackFrom,
            toProvider: provider,
            reason: spawnOptions.fallbackReason ?? 'provider_fallback',
          });
        }

        this._broadcastAgentStatus(executionId, nodeId, state);
        this._syncExecutionStatusFromAgents(execution);
        return;
      } catch (error) {
        lastError = error;

        // Only the auto strategy may fall through to the next candidate.
        if (requestedProvider !== RUNTIME_PROVIDER.AUTO || index === candidateProviders.length - 1) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('Unable to spawn runtime provider');
  }

  // ---------------------------------------------------------------------------
  // FR-SJ-09/10: Provider-aware spawn dispatcher
  // Decides whether to use stream-json (Claude) or PTY (Codex/Gemini) path.
  // ---------------------------------------------------------------------------

  /**
   * Dispatch agent spawn to the appropriate path based on provider.
   * Claude models use stream-json (process-per-turn); Codex/Gemini use PTY.
   * @param {string} executionId
   * @param {string} nodeId
   * @param {object} [spawnOptions={}]
   * @returns {Promise<void>}
   */
  async _spawnAgent(executionId, nodeId, spawnOptions = {}) {
    const execution = this._executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const node = execution.workflowDef.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in workflow`);

    const rawRequestedProvider = String(
      spawnOptions.requestedProvider ?? spawnOptions.provider ?? ''
    ).trim();
    const requestedProvider = normalizeRuntimeProvider(
      rawRequestedProvider || RUNTIME_PROVIDER.AUTO
    );
    let configuredModel = String(
      spawnOptions.requestedModel
      ?? node.data?.model
      ?? execution.workflowDef?.settings?.defaultModel
      ?? ''
    ).trim();

    if (!configuredModel && requestedProvider === RUNTIME_PROVIDER.AUTO && rawRequestedProvider) {
      if (
        isSupportedRuntimeModel(RUNTIME_PROVIDER.CLAUDE, rawRequestedProvider)
        || isSupportedRuntimeModel(RUNTIME_PROVIDER.CODEX, rawRequestedProvider)
        || isSupportedRuntimeModel(RUNTIME_PROVIDER.GEMINI, rawRequestedProvider)
      ) {
        configuredModel = rawRequestedProvider;
      }
    }

    let effectiveProvider = requestedProvider;
    if (effectiveProvider === RUNTIME_PROVIDER.AUTO) {
      if (configuredModel) {
        if (isSupportedRuntimeModel(RUNTIME_PROVIDER.CLAUDE, configuredModel)) {
          effectiveProvider = RUNTIME_PROVIDER.CLAUDE;
        } else if (isSupportedRuntimeModel(RUNTIME_PROVIDER.CODEX, configuredModel)) {
          effectiveProvider = RUNTIME_PROVIDER.CODEX;
        } else if (isSupportedRuntimeModel(RUNTIME_PROVIDER.GEMINI, configuredModel)) {
          effectiveProvider = RUNTIME_PROVIDER.GEMINI;
        }
      }
    }

    // [STREAM-JSON-MIGRATION] No explicit provider override and no
    // model-driven route: consult the execution's provider strategy.
    // When Runtime is "Auto", providerStrategy.activeProvider defaults to
    // 'claude'. If activeProvider is Claude, route to stream-json so that
    // generated workflows (which have no explicit model on nodes) still get
    // the clean structured output path instead of garbled PTY/ConPTY.
    if (effectiveProvider === RUNTIME_PROVIDER.AUTO) {
      const strategyActive = execution.providerStrategy?.activeProvider;
      if (strategyActive === RUNTIME_PROVIDER.CLAUDE) {
        effectiveProvider = RUNTIME_PROVIDER.CLAUDE;
      } else if (strategyActive && strategyActive !== RUNTIME_PROVIDER.AUTO) {
        effectiveProvider = strategyActive;
      } else {
        return this._spawnAgentPty(executionId, nodeId, spawnOptions);
      }
    }

    const nextSpawnOptions = {
      ...spawnOptions,
      requestedProvider: effectiveProvider,
    };

    if (effectiveProvider === RUNTIME_PROVIDER.CLAUDE) {
      if (configuredModel && isSupportedRuntimeModel(RUNTIME_PROVIDER.CLAUDE, configuredModel)) {
        nextSpawnOptions.requestedModel = configuredModel;
      }
      return this._spawnAgentStreamJson(executionId, nodeId, nextSpawnOptions);
    }

    // [STREAM-JSON-MIGRATION] All other providers use the PTY path.
    return this._spawnAgentPty(executionId, nodeId, nextSpawnOptions);
  }

  // ---------------------------------------------------------------------------
  // FR-SJ-04..15: Stream-JSON agent spawner (Claude provider)
  // Spawns claude with --output-format stream-json. One process per turn.
  // Session continuity via --resume. See DEC-027, DEC-028, DEC-029.
  // ---------------------------------------------------------------------------

  /**
   * Spawn a Claude agent using --output-format stream-json instead of PTY.
   * Each turn is a separate child_process.spawn. Conversation continuity
   * is maintained via --session-id (turn 0) / --resume (turn N).
   * @param {string} executionId
   * @param {string} nodeId
   * @param {object} [spawnOptions={}]
   * @returns {Promise<void>}
   */
  async _spawnAgentStreamJson(executionId, nodeId, spawnOptions = {}) {
    const execution = this._executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const node = execution.workflowDef.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in workflow`);

    // 1. Build handoff targets from outgoing edges
    const handoffTargets = execution.workflowDef.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);

    // 2. Resolve binary and model
    const claudeBin = await this._resolveRuntimeProviderBinary(RUNTIME_PROVIDER.CLAUDE);
    const runtimeModels = execution.workflowDef?.settings?.runtimeModels;
    const requestedModel = String(
      spawnOptions.requestedModel
      ?? node.data?.model
      ?? ''
    ).trim();
    const modelOverride = runtimeModels?.[RUNTIME_PROVIDER.CLAUDE];
    const model = (requestedModel && isSupportedRuntimeModel(RUNTIME_PROVIDER.CLAUDE, requestedModel))
      ? requestedModel
      : ((modelOverride && isSupportedRuntimeModel(RUNTIME_PROVIDER.CLAUDE, modelOverride))
        ? modelOverride
        : DEFAULT_SWARM_CLAUDE_MODEL);

    // 3. Get or create session ID and retrieve existing state
    const previousState = execution.agentStates.get(nodeId) ?? null;
    const sessionId = previousState?.streamJsonSessionId ?? uuidv4();
    const turnCount = previousState?.turnCount ?? 0;

    // 4. Build prompt
    const prompt = spawnOptions.reinjectPrompt ?? this._buildSystemPrompt(
      node,
      execution.workflowContext,
      handoffTargets,
      RUNTIME_PROVIDER.CLAUDE,
      {
        inboundHandoffs: this._getInboundHandoffsForTarget
          ? this._getInboundHandoffsForTarget(execution, nodeId)
          : [],
      }
    );

    // 5. Build args array
    const args = [
      '--output-format', 'stream-json',
      '--verbose',                          // Required with stream-json (spike #354)
      '--dangerously-skip-permissions',
    ];

    // Turn 0: --session-id; Turn N: --resume (DEC-027)
    if (turnCount === 0 && !previousState?.streamJsonSessionId) {
      args.push('--session-id', sessionId);
    } else {
      args.push('--resume', sessionId);
    }

    args.push('--model', model);

    // Append --tools if the node defines tool restrictions (SEC-SJ-01: use the modern tools flag)
    const nodeTools = Array.isArray(node.data?.tools)
      ? node.data.tools
      : DEFAULT_SWARM_CLAUDE_TOOLS;
    if (nodeTools.length > 0) {
      args.push('--tools', nodeTools.join(','));
    }

    // FR-SJ-04: -p must come LAST to avoid positional ambiguity
    args.push('-p', prompt);

    // 6. Spawn the process (SEC-02: shell: false always)
    const child = spawn(claudeBin, args, {
      cwd: execution.projectPath || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    // DEC-005: close stdin immediately to prevent hang
    try { child.stdin.end(); } catch { /* already destroyed */ }

    // 7. Initialize/update agent state
    const state = {
      ...(previousState ?? {}),
      streamJsonSessionId: sessionId,
      sessionId: null,           // No PTY session — DEC-028
      spawnMode: 'stream-json',
      status: 'running',
      provider: RUNTIME_PROVIDER.CLAUDE,
      runtimeProvider: RUNTIME_PROVIDER.CLAUDE,
      runtimeBlocker: null,
      turnCount,
      totalCostUsd: previousState?.totalCostUsd ?? 0,
      totalInputTokens: previousState?.totalInputTokens ?? 0,
      totalOutputTokens: previousState?.totalOutputTokens ?? 0,
      doNotSpawnNextTurn: previousState?.doNotSpawnNextTurn ?? false,
      needsRepair: false,
      currentToolUse: null,
      isThinking: false,
      handoffCount: previousState?.handoffCount ?? 0,
      lastOutputSnippet: previousState?.lastOutputSnippet ?? '',
      doneReinjectCount: previousState?.doneReinjectCount ?? 0,
      _streamJsonChild: child,
      _streamJsonAccumulatedText: '',
      _agentSystemPrompt: (node.data && node.data.systemPrompt) || '',
      _agentFullPrompt: prompt || '',
      spawnedAt: previousState?.spawnedAt ?? Date.now(),
      lastForwardProgressAt: Date.now(),
      lastForwardProgressReason: 'spawn',
    };

    execution.activeProvider = RUNTIME_PROVIDER.CLAUDE;
    execution.runtimeProvider = RUNTIME_PROVIDER.CLAUDE;
    execution.agentStates.set(nodeId, state);

    // 8. Broadcast initial status through the canonical status path so the
    // stream-json contract stays aligned with the PTY agent_status shape.
    this._broadcastAgentStatus(executionId, nodeId, state);

    // 9. Set up readline + StreamJsonParser on child.stdout
    const parser = new StreamJsonParser();
    const rl = createInterface({ input: child.stdout });
    let gotResultEvent = false;

    rl.on('line', (line) => {
      if (!line.trim()) return;

      const evt = parser.parseLine(line);
      if (!evt || evt.type === 'ignore') return;

      const currentState = execution.agentStates.get(nodeId);
      if (!currentState || currentState.status === 'done' || currentState.status === 'stopped') return;

      switch (evt.type) {
        case 'text_delta': {
          // Accumulate assistant text
          currentState._streamJsonAccumulatedText += (evt.text ?? '');
          // Update snippet with latest text
          const accText = currentState._streamJsonAccumulatedText;
          currentState.lastOutputSnippet = accText.length > 200
            ? accText.slice(-200)
            : accText;
          // Broadcast chat message
          if (this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'chat_message',
              nodeId,
              role: 'assistant',
              text: evt.text ?? '',
              timestamp: Date.now(),
            });
          }
          // Feed to ChatExtractor for artifact extraction
          this._chatExtractor.feed(executionId, nodeId, evt.text ?? '');
          this._broadcastAgentStatus(executionId, nodeId, currentState);
          break;
        }

        case 'tool_start': {
          currentState.currentToolUse = { toolName: evt.toolName, toolUseId: evt.toolUseId };
          if (this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'agent_tool_use',
              nodeId,
              toolName: evt.toolName,
              toolUseId: evt.toolUseId,
            });
          }
          break;
        }

        case 'tool_delta': {
          if (this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'agent_tool_delta',
              nodeId,
              toolUseId: currentState.currentToolUse?.toolUseId ?? '',
              partialJson: evt.partialJson ?? '',
            });
          }
          break;
        }

        case 'tool_stop': {
          currentState.currentToolUse = null;
          break;
        }

        case 'thinking_start': {
          currentState.isThinking = true;
          if (this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'agent_thinking',
              nodeId,
              active: true,
            });
          }
          break;
        }

        case 'text_start': {
          // End of thinking block → text block starts
          if (currentState.isThinking) {
            currentState.isThinking = false;
            if (this._wsBroadcast) {
              this._wsBroadcast(executionId, {
                type: 'agent_thinking',
                nodeId,
                active: false,
              });
            }
          }
          break;
        }

        case 'thinking_stop': {
          currentState.isThinking = false;
          if (this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'agent_thinking',
              nodeId,
              active: false,
            });
          }
          break;
        }

        case 'api_retry': {
          if (this._wsBroadcast) {
            this._wsBroadcast(executionId, {
              type: 'agent_status',
              nodeId,
              status: 'running',
              spawnMode: currentState.spawnMode ?? 'stream-json',
              provider: currentState.provider ?? RUNTIME_PROVIDER.CLAUDE,
              runtimeProvider: currentState.runtimeProvider ?? currentState.provider ?? RUNTIME_PROVIDER.CLAUDE,
              sessionId: currentState.sessionId ?? null,
              lastOutputSnippet: currentState.lastOutputSnippet ?? '',
              retrying: true,
              attempt: evt.attempt ?? 0,
              delay: evt.delay ?? 0,
            });
          }
          break;
        }

        case 'result': {
          gotResultEvent = true;
          this._handleStreamJsonResult(executionId, nodeId, evt, handoffTargets);
          break;
        }

        case 'error': {
          // Non-fatal parse errors — log and continue
          console.warn(`[SwarmEngine] stream-json parse warning node=${nodeId}: ${evt.message}`);
          break;
        }

        // message_start, message_stop, message_delta, unknown, system — ignored
        default:
          break;
      }
    });

    // 10. Collect stderr for diagnostics (never log full content — SEC-08)
    const stderrChunks = [];
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    // 11. Handle child error event
    child.on('error', (err) => {
      console.error(`[SwarmEngine] stream-json spawn error node=${nodeId}: ${err.message}`);
      const currentState = execution.agentStates.get(nodeId);
      if (currentState && currentState.status === 'running') {
        currentState.status = 'error';
        currentState.runtimeBlocker = {
          type: 'spawn_error',
          message: 'Stream-json process failed to start',
        };
        this._broadcastAgentStatus(executionId, nodeId, currentState);
        this._syncExecutionStatusFromAgents(execution);
      }
    });

    // 12. Handle process exit
    child.on('close', (code) => {
      const currentState = execution.agentStates.get(nodeId);
      if (!currentState) return;

      // Clean up child reference
      this._clearStreamJsonPostResultTimer(currentState);
      currentState._streamJsonChild = null;

      if (gotResultEvent && currentState._pendingStreamJsonStopMode === 'graceful') {
        currentState.doNotSpawnNextTurn = false;
        currentState._pendingStreamJsonStopMode = null;
        currentState._awaitingStreamJsonClose = false;
        currentState.currentToolUse = null;
        currentState.isThinking = false;
        currentState.status = 'paused';
        this._broadcastAgentStatus(executionId, nodeId, currentState);
        this._syncExecutionStatusFromAgents(execution);
        return;
      }

      if (!gotResultEvent && currentState.status === 'running') {
        // Process exited without a result event — mark as error
        const stderrText = stderrChunks.join('').slice(0, 500);
        console.warn(`[SwarmEngine] stream-json exited without result node=${nodeId} code=${code} stderr=${stderrText}`);
        currentState.status = 'error';
        currentState.runtimeBlocker = {
          type: 'unexpected_exit',
          message: `Stream-json process exited with code ${code} without result event`,
        };
        this._broadcastAgentStatus(executionId, nodeId, currentState);
        this._syncExecutionStatusFromAgents(execution);
      }
    });

    // 13. Set 30s safety timeout after result → tree-kill if still alive
    // This is managed inside _handleStreamJsonResult via a deferred timer.

    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Handle a stream-json result event for a Claude agent turn.
   * Extracts cost, scans for handoff/done tokens, manages turn lifecycle.
   * @param {string} executionId
   * @param {string} nodeId
   * @param {object} resultEvt - parsed result event from StreamJsonParser
   * @param {string[]} handoffTargets - outgoing edge target IDs
   */
  _handleStreamJsonResult(executionId, nodeId, resultEvt, handoffTargets) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const state = execution.agentStates.get(nodeId);
    if (!state) return;

    // 1. Increment turn count
    state.turnCount = (state.turnCount ?? 0) + 1;

    // 2. Extract and broadcast cost
    const inputTokens = resultEvt.usage?.input ?? 0;
    const outputTokens = resultEvt.usage?.output ?? 0;
    const costUsd = resultEvt.costUsd ?? 0;
    const durationMs = resultEvt.durationMs ?? 0;

    state.totalInputTokens = (state.totalInputTokens ?? 0) + inputTokens;
    state.totalOutputTokens = (state.totalOutputTokens ?? 0) + outputTokens;
    state.totalCostUsd = (state.totalCostUsd ?? 0) + costUsd;

    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'agent_cost',
        nodeId,
        inputTokens,
        outputTokens,
        costUsd,
        cacheReadTokens: resultEvt.usage?.cacheRead ?? 0,
        cacheWriteTokens: resultEvt.usage?.cacheWrite ?? 0,
        durationMs,
        totalInputTokens: state.totalInputTokens,
        totalOutputTokens: state.totalOutputTokens,
        totalCostUsd: state.totalCostUsd,
      });
    }

    // 3. Store session ID from result for future --resume turns
    if (resultEvt.sessionId) {
      state.streamJsonSessionId = resultEvt.sessionId;
    }

    // 4. Handle error results
    if (resultEvt.isError) {
      console.warn(`[SwarmEngine] stream-json result error node=${nodeId}: ${resultEvt.errorMessage}`);
      state.needsRepair = true;
      state.currentToolUse = null;
      state.isThinking = false;

      const blockerSource = [
        resultEvt.errorMessage ?? '',
        state._streamJsonAccumulatedText ?? '',
      ].filter(Boolean).join('\n');
      const detectedBlocker = this._detectPatternBlocker(
        blockerSource,
        state.provider ?? RUNTIME_PROVIDER.CLAUDE
      ) ?? {
        type: 'provider_unavailable',
        provider: state.provider ?? RUNTIME_PROVIDER.CLAUDE,
        message: String(
          resultEvt.errorMessage
          || 'Claude returned an error result before the swarm agent could continue.'
        ).trim(),
        detectedAt: new Date().toISOString(),
      };

      const blockerSnippet = String(detectedBlocker.message ?? '').trim()
        || this._sanitizeDisplaySnippetText(resultEvt.errorMessage ?? '');
      if (blockerSnippet) {
        state.lastOutputSnippet = blockerSnippet;
      }
      state._snippetSourceBuffer = '';
      state._runtimeScanBuffer = '';

      void this._handleRuntimeBlocker(executionId, nodeId, detectedBlocker);
      state._streamJsonAccumulatedText = '';
      return;
    }

    const gracefulStopPending = state._pendingStreamJsonStopMode === 'graceful' || state.doNotSpawnNextTurn;

    // 5. Scan accumulated text for handoff/done tokens unless a graceful stop
    // was already requested for the current turn.
    if (!gracefulStopPending) {
      const accumulatedText = state._streamJsonAccumulatedText ?? '';
      let foundHandoff = false;
      let foundDone = false;

      // Use HandoffParser for reliable token detection (same patterns as PTY path)
      const tokenParser = new HandoffParser();
      const tokenEvents = tokenParser.feed(accumulatedText);
      for (const evt of tokenEvents) {
        if (evt.type === 'handoff') {
          foundHandoff = true;
          this._onHandoff(executionId, nodeId, evt);
          break; // Only process first handoff
        }
        if (evt.type === 'done') {
          foundDone = true;
        }
      }

      // 6. Route to done/handoff or implicit done
      if (!foundHandoff) {
        if (foundDone) {
          this._onDone(executionId, nodeId);
        } else {
          // No explicit token → implicit __DONE__ (DEC-029)
          this._onDone(executionId, nodeId);
        }
      }
    } else {
      state._awaitingStreamJsonClose = true;
    }

    // 8. Schedule 30s post-result timeout → tree-kill if process hasn't exited
    const child = state._streamJsonChild;
    if (child && child.pid && !child.killed) {
      this._clearStreamJsonPostResultTimer(state);
      state._streamJsonPostResultTimer = setTimeout(() => {
        if (!child.killed && child.pid) {
          console.warn(`[SwarmEngine] stream-json post-result timeout node=${nodeId} — tree-killing pid=${child.pid}`);
          this.stopStreamJsonAgent(executionId, nodeId, 'forced').catch((error) => {
            console.warn(`[SwarmEngine] stream-json forced-stop escalation failed node=${nodeId}: ${error.message}`);
          });
        }
      }, STREAM_JSON_POST_RESULT_TIMEOUT_MS);
      if (state._streamJsonPostResultTimer?.unref) {
        state._streamJsonPostResultTimer.unref();
      }
    }

    // Reset accumulated text for the next turn
    state._streamJsonAccumulatedText = '';
  }

  /**
   * Ensure an agent PTY exists for a node, reusing an active one if available.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<string>} sessionId of the active or newly spawned PTY
   */
  async _ensureAgentPty(executionId, nodeId) {
    // [STREAM-JSON-MIGRATION] PTY session reuse helper.
    // Stream-json agents never enter SessionManager, so their equivalent is a
    // fresh _spawnAgentStreamJson() turn rather than PTY reuse.
    const execution = this._executions.get(executionId);
    if (execution) {
      const existing = execution.agentStates.get(nodeId);
      if (existing && existing.status !== 'done') {
        return existing.sessionId;
      }
    }
    // Pass the execution's provider strategy mode so _spawnAgent can route
    // each node according to its own model configuration.  Using
    // providerStrategy.mode (the workflow-level mode, e.g. 'auto', 'claude',
    // 'codex') instead of execution.activeProvider avoids forcing all handoff
    // targets to the last-used provider — critical for mixed-provider chains
    // where a Claude node hands off to a Codex node.
    const providerHint = execution?.providerStrategy?.mode;
    await this._spawnAgent(executionId, nodeId, providerHint
      ? { requestedProvider: providerHint }
      : {}
    );
    const state = this._executions.get(executionId)?.agentStates.get(nodeId);
    return state?.sessionId;
  }

  /**
   * Build the system prompt for an agent node.
   * Assembles role, workflow context, and handoff targets per OpenAI Swarm pattern.
   * Implemented in Task #46.3.
   * @param {object} node - workflow node definition
   * @param {object} workflowContext - current shared context dict
   * @param {string[]} handoffTargets - list of valid target agent IDs
   * @returns {string} assembled system prompt
   */
  _buildSystemPrompt(node, workflowContext, handoffTargets, provider = null, options = {}) {
    const compactCodexPrompt = options.compactCodexPrompt === true;
    const resumeCodexPrompt = options.resumeCodexPrompt === true;
    const inboundHandoffs = Array.isArray(options.inboundHandoffs) ? options.inboundHandoffs : [];
    const lines = [];

    if (provider === RUNTIME_PROVIDER.CODEX && !compactCodexPrompt) {
      lines.push('You are running inside the Codex interactive CLI.');
      lines.push('Answer directly in terminal text and continue the swarm task without setup chatter.');
      lines.push('');
    }

    if (provider === RUNTIME_PROVIDER.CODEX && compactCodexPrompt) {
      const agentPrompt = this._compactCodexInstructionText((node.data && node.data.systemPrompt) || '', COMPACT_CODEX_AGENT_PROMPT_CHARS);
      const currentTask = this._compactCodexInstructionText(workflowContext.currentTask, COMPACT_CODEX_TASK_CHARS);
      const expectedReport = this._compactCodexInstructionText(
        String(workflowContext.expectedReport ?? '').replace(/[\r\n`]+/g, ' | '),
        COMPACT_CODEX_TASK_CHARS
      );
      const recoverySnippet = this._compactCodexInstructionText(options.recoverySnippet, COMPACT_CODEX_PROGRESS_CHARS);
      const compactInboundHandoffs = inboundHandoffs
        .map((handoff) => {
          const payloadText = this._compactCodexInstructionText(
            JSON.stringify(handoff.payload ?? {}).replace(/[\r\n`]+/g, ' | '),
            180
          );
          return payloadText
            ? `${handoff.sourceLabel || handoff.sourceNodeId}: ${payloadText}`
            : `${handoff.sourceLabel || handoff.sourceNodeId}: {}`;
        })
        .join(' | ');

      if (resumeCodexPrompt) {
        lines.push('Resume the same swarm task from your current progress.');
        if (recoverySnippet) {
          lines.push(`Last progress: ${recoverySnippet}`);
        } else if (currentTask) {
          lines.push(`Current task: ${currentTask}`);
        }
      } else {
        if (agentPrompt) {
          lines.push(agentPrompt);
        }
        if (!agentPrompt && currentTask) {
          lines.push(`Current task: ${currentTask}`);
        }
        if (compactInboundHandoffs) {
          lines.push(`Upstream handoffs: ${compactInboundHandoffs}`);
        }
        if (handoffTargets.length === 0) {
          if (expectedReport) {
            lines.push(`Required final report: ${expectedReport}`);
          } else if (currentTask && agentPrompt) {
            lines.push(`Current task: ${currentTask}`);
          }
        }
      }
      lines.push('');

      if (handoffTargets.length > 0) {
        if (handoffTargets.length === 1) {
          lines.push(`When your work is complete, hand off to ${handoffTargets[0]}.`);
          lines.push('Last line only: __HANDOFF__:<targetId>:{"summary":"actual completed work","result":"actual findings"}');
          lines.push(`For this workflow, replace <targetId> with ${handoffTargets[0]}.`);
        } else {
          lines.push(`When your work is complete, emit one valid handoff token using any connected target ID: ${handoffTargets.join(', ')}.`);
          lines.push('The runtime will fan out that handoff to every connected downstream node for you.');
          lines.push('Last line only: __HANDOFF__:<targetId>:{"summary":"actual completed work","result":"actual findings"}');
        }
        lines.push('No extra text after that last handoff line.');
      } else {
        lines.push('You are the final agent. After completing your work, output __DONE__ on its own last line.');
      }

      return lines.join('\n');
    }

    // Agent's own system prompt / role instructions
    const agentPrompt = (node.data && node.data.systemPrompt) || '';
    lines.push(agentPrompt);
    lines.push('');
    lines.push('--- SWARM PROTOCOL (mandatory - never skip) ---');

    // Workflow context section - omit entirely if empty
    const contextKeys = Object.keys(workflowContext);
    if (contextKeys.length > 0) {
      lines.push('Current workflow context:');
      for (const key of contextKeys) {
        lines.push(`${key}: ${workflowContext[key]}`);
      }
      lines.push('');
    }

    if (inboundHandoffs.length > 0) {
      lines.push('Recent upstream handoffs for this agent:');
      inboundHandoffs.forEach((handoff) => {
        lines.push(
          `From ${handoff.sourceLabel || handoff.sourceNodeId} (${handoff.sourceNodeId}): ${JSON.stringify(handoff.payload ?? {})}`
        );
      });
      lines.push('');
    }

    lines.push('You have an active task right now. Do real work before deciding you are done.');
    if (workflowContext.currentTask) {
      lines.push(`Current task: ${workflowContext.currentTask}`);
    }
    if (workflowContext.workflowDescription) {
      lines.push(`Workflow goal: ${workflowContext.workflowDescription}`);
    }
    lines.push('');

    // Handoff instructions - vary based on whether targets exist
    if (handoffTargets.length > 0) {
      lines.push('This agent is not terminal in the workflow.');
      lines.push('When your stage is complete, you MUST emit a handoff token so the workflow can continue.');
      if (handoffTargets.length === 1) {
        lines.push(`Your required downstream target is: ${handoffTargets[0]}`);
      } else {
        lines.push(`Use any one of these connected target IDs in your final handoff token: ${handoffTargets.join(', ')}`);
        lines.push('The runtime will duplicate that handoff across every connected downstream node.');
      }
      lines.push('If another agent is better suited to continue, hand off with the most useful context you can provide.');
      lines.push('Do not emit __DONE__ immediately just because you understand the instructions.');
      lines.push('When your task is complete and must pass to another agent, output EXACTLY as the last line:');
      lines.push('__HANDOFF__:<targetId>:{"key": "value"}');
      lines.push('The final handoff token must be plain text on a single line with no bullets, quotes, code fences, or indentation.');
      lines.push('');
      lines.push(`Valid target IDs: ${handoffTargets.join(', ')}`);
      lines.push('Context update: a flat JSON object with primitive values only (string, number, or boolean). Max 50 keys, strings max 1024 chars. Keep it compact.');
      lines.push('');
      if (handoffTargets.length === 1) {
        lines.push('CONCRETE EXAMPLE (replace the placeholders with your real work):');
        lines.push(`For this workflow, <targetId> must be ${handoffTargets[0]}.`);
        lines.push('__HANDOFF__:<targetId>:{"summary": "your real work summary", "result": "your real findings"}');
      } else {
        lines.push('CONCRETE EXAMPLE (replace the placeholders with the chosen target and your real work):');
        lines.push(`Choose one target from: ${handoffTargets.join(', ')}`);
        lines.push('__HANDOFF__:<targetId>:{"summary": "your real work summary", "result": "your real findings"}');
      }
      lines.push('');
      lines.push('Do NOT output __DONE__ from this agent while downstream handoff targets still exist.');
    } else {
      lines.push('You are the FINAL agent in this workflow — no downstream handoffs exist.');
      lines.push('After completing your work, you MUST output the done marker on its own line:');
      lines.push('__DONE__');
      lines.push('This is MANDATORY. The workflow cannot complete without this exact token.');
      lines.push('Output __DONE__ as the very last line of your response, after all your content.');
    }

    lines.push('');
    lines.push('Do NOT output the handoff or done token mid-response. Only as the very LAST line.');
    lines.push('--- END PROTOCOL ---');

    return lines.join('\n');
  }

  _compactCodexInstructionText(text, maxChars) {
    const normalized = String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    if (!Number.isFinite(maxChars) || maxChars < 16 || normalized.length <= maxChars) {
      return normalized;
    }
    return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
  }

  _buildCodexRecoverySnippet(state = null) {
    if (!state) return '';
    const snippet = this._compactCodexInstructionText(
      state.lastOutputSnippet || this._buildSemanticSnippet(state._snippetSourceBuffer ?? ''),
      COMPACT_CODEX_PROGRESS_CHARS
    );
    return snippet;
  }

  _buildContinueAfterDonePrompt(node, workflowContext, handoffTargets) {
    const agentLabel = node?.data?.label || node?.id || 'This agent';
    const lines = [
      `${agentLabel} is not the end of the workflow yet.`,
      'Do not stop at the done marker while downstream agents still need your output.',
    ];

    if (workflowContext?.currentTask) {
      lines.push(`Continue this task: ${workflowContext.currentTask}`);
    }

    if (handoffTargets.length === 1) {
      lines.push(`Finish your work, then hand off to ${handoffTargets[0]}.`);
    } else if (handoffTargets.length > 1) {
      lines.push(`Finish your work, then emit one handoff token using any connected target ID: ${handoffTargets.join(', ')}.`);
      lines.push('The runtime will fan out that handoff to every connected downstream node.');
    }

    lines.push('Your very last line must be a valid handoff token in this EXACT format:');
    if (handoffTargets.length === 1) {
      lines.push(`Use ${handoffTargets[0]} in place of <targetId> for this workflow.`);
    } else {
      lines.push(`Use any connected target ID in place of <targetId> for this workflow: ${handoffTargets.join(', ')}.`);
    }
    lines.push('__HANDOFF__:<targetId>:{"summary": "your work summary here"}');
    lines.push('Use only flat JSON with primitive values (string, number, or boolean). Keep the handoff line compact.');
    lines.push('Output that final handoff token as plain text on a single line with no bullets, quotes, code fences, or indentation.');
    lines.push('Replace the summary value with an actual description of what you accomplished.');

    return lines.join('\n');
  }

  _buildMissingHandoffReminderPrompt(node, workflowContext, handoffTargets) {
    const agentLabel = node?.data?.label || node?.id || 'This agent';
    const lines = [
      `${agentLabel} appears to be back at the interactive prompt without emitting the required final handoff token.`,
      'If your analysis is complete, do not continue with more setup or explanation.',
    ];

    if (workflowContext?.currentTask) {
      lines.push(`Current task: ${workflowContext.currentTask}`);
    }

    if (handoffTargets.length === 1) {
      lines.push(`Output the final handoff now to ${handoffTargets[0]}.`);
    } else if (handoffTargets.length > 1) {
      lines.push(`Output the final handoff now to the best next agent: ${handoffTargets.join(', ')}.`);
    }

    lines.push('Reuse the exact swarm handoff syntax from the original instructions on your final line.');
    lines.push('That final line must use the real downstream target id plus a compact flat JSON object with primitive values only.');
    lines.push('Do not emit the final-agent done marker while downstream targets still exist.');

    return lines.join('\n');
  }

  _shouldSendMissingHandoffReminder(execution, nodeId, state) {
    if (!execution || !state) return false;
    if (state.provider !== RUNTIME_PROVIDER.CODEX) return false;
    if (state.status !== 'running') return false;
    if (state.runtimeBlocker || execution.runtimeBlocker) return false;
    if ((state.handoffCount ?? 0) > 0) return false;
    if ((state.promptSubmissionCount ?? 0) <= 0) return false;
    if (!state.promptReady || state.pendingPrompt) return false;

    const handoffTargets = execution.workflowDef.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target);
    if (handoffTargets.length === 0) return false;

    const now = Date.now();
    const lastBusyAt = state.lastRuntimeBusyAt ?? state.spawnedAt ?? now;
    if ((now - lastBusyAt) < SWARM_CODEX_MISSING_HANDOFF_IDLE_MS) return false;

    const recentRuntimeOutput = this._normalizeParserChunk(state._runtimeScanBuffer ?? '').toLowerCase();
    if (!recentRuntimeOutput.trim()) return false;

    return true;
  }

  // =========================================================================
  // Wave 5 — Advanced Flow Control Node Handlers
  // =========================================================================

  /**
   * Check whether a node is a flow-control node (no PTY spawn needed).
   * @param {object} node - workflow node definition
   * @returns {boolean}
   */
  _isFlowControlNode(node) {
    return node && FLOW_CONTROL_NODE_TYPES.has(node.type);
  }

  /**
   * Route a flow-control node activation to its specific handler.
   * Called instead of _spawnAgentPty when a flow-control node receives a handoff.
   * @param {string} executionId
   * @param {string} nodeId
   * @param {string} sourceNodeId - the node that triggered this activation (for merge tracking)
   */
  async _activateFlowControlNode(executionId, nodeId, sourceNodeId = null) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const node = execution.workflowDef.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Ensure an agentState entry exists for status tracking
    if (!execution.agentStates.has(nodeId)) {
      execution.agentStates.set(nodeId, {
        sessionId: null,
        provider: null,
        status: 'idle',
        handoffCount: 0,
        lastOutputSnippet: '',
      });
    }

    switch (node.type) {
      case 'conditional':
        await this._handleConditionalNode(executionId, nodeId, node, execution);
        break;
      case 'merge':
        await this._handleMergeNode(executionId, nodeId, node, execution, sourceNodeId);
        break;
      case 'delay':
        this._handleDelayNode(executionId, nodeId, node, execution);
        break;
      case 'loop':
        await this._handleLoopNode(executionId, nodeId, node, execution, sourceNodeId);
        break;
      case 'errorHandler':
        await this._handleErrorHandlerNode(executionId, nodeId, node, execution);
        break;
      case 'subWorkflow':
        await this._handleSubWorkflowNode(executionId, nodeId, node, execution);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // FR-V5-57/58 — Conditional Router
  // ---------------------------------------------------------------------------

  /**
   * Evaluate conditional rules and route to the first matching target.
   * Pure routing logic — no PTY spawned.
   */
  async _handleConditionalNode(executionId, nodeId, node, execution) {
    const state = execution.agentStates.get(nodeId);
    if (state) {
      state.status = 'running';
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    const rules = node.data?.rules ?? [];
    const context = execution.workflowContext;
    let targetNodeId = null;

    // Evaluate rules top-to-bottom; first match wins
    for (const rule of rules) {
      if (rule && rule.condition && evaluateCondition(rule.condition, context)) {
        targetNodeId = rule.targetNodeId;
        break;
      }
    }

    // Fallback to default target if no rule matched
    if (!targetNodeId) {
      targetNodeId = node.data?.defaultTargetNodeId ?? null;
    }

    if (state) {
      state.lastOutputSnippet = targetNodeId
        ? `Routed to ${targetNodeId}`
        : 'No matching route found';
      this._broadcastAgentStatus(executionId, nodeId, state);
    }
    this._chatExtractor.systemMessage(executionId, nodeId, `Routed to: ${targetNodeId || 'default'}`);

    if (targetNodeId) {
      await this._onHandoff(executionId, nodeId, {
        type: 'handoff',
        targetId: targetNodeId,
        contextUpdate: { _lastConditionalRoute: targetNodeId },
      });
    }

    // Mark as done AFTER forwarding so _onHandoff's duplicate guard doesn't drop it
    if (state) {
      state.status = 'done';
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    this._syncExecutionStatusFromAgents(execution);
  }

  // ---------------------------------------------------------------------------
  // FR-V5-61/62/63 — Merge/Join Node
  // ---------------------------------------------------------------------------

  /**
   * Track incoming edges and trigger merge when convergence threshold is met.
   */
  async _handleMergeNode(executionId, nodeId, node, execution, sourceNodeId) {
    const stateKey = `${executionId}:${nodeId}`;
    const state = execution.agentStates.get(nodeId);

    // Initialize merge tracking if not yet present
    if (!this._mergeStates.has(stateKey)) {
      const waitFor = node.data?.waitFor ?? 'all';
      let required;
      if (waitFor === 'any') {
        required = 1;
      } else if (typeof waitFor === 'number' && waitFor > 0) {
        required = waitFor;
      } else {
        // 'all' — count incoming edges to this merge node
        required = new Set(
          execution.workflowDef.edges
            .filter((e) => e.target === nodeId)
            .map((e) => e.source)
            .filter(Boolean)
        ).size;
      }
      this._mergeStates.set(stateKey, { received: new Set(), required });
    }

    const mergeState = this._mergeStates.get(stateKey);

    // Record the incoming source
    if (sourceNodeId) {
      mergeState.received.add(sourceNodeId);
    }

    if (state) {
      state.status = 'running';
      state.lastOutputSnippet = `Waiting: ${mergeState.received.size}/${mergeState.required}`;
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    // Check if convergence threshold is met
    if (mergeState.received.size >= mergeState.required) {
      // Merge complete — forward to outgoing edges
      if (state) {
        state.lastOutputSnippet = `Merged ${mergeState.received.size} inputs`;
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
      this._chatExtractor.systemMessage(executionId, nodeId, `All ${mergeState.required} inputs received — merging`);

      // Reset merge state for potential re-trigger (loop scenarios)
      this._mergeStates.delete(stateKey);

      // Forward to all outgoing edge targets
      const outgoingTargets = execution.workflowDef.edges
        .filter((e) => e.source === nodeId)
        .map((e) => e.target);

      for (const targetId of outgoingTargets) {
        await this._onHandoff(executionId, nodeId, {
          type: 'handoff',
          targetId,
          contextUpdate: { _mergeCompleted: nodeId },
        });
      }

      // Mark as done AFTER forwarding so _onHandoff's duplicate guard doesn't drop it
      if (state) {
        state.status = 'done';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }

      this._syncExecutionStatusFromAgents(execution);
    }
  }

  // ---------------------------------------------------------------------------
  // FR-V5-65/67 — Delay/Timer Node
  // ---------------------------------------------------------------------------

  /**
   * Wait for a configured number of seconds, then forward to outgoing edges.
   * No PTY spawned — pure timer logic.
   */
  _handleDelayNode(executionId, nodeId, node, execution) {
    const state = execution.agentStates.get(nodeId);
    const delaySeconds = Number(node.data?.delaySeconds ?? 0);
    if (state) {
      state.status = 'running';
      state.lastOutputSnippet = `Waiting ${delaySeconds}s...`;
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    const timerKey = `${executionId}:${nodeId}`;

    const handle = setTimeout(async () => {
      this._delayTimers.delete(timerKey);

      const exec = this._executions.get(executionId);
      if (!exec || ['stopping', 'stopped', 'failed'].includes(exec.status)) return;

      const currentState = exec.agentStates.get(nodeId);
      // Set status to 'running' during forwarding so _onHandoff's
      // duplicate-handoff guard (sourceState.status !== 'running') doesn't
      // silently drop the downstream handoff.
      if (currentState) {
        currentState.lastOutputSnippet = `Delay ${delaySeconds}s completed`;
        this._broadcastAgentStatus(executionId, nodeId, currentState);
      }
      this._chatExtractor.systemMessage(executionId, nodeId, `Delay of ${delaySeconds}s completed`);

      // Forward to all outgoing edge targets
      const outgoingTargets = exec.workflowDef.edges
        .filter((e) => e.source === nodeId)
        .map((e) => e.target);

      for (const targetId of outgoingTargets) {
        await this._onHandoff(executionId, nodeId, {
          type: 'handoff',
          targetId,
          contextUpdate: { _delayCompleted: nodeId },
        });
      }

      // Mark delay node as done AFTER forwarding completes
      if (currentState) {
        currentState.status = 'done';
        this._broadcastAgentStatus(executionId, nodeId, currentState);
      }

      this._syncExecutionStatusFromAgents(exec);
    }, delaySeconds * 1000);

    // Allow Node.js to exit even if delay timer is active
    if (handle.unref) {
      handle.unref();
    }

    this._delayTimers.set(timerKey, handle);
  }

  // ---------------------------------------------------------------------------
  // FR-V5-69/70/72 — Loop Node
  // ---------------------------------------------------------------------------

  /**
   * Manage loop iteration state. On first activation, forward to "loop" edges.
   * On return from sub-graph, increment and check exit condition.
   */
  async _handleLoopNode(executionId, nodeId, node, execution, sourceNodeId) {
    const stateKey = `${executionId}:${nodeId}`;
    const state = execution.agentStates.get(nodeId);
    const maxIterations = Number(node.data?.maxIterations ?? 10);
    const exitCondition = node.data?.exitCondition ?? null;

    // Separate outgoing edges by handle/label: "loop" vs "exit"
    const loopEdges = execution.workflowDef.edges.filter(
      (e) => e.source === nodeId && (e.sourceHandle === 'loop' || e.data?.label === 'loop')
    );
    const exitEdges = execution.workflowDef.edges.filter(
      (e) => e.source === nodeId && (e.sourceHandle === 'exit' || e.data?.label === 'exit')
    );
    // Fallback: if no labeled edges, first edge is loop, rest are exit
    const allOutgoing = execution.workflowDef.edges.filter((e) => e.source === nodeId);
    const effectiveLoopEdges = loopEdges.length > 0 ? loopEdges : (allOutgoing.length > 0 ? [allOutgoing[0]] : []);
    const effectiveExitEdges = exitEdges.length > 0 ? exitEdges : allOutgoing.slice(1);

    if (!this._loopStates.has(stateKey)) {
      // First activation — start iteration 1
      this._loopStates.set(stateKey, { iteration: 1, maxIterations });

      if (state) {
        state.status = 'running';
        state.lastOutputSnippet = `Loop iteration 1/${maxIterations}`;
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
      this._chatExtractor.systemMessage(executionId, nodeId, `Loop iteration 1`);

      // Forward to loop edges (inner sub-graph)
      for (const edge of effectiveLoopEdges) {
        await this._onHandoff(executionId, nodeId, {
          type: 'handoff',
          targetId: edge.target,
          contextUpdate: { _loopIteration: 1, _loopNodeId: nodeId },
        });
      }
      return;
    }

    // Return from sub-graph — increment iteration
    const loopState = this._loopStates.get(stateKey);
    loopState.iteration += 1;

    // Check exit conditions
    const shouldExit =
      loopState.iteration > loopState.maxIterations
      || (exitCondition && evaluateCondition(exitCondition, execution.workflowContext));

    if (shouldExit) {
      // Exit the loop
      if (state) {
        state.lastOutputSnippet = `Loop completed after ${loopState.iteration - 1} iterations`;
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
      this._chatExtractor.systemMessage(executionId, nodeId, `Loop completed after ${loopState.iteration - 1} iterations`);
      this._loopStates.delete(stateKey);

      for (const edge of effectiveExitEdges) {
        await this._onHandoff(executionId, nodeId, {
          type: 'handoff',
          targetId: edge.target,
          contextUpdate: {
            _loopCompleted: nodeId,
            _loopTotalIterations: loopState.iteration - 1,
          },
        });
      }

      // Mark as done AFTER forwarding so _onHandoff's duplicate guard doesn't drop it
      if (state) {
        state.status = 'done';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    } else {
      // Continue looping
      if (state) {
        state.status = 'running';
        state.lastOutputSnippet = `Loop iteration ${loopState.iteration}/${loopState.maxIterations}`;
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
      this._chatExtractor.systemMessage(executionId, nodeId, `Loop iteration ${loopState.iteration}`);

      for (const edge of effectiveLoopEdges) {
        await this._onHandoff(executionId, nodeId, {
          type: 'handoff',
          targetId: edge.target,
          contextUpdate: { _loopIteration: loopState.iteration, _loopNodeId: nodeId },
        });
      }
    }

    this._syncExecutionStatusFromAgents(execution);
  }

  // ---------------------------------------------------------------------------
  // FR-V5-74/75/76 — Error Handler Node
  // ---------------------------------------------------------------------------

  /**
   * Register error watchers for a given execution.
   * Called during startExecution for every errorHandler node in the workflow.
   */
  _registerErrorWatchers(executionId, execution) {
    const errorHandlerNodes = execution.workflowDef.nodes.filter(
      (n) => n.type === 'errorHandler'
    );
    if (errorHandlerNodes.length === 0) return;

    const watcherMap = new Map(); // watchedNodeId -> Set<errorHandlerNodeId>
    for (const ehNode of errorHandlerNodes) {
      const watchedNodes = ehNode.data?.watchedNodes ?? [];
      for (const watchedId of watchedNodes) {
        if (!watcherMap.has(watchedId)) {
          watcherMap.set(watchedId, new Set());
        }
        watcherMap.get(watchedId).add(ehNode.id);
      }
    }
    this._errorWatchers.set(executionId, watcherMap);
  }

  /**
   * Check if any error handlers are watching a node that just transitioned to 'error'.
   * If so, activate the error handler node.
   */
  async _checkErrorWatchers(executionId, nodeId, errorMessage, lastOutput) {
    const watcherMap = this._errorWatchers.get(executionId);
    if (!watcherMap) return;

    const handlers = watcherMap.get(nodeId);
    if (!handlers || handlers.size === 0) return;

    const execution = this._executions.get(executionId);
    if (!execution) return;

    for (const handlerId of handlers) {
      // Inject error context into workflow context
      execution.workflowContext._errorNodeId = nodeId;
      execution.workflowContext._errorMessage = errorMessage || 'Unknown error';
      execution.workflowContext._errorLastOutput = lastOutput || '';

      await this._handleErrorHandlerNode(executionId, handlerId,
        execution.workflowDef.nodes.find((n) => n.id === handlerId),
        execution
      );
    }
  }

  /**
   * Handle an error handler node activation.
   * Forwards to outgoing agent nodes with augmented error context in system prompts.
   */
  async _handleErrorHandlerNode(executionId, nodeId, node, execution) {
    if (!node) return;

    const state = execution.agentStates.get(nodeId);
    if (state) {
      state.status = 'running';
      state.lastOutputSnippet = `Handling error from ${execution.workflowContext._errorNodeId || 'unknown'}`;
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    // Forward to outgoing edges — downstream agents get error context
    const outgoingTargets = execution.workflowDef.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);

    for (const targetId of outgoingTargets) {
      await this._onHandoff(executionId, nodeId, {
        type: 'handoff',
        targetId,
        contextUpdate: {
          _errorHandlerActivated: nodeId,
          _errorNodeId: execution.workflowContext._errorNodeId,
          _errorMessage: execution.workflowContext._errorMessage,
          _errorLastOutput: execution.workflowContext._errorLastOutput,
        },
      });
    }

    if (state) {
      state.status = 'done';
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    this._syncExecutionStatusFromAgents(execution);
  }

  // ---------------------------------------------------------------------------
  // FR-V5-79/80/81 — Sub-Workflow Execution
  // ---------------------------------------------------------------------------

  /**
   * Load and execute a nested workflow within the parent execution.
   * On completion, merge child context back and forward to parent outgoing edges.
   */
  async _handleSubWorkflowNode(executionId, nodeId, node, execution) {
    const state = execution.agentStates.get(nodeId);
    const childWorkflowId = node.data?.workflowId;

    if (!childWorkflowId) {
      if (state) {
        state.status = 'failed';
        state.lastOutputSnippet = 'No workflowId configured';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
      this._syncExecutionStatusFromAgents(execution);
      return;
    }

    if (state) {
      state.status = 'running';
      state.lastOutputSnippet = `Starting sub-workflow ${childWorkflowId}`;
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    try {
      // Load the child workflow definition
      const childWf = await this._workflowStore.get(childWorkflowId);
      if (!childWf) {
        throw new Error(`Sub-workflow ${childWorkflowId} not found`);
      }

      // Create a nested execution
      const childExecutionId = uuidv4();
      const childExecution = {
        executionId: childExecutionId,
        workflowId: childWorkflowId,
        workflowDef: childWf,
        projectId: execution.projectId,
        projectPath: execution.projectPath,
        status: 'running',
        agentStates: new Map(),
        edgeCounters: new Map(),
        workflowContext: {
          ...this._buildInitialWorkflowContext(childWf),
          ...execution.workflowContext, // Inherit parent context
        },
        heartbeatTimer: null,
        inboxItems: [],
        chatMessages: [],
        runtimeBlocker: null,
        providerStrategy: execution.providerStrategy
          ? { ...execution.providerStrategy }
          : null,
        runtimeProvider: execution.runtimeProvider,
        activeProvider: execution.activeProvider,
        codexPromptRetryCounts: new Map(),
        lastFallback: null,
        _parentExecutionId: executionId,
        _parentNodeId: nodeId,
      };

      // Store the child execution
      this._executions.set(childExecutionId, childExecution);
      const subKey = `${executionId}:${nodeId}`;
      this._subWorkflowExecutions.set(subKey, childExecutionId);

      const childStartNodes = this._getStartNodes(childWf);

      if (childStartNodes.length === 0) {
        throw new Error(`Sub-workflow ${childWorkflowId} has no nodes`);
      }

      for (const childStartNode of childStartNodes) {
        if (this._isFlowControlNode(childStartNode)) {
          await this._activateFlowControlNode(childExecutionId, childStartNode.id);
          continue;
        }

        await this._spawnAgent(childExecutionId, childStartNode.id, {
          requestedProvider: childExecution.providerStrategy?.mode ?? execution.activeProvider,
          sessionIdPrefix: `${executionId}/${childExecutionId}`,
        });
      }

      this._startHeartbeat(childExecutionId);

      // Watch for child completion — poll via interval
      const pollHandle = setInterval(() => {
        const child = this._executions.get(childExecutionId);
        const parentExec = this._executions.get(executionId);
        const parentState = parentExec?.agentStates.get(nodeId);

        if (!child || !parentExec || !parentState) {
          clearInterval(pollHandle);
          if (parentState) {
            parentState._subWorkflowPollHandle = null;
          }
          return;
        }

        if (this._subWorkflowExecutions.get(subKey) !== childExecutionId) {
          clearInterval(pollHandle);
          parentState._subWorkflowPollHandle = null;
          return;
        }

        if (['stopping', 'stopped', 'failed', 'completed'].includes(parentExec.status)) {
          clearInterval(pollHandle);
          parentState._subWorkflowPollHandle = null;
          return;
        }

        if (child.status === 'blocked') {
          parentState.status = 'blocked';
          parentState.runtimeBlocker = child.runtimeBlocker
            ? {
                ...child.runtimeBlocker,
                nodeId,
                childExecutionId,
                childNodeId: child.runtimeBlocker.nodeId ?? null,
              }
            : {
                type: 'subworkflow_blocked',
                message: `Sub-workflow ${childWorkflowId} is blocked`,
                nodeId,
                childExecutionId,
              };
          parentState.lastOutputSnippet = `Sub-workflow blocked`;
          parentExec.runtimeBlocker = parentState.runtimeBlocker;
          this._broadcastAgentStatus(executionId, nodeId, parentState);
          this._syncExecutionStatusFromAgents(parentExec);
          return;
        }

        if (child.status === 'paused') {
          parentState.status = 'paused';
          parentState.runtimeBlocker = null;
          parentState.lastOutputSnippet = `Sub-workflow paused`;
          if (parentExec.runtimeBlocker?.nodeId === nodeId) {
            parentExec.runtimeBlocker = null;
          }
          this._broadcastAgentStatus(executionId, nodeId, parentState);
          this._syncExecutionStatusFromAgents(parentExec);
          return;
        }

        if (child.status === 'running' && (parentState.status !== 'running' || parentState.runtimeBlocker)) {
          parentState.status = 'running';
          parentState.runtimeBlocker = null;
          parentState.lastOutputSnippet = `Sub-workflow ${childWorkflowId} running`;
          if (parentExec.runtimeBlocker?.nodeId === nodeId) {
            parentExec.runtimeBlocker = null;
          }
          this._broadcastAgentStatus(executionId, nodeId, parentState);
          this._syncExecutionStatusFromAgents(parentExec);
          return;
        }

        if (['completed', 'stopped', 'failed'].includes(child.status)) {
          clearInterval(pollHandle);
          parentState._subWorkflowPollHandle = null;

          // Merge child context back into parent
          Object.assign(parentExec.workflowContext, child.workflowContext);

          // Forward to parent outgoing edges on success
          if (child.status === 'completed') {
            parentState.runtimeBlocker = null;
            parentState.lastOutputSnippet = `Sub-workflow ${child.status}`;
            this._broadcastAgentStatus(executionId, nodeId, parentState);

            const outgoingTargets = parentExec.workflowDef.edges
              .filter((e) => e.source === nodeId)
              .map((e) => e.target);

            (async () => {
              for (const targetId of outgoingTargets) {
                await this._onHandoff(executionId, nodeId, {
                  type: 'handoff',
                  targetId,
                  contextUpdate: { _subWorkflowCompleted: childWorkflowId },
                });
              }
              // Mark as done AFTER forwarding so _onHandoff's duplicate guard doesn't drop it
              parentState.status = 'done';
              this._broadcastAgentStatus(executionId, nodeId, parentState);
              this._syncExecutionStatusFromAgents(parentExec);
            })();
          } else {
            parentState.runtimeBlocker = null;
            parentState.status = 'failed';
            parentState.lastOutputSnippet = `Sub-workflow ${child.status}`;
            this._broadcastAgentStatus(executionId, nodeId, parentState);
            this._syncExecutionStatusFromAgents(parentExec);
          }

          // Clean up child execution reference
          this._subWorkflowExecutions.delete(subKey);
        }
      }, 1000);

      // Allow Node.js to exit
      if (pollHandle.unref) {
        pollHandle.unref();
      }

      // Store the poll handle on the state for cleanup
      if (state) {
        state._subWorkflowPollHandle = pollHandle;
      }

    } catch (error) {
      if (state) {
        state.status = 'failed';
        state.lastOutputSnippet = `Sub-workflow error: ${error.message}`;
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
      this._syncExecutionStatusFromAgents(execution);
    }
  }

  /**
   * Start the heartbeat timer for an execution.
   * Prevents idle sweeper from killing agent PTYs during active workflows.
   * Implemented in Task #46.3.
   * @param {string} executionId
   */
  _startHeartbeat(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    execution.heartbeatTimer = setInterval(() => {
      const exec = this._executions.get(executionId);
      if (!exec) return;

      for (const [nodeId, state] of exec.agentStates) {
        if (state.status === 'running') {
          this._sessionManager.writeInput(state.sessionId, '');
        }
      }
    }, 300000); // 5 minutes

    // Allow Node.js to exit even if heartbeat timer is active
    if (execution.heartbeatTimer.unref) {
      execution.heartbeatTimer.unref();
    }
  }

  /**
   * Handle a handoff event from one agent to another.
   * Merges context, increments edge counter, checks circuit breaker,
   * updates source agent state, and spawns/reuses target PTY.
   * Implemented in Task #62.1.
   * @param {string} executionId
   * @param {string} sourceNodeId
   * @param {object} event - { type: 'handoff', targetId, contextUpdate }
   */
  async _onHandoff(executionId, sourceNodeId, event) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const { targetId, contextUpdate } = event;
    const sourceState = execution.agentStates.get(sourceNodeId);
    const targetIds = this._resolveHandoffFanOutTargets(execution, sourceNodeId, targetId);

    // Ignore duplicate handoff processing once the source agent has already
    // left the active running state. This prevents repeated PTY redraws from
    // re-triggering the same downstream transition while the first handoff is
    // still opening the target session.
    if (sourceState && sourceState.status !== 'running') {
      return;
    }

    if (sourceState) {
      this._clearNoProgressWatch(sourceState);
      if (sourceState.missingHandoffReminderTimer) {
        clearTimeout(sourceState.missingHandoffReminderTimer);
        sourceState.missingHandoffReminderTimer = null;
      }
      sourceState.status = 'handoffing';
      sourceState.runtimeBlocker = null;
      this._markAgentProgress(execution, sourceNodeId, sourceState, 'parser_token');
    }

    // 1. Shallow merge context update (DEC-V3-05: OpenAI Swarm pattern)
    if (contextUpdate && typeof contextUpdate === 'object') {
      Object.assign(execution.workflowContext, contextUpdate);
    }

    const sourceNode = execution.workflowDef.nodes.find((n) => n.id === sourceNodeId);
    const isLoopEdge = sourceNode?.type === 'loop';
    const threshold = execution.workflowDef.settings?.circuitBreakerThreshold ?? 10;

    for (const nextTargetId of targetIds) {
      const edgeId = execution.workflowDef.edges.find(
        (e) => e.source === sourceNodeId && e.target === nextTargetId
      )?.id ?? `${sourceNodeId}->${nextTargetId}`;

      const counter = (execution.edgeCounters.get(edgeId) ?? 0) + 1;
      execution.edgeCounters.set(edgeId, counter);

      if (!isLoopEdge && this._circuitBreaker && this._circuitBreaker.check(edgeId, counter, threshold)) {
        if (this._wsBroadcast) {
          this._wsBroadcast(executionId, { type: 'circuit_breaker', edgeId, counter, threshold });
        }
      }

      if (sourceState) {
        sourceState.handoffCount = (sourceState.handoffCount ?? 0) + 1;
        const handoffRecord = { target: nextTargetId, payload: contextUpdate, timestamp: new Date().toISOString() };
        sourceState.lastHandoffPayload = handoffRecord;
        sourceState.handoffPayloads = [...(sourceState.handoffPayloads || []), handoffRecord];
      }

      this._recordInboundHandoff(execution, sourceNodeId, nextTargetId, contextUpdate);

      if (this._wsBroadcast) {
        this._wsBroadcast(executionId, {
          type: 'handoff_started',
          sourceNodeId,
          targetNodeId: nextTargetId,
          edgeId,
          counter,
        });
      }

      const targetNode = execution.workflowDef.nodes.find((n) => n.id === nextTargetId);
      if (targetNode && this._isFlowControlNode(targetNode)) {
        if (this._wsBroadcast) {
          this._wsBroadcast(executionId, {
            type: 'handoff_completed',
            sourceNodeId,
            targetNodeId: nextTargetId,
          });
        }
        await this._activateFlowControlNode(executionId, nextTargetId, sourceNodeId);
        continue;
      }

      const targetState = execution.agentStates.get(nextTargetId);
      if (targetNode && this._shouldWaitForAllAgentInputs(execution, nextTargetId) && !targetState?.sessionId) {
        const pendingInputs = this._registerPendingAgentInput(execution, nextTargetId, sourceNodeId);
        if (pendingInputs.received < pendingInputs.required) {
          if (targetState) {
            targetState.status = 'waiting';
            targetState.lastOutputSnippet = `Waiting for upstream inputs ${pendingInputs.received}/${pendingInputs.required}`;
            this._broadcastAgentStatus(executionId, nextTargetId, targetState);
          }
          continue;
        }
        execution.agentInputBarriers?.delete(nextTargetId);
      }

      // [STREAM-JSON-MIGRATION] Downstream activation is PTY reuse here.
      // Claude stream-json downstream turns are respawned via _spawnAgent()
      // and never pass through SessionManager / _ensureAgentPty().
      await this._ensureAgentPty(executionId, nextTargetId);

      const activeTargetState = execution.agentStates.get(nextTargetId);
      if (activeTargetState && activeTargetState.sessionId) {
        this._markAgentProgress(execution, nextTargetId, activeTargetState, 'downstream_spawn');
        if (targetNode) {
          const handoffTargets = this._getOutgoingTargets(execution.workflowDef, nextTargetId);
          const targetProvider = activeTargetState.runtimeProvider ?? activeTargetState.provider ?? null;
          const contextPrompt = this._buildSystemPrompt(
            targetNode,
            execution.workflowContext,
            handoffTargets,
            targetProvider,
            {
              inboundHandoffs: this._getInboundHandoffsForTarget(execution, nextTargetId),
              compactCodexPrompt: targetProvider === RUNTIME_PROVIDER.CODEX,
            }
          );
          if (contextPrompt) {
            this._writeSwarmPrompt(activeTargetState.sessionId, contextPrompt, activeTargetState);
          }
        }
      }

      if (activeTargetState) {
        activeTargetState.status = 'running';
        activeTargetState.runtimeBlocker = null;
        execution.runtimeBlocker = null;
        this._broadcastAgentStatus(executionId, nextTargetId, activeTargetState);
      }

      if (this._wsBroadcast) {
        this._wsBroadcast(executionId, {
          type: 'handoff_completed',
          sourceNodeId,
          targetNodeId: nextTargetId,
        });
      }
    }

    if (sourceState) {
      sourceState.status = 'done';
      sourceState.runtimeBlocker = null;
      this._broadcastAgentStatus(executionId, sourceNodeId, sourceState);
    }

    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Handle a done event from an agent.
   * Stub for Task #62.3 — broadcasts WS event.
   * @param {string} executionId
   * @param {string} nodeId
   */
  _onDone(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const node = execution.workflowDef.nodes.find((candidate) => candidate.id === nodeId);
    const state = execution.agentStates.get(nodeId);
    const handoffTargets = execution.workflowDef.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target);

    if (state?.runtimeBlocker || execution.runtimeBlocker) {
      if (state?.missingHandoffReminderTimer) {
        clearTimeout(state.missingHandoffReminderTimer);
        state.missingHandoffReminderTimer = null;
      }
      state.status = 'blocked';
      this._broadcastAgentStatus(executionId, nodeId, state);
      this._syncExecutionStatusFromAgents(execution);
      return;
    }

    if (state && handoffTargets.length > 0) {
      state.doneReinjectCount = (state.doneReinjectCount ?? 0) + 1;

      if (state.doneReinjectCount <= MAX_DONE_REINJECT_ATTEMPTS && (state.sessionId || state.spawnMode === 'stream-json')) {
        const reinjectPrompt = this._buildContinueAfterDonePrompt(node, execution.workflowContext, handoffTargets);
        // Register reinject prompt text with ChatExtractor so _isPromptEcho
        // can detect Claude echoing the reinject instructions in its response.
        this._chatExtractor.registerNodePrompt(nodeId, reinjectPrompt);
        if (execution.workflowContext?.currentTask) {
          this._chatExtractor.registerNodePrompt(nodeId, execution.workflowContext.currentTask);
        }

        // Stream-json agents: spawn a new process with --resume + reinject prompt
        if (state.spawnMode === 'stream-json') {
          state.status = 'running';
          this._broadcastAgentStatus(executionId, nodeId, state);
          this._syncExecutionStatusFromAgents(execution);
          this._spawnAgentStreamJson(executionId, nodeId, { reinjectPrompt });
          return;
        }

        // PTY agents: write reinject prompt to existing PTY stdin
        // Reset the parser rolling buffer so that the reinject prompt echo
        // (which may contain tokens like __HANDOFF__) does not cause a
        // false-positive parse on the next chunk after the echo gate opens.
        if (state._parser) state._parser.reset();
        this._writeSwarmPrompt(
          state.sessionId,
          reinjectPrompt,
          state
        );
        state.status = 'running';
        this._broadcastAgentStatus(executionId, nodeId, state);
        this._syncExecutionStatusFromAgents(execution);
        return;
      }

      // Max reinject attempts exhausted — force handoff to first downstream target
      // rather than leaving the workflow stuck in a reinject loop.
      const forcedTarget = handoffTargets[0];
      const syntheticEvent = {
        type: 'handoff',
        targetId: forcedTarget,
        contextUpdate: {
          currentTask: execution.workflowContext?.currentTask ?? '',
          forcedHandoff: 'true',
          reason: `Agent emitted __DONE__ ${state.doneReinjectCount} times without producing __HANDOFF__`,
        },
      };
      this._onHandoff(executionId, nodeId, syntheticEvent);
      return;
    }

    if (state) {
      if (state.missingHandoffReminderTimer) {
        clearTimeout(state.missingHandoffReminderTimer);
        state.missingHandoffReminderTimer = null;
      }
      this._clearNoProgressWatch(state);
      state.status = 'done';
      state.runtimeBlocker = null;
    }
    execution.runtimeBlocker = null;
    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Stop a running workflow execution.
   * Kills all agent PTY sessions and clears the execution record.
   * @param {string} executionId
   */
  async stopExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return null;

    if (['stopped', 'failed', 'completed'].includes(execution.status)) {
      return this.getStatus(executionId, execution);
    }

    this._setExecutionStatus(execution, 'stopping');

    const childExecutionIds = this._detachChildExecutionIds(executionId);

    if (execution.heartbeatTimer) {
      clearInterval(execution.heartbeatTimer);
      execution.heartbeatTimer = null;
    }

    for (const [nodeId, state] of execution.agentStates) {
      if (['running', 'paused'].includes(state.status)) {
        state.status = 'stopping';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    }
    this._broadcastExecutionSnapshot(execution);

    // [STREAM-JSON-MIGRATION] PTY listener teardown stays here; stream-json
    // child cleanup is handled separately in the spawn-mode-specific branch.
    for (const [, state] of execution.agentStates) {
      if (state.sessionId && state.tapFn) {
        const session = this._sessionManager.getSession(state.sessionId);
        if (session) {
          session.swarmListeners.delete(state.tapFn);
        }
      }
      // Clear echo-marker timeout to prevent leaked timers
      if (state.echoMarkerTimer) {
        clearTimeout(state.echoMarkerTimer);
        state.echoMarkerTimer = null;
      }
      // Clear done-reminder timeout to prevent leaked timers
      if (state.doneReminderTimer) {
        clearTimeout(state.doneReminderTimer);
        state.doneReminderTimer = null;
      }
      if (state.missingHandoffReminderTimer) {
        clearTimeout(state.missingHandoffReminderTimer);
        state.missingHandoffReminderTimer = null;
      }
      if (state.noProgressTimer) {
        clearTimeout(state.noProgressTimer);
        state.noProgressTimer = null;
      }
      this._clearStreamJsonPostResultTimer(state);
      this._clearSubWorkflowPollHandle(state);
      // Kill stream-json child processes (DEC-027)
      if (state.spawnMode === 'stream-json' && state._streamJsonChild) {
        const child = state._streamJsonChild;
        state._streamJsonChild = null;
        if (child.pid && !child.killed) {
          treeKill(child.pid, 'SIGTERM', (err) => {
            if (err) console.warn(`[SwarmEngine] tree-kill stream-json warning: ${err.message}`);
          });
        }
      }
    }

    for (const childExecutionId of childExecutionIds) {
      const childExecution = this._executions.get(childExecutionId);
      if (childExecution && !['stopped', 'failed', 'completed'].includes(childExecution.status)) {
        await this.stopExecution(childExecutionId);
      }
    }

    this._clearExecutionFlowControlState(executionId);

    try {
      for (const [, state] of execution.agentStates) {
        if (state.sessionId) {
          await this._sessionManager.killSession(state.sessionId);
        }
      }
    } catch (error) {
      this._setExecutionStatus(execution, 'failed');
      throw error;
    }

    for (const [, state] of execution.agentStates) {
      if (!['done', 'failed'].includes(state.status)) {
        state.status = 'stopped';
      }
      if (state.promptReadyTimer) {
        clearTimeout(state.promptReadyTimer);
        state.promptReadyTimer = null;
      }
      if (state.noProgressTimer) {
        clearTimeout(state.noProgressTimer);
        state.noProgressTimer = null;
      }
      state.sessionId = null;
      state.tapFn = null;
      state.runtimeBlocker = null;
    }

    execution.runtimeBlocker = null;

    for (const [nodeId, state] of execution.agentStates) {
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    if (this._triggerManager) {
      this._triggerManager.cleanupExecution(executionId);
    }

    if (this._budgetTracker) {
      this._budgetTracker.clearExecution(executionId);
    }

    this._chatExtractor.cleanup(executionId);

    this._setExecutionStatus(execution, 'stopped');
    return this.getStatus(executionId, execution);
  }

  /**
   * Pause all running agents in a workflow execution.
   * Sets each running agent's status to 'paused' and broadcasts the change.
   * Added in Task #67.
   * @param {string} executionId
   */
  pauseExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution || execution.status !== 'running') return null;
    for (const [nodeId, state] of execution.agentStates) {
      if (state.status === 'running') {
        if (state.sessionId) {
          this._sessionManager.writeInput(state.sessionId, '\x03');
        }
        state.status = 'paused';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    }
    for (const childExecutionId of this._getChildExecutionIds(executionId)) {
      this.pauseExecution(childExecutionId);
    }
    this._syncExecutionStatusFromAgents(execution);
    return this.getStatus(executionId, execution);
  }

  /**
   * Resume all paused agents in a workflow execution.
   * Sets each paused agent's status back to 'running' and broadcasts the change.
   * Added in Task #67.
   * @param {string} executionId
   */
  async resumeExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution || execution.status !== 'paused') return null;
    for (const [nodeId, state] of execution.agentStates) {
      if (state.status === 'paused') {
        if (state.spawnMode === 'stream-json') {
          state.doNotSpawnNextTurn = false;
          state._pendingStreamJsonStopMode = null;
          state._awaitingStreamJsonClose = false;
          await this._spawnAgent(executionId, nodeId, {
            requestedProvider: state.provider ?? state.runtimeProvider ?? execution.activeProvider,
          });
          continue;
        }
        // [STREAM-JSON-MIGRATION] PTY resume stays on the old stdin rewrite
        // path. Only non-stream-json sessions reuse the existing PTY session.
        if (state.sessionId) {
          this._sessionManager.writeInput(
            state.sessionId,
            'Resume the swarm workflow from the latest shared context and continue your task.\n'
          );
        }
        state.status = 'running';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    }
    for (const childExecutionId of this._getChildExecutionIds(executionId)) {
      await this.resumeExecution(childExecutionId);
    }
    this._syncExecutionStatusFromAgents(execution);
    return this.getStatus(executionId, execution);
  }

  /**
   * Freeze a single agent for Human-in-the-Loop review.
   * Sets the agent status to 'paused', adds an inbox item, and broadcasts
   * hitl_required + agent_status events.
   * Added in Task #70.
   * @param {string} executionId
   * @param {string} nodeId
   * @param {object} inboxItem - metadata for the human reviewer
   */
  freezeAgent(executionId, nodeId, inboxItem) {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    const state = execution.agentStates.get(nodeId);
    if (!state) return;

    state.status = 'paused';

    // Add to inbox for human review
    execution.inboxItems.push({ ...inboxItem, nodeId, id: inboxItem.id ?? `hitl-${Date.now()}` });

    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'hitl_required',
        nodeId,
        item: execution.inboxItems[execution.inboxItems.length - 1],
      });
    }
    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Unfreeze a single agent after Human-in-the-Loop review is complete.
   * Sets the agent status back to 'running' and broadcasts agent_status event.
   * Added in Task #70.
   * @param {string} executionId
   * @param {string} nodeId
   */
  unfreezeAgent(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    const state = execution.agentStates.get(nodeId);
    if (!state) return;

    state.status = 'running';

    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Get the execution object for a given executionId (public API for internal routes).
   * Returns null if execution not found. Prevents routes from accessing private _executions field.
   * Added in Task #96 (BUG-96 fix).
   * @param {string} executionId
   * @returns {object | null}
   */
  getExecution(executionId) {
    return this._executions.get(executionId) || null;
  }

  /**
   * Get the current status of a workflow execution.
   * BUG-98 fix: return real budget data from budgetTracker instead of undefined e.budget.
   * @param {string} executionId
   * @returns {object|null} execution status or null if not found
   */
  getStatus(executionId, executionOverride = null) {
    const e = executionOverride || this._executions.get(executionId);
    if (!e) return null;

    for (const state of e.agentStates.values()) {
      this._refreshAgentSnippet(state, { preferSessionReplay: state.status !== 'running' });
    }

    return {
      executionId: e.executionId,
      workflowId: e.workflowId,
      status: e.status,
      runtimeProvider: e.runtimeProvider ?? e.activeProvider ?? null,
      activeProvider: e.activeProvider ?? e.runtimeProvider ?? null,
      providerStrategy: e.providerStrategy ? { ...e.providerStrategy } : null,
      lastFallback: e.lastFallback ? { ...e.lastFallback } : null,
      agentStates: Object.fromEntries(
        [...e.agentStates.entries()].map(([nodeId, state]) => [nodeId, this._serializeAgentState(state)])
      ),
      edgeCounters: Object.fromEntries(e.edgeCounters),
      budget: this._getBudgetSnapshot(e),
      inboxItems: e.inboxItems.map((item) => ({ ...item })),
      chatMessages: (e.chatMessages ?? []).map((msg) => ({ ...msg })),
      ...(e.runtimeBlocker ? { runtimeBlocker: this._serializeRuntimeBlocker(e.runtimeBlocker) } : {}),
    };
  }
}

export default SwarmEngine;
