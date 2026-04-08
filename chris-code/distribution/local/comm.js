// @ts-check
/**
 * @typedef {import("../types.js").Callback} Callback
 * @typedef {import("../types.js").Node} Node
 */

const http = require('node:http');

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
  // return callback(new Error('comm.send not implemented'));
  if (!callback) {
    callback = () => {};
  }

  if (!message) {
    callback(new Error('Message is required'));
    return;
  }

  if (!Array.isArray(message)) {
    callback(new Error('Message must be an array'));
    return;
  }
  
  if (!remote || typeof remote !== 'object' || !remote.service || !remote.method || !remote.node) {
    callback(new Error('Remote configuration is incomplete'));
    return;
  }

  const { service, method, node } = remote;
  if (!node.ip || !node.port) {
    callback(new Error('Node must have IP and port'));
    return;
  }

  const gid = remote.gid || 'local';

  const path = `/${gid}/${service}/${method}`;
  const body = globalThis.distribution.util.serialize(message);
  const options = {
    hostname: node.ip,
    port: node.port,
    method: 'PUT',
    path: path,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const req = http.request(options, (res) => {
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      try {
        const [error, value] = globalThis.distribution.util.deserialize(responseData);
        if (error) {
          // console.log('Error in response:', error);
          callback(error, value);
        } else {
          callback(null, value);
        }
      } catch (err) {
        callback(new Error('Failed to parse response: ' + err.message));
      }
    });
  });

  req.on('error', (err) => {
    callback(err);
  });

  req.write(body);
  req.end();
}

module.exports = {send};
