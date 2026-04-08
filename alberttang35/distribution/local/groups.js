// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../types.js").Node} Node
 */

const { id } = require("../util/util.js");

/**
 * @param {string} name
 * @param {Callback} callback
 */
function get(name, callback) {
  if (!callback) {
    callback = console.log;
  }
  if (name === 'all') {
    const nodes = Object.keys(globalThis.distribution.local.groups).reduce((acc, groupName) => {
      // not fully correct
      // console.log(groupName);
      const groupNodes = globalThis.distribution.local.groups[groupName];
      Object.keys(groupNodes).forEach((nodeId) => {
        acc[nodeId] = groupNodes[nodeId];
      });
      return acc;
    }, {});
    nodes[id.getSID(distribution.node.config)] = distribution.node.config;
    return callback(null, nodes);
  }
  if (name === 'local') {
    const nodes = {}
    nodes[id.getSID(distribution.node.config)] = distribution.node.config;
    return callback(null, nodes);
  }
  if (!distribution.local.groups[name]) {
    return callback(new Error('Group not found'));
  }
  return callback(null, distribution.local.groups[name]);
}

/**
 * @param {Config | string} config
 * @param {Object.<string, Node>} group
 * @param {Callback} callback
 */
function put(config, group, callback) {
  if (!callback) {
    callback = console.log;
  }
  const id = typeof config === 'string' ? config : config.gid;
  distribution.local.groups[id] = group;
  distribution[id] = {}
  Object.keys(distribution.all).forEach((s) => {
    distribution[id][s] = require(`../all/${s}.js`)(config)
  })
  return callback(null, distribution.local.groups[id]);
}

/**
 * @param {string} name
 * @param {Callback} callback
 */
function del(name, callback) {
  // return callback(new Error('groups.del not implemented'));
  if (!callback) {
    callback = console.log;
  }
  const temp = distribution.local.groups[name];
  if (temp === undefined) {
    return callback(new Error('Group not found'));
  }
  delete distribution.local.groups[name];
  delete distribution[name];
  return callback(null, temp);
}

/**
 * @param {string} name
 * @param {Node} node
 * @param {Callback} callback
 */
function add(name, node, callback) {
  if (!callback) {
    callback = console.log;
  }
  if (!distribution.local.groups[name]) {
    return callback(new Error('Group not found'));
  }
  // distribution.local.groups[name] = distribution.local.groups[name];
  distribution.local.groups[name][id.getSID(node)] = node;
  return callback(null, distribution.local.groups[name]);
};

/**
 * @param {string} name
 * @param {string} node
 * @param {Callback} callback
 */
function rem(name, node, callback) {
  if (!distribution.local.groups[name]) {
    return callback(new Error('Group not found'));
  }
  const temp = distribution.local.groups[name];
  if (temp === undefined) {
    return callback(new Error('Node not found in group'));
  }
  delete distribution.local.groups[name][node];
  return callback(null, temp);
};

module.exports = {get, put, del, add, rem};
