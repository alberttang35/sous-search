// @ts-check

/**
 * List all keys stored under `gid` on every node in group `groupName` (union).
 * @param {string} groupName
 * @param {string} gid
 * @param {(err: Error | null, keys?: string[]) => void} callback
 */
function listKeysAllNodes(groupName, gid, callback) {
  const dist = globalThis.distribution;
  dist.local.groups.get(groupName, (e, nodes) => {
    if (e) return callback(e);
    const nodeArr = Object.values(nodes);
    if (!nodeArr.length) return callback(null, []);

    const allKeys = [];
    let done = 0;
    nodeArr.forEach((node) => {
      dist.local.comm.send(
          [{key: null, gid}],
          {node, service: 'store', method: 'get', gid: 'local'},
          (err, keys) => {
            if (!err && Array.isArray(keys)) allKeys.push(...keys);
            if (++done === nodeArr.length) {
              callback(null, [...new Set(allKeys)]);
            }
          },
      );
    });
  });
}

/**
 * @param {{ key: string | null, gid: string }} cfg
 * @returns {Promise<any>}
 */
function localStoreGetPromise(cfg) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.store.get(cfg, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

/**
 * @param {any} state
 * @param {{ key: string, gid: string }} cfg
 * @returns {Promise<any>}
 */
function localStorePutPromise(state, cfg) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.store.put(state, cfg, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

/**
 * @param {any} state
 * @param {{ key: string, gid: string }} cfg
 * @returns {Promise<any>}
 */
function allStorePutPromise(state, cfg) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.all.store.put(state, cfg, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

/**
 * @param {{ key: string, gid: string }} cfg
 * @returns {Promise<any>}
 */
function allStoreGetPromise(cfg) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.all.store.get(cfg, (err, val) => {
      if (err) reject(err);
      else resolve(val);
    });
  });
}

/**
 * @param {Object} configuration MRConfig (map, reduce, inputGid?, jobId?)
 * @returns {Promise<any[]>}
 */
function mrExecPromise(configuration) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.all.mr.exec(configuration, (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

module.exports = {
  listKeysAllNodes,
  localStoreGetPromise,
  localStorePutPromise,
  allStorePutPromise,
  allStoreGetPromise,
  mrExecPromise,
};
