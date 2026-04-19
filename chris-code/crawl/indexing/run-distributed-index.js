#!/usr/bin/env node
// @ts-check
'use strict';

const {GID_DOCS} = require('../gids.js');
const {mrExecPromise} = require('../storeUtil.js');
const {
  createIndexBuildMapper,
  createIndexBuildReducer,
  createIndexStatsMapper,
  createIndexStatsReducer,
  closePostgresIfOpen,
} = require('./mrIndexRound.js');
const {GID_INDEX_DOCMETA} = require('./indexGids.js');
const {
  bootstrapDistributionRuntime,
  stopDistributionRuntime,
} = require('../distributedRuntime.js');

function parseArgs() {
  const out = {
    port: parseInt(process.env.CRAWL_DEMO_PORT || '17779', 10),
    withFallback: process.env.WITH_LLM_FALLBACK !== '0',
    withPostgresSink: process.env.INDEX_WRITE_POSTGRES === '1',
    skipStats: false,
    gid: 'all',
    jobPrefix: process.env.INDEX_JOB_PREFIX || 'index',
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--port' && process.argv[i + 1]) {
      out.port = parseInt(process.argv[++i], 10);
    } else if (a === '--gid' && process.argv[i + 1]) {
      out.gid = process.argv[++i];
    } else if (a === '--job-prefix' && process.argv[i + 1]) {
      out.jobPrefix = process.argv[++i];
    } else if (a === '--no-llm-fallback') {
      out.withFallback = false;
    } else if (a === '--with-postgres-sink') {
      out.withPostgresSink = true;
    } else if (a === '--skip-stats') {
      out.skipStats = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/indexing/run-distributed-index.js [options]

  --port <n>               Node port for this worker runtime (default 17779)
  --gid <name>             Distribution group (default all)
  --job-prefix <name>      Prefix for MR job IDs (default index)
  --no-llm-fallback        Disable LLM fallback stage
  --with-postgres-sink     Also materialize each recipe to Postgres (optional)
  --skip-stats             Skip second MR pass for df/corpus stats

Env:
  INDEX_WRITE_POSTGRES=1   Equivalent to --with-postgres-sink
  WITH_LLM_FALLBACK=0      Equivalent to --no-llm-fallback
`);
      process.exit(0);
    }
  }
  return out;
}

/**
 * @param {string} key
 * @param {Array<Record<string, any>>} rows
 * @returns {number}
 */
function countByType(key, rows) {
  return rows.filter((x) => x && x.type === key).length;
}

async function main() {
  const opts = parseArgs();
  await bootstrapDistributionRuntime({port: opts.port, gid: opts.gid});

  const buildJobId = `${opts.jobPrefix}_build_${Date.now()}`;
  const buildResults = await mrExecPromise({
    map: createIndexBuildMapper({
      withFallback: opts.withFallback,
      writePostgres: opts.withPostgresSink,
    }),
    reduce: createIndexBuildReducer(),
    inputGid: GID_DOCS,
    jobId: buildJobId,
  });
  console.log('Build MR completed.', {
    postingsKeys: countByType('postings', buildResults),
    docMetaKeys: countByType('docmeta', buildResults),
    attrKeys: countByType('attr', buildResults),
    postgresWrites: countByType('postgres', buildResults),
    totalResultRows: buildResults.length,
  });

  if (!opts.skipStats) {
    const statsJobId = `${opts.jobPrefix}_stats_${Date.now()}`;
    const statsResults = await mrExecPromise({
      map: createIndexStatsMapper(),
      reduce: createIndexStatsReducer(),
      inputGid: GID_INDEX_DOCMETA,
      jobId: statsJobId,
    });
    console.log('Stats MR completed.', {
      statRows: statsResults.filter((x) => x && x.type === 'stat').length,
      dfRows: statsResults.filter((x) => x && x.type === 'df').length,
      totalResultRows: statsResults.length,
    });
  }

  await closePostgresIfOpen();
  await stopDistributionRuntime();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await closePostgresIfOpen();
    await stopDistributionRuntime();
  } catch (_e) {}
  process.exit(1);
});
