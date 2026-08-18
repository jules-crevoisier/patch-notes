"use strict";

/**
 * Orchestrates one topic's recap: resolve topic+sources -> fetch feeds ->
 * assemble -> (maybe) Gemini -> finalize -> persist.
 *
 * Every error is caught here and absorbed into { status: "error" } - this
 * function is called directly from cron callbacks (scheduler.js) and from
 * the manual run-now.js CLI, and must never throw or reject: one topic's
 * failure must never take down the process or block another topic's run.
 *
 * finalizePost is intentionally NOT injectable: it is pure (no IO) and is
 * covered on its own by pipeline/finalize-post.test.js.
 */

const { assembleRecap: realAssembleRecap } = require("./pipeline/assemble-recap");
const { finalizePost } = require("./pipeline/finalize-post");
const { fetchAllSources: realFetchAllSources } = require("./pipeline/fetch-sources");
const { callGemini: realCallGemini } = require("./gemini-client");
const geminiQueue = require("./gemini-queue");

function defaultResolveTopic() {
  return async (slug) => {
    // eslint-disable-next-line global-require
    const { buildRuntimeTopics } = require("./topics");
    const entry = buildRuntimeTopics().get(slug);
    if (!entry) throw new Error(`unknown topic "${slug}"`);
    return entry;
  };
}

function defaultDb() {
  // eslint-disable-next-line global-require
  const realDb = require("../db");
  return {
    getSameDayUrlKeys: (slug, date) => realDb.getSameDayUrlKeys(slug, date),
    savePost: (post) => realDb.createPost(post),
  };
}

async function runTopicRecap(topicSlug, deps = {}) {
  const resolveTopic = deps.resolveTopic || defaultResolveTopic();
  const fetchAllSources = deps.fetchAllSources || realFetchAllSources;
  const assembleRecap = deps.assembleRecap || realAssembleRecap;
  const callGemini = deps.callGemini || realCallGemini;
  const db = deps.db || defaultDb();

  try {
    const { topic, sources } = await resolveTopic(topicSlug);
    const runDate = new Date().toISOString().slice(0, 10);

    const [sameDayUrlKeys, fetchedSources] = await Promise.all([
      db.getSameDayUrlKeys(topicSlug, runDate),
      fetchAllSources(sources),
    ]);

    const { postBase, fallbackTitle, fallbackSummary, recapDate, geminiRequest } = assembleRecap({
      topic,
      fetchedSources,
      sameDayUrlKeys,
    });

    let geminiResult = null;
    if (postBase.articles.length > 0) {
      geminiResult = await geminiQueue.enqueue(
        () =>
          callGemini({
            apiKey: process.env.GEMINI_API_KEY || "",
            model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
            request: geminiRequest,
          }),
        { topicSlug },
      );
    }

    const post = finalizePost({ postBase, fallbackTitle, fallbackSummary, recapDate, geminiResult });

    const saved = await db.savePost(post);
    if (saved?.skipped) {
      return { status: "skipped", reason: saved.reason };
    }
    return { status: "created", postId: saved?.post?.id ?? saved?.id ?? null };
  } catch (error) {
    console.error(`[run-topic] recap failed for "${topicSlug}"`, error);
    return { status: "error", error: error?.message || String(error) };
  }
}

module.exports = { runTopicRecap };
