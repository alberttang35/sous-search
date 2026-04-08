// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function get(configuration, callback) {
  // handle missing callback
    if (!callback) {
      callback = (e, v) => {
        if (e) console.error(e);
        else console.log(v);
      };
    }

    // handle missing configuration - provide default
    if (!configuration) {
      callback(new Error('configuration parameter required'));
      return;
    }

    let node = globalThis.distribution.node.config;

    if (configuration === 'sid') {
      callback(null, globalThis.distribution.util.id.getSID(node));
    } else if (configuration === 'nid') {
      callback(null, globalThis.distribution.util.id.getNID(node));
    } else if (configuration === 'ip') {
      callback(null, node.ip);
    } else if (configuration === 'port') {
      callback(null, node.port);
    } else if (configuration === 'counts') {
      // revisit this
      callback(null, globalThis.distribution.node['messageCounts'] || 0);
    } else if (configuration === 'heapTotal') {
      callback(null, process.memoryUsage().heapTotal);
    } else if (configuration === 'heapUsed') {
      callback(null, process.memoryUsage().heapUsed);
    } else {
      // is this the right error message to return?
      callback(new Error(`Invalid configuration property: ${configuration}`));
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
