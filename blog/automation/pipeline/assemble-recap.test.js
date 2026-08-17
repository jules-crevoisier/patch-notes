"use strict";

/**
 * Tests for blog/automation/pipeline/assemble-recap.js.
 *
 * Contract: assembleRecap({ topic, fetchedSources, sameDayUrlKeys })
 *   -> { postBase, fallbackTitle, fallbackSummary, recapDate, geminiRequest }
 * where fetchedSources mirrors fetch-sources.js's FetchResult shape:
 *   { source, xml, ok, error? }
 *
 * fetchedSources carry raw RSS 2.0 XML, which is the standard feed format
 * for the RSS/Google News sources this pipeline reads from.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { assembleRecap } = require("./assemble-recap");

function rssXml(items) {
  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title>${item.title}</title>
      <link>${item.url}</link>
      <pubDate>${item.pubDate || "Mon, 17 Aug 2026 08:00:00 GMT"}</pubDate>
      <guid>${item.url}</guid>
    </item>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Source</title>
    ${itemsXml}
  </channel>
</rss>`;
}

test("should exclude an article whose URL is already present in sameDayUrlKeys when assembling the recap", () => {
  const topic = { slug: "topic-a", name: "Topic A" };
  const alreadySeenUrl = "https://example.com/already-seen-article";
  const newUrl = "https://example.com/brand-new-article";

  const fetchedSources = [
    {
      source: { name: "Source One", url: "https://example.com/rss" },
      xml: rssXml([
        { title: "Already covered", url: alreadySeenUrl },
        { title: "Fresh news", url: newUrl },
      ]),
      ok: true,
    },
    // A failed source should simply be skipped, not crash assembly.
    {
      source: { name: "Source Two", url: "https://broken.example.com/rss" },
      xml: "",
      ok: false,
      error: "timeout",
    },
  ];

  const result = assembleRecap({
    topic,
    fetchedSources,
    sameDayUrlKeys: [alreadySeenUrl],
  });

  const urls = result.postBase.articles.map((a) => a.url);
  assert.ok(!urls.includes(alreadySeenUrl), "the already-seen article must be excluded from the recap");
  assert.ok(
    urls.some((u) => u.includes("brand-new-article")),
    "the genuinely new article must still be included"
  );
});

test("should produce zero articles and no gemini request when every fetched source is empty or failed", () => {
  const topic = { slug: "topic-a", name: "Topic A" };

  const fetchedSources = [
    { source: { name: "Source One", url: "https://example.com/rss" }, xml: rssXml([]), ok: true },
    { source: { name: "Source Two", url: "https://broken.example.com/rss" }, xml: "", ok: false, error: "timeout" },
  ];

  const result = assembleRecap({ topic, fetchedSources, sameDayUrlKeys: [] });

  assert.equal(result.postBase.articles.length, 0);
  assert.ok(!result.geminiRequest, "no gemini request should be built when there is nothing to summarize");
  assert.equal(typeof result.fallbackTitle, "string");
  assert.equal(typeof result.fallbackSummary, "string");
});
