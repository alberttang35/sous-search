// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 *
 * @typedef {Object} Routes
 * @property {(service: object, name: string, callback: Callback) => void} put
 * @property {(configuration: string, callback: Callback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Routes}
 */
function routes(config) {
  const context = {};
  context.gid = config.gid || 'all';

  /**
   * @param {object} service
   * @param {string} name
   * @param {Callback} callback
   */
  function put(service, name, callback) {
    const group = globalThis.distribution.local.groups[context.gid];
    
    if (!group || Object.keys(group).length === 0) {
      return callback(new Error('Group is empty or does not exist'), null);
    }

    const validationErrors = [];
    
    if (typeof service !== 'object' || service === null || Object.keys(service).length === 0) {
      validationErrors.push(new Error('Service is required and must be a non-empty object'));
    }
    
    if (typeof name !== 'string' || name === '') {
      validationErrors.push(new Error('Name is required and must be a non-empty string'));
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
        service: 'routes',
        method: 'put',
      };

      globalThis.distribution.local.comm.send([service, name], target, (e, v) => {
        if (e) {
          errors[nodeId] = e;
        } else {
          responses[nodeId] = v;
        }

        completed++;

        if (completed === nodeCount) {
          callback(errors, responses);
        }
      });
    });
  }

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function rem(configuration, callback) {
    const group = globalThis.distribution.local.groups[context.gid];
    
    if (!group || Object.keys(group).length === 0) {
      return callback(new Error('Group is empty or does not exist'), null);
    }

    const nodeIds = Object.keys(group);
    const nodeCount = nodeIds.length;

    const errors = {};
    
    if (typeof configuration !== 'string' || configuration === '') {
      nodeIds.forEach((nodeId) => {
        errors[nodeId] = new Error('Configuration is required and must be a non-empty string');
      });
      return callback(errors, {})
    }

    const responses = {};

    let completed = 0;

    nodeIds.forEach((nodeId) => {
      const node = group[nodeId];
      
      const target = {
        node: node,
        service: 'routes',
        method: 'rem',
      };

      globalThis.distribution.local.comm.send([configuration], target, (e, v) => {
        if (e) {
          errors[nodeId] = e;
        } else {
          responses[nodeId] = v;
        }

        completed++;

        if (completed === nodeCount) {
          callback(errors, responses);
        }
      });
    });
  }

  return {put, rem};
}

module.exports = routes;
