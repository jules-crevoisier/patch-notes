#!/usr/bin/env node
"use strict";

/**
 * Manual verification / ad-hoc trigger for a single topic's recap.
 *
 * Usage:
 *   node blog/automation/run-now.js <slug>
 *
 * Requires run-topic.js + db.js directly (no HTTP boot, no server.js), runs
 * runTopicRecap(slug) once against real DB/network/Gemini, then closes the
 * DB connection and exits.
 */

const { runTopicRecap } = require("./run-topic");
const db = require("../db");

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: node blog/automation/run-now.js <slug>");
    process.exitCode = 1;
    return;
  }

  console.log(`[run-now] running recap for "${slug}"...`);
  const result = await runTopicRecap(slug);
  console.log("[run-now] result:", result);

  if (result.status === "error") {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[run-now] unexpected failure", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close().catch(() => {});
    process.exit(process.exitCode || 0);
  });
