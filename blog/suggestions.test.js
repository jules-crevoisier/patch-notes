"use strict";

/**
 * Tests for blog/suggestions.js.
 *
 * Public contract under test:
 *   evaluateSuggestionSubmission({ text, email, honeypot })
 *     -> { outcome: 'accept', text, email }
 *      | { outcome: 'honeypot' }
 *      | { outcome: 'invalid', reason: string }
 *   checkSuggestionRateLimit(existingTimestamps, { max = 5, windowMs = 86400000, now = Date.now() } = {})
 *     -> { allowed: boolean }
 *
 * Both are pure/synchronous: no HTTP handler, no DB clock. Rate-limit tests
 * inject `now` and fixed timestamp arrays instead of relying on wall time.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { evaluateSuggestionSubmission, checkSuggestionRateLimit } = require("./suggestions");

test("should accept a submission with non-empty text and an empty honeypot", () => {
  const result = evaluateSuggestionSubmission({
    text: "Please cover the new GPU driver release",
    email: "user@example.com",
    honeypot: "",
  });

  assert.deepEqual(result, {
    outcome: "accept",
    text: "Please cover the new GPU driver release",
    email: "user@example.com",
  });
});

test("should treat a submission as honeypot without producing an accept outcome when the honeypot field is filled in", () => {
  const result = evaluateSuggestionSubmission({
    text: "Some topic suggestion",
    email: "bot@example.com",
    honeypot: "I am a bot",
  });

  assert.equal(result.outcome, "honeypot");
  assert.notEqual(result.outcome, "accept", "a filled honeypot must never resolve to a real accept outcome");
});

test("should reject a submission as invalid when text is empty or whitespace-only", () => {
  const emptyResult = evaluateSuggestionSubmission({ text: "", email: "user@example.com", honeypot: "" });
  const whitespaceResult = evaluateSuggestionSubmission({ text: "   ", email: "user@example.com", honeypot: "" });

  assert.equal(emptyResult.outcome, "invalid");
  assert.equal(typeof emptyResult.reason, "string");
  assert.ok(emptyResult.reason.length > 0);

  assert.equal(whitespaceResult.outcome, "invalid");
});

test("should allow a submission when fewer than 5 existing timestamps fall inside the rolling 24h window", () => {
  const now = Date.parse("2026-08-17T12:00:00Z");
  const existingTimestamps = [
    "2026-08-17T10:00:00Z",
    "2026-08-17T08:00:00Z",
    "2026-08-16T20:00:00Z",
    "2026-08-16T13:00:00Z",
  ]; // 4 within the last 24h

  const result = checkSuggestionRateLimit(existingTimestamps, { now });

  assert.deepEqual(result, { allowed: true });
});

test("should reject the 6th attempt as rate-limited when 5 existing timestamps for the same ipHash already fall inside the rolling 24h window", () => {
  const now = Date.parse("2026-08-17T12:00:00Z");
  const existingTimestamps = [
    "2026-08-17T11:00:00Z",
    "2026-08-17T09:00:00Z",
    "2026-08-17T06:00:00Z",
    "2026-08-16T20:00:00Z",
    "2026-08-16T13:01:00Z",
  ]; // exactly 5 within the last 24h

  const result = checkSuggestionRateLimit(existingTimestamps, { now });

  assert.deepEqual(result, { allowed: false });
});

test("should not count timestamps older than the rolling window toward the rate cap", () => {
  const now = Date.parse("2026-08-17T12:00:00Z");
  const existingTimestamps = [
    "2026-08-15T12:00:00Z", // 2 days old, outside a 24h window
    "2026-08-14T12:00:00Z",
    "2026-08-13T12:00:00Z",
    "2026-08-12T12:00:00Z",
    "2026-08-11T12:00:00Z",
    "2026-08-10T12:00:00Z",
  ]; // 6 timestamps, but all outside the window

  const result = checkSuggestionRateLimit(existingTimestamps, { now, max: 5, windowMs: 86400000 });

  assert.deepEqual(result, { allowed: true });
});
