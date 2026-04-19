// @ts-check
const {frontierGidForRound, GID_VISITED} = require('./gids.js');
const {createCrawlMapper, createCrawlReducer} = require('./mrRound.js');
const {countRichDocsOnGroupNodes} = require('./crawlRichStats.js');
const {
  listKeysAllNodes,
  allStorePutPromise,
  mrExecPromise,
} = require('./storeUtil.js');

/**
 * @typedef {Object} CrawlRoundProfile
 * @property {number} round
 * @property {number} frontierInKeys
 * @property {number} mrWallMs
 * @property {number} visitedAfter
 * @property {number} visitedDelta
 * @property {number} frontierAddsRound
 * @property {number} nextFrontierKeys
 */

/**
 * @typedef {Object} CrawlSummary
 * @property {number} roundsCompleted
 * @property {number} frontierAdds
 * @property {number} visitedCount
 * @property {number} [totalDocs]
 * @property {number} [richDocs]
 * @property {boolean} [stoppedEarly]
 * @property {CrawlRoundProfile[]} [roundProfiles]
 */

/**
 * @typedef {Object} RunDistributedCrawlOptions
 * @property {string[]} seeds
 * @property {string} [groupName]
 * @property {number} [maxRounds]
 * @property {number} [maxDepth]
 * @property {number} [maxOutlinks]
 * @property {number} [maxPagesBudget]
 * @property {string} [jobPrefix]
 * @property {import('./lib/fetchPage.js').FetchPageOptions} [fetch]
 * @property {import('./lib/recipeUrlPolicy.js').RecipePolicyPreset} [recipePolicyPreset]
 * @property {boolean} [includeDocStats]
 * @property {boolean} [profileRounds]
 * @property {() => boolean} [shouldAbort] Checked at the start of each round (after seeds); stop crawl without error.
 */

/**
 * @param {string} groupName
 * @param {string} gid
 * @returns {Promise<string[]>}
 */
function listKeysAllNodesPromise(groupName, gid) {
  return new Promise((resolve, reject) => {
    listKeysAllNodes(groupName, gid, (err, keys) => {
      if (err) reject(err);
      else resolve(keys || []);
    });
  });
}

/**
 * Seed the round-0 frontier via the distributed store (same sharding as MR map input).
 * @param {string[]} urls
 * @param {string} gid
 */
async function seedFrontier(urls, gid) {
  for (const u of urls) {
    await allStorePutPromise({depth: 0, parent: null}, {key: u, gid});
  }
}

/**
 * BFS-style crawl: each MR round expands one frontier layer. Stops when the next frontier is empty,
 * maxRounds is hit, or visited URL count reaches maxPagesBudget.
 *
 * Requires `globalThis.distribution` with `all.mr`, `all.store`, `local.groups`, `local.comm`.
 *
 * @param {RunDistributedCrawlOptions} options
 * @returns {Promise<CrawlSummary>}
 */
async function runDistributedCrawlAsync(options) {
  const groupName = options.groupName || 'all';
  const maxRounds = options.maxRounds ?? 50;
  const maxDepth = options.maxDepth ?? 6;
  const maxOutlinks = options.maxOutlinks ?? 150;
  const maxPagesBudget = options.maxPagesBudget ?? Number.POSITIVE_INFINITY;
  const jobPrefix = options.jobPrefix || 'crawl';

  const seeds = options.seeds || [];
  if (!seeds.length) {
    return {roundsCompleted: 0, frontierAdds: 0, visitedCount: 0};
  }

  await seedFrontier(seeds, frontierGidForRound(0));

  let frontierAdds = 0;
  let roundsCompleted = 0;
  let stoppedEarly = false;
  /** @type {CrawlRoundProfile[] | null} */
  const roundProfiles = options.profileRounds ? [] : null;

  for (let round = 0; round < maxRounds; round++) {
    if (options.shouldAbort && options.shouldAbort()) {
      stoppedEarly = true;
      break;
    }

    const inputGid = frontierGidForRound(round);
    const nextGid = frontierGidForRound(round + 1);

    const inKeys = await listKeysAllNodesPromise(groupName, inputGid);
    if (!inKeys.length) break;

    const visitedBefore = roundProfiles ?
      (await listKeysAllNodesPromise(groupName, GID_VISITED)).length :
      0;

    const jobId = `${jobPrefix}_${round}_${Date.now()}`;
    const tMr0 = Date.now();
    const results = await mrExecPromise({
      map: createCrawlMapper({
        maxDepth,
        maxOutlinks,
        fetchOptions: options.fetch,
        recipePolicyPreset: options.recipePolicyPreset,
      }),
      reduce: createCrawlReducer({nextFrontierGid: nextGid, maxDepth}),
      inputGid,
      jobId,
    });
    const mrWallMs = Date.now() - tMr0;

    let addsRound = 0;
    for (const r of results) {
      if (r && r.added) {
        frontierAdds++;
        addsRound++;
      }
    }
    roundsCompleted++;

    const visitedAfterRound = (await listKeysAllNodesPromise(groupName, GID_VISITED)).length;
    const nextKeys = await listKeysAllNodesPromise(groupName, nextGid);

    if (roundProfiles) {
      roundProfiles.push({
        round,
        frontierInKeys: inKeys.length,
        mrWallMs,
        visitedAfter: visitedAfterRound,
        visitedDelta: visitedAfterRound - visitedBefore,
        frontierAddsRound: addsRound,
        nextFrontierKeys: nextKeys.length,
      });
    }

    if (!nextKeys.length) break;

    const visitedCount = visitedAfterRound;
    if (visitedCount >= maxPagesBudget) break;
  }

  const visitedCount = (await listKeysAllNodesPromise(groupName, GID_VISITED)).length;
  /** @type {{ roundsCompleted: number, frontierAdds: number, visitedCount: number, totalDocs?: number, richDocs?: number, stoppedEarly?: boolean, roundProfiles?: CrawlRoundProfile[] }} */
  const summary = {roundsCompleted, frontierAdds, visitedCount};
  if (stoppedEarly) {
    summary.stoppedEarly = true;
  }
  if (roundProfiles && roundProfiles.length) {
    summary.roundProfiles = roundProfiles;
  }
  if (options.includeDocStats) {
    try {
      const {totalDocs, richDocs} = await countRichDocsOnGroupNodes(groupName);
      summary.totalDocs = totalDocs;
      summary.richDocs = richDocs;
    } catch (_e) {
      summary.totalDocs = 0;
      summary.richDocs = 0;
    }
  }
  return summary;
}

/**
 * @param {RunDistributedCrawlOptions} options
 * @param {(err: Error | null, summary?: CrawlSummary) => void} [callback]
 * @returns {void}
 */
function runDistributedCrawl(options, callback) {
  if (!callback) {
    runDistributedCrawlAsync(options).catch((e) => {
      console.error(e);
    });
    return;
  }
  runDistributedCrawlAsync(options)
      .then((summary) => callback(null, summary))
      .catch((err) => callback(err));
}

module.exports = {
  runDistributedCrawl,
  runDistributedCrawlAsync,
  seedFrontier,
  listKeysAllNodesPromise,
};
