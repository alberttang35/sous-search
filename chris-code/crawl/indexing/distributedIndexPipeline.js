// @ts-check
'use strict';

/**
 * Runs distributed index MapReduce jobs (requires `bootstrapDistributionRuntime` already called).
 */

const {GID_DOCS} = require('../gids.js');
const {mrExecPromise} = require('../storeUtil.js');
const {
  createIndexBuildMapper,
  createIndexBuildReducer,
  createIndexStatsMapper,
  createIndexStatsReducer,
} = require('./mrIndexRound.js');
const {GID_INDEX_DOCMETA} = require('./indexGids.js');

/**
 * @param {Array<Record<string, any>>} rows
 * @param {string} key
 * @returns {number}
 */
function countByType(key, rows) {
  return rows.filter((x) => x && x.type === key).length;
}

/**
 * @param {{
 *   jobPrefix?: string,
 *   withFallback?: boolean,
 *   skipStats?: boolean,
 *   writePostgres?: boolean,
 * }} opts
 */
async function runDistributedIndexJobs(opts) {
  const jobPrefix = opts.jobPrefix || 'index';
  const withFallback = opts.withFallback === true;
  const skipStats = !!opts.skipStats;
  const writePostgres = !!opts.writePostgres;

  const buildJobId = `${jobPrefix}_build_${Date.now()}`;
  const buildT0 = Date.now();
  const buildResults = await mrExecPromise({
    map: createIndexBuildMapper({
      withFallback,
      writePostgres,
    }),
    reduce: createIndexBuildReducer(),
    inputGid: GID_DOCS,
    jobId: buildJobId,
  });
  const buildWallMs = Date.now() - buildT0;

  let stats = null;

  if (!skipStats) {
    const statsJobId = `${jobPrefix}_stats_${Date.now()}`;
    const statsT0 = Date.now();
    const statsRows = await mrExecPromise({
      map: createIndexStatsMapper(),
      reduce: createIndexStatsReducer(),
      inputGid: GID_INDEX_DOCMETA,
      jobId: statsJobId,
    });
    const statsWallMs = Date.now() - statsT0;
    stats = {
      ms: statsWallMs,
      rows: statsRows,
      statRows: statsRows.filter((x) => x && x.type === 'stat').length,
      dfRows: statsRows.filter((x) => x && x.type === 'df').length,
      totalResultRows: statsRows.length,
    };
  }

  return {
    build: {
      ms: buildWallMs,
      rows: buildResults,
      postingsKeys: countByType('postings', buildResults),
      docMetaKeys: countByType('docmeta', buildResults),
      attrKeys: countByType('attr', buildResults),
      postgresWrites: countByType('postgres', buildResults),
      totalResultRows: buildResults.length,
    },
    stats,
  };
}

module.exports = {
  runDistributedIndexJobs,
};
