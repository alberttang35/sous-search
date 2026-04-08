/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */

const status = require("./status.js");
const comm = require("./comm.js");


/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */

const routesMap = {
  'status': status,
  'comm': comm,
  // 'routes' will be added below after we define the functions
};

  
function get(configuration, callback) {
  // Handle missing callback
  if (!callback) {
    callback = () => {}; // No-op callback
  }

  // Handle missing configuration
  if (!configuration) {
    callback(new Error('Service name is required'));
    return;
  }

  // Extract service name from configuration
  let serviceName;
  let gid = 'local'; // default value
  if (typeof configuration === 'string') {
    serviceName = configuration;
  } else if (typeof configuration === 'object' && configuration.service) {
    serviceName = configuration.service;
    gid = configuration.gid || 'local';
  } else {
    callback(new Error('Invalid configuration format'));
    return;
  }

  if (gid === 'local') {
    if (!routesMap[serviceName]) {
      return callback(new Error(`Service '${serviceName}' not found`));
    }
    return callback(null, routesMap[serviceName]);
  }

  const scoped = globalThis.distribution?.[gid]?.[serviceName];
  if (!scoped) {
    return callback(new Error(`Service '${serviceName}' not found in gid '${gid}'`));
  }
  return callback(null, scoped);
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  // return callback(new Error('routes.put not implemented'));
  if (!callback) {
    callback = () => {};
  }

  if (!service) {
    callback(new Error('Service object is required'));
    return;
  }

  if (!configuration) {
    callback(new Error('Service name is required'));
    return;
  }
  routesMap[configuration] = service;
  callback(null, service);
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  // return callback(new Error('routes.rem not implemented'));
  if (!callback) {
    callback = () => {};
  }

  if (!configuration) {
    callback(new Error('Service name is required'));
    return;
  }

  if (!routesMap[configuration]) {
    callback(new Error(`Service '${configuration}' not found`));
    return;
  }
  
  const service = routesMap[configuration];
  delete routesMap[configuration];
  callback(null, service);
}

routesMap['routes'] = {get, put, rem};

module.exports = {get, put, rem};
