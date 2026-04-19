#!/usr/bin/env node
// @ts-check
'use strict';

const {
  bootstrapDistributionRuntime,
  stopDistributionRuntime,
} = require('../distributedRuntime.js');
const {runHybridQuery} = require('./queryEngine.js');

function parseArgs() {
  const out = {
    port: parseInt(process.env.CRAWL_DEMO_PORT || '17779', 10),
    gid: 'all',
    limit: parseInt(process.env.QUERY_LIMIT || '10', 10),
    query: '',
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--port' && process.argv[i + 1]) {
      out.port = parseInt(process.argv[++i], 10);
    } else if (a === '--gid' && process.argv[i + 1]) {
      out.gid = process.argv[++i];
    } else if (a === '--limit' && process.argv[i + 1]) {
      out.limit = parseInt(process.argv[++i], 10);
    } else if (a === '--query' && process.argv[i + 1]) {
      out.query = process.argv[++i];
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/indexing/run-distributed-query.js --query "<text>" [options]

  --query <text>         Query text (supports structured terms like vegetarian, air fryer, category:dessert, under 30 minutes)
  --port <n>             Runtime port for this process (default 17779)
  --gid <name>           Distribution group (default all)
  --limit <n>            Max results (default 10)
`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  if (!opts.query) {
    throw new Error('Missing --query argument.');
  }

  await bootstrapDistributionRuntime({port: opts.port, gid: opts.gid});
  const result = await runHybridQuery(opts.query, opts.limit);
  console.log(JSON.stringify(result, null, 2));
  await stopDistributionRuntime();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await stopDistributionRuntime();
  } catch (_e) {}
  process.exit(1);
});
