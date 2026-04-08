// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

const { id } = require("../util/util.js");
const allServices = require('../all/all.js');

const groups = {
  local: {[globalThis.distribution.util.id.getSID(globalThis.distribution.node.config)]: globalThis.distribution.node.config},
  all: {[globalThis.distribution.util.id.getSID(globalThis.distribution.node.config)]: globalThis.distribution.node.config},
};

/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  // return callback(new Error('groups.get not implemented'));
  if (groups[name]) {
    return callback(null, groups[name]);
  } else {
    return callback(new Error(`Group ${name} not found`));
  }
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  const gid = typeof config === 'string' ? config : config.gid;
  groups[gid] = {...group};

  const serviceConfig = typeof config === 'string' ? {gid} : {gid, ...config};
  globalThis.distribution[gid] = allServices.setup(serviceConfig);

  return callback(null, groups[gid]);
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  // return callback(new Error('groups.del not implemented'));
  if (!groups[name]) {
    return callback(new Error(`Group ${name} not found`));
  }
  const group = groups[name];
  delete groups[name];
  delete globalThis.distribution[name];
  return callback(null, group);
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  if (!groups[name]) {
    if (callback) return callback(new Error(`Group ${name} not found`));
    return;
  }
  const sid = id.getSID(node);
  groups[name][sid] = node;
  if (callback) return callback(null, groups[name]);
}

/**
 * @param {string} name
 * @param {string} sid
 * @param {Callback} callback
 */
function rem(name, sid, callback) {
  if (!groups[name]) {
    if (callback) return callback(new Error(`Group ${name} not found`));
    return;
  }
  delete groups[name][sid];
  if (callback) return callback(null, groups[name]);
}

module.exports = {get, put, del, add, rem};
