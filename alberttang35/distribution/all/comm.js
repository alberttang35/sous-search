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
    const group = globalThis.distribution.local.groups[context.gid];
    
    if (!group || Object.keys(group).length === 0) {
      return callback(new Error('Group is empty or does not exist'), null);
    }

    const validationErrors = [];
    
    if (!Array.isArray(message)) {
      validationErrors.push(new Error('Message must be an array'));
    }
    
    if (typeof configuration.service !== 'string' || configuration.service === '') {
      validationErrors.push(new Error('Service is required and must be a non-empty string'));
    }
    
    if (typeof configuration.method !== 'string' || configuration.method === '') {
      validationErrors.push(new Error('Method is required and must be a non-empty string'));
    }

    const nodeIds = Object.keys(group);
    const nodeCount = nodeIds.length;

    if (validationErrors.length > 0) {
      const errors = {};
      nodeIds.forEach((nodeId) => {
        errors[nodeId] = validationErrors[0];
      });
      return callback(errors, {});
    }

    const responses = {};
    const errors = {};
    let completed = 0;

    nodeIds.forEach((nodeId) => {
      const node = group[nodeId];
      
      const target = {
        node: node,
        service: configuration.service,
        method: configuration.method,
      };
      
      if (configuration.gid) {
        target.gid = configuration.gid;
      }

      globalThis.distribution.local.comm.send(message, target, (e, v) => {
        if (e) {
          errors[nodeId] = e;
        } else {
          responses[nodeId] = v;
        }

        completed++;
        // console.log(completed);

        if (completed === nodeCount) {
          callback(errors, responses);
        }
      });
    });
  }

  return {send};
}

module.exports = comm;
