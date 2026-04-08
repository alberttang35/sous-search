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
    let key;
    let gid = context.gid;
    if (configuration === null || configuration === undefined) {
      // Aggregate all keys from every node in the group
      globalThis.distribution.local.groups.get(gid, (e, nodes) => {
        if (e) return callback(e);
        const nodeArr = Object.values(nodes);
        const allKeys = [];
        let done = 0;
        nodeArr.forEach((node) => {
          const remote = {node, service: 'store', method: 'get'};
          globalThis.distribution.local.comm.send([{key: null, gid}], remote, (e, keys) => {
            if (!e && Array.isArray(keys)) allKeys.push(...keys);
            if (++done === nodeArr.length) callback(null, allKeys);
          });
        });
      });
      return;
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key;
      gid = configuration.gid || context.gid;
    }
    const localConfig = {key, gid};
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'store', method: 'get'};
      globalThis.distribution.local.comm.send([localConfig], remote, callback);
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function put(state, configuration, callback) {
    // return callback(new Error('store.put not implemented'));
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
    const localConfig = {key, gid};
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'store', method: 'put'};
      globalThis.distribution.local.comm.send([state, localConfig], remote, callback);
    });
  }

  /**
   * @param {any} state
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function append(state, configuration, callback) {
    let key;
    let gid = context.gid;
    if (configuration === null || configuration === undefined) {
      key = globalThis.distribution.util.id.getID(state);
    } else if (typeof configuration === 'string') {
      key = configuration;
    } else {
      key = configuration.key;
      gid = configuration.gid || context.gid;
    }
    const localConfig = {key, gid};
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'store', method: 'append'};
      globalThis.distribution.local.comm.send([state, localConfig], remote, callback);
    });
  }

  /**
   * @param {SimpleConfig} configuration
   * @param {Callback} callback
   */
  function del(configuration, callback) {
    // return callback(new Error('store.del not implemented'));
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
    const localConfig = {key, gid};
    getTargetNode(key, (e, targetNode) => {
      if (e) return callback(e);
      const remote = {node: targetNode, service: 'store', method: 'del'};
      globalThis.distribution.local.comm.send([localConfig], remote, callback);
    });
  }

  /**
   * @param {Object.<string, Node>} configuration
   * @param {Callback} callback
   */
  function reconf(configuration, callback) {
    return callback(new Error('store.reconf not implemented'));
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

  /* For the distributed store service, the configuration will
          always be a string */
  return {get, put, append, del, reconf};
}

module.exports = store;
