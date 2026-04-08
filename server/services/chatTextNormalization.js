const normalizeCompressedChatWord = (word = '') => String(word ?? '')
  .normalize('NFD')
  .replace(/\p{M}+/gu, '')
  .toLowerCase();

const CHAT_WORDS = [
  'a', 'agent', 'agents', 'al', 'all', 'alla', 'alle', 'allo', 'also', 'ambiente', 'an',
  'analisi', 'analizzare', 'and', 'appreciated', 'are', 'aspetti', 'attivita', 'aumentare',
  'autonomamente', 'autonomia', 'aziende', 'base', 'be', 'beautiful', 'been', 'benefici',
  'beneficio', 'best', 'both', 'bright', 'buon', 'buona', 'caloroso', 'can', 'casa', 'che',
  'chi', 'chiave', 'ciao', 'collected', 'come', 'completed', 'con', 'concentrarsi', 'conciso',
  'connection', 'connections', 'consentono', 'consente', 'contains', 'context', 'costi', 'could',
  'da', 'dal', 'day', 'dei', 'del', 'della', 'delle', 'dello', 'development', 'di',
  'different', 'dipendenti', 'diverse', 'diversi', 'do', 'dove', 'downstream', 'due',
  'durante', 'e', 'ecco', 'ed', 'efficienza', 'employees', 'equilibrio', 'era', 'esigenze',
  'esprimendo', 'essere', 'everyone', 'execute', 'familiari', 'fantastic', 'fare', 'filled',
  'final', 'finale', 'flessibile', 'flessibilita', 'flexibility', 'for', 'formale',
  'friend', 'friendliness', 'from', 'funzionato', 'generate', 'generated', 'gestione',
  'gestire', 'giorno', 'globale', 'greeting', 'greetings', 'greater', 'ha', 'handoff',
  'hanno', 'has', 'have', 'hello', 'help', 'ho', 'how', 'i', 'il', 'importante', 'in',
  'include', 'includono', 'inoltre', 'instead', 'is', 'it', 'italian', 'its', 'joy',
  'key', 'kind', 'la', 'language', 'lavorare', 'lavoratori', 'lavorativo', 'lavoro',
  'le', 'life', 'lo', 'loro', 'maggiore', 'making', 'meet', 'meglio', 'meno', 'mentre',
  'message', 'messages', 'migliore', 'modo', 'molto', 'moments', 'more', 'most',
  'nel', 'nella', 'non', 'not', 'nostro', 'ogni', 'or', 'orari', 'orario', 'organizzare',
  'our', 'output', 'parallel', 'particolarmente', 'pay', 'pendolarismo', 'per',
  'permette', 'permettendo', 'permettono', 'persona', 'personale', 'personali',
  'personal', 'piu', 'pleasure', 'poiche', 'positive', 'possibilita', 'possono',
  'prestazioni', 'principale', 'produttivita', 'produttivo', 'professionale',
  'progetto', 'project', 'propri', 'proprio', 'quando', 'questo', 'questa',
  'quindi', 'raggiungere', 'remoto', 'remote', 'report', 'reporter', 'request', 'requested',
  'research', 'resoconto', 'result', 'results', 'riassunto', 'riduce', 'ridurre',
  'riduzione', 'risparmio', 'risultati', 'runtime', 'salute', 'saluti', 'se',
  'senza', 'share', 'shared', 'should', 'si', 'significativamente', 'smile', 'smiles',
  'sono', 'spirits', 'spostamento', 'stress', 'structured', 'sua', 'success',
  'successfully', 'sui', 'sul', 'sulla', 'suo', 'summary', 'summarize',
  'talenti', 'task', 'tempo', 'that', 'the', 'their', 'them', 'things', 'time',
  'tono', 'tra', 'translation', 'trasporti', 'tre', 'true', 'tutti', 'un', 'una',
  'uno', 'upstream', 'ufficio', 'user', 'utenze', 'valued', 'vantaggi',
  'vita', 'warmth', 'welcome', 'what', 'which', 'will', 'with', 'wonderful',
  'workflow', 'work', 'working', 'you', 'your',
  // Extended Italian vocabulary for ConPTY decompression
  'adattare', 'affitti', 'anche', 'aziendali', 'bacino', 'ciascun', 'collaborazione',
  'completare', 'denaro', 'eliminazione', 'forniture', 'garantisce', 'generale',
  'giornata', 'grande', 'lavorativa', 'lavoratore', 'limitazioni', 'luogo',
  'migliorano', 'notevole', 'numerosi', 'offre', 'opera', 'operativi', 'opportunita',
  'paragrafo', 'primo', 'proprie', 'qualita', 'riassuntivo',
];

