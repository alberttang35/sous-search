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

const keyValues = {} 

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  // return callback(new Error('mem.put not implemented'));
  let key;
  let gid = 'local';
  // using sha256 if configuration is null
  if (configuration === null || configuration === undefined) {
    key = globalThis.distribution.util.id.getID(state);
  } else if (typeof configuration === 'string') {
    key = configuration;
  } else {
    key = configuration.key 
    gid = configuration.gid || 'local';
  }

  key = `${gid}:${key}`;
  keyValues[key] = state;
  return callback(null, keyValues[key]);
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
  let key;
  let gid = 'local';
  if (configuration === null || configuration === undefined) {
    key = globalThis.distribution.util.id.getID(configuration);
  } else if (typeof configuration === 'string') {
    key = configuration;
  } else {
    key = configuration.key 
    gid = configuration.gid || 'local';
  }

  key = `${gid}:${key}`;

  if (key in keyValues) {
    return callback(null, keyValues[key]);
  } else {
    return callback(new Error('Key not found'), null);
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  // return callback(new Error('mem.del not implemented'));
  let key;
  let gid = 'local';
  if (configuration === null || configuration === undefined) {
    key = globalThis.distribution.util.id.getID(configuration);
  } else if (typeof configuration === 'string') {
    key = configuration;
  } else {
    key = configuration.key 
    gid = configuration.gid || 'local';
  }

  key = `${gid}:${key}`;

  if (key in keyValues) {
    let state = keyValues[key];
    delete keyValues[key];
    return callback(null, state);
  } else {
    return callback(new Error('Key not found'), null);
  }
};

module.exports = {put, get, del, append};
