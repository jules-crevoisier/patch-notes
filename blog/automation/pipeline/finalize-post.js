"use strict";

/**
 * Ported from the former n8n workflow's "Finaliser le post" code node.
 *
 * parseGeminiJson / sanitizeSummary / buildFinalTitle are ported verbatim.
 * The orchestrating logic around them is adapted to the new contract:
 * finalizePost now receives an already-normalized `geminiResult` (produced
 * by gemini-client.js: { ok, text?, error? }), instead of the raw Gemini
 * HTTP response - the candidates[]/parts[] extraction now lives in
 * gemini-client.js, not here.
 *
 * Contract: finalizePost({ postBase, fallbackTitle, fallbackSummary, recapDate, geminiResult }) -> Post
 */

function parseGeminiJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// On retire les phrases entières qui contiennent un marqueur "admin" plutôt
// que d'essayer un replace ciblé : ça évite les ratés quand le texte contient
// des points (ex. "Mandatory.gg") qui cassent un regex `[^.]*`.
const ADMIN_SENTENCE_MARKERS = [
  /\bFrance\s*:\s*\d+\s*articles?/i,
  /\bInternational\s*:\s*\d+\s*articles?/i,
  /\bArticles?\s*:\s*\d+\s*retenus?/i,
  /\bSources?\s+à\s+v[eé]rifier/i,
  /\baucun\s+article\b.*\bretenu/i,
  /\bÀ\s+suivre\s+côté\s+FR/i,
  /\bC[ôo]t[eé]\s+international\s*:/i,
  /\bPour\s+résumer\b/i,
  /\bDans\s+cet\s+article\b/i,
  /\bOn\s+apprend\s+que\b/i,
];

function sanitizeSummary(summary) {
  if (!summary) return "";
  const sentences = String(summary).split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !ADMIN_SENTENCE_MARKERS.some((re) => re.test(sentence)));
  return kept.join(" ").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

const TITLE_BAD_PREFIXES = /^(R[eé]cap|Veille|Radar|Le\s+journal|Top\s*\d*|Le\s+point|Br[eè]ves)\b[^a-zA-Z0-9]*/i;

// On force le slot en préfixe et on nettoie les préfixes éditoriaux mous que
// Gemini aime parfois ajouter ("Récap : ...", "Le point : ..."). On retire
// aussi la date si Gemini l'a glissée dedans malgré l'interdiction.
function buildFinalTitle(generatedTitle, slot, recapDate) {
  let title = String(generatedTitle || "").trim();
  if (slot && title.startsWith(`${slot} - `)) title = title.slice(slot.length + 3).trim();
  title = title.replace(TITLE_BAD_PREFIXES, "").trim();
  if (recapDate) {
    title = title.replace(new RegExp(`\\s*-?\\s*${recapDate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
  }
  if (!title) title = "";
  return slot ? `${slot} - ${title}`.trim().replace(/\s*-\s*$/, "").trim() : title;
}

function finalizePost({ postBase, fallbackTitle, fallbackSummary, recapDate, geminiResult }) {
  const post = { ...(postBase || {}) };

  if (!post.articles?.length) {
    post.title = fallbackTitle;
    post.summary = fallbackSummary;
    return post;
  }

  if (!geminiResult || geminiResult.ok !== true) {
    post.title = fallbackTitle;
    post.summary = fallbackSummary;
    const message = geminiResult?.error || "no result";
    post.errors = [...(post.errors || []), `Gemini: ${message}`];
    return post;
  }

  const parsed = parseGeminiJson(geminiResult.text);

  if (parsed?.title || parsed?.summary) {
    const generatedTitle = String(parsed.title || fallbackTitle).trim();
    const finalTitle = buildFinalTitle(generatedTitle, post.slot, recapDate);
    post.title = finalTitle || fallbackTitle;

    const generatedSummary = String(parsed.summary || fallbackSummary).trim();
    const sanitized = sanitizeSummary(generatedSummary);
    // Si tout le résumé Gemini a été scrubbé (marqueurs admin), on retombe
    // sur le fallback éditorial plutôt que de publier un résumé vide.
    post.summary = sanitized.length > 0 ? sanitized : fallbackSummary;
    return post;
  }

  post.title = fallbackTitle;
  post.summary = fallbackSummary;
  post.errors = [...(post.errors || []), "Gemini: invalid response format"];
  return post;
}

module.exports = { finalizePost, parseGeminiJson, sanitizeSummary, buildFinalTitle };
