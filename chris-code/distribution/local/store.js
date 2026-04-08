// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 *
 * @typedef {Object} StoreConfig
 * @property {?string} key
 * @property {?string} gid
 *
 * @typedef {StoreConfig | string | null} SimpleConfig
 */

/* Notes/Tips:

- Use absolute paths to make sure they are agnostic to where your code is running from!
  Use the `path` module for that.
*/

const fs = require('fs');
const path = require('path');
const id = globalThis.distribution.util.id;
const serialize = globalThis.distribution.util.serialize;
const deserialize = globalThis.distribution.util.deserialize;


function parseConfig(configuration, state = null) {
  let key, gid;
  if (configuration === null || configuration === undefined) {
    key = id.getID(state);
    gid = 'local';
  } else if (typeof configuration === 'string') {
    key = configuration;
    gid = 'local';
  } else {
    key = configuration.key !== undefined ? configuration.key : id.getID(state);
    gid = configuration.gid || 'local';
  }
  return {key, gid};
}

function getStoreDir(gid) {
  const nodeConfig = globalThis.distribution.node?.config;
  const nid = id.getNID(nodeConfig);
  const dir = path.resolve(__dirname, `../../store/${nid}/${gid}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  return dir;
}



/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function keyToFilename(key) {
  return Buffer.from(String(key)).toString('hex');
}

function filenameToKey(filename) {
  return Buffer.from(filename, 'hex').toString();
}

function put(state, configuration, callback) {
  // return callback(new Error('store.put not implemented'));
  const {key, gid} = parseConfig(configuration, state);
  const dir = getStoreDir(gid);
  const filename = path.join(dir, keyToFilename(key));

  try {
    fs.writeFileSync(filename, serialize(state));
    return callback(null, state);
  } catch (e) {
    return callback(e);
  }
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  // return callback(new Error('store.get not implemented'));
  const {key, gid} = parseConfig(configuration);
  const dir = getStoreDir(gid);

  if (key === null) {
    try {
      const files = fs.readdirSync(dir);
      return callback(null, files.map((f) => filenameToKey(f)));
    } catch (e) {
      return callback(e);
    }
  }

  const filename = path.join(dir, keyToFilename(key));

  try {
    if (!fs.existsSync(filename)) {
      return callback(new Error('Key not found'), null);
    }
    const value = deserialize(fs.readFileSync(filename, 'utf8'));
    return callback(null, value);
  } catch (e) {
    return callback(e);
  }

}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  // return callback(new Error('store.del not implemented'));
  const {key, gid} = parseConfig(configuration);
  const dir = getStoreDir(gid);
  const filename = path.join(dir, keyToFilename(key));

  try {
    if (!fs.existsSync(filename)) {
      return callback(new Error('Key not found'), null);
    }
    const value = deserialize(fs.readFileSync(filename, 'utf8'));
    fs.unlinkSync(filename);
    return callback(null, value);
  } catch (e) {
    return callback(e);
  }
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  const {key, gid} = parseConfig(configuration, state);
  const dir = getStoreDir(gid);
  const filename = path.join(dir, keyToFilename(key));

  try {
    let existing = [];
    if (fs.existsSync(filename)) {
      const stored = deserialize(fs.readFileSync(filename, 'utf8'));
      existing = Array.isArray(stored) ? stored : [stored];
    }
    existing.push(state);
    fs.writeFileSync(filename, serialize(existing));
    return callback(null, existing);
  } catch (e) {
    return callback(e);
  }
}

module.exports = {put, get, del, append};
