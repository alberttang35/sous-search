// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Config} Config
 * @typedef {import("../util/id.js").Node} Node
 *
 * @typedef {Object} Groups
 * @property {(config: Config | string, group: Object.<string, Node>, callback: Callback) => void} put
 * @property {(name: string, callback: Callback) => void} del
 * @property {(name: string, callback: Callback) => void} get
 * @property {(name: string, node: Node, callback: Callback) => void} add
 * @property {(name: string, node: string, callback: Callback) => void} rem
 */

/**
 * @param {Config} config
 * @returns {Groups}
 */
function groups(config) {
  const context = {gid: config.gid || 'all'};

  /**
   * @param {Config | string} config
   * @param {Object.<string, Node>} group
   * @param {Callback} callback
   */
  function put(config, group, callback) {
    if (!callback) {
      callback = console.log;
    }
    const responses = {};
    const errors = {};
    let completed = 0;

    const nodes = Object.keys(distribution.local.groups[context.gid] || {});
    const nodeCount = nodes.length;

    if (nodeCount === 0) {
      return callback(new Error('Group has no nodes'));
    }

    // Call put on each node in the group
    nodes.forEach((nodeId) => {
      const node = distribution.local.groups[context.gid][nodeId];
      distribution.local.comm.send([config, group], 
          {node: node, service: 'groups', method: 'put'}, 
          (e, v) => {
            if (e) {
              errors[nodeId] = e;
            } else {
              responses[nodeId] = v;
            }
            completed++;
            
            // Call callback once all nodes have responded
            if (completed === nodeCount) {
              if (Object.keys(errors).length > 0) {
                return callback(errors, responses);
              }
              callback({}, responses);
            }
          });
    });
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function del(name, callback) {
    if (!callback) {
      callback = console.log;
    }
    const responses = {};
    const errors = {};
    let completed = 0;

    const nodes = Object.keys(distribution.local.groups[context.gid] || {});
    const nodeCount = nodes.length;

    if (nodeCount === 0) {
      return callback(new Error('Group has no nodes'));
    }

    nodes.forEach((nodeId) => {
      const node = distribution.local.groups[context.gid][nodeId];
      distribution.local.comm.send([name], 
          {node: node, service: 'groups', method: 'del'}, 
          (e, v) => {
            if (e) {
              errors[nodeId] = e;
            } else {
              responses[nodeId] = v;
            }
            completed++;
            
            if (completed === nodeCount) {
              if (Object.keys(errors).length > 0) {
                return callback(errors, responses);
              }
              callback({}, responses);
            }
          });
    });
  }

  /**
   * @param {string} name
   * @param {Callback} callback
   */
  function get(name, callback) {
    if (!callback) {
      callback = console.log;
    }
    const responses = {};
    const errors = {};
    let completed = 0;

    const nodes = Object.keys(distribution.local.groups[context.gid] || {});
    const nodeCount = nodes.length;

    if (nodeCount === 0) {
      return callback(new Error('Group has no nodes'));
    }

    nodes.forEach((nodeId) => {
      const node = distribution.local.groups[context.gid][nodeId];
      distribution.local.comm.send([name], 
          {node: node, service: 'groups', method: 'get'}, 
          (e, v) => {
            if (e) {
              errors[nodeId] = e;
            } else {
              responses[nodeId] = v;
            }
            completed++;
            
            if (completed === nodeCount) {
              if (Object.keys(errors).length > 0) {
                return callback(errors, responses);
              }
              callback({}, responses);
            }
          });
    });
  }

  /**
   * @param {string} name
   * @param {Node} node
   * @param {Callback} callback
   */
  function add(name, node, callback) {
    if (!callback) {
      callback = console.log;
    }
    const responses = {};
    const errors = {};
    let completed = 0;

    const nodes = Object.keys(distribution.local.groups[context.gid] || {});
    const nodeCount = nodes.length;

    if (nodeCount === 0) {
      return callback(new Error('Group has no nodes'));
    }

    nodes.forEach((nodeId) => {
      const groupNode = distribution.local.groups[context.gid][nodeId];
      distribution.local.comm.send([name, node], 
          {node: groupNode, service: 'groups', method: 'add'}, 
          (e, v) => {
            if (e) {
              errors[nodeId] = e;
            } else {
              responses[nodeId] = v;
            }
            completed++;
            
            if (completed === nodeCount) {
              if (Object.keys(errors).length > 0) {
                return callback(errors, responses);
              }
              callback({}, responses);
            }
          });
    });
  }

  /**
   * @param {string} name
   * @param {string} node
   * @param {Callback} callback
   */
  function rem(name, node, callback) {
    if (!callback) {
      callback = console.log;
    }
    const responses = {};
    const errors = {};
    let completed = 0;

    const nodes = Object.keys(distribution.local.groups[context.gid] || {});
    const nodeCount = nodes.length;

    if (nodeCount === 0) {
      return callback(new Error('Group has no nodes'));
    }

    nodes.forEach((nodeId) => {
      const groupNode = distribution.local.groups[context.gid][nodeId];
      distribution.local.comm.send([name, node], 
          {node: groupNode, service: 'groups', method: 'rem'}, 
          (e, v) => {
            if (e) {
              errors[nodeId] = e;
            } else {
              responses[nodeId] = v;
            }
            completed++;
            
            if (completed === nodeCount) {
              if (Object.keys(errors).length > 0) {
                return callback(errors, responses);
              }
              callback({}, responses);
            }
          });
    });
  }

  return {
    put, del, get, add, rem,
  };
}

module.exports = groups;
