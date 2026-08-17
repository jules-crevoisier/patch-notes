"use strict";

/**
 * Ported from the former n8n workflow's "Generer le mini recap" Gemini HTTP
 * Request node.
 *
 * callGemini NEVER throws: every failure path (timeout, network error,
 * non-JSON body, Gemini error payload, empty candidates) resolves to
 * { ok: false, error }. Callers (run-topic.js, via gemini-queue.js) can
 * always safely `await` it without a try/catch.
 */

const DEFAULT_TIMEOUT_MS = 60000;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function extractText(candidates) {
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => part.text || "")
    .join(" ")
    .trim();
}

async function callGemini({ apiKey, model, request, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${API_BASE}/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(apiKey || "")}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request || {}),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);

    if (body?.error?.message) {
      return { ok: false, error: body.error.message };
    }

    const text = extractText(body?.candidates);
    if (!text) {
      return { ok: false, error: `empty gemini response (status ${response.status})` };
    }

    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error?.message || "gemini request failed" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callGemini };
