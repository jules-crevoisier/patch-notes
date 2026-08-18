"use strict";

/**
 * Ported from the former n8n workflow's "Assembler recap" code node.
 *
 * Parsing / filtering / dedupe / caps / prompt-building logic is preserved
 * verbatim from the n8n node. What changes is the I/O shape: instead of
 * reading n8n items + $items('Preparer les sources') pairing, this takes
 * fetchedSources directly (fetch-sources.js's FetchResult[] shape), each
 * already carrying its own `source` descriptor - no pairedItem resolution
 * needed.
 *
 * Contract: assembleRecap({ topic, fetchedSources, sameDayUrlKeys })
 *   -> { postBase, fallbackTitle, fallbackSummary, recapDate, geminiRequest }
 *
 * geminiRequest is only built when there is at least one selected article -
 * run-topic.js and the tests both rely on a falsy geminiRequest (and zero
 * postBase.articles) to skip Gemini entirely on the silent/no-news path.
 */

// Table des entités HTML nommées les plus courantes dans les flux RSS/Atom
// (accents FR, ponctuation typographique EN, symboles). Volontairement pas
// exhaustive façon spec HTML5 (des centaines d'entrées) : celles-ci couvrent
// la quasi-totalité de ce que produisent les flux réels. &amp; est traité en
// dernier (voir decodeHtml) pour ne jamais re-décoder une entité déjà résolue.
const NAMED_ENTITIES = {
  nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  agrave: "à", acirc: "â", auml: "ä",
  icirc: "î", iuml: "ï", igrave: "ì",
  ocirc: "ô", ouml: "ö", ograve: "ò",
  ucirc: "û", ugrave: "ù", uuml: "ü",
  ccedil: "ç", ntilde: "ñ", oelig: "œ", aelig: "æ",
  Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç", Ocirc: "Ô", Ouml: "Ö",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  bull: "•", middot: "·", deg: "°",
  euro: "€", pound: "£", cent: "¢", yen: "¥",
  copy: "©", reg: "®", trade: "™",
  times: "×", divide: "÷",
};

