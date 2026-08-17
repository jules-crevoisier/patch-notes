"use strict";

/**
 * Real integration coverage for the two pin-toggle race conditions QA
 * reproduced live against the running server:
 *
 *   1. Concurrent same-(post, ipHash) PIN requests used to surface a raw
 *      HTTP 500 (P2002 unique-constraint error recovered by re-querying
 *      inside the same already-poisoned transaction).
 *   2. Concurrent same-(post, ipHash) UNPIN requests used to surface a raw
 *      HTTP 500 (P2025 "record to delete does not exist", unguarded).
 *
 * See blog/db.js#pinPost for the fix (atomic INSERT ... ON CONFLICT DO
 * NOTHING / DELETE ... RETURNING, so there is nothing to catch mid-race).
 *
 * Deliberately NOT matched by `npm test`'s glob
 * (`automation/**\/*.test.js *.test.js`) - every other *.test.js file in
 * this repo is intentionally DB-free (see db.test.js's own header comment)
 * so the default suite stays portable without a live stack. This file needs
 * a real running server + real Postgres, so it lives outside that glob and
 * is run explicitly:
 *
 *   docker compose up -d --build
 *   node --test integration/pin-race.test.js
 *   (or, from blog/: npm run test:pin-race)
 *
 * It uses whatever real post it can find under TOPIC (default "esport") and
 * skips (not fails) if none exists yet - seed one first with e.g.
 * `docker compose exec blog node automation/run-now.js esport`.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = (process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const TOPIC = process.env.TOPIC || "esport";
const CONCURRENCY = 8;

async function findRealPostId() {
  const response = await fetch(`${BASE_URL}/api/topics/${encodeURIComponent(TOPIC)}/posts?offset=0&limit=1`);
  if (!response.ok) return null;
  const page = await response.json();
  return page.posts?.[0]?.id || null;
}

async function pinToggleOnce(postId) {
  const response = await fetch(`${BASE_URL}/api/posts/${encodeURIComponent(postId)}/pin`, { method: "POST" });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// All requests in this file run from a single test process with no
// x-real-ip header, so the server hashes them all to the SAME ipHash (cf.
// getClientIp's socket.remoteAddress fallback) - exactly the "double-click
// from one visitor" scenario these races are about.
async function ensureState(postId, desiredPinned) {
  let result = await pinToggleOnce(postId);
  assert.notEqual(result.status, 500, `setup toggle unexpectedly 500'd: ${JSON.stringify(result)}`);
  if (result.body?.pinned !== desiredPinned) {
    result = await pinToggleOnce(postId);
    assert.notEqual(result.status, 500, `setup toggle unexpectedly 500'd: ${JSON.stringify(result)}`);
  }
  assert.equal(result.body?.pinned, desiredPinned, "failed to reach the desired starting state for this test");
  return result;
}

function assertNoCrash(results) {
  for (const result of results) {
    assert.notEqual(result.status, 500, `expected no 500, got ${JSON.stringify(result)}`);
    assert.ok([200, 404].includes(result.status), `unexpected status ${result.status}: ${JSON.stringify(result)}`);
    assert.equal(typeof result.body?.pinned, "boolean", `missing/invalid "pinned" in ${JSON.stringify(result)}`);
    assert.equal(typeof result.body?.pinCount, "number", `missing/invalid "pinCount" in ${JSON.stringify(result)}`);
    assert.ok(result.body.pinCount >= 0, `pinCount must never go negative, got ${JSON.stringify(result)}`);
  }
}

test("a burst of concurrent PIN requests from an unpinned state never 500s (insert race)", async (t) => {
  const postId = await findRealPostId().catch(() => null);
  if (!postId) {
    t.skip(`no real post found under topic "${TOPIC}" at ${BASE_URL} - seed one and re-run against a live stack`);
    return;
  }

  await ensureState(postId, false);

  const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => pinToggleOnce(postId)));
  assertNoCrash(results);
});

test("a burst of concurrent UNPIN requests from a pinned state never 500s (delete race)", async (t) => {
  const postId = await findRealPostId().catch(() => null);
  if (!postId) {
    t.skip(`no real post found under topic "${TOPIC}" at ${BASE_URL} - seed one and re-run against a live stack`);
    return;
  }

  await ensureState(postId, true);

  const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => pinToggleOnce(postId)));
  assertNoCrash(results);
});
