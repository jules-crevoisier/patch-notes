"use strict";

/**
 * Ported from the former n8n workflow's "Preparer les sources" code node and
 * its "Telecharger les flux" HTTP node.
 *
 * fetchSource(source) downloads one RSS/Google-News feed with the same
 * UA/accept headers and 20s timeout the n8n HTTP node used, and - like that
 * node's `neverError: true` - never throws on a bad HTTP status; it only
 * reports ok:false on a transport-level failure (timeout/abort/DNS/etc.),
 * letting assemble-recap.js's own empty/short-xml guard handle the rest.
 *
 * fetchAllSources(sources) fans a topic's sources out with Promise.allSettled
 * (never Promise.race) and returns results in the same order as `sources`,
 * so callers can pair fetched results back to their source by index.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const USER_AGENT = "Mozilla/5.0 patch-notes.fr radar";
const ACCEPT_HEADER = "application/rss+xml, application/xml, text/xml, */*";

async function fetchSource(source, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(source.url, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: ACCEPT_HEADER,
      },
      signal: controller.signal,
    });
    const xml = await response.text();
    return { source, xml, ok: true };
  } catch (error) {
    return { source, xml: "", ok: false, error: error?.message || "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllSources(sources, options = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const settled = await Promise.allSettled(list.map((source) => fetchSource(source, options)));
  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return { source: list[index], xml: "", ok: false, error: result.reason?.message || "fetch failed" };
  });
}

module.exports = { fetchSource, fetchAllSources };
