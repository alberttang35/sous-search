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
    // return callback(new Error('routes.put not implemented'));
    const remote = {service: 'routes', method: 'put', gid: context.gid};
    globalThis.distribution.all.comm.send([service, name], remote, (e, v) => {
      callback(e, v);
    });
  }

  /**
   * @param {string} configuration
   * @param {Callback} callback
   */
  function rem(configuration, callback) {
    // return callback(new Error('routes.rem not implemented'));
    const remote = {service: 'routes', method: 'rem', gid: context.gid};
    globalThis.distribution.all.comm.send([configuration], remote, (e, v) => {
      callback(e, v);
    });
  }

  return {put, rem};
}

module.exports = routes;
