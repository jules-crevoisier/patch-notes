"use strict";

/**
 * Ported from the former n8n workflow's "Configurer le sujet" code node.
 *
 * Normalizes a raw topic config (blog/automation/topics/configs/<slug>.js)
 * into the runtime { topic, sources } shape consumed by the recap pipeline.
 * The blog/gemini/runDate sections of the original n8n node are dropped
 * here: they were never topic-scoped in spirit (secret/internal URL are
 * gone entirely under in-process automation, Gemini config is read from
 * process.env by gemini-client.js/gemini-queue.js, and runDate is computed
 * per-run by run-topic.js) - everything else is a verbatim port.
 */

const VALID_MODES = new Set(["fr", "intl", "fr-intl"]);

// Normalise les sources Google en URL Google News RSS (sans toucher au reste).
function buildGoogleNewsUrl(siteDomain, searchTerms) {
  const query = [
    `site:${siteDomain}`,
    searchTerms,
    "-guide",
    "-walkthrough",
    "-soluce",
    "-questline",
    "-challenges",
    "-unlock",
    "-loadout",
  ].join(" ");
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
}

function buildTopicRuntimeConfig(rawTopic) {
  const TOPIC = rawTopic || {};
  const mode = VALID_MODES.has(TOPIC.mode) ? TOPIC.mode : "fr-intl";

  const sources = (TOPIC.sources || [])
    .filter((source) => {
      if (mode === "fr") return source.region === "fr";
      if (mode === "intl") return source.region === "intl";
      return true;
    })
    .map((source) => ({
      name: source.name,
      region: source.region,
      method: source.method,
      max: Number(source.max || 5),
      url: source.method === "google" ? buildGoogleNewsUrl(source.siteDomain || source.url, TOPIC.searchTerms || "") : source.url,
    }));

  const topic = {
    slug: String(TOPIC.slug || "unknown").trim().toLowerCase(),
    label: String(TOPIC.label || TOPIC.slug || "Sujet").trim(),
    description: String(TOPIC.description || "").trim(),
    mode,
    searchTerms: String(TOPIC.searchTerms || "").trim(),
    positiveKeywords: TOPIC.positiveKeywords || [],
    negativeKeywords: TOPIC.negativeKeywords || [],
    maxAgeDays: {
      google: Number(TOPIC.maxAgeDays?.google ?? 3),
      rss: Number(TOPIC.maxAgeDays?.rss ?? 7),
    },
    caps: {
      fr: Number(TOPIC.caps?.fr ?? 14),
      intl: Number(TOPIC.caps?.intl ?? 18),
      total: Number(TOPIC.caps?.total ?? 36),
    },
    editorialHints: String(TOPIC.editorialHints || "").trim(),
  };

  return { topic, sources };
}

module.exports = { buildTopicRuntimeConfig, buildGoogleNewsUrl };
