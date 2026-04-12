// @ts-check

/** Local + distributed store gid for URLs already fetched or scheduled-as-visited at reduce time. */
const GID_VISITED = 'crawl_visited';

/** Per-URL structured crawl payload (JSON). */
const GID_DOCS = 'crawl_docs';

/**
 * @param {number} round
 * @returns {string}
 */
function frontierGidForRound(round) {
  return `crawl_frontier_r${round}`;
}

module.exports = {GID_VISITED, GID_DOCS, frontierGidForRound};
