"use strict";

/**
 * Registers 4 node-cron jobs per topic (06:00, 11:00, 18:00, 23:00
 * Europe/Paris) and returns the CronTask[] handles so the caller can stop
 * them cleanly on shutdown.
 *
 * Each topic's metadata is upserted into the db BEFORE its cron jobs are
 * registered. That upsert is wrapped in its own try/catch: a transient
 * upsertTopic failure for one topic is logged and that topic's cron
 * registration is skipped, but the loop continues with the remaining
 * topics - it must never reject startScheduler() and take the whole
 * process down at boot (the old hardcoded-seed loop in server.js had this
 * same per-topic try/catch for the same reason).
 *
 * Each cron callback is also wrapped in its own .catch() - a second safety
 * net beyond run-topic.js's own try/catch - so one topic's rejection can
 * never stop another topic's cron from firing or crash the process.
 */

const EXPECTED_HOURS = [6, 11, 18, 23];
const CRON_EXPRESSIONS = EXPECTED_HOURS.map((hour) => `0 ${hour} * * *`);
const TIMEZONE = "Europe/Paris";

function defaultDb() {
  // eslint-disable-next-line global-require
  const realDb = require("../db");
  return {
    // db.upsertTopic's own signature (an object: {slug, label, description,
    // mode, isListed}) must not change - it is shared with the rest of the
    // app. This adapter is the scheduler's own calling convention
    // (slug, topic) mapped onto that real signature.
    upsertTopic: (slug, topic) =>
      realDb.upsertTopic({
        slug: topic?.slug || slug,
        label: topic?.label,
        description: topic?.description,
        mode: topic?.mode,
      }),
  };
}

function defaultCronLib() {
  // eslint-disable-next-line global-require
  return require("node-cron");
}

function defaultRunTopicRecap() {
  // eslint-disable-next-line global-require
  return require("./run-topic").runTopicRecap;
}

function defaultTopics() {
  // eslint-disable-next-line global-require
  const { buildRuntimeTopics } = require("./topics");
  const topics = new Map();
  for (const [slug, entry] of buildRuntimeTopics()) {
    topics.set(slug, entry.topic);
  }
  return topics;
}

async function startScheduler(deps = {}) {
  const db = deps.db || defaultDb();
  const topics = deps.topics || defaultTopics();
  const cronLib = deps.cronLib || defaultCronLib();
  const runTopicRecap = deps.runTopicRecap || defaultRunTopicRecap();

  const tasks = [];

  for (const [slug, topic] of topics) {
    try {
      await db.upsertTopic(slug, topic);
    } catch (error) {
      console.error(`[scheduler] upsertTopic failed for "${slug}", skipping its cron registration`, error);
      continue;
    }

    for (const expression of CRON_EXPRESSIONS) {
      const task = cronLib.schedule(
        expression,
        () => {
          Promise.resolve()
            .then(() => runTopicRecap(slug))
            .catch((error) => {
              console.error(`[scheduler] runTopicRecap failed for "${slug}"`, error);
            });
        },
        { timezone: TIMEZONE },
      );
      tasks.push(task);
    }
  }

  return tasks;
}

function stopScheduler(tasks = []) {
  for (const task of tasks) {
    task.stop();
  }
}

module.exports = { startScheduler, stopScheduler };
