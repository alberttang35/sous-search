// @ts-check

/**
 * @typedef {Object} FetchPageResult
 * @property {string} finalUrl
 * @property {number} status
 * @property {string} html
 */

/**
 * @typedef {Object} FetchPageOptions
 * @property {number} [maxBytes]
 * @property {number} [timeoutMs]
 * @property {number} [maxRedirects]
 * @property {string} [userAgent]
 */

const DEFAULT_UA = 'SousSearchCrawler/1.0 (+education)';

/**
 * GET with timeout, redirect cap, and response size limit (Node 18+ fetch).
 * @param {string} url
 * @param {FetchPageOptions} [options]
 * @returns {Promise<FetchPageResult | null>}
 */
async function fetchPage(url, options = {}) {
  const maxBytes = options.maxBytes ?? 2_000_000;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRedirects = options.maxRedirects ?? 8;
  const userAgent = options.userAgent ?? DEFAULT_UA;

  let current = url;
  for (let r = 0; r <= maxRedirects; r++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {'User-Agent': userAgent, 'Accept': 'text/html,application/xhtml+xml'},
      });
    } catch (_e) {
      clearTimeout(t);
      return null;
    }
    clearTimeout(t);

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const loc = res.headers.get('location');
      try {
        current = new URL(loc, current).href;
      } catch (_e) {
        return null;
      }
      continue;
    }

    if (!res.ok || !res.body) {
      return res.body ? {finalUrl: current, status: res.status, html: ''} : null;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
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

    const buf = Buffer.concat(chunks);
    return {
      finalUrl: current,
      status: res.status,
      html: buf.toString('utf8'),
    };
  }
  return null;
}

module.exports = {fetchPage};
