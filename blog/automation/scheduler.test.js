"use strict";

/**
 * Tests for blog/automation/scheduler.js.
 *
 * DI note: the prompt's public signature is
 *   startScheduler({ db, topics, cronLib }) -> CronTask[]
 * These tests additionally pass an optional `runTopicRecap` key on that
 * same options object. Without it there is no way to stub the per-topic
 * work that a cron callback performs, so the scheduler can't be unit
 * tested without hitting real DB/network IO. Implementation should default
 * to the real run-topic.js `runTopicRecap` when this key is not provided.
 *
 * cronLib is stubbed as a node-cron-like object: { schedule(expression, callback, options) -> task }
 * where `task` exposes at least a `.stop()` method, matching node-cron's API shape implied by the
 * `cronLib` parameter name.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { startScheduler } = require("./scheduler");

const EXPECTED_HOURS = [6, 11, 18, 23];

function makeCronLibStub() {
  const scheduled = []; // { expression, callback, options, task }
  const cronLib = {
    schedule: (expression, callback, options) => {
      const task = { stop: () => {} };
      scheduled.push({ expression, callback, options, task });
      return task;
    },
  };
  return { cronLib, scheduled };
}

function parseCronFields(expression) {
  // Tolerate 5- or 6-field cron expressions (optional leading seconds field)
  // by reading the last 5 fields, which is the standard unix cron layout.
  const fields = expression.trim().split(/\s+/);
  const fiveFields = fields.slice(-5);
  return { minute: fiveFields[0], hour: fiveFields[1] };
}

test("should register exactly 4 cron triggers per topic at 06:00, 11:00, 18:00 and 23:00 Europe/Paris when starting the scheduler", async (t) => {
  const topics = new Map([
    ["topic-a", { slug: "topic-a", name: "Topic A" }],
    ["topic-b", { slug: "topic-b", name: "Topic B" }],
  ]);
  const db = { upsertTopic: t.mock.fn(async () => {}) };
  const { cronLib, scheduled } = makeCronLibStub();
  const runTopicRecap = t.mock.fn(async () => ({ status: "created" }));

  const tasks = await startScheduler({ db, topics, cronLib, runTopicRecap });

  assert.equal(scheduled.length, 8, "expected exactly 4 triggers per topic (2 topics x 4)");
  assert.equal(tasks.length, 8, "startScheduler should return one CronTask per registered trigger");

  // Correlate each scheduled entry to its topic slug by firing its callback
  // and inspecting which slug runTopicRecap was called with.
  const hoursBySlug = { "topic-a": new Set(), "topic-b": new Set() };
  for (const entry of scheduled) {
    const { minute, hour } = parseCronFields(entry.expression);
    assert.equal(minute, "0", `expected trigger at minute 0, got expression "${entry.expression}"`);
    assert.ok(
      EXPECTED_HOURS.includes(Number(hour)),
      `expected hour to be one of ${EXPECTED_HOURS.join(",")}, got "${hour}" (expression "${entry.expression}")`
    );
    assert.equal(entry.options && entry.options.timezone, "Europe/Paris");

    await entry.callback();
    const lastCall = runTopicRecap.mock.calls[runTopicRecap.mock.calls.length - 1];
    const slug = lastCall.arguments[0];
    hoursBySlug[slug].add(Number(hour));
  }

  assert.deepEqual([...hoursBySlug["topic-a"]].sort((a, b) => a - b), EXPECTED_HOURS);
  assert.deepEqual([...hoursBySlug["topic-b"]].sort((a, b) => a - b), EXPECTED_HOURS);
});

test("should call runTopicRecap with the topic slug exactly once when a single cron callback fires", async (t) => {
  const topics = new Map([["topic-a", { slug: "topic-a", name: "Topic A" }]]);
  const db = { upsertTopic: t.mock.fn(async () => {}) };
  const { cronLib, scheduled } = makeCronLibStub();
  const runTopicRecap = t.mock.fn(async () => ({ status: "created" }));

  await startScheduler({ db, topics, cronLib, runTopicRecap });

  assert.equal(scheduled.length, 4);

  await scheduled[0].callback();
  assert.equal(runTopicRecap.mock.calls.length, 1);
  assert.equal(runTopicRecap.mock.calls[0].arguments[0], "topic-a");

  await scheduled[1].callback();
  assert.equal(runTopicRecap.mock.calls.length, 2, "firing a second callback should add exactly one more call");
  assert.equal(runTopicRecap.mock.calls[1].arguments[0], "topic-a");
});

test("should upsert each topic's metadata in the db before registering that topic's cron triggers when starting the scheduler", async (t) => {
  const topics = new Map([
    ["topic-a", { slug: "topic-a", name: "Topic A" }],
    ["topic-b", { slug: "topic-b", name: "Topic B" }],
  ]);

  let seq = 0;
  const order = []; // { type: 'upsert'|'schedule', slug?, index }
  const db = {
    upsertTopic: t.mock.fn(async (slug) => {
      order.push({ type: "upsert", slug, index: seq++ });
    }),
  };
  const scheduled = [];
  const cronLib = {
    schedule: (expression, callback) => {
      const index = seq++;
      order.push({ type: "schedule", index });
      const task = { stop: () => {} };
      scheduled.push({ callback, index });
      return task;
    },
  };
  const runTopicRecap = t.mock.fn(async () => ({ status: "created" }));

  await startScheduler({ db, topics, cronLib, runTopicRecap });

  assert.equal(db.upsertTopic.mock.calls.length, 2, "expected one upsert per topic");

  // Correlate each schedule() registration to its topic by firing the
  // callback and reading which slug runTopicRecap received.
  for (const entry of scheduled) {
    await entry.callback();
    const lastCall = runTopicRecap.mock.calls[runTopicRecap.mock.calls.length - 1];
    const slug = lastCall.arguments[0];
    const upsertEntry = order.find((o) => o.type === "upsert" && o.slug === slug);
    assert.ok(upsertEntry, `expected an upsert recorded for slug ${slug}`);
    assert.ok(
      upsertEntry.index < entry.index,
      `expected upsertTopic(${slug}) (index ${upsertEntry.index}) to happen before its cron registration (index ${entry.index})`
    );
  }
});

test("should still call runTopicRecap for the next topic when a previous topic's runTopicRecap call rejects", async (t) => {
  const topics = new Map([
    ["topic-a", { slug: "topic-a", name: "Topic A" }],
    ["topic-b", { slug: "topic-b", name: "Topic B" }],
  ]);
  const db = { upsertTopic: t.mock.fn(async () => {}) };
  const { cronLib, scheduled } = makeCronLibStub();
  const runTopicRecap = t.mock.fn(async (slug) => {
    if (slug === "topic-a") {
      throw new Error("boom");
    }
    return { status: "created" };
  });

  await startScheduler({ db, topics, cronLib, runTopicRecap });

  // Firing every registered trigger must never throw / produce an unhandled
  // rejection, even though topic-a's runTopicRecap always rejects. This is
  // the isolation guarantee: one topic failing must not crash the process
  // or block other topics from being processed.
  for (const entry of scheduled) {
    await entry.callback();
  }

  const calledSlugs = runTopicRecap.mock.calls.map((c) => c.arguments[0]);
  assert.ok(calledSlugs.includes("topic-a"), "topic-a should still have been attempted");
  assert.ok(calledSlugs.includes("topic-b"), "topic-b should still have been processed despite topic-a rejecting");
});
