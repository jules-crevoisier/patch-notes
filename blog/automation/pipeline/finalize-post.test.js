"use strict";

/**
 * Tests for blog/automation/pipeline/finalize-post.js.
 *
 * Contract: finalizePost({ postBase, fallbackTitle, fallbackSummary, recapDate, geminiResult }) -> Post
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { finalizePost } = require("./finalize-post");

function baseArgs(overrides) {
  return Object.assign(
    {
      postBase: { articles: [{ title: "Some article", url: "https://example.com/a" }] },
      fallbackTitle: "Fallback title",
      fallbackSummary: "Fallback summary",
      recapDate: "2026-08-17",
    },
    overrides
  );
}

test("should use Gemini's parsed title and summary when geminiResult.ok is true and text is valid JSON", () => {
  const geminiResult = {
    ok: true,
    text: JSON.stringify({ title: "Gemini Title", summary: "Gemini Summary" }),
  };

  const post = finalizePost(baseArgs({ geminiResult }));

  assert.equal(post.title, "Gemini Title");
  assert.equal(post.summary, "Gemini Summary");
  assert.ok(!post.errors || post.errors.length === 0);
});

test("should fall back to fallbackTitle/fallbackSummary and record a Gemini error when geminiResult.ok is false", () => {
  const geminiResult = { ok: false, error: "upstream timeout" };

  const post = finalizePost(baseArgs({ geminiResult }));

  assert.equal(post.title, "Fallback title");
  assert.equal(post.summary, "Fallback summary");
  assert.ok(Array.isArray(post.errors) && post.errors.length >= 1);
  assert.ok(
    post.errors.some((e) => String(e).startsWith("Gemini:")),
    'expected an errors entry starting with "Gemini: "'
  );
});

test("should fall back to fallbackTitle/fallbackSummary and record a Gemini error when the Gemini text is not valid JSON", () => {
  const geminiResult = { ok: true, text: "not valid json {{{" };

  const post = finalizePost(baseArgs({ geminiResult }));

  assert.equal(post.title, "Fallback title");
  assert.equal(post.summary, "Fallback summary");
  assert.ok(Array.isArray(post.errors) && post.errors.length >= 1);
  assert.ok(
    post.errors.some((e) => String(e).startsWith("Gemini:")),
    'expected an errors entry starting with "Gemini: "'
  );
});
