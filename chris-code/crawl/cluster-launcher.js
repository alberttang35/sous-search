#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Cluster launcher / membership sync helper.
 *
 * This script does not provision EC2 or start remote processes. It assumes each
 * node in --nodes-file is already running the distribution local node server
 * (service endpoints like /local/status/get and /local/groups/put).
 *
 * It then:
 * 1) checks node reachability/status
 * 2) pushes one consistent group map to every node
 * 3) verifies each node reports the same group membership
 *
 * Usage (run from chris-code/):
 *   node crawl/cluster-launcher.js --nodes-file crawl/eval/nodes.example.json
 */

const fs = require('fs');
const path = require('path');
const {
  bootstrapDistributionRuntime,
  stopDistributionRuntime,
} = require('./distributedRuntime.js');

/**
 * @typedef {{ip: string, port: number}} NodeAddr
 */

function parseArgs() {
  const out = {
    nodesFile: /** @type {string | null} */ (null),
    gid: 'all',
    coordinatorIp: process.env.BIND_IP || '127.0.0.1',
    coordinatorPort: parseInt(process.env.CLUSTER_LAUNCHER_PORT || '17778', 10),
    retries: 3,
    retryDelayMs: 1000,
    checkOnly: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--nodes-file' && process.argv[i + 1]) {
      out.nodesFile = path.resolve(process.cwd(), process.argv[++i]);
    } else if (a === '--gid' && process.argv[i + 1]) {
      out.gid = process.argv[++i];
    } else if (a === '--coordinator-ip' && process.argv[i + 1]) {
      out.coordinatorIp = process.argv[++i];
    } else if (a === '--coordinator-port' && process.argv[i + 1]) {
      out.coordinatorPort = parseInt(process.argv[++i], 10);
    } else if (a === '--retries' && process.argv[i + 1]) {
      out.retries = parseInt(process.argv[++i], 10);
    } else if (a === '--retry-delay-ms' && process.argv[i + 1]) {
      out.retryDelayMs = parseInt(process.argv[++i], 10);
    } else if (a === '--check-only') {
      out.checkOnly = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node crawl/cluster-launcher.js --nodes-file <path> [options]

Required:
  --nodes-file <path>        JSON array of {ip, port}

Options:
  --gid <name>               Group name to sync (default all)
  --coordinator-ip <ip>      Bind IP for this launcher process (default env BIND_IP or 127.0.0.1)
  --coordinator-port <n>     Bind port for this launcher process (default env CLUSTER_LAUNCHER_PORT or 17778)
  --retries <n>              Retries per node status check (default 3)
  --retry-delay-ms <n>       Delay between retries (default 1000)
  --check-only               Only check/verify membership; do not push groups.put
`);
      process.exit(0);
    }
  }

  return out;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} filePath
 * @returns {NodeAddr[]}
 */
function readNodesFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`nodes file must be an array: ${filePath}`);
  }
  /** @type {NodeAddr[]} */
  const out = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const ip = String(row.ip || '').trim();
    const port = Number(row.port);
    if (!ip || !Number.isFinite(port) || port <= 0) continue;
    out.push({ip, port});
  }
  if (!out.length) {
    throw new Error(`no valid nodes in ${filePath}`);
  }
  return out;
}

/**
 * @param {NodeAddr} node
 * @returns {Promise<string>}
 */
function getNodeSid(node) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.comm.send(
        ['sid'],
        {node, service: 'status', method: 'get', gid: 'local'},
        (err, sid) => {
          if (err) reject(err);
          else resolve(String(sid || ''));
        },
    );
  });
}

/**
 * @param {NodeAddr} node
 * @returns {Promise<string>}
 */
function getNodeIp(node) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.comm.send(
        ['ip'],
        {node, service: 'status', method: 'get', gid: 'local'},
        (err, ip) => {
          if (err) reject(err);
          else resolve(String(ip || ''));
        },
    );
  });
}

/**
 * @param {NodeAddr} node
 * @param {number} retries
 * @param {number} retryDelayMs
 * @returns {Promise<{sid: string, ipReported: string}>}
 */
async function waitForNode(node, retries, retryDelayMs) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const sid = await getNodeSid(node);
      const ipReported = await getNodeIp(node);
      if (!sid) throw new Error(`empty sid from ${node.ip}:${node.port}`);
      return {sid, ipReported};
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastErr || new Error(`node not reachable: ${node.ip}:${node.port}`);
}

/**
 * @param {string} gid
 * @param {NodeAddr} node
 * @param {Record<string, NodeAddr>} group
 * @returns {Promise<void>}
 */
function putGroupOnNode(gid, node, group) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.comm.send(
        [gid, group],
        {node, service: 'groups', method: 'put', gid: 'local'},
        (err) => {
          if (err) reject(err);
          else resolve();
        },
    );
  });
}

/**
 * @param {string} gid
 * @param {NodeAddr} node
 * @returns {Promise<Record<string, NodeAddr>>}
 */
function getGroupFromNode(gid, node) {
  return new Promise((resolve, reject) => {
    globalThis.distribution.local.comm.send(
        [gid],
        {node, service: 'groups', method: 'get', gid: 'local'},
        (err, group) => {
          if (err) reject(err);
          else resolve(group || {});
        },
    );
  });
}

/**
 * @param {NodeAddr[]} nodes
 * @param {number} retries
 * @param {number} retryDelayMs
 * @returns {Promise<Record<string, NodeAddr>>}
 */
async function buildCanonicalGroup(nodes, retries, retryDelayMs) {
  /** @type {Record<string, NodeAddr>} */
  const group = {};
  for (const node of nodes) {
    const {sid, ipReported} = await waitForNode(node, retries, retryDelayMs);
    if (group[sid]) {
      throw new Error(`duplicate sid ${sid} for ${node.ip}:${node.port}`);
    }
    group[sid] = {ip: ipReported || node.ip, port: node.port};
  }
  return group;
}

async function main() {
  const opts = parseArgs();
  if (!opts.nodesFile) {
    throw new Error('missing required --nodes-file');
  }

  const nodes = readNodesFile(opts.nodesFile);
  await bootstrapDistributionRuntime({
    ip: opts.coordinatorIp,
    port: opts.coordinatorPort,
    gid: opts.gid,
  });

  console.log(`[cluster-launcher] coordinator ${opts.coordinatorIp}:${opts.coordinatorPort}`);
  console.log(`[cluster-launcher] target gid=${opts.gid} nodes=${nodes.length}`);

  const canonicalGroup = await buildCanonicalGroup(nodes, opts.retries, opts.retryDelayMs);
  const expectedSize = Object.keys(canonicalGroup).length;
  console.log(`[cluster-launcher] reachable nodes=${expectedSize}`);

  if (!opts.checkOnly) {
    for (const node of nodes) {
      await putGroupOnNode(opts.gid, node, canonicalGroup);
      console.log(`[cluster-launcher] synced ${node.ip}:${node.port}`);
    }
  }

  /** @type {Array<{node: NodeAddr, ok: boolean, size: number, error?: string}>} */
  const verify = [];
  for (const node of nodes) {
    try {
      const group = await getGroupFromNode(opts.gid, node);
      const size = Object.keys(group || {}).length;
      verify.push({
        node,
        ok: size === expectedSize,
        size,
      });
    } catch (e) {
      verify.push({
        node,
        ok: false,
        size: 0,
        error: String(e && e.message ? e.message : e),
      });
    }
  }

  const okCount = verify.filter((x) => x.ok).length;
  const summary = {
    gid: opts.gid,
    checkOnly: opts.checkOnly,
    expectedSize,
    okCount,
    verify,
  };

  console.log(JSON.stringify(summary, null, 2));
  await stopDistributionRuntime();
  if (okCount !== verify.length) {
    process.exit(2);
  }
}

main().catch(async (e) => {
  console.error(e);
  try {
    await stopDistributionRuntime();
  } catch (_e) {}
  process.exit(1);
});
