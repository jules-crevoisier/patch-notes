"use strict";

/**
 * Tests for the pin-related additions to blog/db.js.
 *
 * Scope note: getTopicPostsPage and getPinnedTopicPosts both perform real
 * Prisma IO and are intentionally NOT invoked here (no live Postgres, per
 * the pins.js contract note). What IS tested purely/in-process:
 *
 *   1. buildTopicPostsOrderBy() is a pure query-options builder that must
 *      always return the fixed [{ createdAt: 'desc' }] shape, with no
 *      conditional branch on any pin-related input -- proving the normal
 *      paginated list's ordering can never be influenced by pin state.
 *   2. pinTopic and getVisitorPinnedTopicSlugs are exported for the homepage
 *      category pin feature (checked by reference only, never called).
 *
 * Requiring blog/db.js is safe without DATABASE_URL set: Prisma Client
 * only connects lazily on first query, and neither test below issues one.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const db = require("./db");

test("should return the fixed [{ createdAt: 'desc' }] order-by shape when buildTopicPostsOrderBy is called with no arguments", () => {
  const orderBy = db.buildTopicPostsOrderBy();

  assert.deepEqual(orderBy, [{ createdAt: "desc" }]);
});

test("should return the exact same fixed order-by shape when called with pin-related input, proving pin state cannot reorder the normal list", () => {
  const withoutPinInput = db.buildTopicPostsOrderBy();
  const withIpHash = db.buildTopicPostsOrderBy({ ipHash: "some-hash" });
  const withPinnedFlag = db.buildTopicPostsOrderBy({ pinned: true, sortByPins: true });

  assert.deepEqual(withIpHash, [{ createdAt: "desc" }]);
  assert.deepEqual(withPinnedFlag, [{ createdAt: "desc" }]);
  assert.deepEqual(withIpHash, withoutPinInput);
  assert.deepEqual(withPinnedFlag, withoutPinInput);
});

test("should export homepage topic-pin helpers separately from the paginated list query", () => {
  assert.equal(typeof db.getTopicPostsPage, "function");
  assert.equal(typeof db.pinTopic, "function");
  assert.equal(typeof db.getVisitorPinnedTopicSlugs, "function");
  assert.equal(typeof db.listPublicSuggestions, "function");
  assert.equal(typeof db.likeSuggestion, "function");
  assert.notEqual(db.pinTopic, db.getTopicPostsPage);
});
