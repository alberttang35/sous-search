// @ts-check
const {JSDOM} = require('jsdom');
const {extractAnchorUrls} = require('./links.js');
const {isFoodComRecipeUrl} = require('./food.js');
const {extractLdJsonUrls} = require('./ldJsonItemList.js');

/**
 * @param {string} html
 * @param {string} pageUrl Used as JSDOM url + base for links.
 * @returns {import('jsdom').JSDOM}
 */
function parseHtml(html, pageUrl) {
  return new JSDOM(html, {url: pageUrl});
}

/**
 * Unique Food.com /recipe/ URLs from a parsed page.
 * JSON-LD ItemList URLs (e.g. Food.com hub) are merged first, then anchor hrefs.
 * @param {import('jsdom').JSDOM} dom
 * @param {string} baseUrl
 * @param {number} [maxLinks]
 * @returns {string[]}
 */
function extractFoodRecipeLinks(dom, baseUrl, maxLinks = 200) {
  const doc = dom.window.document;
  const seen = new Set();
  const out = [];
  const tryAdd = (/** @type {string} */ u) => {
    if (!isFoodComRecipeUrl(u) || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  for (const u of extractLdJsonUrls(doc)) {
    tryAdd(u);
    if (out.length >= maxLinks) return out;
  }
  for (const u of extractAnchorUrls(doc, baseUrl)) {
    tryAdd(u);
    if (out.length >= maxLinks) return out;
  }
  return out;
}

module.exports = {parseHtml, extractFoodRecipeLinks};
