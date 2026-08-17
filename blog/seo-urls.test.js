"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const seoUrls = require("./seo-urls");

test("should build a readable slug with article id suffix", () => {
  const slug = seoUrls.articlePublicSlug({ id: 42, title: "Vitality remporte le Major" });
  assert.equal(slug, "vitality-remporte-le-major-42");
});

test("should parse article id from public slug", () => {
  assert.equal(seoUrls.parseArticlePublicSlug("vitality-remporte-le-major-42"), "42");
  assert.equal(seoUrls.parseArticlePublicSlug("actu-1"), "1");
  assert.equal(seoUrls.parseArticlePublicSlug("invalid-slug"), null);
});

test("should build topic actu path", () => {
  const path = seoUrls.articlePublicPath("esport", { id: 7, title: "Test titre" });
  assert.equal(path, "/esport/actu/test-titre-7");
});
