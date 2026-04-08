/**
 * @typedef {import("../types").Callback} Callback
 * @typedef {string} ServiceName
 */


/**
 * @param {ServiceName | {service: ServiceName, gid?: string}} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function get(configuration, callback) {
  // handle both string and object configuration
  const service = typeof configuration === "string" ? configuration : configuration.service;
  const group = typeof configuration === "string" ? distribution.local : distribution.local.groups[configuration.gid];
  if (!group) {
    return callback(new Error('Group not found'));
  }
  if (group.hasOwnProperty(service)) {
    return callback(null, group[service]);
  } else {
    return callback(new Error('Service not found'));
  }
}

/**
 * @param {object} service
 * @param {string} configuration
 * @param {Callback} callback
 * @returns {void}
 */
function put(service, configuration, callback) {
  // console.log(configuration);
  if (typeof configuration !== 'string' || configuration.length === 0) {
    return callback(new Error('Configuration must be a non-empty string'));
  }
  distribution.local[configuration] = service;
  return callback(null);
}

/**
 * @param {string} configuration
 * @param {Callback} callback
 */
function rem(configuration, callback) {
  const temp = distribution.local[configuration];
  console.log(configuration);
  if (temp === undefined) {
    // console.log("here");
    return callback(new Error('Service not found'));
  }
  delete distribution.local[configuration];
  return callback(null, temp);
}

module.exports = {get, put, rem};