const CHAT_WORD_SET = new Set(CHAT_WORDS.map((word) => normalizeCompressedChatWord(word)));
const CHAT_WORD_MAX_LEN = CHAT_WORDS.reduce((max, word) => Math.max(max, word.length), 0);
const RESTORABLE_CHAT_TOKEN_RE = /^(?:[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF]{6,}|[a-z\u00DF-\u00F6\u00F8-\u00FF]{7,})$/u;
const RESTORABLE_CHAT_TOKEN_MATCH_RE = /(?:[A-Z\u00C0-\u00D6\u00D8-\u00DE][a-z\u00DF-\u00F6\u00F8-\u00FF]{6,}|[a-z\u00DF-\u00F6\u00F8-\u00FF]{7,})/gu;
const LEADING_CHAT_CONNECTORS = new Set(['a', 'e', 'i', 'il', 'la', 'le', 'lo', 'the', 'un', 'una', 'uno']);

function isReadableChatToken(token = '') {
  const raw = String(token ?? '');
  if (!raw) return false;
  const normalized = normalizeCompressedChatWord(raw);
  if (CHAT_WORD_SET.has(normalized)) return true;
  return /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{4,}$/u.test(raw);
}

function restoreLeadingConnectorCompressedToken(token = '') {
  if (!token || token.length < 10) return token;

  const connector = token.charAt(0);
  if (!LEADING_CHAT_CONNECTORS.has(normalizeCompressedChatWord(connector))) return token;

  const remainder = token.slice(1);
  if (!/^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{7,}$/u.test(remainder)) return token;

  const exactSplit = splitKnownWordSequence(remainder);
  if (exactSplit) return `${connector} ${exactSplit}`;

  const greedySplit = restoreCompressedChatTokenGreedy(remainder);
  if (!greedySplit || greedySplit === remainder) return token;
  return `${connector} ${greedySplit}`;
}

function isRestorableChatToken(token = '') {
  return /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{7,}$/u.test(token);
}

function pickBetterSplit(candidate, current) {
  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.score !== current.score) return candidate.score > current.score ? candidate : current;
  if (candidate.parts.length !== current.parts.length) {
    return candidate.parts.length < current.parts.length ? candidate : current;
  }
  return candidate;
}

function splitKnownWordSequence(token = '') {
  if (!token || !isRestorableChatToken(token)) return null;

  const normalizedToken = normalizeCompressedChatWord(token);
  const memo = new Map();

  const visit = (index) => {
    if (index === normalizedToken.length) {
      return { score: 0, parts: [] };
    }
    if (memo.has(index)) return memo.get(index);

    let best = null;
    for (let length = 1; length <= CHAT_WORD_MAX_LEN && index + length <= normalizedToken.length; length += 1) {
      const slice = normalizedToken.slice(index, index + length);
      if (!CHAT_WORD_SET.has(slice)) continue;

      const rest = visit(index + length);
      if (!rest) continue;

      const score = rest.score + (length * length) - (length === 1 ? 3 : 0);
      const candidate = {
        score,
        parts: [token.slice(index, index + length), ...rest.parts],
      };
      best = pickBetterSplit(candidate, best);
    }

    memo.set(index, best);
    return best;
  };

  const best = visit(0);
  if (!best || best.parts.length < 2) return null;
  return best.parts.join(' ');
}

