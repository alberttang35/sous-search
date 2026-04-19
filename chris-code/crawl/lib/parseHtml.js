// @ts-check
const { JSDOM } = require("jsdom");
const { extractAnchorUrls } = require("./links.js");
const { extractLdJsonUrls } = require("./ldJsonItemList.js");
const { getRecipeUrlPolicy } = require("./recipeUrlPolicy.js");

/**
 * @param {string} html
 * @param {string} pageUrl Used as JSDOM url + base for links.
 * @returns {import('jsdom').JSDOM}
 */
function parseHtml(html, pageUrl) {
  return new JSDOM(html, { url: pageUrl });
}

/**
 * Unique recipe detail URLs: JSON-LD ItemList / ListItem first, then anchor hrefs.
 * @param {import('jsdom').JSDOM} dom
 * @param {string} baseUrl
 * @param {import('./recipeUrlPolicy.js').RecipeUrlPolicy} policy
 * @param {number} [maxLinks]
 * @returns {string[]}
 */
function extractFrontierLinks(dom, baseUrl, policy, maxLinks = 200) {
  const doc = dom.window.document;
  const seen = new Set();
  const out = [];
  const { isRecipeDetailUrl } = policy;
  const tryAdd = (/** @type {string} */ u) => {
    if (!isRecipeDetailUrl(u) || seen.has(u)) return;
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

/**
 * @deprecated Use extractFrontierLinks with getRecipeUrlPolicy('food_only').
 * @param {import('jsdom').JSDOM} dom
 * @param {string} baseUrl
 * @param {number} [maxLinks]
 * @returns {string[]}
 */
function extractFoodRecipeLinks(dom, baseUrl, maxLinks = 200) {
  return extractFrontierLinks(dom, baseUrl, getRecipeUrlPolicy("food_only"), maxLinks);
}

module.exports = { parseHtml, extractFrontierLinks, extractFoodRecipeLinks };
