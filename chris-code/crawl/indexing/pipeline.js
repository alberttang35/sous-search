// @ts-check
// full path when you still have raw html (e.g. one-off fetch); crawl store jobs usually skip this and normalize the doc only
const {extractCrawlDoc} = require('../lib/recipeExtract.js');
const {normalizeCrawlDoc} = require('./normalize.js');
const {applyLlmFallback} = require('./llmFallback.js');

async function indexRecipeDocument(input, options = {}) {
  const extracted = extractCrawlDoc(input.html, input.url);
  const normalized = normalizeCrawlDoc({
    ...extracted,
    rawHtmlRef: input.rawHtmlRef || null,
  });
  return applyLlmFallback(normalized, options);
}

module.exports = {
  indexRecipeDocument,
};
