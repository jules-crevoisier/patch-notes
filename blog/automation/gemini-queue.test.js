"use strict";

/**
 * Tests for blog/automation/gemini-queue.js.
 *
 * DI note: gemini-queue.js is expected to read its in-memory throttle
 * caps (GEMINI_MAX_PER_MINUTE, GEMINI_MAX_WAIT_SECONDS) from process.env,
 * and to keep its sliding-window call-timestamp state at module scope.
 * Each test sets these env vars then requires a fresh copy of the module
 * (via a cleared require cache) so state never leaks between tests and
 * caps stay small/deterministic.
 *
 * "No real sleep" is achieved with node:test's built-in MockTimers
 * (t.mock.timers), which freezes/advances Date.now() and setTimeout
 * without any wall-clock waiting — this is how the sliding-window math
 * ("timestamps injectés") is exercised purely.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

function freshQueue(env) {
  Object.assign(process.env, env);
  const modulePath = require.resolve("./gemini-queue");
  delete require.cache[modulePath];
  return require("./gemini-queue");
}

test("should resolve near-instantly for the first GEMINI_MAX_PER_MINUTE simultaneous enqueue calls", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const { enqueue } = freshQueue({ GEMINI_MAX_PER_MINUTE: "3", GEMINI_MAX_WAIT_SECONDS: "120" });

  const executed = [];
  const makeTask = (i) => async () => {
    executed.push(i);
    return { ok: true, text: `r${i}` };
  };

  const promises = [0, 1, 2].map((i) => enqueue(makeTask(i), { topicSlug: `t${i}` }));

  // Flush any zero-delay scheduling without advancing fake time.
  t.mock.timers.tick(0);

  assert.equal(executed.length, 3, "the first 3 calls (within the cap) should run without waiting");

  const results = await Promise.all(promises);
  assert.ok(results.every((r) => r.ok === true));
});

test("should wait close to 60000ms before running the call that follows a filled per-minute window", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const { enqueue } = freshQueue({ GEMINI_MAX_PER_MINUTE: "2", GEMINI_MAX_WAIT_SECONDS: "120" });

  const executed = [];
  const makeTask = (i) => async () => {
    executed.push(i);
    return { ok: true, text: `r${i}` };
  };

  enqueue(makeTask(0), { topicSlug: "a" });
  enqueue(makeTask(1), { topicSlug: "a" });
  t.mock.timers.tick(0);
  assert.equal(executed.length, 2, "cap reached: the first two calls should have run immediately");

  const thirdResult = enqueue(makeTask(2), { topicSlug: "a" });

  t.mock.timers.tick(59000);
  assert.equal(executed.length, 2, "the third call must still be waiting just before the 60s window frees a slot");

  t.mock.timers.tick(2000);
  assert.equal(executed.length, 3, "the third call should run once ~60000ms have elapsed since the oldest call in the window");

  const result = await thirdResult;
  assert.equal(result.ok, true);
});

test("should resolve {ok:false, reason:'rate-limit-cap-exceeded'} without ever calling the task when the computed wait exceeds GEMINI_MAX_WAIT_SECONDS", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  // cap of 1 per minute means any second simultaneous call must wait ~60000ms,
  // which is well beyond a 30s (30000ms) max allowed wait.
  const { enqueue } = freshQueue({ GEMINI_MAX_PER_MINUTE: "1", GEMINI_MAX_WAIT_SECONDS: "30" });

  const task1 = t.mock.fn(async () => ({ ok: true, text: "first" }));
  const task2 = t.mock.fn(async () => ({ ok: true, text: "second" }));

  const p1 = enqueue(task1, { topicSlug: "a" });
  t.mock.timers.tick(0);
  const r1 = await p1;
  assert.equal(r1.ok, true);
  assert.equal(task1.mock.calls.length, 1);

  const p2 = enqueue(task2, { topicSlug: "a" });
  t.mock.timers.tick(0);
  const r2 = await p2;

  assert.deepEqual(r2, { ok: false, reason: "rate-limit-cap-exceeded" });
  assert.equal(task2.mock.calls.length, 0, "the provided Gemini task must never be invoked");
});
