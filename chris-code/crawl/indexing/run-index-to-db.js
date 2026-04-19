#!/usr/bin/env node
// @ts-check
// debug/local indexing path: reads crawl_docs via distribution.local.store and upserts into postgres

const {GID_DOCS} = require('../gids.js');
const {localStoreGetPromise} = require('../storeUtil.js');
const {normalizeCrawlDoc} = require('./normalize.js');
const {applyLlmFallback} = require('./llmFallback.js');
const {createPoolFromEnv, writeCanonicalRecipe} = require('./db.js');
const {
  bootstrapDistributionRuntime,
  stopDistributionRuntime,
} = require('../distributedRuntime.js');

function parseArgs() {
  const out = {
    nodePort: parseInt(process.env.CRAWL_DEMO_PORT || '17779', 10),
    limit: parseInt(process.env.INDEX_TO_DB_LIMIT || '25', 10),
    withFallback: process.env.WITH_LLM_FALLBACK !== '0',
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--port' && process.argv[i + 1]) {
      out.nodePort = parseInt(process.argv[++i], 10);
    } else if (a === '--limit' && process.argv[i + 1]) {
      out.limit = parseInt(process.argv[++i], 10);
    } else if (a === '--no-llm-fallback') {
      out.withFallback = false;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/indexing/run-index-to-db.js [options]

  --port <n>             Runtime node port (default CRAWL_DEMO_PORT or 17779)
  --limit <n>            Maximum number of crawl docs to index+persist (default 25)
  --no-llm-fallback      Disable LLM fallback stage

Required env:
  DATABASE_URL           Postgres connection string
`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  await bootstrapDistributionRuntime({port: opts.nodePort, gid: 'all'});
  const keys = await localStoreGetPromise({key: null, gid: GID_DOCS});
  const files = (Array.isArray(keys) ? keys : []).slice(0, opts.limit);
  if (!files.length) {
    console.log('No crawl docs found in local store.');
    await stopDistributionRuntime();
    return;
  }

  const pool = createPoolFromEnv();
  const client = await pool.connect();
  let written = 0;
  try {
    for (const f of files) {
      const doc = await localStoreGetPromise({key: f, gid: GID_DOCS});
      if (!doc || !doc.url) continue;

      // store payload already ran recipeExtract at crawl time; don't re-parse stripped text as html
      const normalized = normalizeCrawlDoc({
        ...doc,
        rawHtmlRef: doc.url,
      });
      const recipe = await applyLlmFallback(
          normalized,
          opts.withFallback ? {} : {llmClient: async () => null},
      );
      await writeCanonicalRecipe(client, recipe);
      written++;
      if (written % 5 === 0) {
        console.log(`Indexed + wrote ${written} recipes...`);
      }
    }
    console.log(`Done. Wrote ${written} recipe records to Postgres.`);
  } finally {
    client.release();
    await pool.end();
    await stopDistributionRuntime();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
