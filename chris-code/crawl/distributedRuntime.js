// @ts-check
'use strict';

const utilMod = require('../distribution/util/util.js');

/**
 * @param {string} name
 * @param {object} service
 * @returns {Promise<void>}
 */
function routesPut(name, service) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.routes.put(service, name, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * @returns {Promise<void>}
 */
function startNodeServer() {
  const {start} = require('../distribution/local/node.js');
  return new Promise((resolve, reject) => {
    start((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Add additional nodes to the group after initial bootstrap.
 * @param {{ip: string, port: number}} nodeConfig
 * @param {string} gid
 * @returns {Promise<void>}
 */
async function addNodeToGroup(nodeConfig, gid) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.groups.add(gid, nodeConfig, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Bootstraps a single node with local + all distribution services.
 * @param {{port: number, ip?: string, gid?: string}} opts
 * @returns {Promise<void>}
 */
async function bootstrapDistributionRuntime(opts) {
  const ip = opts.ip || process.env.BIND_IP || '127.0.0.1';
  const gid = opts.gid || 'all';
  globalThis.distribution = {
    util: utilMod,
    node: {config: {ip, port: opts.port}},
  };

  const local = require('../distribution/local/local.js');
  globalThis.distribution.local = local;

  await routesPut('store', local.store);
  await routesPut('mem', local.mem);
  await routesPut('groups', local.groups);
  await routesPut('gossip', local.gossip);

  const allServices = require('../distribution/all/all.js');
  globalThis.distribution.all = allServices.setup({gid});

  await startNodeServer();
}

/**
 * @returns {Promise<void>}
 */
async function stopDistributionRuntime() {
  const srv = globalThis.distribution?.node?.server;
  if (!srv) return;
  await new Promise((resolve) => srv.close(resolve));
}

module.exports = {
  bootstrapDistributionRuntime,
  stopDistributionRuntime,
  addNodeToGroup,
};
