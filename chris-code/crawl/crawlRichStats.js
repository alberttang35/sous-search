// @ts-check
const { GID_DOCS } = require("./gids.js");

/**
 * @param {unknown} doc
 * @returns {boolean}
 */
function isRichCrawlDoc(doc) {
  if (!doc || typeof doc !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (doc);
  const ing = o.ingredients;
  const times = o.times;
  const hasIng = Array.isArray(ing) && ing.length > 0;
  const hasTimes =
    times &&
    typeof times === "object" &&
    Object.keys(/** @type {Record<string, unknown>} */ (times)).length > 0;
  return hasIng || hasTimes;
}

/**
 * @param {string} groupName
 * @returns {Promise<{ totalDocs: number, richDocs: number }>}
 */
async function countRichDocsOnGroupNodes(groupName) {
  const dist = globalThis.distribution;
  const nodesObj = await new Promise((resolve, reject) => {
    dist.local.groups.get(groupName, (e, nodes) => {
      if (e) reject(e);
      else resolve(nodes || {});
    });
  });
  const nodes = Object.values(nodesObj);
  let totalDocs = 0;
  let richDocs = 0;

  for (const node of nodes) {
    /** @type {string[]} */
    const keys = await new Promise((resolve, reject) => {
      dist.local.comm.send(
        [{ key: null, gid: GID_DOCS }],
        { node, service: "store", method: "get", gid: "local" },
        (err, ks) => {
          if (err) reject(err);
          else resolve(Array.isArray(ks) ? ks : []);
        },
      );
    });

    for (const key of keys) {
      const doc = await new Promise((resolve, reject) => {
        dist.local.comm.send(
          [{ key, gid: GID_DOCS }],
          { node, service: "store", method: "get", gid: "local" },
          (err, v) => {
            if (err) reject(err);
            else resolve(v);
          },
        );
      });
      if (doc == null) continue;
      totalDocs++;
      if (isRichCrawlDoc(doc)) richDocs++;
    }
  }

  return { totalDocs, richDocs };
}

module.exports = { isRichCrawlDoc, countRichDocsOnGroupNodes };
