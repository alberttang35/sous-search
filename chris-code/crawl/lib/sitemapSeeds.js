// @ts-check

/**
 * @typedef {Object} FetchTextOptions
 * @property {number} [maxBytes]
 * @property {number} [timeoutMs]
 * @property {string} [userAgent]
 */

const DEFAULT_UA = "SousSearchCrawler/1.0 (+education; sitemap)";

/**
 * @param {string} url
 * @param {FetchTextOptions} [options]
 * @returns {Promise<string | null>}
 */
async function fetchText(url, options = {}) {
  const maxBytes = options.maxBytes ?? 8_000_000;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const userAgent = options.userAgent ?? DEFAULT_UA;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "application/xml,text/xml,text/plain,*/*",
      },
    });
  } catch (_e) {
    clearTimeout(t);
    return null;
  }
  clearTimeout(t);

  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch (_e) {
    return null;
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * @param {string} xml
 * @returns {string[]}
 */
function parseSitemapLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u) out.push(u);
  }
  return out;
}

/**
 * @param {string} xml
 * @returns {boolean}
 */
function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * @param {string} robotsBody
 * @returns {string[]}
 */
function parseRobotsSitemaps(robotsBody) {
  const out = [];
  if (!robotsBody) return out;
  for (const line of robotsBody.split(/\r?\n/)) {
    const m = line.match(/^\s*Sitemap:\s*(.+)\s*$/i);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/**
 * @param {string} sitemapUrl
 * @param {FetchTextOptions} fetchOpts
 * @param {number} depth
 * @param {number} maxDepth
 * @param {Set<string>} seen
 * @returns {Promise<string[]>}
 */
async function collectLeafLocsRecursive(sitemapUrl, fetchOpts, depth, maxDepth, seen) {
  if (seen.has(sitemapUrl) || depth > maxDepth) return [];
  seen.add(sitemapUrl);

  const xml = await fetchText(sitemapUrl, fetchOpts);
  if (!xml || /<html[\s>]/i.test(xml) || /Just a moment/i.test(xml)) {
    return [];
  }

  const locs = parseSitemapLocs(xml);
  if (!locs.length) return [];

  if (isSitemapIndex(xml)) {
    const nested = [];
    for (const child of locs) {
      nested.push(
        ...(await collectLeafLocsRecursive(child, fetchOpts, depth + 1, maxDepth, seen)),
      );
    }
    return nested;
  }

  return locs;
}

/**
 * @typedef {Object} BuildSitemapSeedsOptions
 * @property {string} robotsUrl
 * @property {(url: string) => boolean} filterUrl
 * @property {FetchTextOptions} [fetch]
 * @property {number} [maxSitemapDepth]
 * @property {number} [maxUrls]
 */

/**
 * Discover page URLs from robots.txt → sitemap index / urlsets.
 * @param {BuildSitemapSeedsOptions} options
 * @returns {Promise<string[]>}
 */
async function buildSeedsFromRobots(options) {
  const fetchOpts = options.fetch || {};
  const maxDepth = options.maxSitemapDepth ?? 6;
  const maxUrls = options.maxUrls ?? Number.POSITIVE_INFINITY;
  const filterUrl = options.filterUrl;

  const robots = await fetchText(options.robotsUrl, fetchOpts);
  if (!robots) return [];

  const sitemapRoots = parseRobotsSitemaps(robots);
  const seen = new Set();
  /** @type {string[]} */
  const leaf = [];

  for (const root of sitemapRoots) {
    leaf.push(...(await collectLeafLocsRecursive(root, fetchOpts, 0, maxDepth, seen)));
    if (leaf.length >= maxUrls) break;
  }

  const out = [];
  const dedupe = new Set();
  for (const u of leaf) {
    if (dedupe.has(u)) continue;
    if (!filterUrl(u)) continue;
    dedupe.add(u);
    out.push(u);
    if (out.length >= maxUrls) break;
  }
  return out;
}

module.exports = {
  fetchText,
  parseSitemapLocs,
  parseRobotsSitemaps,
  buildSeedsFromRobots,
  isSitemapIndex,
};
