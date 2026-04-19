// @ts-check
const {allStoreGetPromise} = require('../storeUtil.js');
const {
  GID_INDEX_POSTINGS,
  GID_INDEX_DOCMETA,
  GID_INDEX_ATTR_DIETARY,
  GID_INDEX_ATTR_APPLIANCE,
  GID_INDEX_ATTR_CATEGORY,
  GID_INDEX_ATTR_TIMEBUCKET,
} = require('./indexGids.js');
const {tokenizeText} = require('./indexTokens.js');

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
  const score = new Map();

  for (const term of parsed.textTerms) {
    const postings = await getPostings(term);
    for (const p of postings) {
      if (structuredCandidateSet && !structuredCandidateSet.has(p.doc_id)) continue;
      score.set(p.doc_id, (score.get(p.doc_id) || 0) + Number(p.tf || 1));
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
    const meta = await getDocMeta(docId);
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

  return {
    query,
    parsed,
    total_hits: hits.length,
    hits,
  };
}

module.exports = {
  parseHybridQuery,
  runHybridQuery,
};
