// @ts-check
const {allStoreGetPromise} = require('../storeUtil.js');
const {
  GID_INDEX_POSTINGS,
  GID_INDEX_DOCMETA,
  GID_INDEX_STATS,
  GID_INDEX_ATTR_DIETARY,
  GID_INDEX_ATTR_APPLIANCE,
  GID_INDEX_ATTR_CATEGORY,
  GID_INDEX_ATTR_TIMEBUCKET,
} = require('./indexGids.js');
const {tokenizeText} = require('./indexTokens.js');
const {
  mergeTokenCorrectionsIntoQuery,
  bestCandidateForTokenAsync,
  bestCandidateForToken,
} = require('./spellSuggest.js');

const KNOWN_DIETARY = ['vegetarian', 'vegan', 'dairy-free', 'gluten-free', 'contains-gluten'];
const KNOWN_APPLIANCE = ['oven', 'air fryer', 'grill', 'stovetop', 'microwave', 'blender', 'instant pot', 'slow cooker'];

/**
 * @param {string} q
 * @returns {{dietary:string[], appliance:string[], category:string[], timebucket:string[], textTerms:string[]}}
 */
function parseHybridQuery(q) {
  const original = String(q || '').trim().toLowerCase();
  const dietary = [];
  const appliance = [];
  const category = [];
  const timebucket = [];
  let residue = original;

  for (const tag of KNOWN_DIETARY) {
    if (residue.includes(tag)) {
      dietary.push(tag);
      residue = residue.replaceAll(tag, ' ');
    }
  }
  for (const tag of KNOWN_APPLIANCE) {
    if (residue.includes(tag)) {
      appliance.push(tag);
      residue = residue.replaceAll(tag, ' ');
    }
  }

  const underMatch = residue.match(/under\s+(\d+)\s*(minutes|minute|mins|min)?/);
  if (underMatch) {
    const n = Number(underMatch[1]);
    if (n <= 15) timebucket.push('le15');
    else if (n <= 30) timebucket.push('le30');
    else if (n <= 60) timebucket.push('le60');
    else timebucket.push('gt60');
    residue = residue.replace(underMatch[0], ' ');
  }

  const categoryMatch = residue.match(/category:([a-z0-9-]+)/g) || [];
  for (const m of categoryMatch) {
    const c = m.split(':')[1];
    if (c) category.push(c);
    residue = residue.replace(m, ' ');
  }

  const textTerms = tokenizeText(residue).filter((t) => t !== 'recipe');
  return {dietary, appliance, category, timebucket, textTerms};
}

/**
 * @param {string} gid
 * @param {string} key
 * @returns {Promise<Array<{doc_id:string, source_url:string}>>}
 */
async function getAttrDocs(gid, key) {
  try {
    const rows = await allStoreGetPromise({key, gid});
    if (!Array.isArray(rows)) return [];
    return rows.filter((x) => x && x.doc_id);
  } catch (_e) {
    return [];
  }
}

/**
 * @param {string} term
 * @returns {Promise<Array<{doc_id:string, source_url:string, tf:number}>>}
 */
async function getPostings(term) {
  try {
    const rows = await allStoreGetPromise({key: term, gid: GID_INDEX_POSTINGS});
    if (!Array.isArray(rows)) return [];
    return rows.filter((x) => x && x.doc_id);
  } catch (_e) {
    return [];
  }
}

/**
 * @param {string} term
 * @returns {Promise<number>}
 */
async function getDocFrequency(term) {
  try {
    const v = await allStoreGetPromise({key: `df:${term}`, gid: GID_INDEX_STATS});
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_e) {
    return 0;
  }
}

/**
 * @returns {Promise<{docCount:number, avgDocLength:number}>}
 */
async function getCorpusStats() {
  try {
    const [docCountRaw, docLenSumRaw] = await Promise.all([
      allStoreGetPromise({key: 'doc_count', gid: GID_INDEX_STATS}),
      allStoreGetPromise({key: 'doc_len_sum', gid: GID_INDEX_STATS}),
    ]);
    const docCount = Number(docCountRaw);
    const docLenSum = Number(docLenSumRaw);
    if (!Number.isFinite(docCount) || docCount <= 0) {
      return {docCount: 0, avgDocLength: 1};
    }
    const avgDocLength = Number.isFinite(docLenSum) && docLenSum > 0 ?
      (docLenSum / docCount) :
      1;
    return {docCount, avgDocLength: Math.max(1, avgDocLength)};
  } catch (_e) {
    return {docCount: 0, avgDocLength: 1};
  }
}