function decodeHtml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    // Entités numériques décimales (&#233;) et hexadécimales (&#xE9;).
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Entités nommées connues, puis &amp; en dernier pour ne pas casser des
    // séquences déjà résolues (ex. "&amp;eacute;" ne doit pas redevenir "é").
    .replace(/&([a-zA-Z]+);/g, (full, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : full))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickRaw(block, tag) {
  const escapedTag = tag.replace(":", "\\:");
  const match = String(block || "").match(new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"));
  return match?.[1] || "";
}

function pick(block, tag) {
  return decodeHtml(pickRaw(block, tag));
}

function cleanUrl(value) {
  const text = decodeHtml(value)
    .replace(/^url:\s*/i, "")
    .replace(/^link:\s*/i, "")
    .replace(/^guid:\s*/i, "")
    .replace(/^[\s"'<>]+|[\s"'<>]+$/g, "")
    .trim();
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : text;
}

function pickLink(block) {
  const href = String(block || "").match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  return cleanUrl(href || pickRaw(block, "link") || pickRaw(block, "guid") || pickRaw(block, "id"));
}

function stripSourceSuffix(title, sourceName) {
  return String(title || "")
    .replace(new RegExp(`\\s+-\\s+${String(sourceName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "")
    .replace(/\s+-\s+Google News$/i, "")
    .trim();
}

function normalizeUrl(value) {
  const raw = cleanUrl(value);
  const match = String(raw || "").match(/^https?:\/\/[^\s"'<>]+/i);
  if (!match) return "";
  return match[0].replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

function recapSlot(date) {
  const hour = date.getHours();
  if (hour < 8) return "Dans la nuit";
  if (hour < 13) return "Matinal";
  if (hour < 21) return "Cet aprem";
  return "Soir";
}

// Acronymes courts (lec, lck, vct…) doivent matcher des mots entiers, pas des
// sous-chaînes dans "sélectionneur" ou "collection".
function keywordMatches(haystack, term) {
  const needle = String(term || "").toLowerCase().trim();
  if (!needle) return false;
  if (needle.includes(" ") || needle.length >= 5) {
    return haystack.includes(needle);
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(haystack);
}

function passesUrlRules(article, topic, source) {
  const url = String(article.url || "");
  const blockPatterns = [...(topic.urlBlockPatterns || []), ...(source?.urlBlockPatterns || [])];
  if (blockPatterns.some((pattern) => pattern.test(url))) return false;
  const allowPatterns = source?.urlAllowPatterns || [];
  if (allowPatterns.length > 0) {
    return allowPatterns.some((pattern) => pattern.test(url));
  }
  return true;
}

// On vérifie le filtre positif uniquement sur le contenu (titre + extrait),
// PAS sur le nom de la source : sinon n'importe quel article publié par
// "Dot Esports" ou "Esports Insider" passe automatiquement parce que le mot
// "esports" est dans le nom du média. Le négatif, lui, peut regarder large
// (titre + extrait + source) pour éviter une source-pourriel ciblée.
function isTopicArticle(article, topic, source) {
  const haystack = `${article.title} ${article.snippet}`.toLowerCase();
  const haystackWide = `${haystack} ${article.source || ""}`.toLowerCase();
  const publishedAt = new Date(article.publishedAt);
  if (!Number.isNaN(publishedAt.getTime())) {
    const maxAgeDays = article.method === "google" ? topic.maxAgeDays.google : topic.maxAgeDays.rss;
    if (Date.now() - publishedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000) return false;
  }
  if (!passesUrlRules(article, topic, source)) return false;
  if ((topic.negativeKeywords || []).some((term) => keywordMatches(haystackWide, term))) return false;
  if (!Array.isArray(topic.positiveKeywords) || topic.positiveKeywords.length === 0) return true;
  return topic.positiveKeywords.some((term) => keywordMatches(haystack, term));
}

function parseItems(xml, source, topic) {
  const text = String(xml || "");
  const matches = [
    ...text.matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/gi),
    ...text.matchAll(/<entry[\s\S]*?>([\s\S]*?)<\/entry>/gi),
  ];

  return matches
    .map((match) => {
      const block = match[1];
      const rawTitle = pick(block, "title");
      return {
        title: stripSourceSuffix(rawTitle, source.name),
        url: pickLink(block),
        source: source.name,
        region: source.region,
        method: source.method,
        publishedAt: pick(block, "pubDate") || pick(block, "updated") || pick(block, "published"),
        snippet: decodeHtml(pickRaw(block, "description") || pickRaw(block, "content:encoded") || pickRaw(block, "summary")),
      };
    })
    .filter((article) => article.title && article.url && isTopicArticle(article, topic, source))
    .slice(0, source.max || 10);
}

function countBySource(list) {
  return list.reduce((acc, article) => {
    acc[article.source] = (acc[article.source] || 0) + 1;
    return acc;
  }, {});
}

function truncate(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// Fallback éditorial sans aucune info administrative.
// On part du principe qu'un humain qui voit ce résumé doit comprendre la news,
// pas le pipeline. Donc : pas de "France : X articles", pas de "Sources à
// vérifier", pas de "aucun article retenu". Les erreurs vont dans post.errors
// (caché).
function buildFallbackTitle(slot, topicLabel, leadArticle) {
  if (!leadArticle) return `${slot} - ${topicLabel}, créneau silencieux`;
  return `${slot} - ${truncate(leadArticle.title, 80)}`;
}

function buildFallbackSummary(selected, topicLabel) {
  if (!selected.length) {
    return `Pas de signal fort sur ${topicLabel} pour ce créneau. Le radar reprend dans quelques heures.`;
  }
  const titles = selected
    .slice(0, 4)
    .map((a) => String(a.title || "").replace(/[.;]+\s*$/, ""))
    .filter(Boolean);
  if (titles.length === 1) return `${titles[0]}.`;
  if (titles.length === 2) return `À la une : ${titles[0]}. En parallèle, ${titles[1]}.`;
  if (titles.length === 3) return `À la une : ${titles[0]}. En parallèle : ${titles[1]} ; ${titles[2]}.`;
  return `À la une : ${titles[0]}. En parallèle : ${titles[1]} ; ${titles[2]} ; ${titles[3]}.`;
}

function assembleRecap({ topic, fetchedSources, sameDayUrlKeys }) {
  const rawTopic = topic || {};
  const topicLabel = String(rawTopic.label || rawTopic.name || rawTopic.slug || "Sujet").trim();
  const effectiveTopic = {
    ...rawTopic,
    label: topicLabel,
    maxAgeDays: {
      google: Number(rawTopic.maxAgeDays?.google ?? 3),
      rss: Number(rawTopic.maxAgeDays?.rss ?? 7),
    },
  };

  const errors = [];
  const loadedArticles = [];
  const sameDayUrls = new Set(sameDayUrlKeys || []);

  (fetchedSources || []).forEach((fetched, index) => {
    const source = fetched?.source || {};
    const label = source.name || `Source ${index + 1}`;
    if (!fetched?.ok) {
      errors.push(`${label}: ${fetched?.error || "erreur"}`);
      return;
    }
    const xml = fetched.xml;
    if (!xml || String(xml).length < 20) {
      errors.push(`${label}: réponse vide`);
      return;
    }
    const parsed = parseItems(xml, source, effectiveTopic);
    if (!parsed.length) errors.push(`${label}: aucun article ${topicLabel} retenu`);
    loadedArticles.push(...parsed);
  });

  const seen = new Set();
  let skippedInvalidUrl = 0;
  let skippedDuplicate = 0;
  let skippedSameDay = 0;
  const articles = [];

  for (const article of loadedArticles.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))) {
    const key = normalizeUrl(article.url);
    if (!key) {
      skippedInvalidUrl++;
      continue;
    }
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(key);
    if (sameDayUrls.has(key)) {
      skippedSameDay++;
      continue;
    }
    articles.push(article);
    if (articles.length >= (effectiveTopic.caps?.total || 36)) break;
  }

  const frArticles = articles.filter((a) => a.region === "fr").slice(0, effectiveTopic.caps?.fr || 14);
  const intlArticles = articles.filter((a) => a.region !== "fr").slice(0, effectiveTopic.caps?.intl || 18);
  const selectedArticles =
    effectiveTopic.mode === "fr" ? frArticles : effectiveTopic.mode === "intl" ? intlArticles : [...frArticles, ...intlArticles];

  const sourceGroups = { fr: countBySource(frArticles), intl: countBySource(intlArticles) };
  const hasBothRegions = effectiveTopic.mode === "fr-intl" && frArticles.length > 0 && intlArticles.length > 0;

  const now = new Date();
  const recapDate = now.toLocaleDateString("fr-FR", { dateStyle: "long" });
  const slot = recapSlot(now);
  const leadArticle = selectedArticles[0] || frArticles[0] || intlArticles[0] || null;

  const fallbackTitle = buildFallbackTitle(slot, topicLabel, leadArticle);
  const fallbackSummary = buildFallbackSummary(selectedArticles, topicLabel);

  const postBase = {
    id: `${effectiveTopic.slug}-${effectiveTopic.mode}-${now.toISOString().slice(0, 13)}`,
    topic: effectiveTopic.slug,
    topicLabel,
    topicDescription: effectiveTopic.description || null,
    slot,
    title: fallbackTitle,
    summary: fallbackSummary,
    mode: effectiveTopic.mode,
    sourceGroups,
    errors,
    debug: {
      loadedArticlesCount: loadedArticles.length,
      uniqueArticlesBeforeSameDayFilter: seen.size,
      skippedInvalidUrl,
      skippedDuplicate,
      skippedSameDay,
      selectedArticlesCount: selectedArticles.length,
    },
    articles: selectedArticles,
    createdAt: now.toISOString(),
  };

  if (!selectedArticles.length) {
    return { postBase, fallbackTitle, fallbackSummary, recapDate, geminiRequest: null };
  }

  const articleLines = selectedArticles
    .slice(0, 28)
    .map((article, index) => {
      const snippet = article.snippet ? ` | contexte : ${article.snippet.slice(0, 260)}` : "";
      const tag = article.region === "fr" ? "FR" : "INT";
      return `${index + 1}. [${tag}] ${article.source} - ${article.title}${snippet}`;
    })
    .join("\n");

  // Cadre stylistique côté régions : en mode mixte avec articles FR ET INT,
  // on autorise un "côté français" / "à l'international" glissé dans une
  // phrase, MAIS jamais en chiffres, jamais en bandeau, jamais comme tête de
  // chapitre.
  const styleGuide =
    effectiveTopic.mode === "fr-intl" && hasBothRegions
      ? "Les articles mêlent France et international ; tu peux glisser \"côté français\" ou \"à l'international\" dans une phrase si ça aide la lecture, mais jamais en titre de paragraphe, jamais avec des chiffres."
      : effectiveTopic.mode === "fr"
        ? "Tous les articles sont francophones. N'introduis aucune mention \"France\", \"FR\" ou \"international\"."
        : effectiveTopic.mode === "intl"
          ? "Tous les articles sont internationaux. N'introduis aucune mention \"France\", \"FR\" ou \"international\"."
          : "Adopte une formulation globale, sans découpage régional.";

  // Prompt orienté édito : zéro mention chiffres, zéro mention "sources",
  // zéro mention "aucun article retenu". Le titre n'inclut PAS la date (la
  // page la rend déjà). Le slot est ajouté en post-traitement, donc Gemini ne
  // doit PAS le préfixer lui-même.
  const prompt = `Tu rédiges un mini-récap éditorial sur le sujet "${topicLabel}" pour le hub patch-notes.fr.
Public : lecteur curieux, 30 secondes de lecture.

TITRE
- 50 à 90 caractères, sans préfixe, sans date, sans nom de média.
- Style "bandeau de news" : sujet + verbe d'action + détail concret.
- Cite 1 ou 2 protagonistes nommés (équipe, joueur, jeu, éditeur, événement, plateforme).
- Interdits en début de titre : "Récap", "Veille", "Radar", "Le journal", "Top", "Le point", "Brèves".
- Interdits dans le titre : émojis, dates, "—", "/", majuscules abusives.

RÉSUMÉ
- 2 à 3 phrases courtes, 40 à 80 mots au total. Style journaliste, pas administratif.
- Phrase 1 = la news la plus marquante de la liste, formulée nettement (sujet + action + contexte).
- Phrase 2 = un autre signal fort de la liste, complémentaire.
- Phrase 3 (optionnelle) = une perspective courte, un calendrier ou un point à surveiller.
- Cite des entités concrètes : équipe, joueur, jeu, éditeur, événement, plateforme, étude.
- INTERDITS dans le résumé :
  • "France : X articles", "International : X articles", "Articles : X retenus".
  • "Sources à vérifier", "aucun article retenu", noms de médias listés à la suite.
  • "À retenir :", "À suivre :", "Côté FR :", "Côté international :", "Pour résumer", "Dans cet article", "On apprend que".
  • Émojis, markdown, balises HTML, listes à puces.
- ${styleGuide}

CONTRAINTES TECHNIQUES
- Réponds uniquement en JSON valide : {"title":"...","summary":"..."}.
- N'invente rien : ne mentionne que des éléments présents dans la liste ci-dessous.
${effectiveTopic.editorialHints ? `\nPRÉCISIONS SPÉCIFIQUES AU SUJET :\n${effectiveTopic.editorialHints}\n` : ""}
ARTICLES DISPONIBLES (du plus récent au plus ancien) :
${articleLines}`;

  const geminiRequest = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 420,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  return { postBase, fallbackTitle, fallbackSummary, recapDate, geminiRequest };
}

module.exports = { assembleRecap };
