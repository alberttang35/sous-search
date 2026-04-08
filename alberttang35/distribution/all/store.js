// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Hasher} Hasher
 * @typedef {import("../types.js").Node} Node
 */


/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */


/**
 * @param {Config} config
 */
function store(config) {
  const context = {
    gid: config.gid || 'all',
    hash: config.hash || globalThis.distribution.util.id.naiveHash,
    subset: config.subset,
  };

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    // return callback(new Error('store.get not implemented'));
    console.log(context.gid);
    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    console.log(configuration);
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    // need to do something like this to communicate to the other node
    distribution.local.comm.send([configuration], 
      {node: node, service: 'store', method: 'get'}, 
      (e, v) => {
        if (e) {
          return callback(e)
        }
        return callback(null, v);
      });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    if (!configuration) {
      configuration = distribution.util.id.getID(state);
    }

    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    distribution.local.comm.send([state, configuration], 
      {node: node, service: 'store', method: 'put'}, 
      (e, v) => {
        if (e) {
          return callback(e)
        }
        return callback(null, v);
      });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    // return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
    if (!configuration) {
      configuration = distribution.util.id.getID(state);
    }

    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    distribution.local.comm.send([state, configuration], 
      {node: node, service: 'store', method: 'append'}, 
      (e, v) => {
        if (e) {
          return callback(e)
        }
        return callback(null, v);
      });
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    distribution.local.comm.send([configuration], 
      {node: node, service: 'store', method: 'del'}, 
      (e, v) => {
        if (e) {
          return callback(e)
        }
        return callback(null, v);
      });
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error('store.reconf not implemented'));
  }

  /* For the distributed store service, the configuration will
          always be a string */
  return {get, put, append, del, reconf};
}

module.exports = store;
