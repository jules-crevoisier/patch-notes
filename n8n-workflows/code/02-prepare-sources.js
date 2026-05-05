// ============================================================================
// 2. Préparer les sources (auto)
// ----------------------------------------------------------------------------
// Lit la config sortie par le nœud "Configurer le sujet" et émet un item par
// source à télécharger, en y embarquant les URLs déjà publiées aujourd'hui
// (anti-doublon entre runs).
// ============================================================================

const config = $items('Configurer le sujet')[0]?.json || {};
const sameDayResponse = $input.first()?.json || {};
const sameDayUrls = Array.isArray(sameDayResponse.urls) ? sameDayResponse.urls : [];

return (config.sources || []).map((source) => ({
  json: {
    ...source,
    sameDayUrls,
    topic: config.topic,
    blog: config.blog,
    gemini: config.gemini,
    runDate: config.runDate
  }
}));
