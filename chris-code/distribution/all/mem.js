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
    // return callback(new Error('mem.get not implemented'));
    let key;
    let gid = context.gid;
    if (configuration === null || configuration === undefined) {
      key = globalThis.distribution.util.id.getID(configuration);
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key 
      gid = configuration.gid || context.gid;
    }
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'mem', method: 'get'};
      const localConfig = {key, gid};
      globalThis.distribution.local.comm.send([localConfig], remote, callback);
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    // return callback(new Error('mem.put not implemented'));
    let key;
    let gid = context.gid;
    if (configuration === null || configuration === undefined) {
      key = globalThis.distribution.util.id.getID(state);
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key 
      gid = configuration.gid || context.gid;
    }
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'mem', method: 'put'};
      const localConfig = {key, gid};
      globalThis.distribution.local.comm.send([state, localConfig], remote, callback);
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
    let key;
    let gid = context.gid;
    if (configuration === null || configuration === undefined) {
      key = globalThis.distribution.util.id.getID(configuration);
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key 
      gid = configuration.gid || context.gid;
    }
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'mem', method: 'del'};
      const localConfig = {key, gid};
      globalThis.distribution.local.comm.send([localConfig], remote, callback);
    });
  }

  function getTargetNode(key, callback) {
    const kid = globalThis.distribution.util.id.getID(key);
    globalThis.distribution.local.groups.get(context.gid, (e, nodes) => {
      if (e) return callback(e);
      const nids = Object.values(nodes).map(globalThis.distribution.util.id.getNID);
      const targetNID = context.hash(kid, nids);
      const targetNode = Object.values(nodes).find(
        (n) => globalThis.distribution.util.id.getNID(n) === targetNID
      );
      callback(null, targetNode);
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
