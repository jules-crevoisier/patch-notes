/**
 * Pin-related pure logic for the blog.
 *
 * hashIp: never store a raw IP anywhere - always hash it first through this
 * function (HMAC-SHA256, keyed with a server-only secret) before it touches
 * the database.
 *
 * pinToggle: a pure decision function. It does not touch Prisma or Postgres
 * itself - blog/db.js wraps the real read (findUnique on the (postId, ipHash)
 * unique key) and write (create/delete + increment/decrement) around it, and
 * handles the P2002 unique-constraint race that can happen when two toggles
 * for the same (postId, ipHash) land concurrently.
 */

"use strict";

const crypto = require("node:crypto");

// Node's dual-stack HTTP server reports an IPv4 connection's
// req.socket.remoteAddress as an IPv4-mapped IPv6 address (::ffff:203.0.113.42)
// on some platforms/connection paths, and as plain IPv4 (203.0.113.42) on
// others, for the exact same real client (observed locally: concurrent
// requests from the same curl process landed as both forms depending on
// which one the OS/Docker networking picked for that socket). Left
// unnormalized, the same visitor hashes to two different ipHash values,
// silently defeating both the pin-uniqueness guarantee and the suggestion
// rate cap. Strip the ::ffff: prefix so both forms hash identically.
function normalizeIp(rawIp) {
  const value = String(rawIp || "").trim();
  const mapped = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  return mapped ? mapped[1] : value;
}

function hashIp(secret, rawIp) {
  return crypto.createHmac("sha256", secret).update(normalizeIp(rawIp)).digest("hex");
}

/** Stable visitor key from a client-generated id (localStorage + cookie). */
function hashVisitorId(secret, visitorId) {
  return crypto.createHmac("sha256", secret).update(`visitor:${String(visitorId || "").trim()}`).digest("hex");
}

function isValidVisitorId(visitorId) {
  return /^[a-f0-9-]{16,64}$/i.test(String(visitorId || "").trim());
}

function pinToggle({ postId, ipHash, existingPin, currentPinCount } = {}) {
  if (existingPin) {
    return { action: "unpinned", pinCountDelta: -1 };
  }
  return { action: "pinned", pinCountDelta: 1 };
}

module.exports = { hashIp, hashVisitorId, isValidVisitorId, pinToggle, normalizeIp };
