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
const { id } = require("../util/util.js");
const path = require("path");


/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function put(state, configuration, callback) {
  // configuration
  if (!configuration) {
    configuration = id.getID(state);
  }
  configuration = typeof configuration === "string" ? configuration : configuration.gid;
  configuration = configuration.replace(/[^a-z0-9]/gi, '');
  // console.log(configuration);
  fs.writeFile(path.resolve("store", configuration), distribution.util.serialize(state), "utf-8", () => {
    return callback(null, state);
  });
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  const key = typeof configuration === "string" ? configuration : configuration.key
  fs.readFile(path.resolve("store", key), "utf-8", (err, data) => {
    if (err) {
      return callback(Error("key not found"));
    }
    return callback(null, distribution.util.deserialize(data));
  });
}

/**
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function del(configuration, callback) {
  // return callback(new Error('store.del not implemented'));
  const key = typeof configuration === "string" ? configuration : configuration.key
  // const filepath = path.resolve("store", key);
  fs.readFile(path.resolve("store", key), "utf-8", (err, data) => {
    if (err) {
      return callback(Error("key not found"));
    }
    // delete
    fs.rm(path.resolve("store", key), () => {
      return callback(null, distribution.util.deserialize(data));
    })
  })
}

/**
 * @param {any} state
 * @param {SimpleConfig} configuration
 * @param {Callback} callback
 */
function append(state, configuration, callback) {
  // return callback(new Error('store.append not implemented')); // You'll need to implement this method for the distributed processing milestone.
  const key = typeof configuration === "string" ? configuration : configuration.key
  fs.readFile(path.resolve("store", key), "utf-8", (err, data) => {
    if (err) {
      return callback(Error("key not found"));
    }
    const existing = distribution.util.deserialize(data);
    if (!Array.isArray(existing)) {
      return callback(Error("existing value is not an array"));
    }
    const newValue = existing.concat(state);
    fs.writeFile(path.resolve("store", key), distribution.util.serialize(newValue), "utf-8", () => {
      return callback(null, newValue);
    });
  });

}

module.exports = {put, get, del, append};
