// @ts-check
const {frontierGidForRound, GID_VISITED} = require('./gids.js');
const {createCrawlMapper, createCrawlReducer} = require('./mrRound.js');
const {
  listKeysAllNodes,
  allStorePutPromise,
  mrExecPromise,
} = require('./storeUtil.js');

/**
 * @typedef {Object} CrawlSummary
 * @property {number} roundsCompleted
 * @property {number} frontierAdds
 * @property {number} visitedCount
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

  for (let round = 0; round < maxRounds; round++) {
    const inputGid = frontierGidForRound(round);
    const nextGid = frontierGidForRound(round + 1);

    const inKeys = await listKeysAllNodesPromise(groupName, inputGid);
    if (!inKeys.length) break;

    const jobId = `${jobPrefix}_${round}_${Date.now()}`;
    const results = await mrExecPromise({
      map: createCrawlMapper({
        maxDepth,
        maxOutlinks,
        fetchOptions: options.fetch,
      }),
      reduce: createCrawlReducer({nextFrontierGid: nextGid, maxDepth}),
      inputGid,
      jobId,
    });

    for (const r of results) {
      if (r && r.added) frontierAdds++;
    }
    roundsCompleted++;

    const nextKeys = await listKeysAllNodesPromise(groupName, nextGid);
    if (!nextKeys.length) break;

    const visitedCount = (await listKeysAllNodesPromise(groupName, GID_VISITED)).length;
    if (visitedCount >= maxPagesBudget) break;
  }

  const visitedCount = (await listKeysAllNodesPromise(groupName, GID_VISITED)).length;
  return {roundsCompleted, frontierAdds, visitedCount};
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