function aggressivelyRestoreLongChatToken(token = '') {
  if (!token || token.length < 18 || !isRestorableChatToken(token)) return token;
  const connectorSplit = restoreLeadingConnectorCompressedToken(token);
  if (connectorSplit !== token) return connectorSplit;
  const exactSplit = splitKnownWordSequence(token);
  if (exactSplit) return exactSplit;

  const greedy = restoreCompressedChatTokenGreedy(token);
  if (!greedy) return token;

  const pieces = greedy.split(' ').filter(Boolean);
  if (pieces.length < 3) return token;
  if (pieces.join('').length !== token.length) return token;
  return greedy;
}

function restoreCompressedChatTokenGreedy(token = '', normalizedToken = normalizeCompressedChatWord(token)) {
  if (!token || !isRestorableChatToken(token)) return null;

  const parts = [];
  let index = 0;

  while (index < normalizedToken.length) {
    let bestEnd = -1;

    for (
      let length = Math.min(CHAT_WORD_MAX_LEN, normalizedToken.length - index);
      length >= 1;
      length -= 1
    ) {
      const slice = normalizedToken.slice(index, index + length);
      if (!CHAT_WORD_SET.has(slice)) continue;
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

function restoreCompressedChatToken(token = '') {
  if (!token || !isRestorableChatToken(token)) return token;
  const connectorSplit = restoreLeadingConnectorCompressedToken(token);
  if (connectorSplit !== token) return connectorSplit;

  const exactSplit = splitKnownWordSequence(token);
  if (exactSplit) return exactSplit;

  const normalizedToken = normalizeCompressedChatWord(token);
  if (CHAT_WORD_SET.has(normalizedToken)) return token;

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

    for (let length = 1; length <= CHAT_WORD_MAX_LEN && index + length <= normalizedToken.length; length += 1) {
      const slice = normalizedToken.slice(index, index + length);
      if (!CHAT_WORD_SET.has(slice)) continue;
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
  if (!result) return restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;

  const coverage = result.matchedChars / token.length;
  const minimumScore = token.length * 0.35;
  if (result.matchedWords < 2 || coverage < 0.6 || result.score <= minimumScore) {
    return restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;
  }

  const matchedParts = result.parts.filter((part) => part.matched);
  const singleCharMatches = matchedParts.filter((part) => (part.end - part.start) === 1).length;
  const tinyMatches = matchedParts.filter((part) => (part.end - part.start) <= 2).length;
  if (singleCharMatches > 1 || tinyMatches > 3) {
    return restoreCompressedChatTokenGreedy(token, normalizedToken) ?? token;
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

function shouldSkipConPTYDecompression(line = '') {
  if (!line) return false;
  if (/[{}\[\]]/.test(line)) return true;
  if (/^[A-Z_]+=/.test(line)) return true;
  if (/^\s*\w+\s*:\s*[{[]/.test(line)) return true;
  if (/^\s*[-*]/.test(line) && /\/api\//.test(line)) return true;
  if (/https?:\/\//.test(line)) return true;
  if (/PROMPT-CONTROL-REPORT/.test(line)) return true;
  if (/^(?:~[\\/]|[A-Za-z]:[\\/])/.test(line)) return true;
  return false;
}

function restoreFragmentedChatSequence(sequence = '') {
  const raw = String(sequence ?? '').trim();
  if (!raw.includes(' ')) return raw;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return raw;
  if (!parts.every((part) => /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}$/u.test(part))) return raw;

  const singleCharCount = parts.filter((part) => part.length === 1).length;
  if (singleCharCount === 0) return raw;
  if (singleCharCount === 1 && parts.length !== 2) return raw;

  const knownParts = parts.filter((part) => CHAT_WORD_SET.has(normalizeCompressedChatWord(part))).length;
  if (knownParts === parts.length) return raw;

  const merged = parts.join('');
  const normalizedMerged = normalizeCompressedChatWord(merged);
  if (CHAT_WORD_SET.has(normalizedMerged)) return merged;
  if (merged.length < 5) return raw;

  const restored = merged.length >= 7 ? restoreCompressedChatToken(merged) : merged;
  if (restored !== merged) return restored;
  return raw;
}

function stripLeadingCorruption(line = '') {
  const raw = String(line ?? '');
  if (raw.length < 24) return raw;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return raw;

  for (let startIndex = 3; startIndex <= Math.min(8, tokens.length - 3); startIndex += 1) {
    const prefixTokens = tokens.slice(0, startIndex);
    const remainingTokens = tokens.slice(startIndex);
    if (remainingTokens.length < 3) break;

    const shortPrefixTokens = prefixTokens.filter((token) => token.length <= 2).length;
    const hasDigits = prefixTokens.some((token) => /\d/.test(token));
    const hasSymbols = prefixTokens.some((token) => /[^\p{L}\p{N}]/u.test(token));
    const alphaCorePrefixTokens = prefixTokens.map((token) => String(token).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    const naturalPrefixWords = alphaCorePrefixTokens.filter((token) => /^[A-Za-z\u00C0-\u00FF]{3,}$/u.test(token)).length;
    const naturalPrefixPunctuation = prefixTokens.filter((token) => /[,.!?;:]/.test(token)).length;
    const mostlyShortPrefix = shortPrefixTokens >= Math.max(3, prefixTokens.length - 1);
    if (!hasDigits && !hasSymbols && !mostlyShortPrefix) continue;
    if (!hasDigits && naturalPrefixWords >= 2) continue;
    if (!hasDigits && naturalPrefixWords >= 1 && naturalPrefixPunctuation >= 1 && !mostlyShortPrefix) continue;

    const firstToken = remainingTokens[0] ?? '';
    const secondToken = remainingTokens[1] ?? '';
    const readableStart = LEADING_CHAT_CONNECTORS.has(normalizeCompressedChatWord(firstToken))
      ? isReadableChatToken(secondToken)
      : isReadableChatToken(firstToken);
    if (!readableStart) continue;

    const readableSample = remainingTokens.slice(0, 5).filter(isReadableChatToken).length;
    if (readableSample < 3) continue;

    return remainingTokens.join(' ');
  }

  return raw;
}

export function normalizeChatDisplayText(text = '') {
  if (!text) return text;

  return String(text)
    .split('\n')
    .map((line) => {
      if (shouldSkipConPTYDecompression(line)) return stripLeadingCorruption(line).trimEnd();

      return stripLeadingCorruption(
        line
          .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1}\s+(?:[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\s+){1,4}[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\b/gu, (sequence) => restoreFragmentedChatSequence(sequence))
          .replace(/\b[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1}(?:\s+[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]{1,8}){0,2}\b/gu, (sequence) => restoreFragmentedChatSequence(sequence))
          .replace(/\b[A-Za-z\u00C0-\u00FF]{18,}\b/gu, (token) => aggressivelyRestoreLongChatToken(token))
          .replace(/([.!?])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
          .replace(/([,;])([a-zA-Z\u00C0-\u00F6])/gu, '$1 $2')
          .replace(/([):])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
          .replace(/([a-z\u00E0-\u00F6])([A-Z\u00C0-\u00D6])/gu, '$1 $2')
          .replace(/\b([a-zA-Z\u00C0-\u00F6]+(?:['’](?:s|re|ve|ll|d|m)|n['’]t))(?=[a-zA-Z\u00C0-\u00F6])/gu, '$1 ')
          .replace(/\b([a-zA-Z\u00C0-\u00F6]+['’])([a-zA-Z\u00C0-\u00F6]{7,})/gu, (_, prefix, suffix) => `${prefix}${restoreCompressedChatToken(suffix)}`)
          .replace(RESTORABLE_CHAT_TOKEN_MATCH_RE, (token) => restoreCompressedChatToken(token))
          .replace(/\s{2,}/g, ' ')
      ).trimEnd();
    })
    .join('\n');
}