/**
 * @param {number} tf
 * @param {number} df
 * @param {number} docLength
 * @param {{docCount:number, avgDocLength:number}} corpus
 * @returns {number}
 */
function bm25TermScore(tf, df, docLength, corpus) {
  const safeTf = Number(tf);
  if (!Number.isFinite(safeTf) || safeTf <= 0) return 0;
  const N = Number(corpus.docCount);
  const safeDf = Number(df);
  if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(safeDf) || safeDf <= 0) {
    return safeTf;
  }
  const dl = Math.max(1, Number(docLength) || 1);
  const avgdl = Math.max(1, Number(corpus.avgDocLength) || 1);
  const k1 = 1.2;
  const b = 0.75;
  const idf = Math.log(1 + ((N - safeDf + 0.5) / (safeDf + 0.5)));
  const denom = safeTf + k1 * (1 - b + b * (dl / avgdl));
  if (denom <= 0) return 0;
  return idf * ((safeTf * (k1 + 1)) / denom);
}

/**
 * @param {string} c
 * @returns {Promise<number>}
 */
async function corpusScoreForCandidate(c) {
  const d = await getDocFrequency(c);
  if (d > 0) return d;
  const rows = await getPostings(c);
  return rows.length;
}

/**
 * @param {string} s
 * @returns {string}
 */
function normalizeTagToken(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * @param {Array<{gid:string, key:string}>} entries
 * @returns {Promise<Map<string, number>>}
 */
async function buildTagScoreMap(entries) {
  const score = new Map();
  for (const ent of entries) {
    const rows = await getAttrDocs(ent.gid, ent.key);
    if (!rows.length) continue;
    score.set(normalizeTagToken(ent.key), rows.length);
  }
  return score;
}

/**
 * @param {string} token
 * @param {Map<string, number>} tagScoreByNormalized
 * @param {Map<string, string>} normalizedToCanonical
 * @returns {string|null}
 */
function bestStructuredTagCandidate(token, tagScoreByNormalized, normalizedToCanonical) {
  const normalized = normalizeTagToken(token);
  if (!normalized) return null;
  const repNormalized = bestCandidateForToken(
      normalized,
      (c) => tagScoreByNormalized.get(c) || 0,
  );
  if (!repNormalized) return null;
  return normalizedToCanonical.get(repNormalized) || null;
}

/**
 * When there are no hits, suggest corrected text terms using edit distance + df/postings.
 * @param {string} query
 * @param {{ textTerms: string[] }} parsed
 * @returns {Promise<null | { text_terms_before: string[], text_terms_after: string[], suggested_query: string }>}
 */
async function buildDidYouMean(query, parsed) {
  const terms = parsed.textTerms || [];
  if (!terms.length) return null;
  const knownTagEntries = [
    ...KNOWN_DIETARY.map((x) => ({gid: GID_INDEX_ATTR_DIETARY, key: x})),
    ...KNOWN_APPLIANCE.map((x) => ({gid: GID_INDEX_ATTR_APPLIANCE, key: x})),
  ];
  const tagScoreByNormalized = await buildTagScoreMap(knownTagEntries);
  const normalizedToCanonical = new Map();
  for (const ent of knownTagEntries) {
    const n = normalizeTagToken(ent.key);
    if (n && tagScoreByNormalized.has(n)) normalizedToCanonical.set(n, ent.key);
  }

  /** @type {string[]} */
  const after = [...terms];
  let changed = false;
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const postings = await getPostings(t);
    if (postings.length) continue;
    let rep = await bestCandidateForTokenAsync(t, corpusScoreForCandidate);
    if (!rep) {
      rep = bestStructuredTagCandidate(t, tagScoreByNormalized, normalizedToCanonical);
    }
    if (rep && rep !== t) {
      after[i] = rep;
      changed = true;
    }
  }
  if (!changed) return null;
  const suggested_query = mergeTokenCorrectionsIntoQuery(query, terms, after);
  return {
    text_terms_before: terms,
    text_terms_after: after,
    suggested_query,
  };
}

