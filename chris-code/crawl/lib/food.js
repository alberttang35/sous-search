// @ts-check
const {URL} = require('url');

/**
 * @param {string} hostname
 * @returns {boolean}
 */
function isFoodComHost(hostname) {
  const h = hostname.toLowerCase();
  return h === 'food.com' || h === 'www.food.com';
}

/**
 * Food.com recipe listing / detail URLs (aligned with crawling only /recipe/ paths).
 * @param {string} urlStr
 * @returns {boolean}
 */
function isFoodComRecipeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!isFoodComHost(u.hostname)) return false;
    return /\/recipe\//i.test(u.pathname);
  } catch (_e) {
    return false;
  }
}

module.exports = {isFoodComHost, isFoodComRecipeUrl};
