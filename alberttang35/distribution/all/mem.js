// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */


/**
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 *
 * @typedef {Object} Mem
 * @property {(configuration: SimpleConfig, callback: Callback) => void} get
 * @property {(state: any, configuration: SimpleConfig, callback: Callback) => void} put
 * @property {(state: any, configuration: SimpleConfig, callback: Callback) => void} append
 * @property {(configuration: SimpleConfig, callback: Callback) => void} del
 * @property {(configuration: Object.<string, Node>, callback: Callback) => void} reconf
 */


/**
 * @param {Config} config
 * @returns {Mem}
 */
function mem(config) {
  const context = {};
  context.gid = config.gid || 'all';
  context.hash = config.hash || globalThis.distribution.util.id.naiveHash;

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    // find the right node using hash
    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    // need to do something like this to communicate to the other node
    distribution.local.comm.send([configuration], 
      {node: node, service: 'mem', method: 'get'}, 
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
    // return callback(new Error('mem.put not implemented'));

    if (!configuration) {
      configuration = distribution.util.id.getID(state);
    }

    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    distribution.local.comm.send([state, configuration], 
      {node: node, service: 'mem', method: 'put'}, 
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
    return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    // return callback(new Error('mem.del not implemented'));

    const group = Object.values(distribution.local.groups[context.gid])
    const groupID = group.map(distribution.util.id.getID)
    const id = typeof configuration === "string" ? configuration : configuration.gid; // i think
    const nodeID = context.hash(distribution.util.id.getID(id), groupID); // hash takes kid and nids
    const node = distribution.local.groups[context.gid][nodeID.substring(0,5)];

    distribution.local.comm.send([configuration], 
      {node: node, service: 'mem', method: 'del'}, 
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
    return callback(new Error('mem.reconf not implemented'));
  }
  /* For the distributed mem service, the configuration will
          always be a string */
  return {
    get,
    put,
    append,
    del,
    reconf,
  };
}

module.exports = mem;
