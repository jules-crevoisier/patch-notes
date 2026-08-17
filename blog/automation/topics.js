"use strict";

/**
 * Reads blog/automation/topics/configs/*.js and exposes them as runtime
 * topics for the scheduler and the recap pipeline.
 *
 * Cached for the process lifetime: there is no live reload. Adding, editing
 * or removing a topic config requires `docker compose restart blog`.
 */

const fs = require("node:fs");
const path = require("node:path");

const { buildTopicRuntimeConfig } = require("./pipeline/load-topic");

const CONFIGS_DIR = path.join(__dirname, "topics", "configs");

let cachedConfigs = null;
let cachedRuntimeTopics = null;

/**
 * Reads every configs/<slug>.js file. The slug declared inside the config
 * must match its filename - this catches copy/paste mistakes early (e.g.
 * duplicating esport.js into f1.js without updating `slug`).
 */
function loadTopicConfigs() {
  if (cachedConfigs) return cachedConfigs;

  const files = fs
    .readdirSync(CONFIGS_DIR)
    .filter((file) => file.endsWith(".js"))
    .sort();

  cachedConfigs = files.map((file) => {
    const slugFromFilename = path.basename(file, ".js");
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const config = require(path.join(CONFIGS_DIR, file));
    if (String(config.slug || "").trim().toLowerCase() !== slugFromFilename) {
      throw new Error(`topic config slug mismatch: "configs/${file}" declares slug "${config.slug}"`);
    }
    return config;
  });

  return cachedConfigs;
}

/**
 * Maps every topic config through load-topic.js.
 * Returns Map<slug, { topic, sources }>.
 */
function buildRuntimeTopics() {
  if (cachedRuntimeTopics) return cachedRuntimeTopics;

  const runtimeTopics = new Map();
  for (const config of loadTopicConfigs()) {
    const { topic, sources } = buildTopicRuntimeConfig(config);
    runtimeTopics.set(topic.slug, { topic, sources });
  }

  cachedRuntimeTopics = runtimeTopics;
  return cachedRuntimeTopics;
}

module.exports = { loadTopicConfigs, buildRuntimeTopics };
