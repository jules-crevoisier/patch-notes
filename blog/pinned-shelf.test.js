"use strict";

/**
 * Tests for blog/pinned-shelf.js.
 *
 * Public contract under test:
 *   selectPinnedShelf(posts: Array<{id, pinCount, createdAt}>, { limit = 6 } = {}) -> same-shaped array
 *
 * This is documented as a pure in-memory sort+slice: the candidate-list DB
 * query is separate and untested here. No IO, no timers needed.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { selectPinnedShelf } = require("./pinned-shelf");

function post(id, pinCount, createdAt) {
  return { id, pinCount, createdAt: new Date(createdAt) };
}

test("should return at most 6 items sorted by pinCount desc then createdAt desc when given more than 6 candidates", () => {
  const posts = [
    post("g-cut-by-limit", 1, "2026-04-01"), // 7th pinned candidate, must be cut off by limit:6
    post("a-high-new", 10, "2026-08-05"),
    post("b-high-old", 10, "2026-08-01"), // same pinCount as a, older -> after it
    post("c-mid", 7, "2026-07-01"),
    post("d-tie-new", 5, "2026-06-05"),
    post("e-tie-old", 5, "2026-06-01"), // same pinCount as d, older -> after it
    post("f-low", 3, "2026-05-01"),
    post("zero-excluded", 0, "2026-08-10"), // most recent of all, but pinCount 0 -> never shown
  ];

  const shelf = selectPinnedShelf(posts, { limit: 6 });

  assert.equal(shelf.length, 6);
  assert.deepEqual(
    shelf.map((p) => p.id),
    ["a-high-new", "b-high-old", "c-mid", "d-tie-new", "e-tie-old", "f-low"]
  );
});

test("should exclude every post with pinCount 0 even when none exceed the limit", () => {
  const posts = [post("pinned", 2, "2026-01-01"), post("never-pinned", 0, "2026-01-02")];

  const shelf = selectPinnedShelf(posts, { limit: 6 });

  assert.deepEqual(
    shelf.map((p) => p.id),
    ["pinned"]
  );
});

test("should return an empty array when given no candidate posts", () => {
  const shelf = selectPinnedShelf([]);

  assert.deepEqual(shelf, []);
});

test("should respect a smaller custom limit when { limit } is provided", () => {
  const posts = [post("a", 3, "2026-01-01"), post("b", 2, "2026-01-02"), post("c", 1, "2026-01-03")];

  const shelf = selectPinnedShelf(posts, { limit: 2 });

  assert.equal(shelf.length, 2);
  assert.deepEqual(
    shelf.map((p) => p.id),
    ["a", "b"]
  );
});
