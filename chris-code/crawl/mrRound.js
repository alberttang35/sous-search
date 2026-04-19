// @ts-check
/**
 * MapReduce serializes mapper/reducer functions over the wire; closures are lost. Crawl logic lives in
 * globalThis.__sousCrawlMrRunMap / __sousCrawlMrRunReduce; createCrawlMapper only publishes opts to
 * globalThis.__sousCrawlMrOpts and returns a thin wrapper that survives deserialization (multi-node:
 * require this module on every node so those globals exist).
 */
const { fetchPage } = require("./lib/fetchPage.js");
const { parseHtml, extractFoodRecipeLinks } = require("./lib/parseHtml.js");
const { extractCrawlDoc } = require("./lib/recipeExtract.js");
const { localStorePutPromise, allStorePutPromise, allStoreGetPromise } = require("./storeUtil.js");
const { GID_VISITED, GID_DOCS } = require("./gids.js");

/**
 * @typedef {Object} FrontierMeta
 * @property {number} [depth]
 * @property {string | null} [parent]
 */

/**
 * @typedef {Object} CrawlMrOpts
 * @property {{ maxDepth?: number, maxOutlinks?: number, fetchOptions?: import('./lib/fetchPage.js').FetchPageOptions }} [map]
 * @property {{ nextFrontierGid?: string, maxDepth?: number }} [reduce]
 */

/**
 * @param {FrontierMeta[]} metas
 * @returns {FrontierMeta}
 */
function mergeFrontierMetas(metas) {
  let best = metas[0] || { depth: 0, parent: null };
  let minD = best.depth ?? 0;
  for (let i = 1; i < metas.length; i++) {
    const m = metas[i];
    const d = m.depth ?? 0;
    if (d < minD) {
      minD = d;
      best = m;
    }
  }
  return { depth: best.depth ?? 0, parent: best.parent ?? null };
}

/**
 * @returns {CrawlMrOpts}
 */
function getMrOpts() {
  if (!globalThis.__sousCrawlMrOpts) {
    globalThis.__sousCrawlMrOpts = {};
  }
  return globalThis.__sousCrawlMrOpts;
}

/**
 * @param {string} urlKey
 * @param {FrontierMeta | string} rawMeta
 */
async function runMapFromGlobal(urlKey, rawMeta) {
  const opts = getMrOpts().map;
  if (!opts) {
    throw new Error("sous crawl: map opts missing (__sousCrawlMrOpts.map)");
  }
  const maxDepth = opts.maxDepth ?? 8;
  const maxOutlinks = opts.maxOutlinks ?? 150;
  const fetchOptions = opts.fetchOptions || {};

  /** @type {FrontierMeta} */
  const meta =
    typeof rawMeta === "object" && rawMeta && !Array.isArray(rawMeta)
      ? /** @type {FrontierMeta} */ (rawMeta)
      : { depth: 0, parent: null };
  const depth = meta.depth ?? 0;
  if (depth > maxDepth) return [];

  try {
    await allStoreGetPromise({ key: urlKey, gid: GID_VISITED });
    return [];
  } catch (_e) {
    // not visited cluster-wide
  }

  const fetched = await fetchPage(urlKey, fetchOptions);
  if (!fetched || !fetched.html) return [];

  await allStorePutPromise(true, { key: urlKey, gid: GID_VISITED });

  const pageUrl = fetched.finalUrl || urlKey;
  const doc = extractCrawlDoc(fetched.html, pageUrl);
  await localStorePutPromise(doc, { key: urlKey, gid: GID_DOCS });

  const dom = parseHtml(fetched.html, pageUrl);
  const links = extractFoodRecipeLinks(dom, pageUrl, maxOutlinks);
  const nextDepth = depth + 1;
  const out = [];
  const seen = new Set();
  for (const link of links) {
    if (seen.has(link)) continue;
    seen.add(link);
    out.push({ [link]: { depth: nextDepth, parent: urlKey } });
  }
  return out;
}

/**
 * @param {string} targetUrl
 * @param {FrontierMeta[]} valueArray
 */
async function runReduceFromGlobal(targetUrl, valueArray) {
  const ro = getMrOpts().reduce;
  if (!ro || !ro.nextFrontierGid) {
    throw new Error("sous crawl: reduce opts missing (__sousCrawlMrOpts.reduce)");
  }
  const maxDepth = ro.maxDepth ?? 8;
  const nextFrontierGid = ro.nextFrontierGid;

  const merged = mergeFrontierMetas(valueArray);
  if ((merged.depth ?? 0) > maxDepth) return { url: targetUrl, added: false };

  try {
    await allStoreGetPromise({ key: targetUrl, gid: GID_VISITED });
    return { url: targetUrl, added: false };
  } catch (_e) {
    // not yet crawled
  }

  await allStorePutPromise(merged, { key: targetUrl, gid: nextFrontierGid });
  return { url: targetUrl, added: true };
}

globalThis.__sousCrawlMrRunMap = runMapFromGlobal;
globalThis.__sousCrawlMrRunReduce = runReduceFromGlobal;

/**
 * @param {Object} opts
 * @param {number} opts.maxDepth
 * @param {number} opts.maxOutlinks
 * @param {import('./lib/fetchPage.js').FetchPageOptions} [opts.fetchOptions]
 */
function createCrawlMapper(opts) {
  getMrOpts().map = {
    maxDepth: opts.maxDepth,
    maxOutlinks: opts.maxOutlinks,
    fetchOptions: opts.fetchOptions || {},
  };
  return async function crawlMapThin(urlKey, rawMeta) {
    return globalThis.__sousCrawlMrRunMap(urlKey, rawMeta);
  };
}

/**
 * @param {Object} opts
 * @param {string} opts.nextFrontierGid
 * @param {number} opts.maxDepth
 */
function createCrawlReducer(opts) {
  getMrOpts().reduce = {
    nextFrontierGid: opts.nextFrontierGid,
    maxDepth: opts.maxDepth,
  };
  return async function crawlReduceThin(targetUrl, valueArray) {
    return globalThis.__sousCrawlMrRunReduce(targetUrl, valueArray);
  };
}

module.exports = { createCrawlMapper, createCrawlReducer, mergeFrontierMetas };
