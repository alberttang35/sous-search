// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").Callback} Callback
 */
const http = require('node:http');
const url = require('node:url');
const log = require('../util/log.js');

const yargs = require('yargs/yargs');

/**
 * @returns {Node}
 */
function setNodeConfig() {
  const args = yargs(process.argv)
      .help(false)
      .version(false)
      .parse();

  let maybeIp; let maybePort; let maybeOnStart;
  if (typeof args.ip === 'string') {
    maybeIp = args.ip;
  }
  if (typeof args.port === 'string' || typeof args.port === 'number') {
    maybePort = parseInt(String(args.port), 10);
  }

  if (args.help === true || args.h === true) {
    console.log('Node usage:');
    console.log('  --ip <ip address>      The ip address to bind the node to');
    console.log('  --port <port>          The port to bind the node to');
    console.log('  --config <config>      The serialized config string');
    process.exit(0);
  }

  if (typeof args.config === 'string') {
    let config = undefined;
    try {
      const distributionLib = require('@brown-ds/distribution')();
      config = distributionLib.util.deserialize(args.config);
    } catch (error) {
      try {
        config = JSON.parse(args.config);
      } catch {
        console.error('Cannot deserialize config string: ' + args.config);
        process.exit(1);
      }
    }

    if (typeof config?.ip === 'string') {
      maybeIp = config?.ip;
    }
    if (typeof config?.port === 'number') {
      maybePort = config?.port;
    }
    if (typeof config?.onStart === 'function') {
      maybeOnStart = config?.onStart;
    }
  }

  // Default values for config
  maybeIp = maybeIp ?? '127.0.0.1';
  maybePort = maybePort ?? 1234;

  return {
    ip: maybeIp,
    port: maybePort,
    onStart: maybeOnStart,
  };
}
/*
    The start function will be called to start your node.
    It will take a callback as an argument.
    After your node has booted, you should call the callback.
*/


/**
 * @param {(err?: Error | null) => void} callback
 * @returns {void}
 */
function start(callback) {
  const server = http.createServer((req, res) => {
    /* Your server will be listening for PUT requests. */

    // Write some code...

    if (req.method !== 'PUT') {
      res.writeHead(405, {'Content-Type': 'application/json'});
      const error = new Error(`Method ${req.method} not allowed. Only PUT requests are supported.`);
      res.end(globalThis.distribution.util.serialize(error));
      return;
    }

    if (!globalThis.distribution.node['messageCounts']) {
      globalThis.distribution.node['messageCounts'] = 0;
    }


    /*
      The path of the http request will determine the service to be used.
      The url will have the form: http://node_ip:node_port/service/method
    */

    // Write some code...
    const parsedUrl = url.parse(req.url, true);
    const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);

    if (pathParts.length !== 3) {
      res.statusCode = 400;
      res.end('Invalid path format. Expected /{gid}/{service}/{method}');
      return;
    }

    const [gid, service, method] = pathParts;


    /*
      A common pattern in handling HTTP requests in Node.js is to have a
      subroutine that collects all the data chunks belonging to the same
      request. These chunks are aggregated into a body variable.

      When the req.on('end') event is emitted, it signifies that all data from
      the request has been received. Typically, this data is in the form of a
      string. To work with this data in a structured format, it is often parsed
      into a JSON object using JSON.parse(body), provided the data is in JSON
      format.

      Our nodes expect data in JSON format.
    */

    // Write some code...

    /** @type {any[]} */
    const body = [];

    req.on('data', (chunk) => {
      body.push(chunk);
    });

    req.on('end', () => {

      /*
        Here, you can handle the service requests.
        Use the local routes service to get the service you need to call.
        You need to call the service with the method and arguments provided in the request.
        Then, you need to serialize the result and send it back to the caller.
      */

      // Write some code...
      try {
        // concatenate and deserialize the body
        const bodyString = Buffer.concat(body).toString();
        const args = bodyString ? globalThis.distribution.util.deserialize(bodyString) : [];

        globalThis.distribution.local.routes.get({service, gid}, (err, serviceObj) => {
        if (err) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(globalThis.distribution.util.serialize([err, null])); // Send Error object, not err.message
          return;
        }

        // check if the service even exists
        if (!serviceObj) {
          const error = new Error(`Service '${service}' not found`);
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(globalThis.distribution.util.serialize([error, null])); // Send Error object
          return;
        }
        
        // check if method exists on the service and if it's a proper function
        if (!serviceObj[method]) {
          const error = new Error(`Method '${method}' not found on service '${service}'`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(globalThis.distribution.util.serialize([error, null])); // Send Error object
          return;
        }

        // call service method
        serviceObj[method](...args, (error, value) => {
          // serialize the result in [error, value] format and send it back
          res.writeHead(200, {'Content-Type': 'application/json'});
          // Send the error object itself, not error.message
          res.end(globalThis.distribution.util.serialize([error, value]));
        });
      });
    } catch (error) {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(globalThis.distribution.util.serialize([error, null])); // Send Error object
    }
    });
  });

  /*
    Your server will be listening on the port and ip specified in the config
    You'll be calling the `callback` callback when your server has successfully
    started.

    At some point, we'll be adding the ability to stop a node
    remotely through the service interface.
  */

  // Important: allow tests to access server
  globalThis.distribution.node.server = server;
  const config = globalThis.distribution.node.config;

  server.once('listening', () => {
    callback(null);
  });

  server.once('error', (error) => {
    callback(error);
  });

  server.listen(config.port, config.ip);
}

module.exports = {start, config: setNodeConfig()};
