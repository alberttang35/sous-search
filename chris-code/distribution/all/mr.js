// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").NID} NID
 */

/**
 * Map functions used for mapreduce (may return a Promise for async work).
 * @callback Mapper
 * @param {string} key
 * @param {any} value
 * @returns {object[]|Promise<object[]>}
 */

/**
 * Reduce functions used for mapreduce (may return a Promise).
 * @callback Reducer
 * @param {string} key
 * @param {any[]} value
 * @returns {object|Promise<object|undefined|null>}
 */

/**
 * @typedef {Object} MRConfig
 * @property {Mapper} map
 * @property {Reducer} reduce
 * @property {string[]} [keys]
 * @property {string} [inputGid] When set, each node reads map inputs from this **local store gid**
 *   (seed keys with `distribution.all.store.put(value, { key, gid: inputGid })` so URLs shard like the
 *   distributed store). When omitted, map reads from the MR group gid (same as `config.gid` on the mr
 *   service, usually `all`).
 * @property {string} [jobId] Stable id for this job; hashed to derive the ephemeral `${mrID}_map` /
 *   `${mrID}_reduce` gids and the `mr*` service name. Use a unique value per concurrent exec.
 *
 * @typedef {Object} Mr
 * @property {(configuration: MRConfig, callback: Callback) => void} exec
 */


/*
  Note: The only method explicitly exposed in the `mr` service is `exec`.
  Other methods, such as `map`, `shuffle`, and `reduce`, should be dynamically
  installed on the remote nodes and not necessarily exposed to the user.
*/

/**
 * @param {Config} config
 * @returns {Mr}
 */
