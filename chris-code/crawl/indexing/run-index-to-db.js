#!/usr/bin/env node
// @ts-check
// reads serialized crawl_docs from the local store (same layout as run-crawl-demo) and upserts into postgres

const fs = require('fs');
const path = require('path');
const utilMod = require('../../distribution/util/util.js');
const {normalizeCrawlDoc} = require('./normalize.js');
const {applyLlmFallback} = require('./llmFallback.js');
const {createPoolFromEnv, writeCanonicalRecipe} = require('./db.js');

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

  --port <n>             Port used to compute local node id (default CRAWL_DEMO_PORT or 17779)
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

function resolveDocsDirectory(port) {
  const nid = String(utilMod.id.getNID({ip: '127.0.0.1', port}));
  return path.resolve(__dirname, '../../store', nid, 'crawl_docs');
}

async function main() {
  const opts = parseArgs();
  const docsDir = resolveDocsDirectory(opts.nodePort);
  if (!fs.existsSync(docsDir)) {
    throw new Error(`crawl_docs directory not found at ${docsDir}`);
  }

  const files = fs.readdirSync(docsDir).slice(0, opts.limit);
  if (!files.length) {
    console.log('No crawl docs found.');
    return;
  }

  const pool = createPoolFromEnv();
  const client = await pool.connect();
  let written = 0;
  try {
    for (const f of files) {
      const raw = fs.readFileSync(path.join(docsDir, f), 'utf8');
      const doc = utilMod.deserialize(raw);
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
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
