// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Status
 * @property {(configuration: string, callback: Callback) => void} get
 * @property {(configuration: Node, callback: Callback) => void} spawn
 * @property {(callback: Callback) => void} stop
 */

/**
 * @param {Config} config
 * @returns {Status}
 */

function status(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function get(configuration, callback) {
    // callback(new Error('status.get not implemented'));
    if (!callback) {
      callback = (e, v) => {
        if (e) console.error(e);
        else console.log(v);
    }}

    // handle missing configuration - provide default
    if (!configuration) {
      callback(new Error('configuration parameter required'));
      return;
    }
    const message = [configuration];
    const remote = {service: 'status', method: 'get', gid: context.gid};

    globalThis.distribution[context.gid].comm.send(message, remote, (err, v) => {
      const errors = err || {};
      const values = {};

      Object.entries(v || {}).forEach(([sid, val]) => {
        if (val instanceof Error) {
          errors[sid] = val;
        } else {
          values[sid] = val;
        }
      });

      if (configuration === 'heapTotal') {
        const total = Object.values(values).reduce((acc, val) => acc + val, 0);
        return callback(errors, total);
      }

      if (configuration === 'nid' || configuration === 'sid') {
        return callback(errors, Object.values(values));
      }

      // everything else returns per-node map
      return callback(errors, values);
    });
  }

  /**
   * @param {Node} configuration
   * @param {Callback} callback
   */
  function spawn(configuration, callback) {
    if (!callback) callback = (e, v) => {};

    globalThis.distribution.local.status.spawn(configuration, (e, v) => {
      if (e) return callback(e, null);
      globalThis.distribution[context.gid].groups.add(
        context.gid,
        configuration,
        (e, v) => callback(e, v)
      );
    });
  }

  /**
   * @param {Callback} callback
   */
  function stop(callback) {
    if (!callback) callback = (e, v) => {};

    globalThis.distribution.local.groups.get(context.gid, (e, group) => {
      if (e) return callback(e, null);

      const localSID = globalThis.distribution.util.id.getSID(
        globalThis.distribution.node.config
      );

      // Filter out local node
      const nodes = Object.entries(group)
        .filter(([sid]) => sid !== localSID)
        .map(([, node]) => node);

      if (nodes.length === 0) return callback(null, {});

      let count = 0;
      const total = nodes.length;
      const errors = {};
      const values = {};

      nodes.forEach((node) => {
        const sid = globalThis.distribution.util.id.getSID(node);
        const remote = {node, service: 'status', method: 'stop', gid: 'local'};
        globalThis.distribution.local.comm.send([], remote, (err, val) => {
          if (err) errors[sid] = err;
          else values[sid] = val;
          count++;
          if (count === total) {
            const hasErrors = Object.keys(errors).length > 0;
            // @ts-ignore
            callback(hasErrors ? errors : null, values);
          }
        });
      });
    });
  }

  return {get, stop, spawn};
}

module.exports = status;
