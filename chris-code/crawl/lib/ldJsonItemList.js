// @ts-check

/**
 * Collect recipe/listing URLs from schema.org JSON-LD, especially ItemList + ListItem
 * (Food.com puts hub recipes in <script type="application/ld+json">).
 */

/**
 * @param {unknown} el
 * @param {string[]} urls
 */
function collectListItemUrl(el, urls) {
  if (typeof el === 'string') {
    urls.push(el);
    return;
  }
  if (!el || typeof el !== 'object') return;
  const o = /** @type {Record<string, unknown>} */ (el);
  if (typeof o.url === 'string') urls.push(o.url);
  if (typeof o.item === 'string') {
    urls.push(o.item);
    return;
  }
  if (o.item && typeof o.item === 'object') {
    const item = /** @type {Record<string, unknown>} */ (o.item);
    if (typeof item.url === 'string') urls.push(item.url);
    if (typeof item['@id'] === 'string') urls.push(item['@id']);
  }
}

/**
 * @param {unknown} data
 * @param {string[]} urls
 */
function collectUrlsFromJsonLd(data, urls) {
  if (data == null) return;
  if (Array.isArray(data)) {
    for (const item of data) collectUrlsFromJsonLd(item, urls);
    return;
  }
  if (typeof data !== 'object') return;
  const o = /** @type {Record<string, unknown>} */ (data);

  if (Array.isArray(o['@graph'])) {
    for (const g of o['@graph']) collectUrlsFromJsonLd(g, urls);
  }

  const types = o['@type'];
  const typeStr = Array.isArray(types) ? types.map(String).join(',') : String(types || '');
  if (typeStr.includes('ItemList') && Array.isArray(o.itemListElement)) {
    for (const el of o.itemListElement) {
      collectListItemUrl(el, urls);
    }
  }
}

/**
 * @param {import('jsdom').DOMWindow['document']} document
 * @returns {string[]}
 */
function extractLdJsonUrls(document) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const urls = [];
  for (const el of scripts) {
    const text = el.textContent && el.textContent.trim();
    if (!text) continue;
    let data;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      continue;
    }
    collectUrlsFromJsonLd(data, urls);
  }
  return urls;
}

module.exports = {extractLdJsonUrls, collectUrlsFromJsonLd};
