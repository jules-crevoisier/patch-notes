"use strict";

/**
 * Tests for blog/automation/run-topic.js.
 *
 * DI note: the prompt's public signature is runTopicRecap(topicSlug) -> Promise<{status, postId?}>.
 * That alone can't be unit tested without hitting real RSS/network, Gemini, and DB IO. These tests
 * call runTopicRecap(topicSlug, deps) with an optional second `deps` argument, defaulting to the
 * real collaborators in production. deps may override:
 *   - resolveTopic(slug) -> Promise<{ topic, sources }>   (topic/source lookup, e.g. via topics.js + load-topic.js)
 *   - fetchAllSources(sources) -> Promise<FetchResult[]>  (fetch-sources.js)
 *   - assembleRecap(args) -> {...}                        (pipeline/assemble-recap.js)
 *   - callGemini(args) -> Promise<GeminiResult>            (gemini-client.js, presumably wrapped
 *                                                            internally via gemini-queue.js's enqueue)
 *   - db: { getSameDayUrlKeys(slug, date), savePost(post) }
 * finalizePost is intentionally NOT injected here: it is pure (no IO) and its own behavior is
 * covered by pipeline/finalize-post.test.js, so the real implementation is exercised as-is.
 *
 * These tests only cover the acceptance bullet about the "zero articles" silent path — the
 * article-count decision of whether to ever invoke the provided callGemini function.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { runTopicRecap } = require("./run-topic");

function makeDeps({ postBase, geminiRequest }) {
  return {
    resolveTopic: async () => ({ topic: { slug: "topic-a", name: "Topic A" }, sources: [] }),
    fetchAllSources: async () => [],
    assembleRecap: () => ({
      postBase,
      fallbackTitle: "Fallback title",
      fallbackSummary: "Fallback summary",
      recapDate: "2026-08-17",
      geminiRequest,
    }),
    db: {
      getSameDayUrlKeys: async () => [],
      savePost: async (post) => ({ id: "post-1", ...post }),
    },
  };
}

test("should invoke the provided callGemini when the assembled postBase has articles", async () => {
  const callGemini = async () => ({ ok: true, text: JSON.stringify({ title: "T", summary: "S" }) });
  let callCount = 0;
  const spiedCallGemini = async (...args) => {
    callCount += 1;
    return callGemini(...args);
  };

  const deps = makeDeps({
    postBase: { articles: [{ title: "Article", url: "https://example.com/a" }] },
    geminiRequest: { prompt: "summarize" },
  });
  deps.callGemini = spiedCallGemini;

  const result = await runTopicRecap("topic-a", deps);

  assert.equal(callCount, 1, "callGemini should be invoked exactly once when there are articles to summarize");
  assert.notEqual(result.status, "error");
});

test("should never invoke the provided callGemini when the assembled postBase has zero articles", async () => {
  let callCount = 0;
  const spiedCallGemini = async () => {
    callCount += 1;
    return { ok: true, text: JSON.stringify({ title: "T", summary: "S" }) };
  };

  const deps = makeDeps({
    postBase: { articles: [] },
    geminiRequest: null,
  });
  deps.callGemini = spiedCallGemini;

  const result = await runTopicRecap("topic-a", deps);

  assert.equal(callCount, 0, "callGemini must never be called on the silent, zero-article path");
  assert.notEqual(result.status, "error");
});
