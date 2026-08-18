"use strict";

/**
 * Tests for blog/pins.js.
 *
 * Public contract under test:
 *   hashIp(secret, rawIp) -> string
 *   pinToggle({ postId, ipHash, existingPin, currentPinCount }) -> { action, pinCountDelta }
 *
 * DI note: pinToggle is documented as a pure decision function. The actual
 * Prisma read/write (and the DB-level uniqueness constraint that prevents a
 * real double-insert race) lives in blog/db.js and is NOT exercised here.
 * The "idempotency under concurrency" test below models that race with a
 * small synchronous in-memory store (not Prisma, not node-cron, no network)
 * so we can prove pinToggle's decisions compose correctly with a
 * uniqueness-guard-shaped caller without ever touching Postgres.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { hashIp, hashVisitorId, isValidVisitorId, pinToggle, normalizeIp } = require("./pins");

test("should deterministically return the same HMAC-SHA256 hex digest for the same secret and IP when hashIp is called twice", () => {
  const secret = "shelf-secret";
  const rawIp = "203.0.113.42";

  const first = hashIp(secret, rawIp);
  const second = hashIp(secret, rawIp);

  assert.equal(first, second);

  const expected = crypto.createHmac("sha256", secret).update(rawIp).digest("hex");
  assert.equal(first, expected, "hashIp must be an HMAC-SHA256 hex digest, not some other hash");
});

test("should produce a different digest when the same IP is hashed with a different secret", () => {
  const rawIp = "203.0.113.42";

  const withSecretA = hashIp("secret-a", rawIp);
  const withSecretB = hashIp("secret-b", rawIp);

  assert.notEqual(withSecretA, withSecretB);
});

test("should never return the raw IP unchanged when hashing it", () => {
  const rawIp = "198.51.100.7";
  const hashed = hashIp("some-secret", rawIp);

  assert.notEqual(hashed, rawIp);
  assert.match(hashed, /^[0-9a-f]{64}$/, "expected a 64-char lowercase hex SHA-256-length digest");
});

test("should hash an IPv4-mapped IPv6 address identically to its plain IPv4 form when hashIp is called with either", () => {
  const secret = "shelf-secret";

  const fromMapped = hashIp(secret, "::ffff:203.0.113.42");
  const fromPlain = hashIp(secret, "203.0.113.42");

  assert.equal(
    fromMapped,
    fromPlain,
    "the same real client must not hash to two different ipHash values depending on connection form"
  );
});

test("should strip the ::ffff: prefix from an IPv4-mapped IPv6 address when normalizeIp is called, and leave other addresses unchanged", () => {
  assert.equal(normalizeIp("::ffff:203.0.113.42"), "203.0.113.42");
  assert.equal(normalizeIp("203.0.113.42"), "203.0.113.42");
  assert.equal(normalizeIp("::1"), "::1");
});

test("should create exactly one pin and increment the count by 1 when toggling an unpinned post", () => {
  const result = pinToggle({
    postId: "post-1",
    ipHash: "abc123",
    existingPin: null,
    currentPinCount: 4,
  });

  assert.deepEqual(result, { action: "pinned", pinCountDelta: 1 });
});

test("should remove the pin and decrement the count by 1 when toggling an already-pinned (post, ipHash) pair", () => {
  const result = pinToggle({
    postId: "post-1",
    ipHash: "abc123",
    existingPin: { id: "pin-1" },
    currentPinCount: 5,
  });

  assert.deepEqual(result, { action: "unpinned", pinCountDelta: -1 });
});

test("should hash visitor ids to a stable opaque key", () => {
  const secret = "test-secret";
  const a = hashVisitorId(secret, "abc123def4567890");
  const b = hashVisitorId(secret, "abc123def4567890");
  const c = hashVisitorId(secret, "other-visitor-id-999");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test("should accept only plausible visitor id shapes", () => {
  assert.equal(isValidVisitorId("abc123def4567890"), true);
  assert.equal(isValidVisitorId("too-short"), false);
  assert.equal(isValidVisitorId(""), false);
});

test("should not double-increment the pin count when two concurrent toggle attempts race against the same uniqueness-guarded record", () => {
  // Models two "simultaneous" requests for the same (postId, ipHash) that
  // both read the pre-write state (existingPin: null) before either write
  // lands -- a real race condition. A uniqueness-constrained store (as a
  // real DB unique index on (postId, ipHash) would enforce) rejects the
  // second insert. The calling logic must treat that duplicate-key failure
  // as "already pinned" and must NOT apply a second pinCountDelta.
  const postId = "post-1";
  const ipHash = "same-hash";
  const key = `${postId}:${ipHash}`;

  const rows = new Map(); // key -> { id }
  let pinCount = 0;
  let nextId = 1;

  function tryInsert() {
    if (rows.has(key)) {
      const err = new Error("Unique constraint failed on (postId, ipHash)");
      err.code = "P2002";
      throw err;
    }
    const record = { id: `pin-${nextId++}` };
    rows.set(key, record);
    return record;
  }

  function attemptConcurrentToggle() {
    // Both callers snapshot the same pre-race state.
    const decision = pinToggle({ postId, ipHash, existingPin: null, currentPinCount: pinCount });
    assert.equal(decision.action, "pinned");
    try {
      tryInsert();
      pinCount += decision.pinCountDelta;
      return "inserted";
    } catch (err) {
      if (err.code === "P2002") {
        // Guard logic: duplicate-key path resolves without a double increment.
        return "duplicate-key-noop";
      }
      throw err;
    }
  }

  const outcomes = [attemptConcurrentToggle(), attemptConcurrentToggle()];

  assert.deepEqual(outcomes.sort(), ["duplicate-key-noop", "inserted"].sort());
  assert.equal(rows.size, 1, "exactly one pin record must exist after the race");
  assert.equal(pinCount, 1, "the pin count must have been incremented exactly once");
});
