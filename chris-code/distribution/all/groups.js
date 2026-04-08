// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Groups
 * @property {(config: Config | string, group: Object.<string, Node>, callback: Callback) => void} put
 * @property {(name: string, callback: Callback) => void} del
 * @property {(name: string, callback: Callback) => void} get
 * @property {(name: string, node: Node, callback: Callback) => void} add
 * @property {(name: string, node: string, callback: Callback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Groups}
 */
function groups(config) {
  const context = {gid: config.gid || 'all'};

  /**
   * @param {Config | string} config
   * @param {Object.<string, Node>} group
   * @param {Callback} callback
   */
  function put(config, group, callback) {
    // return callback(new Error('groups.put not implemented'));
    const remote = {service: 'groups', method: 'put', gid: context.gid};
    globalThis.distribution[context.gid].comm.send([config, group], remote, (e, v) => {
      callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function del(name, callback) {
    // return callback(new Error('groups.del not implemented'));
    const remote = {service: 'groups', method: 'del', gid: context.gid};
    globalThis.distribution[context.gid].comm.send([name], remote, (e, v) => {
      callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function get(name, callback) {
    // return callback(new Error('groups.get not implemented'));
    const remote = {service: 'groups', method: 'get', gid: context.gid};
    globalThis.distribution[context.gid].comm.send([name], remote, (e, v) => {
      callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {Node} node
   * @param {Callback} callback
   */
  function add(name, node, callback) {
    // return callback(new Error('groups.add not implemented'));
    const remote = {service: 'groups', method: 'add', gid: context.gid};
    globalThis.distribution[context.gid].comm.send([name, node], remote, (e, v) => {
      callback(e || {}, v || {});
    });
  }

  /**
   * @param {string} name
   * @param {string} node
   * @param {Callback} callback
   */
  function rem(name, node, callback) {
    // return callback(new Error('groups.rem not implemented'));
    const remote = {service: 'groups', method: 'rem', gid: context.gid};
    globalThis.distribution[context.gid].comm.send([name, node], remote, (e, v) => {
      callback(e || {}, v || {});
    });
  }

  return {
    put, del, get, add, rem,
  };
}

module.exports = groups;
