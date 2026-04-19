// @ts-check

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeText(text) {
  return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
}

/**
 * @param {ReturnType<import('./normalize.js').normalizeCrawlDoc>} recipe
 * @returns {Map<string, {tf:number, positions:number[]}>}
 */
function buildTermMap(recipe) {
  const terms = new Map();
  let pos = 0;

  /**
   * @param {string} t
   */
  function addToken(t) {
    if (!t || t.length < 2) return;
    const existing = terms.get(t) || {tf: 0, positions: []};
    existing.tf += 1;
    existing.positions.push(pos++);
    terms.set(t, existing);
  }

  tokenizeText(recipe.title).forEach(addToken);
  for (const ing of recipe.ingredient_tokens || []) addToken(ing);
  for (const step of recipe.steps_raw || []) {
    tokenizeText(step).forEach(addToken);
  }
  return terms;
}

/**
 * @param {number | null | undefined} minutes
 * @returns {string}
 */
function timeBucket(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return 'unknown';
  if (minutes <= 15) return 'le15';
  if (minutes <= 30) return 'le30';
  if (minutes <= 60) return 'le60';
  return 'gt60';
}

module.exports = {
  tokenizeText,
  buildTermMap,
  timeBucket,
};
