// ============================================================================
// 4. Finaliser le post (auto)
// ----------------------------------------------------------------------------
// Lit la sortie Gemini (si on est passés par lui) et reconstruit le post final.
// Si Gemini est absent (rate-limited, clé manquante, parsing KO), on garde le
// titre/summary fallback déjà préparés en amont.
//
// On nettoie aussi tout résidu administratif dans le résumé : si Gemini ignore
// la consigne et écrit malgré tout "France : 7 articles..." ou "Sources à
// vérifier", on retire ces phrases avant publication. Filet de sécurité.
// ============================================================================

function parseGeminiJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
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
  /\bOn\s+apprend\s+que\b/i
];

function sanitizeSummary(summary) {
  if (!summary) return '';
  const sentences = String(summary).split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(
    (sentence) => !ADMIN_SENTENCE_MARKERS.some((re) => re.test(sentence))
  );
  return kept.join(' ').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

const TITLE_BAD_PREFIXES = /^(R[eé]cap|Veille|Radar|Le\s+journal|Top\s*\d*|Le\s+point|Br[eè]ves)\b[^a-zA-Z0-9]*/i;

// On force le slot en préfixe et on nettoie les préfixes éditoriaux mous
// que Gemini aime parfois ajouter ("Récap : ...", "Le point : ..."). On retire
// aussi la date si Gemini l'a glissée dedans malgré l'interdiction.
function buildFinalTitle(generatedTitle, slot, recapDate) {
  let title = String(generatedTitle || '').trim();
  if (slot && title.startsWith(`${slot} - `)) title = title.slice(slot.length + 3).trim();
  title = title.replace(TITLE_BAD_PREFIXES, '').trim();
  if (recapDate) {
    title = title.replace(new RegExp(`\\s*-?\\s*${recapDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim();
  }
  if (!title) title = '';
  return slot ? `${slot} - ${title}`.trim().replace(/\s*-\s*$/, '').trim() : title;
}

const base = $items('Assembler recap')[0].json;
const incoming = $input.first()?.json || {};
const post = { ...base.postBase };

if (!post.articles?.length) {
  post.title = base.fallbackTitle;
  post.summary = base.fallbackSummary;
  return [{ json: { secret: base.secret, post } }];
}

const text = incoming?.candidates?.[0]?.content?.parts
  ?.map((part) => part.text || '')
  .join(' ')
  .trim();
const parsed = parseGeminiJson(text);

if (parsed?.title || parsed?.summary) {
  const generatedTitle = String(parsed.title || base.fallbackTitle).trim();
  const finalTitle = buildFinalTitle(generatedTitle, post.slot, base.recapDate);
  post.title = finalTitle || base.fallbackTitle;

  const generatedSummary = String(parsed.summary || base.fallbackSummary).trim();
  const sanitized = sanitizeSummary(generatedSummary);
  // Si tout le résumé Gemini était admin, on retombe sur le fallback éditorial.
  post.summary = sanitized.length >= 30 ? sanitized : base.fallbackSummary;
} else if (incoming?.error?.message) {
  post.errors = [...(post.errors || []), `Gemini: ${incoming.error.message}`];
}

return [{ json: { secret: base.secret, post } }];
