// @ts-check
const {convert} = require('html-to-text');

/**
 * @typedef {Object} RecipeTimes
 * @property {number} [totalMinutes]
 * @property {number} [prepMinutes]
 * @property {number} [cookMinutes]
 */

/**
 * @typedef {Object} CrawlDocRecord
 * @property {string} url
 * @property {string} [title]
 * @property {string} [text]
 * @property {RecipeTimes} [times]
 * @property {string[]} [ingredients]
 * @property {string[]} [categories]
 */

const textOpts = {wordwrap: false, preserveNewlines: false};

/**
 * Parse ISO 8601 duration to total minutes (PT25M, PT1H30M, etc.).
 * @param {string} d
 * @returns {number | undefined}
 */
function iso8601DurationToMinutes(d) {
  if (!d || typeof d !== 'string') return undefined;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return undefined;
  const h = parseInt(m[1] || '0', 10) || 0;
  const min = parseInt(m[2] || '0', 10) || 0;
  const s = parseInt(m[3] || '0', 10) || 0;
  return Math.round(h * 60 + min + s / 60);
}

/**
 * @param {unknown} node
 * @returns {RecipeTimes | undefined}
 */
function timesFromSchema(node) {
  if (!node || typeof node !== 'object') return undefined;
  const o = /** @type {Record<string, unknown>} */ (node);
  const total =
    iso8601DurationToMinutes(/** @type {string} */ (o.totalTime)) ??
    iso8601DurationToMinutes(/** @type {string} */ (o.timeRequired));
  const prep = iso8601DurationToMinutes(/** @type {string} */ (o.prepTime));
  const cook = iso8601DurationToMinutes(/** @type {string} */ (o.cookTime));
  const t = /** @type {RecipeTimes} */ ({});
  if (total !== undefined) t.totalMinutes = total;
  if (prep !== undefined) t.prepMinutes = prep;
  if (cook !== undefined) t.cookMinutes = cook;
  return Object.keys(t).length ? t : undefined;
}

/**
 * @param {unknown} x
 * @returns {unknown[]}
 */
function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Walk @graph / arrays to find first Recipe object.
 * @param {unknown} data
 * @returns {Record<string, unknown> | null}
 */
function findRecipeObject(data) {
  if (!data || typeof data !== 'object') return null;
  const root = /** @type {Record<string, unknown>} */ (data);
  if (root['@type'] === 'Recipe' || (Array.isArray(root['@type']) && root['@type'].includes('Recipe'))) {
    return root;
  }
  const graph = root['@graph'];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const r = findRecipeObject(item);
      if (r) return r;
    }
  }
  return null;
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @returns {CrawlDocRecord}
 */
function extractCrawlDoc(html, pageUrl) {
  /** @type {CrawlDocRecord} */
  const doc = {url: pageUrl, text: convert(html, textOpts)};

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) doc.title = titleMatch[1].trim();

  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (scripts) {
    for (const block of scripts) {
      const jsonMatch = block.match(/>([\s\S]*)<\/script>/i);
      if (!jsonMatch) continue;
      let data;
      try {
        data = JSON.parse(jsonMatch[1].trim());
      } catch (_e) {
        continue;
      }
      for (const piece of asArray(data)) {
        const recipe = findRecipeObject(piece);
        if (!recipe) continue;
        if (recipe.name && typeof recipe.name === 'string') doc.title = recipe.name;
        const t = timesFromSchema(recipe);
        if (t) doc.times = t;
        const ing = recipe.recipeIngredient;
        if (Array.isArray(ing)) {
          doc.ingredients = ing.map((x) => String(x));
        } else if (typeof ing === 'string') {
          doc.ingredients = [ing];
        }
        const cat = recipe.recipeCategory;
        if (Array.isArray(cat)) {
          doc.categories = cat.map((x) => String(x));
        } else if (typeof cat === 'string') {
          doc.categories = [cat];
        }
        break;
      }
    }
  }

  if (!doc.times) {
    const bodyMatch = doc.text?.match(/(?:total|prep|cook)\s*time\s*[:\s]*(\d+)\s*(?:min|minutes)/i);
    if (bodyMatch) {
      doc.times = {totalMinutes: parseInt(bodyMatch[1], 10)};
    }
  }

  return doc;
}

module.exports = {
  extractCrawlDoc,
  iso8601DurationToMinutes,
};
