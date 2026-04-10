// client/src/utils/repairTokenSpacing.js
// Repair BPE token-boundary spacing from Claude CLI stream-json / PTY output.

const SUFFIX_RE = /(?:ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite|zione|zioni|mente|enza|anza|ento|amento|imento|abile|ibile|ario|aria|eria|oria|ione|ioni|ore|ura|tura|tore|trice|ivo|iva|ivi|ive|oso|osa|osi|ose|are|ere|ire|ano|ono|ava|evo|etto|etta|ello|ella|erno|erna|orno|orna|esso|essa|ando|endo|ente|anti|enti|isce|olare|aggio|aggi|azza|ezza|izza|iere|iera|ista|isti|iste|ismo|ismi|anza|anze|enze|tura|ture|ario|ari|aria|arie|cher|er|ner|iche|ica|ico|ici|anche|nico|nica|nici|niche|tica|tico|tici|tiche)$/i;

const MAX_MERGED = 15;

const VALID_WORD_STARTS = new Set([
  'bl','br','ch','cl','cr','dr','fl','fr','gh','gl','gn','gr',
  'pl','pr','ps','pt','sb','sc','sf','sg','sh','sl','sm','sn',
  'sp','sq','sr','st','sv','th','tr','ts','vr','wr',
  // Unit abbreviations — must not be merged leftward
  'km','mb','gb','kb','mg','ml','mm','cm','kg','hz','db','tb','pb','nm',
]);

const BOUNDARY = String.raw`[ ,.\n;:!?)\u2014\u2013\u201D\u201C*\]]`;

const reSingleConsonant = new RegExp(
  String.raw`([a-zA-Z\u00C0-\u00FF]{2,}) ([bcdfghjklmnpqrstvwxyz])(?=${BOUNDARY}|$)`, 'g',
);
// Phase 2: only merge UNACCENTED vowels. Accented vowels (è, à, ì, ò, ù)
// are always standalone words in Italian and must never be merged.
const reSingleVowel = new RegExp(
  String.raw`([a-zA-Z\u00C0-\u00FF]{3,}[bcdfghjklmnpqrstvwxyz]) ([aeiou])(?=${BOUNDARY}|$)`, 'g',
);
const reConsonantCluster = new RegExp(
  String.raw`([a-zA-Z\u00C0-\u00FF]{2,}) ([bcdfghjklmnpqrstvwxyz]{2})(?=${BOUNDARY}|$)`, 'g',
);

function isLikelyCompleteWord(seg) {
  return seg.length >= 5 && /[aeiouàèéìòù]$/i.test(seg);
}

const ARTICLES = new Set([
  'il','la','le','lo','gli','una','uno','del','dei','nel','nei','sul','sui',
]);

const COMMON_2CHAR = new Set([
  'si','di','da','ma','se','ci','vi','ne','mi','ti',
]);

function tryMergeSegments(segments) {
  const maxStart = segments.length - 1;
  const firstIsCommon = segments[0].length <= 2
    && COMMON_2CHAR.has(segments[0].toLowerCase());

  const starts = [];
  if (firstIsCommon) {
    for (let i = 1; i < maxStart; i++) starts.push(i);
    starts.push(0);
  } else {
    for (let i = 0; i < maxStart; i++) starts.push(i);
  }

  for (const start of starts) {
    if (isLikelyCompleteWord(segments[start])) continue;

    const preSegs = segments.slice(0, start);
    const mergeSegs = segments.slice(start);

    for (let len = mergeSegs.length; len >= 2; len--) {
      const candidate = mergeSegs.slice(0, len);
      if (candidate.some(s => ARTICLES.has(s.toLowerCase()))) continue;
      if (candidate.every(s => s.length >= 4)) continue;
      const merged = candidate.join('');
      if (merged.length >= 5 && merged.length <= MAX_MERGED && SUFFIX_RE.test(merged)) {
        const pre = preSegs.length ? preSegs.join(' ') + ' ' : '';
        const tail = mergeSegs.slice(len);
        return pre + merged + (tail.length ? ' ' + tail.join(' ') : '');
      }
    }

    for (let split = 2; split < mergeSegs.length; split++) {
      const leftCandidate = mergeSegs.slice(0, split);
      const rightCandidate = mergeSegs.slice(split);
      if (leftCandidate.some(s => ARTICLES.has(s.toLowerCase()))) continue;
      if (rightCandidate.some(s => ARTICLES.has(s.toLowerCase()))) continue;
      if (leftCandidate.every(s => s.length >= 4)) continue;
      if (rightCandidate.every(s => s.length >= 4)) continue;
      const left = leftCandidate.join('');
      const right = rightCandidate.join('');
      if (
        left.length >= 3 && left.length <= MAX_MERGED && SUFFIX_RE.test(left) &&
        right.length >= 5 && right.length <= MAX_MERGED && SUFFIX_RE.test(right)
      ) {
        const pre = preSegs.length ? preSegs.join(' ') + ' ' : '';
        return pre + left + ' ' + right;
      }
    }
  }
  return null;
}

/**
 * Multi-phase BPE token splitting repair.
 *
 * Phase 1: Merge isolated single consonants into preceding word
 *          (skip when preceding word is complete AND next fragment starts with vowel+letter)
 * Phase 2: Merge single UNACCENTED vowels after consonant-ending word (3+ chars)
 * Phase 3: Merge consonant-only 2-char clusters (skip valid word starts & units)
 * Phase 4: Re-run phases 1-2
 * Phase 5: Suffix-validated merge of short fragments (case-insensitive)
 * Phase 6: Bridge — short prefix + single letter + longer suffix
 * Phase 7: Long word + short suffix merge
 * Phase 8: Rightward merge — single consonant between complete word and vowel-starting fragment
 */
