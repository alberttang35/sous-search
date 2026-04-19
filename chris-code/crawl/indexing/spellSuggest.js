// @ts-check
'use strict';

/** Lowercase alphanumerics (aligned with tokenizeText). */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * @param {string} word
 * @returns {Set<string>}
 */
function edits1(word) {
  const w = String(word || '');
  const n = w.length;
  const out = new Set();
  if (!n) return out;
  for (let i = 0; i < n; i++) out.add(w.slice(0, i) + w.slice(i + 1));
  for (let i = 0; i < n - 1; i++) {
    out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  for (let i = 0; i < n; i++) {
    for (let ai = 0; ai < ALPHABET.length; ai++) {
      const c = ALPHABET[ai];
      out.add(w.slice(0, i) + c + w.slice(i + 1));
    }
  }
  for (let i = 0; i <= n; i++) {
    for (let ai = 0; ai < ALPHABET.length; ai++) {
      const c = ALPHABET[ai];
      out.add(w.slice(0, i) + c + w.slice(i));
    }
  }
  return out;
}

/**
 * @param {string} word
 * @param {number} maxOut
 * @returns {Set<string>}
 */
function edits2Bounded(word, maxOut = 800) {
  const out = new Set();
  for (const e1 of edits1(word)) {
    for (const e2 of edits1(e1)) {
      out.add(e2);
      if (out.size >= maxOut) return out;
    }
  }
  return out;
}

/**
 * @param {string} line
 * @returns {{ indexTerm: string, indexWords: string[], tail: string, lineFreqSum: number }}
 */
function parseGlobalIndexLine(line) {
  const idx = line.indexOf(' | ');
  if (idx === -1) {
    return {indexTerm: line.trim(), indexWords: [], tail: '', lineFreqSum: 0};
  }
  const indexTerm = line.slice(0, idx).trim();
  const tail = line.slice(idx + 3);
  const indexWords = indexTerm.split(/\s+/).filter(Boolean);
  const parts = tail.trim().split(/\s+/);
  let lineFreqSum = 0;
  for (let i = 1; i < parts.length; i += 2) {
    const f = parseInt(parts[i], 10);
    if (!Number.isNaN(f)) lineFreqSum += f;
  }
  return {indexTerm, indexWords, tail, lineFreqSum};
}

/**
 * Token vocabulary + popularity from global-index lines (any token in an ngram key).
 * @param {string[]} indexLines
 * @returns {{ vocab: Set<string>, score: Map<string, number> }}
 */
function buildVocabScoresFromIndexLines(indexLines) {
  /** @type {Map<string, number>} */
  const score = new Map();
  for (const line of indexLines) {
    if (!line.trim()) continue;
    const {indexWords, lineFreqSum} = parseGlobalIndexLine(line);
    const seen = new Set();
    for (const w of indexWords) {
      if (seen.has(w)) continue;
      seen.add(w);
      score.set(w, (score.get(w) || 0) + lineFreqSum);
    }
  }
  const vocab = new Set(score.keys());
  return {vocab, score};
}

/**
 * @param {string} token
 * @param {(c: string) => number} getScore
 * @returns {string | null}
 */
function bestCandidateForToken(token, getScore) {
  const t = String(token || '');
  if (!t) return null;
  const tried = new Set([t]);
  /** @type {Array<{c:string, s:number}>} */
  const ranked = [];

  function consider(set) {
    for (const c of set) {
      if (!c || tried.has(c)) continue;
      tried.add(c);
      const s = getScore(c);
      if (s > 0) ranked.push({c, s});
    }
  }

  consider(edits1(t));
  if (!ranked.length && t.length >= 6) consider(edits2Bounded(t, 600));

  if (!ranked.length) return null;
  ranked.sort((a, b) => b.s - a.s || a.c.localeCompare(b.c));
  return ranked[0].c;
}

/**
 * @param {string[]} tokens
 * @param {Set<string>} vocab
 * @param {Map<string, number>} score
 * @returns {string[] | null} corrected tokens, or null if nothing to change
 */
function suggestTokensArray(tokens, vocab, score) {
  const getScore = (c) => score.get(c) || 0;
  let changed = false;
  const out = tokens.map((tok) => {
    if (vocab.has(tok)) return tok;
    const rep = bestCandidateForToken(tok, getScore);
    if (rep && rep !== tok) {
      changed = true;
      return rep;
    }
    return tok;
  });
  return changed ? out : null;
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply token-level replacements on the original query (word boundaries).
 * @param {string} originalQuery
 * @param {string[]} oldTokens
 * @param {string[]} newTokens
 * @returns {string}
 */
function mergeTokenCorrectionsIntoQuery(originalQuery, oldTokens, newTokens) {
  let s = String(originalQuery || '');
  for (let i = 0; i < oldTokens.length; i++) {
    const from = oldTokens[i];
    const to = newTokens[i];
    if (!from || from === to) continue;
    const re = new RegExp(`\\b${escapeRe(from)}\\b`, 'gi');
    s = s.replace(re, to);
  }
  return s;
}

/**
 * @param {(c: string) => Promise<number>} getScoreAsync
 * @param {string} token
 * @returns {Promise<string | null>}
 */
async function bestCandidateForTokenAsync(token, getScoreAsync) {
  const t = String(token || '');
  if (!t) return null;
  const tried = new Set([t]);
  /** @type {Array<{c:string, s:number}>} */
  const ranked = [];

  async function consider(set) {
    for (const c of set) {
      if (!c || tried.has(c)) continue;
      tried.add(c);
      const s = await getScoreAsync(c);
      if (s > 0) ranked.push({c, s});
    }
  }

  await consider(edits1(t));
  if (!ranked.length && t.length >= 6) await consider(edits2Bounded(t, 600));
  if (!ranked.length) return null;
  ranked.sort((a, b) => b.s - a.s || a.c.localeCompare(b.c));
  return ranked[0].c;
}

module.exports = {
  ALPHABET,
  edits1,
  edits2Bounded,
  parseGlobalIndexLine,
  buildVocabScoresFromIndexLines,
  bestCandidateForToken,
  suggestTokensArray,
  mergeTokenCorrectionsIntoQuery,
  bestCandidateForTokenAsync,
};
