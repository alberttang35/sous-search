// @ts-check
/**
 * @typedef {import("../types.js").Node} Node
 * @typedef {import("../types.js").ID} ID
 * @typedef {import("../types.js").NID} NID
 * @typedef {import("../types.js").SID} SID
 * @typedef {import("../types.js").Hasher} Hasher
 */

const assert = require('assert');
const crypto = require('crypto');

/**
 * @param {any} obj
 * @returns {ID}
 */
function getID(obj) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(obj));
  return hash.digest('hex');
}

/**
 * The NID is the SHA256 hash of the JSON representation of the node
 * @param {Node} node
 * @returns {NID}
 */
function getNID(node) {
  node = {ip: node.ip, port: node.port};
  return getID(node);
}

/**
 * The SID is the first 5 characters of the NID
 * @param {Node} node
 * @returns {SID}
 */
function getSID(node) {
  return getNID(node).substring(0, 5);
}

/**
 * @param {any} message
 * @returns {string}
 */
function getMID(message) {
  const msg = {};
  msg.date = new Date().getTime();
  msg.mss = message;
  return getID(msg);
}

/**
 * @param {string} id
 * @returns {bigint}
 */
function idToNum(id) {
  assert(typeof id === 'string', 'idToNum: id is not in KID form!');
  const trimmed = id.startsWith('0x') ? id.slice(2) : id;
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return BigInt(`0x${trimmed}`);
  }
  return BigInt(id);
}

/** @type { Hasher } */
const naiveHash = (kid, nids) => {
  const sortedNids = [...nids].sort();
  const index = Number(idToNum(kid) % BigInt(sortedNids.length));
  return sortedNids[index];
};

/** @type { Hasher } */
const consistentHash = (kid, nids) => {
  const kidNum = idToNum(kid);
  const nidNums = nids.map(idToNum);
  
  // combine and sort numerically
  const combined = [{num: kidNum, id: kid}, ...nids.map((nid, i) => ({num: nidNums[i], id: nid}))];
  combined.sort((a, b) => (a.num < b.num ? -1 : a.num > b.num ? 1 : 0));
  
  // find KID's position and pick the next element
  const index = combined.findIndex((e) => e.id === kid);
  const chosen = combined[(index + 1) % combined.length];
  
  // return the NID
  return chosen.id;
};

/** @type { Hasher } */
const rendezvousHash = (kid, nids) => {
  // create new list by concatenating each NID with KID, kid + nid
  const combined = nids.map((nid) => kid + nid);
  // hash each element in the new list and convert to numerical representation
  const hashed = combined.map((c) => idToNum(getID(c)));
  // sort resulting values and pick maximum
  const maxHash = hashed.reduce((max, current) => (current > max ? current : max), BigInt(0));
  const index = hashed.indexOf(maxHash);
  // convert the chosen element back into ID and return
  return nids[index];
};

module.exports = {
  getID,
  getNID,
  getSID,
  getMID,
  naiveHash,
  consistentHash,
  rendezvousHash,
};
