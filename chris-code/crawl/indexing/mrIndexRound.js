// @ts-check
const {normalizeCrawlDoc} = require('./normalize.js');
const {applyLlmFallback} = require('./llmFallback.js');
const {buildTermMap, timeBucket} = require('./indexTokens.js');
const {
  GID_INDEX_POSTINGS,
  GID_INDEX_DOCMETA,
  GID_INDEX_STATS,
  GID_INDEX_ATTR_DIETARY,
  GID_INDEX_ATTR_APPLIANCE,
  GID_INDEX_ATTR_CATEGORY,
  GID_INDEX_ATTR_TIMEBUCKET,
} = require('./indexGids.js');
const {allStorePutPromise, allStoreAppendPromise} = require('../storeUtil.js');

const PREFIX_POST = 'post:';
const PREFIX_META = 'meta:';
const PREFIX_ATTR = 'attr:';
const PREFIX_PG = 'pg:';
const PREFIX_STAT = 'stat:';
const PREFIX_DF = 'df:';

/**
 * @typedef {Object} IndexMrOpts
 * @property {{withFallback?: boolean, writePostgres?: boolean}} [build]
 * @property {{"stats"}} [stats]
 */

/**
 * @returns {IndexMrOpts}
 */
function getMrOpts() {
  if (!globalThis.__sousIndexMrOpts) {
    globalThis.__sousIndexMrOpts = {};
  }
  return globalThis.__sousIndexMrOpts;
}

/**
 * @returns {Promise<import('pg').Pool>}
 */
async function getPgPool() {
  if (!globalThis.__sousIndexPgPool) {
    const {createPoolFromEnv} = require('./db.js');
    globalThis.__sousIndexPgPool = createPoolFromEnv();
  }
  return globalThis.__sousIndexPgPool;
}

/**
 * @param {ReturnType<import('./normalize.js').normalizeCrawlDoc>} recipe
 * @returns {Promise<void>}
 */
async function writeRecipeToPostgres(recipe) {
  const {writeCanonicalRecipe} = require('./db.js');
  const pool = await getPgPool();
  const client = await pool.connect();
  try {
    await writeCanonicalRecipe(client, recipe);
  } finally {
    client.release();
  }
}

/**
 * @param {string} docKey
 * @param {any} rawDoc
 * @returns {Promise<object[]>}
 */
async function runBuildMapFromGlobal(docKey, rawDoc) {
  const opts = getMrOpts().build || {};
  if (!rawDoc || typeof rawDoc !== 'object' || !rawDoc.url) return [];

  const normalized = normalizeCrawlDoc({
    ...rawDoc,
    rawHtmlRef: rawDoc.url,
  });

  const recipe = await applyLlmFallback(
      normalized,
      opts.withFallback === false ? {llmClient: async () => null} : {},
  );

  const termMap = buildTermMap(recipe);
  const emits = [];

  for (const [term, info] of termMap.entries()) {
    emits.push({
      [`${PREFIX_POST}${term}`]: {
        doc_id: recipe.recipe_id,
        source_url: recipe.source_url,
        tf: info.tf,
        positions: info.positions,
      },
    });
  }

  const uniqueTerms = [...termMap.keys()];
  const docMeta = {
    doc_id: recipe.recipe_id,
    source_url: recipe.source_url,
    title: recipe.title,
    total_minutes: recipe.times.total_minutes ?? null,
    dietary_tags: recipe.dietary_tags || [],
    appliance_tags: recipe.appliance_tags || [],
    categories: recipe.categories || [],
    snippet: (recipe.steps_raw || []).slice(0, 2).join(' ').slice(0, 280),
    doc_length: uniqueTerms.length,
    unique_terms: uniqueTerms,
  };
  emits.push({[`${PREFIX_META}${recipe.recipe_id}`]: docMeta});

  const attrTags = [
    ...recipe.dietary_tags.map((tag) => `dietary:${String(tag).toLowerCase()}`),
    ...recipe.appliance_tags.map((tag) => `appliance:${String(tag).toLowerCase()}`),
    ...recipe.categories.map((tag) => `category:${String(tag).toLowerCase()}`),
    `timebucket:${timeBucket(recipe.times.total_minutes ?? null)}`,
  ];
  for (const attrKey of attrTags) {
    emits.push({
      [`${PREFIX_ATTR}${attrKey}`]: {doc_id: recipe.recipe_id, source_url: recipe.source_url},
    });
  }

  if (opts.writePostgres) {
    emits.push({[`${PREFIX_PG}${recipe.source_url}`]: recipe});
  }

  emits.push({[`status:${docKey}`]: {indexed: true, source_url: recipe.source_url}});
  return emits;
}

/**
 * @param {string} key
 * @param {any[]} values
 * @returns {Promise<object>}
 */
