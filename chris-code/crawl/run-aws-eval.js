#!/usr/bin/env node
// @ts-check
/**
 * Single-node / local: omit multi-node wiring; defaults bind to 127.0.0.1 unless BIND_IP/--ip is set.
 *
 * Usage (from chris-code/):
 *   node crawl/run-aws-eval.js --seeds-file crawl/eval/seeds-four-hubs.txt --out-dir ./metrics-out --max-pages 100
 *
 * Env: BIND_IP, CRAWL_DEMO_PORT, INDEX_JOB_PREFIX, INDEX_WRITE_POSTGRES=1 (optional DB sink), WITH_LLM_FALLBACK
 *      (ignored unless --allow-llm-fallback; otherwise forced to 0).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {runDistributedCrawlAsync} = require('./coordinator.js');
const {
  bootstrapDistributionRuntime,
  stopDistributionRuntime,
  addNodeToGroup,
} = require('./distributedRuntime.js');
const {runDistributedIndexJobs} = require('./indexing/distributedIndexPipeline.js');
const {closePostgresIfOpen} = require('./indexing/mrIndexRound.js');
const {runHybridQuery} = require('./indexing/queryEngine.js');

const DEFAULT_QUERIES = [
  'vegetarian under 30 minutes',
  'chicken air fryer',
  'category:dessert',
];

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

/**
 * @param {number[]} sortedAsc
 * @param {number} p 0-100
 */
function percentileSorted(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

/**
 * @param {number[]} ms
 */
function latencyStats(ms) {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    meanMs: sorted.length ? sum / sorted.length : null,
    p50Ms: percentileSorted(sorted, 50),
    p95Ms: percentileSorted(sorted, 95),
    p99Ms: percentileSorted(sorted, 99),
  };
}

