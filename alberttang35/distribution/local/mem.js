// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 *
 * @typedef {Object} StoreConfig
 * @property {string | null} key
 * @property {string | null} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */

const { id } = require("../util/util.js");


/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  // return callback(new Error('mem.put not implemented'));
  if (!configuration) {
    configuration = id.getID(state);
  }
  configuration = typeof configuration === "string" ? configuration : configuration.gid;
  distribution.local.mem[configuration] = state
  return callback(null, state);

};

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  return callback(new Error('mem.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
};

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  // return callback(new Error('mem.get not implemented'));
  const key = typeof configuration === "string" ? configuration : configuration.key
  if (!distribution.local.mem[key]) {
    return callback(Error("key not found"));
  }
  return callback(null, distribution.local.mem[key]);
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  // return callback(new Error('mem.del not implemented'));
  const key = typeof configuration === "string" ? configuration : configuration.key;
  if (!distribution.local.mem[key]) {
    return callback(Error("key not found"));
  }
  const temp = distribution.local.mem[key];
  delete distribution.local.mem[key];
  return callback(null, temp);
};

module.exports = {put, get, del, append};