export function repairTokenSplitting(text) {
  if (!text) return text;

  let result = text;
  let prev;

  // --- Phase 1: single consonant after word (smart) ---
  const phase1Replace = (s) => {
    return s.replace(reSingleConsonant, (match, word, consonant, offset) => {
      if (isLikelyCompleteWord(word)) {
        const afterPos = offset + match.length;
        const rest = s.substring(afterPos);
        if (/^\s+[aeiouàèéìòù][a-zA-Z\u00C0-\u00FF]/i.test(rest)) return match;
      }
      return word + consonant;
    });
  };
  do { prev = result; result = phase1Replace(result); } while (result !== prev);

  // --- Phase 2: single UNACCENTED vowel after consonant-ending word ---
  do { prev = result; result = result.replace(reSingleVowel, '$1$2'); } while (result !== prev);

  // --- Phase 3: consonant-only 2-char clusters (skip valid word starts & units) ---
  do {
    prev = result;
    result = result.replace(reConsonantCluster, (m, word, cluster) => {
      if (VALID_WORD_STARTS.has(cluster.toLowerCase())) return m;
      return word + cluster;
    });
  } while (result !== prev);

  // --- Phase 4: re-run 1+2 after 3 ---
  do { prev = result; result = phase1Replace(result); } while (result !== prev);
  do { prev = result; result = result.replace(reSingleVowel, '$1$2'); } while (result !== prev);

  // --- Phase 5: suffix-validated merge (CASE-INSENSITIVE) ---
  const reFragments = /(?<![a-zA-Z\u00C0-\u00FF])([a-zA-Z\u00C0-\u00FF]{2,6})((?:\s[a-zA-Z\u00C0-\u00FF]{1,4}){1,5})(?![a-zA-Z\u00C0-\u00FF])/g;

  do {
    prev = result;
    result = result.replace(reFragments, (_match, first, rest) => {
      const segments = [first, ...rest.trim().split(/\s+/)];
      const merged = tryMergeSegments(segments);
      return merged !== null ? merged : _match;
    });
  } while (result !== prev);

  // --- Phase 6: bridge — prefix(1-3) + single_letter + word(3-7) ---
  result = result.replace(
    /(?<![a-zA-Z\u00C0-\u00FF])([a-zA-Z\u00C0-\u00FF]{1,3}) ([a-zA-Z\u00C0-\u00FF]) ([a-zA-Z\u00C0-\u00FF]{3,7})(?![a-zA-Z\u00C0-\u00FF])/g,
    (_match, prefix, bridge, suffix) => {
      const merged = prefix + bridge + suffix;
      if (merged.length >= 5 && SUFFIX_RE.test(merged)) return merged;
      return _match;
    },
  );

  // --- Phase 7: long word (6+) + short suffix (1-3) that isn't a standalone word ---
  const COMMON_SHORT = new Set([
    'il','la','le','lo','li','di','da','in','su','se','ma','si','ci',
    'vi','ne','al','un','ha','ho','ai','fa','sa','va','no','me','te',
    'io','tu','è','e','a','i','o','del','dei','con','per','che','nel',
    'sul','fra','tra','una','uno','gli','più','poi','già','non','dal',
    'qui','ora','mai','due','chi','cui','sia','via','dai','ore',
    'the','and','for','but','not','you','all','can','had','her','was',
    'one','our','out','has','his','how','its','may','new','now','old',
    'see','way','who','did','get','let','say','she','too','use',
    'is','it','he','we','do','if','in','on','so','to','up','an','as',
    'at','be','by','go','my','no','of','or',
  ]);

  do {
    prev = result;
    result = result.replace(
      /([a-zA-Z\u00C0-\u00FF]{6,}) ([a-zA-Z\u00C0-\u00FF]{1,3})(?=[ ,.\n;:!?)\u2014\u2013*]|$)/g,
      (m, word, frag) => {
        if (COMMON_SHORT.has(frag.toLowerCase())) return m;
        const merged = word + frag;
        if (merged.length <= MAX_MERGED && SUFFIX_RE.test(merged)) return merged;
        return m;
      },
    );
  } while (result !== prev);

  // --- Phase 8: rightward merge — single consonant preceded by complete word, merge into following word ---
  do {
    prev = result;
    result = result.replace(
      /([a-zA-Z\u00C0-\u00FF]{5,}) ([bcdfghjklmnpqrstvwxyz]) ([a-zA-Z\u00C0-\u00FF]{3,})/g,
      (m, leftWord, consonant, rightFrag) => {
        if (!isLikelyCompleteWord(leftWord)) return m;
        const merged = consonant + rightFrag;
        if (merged.length >= 4 && merged.length <= MAX_MERGED && SUFFIX_RE.test(merged)) {
          return leftWord + ' ' + merged;
        }
        return m;
      },
    );
  } while (result !== prev);

  return result;
}

/**
 * Repair camelCase token splitting: "Java Script" → "JavaScript",
 * "high Water Mark" → "highWaterMark".
 */
export function repairCamelCaseSplitting(text) {
  return text.replace(
    /\b([a-z][a-z\d]*)\s+([A-Z][a-z\d]*(?:\s+[A-Z][a-z\d]*)*)\b/g,
    (match, lower, upperParts) => {
      const parts = upperParts.split(/\s+/);
      if (parts.every((p) => p.length <= 10)) {
        return lower + parts.join('');
      }
      return match;
    },
  );
}

/**
 * Apply all token-spacing repairs to text.
 */
export function repairAllTokenSpacing(text) {
  if (!text) return text;
  let result = repairTokenSplitting(text);
  result = repairCamelCaseSplitting(result);
  return result;
}
