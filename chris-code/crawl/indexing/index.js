// @ts-check
// single require() surface for scripts and quick experiments
const schema = require('./schema.js');
const normalize = require('./normalize.js');
const llmFallback = require('./llmFallback.js');
const pipeline = require('./pipeline.js');
const db = require('./db.js');

module.exports = {
  ...schema,
  ...normalize,
  ...llmFallback,
  ...pipeline,
  ...db,
};
