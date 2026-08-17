/**
 * Pure logic for the public "/suggerer" topic-suggestion form.
 *
 * evaluateSuggestionSubmission: honeypot check runs BEFORE the empty-text
 * check, so a filled honeypot never has a chance to also be reported as
 * "invalid" - it always resolves to the 'honeypot' outcome (server.js maps
 * that to a fake-success response, without ever writing to the DB).
 *
 * checkSuggestionRateLimit: pure/synchronous - the caller (blog/db.js) is
 * responsible for fetching `existingTimestamps` (that ipHash's suggestion
 * timestamps from the last 24h) from Postgres before calling this.
 */

"use strict";

function evaluateSuggestionSubmission({ text, email, honeypot } = {}) {
  if (honeypot) {
    return { outcome: "honeypot" };
  }

  const trimmedText = String(text ?? "").trim();
  if (!trimmedText) {
    return { outcome: "invalid", reason: "Le texte de la suggestion est vide." };
  }

  const trimmedEmail = typeof email === "string" ? email.trim() : "";

  return {
    outcome: "accept",
    text: trimmedText,
    email: trimmedEmail ? trimmedEmail : undefined,
  };
}

function checkSuggestionRateLimit(existingTimestamps = [], { max = 5, windowMs = 86400000, now = Date.now() } = {}) {
  const windowStart = now - windowMs;
  const countInWindow = existingTimestamps.filter((timestamp) => {
    const time = new Date(timestamp).getTime();
    return time >= windowStart && time <= now;
  }).length;

  return { allowed: countInWindow < max };
}

module.exports = { evaluateSuggestionSubmission, checkSuggestionRateLimit };
