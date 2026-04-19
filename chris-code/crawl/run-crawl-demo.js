#!/usr/bin/env node
/**
 * Single-node distributed crawl smoke test: boots the course-style HTTP node, registers
 * local services (store, etc.), runs runDistributedCrawl, prints a summary and sample
 * crawl_docs from local.store.
 *
 * Usage (from chris-code/):
 *   node crawl/run-crawl-demo.js
 *   node crawl/run-crawl-demo.js --seed "https://www.food.com/recipe/..."
 *   CRAWL_DEMO_PORT=17779 node crawl/run-crawl-demo.js --max-rounds 2 --max-pages 10
 *
 * Requires network access to fetch pages.
 */

'use strict';

const fs = require('fs');
const utilMod = require('../distribution/util/util.js');

/**
 * @param {string} filePath
 * @returns {string[]}
 */
function readSeedsFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/** Default: Food.com recipe hub (200 OK); use --seed for a specific recipe page. */
const DEFAULT_SEED = 'https://www.food.com/recipe/';

function parseArgs() {
  const out = {
    seed: DEFAULT_SEED,
    seedsFile: /** @type {string | null} */ (null),
    port: parseInt(process.env.CRAWL_DEMO_PORT || '17779', 10),
    maxRounds: 2,
    maxPagesBudget: 10,
    maxDepth: 3,
    sampleDocs: 5,
    docStats: false,
    recipePolicyPreset: /** @type {'multisite' | 'food_only'} */ ('multisite'),
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--seed' && process.argv[i + 1]) {
      out.seed = process.argv[++i];
    } else if (a === '--seeds-file' && process.argv[i + 1]) {
      out.seedsFile = process.argv[++i];
    } else if (a === '--port' && process.argv[i + 1]) {
      out.port = parseInt(process.argv[++i], 10);
    } else if (a === '--max-rounds' && process.argv[i + 1]) {
      out.maxRounds = parseInt(process.argv[++i], 10);
    } else if (a === '--max-pages' && process.argv[i + 1]) {
      out.maxPagesBudget = parseInt(process.argv[++i], 10);
    } else if (a === '--max-depth' && process.argv[i + 1]) {
      out.maxDepth = parseInt(process.argv[++i], 10);
    } else if (a === '--sample-docs' && process.argv[i + 1]) {
      out.sampleDocs = parseInt(process.argv[++i], 10);
    } else if (a === '--doc-stats') {
      out.docStats = true;
    } else if (a === '--recipe-policy' && process.argv[i + 1]) {
      const v = process.argv[++i];
      if (v === 'food_only' || v === 'multisite') out.recipePolicyPreset = v;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/run-crawl-demo.js [options]

  --seed <url>          Starting URL (ignored if --seeds-file is set)
  --seeds-file <path>   One URL per line (e.g. from crawl-sitemap-seeds)
  --port <n>            HTTP port (default 17779, or env CRAWL_DEMO_PORT)
  --max-rounds <n>      MR frontier rounds (default 2)
  --max-pages <n>       Stop after this many visited URLs (default 10)
  --max-depth <n>       Max BFS depth from seed (default 3)
  --sample-docs <n>     Print up to N crawl_docs from local.store (default 5)
  --doc-stats           After crawl, count docs with JSON-LD ingredients or times
  --recipe-policy <p>   multisite (default) | food_only

Run from the chris-code/ directory so ../distribution resolves correctly.
`);
      process.exit(0);
    }
  }
  return out;
}

/**
 * @param {string} name
 * @param {object} service
 * @returns {Promise<void>}
 */
function routesPut(name, service) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.routes.put(service, name, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * @returns {Promise<void>}
 */
function startNodeServer() {
  const {start} = require('../distribution/local/node.js');
  return new Promise((resolve, reject) => {
    start((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * @param {typeof import('./gids.js')} gids
 * @param {number} limit
 */
async function printSampleCrawlDocs(gids, limit) {
  console.log('\n--- Sample crawl_docs (local store) ---');
  /** @type {string[]} */
  let keys = [];
  try {
    const rawKeys = await new Promise((resolve, reject) => {
      globalThis.distribution.local.store.get({key: null, gid: gids.GID_DOCS}, (err, v) => {
        if (err) reject(err);
        else resolve(v);
      });
    });
    keys = Array.isArray(rawKeys) ? rawKeys : [];
  } catch (_e) {
    keys = [];
  }
  if (!keys.length) {
    console.log('(empty)');
    return;
  }
  let n = 0;
  for (const key of keys) {
    if (n >= limit) {
      console.log(`... and ${keys.length - limit} more record(s)`);
      break;
    }
    let doc;
    try {
      doc = await new Promise((resolve, reject) => {
        globalThis.distribution.local.store.get({key, gid: gids.GID_DOCS}, (err, v) => {
          if (err) reject(err);
          else resolve(v);
        });
      });
    } catch (_e) {
      continue;
    }
    const preview = {
      storeKeyUrl: key,
      url: doc.url,
      title: doc.title,
      times: doc.times,
      textPreview: typeof doc.text === 'string' ?
        doc.text.slice(0, 280).replace(/\s+/g, ' ') + (doc.text.length > 280 ? '…' : '') :
        undefined,
    };
    console.log('\n' + JSON.stringify(preview, null, 2));
    n++;
  }
}

async function main() {
  const opts = parseArgs();

  globalThis.distribution = {
    util: utilMod,
    node: {config: {ip: '127.0.0.1', port: opts.port}},
  };

  const local = require('../distribution/local/local.js');
  globalThis.distribution.local = local;

  await routesPut('store', local.store);
  await routesPut('mem', local.mem);
  await routesPut('groups', local.groups);
  await routesPut('gossip', local.gossip);

  const allServices = require('../distribution/all/all.js');
  globalThis.distribution.all = allServices.setup({gid: 'all'});

  await startNodeServer();
  console.log(
      `Node listening on http://${globalThis.distribution.node.config.ip}:${opts.port}`,
  );
  const seeds = opts.seedsFile ? readSeedsFile(opts.seedsFile) : [opts.seed];
  if (!seeds.length) {
    console.error('No seeds: provide --seed or a non-empty --seeds-file');
    process.exit(1);
  }
  if (opts.seedsFile) {
    console.log(`Seeds: ${seeds.length} URL(s) from ${opts.seedsFile}`);
  } else {
    console.log('Seed URL:', opts.seed);
  }
  console.log('Options:', {
    maxRounds: opts.maxRounds,
    maxPagesBudget: opts.maxPagesBudget,
    maxDepth: opts.maxDepth,
  });

  const gids = require('./gids.js');
  const {runDistributedCrawlAsync} = require('./coordinator.js');

  let summary;
  try {
    summary = await runDistributedCrawlAsync({
      seeds,
      groupName: 'all',
      maxRounds: opts.maxRounds,
      maxDepth: opts.maxDepth,
      maxPagesBudget: opts.maxPagesBudget,
      jobPrefix: 'crawl_demo',
      includeDocStats: opts.docStats,
      recipePolicyPreset: opts.recipePolicyPreset,
    });
  } catch (e) {
    console.error('Crawl failed:', e);
    summary = null;
  }

  if (summary) {
    console.log('\n--- Crawl summary ---');
    console.log(JSON.stringify(summary, null, 2));
  }

  await printSampleCrawlDocs(gids, opts.sampleDocs);

  const srv = globalThis.distribution.node.server;
  if (srv) {
    srv.close(() => process.exit(summary ? 0 : 1));
  } else {
    process.exit(summary ? 0 : 1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