function mr(config) {
  const context = {
    gid: config.gid || 'all',
  };

  /**
   * @param {MRConfig} configuration
   * @param {Callback} callback
   * @returns {void}
   */
  function exec(configuration, callback) {
    const id = globalThis.distribution.util.id;
    const mrID = configuration.jobId != null ?
      id.getID(String(configuration.jobId)) :
      id.getID(JSON.stringify(configuration) + Date.now());
    const mrGid = `mr${mrID.slice(0, 10)}`;
    const mapInputGid = configuration.inputGid != null ?
      configuration.inputGid :
      context.gid;

    /*
      MapReduce steps:
      1) Setup: register a service `mr-<id>` on all nodes in the group. The service implements the map, shuffle, and reduce methods.
      2) Map: make each node run map on its local data and store them locally, under a different gid, to be used in the shuffle step.
      3) Shuffle: group values by key using store.append.
      4) Reduce: make each node run reduce on its local grouped values.
      5) Cleanup: remove the `mr-<id>` service and return the final output.

      Note: Comments inside the stencil describe a possible implementation---you should feel free to make low- and mid-level adjustments as needed.
    */
    const mrService = {
      mapper: configuration.map,
      reducer: configuration.reduce,
      map: function(
          /** @type {string} */ mapInputGidParam,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Map reads each node's local keys under mapInputGidParam and writes to `${mrID}_map`.
        // Expected output: array of objects with a single key per object.
        // return callback(new Error('mr.map not implemented'));
        globalThis.distribution.local.store.get({key: null, gid: mapInputGidParam}, (e, keys) => {
          if (e || !keys || !keys.length) return callback(null, null);

          let done = 0;
          const finish = () => {
            if (++done === keys.length) callback(null, null);
          };

          /**
           * @param {any} raw
           */
          const writeMapOut = (srcKey, raw) => {
            const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
            if (!arr.length) return finish();

            globalThis.distribution.local.store.put(
                arr, {key: srcKey, gid: `${mrID}_map`}, () => finish(),
            );
          };

          keys.forEach((srcKey) => {
            globalThis.distribution.local.store.get({key: srcKey, gid: mapInputGidParam}, (e, value) => {
              if (e || value === undefined) return finish();

              try {
                const rawOrPromise = this.mapper(srcKey, value);
                if (rawOrPromise != null && typeof rawOrPromise.then === 'function') {
                  rawOrPromise.then((raw) => writeMapOut(srcKey, raw)).catch(() => finish());
                } else {
                  writeMapOut(srcKey, rawOrPromise);
                }
              } catch (_err) {
                finish();
              }
            });
          });
        });
      },
      shuffle: function(
          /** @type {string} */ gid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Fetch the mapped values from the local store
        // Shuffle groups values by key (via store.append).
        // return callback(new Error('mr.shuffle not implemented'));
        globalThis.distribution.local.store.get({key: null, gid: `${mrID}_map`}, (e, srcKeys) => {
          if (e || !srcKeys || !srcKeys.length) return callback(null, null);

          globalThis.distribution.local.groups.get(gid, (e, nodes) => {
            if (e) return callback(e);

            const nodeArr = Object.values(nodes);
            const nids = nodeArr.map((n) => globalThis.distribution.util.id.getNID(n));

            let outerDone = 0;
            const outerFinish = () => {
              if (++outerDone === srcKeys.length) callback(null, null);
            };

            srcKeys.forEach((srcKey) => {
              globalThis.distribution.local.store.get({key: srcKey, gid: `${mrID}_map`}, (e, arr) => {
                if (e || !arr || !arr.length) return outerFinish();

                let innerDone = 0;
                const innerFinish = () => {
                  if (++innerDone === arr.length) outerFinish();
                };

                arr.forEach((kvObj) => {
                  const k = Object.keys(kvObj)[0];
                  const v = kvObj[k];

                  // hash the output key to select the responsible reduce node
                  const kid = globalThis.distribution.util.id.getID(k);
                  const targetNID = globalThis.distribution.util.id.naiveHash(kid, nids);
                  const targetNode = nodeArr.find(
                      (n) => globalThis.distribution.util.id.getNID(n) === targetNID,
                  );

                  const remote = {node: targetNode, service: 'store', method: 'append'};
                  globalThis.distribution.local.comm.send(
                      [v, {key: k, gid: `${mrID}_reduce`}],
                      remote,
                      () => innerFinish(),
                  );
                });
              });
            });
          });
        });
      },
      reduce: function(
          /** @type {string} */ gid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Fetch grouped values from local store, apply reducer, and return final output.
        // return callback(new Error('mr.reduce not implemented'));
        globalThis.distribution.local.store.get({key: null, gid: `${mrID}_reduce`}, (e, keys) => {
          if (e || !keys || !keys.length) return callback(null, []);

          let done = 0;
          const results = [];

          keys.forEach((k) => {
            globalThis.distribution.local.store.get({key: k, gid: `${mrID}_reduce`}, (e, values) => {
              const finishOne = () => {
                if (++done === keys.length) callback(null, results);
              };

              if (e || values === undefined) return finishOne();

              try {
                const resultOrPromise = this.reducer(k, values);
                if (resultOrPromise != null && typeof resultOrPromise.then === 'function') {
                  resultOrPromise
                      .then((result) => {
                        if (result !== undefined && result !== null) results.push(result);
                        finishOne();
                      })
                      .catch(() => finishOne());
                } else {
                  if (resultOrPromise !== undefined && resultOrPromise !== null) {
                    results.push(resultOrPromise);
                  }
                  finishOne();
                }
              } catch (_err) {
                finishOne();
              }
            });
          });
        });
      },
    };


    /* // Self-register the coordinator's mr-<id> service on the local node
      globalThis.distribution.local.routes.put(coordinatorService, mrGid, (e) => {
        if (e) return callback(e);

        // Scatter: send mrService to all nodes in the group
        globalThis.distribution[context.gid].routes.put(mrService, mrGid, (errors, values) => {
          // Each node's response counts as its notify for the setup phase
          const responded = Object.keys({...(values || {}), ...(errors || {})});
          responded.forEach(() => coordinatorService.notify({}, () => {}));
        });
      });
    });
  } */
    // scatter mrService to every node in the group
    globalThis.distribution[context.gid].routes.put(mrService, mrGid, () => {
      // each node maps its local data
      globalThis.distribution[context.gid].comm.send(
          [mapInputGid, mrID],
          {service: mrGid, method: 'map'},
          () => {
            // each node routes its map outputs by key hash
            globalThis.distribution[context.gid].comm.send(
                [context.gid, mrID],
                {service: mrGid, method: 'shuffle'},
                () => {
                  // each node reduces its assigned keys
                  globalThis.distribution[context.gid].comm.send(
                      [context.gid, mrID],
                      {service: mrGid, method: 'reduce'},
                      (reduceErrors, reduceValues) => {
                        // collect and flatten all nodes' results
                        const allResults = [];
                        Object.values(reduceValues || {}).forEach((nodeResults) => {
                          if (Array.isArray(nodeResults)) allResults.push(...nodeResults);
                        });

                        // deregister mrGid service from all nodes
                        globalThis.distribution[context.gid].routes.rem(mrGid, () => {
                          callback(null, allResults);
                        });
                      },
                  );
                },
            );
          },
      );
    });
  }

  return {exec};
}

module.exports = mr;
