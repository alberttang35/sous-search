// @ts-check
const {URL} = require('url');

/**
 * Match getURLs.js base URL handling: strip trailing index.html or ensure trailing slash.
 * @param {string} baseURL
 * @returns {string}
 */
function adjustBaseURL(baseURL) {
  if (baseURL.endsWith('index.html')) {
    return baseURL.slice(0, baseURL.length - 'index.html'.length);
  }
  return baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
}

/**
 * Resolve href against base and strip query + fragment (same as getURLs.js).
 * @param {string} href
 * @param {string} baseURL
 * @returns {string}
 */
function normalizeUrl(href, baseURL) {
  const absoluteURL = new URL(href, adjustBaseURL(baseURL)).href;
  return absoluteURL.split(/[?#]/)[0];
}

/**
 * @param {import('jsdom').DOMWindow['document']} document
 * @param {string} baseURL
 * @returns {string[]}
 */
function extractAnchorUrls(document, baseURL) {
  const anchorElements = document.querySelectorAll('a[href]');
  const out = [];
  for (const anchorElement of anchorElements) {
    const href = anchorElement.getAttribute('href');
    if (!href) continue;
    try {
      out.push(normalizeUrl(href, baseURL));
    } catch (_e) {
      // ignore bad href
    }
  }
  return out;
}

module.exports = {adjustBaseURL, normalizeUrl, extractAnchorUrls};