function parseArgs() {
  const argv = process.argv;
  const allowLlmFallback = argv.includes('--allow-llm-fallback');

  const out = {
    allowLlmFallback,
    seedsFile: /** @type {string | null} */ (null),
    outDir: path.resolve(process.cwd(), 'eval-metrics-out'),
    port: parseInt(process.env.CRAWL_DEMO_PORT || '17779', 10),
    bindIp: process.env.BIND_IP || '',
    gid: 'all',
    maxRounds: 50,
    maxPagesBudget: 100_000,
    maxDepth: 6,
    maxOutlinks: 150,
    maxWallClockMs: 0,
    jobPrefix: process.env.INDEX_JOB_PREFIX || 'aws_eval_index',
    skipIndex: false,
    skipQuery: false,
    skipStats: false,
    withPostgresSink: process.env.INDEX_WRITE_POSTGRES === '1',
    queryLimit: parseInt(process.env.QUERY_LIMIT || '10', 10),
    queryReps: 20,
    queryConcurrency: 1,
    recipePolicyPreset: /** @type {'multisite' | 'food_only'} */ ('multisite'),
    queries: [...DEFAULT_QUERIES],
    crawlJobPrefix: 'aws_eval_crawl',
    includeDocStats: true,
    nodes: /** @type {{ip:string, port:number}[] | null} */ (null),
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seeds-file' && argv[i + 1]) {
      out.seedsFile = path.resolve(process.cwd(), argv[++i]);
    } else if (a === '--nodes' && argv[i + 1]) {
      out.nodes = argv[++i].split(',').map(s => {
        const [ip, port] = s.split(':');
        return {ip, port: parseInt(port, 10)};
      });
    }
    else if (a === '--out-dir' && argv[i + 1]) {
      out.outDir = path.resolve(process.cwd(), argv[++i]);
    } else if (a === '--port' && argv[i + 1]) {
      out.port = parseInt(argv[++i], 10);
    } else if (a === '--ip' && argv[i + 1]) {
      out.bindIp = argv[++i];
    } else if (a === '--gid' && argv[i + 1]) {
      out.gid = argv[++i];
    } else if (a === '--max-rounds' && argv[i + 1]) {
      out.maxRounds = parseInt(argv[++i], 10);
    } else if (a === '--max-pages' && argv[i + 1]) {
      out.maxPagesBudget = parseInt(argv[++i], 10);
    } else if (a === '--max-depth' && argv[i + 1]) {
      out.maxDepth = parseInt(argv[++i], 10);
    } else if (a === '--max-outlinks' && argv[i + 1]) {
      out.maxOutlinks = parseInt(argv[++i], 10);
    } else if (a === '--max-wall-ms' && argv[i + 1]) {
      out.maxWallClockMs = parseInt(argv[++i], 10);
    } else if (a === '--job-prefix' && argv[i + 1]) {
      out.jobPrefix = argv[++i];
    } else if (a === '--crawl-job-prefix' && argv[i + 1]) {
      out.crawlJobPrefix = argv[++i];
    } else if (a === '--skip-index') {
      out.skipIndex = true;
    } else if (a === '--skip-query') {
      out.skipQuery = true;
    } else if (a === '--skip-stats') {
      out.skipStats = true;
    } else if (a === '--with-postgres-sink') {
      out.withPostgresSink = true;
    } else if (a === '--no-doc-stats') {
      out.includeDocStats = false;
    } else if (a === '--query-limit' && argv[i + 1]) {
      out.queryLimit = parseInt(argv[++i], 10);
    } else if (a === '--query-reps' && argv[i + 1]) {
      out.queryReps = parseInt(argv[++i], 10);
    } else if (a === '--query-concurrency' && argv[i + 1]) {
      out.queryConcurrency = parseInt(argv[++i], 10);
    } else if (a === '--recipe-policy' && argv[i + 1]) {
      const v = argv[++i];
      if (v === 'food_only' || v === 'multisite') out.recipePolicyPreset = v;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/run-aws-eval.js --seeds-file <path> [options]

Required:
  --seeds-file <path>     One URL per line (# comments ok)

Output:
  --out-dir <path>        metrics.json + rounds.csv (default ./eval-metrics-out)

Runtime:
  --port <n>              HTTP port (env CRAWL_DEMO_PORT)
  --ip <addr>             Bind IP (default env BIND_IP or 127.0.0.1)
  --gid <name>            Distribution group (default all)

Crawl:
  --max-pages <n>         maxPagesBudget (visited URLs)
  --max-rounds <n>
  --max-depth <n>
  --max-outlinks <n>
  --max-wall-ms <n>       Abort crawl between MR rounds after this wall time (ms)
  --crawl-job-prefix <s>

Index:
  LLM fallback is OFF unless --allow-llm-fallback (sets WITH_LLM_FALLBACK unless env overrides).
  --skip-index            Skip indexing MR jobs
  --skip-stats            Skip stats MR pass (df / corpus stats)
  --with-postgres-sink    INDEX_WRITE_POSTGRES-style writes (env INDEX_WRITE_POSTGRES=1 also works)
  --job-prefix <s>        MR job id prefix (env INDEX_JOB_PREFIX)

Query benchmark:
  --skip-query
  --query-limit <n>
  --query-reps <n>        Repetitions per default query string
  --query-concurrency <n> Parallel in-flight queries (best-effort)

Other:
  --no-doc-stats          Skip rich crawl doc counts after crawl
  --recipe-policy <p>     multisite | food_only
`);
      process.exit(0);
    }
  }

  return out;
}

/**
 * @param {{ queries: string[], reps: number, concurrency: number, limit: number }} opts
 */
async function runQueryBenchmark(opts) {
  /** @type {{ query: string, latencyMs: number }[]} */
  const samples = [];
  /** @type {{ query: string, idx: number }[]} */
  const tasks = [];
  let t = 0;
  for (let r = 0; r < opts.reps; r++) {
    for (const query of opts.queries) {
      tasks.push({query, idx: t++});
    }
  }

  const wallT0 = Date.now();
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) break;
      const {query} = tasks[i];
      const t0 = process.hrtime.bigint();
      await runHybridQuery(query, opts.limit);
      const t1 = process.hrtime.bigint();
      const latencyMs = Number(t1 - t0) / 1e6;
      samples.push({query, latencyMs});
    }
  }

  const nWorkers = Math.max(1, opts.concurrency);
  await Promise.all(Array.from({length: nWorkers}, () => worker()));
  const wallMs = Date.now() - wallT0;

  const latencies = samples.map((s) => s.latencyMs);
  return {
    wallClockMs: wallMs,
    taskCount: tasks.length,
    throughputQueriesPerSec: wallMs > 0 ? tasks.length / (wallMs / 1000) : null,
    latency: latencyStats(latencies),
    samples,
  };
}

/**
 * @param {Array<{round:number, frontierInKeys:number, mrWallMs:number, visitedAfter:number, visitedDelta:number, frontierAddsRound:number, nextFrontierKeys:number}>} rounds
 * @param {string} filePath
 */
function writeRoundsCsv(rounds, filePath) {
  const header = [
    'round',
    'frontierInKeys',
    'mrWallMs',
    'visitedAfter',
    'visitedDelta',
    'frontierAddsRound',
    'nextFrontierKeys',
  ].join(',');
  const lines = rounds.map((r) =>
    [
      r.round,
      r.frontierInKeys,
      r.mrWallMs,
      r.visitedAfter,
      r.visitedDelta,
      r.frontierAddsRound,
      r.nextFrontierKeys,
    ].join(','),
  );
  fs.writeFileSync(filePath, [header, ...lines].join('\n') + '\n', 'utf8');
}

async function main() {
  const opts = parseArgs();

  if (!opts.allowLlmFallback) {
    process.env.WITH_LLM_FALLBACK = '0';
  }

  if (!opts.seedsFile) {
    console.error('Missing required --seeds-file');
    process.exit(1);
  }

  const seeds = readSeedsFile(opts.seedsFile);
  if (!seeds.length) {
    console.error('No seeds in file:', opts.seedsFile);
    process.exit(1);
  }

  fs.mkdirSync(opts.outDir, {recursive: true});

  const bindIp = opts.bindIp || undefined;
  await bootstrapDistributionRuntime({
    port: opts.port,
    gid: opts.gid,
    ip: bindIp,
  });

  if (opts.nodes) {
    for (const node of opts.nodes) {
      await addNodeToGroup(node, opts.gid);
    }
  }

  console.error(
      `[run-aws-eval] listening ${globalThis.distribution.node.config.ip}:${opts.port} seeds=${seeds.length} LLM=${opts.allowLlmFallback ? 'allowed' : 'off'}`,
  );

  /** @type {Record<string, unknown>} */
  const metrics = {
    startedAt: new Date().toISOString(),
    notes: [
      'maxPagesBudget is checked between MR rounds; one round can visit more pages than the budget before the next check.',
    ],
    node: {
      bindIp: globalThis.distribution.node.config.ip,
      port: opts.port,
      gid: opts.gid,
    },
    options: {
      seedsFile: opts.seedsFile,
      seedCount: seeds.length,
      maxPagesBudget: opts.maxPagesBudget,
      maxRounds: opts.maxRounds,
      maxDepth: opts.maxDepth,
      maxOutlinks: opts.maxOutlinks,
      maxWallClockMs: opts.maxWallClockMs || null,
      recipePolicyPreset: opts.recipePolicyPreset,
      allowLlmFallback: opts.allowLlmFallback,
      skipIndex: opts.skipIndex,
      skipQuery: opts.skipQuery,
      skipStats: opts.skipStats,
      withPostgresSink: opts.withPostgresSink,
    },
    crawl: null,
    index: null,
    query: null,
  };

  let crawlWallMs = 0;
  const crawlT0 = Date.now();
  const shouldAbort =
    opts.maxWallClockMs > 0 ?
      () => Date.now() - crawlT0 > opts.maxWallClockMs :
      undefined;

  let crawlSummary;
  try {
    crawlSummary = await runDistributedCrawlAsync({
      seeds,
      groupName: opts.gid,
      maxRounds: opts.maxRounds,
      maxDepth: opts.maxDepth,
      maxOutlinks: opts.maxOutlinks,
      maxPagesBudget: opts.maxPagesBudget,
      jobPrefix: opts.crawlJobPrefix,
      recipePolicyPreset: opts.recipePolicyPreset,
      includeDocStats: opts.includeDocStats,
      profileRounds: true,
      shouldAbort,
    });
  } catch (e) {
    metrics.error = String(e && e.stack ? e.stack : e);
    crawlWallMs = Date.now() - crawlT0;
    metrics.crawl = {
      wallClockMs: crawlWallMs,
      error: metrics.error,
    };
    fs.writeFileSync(path.join(opts.outDir, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
    console.error('[run-aws-eval] crawl failed; wrote partial metrics.');
    await closePostgresIfOpen();
    await stopDistributionRuntime();
    process.exit(1);
  }

  crawlWallMs = Date.now() - crawlT0;
  const crawlThroughput =
    crawlWallMs > 0 && crawlSummary ? crawlSummary.visitedCount / (crawlWallMs / 1000) : null;

  metrics.crawl = {
    wallClockMs: crawlWallMs,
    throughputPagesPerSec: crawlThroughput,
    summary: crawlSummary,
  };

  if (crawlSummary?.roundProfiles?.length) {
    const csvPath = path.join(opts.outDir, 'rounds.csv');
    writeRoundsCsv(crawlSummary.roundProfiles, csvPath);
  }

  if (!opts.skipIndex) {
    const indexT0 = Date.now();
    try {
      const indexOut = await runDistributedIndexJobs({
        jobPrefix: opts.jobPrefix,
        withFallback: opts.allowLlmFallback,
        skipStats: opts.skipStats,
        writePostgres: opts.withPostgresSink,
      });
      const indexWallMs = Date.now() - indexT0;
      const nDocs = crawlSummary?.visitedCount ?? 0;
      metrics.index = {
        wallClockMs: indexWallMs,
        buildWallMs: indexOut.build.ms,
        statsWallMs: indexOut.stats ? indexOut.stats.ms : null,
        throughputDocsIndexedPerSecBuild:
          indexOut.build.ms > 0 && nDocs ? nDocs / (indexOut.build.ms / 1000) : null,
        build: {
          postingsKeys: indexOut.build.postingsKeys,
          docMetaKeys: indexOut.build.docMetaKeys,
          attrKeys: indexOut.build.attrKeys,
          postgresWrites: indexOut.build.postgresWrites,
          totalResultRows: indexOut.build.totalResultRows,
        },
        stats: indexOut.stats ?
          {
            ms: indexOut.stats.ms,
            statRows: indexOut.stats.statRows,
            dfRows: indexOut.stats.dfRows,
            totalResultRows: indexOut.stats.totalResultRows,
          } :
          null,
      };
    } catch (e) {
      metrics.index = {error: String(e && e.stack ? e.stack : e)};
    }
  }

  if (opts.skipQuery) {
    metrics.query = {skipped: true, reason: '--skip-query'};
  } else if (opts.skipIndex) {
    metrics.query = {skipped: true, reason: 'index skipped (--skip-index)'};
  } else if (metrics.index && typeof metrics.index === 'object' && 'error' in metrics.index) {
    metrics.query = {
      skipped: true,
      reason: 'index phase failed',
      indexError: /** @type {{ error?: string }} */ (metrics.index).error,
    };
  } else {
    try {
      metrics.query = await runQueryBenchmark({
        queries: opts.queries,
        reps: opts.queryReps,
        concurrency: opts.queryConcurrency,
        limit: opts.queryLimit,
      });
    } catch (e) {
      metrics.query = {error: String(e && e.stack ? e.stack : e)};
    }
  }

  const outJson = path.join(opts.outDir, 'metrics.json');
  fs.writeFileSync(outJson, JSON.stringify(metrics, null, 2), 'utf8');
  console.error(`[run-aws-eval] wrote ${outJson}`);

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
