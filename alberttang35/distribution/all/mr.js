// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").NID} NID
 */

const { id } = require("../util/util.js");

/**
 * Map functions used for mapreduce
 * @callback Mapper
 * @param {string} key
 * @param {any} value
 * @returns {object[]}
 */

/**
 * Reduce functions used for mapreduce
 * @callback Reducer
 * @param {string} key
 * @param {any[]} value
 * @returns {object}
 */

/**
 * @typedef {Object} MRConfig
 * @property {Mapper} map
 * @property {Reducer} reduce
 * @property {string[]} keys
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
    const mrID = id.getID(`${configuration}${Date.now()}`);
    const mrGid = `mr${mrID}`;
    const group = globalThis.distribution.local.groups[context.gid];
    
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
          /** @type {string} */ mrGid,
          /** @type {string[]} */ keys,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Map should read the node's local keys under the mrGid gid and write to store under gid `${mrID}_map`.
        // Expected output: array of objects with a single key per object.
        let storedValues = [];
        let searched = 0;
        for (const key of keys) {
          // console.log(key);
          distribution.local.store.get(key, (e, v) => {
            if (v) {
              storedValues = [...storedValues, {key: key, value: v}];
            }
            searched++;
              
              if (searched === keys.length) {
                // console.log("storedValues:");
                // console.log(storedValues);

                let mappedValues = [];
                for (let i = 0; i < storedValues.length; i++) {
                  const key = storedValues[i].key;
                  const value = storedValues[i].value;
                  const out = this.mapper(key, value);
                  mappedValues.push(...out);
                }
                // console.log("mappedValues:");
                // console.log(mappedValues);
                // Store mapped values under `${mrID}_map` gid for shuffle step.
                // Note: you may want to store them in a way that makes it easier for the shuffle step to group by key (e.g., by storing them as `{key, value}` objects).
                distribution.local.store.put(mappedValues, `${mrID}_map`, (e, v) => {
                  if (e) {
                    return callback(e);
                  }
                  // console.log(v);
                  return callback(null, v);
                });
              }
            });
            
          
        }

        
      },
      shuffle: function(
          /** @type {string} */ gid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Fetch the mapped values from the local store
        // Shuffle groups values by key (via store.append).
        // return callback(new Error('mr.shuffle not implemented'));
        distribution.local.store.get(`${mrID}_map`, (e, values) => {
          if (e) {
            return callback(e);
          }
          console.log("mapped values:");
          console.log(values);
          values.forEach((v) => {
            const key = Object.keys(v)[0];
            const value = v[key];
            distribution.local.store.append(value, `${mrID}_shuffle`, key, (e, v) => {
              // console.log(v);
              if (e) {
                return callback(e);
              }
            });
          });
          return callback(null, null);
        });
      },
      reduce: function(
          /** @type {string} */ gid,
          /** @type {string} */ mrID,
          /** @type {Callback} */ callback,
      ) {
        // Fetch grouped values from local store, apply reducer, and return final output.
        // return callback(new Error('mr.reduce not implemented'));
        distribution.local.store.get(`${mrID}_shuffle`, (e, values) => {
          if (e) {
            return callback(e);
          }
          const reducedValues = {};
          for (let i = 0; i < values.length; i++) {
            const key = Object.keys(values[i])[0];
            const value = values[i][key];
            if (!reducedValues[key]) {
              reducedValues[key] = [];
            }
            reducedValues[key].push(value);
          }
          const finalOutput = {};
          for (const key in reducedValues) {
            const out = this.reducer(key, reducedValues[key]);
            finalOutput[key] = out;
          }
          return callback(null, finalOutput);
        });
      },
    };    

    const nodeIds = Object.keys(group);
    const nodeCount = nodeIds.length;
    const responses = {};
    // const errors = {};
    let registerCompleted = 0;
    let mapCompleted = 0;
    let shuffleCompleted = 0;
    let reduceCompleted = 0;

    nodeIds.forEach((nodeId) => {
      const node = group[nodeId];
      const target = {
        node: node,
        service: 'routes',
        method: 'put',
      };
      
      
      distribution.local.comm.send([mrService, mrGid], target, (e, v) => {
        if (e) {
          console.error('Error registering service on node', nodeId, ':', e);
          return callback(e);
        }
        console.log('Service registered on node', nodeId);
        // return callback(null, v);
        registerCompleted++;
        if (registerCompleted === nodeCount) {

          nodeIds.forEach((nodeId) => {
            const node = group[nodeId];
            const target = {
              node: node,
              service: mrGid,
              method: 'map',
            };
            distribution.local.comm.send([mrGid, configuration.keys, mrID], target, (e, v) => {
              if (e) {
                console.error('Error during map phase on node', nodeId, ':', e);
                return callback(e);
              }
              console.log('Map phase completed on node', nodeId);
              responses[nodeId] = v;
              mapCompleted++;
              if (Object.keys(responses).length === nodeCount) {
                // return callback(null, responses);

                nodeIds.forEach((nodeId) => {
                  const node = group[nodeId];
                  const target = {
                    node: node,
                    service: mrGid,
                    method: 'shuffle',
                  };
                  distribution.local.comm.send([mrGid, mrID], target, (e, v) => {
                    if (e) {
                      console.error('Error during shuffle phase on node', nodeId, ':', e);
                      return callback(e);
                    }
                    console.log('Shuffle phase completed on node', nodeId);
                    shuffleCompleted++;
                    if (shuffleCompleted === nodeCount) {

                      nodeIds.forEach((nodeId) => {
                        const node = group[nodeId];
                        const target = {
                          node: node,
                          service: mrGid,
                          method: 'reduce',
                        };
                        distribution.local.comm.send([mrGid, mrID], target, (e, v) => {
                          if (e) {
                            console.error('Error during reduce phase on node', nodeId, ':', e);
                            return callback(e);
                          }
                          console.log('Reduce phase completed on node', nodeId);
                          reduceCompleted++;

                          if (reduceCompleted === nodeCount) {
                            distribution[context.gid].service.remove(mrGid, (e, v) => {
                            if (e) {
                              return callback(e);
                            }
                            return callback(null, v);
                          });

                          }
                        });
                      })

                      }
                
                  });
                })


              }
            });
          })
        }
      });
      
    })
  }

  return {exec};
}

module.exports = mr;
