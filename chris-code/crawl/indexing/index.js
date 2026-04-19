// @ts-check
// single require() surface for scripts and quick experiments
const schema = require('./schema.js');
const normalize = require('./normalize.js');
const llmFallback = require('./llmFallback.js');
const pipeline = require('./pipeline.js');
const db = require('./db.js');
const indexGids = require('./indexGids.js');
const indexTokens = require('./indexTokens.js');
const mrIndexRound = require('./mrIndexRound.js');
const queryEngine = require('./queryEngine.js');

module.exports = {
  ...schema,
  ...normalize,
  ...llmFallback,
  ...pipeline,
  ...db,
  ...indexGids,
  ...indexTokens,
  ...mrIndexRound,
  ...queryEngine,
};
