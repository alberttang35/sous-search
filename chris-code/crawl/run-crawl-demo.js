#!/usr/bin/env node
/**
 * Single-node distributed crawl smoke test: boots the course-style HTTP node, registers
 * local services (store, etc.), runs runDistributedCrawl, prints a summary and sample
 * crawl_docs from disk.
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
const path = require('path');
const utilMod = require('../distribution/util/util.js');

/** Default: Food.com recipe hub (200 OK); use --seed for a specific recipe page. */
const DEFAULT_SEED = 'https://www.food.com/recipe/';

function parseArgs() {
  const out = {
    seed: DEFAULT_SEED,
    port: parseInt(process.env.CRAWL_DEMO_PORT || '17779', 10),
    maxRounds: 2,
    maxPagesBudget: 10,
    maxDepth: 3,
    sampleDocs: 5,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--seed' && process.argv[i + 1]) {
      out.seed = process.argv[++i];
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
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/run-crawl-demo.js [options]

  --seed <url>          Starting URL (use a https://www.food.com/recipe/... page)
  --port <n>            HTTP port (default 17779, or env CRAWL_DEMO_PORT)
  --max-rounds <n>      MR frontier rounds (default 2)
  --max-pages <n>       Stop after this many visited URLs (default 10)
  --max-depth <n>       Max BFS depth from seed (default 3)
  --sample-docs <n>     Print up to N crawl_docs from disk (default 5)

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
 * @param {string} nid
 * @param {string} gid
 * @returns {string}
 */
function storeDirForGid(nid, gid) {
  return path.resolve(__dirname, '../store', nid, gid);
}

/**
 * @param {string} filename
 * @returns {string}
 */
function hexFilenameToKey(filename) {
  return Buffer.from(filename, 'hex').toString('utf8');
}

/**
 * @param {typeof import('./gids.js')} gids
 * @param {string} nid
 * @param {number} limit
 */
function printSampleCrawlDocs(gids, nid, limit) {
  const dir = storeDirForGid(nid, gids.GID_DOCS);
  console.log('\n--- Sample crawl_docs (local store) ---');
  console.log('Directory:', dir);
  if (!fs.existsSync(dir)) {
    console.log('(no crawl_docs directory yet)');
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.length > 0);
  if (!files.length) {
    console.log('(empty)');
    return;
  }
  let n = 0;
  for (const f of files) {
    if (n >= limit) {
      console.log(`... and ${files.length - limit} more file(s)`);
      break;
    }
    const p = path.join(dir, f);
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (_e) {
      continue;
    }
    let doc;
    try {
      doc = utilMod.deserialize(raw);
    } catch (_e) {
      console.log(`\n[${f}] (could not deserialize)`);
      n++;
      continue;
    }
    const urlKey = hexFilenameToKey(f);
    const preview = {
      storeKeyUrl: urlKey,
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
  console.log('Seed URL:', opts.seed);
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
      seeds: [opts.seed],
      groupName: 'all',
      maxRounds: opts.maxRounds,
      maxDepth: opts.maxDepth,
      maxPagesBudget: opts.maxPagesBudget,
      jobPrefix: 'crawl_demo',
    });
  } catch (e) {
    console.error('Crawl failed:', e);
    summary = null;
  }

  if (summary) {
    console.log('\n--- Crawl summary ---');
    console.log(JSON.stringify(summary, null, 2));
  }

  const nid = String(globalThis.distribution.util.id.getNID(globalThis.distribution.node.config));
  printSampleCrawlDocs(gids, nid, opts.sampleDocs);

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