/**
 * @param {string} docId
 * @returns {Promise<any|null>}
 */
async function getDocMeta(docId) {
  try {
    return await allStoreGetPromise({key: docId, gid: GID_INDEX_DOCMETA});
  } catch (_e) {
    return null;
  }
}

/**
 * @param {Array<Set<string>>} sets
 * @returns {Set<string>}
 */
function intersectSets(sets) {
  if (!sets.length) return new Set();
  const sorted = sets.slice().sort((a, b) => a.size - b.size);
  const out = new Set();
  for (const id of sorted[0]) {
    if (sorted.every((s) => s.has(id))) out.add(id);
  }
  return out;
}

/**
 * @param {string} query
 * @param {number} limit
 */
async function runHybridQuery(query, limit = 20) {
  const parsed = parseHybridQuery(query);
  /** @type {Array<Set<string>>} */
  const structuredSets = [];

  for (const d of parsed.dietary) {
    const rows = await getAttrDocs(GID_INDEX_ATTR_DIETARY, d);
    structuredSets.push(new Set(rows.map((r) => r.doc_id)));
  }
  for (const a of parsed.appliance) {
    const rows = await getAttrDocs(GID_INDEX_ATTR_APPLIANCE, a);
    structuredSets.push(new Set(rows.map((r) => r.doc_id)));
  }
  for (const c of parsed.category) {
    const rows = await getAttrDocs(GID_INDEX_ATTR_CATEGORY, c);
    structuredSets.push(new Set(rows.map((r) => r.doc_id)));
  }
  for (const t of parsed.timebucket) {
    const rows = await getAttrDocs(GID_INDEX_ATTR_TIMEBUCKET, t);
    structuredSets.push(new Set(rows.map((r) => r.doc_id)));
  }

  const structuredCandidateSet = structuredSets.length ? intersectSets(structuredSets) : null;
  const corpus = await getCorpusStats();
  const queryTerms = [...new Set(parsed.textTerms)];
  const dfPairs = await Promise.all(queryTerms.map(async (term) => [term, await getDocFrequency(term)]));
  const dfByTerm = new Map(dfPairs);
  const docLengthById = new Map();
  const docMetaById = new Map();
  const score = new Map();

  for (const term of queryTerms) {
    const postings = await getPostings(term);
    const df = dfByTerm.get(term) || postings.length || 0;
    for (const p of postings) {
      if (structuredCandidateSet && !structuredCandidateSet.has(p.doc_id)) continue;
      if (!docLengthById.has(p.doc_id)) {
        const meta = await getDocMeta(p.doc_id);
        docMetaById.set(p.doc_id, meta);
        const docLength = meta && Number.isFinite(Number(meta.doc_length)) ?
          Number(meta.doc_length) :
          1;
        docLengthById.set(p.doc_id, Math.max(1, docLength));
      }
      const bm25 = bm25TermScore(
          Number(p.tf || 1),
          df,
          docLengthById.get(p.doc_id) || 1,
          corpus,
      );
      score.set(p.doc_id, (score.get(p.doc_id) || 0) + bm25);
    }
  }

  // If query is structured-only, use structured candidates with flat score.
  if (!parsed.textTerms.length && structuredCandidateSet) {
    for (const docId of structuredCandidateSet) score.set(docId, 1);
  }

  const ranked = [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, limit));

  const hits = [];
  for (const [docId, s] of ranked) {
    const cachedMeta = docMetaById.get(docId);
    const meta = cachedMeta === undefined ? await getDocMeta(docId) : cachedMeta;
    if (!meta) continue;
    hits.push({
      score: s,
      doc_id: docId,
      title: meta.title,
      source_url: meta.source_url,
      snippet: meta.snippet || '',
      dietary_tags: meta.dietary_tags || [],
      appliance_tags: meta.appliance_tags || [],
      categories: meta.categories || [],
      total_minutes: meta.total_minutes ?? null,
    });
  }

  const out = {
    query,
    parsed,
    total_hits: hits.length,
    hits,
  };

  if (hits.length === 0 && parsed.textTerms.length) {
    const didYouMean = await buildDidYouMean(query, parsed);
    if (didYouMean) {
      out.did_you_mean = didYouMean;
    }
  }

  return out;
}

module.exports = {
  parseHybridQuery,
  runHybridQuery,
};