async function runBuildReduceFromGlobal(key, values) {
  if (!values || !values.length) return {key, wrote: false};

  if (key.startsWith(PREFIX_POST)) {
    const term = key.slice(PREFIX_POST.length);
    const merged = [];
    for (const v of values) {
      if (v && typeof v === 'object' && v.doc_id) merged.push(v);
    }
    await allStorePutPromise(merged, {key: term, gid: GID_INDEX_POSTINGS});
    return {type: 'postings', key: term, count: merged.length};
  }

  if (key.startsWith(PREFIX_META)) {
    const meta = values[0];
    if (meta && meta.doc_id) {
      await allStorePutPromise(meta, {key: meta.doc_id, gid: GID_INDEX_DOCMETA});
      return {type: 'docmeta', key: meta.doc_id};
    }
  }

  if (key.startsWith(PREFIX_ATTR)) {
    const attr = key.slice(PREFIX_ATTR.length);
    const seen = new Set();
    const docs = [];
    for (const v of values) {
      if (!v || !v.doc_id || seen.has(v.doc_id)) continue;
      seen.add(v.doc_id);
      docs.push(v);
    }
    const [attrType, ...parts] = attr.split(':');
    const attrKey = parts.join(':');
    if (!attrType || !attrKey) return {key, skipped: true};
    const gidMap = {
      dietary: GID_INDEX_ATTR_DIETARY,
      appliance: GID_INDEX_ATTR_APPLIANCE,
      category: GID_INDEX_ATTR_CATEGORY,
      timebucket: GID_INDEX_ATTR_TIMEBUCKET,
    };
    const gid = gidMap[attrType];
    if (!gid) return {key, skipped: true};
    await allStorePutPromise(docs, {key: attrKey, gid});
    return {type: 'attr', gid, key: attrKey, count: docs.length};
  }

  if (key.startsWith(PREFIX_PG)) {
    const recipe = values[0];
    if (recipe && recipe.recipe_id && recipe.source_url) {
      await writeRecipeToPostgres(recipe);
      return {type: 'postgres', key: recipe.source_url};
    }
  }

  return {type: 'status', key};
}

/**
 * @param {string} docId
 * @param {any} docMeta
 * @returns {Promise<object[]>}
 */
async function runStatsMapFromGlobal(docId, docMeta) {
  if (!docMeta || typeof docMeta !== 'object') return [];
  const emits = [
    {[`${PREFIX_STAT}doc_count`]: 1},
    {[`${PREFIX_STAT}doc_len_sum`]: Number(docMeta.doc_length || 0)},
  ];
  const uniqueTerms = Array.isArray(docMeta.unique_terms) ? docMeta.unique_terms : [];
  for (const term of uniqueTerms) {
    emits.push({[`${PREFIX_DF}${term}`]: 1});
  }
  return emits;
}

/**
 * @param {string} key
 * @param {number[]} values
 * @returns {Promise<object>}
 */
async function runStatsReduceFromGlobal(key, values) {
  const sum = (values || []).reduce((acc, x) => acc + Number(x || 0), 0);
  if (key.startsWith(PREFIX_STAT)) {
    const statKey = key.slice(PREFIX_STAT.length);
    await allStorePutPromise(sum, {key: statKey, gid: GID_INDEX_STATS});
    return {type: 'stat', key: statKey, value: sum};
  }
  if (key.startsWith(PREFIX_DF)) {
    const term = key.slice(PREFIX_DF.length);
    await allStorePutPromise(sum, {key: `df:${term}`, gid: GID_INDEX_STATS});
    return {type: 'df', key: term, value: sum};
  }
  return {key, skipped: true};
}

globalThis.__sousIndexMrRunBuildMap = runBuildMapFromGlobal;
globalThis.__sousIndexMrRunBuildReduce = runBuildReduceFromGlobal;
globalThis.__sousIndexMrRunStatsMap = runStatsMapFromGlobal;
globalThis.__sousIndexMrRunStatsReduce = runStatsReduceFromGlobal;

/**
 * @param {{withFallback?: boolean, writePostgres?: boolean}} opts
 * @returns {(docKey:string, rawDoc:any)=>Promise<object[]>}
 */
function createIndexBuildMapper(opts) {
  getMrOpts().build = {
    withFallback: opts.withFallback !== false,
    writePostgres: !!opts.writePostgres,
  };
  return async function indexBuildMapThin(docKey, rawDoc) {
    return globalThis.__sousIndexMrRunBuildMap(docKey, rawDoc);
  };
}

/**
 * @returns {(key:string, values:any[])=>Promise<object>}
 */
function createIndexBuildReducer() {
  return async function indexBuildReduceThin(key, values) {
    return globalThis.__sousIndexMrRunBuildReduce(key, values);
  };
}

/**
 * @returns {(docId:string, docMeta:any)=>Promise<object[]>}
 */
function createIndexStatsMapper() {
  return async function indexStatsMapThin(docId, docMeta) {
    return globalThis.__sousIndexMrRunStatsMap(docId, docMeta);
  };
}

/**
 * @returns {(key:string, values:number[])=>Promise<object>}
 */
function createIndexStatsReducer() {
  return async function indexStatsReduceThin(key, values) {
    return globalThis.__sousIndexMrRunStatsReduce(key, values);
  };
}

/**
 * @returns {Promise<void>}
 */
async function closePostgresIfOpen() {
  if (!globalThis.__sousIndexPgPool) return;
  await globalThis.__sousIndexPgPool.end();
  globalThis.__sousIndexPgPool = null;
}

module.exports = {
  createIndexBuildMapper,
  createIndexBuildReducer,
  createIndexStatsMapper,
  createIndexStatsReducer,
  closePostgresIfOpen,
};
