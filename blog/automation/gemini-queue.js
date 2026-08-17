"use strict";

/**
 * In-memory port of blog/db.js's reserveGeminiSlot (Postgres advisory-lock
 * rolling-60s-window algorithm). No lock is needed here: this runs inside a
 * single Node process, and JS's run-to-completion semantics already
 * serialize the scheduling decisions made below - there is never a moment
 * where two enqueue() calls can race on `callTimestamps`.
 *
 * Sliding-window semantics: at most GEMINI_MAX_PER_MINUTE calls may execute
 * in any rolling 60s window.
 *   1. Prune timestamps older than the 60s window.
 *   2. If fewer than max are "alive", run immediately.
 *   3. Otherwise, the next free slot opens 60s + 200ms after the timestamp
 *      that is `max` positions back from the newest one:
 *        releaseAt = timestamps[len - max] + 60_000 + 200
 *      At that instant exactly (max - 1) calls remain in the window.
 *   4. If that wait exceeds GEMINI_MAX_WAIT_SECONDS, resolve
 *      { ok: false, reason: 'rate-limit-cap-exceeded' } WITHOUT ever
 *      invoking the task.
 *
 * Caps are read from process.env at module load, and the sliding-window
 * state lives at module scope for the lifetime of the process (this is
 * intentional: tests reload a fresh copy of this module per-case via the
 * require cache to keep caps/state deterministic and isolated).
 */

const WINDOW_MS = 60_000;
const SLOT_PADDING_MS = 200;

const MAX_PER_MINUTE = Math.max(1, Math.min(60, Number(process.env.GEMINI_MAX_PER_MINUTE) || 5));
const MAX_WAIT_SECONDS = Math.max(0, Math.min(86_400, Number(process.env.GEMINI_MAX_WAIT_SECONDS) || 1800));

const callTimestamps = [];
const queue = [];
let waiting = false;

function pruneOldTimestamps(now) {
  while (callTimestamps.length && now - callTimestamps[0] >= WINDOW_MS) {
    callTimestamps.shift();
  }
}

async function executeTask(job) {
  try {
    const result = await job.task();
    job.resolve(result);
  } catch (error) {
    job.resolve({ ok: false, reason: "task-error", error: error?.message || "task failed" });
  }
}

function pump() {
  if (waiting) return;

  while (queue.length > 0) {
    const job = queue[0];
    const now = Date.now();
    pruneOldTimestamps(now);

    if (callTimestamps.length < MAX_PER_MINUTE) {
      queue.shift();
      callTimestamps.push(now);
      executeTask(job);
      continue;
    }

    const cursor = callTimestamps[callTimestamps.length - MAX_PER_MINUTE];
    const releaseAt = cursor + WINDOW_MS + SLOT_PADDING_MS;
    const waitMs = Math.max(0, releaseAt - now);

    if (waitMs > MAX_WAIT_SECONDS * 1000) {
      queue.shift();
      job.resolve({ ok: false, reason: "rate-limit-cap-exceeded" });
      continue;
    }

    waiting = true;
    setTimeout(() => {
      waiting = false;
      pump();
    }, waitMs);
    return;
  }
}

function enqueue(task, meta = {}) {
  return new Promise((resolve) => {
    queue.push({ task, meta, resolve });
    pump();
  });
}

module.exports = { enqueue };
