/**
 * Pure in-memory selection for the pinned-posts shelf on a topic page.
 *
 * The DB-level candidate query (blog/db.js#getPinnedTopicPosts) already
 * filters to pinCount > 0 and orders the same way at the SQL level - this
 * function is the tested, framework-free source of truth for that sort+slice
 * so the shelf's ordering rule lives in exactly one place.
 */

"use strict";

function selectPinnedShelf(posts = [], { limit = 6 } = {}) {
  return posts
    .filter((post) => post.pinCount > 0)
    .slice()
    .sort((a, b) => {
      if (b.pinCount !== a.pinCount) return b.pinCount - a.pinCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit);
}

module.exports = { selectPinnedShelf };
