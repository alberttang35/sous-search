// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const { getNID, getSID } = require("../util/id.js");
const distribution = globalThis.distribution;

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  if (typeof callback !== 'function') {
    callback = (_, v) => console.log(v);
  }
  switch (configuration) {
    case 'nid':
      return callback(null, getNID(distribution.node.config));
    case 'sid':
      return callback(null, getSID(distribution.node.config));
    case "ip":
      return callback(null, distribution.node.config.ip);
    case 'port':
      return callback(null, distribution.node.config.port);
    case 'counts':
      if (distribution.local.count === undefined) {
        // TODO: not completely correct
        distribution.local.count = 0;
      }
      return callback(null, distribution.local.count);
    case 'heapTotal':
      return callback(null, process.memoryUsage().heapTotal);
    case 'heapUsed':
      return callback(null, process.memoryUsage().heapUsed);
    default:
      return callback(new Error('Invalid configuration for status.get'));
  }
};


/**
 * @param {Node} configuration
 * @param {Callback} callback
 */
function spawn(configuration, callback) {
  callback(new Error('status.spawn not implemented'));
}

/**
 * @param {Callback} callback
 */
function stop(callback) {
  callback(new Error('status.stop not implemented'));
}

module.exports = {get, spawn, stop};
