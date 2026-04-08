// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require('node:http');
const util = require("../util/util.js");

/**
 * @typedef {Object} Target
 * @property {string} service
 * @property {string} method
 * @property {Node} node
 * @property {string} [gid]
 */

/**
 * @param {Array<any>} message
 * @param {Target} remote
 * @param {(error: Error, value?: any) => void} callback
 * @returns {void}
 */
function send(message, remote, callback) {
  // not sure if this is right
  if (!Array.isArray(message)) {
    return callback(new Error('Message must be an array'));
  }
  if (typeof remote.service !== 'string' || typeof remote.method !== 'string') {
    return callback(new Error('Remote service and method must be strings'));
  } 
  if (remote.service === '' || remote.method === '') {
    return callback(new Error('Remote service and method cannot be empty'));
  }
  if (typeof remote.node !== 'object' || typeof remote.node.ip !== 'string' || typeof remote.node.port !== 'number') {
    return callback(new Error('Remote node must be an object with ip and port'));
  }

  // const url = `http://${remote.node.ip}:${remote.node.port}/${remote.service}/${remote.method}`
  const path = remote.gid ? `/${remote.gid}/${remote.service}/${remote.method}` : `/local/${remote.service}/${remote.method}`;
  const req = http.request({
    method: "PUT",
    hostname: remote.node.ip,
    port: remote.node.port,
    path: path,
  }, (res) => {
    const data = [];
    res.on('data', (chunk) => {
      data.push(chunk);
    });
    res.on('end', () => {
      const response = Buffer.concat(data).toString();
      try {
        const deserialized = distribution.util.deserialize(response);
        if (res.statusCode !== 200) {
          return callback(new Error('Request failed with status code: ' + res.statusCode));
        }
        return callback(null, deserialized[1]);
      } catch (error) {
        return callback(new Error('Failed to deserialize response: ' + response));
      }
    });
  });

  req.on('error', (e) => {
    return callback(new Error('Failed to send request: ' + e.message));
  });

  req.write(distribution.util.serialize(message));
  req.end();
}

module.exports = {send};
