// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 */

/**
 * NOTE: This Target is slightly different from local.all.Target
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {string} [gid]
 *
 * @typedef {Object} Comm
 * @property {(message: any[], configuration: Target, callback: Callback) => void} send
 */

/**
 * @param {Config} config
 * @returns {Comm}
 */
function comm(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {any[]} message
   * @param {Target} configuration
   * @param {Callback} callback
   */
  function send(message, configuration, callback) {
    const gid = configuration.gid || context.gid;
    globalThis.distribution.local.groups.get(gid, (e, group) => {
      if (e) return callback(new Error(`Group not found`), null);

      const nodeList = Object.values(group);
      const total = nodeList.length;

      if (total === 0) return callback(new Error(`Group is empty`), null);
      
      let count = 0;
      /** @type {Object.<string, Error>} */
      const errors = {};
      const values = {};

      nodeList.forEach((node) => {
        const sid = globalThis.distribution.util.id.getSID(node);
        const nodeRemote = {
          service: configuration.service,
          method: configuration.method,
          node: node,
          gid: 'local',
        };

        globalThis.distribution.local.comm.send(message, nodeRemote, (err, val) => {
          if (err) {
            errors[sid] = err;
          } else {
            values[sid] = val;
          }
          count++;
          if (count === total) {
            callback(errors, values);
          }
        });
      });
    });
  };
  return {send};
}

module.exports = comm;
